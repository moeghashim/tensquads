import { approvalCovers, digestOf, type Mandate, type ResearchReport, type Skill } from "@tensquads/agent-kit";

import type { BusEvent, BusKind } from "../bus/types.ts";
import { researchFields } from "../conversation/business-request.ts";
import {
	checkBrief,
	checkPage,
	checkPublished,
	checkResearch,
	isResearchFailure,
	NO_FINDING_TEXT,
	NO_ITEMS_TEXT,
	readReport,
	shownBrief,
} from "./checks.ts";
import { type GrantQuery, grantAllows, type StoredGrant } from "./grant.ts";
import { BRIEF_FAILED_TEXT, NO_NAME_TEXT } from "./messages.ts";
import type { RenderedPage } from "./render-page.ts";
import { type BusinessRequest, mandateFor, type PageAudit, type PageReader } from "./types.ts";

export interface BriefInput {
	readonly businessName: string;
	readonly businessType: BusinessRequest["businessType"];
	readonly report: ResearchReport;
	readonly reason?: string;
}

export interface BriefModel {
	writeBrief(input: BriefInput): Promise<string> | string;
}

export interface MasterPorts {
	readonly readPage: PageReader;
	readonly audit: (html: string) => PageAudit | Promise<PageAudit>;
	readonly model: BriefModel;
	readonly mandateAt?: string;
	readonly accountSlug?: string;
	readonly accountId?: string;
	readonly ownerId?: string;
	readonly now?: string;
	readonly loadGrant?: (query: GrantQuery) => StoredGrant | null | Promise<StoredGrant | null>;
	readonly browser?: (html: string) => Promise<RenderedPage>;
	readonly recordMonitor?: (monitorId: string) => void | Promise<void>;
}

type Phase = "research" | "brief" | "building" | "publish" | "publishing" | "watch" | "watching" | "done" | "escalated";

export interface MasterSnapshot {
	readonly phase: Phase;
	readonly report?: ResearchReport;
	readonly brief?: string;
	readonly shown?: string;
	readonly previewHtml?: string;
	readonly previewUrl?: string;
	readonly researchFails: number;
	readonly pageFails: number;
	readonly watchFails?: number;
	readonly runTaskId?: string;
	readonly retryPayload?: Readonly<Record<string, unknown>>;
	readonly seq: number;
}

interface State {
	phase: Phase;
	report?: ResearchReport;
	brief?: string;
	shown?: string;
	previewHtml?: string;
	previewUrl?: string;
	researchFails: number;
	pageFails: number;
	watchFails: number;
	runTaskId: string;
	retryPayload: Record<string, unknown>;
}

interface Emitted {
	readonly from: string;
	readonly to: string;
	readonly kind: BusKind;
	readonly skill: string;
	readonly text: string;
	readonly payload: Readonly<Record<string, unknown>>;
	readonly writes?: readonly string[];
	readonly set?: Readonly<Record<string, unknown>>;
}

function kitSkill(skill: string): string {
	if (skill === "website.build") return "site.build";
	if (skill === "website.publish") return "site.publish";
	return skill;
}

function coverSkill(id: string): Skill {
	return {
		id,
		gate: "Ask first",
		run: () => Promise.resolve({ skill: id, text: "", payload: {}, evidence: [] }),
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

// An empty gap is an empty finding. The run stops in chat before any approval.
function findingEmpty(raw: unknown): boolean {
	return isRecord(raw) && typeof raw.gap === "string" && raw.gap.trim().length === 0;
}

// The researcher hashes this same sentence. Keep the words in this order.
function watchQuery(request: BusinessRequest): string {
	const query =
		request.businessType === "restaurant"
			? `${request.businessName} ${request.cuisine ? `${request.cuisine} ` : ""}restaurant competitors menu prices`
			: `${request.businessName} grocery competitors prices delivery hours`;
	const compact = query.replace(/ {2,}/g, " ").trim();
	return compact.length <= 500 ? compact : compact.slice(0, 500);
}

export function createMaster(request: BusinessRequest, ports: MasterPorts) {
	const state: State = {
		phase: "research",
		researchFails: 0,
		pageFails: 0,
		watchFails: 0,
		runTaskId: "",
		retryPayload: {},
	};
	let seq = 0;

	function nextId(): string {
		seq += 1;
		return `m-${String(seq).padStart(2, "0")}`;
	}

	function make(id: string, fields: Emitted): BusEvent {
		return {
			id,
			time: `12:${String(seq).padStart(2, "0")}`,
			from: fields.from,
			to: fields.to,
			kind: fields.kind,
			skill: fields.skill,
			text: fields.text,
			payload: fields.payload,
			writes: fields.writes ?? [],
			...(fields.set ? { set: fields.set } : {}),
			trace: `tr_${id}`,
		};
	}

	function emit(fields: Emitted): BusEvent {
		return make(nextId(), fields);
	}

	function escalation(text: string, evidence: readonly string[]): BusEvent {
		return emit({
			from: "master",
			to: "user",
			kind: "Escalation",
			skill: "check.run",
			text,
			payload: { evidence },
		});
	}

	function sendBack(to: string, evidence: readonly string[]): BusEvent {
		return emit({
			from: "master",
			to,
			kind: "Task",
			skill: "task.route",
			text: evidence.join(" "),
			payload: { ...state.retryPayload, evidence },
		});
	}

	function failResearch(evidence: readonly string[]): BusEvent[] {
		if (state.researchFails >= 1) {
			state.phase = "escalated";
			return [escalation("The check failed twice.", evidence)];
		}
		state.researchFails += 1;
		return [sendBack("market", evidence)];
	}

	function failPage(evidence: readonly string[]): BusEvent[] {
		if (state.pageFails >= 1) {
			state.phase = "escalated";
			return [escalation("The check failed twice.", evidence)];
		}
		state.pageFails += 1;
		return [sendBack("website", evidence)];
	}

	function failWatch(evidence: readonly string[]): BusEvent[] {
		if (state.watchFails >= 1) {
			state.phase = "escalated";
			return [escalation("The check failed twice.", evidence)];
		}
		state.watchFails += 1;
		return [sendBack("market", evidence)];
	}

	function remember(payload: Record<string, unknown>): void {
		state.retryPayload = payload;
	}

	async function granted(skill: string, subject: string, slug: string | null): Promise<boolean> {
		if (!ports.loadGrant) return true;
		const query: GrantQuery = {
			accountId: ports.accountId ?? "",
			taskId: state.runTaskId,
			skill,
			subject,
			slug,
			ownerId: ports.ownerId ?? "",
			now: ports.now ?? new Date().toISOString(),
		};
		const row = await ports.loadGrant(query);
		if (!row || !grantAllows(row, query)) return false;
		const id = kitSkill(skill);
		const mandate = mandateFor({
			approvalId: "grant",
			ruleId: "grant",
			ruleWhen: skill,
			ruleAction: id,
			subject: row.subject,
			at: ports.mandateAt,
		});
		return approvalCovers({ skill: id, mandate }, coverSkill(id), row.subject);
	}

	function start(): BusEvent {
		const task = researchFields(request);
		const event = emit({
			from: "master",
			to: "market",
			kind: "Task",
			skill: "task.route",
			text: task.text,
			payload: task.payload,
			writes: task.writes,
			set: task.set,
		});
		state.runTaskId = event.id;
		remember({ ...task.payload });
		return event;
	}

	function websiteFields(brief: string, report: ResearchReport): Record<string, unknown> {
		return {
			businessName: request.businessName,
			slug: ports.accountSlug ?? "",
			businessType: request.businessType,
			brief: { text: brief, gap: report.gap },
			report,
			gapEvidence: report.gapEvidence,
			items: request.items,
			...(request.cuisine ? { cuisine: request.cuisine } : {}),
			...(request.sections ? { sections: request.sections } : {}),
		};
	}

	async function writeCheckedBrief(
		report: ResearchReport,
	): Promise<{ readonly prose: string } | { readonly evidence: readonly string[] }> {
		const input = { businessName: request.businessName, businessType: request.businessType, report };
		const first = String(await ports.model.writeBrief(input));
		const firstCheck = checkBrief(first, report);
		if (firstCheck.pass) return { prose: first };
		const second = String(await ports.model.writeBrief({ ...input, reason: firstCheck.evidence.join(" ") }));
		const secondCheck = checkBrief(second, report);
		if (secondCheck.pass) return { prose: second };
		return { evidence: secondCheck.evidence };
	}

	async function onResearch(event: BusEvent): Promise<BusEvent[]> {
		const raw = isRecord(event.payload) ? event.payload.report : undefined;
		if (findingEmpty(raw)) {
			state.phase = "escalated";
			return [escalation(NO_FINDING_TEXT, [NO_FINDING_TEXT])];
		}
		const result = await checkResearch(raw, ports.readPage);
		if (!result.pass) return failResearch(result.evidence);
		const report = readReport(raw);
		if (!report) return failResearch(["The report was rejected."]);
		if (request.businessName.trim().length === 0) {
			state.phase = "escalated";
			return [escalation(NO_NAME_TEXT, [NO_NAME_TEXT])];
		}
		if (request.items.length === 0) {
			state.phase = "escalated";
			return [escalation(NO_ITEMS_TEXT, [NO_ITEMS_TEXT])];
		}
		const written = await writeCheckedBrief(report);
		if (!("prose" in written)) {
			state.phase = "escalated";
			return [escalation(BRIEF_FAILED_TEXT, written.evidence)];
		}
		const shown = shownBrief(written.prose, request.items);
		state.report = report;
		state.brief = written.prose;
		state.shown = shown;
		state.phase = "brief";
		return [
			emit({
				from: "master",
				to: "user",
				kind: "Approval",
				skill: "brief.write",
				text: "Build the site with this brief?",
				payload: {
					brief: { text: shown, gap: report.gap },
					taskId: state.runTaskId,
					skill: "website.build",
					subject: await digestOf(shown),
				},
			}),
		];
	}

	async function approveBrief(): Promise<BusEvent[]> {
		if (request.businessName.trim().length === 0) throw new Error("The business is not stored.");
		if (state.phase !== "brief" || !state.report || !state.brief || !state.shown) return [];
		const report = state.report;
		const prose = state.brief;
		const shown = state.shown;
		if (!(await granted("website.build", await digestOf(shown), null))) return [];
		const approvalId = nextId();
		const mandate: Mandate = mandateFor({
			approvalId,
			ruleId: "poc-brief",
			ruleWhen: "The brief is ready.",
			ruleAction: "site.build",
			subject: await digestOf(shown),
			at: ports.mandateAt,
		});
		const approval = make(approvalId, {
			from: "master",
			to: "website",
			kind: "Approval",
			skill: "approval.ask",
			text: "The user said yes.",
			payload: { approval: { skill: "site.build", mandate } },
		});
		const taskPayload = {
			...websiteFields(prose, report),
			approval: { skill: "site.build", mandate },
		};
		remember(taskPayload);
		const task = emit({
			from: "master",
			to: "website",
			kind: "Task",
			skill: "task.route",
			text: `Build the page. ${report.gap} ${report.gapEvidence.sourceUrl}`,
			payload: taskPayload,
		});
		state.phase = "building";
		return [approval, task];
	}

	async function onPreview(event: BusEvent): Promise<BusEvent[]> {
		if (!state.report) return failPage(["The report was rejected."]);
		const previewUrl =
			isRecord(event.payload) && typeof event.payload.previewUrl === "string" ? event.payload.previewUrl : "";
		if (previewUrl.length === 0) return failPage(["The preview URL did not return 200."]);
		const result = await checkPage({
			previewUrl,
			businessName: request.businessName,
			businessType: request.businessType,
			cuisine: request.cuisine,
			items: request.items,
			brief: state.brief ?? "",
			report: state.report,
			slug: ports.accountSlug ?? "",
			choice: isRecord(event.payload) ? event.payload.choice : undefined,
			readPage: ports.readPage,
			audit: ports.audit,
			browser: ports.browser,
		});
		if (!result.pass) return failPage(result.evidence);
		state.previewHtml = result.html;
		state.previewUrl = previewUrl;
		state.phase = "publish";
		return [
			emit({
				from: "master",
				to: "user",
				kind: "Approval",
				skill: "approval.ask",
				text: "Publish the site?",
				payload: {
					previewUrl,
					taskId: state.runTaskId,
					skill: "website.publish",
					subject: await digestOf(result.html),
					slug: ports.accountSlug ?? "",
				},
			}),
		];
	}

	async function approvePublish(): Promise<BusEvent[]> {
		if (state.phase !== "publish" || !state.previewHtml || !state.report || !state.brief) return [];
		const pageHtml = state.previewHtml;
		const slug = ports.accountSlug ?? "";
		if (!(await granted("website.publish", await digestOf(pageHtml), slug))) return [];
		const approvalId = nextId();
		const mandate = mandateFor({
			approvalId,
			ruleId: "poc-publish",
			ruleWhen: "The page passed the check.",
			ruleAction: "site.publish",
			subject: await digestOf(pageHtml),
			at: ports.mandateAt,
		});
		const previewUrl = state.previewUrl ?? "";
		const approvalBody = { skill: "site.publish", mandate };
		const approval = make(approvalId, {
			from: "master",
			to: "website",
			kind: "Approval",
			skill: "approval.ask",
			text: "The user said yes.",
			payload: {
				approval: approvalBody,
				pageHtml,
				previewUrl,
			},
		});
		const taskPayload = {
			...websiteFields(state.brief, state.report),
			approval: approvalBody,
			mandate,
			html: pageHtml,
			pageHtml,
			previewUrl,
		};
		remember(taskPayload);
		const task = emit({
			from: "master",
			to: "website",
			kind: "Task",
			skill: "task.route",
			text: "Publish the page.",
			payload: taskPayload,
		});
		state.phase = "publishing";
		return [approval, task];
	}

	async function createMonitor(monitorId: string): Promise<void> {
		if (!ports.recordMonitor) throw new Error("The monitor was not recorded.");
		await ports.recordMonitor(monitorId);
	}

	async function onPublish(event: BusEvent): Promise<BusEvent[]> {
		if (!state.previewHtml) return failPage(["The preview is missing."]);
		const publishedUrl =
			isRecord(event.payload) && typeof event.payload.publishedUrl === "string" ? event.payload.publishedUrl : "";
		if (publishedUrl.length === 0) return failPage(["The published URL did not return 200."]);
		const result = await checkPublished(state.previewHtml, publishedUrl, ports.readPage, ports.accountSlug ?? "");
		if (!result.pass) return failPage(result.evidence);
		state.phase = "watch";
		const requestText = watchQuery(request);
		return [
			emit({
				from: "master",
				to: "user",
				kind: "Approval",
				skill: "competition.watch",
				text: "Watch the competitors?",
				payload: {
					query: requestText,
					taskId: state.runTaskId,
					skill: "competition.watch",
					subject: await digestOf(requestText),
				},
			}),
		];
	}

	async function approveWatch(): Promise<BusEvent[]> {
		if (state.phase !== "watch") return [];
		const requestText = watchQuery(request);
		if (!(await granted("competition.watch", await digestOf(requestText), null))) return [];
		const approvalId = nextId();
		const mandate = mandateFor({
			approvalId,
			ruleId: "poc-watch",
			ruleWhen: "The user asked to watch competitors.",
			ruleAction: "competition.watch",
			subject: await digestOf(watchQuery(request)),
			at: ports.mandateAt,
		});
		const approvalBody = { skill: "competition.watch", mandate };
		const fields = {
			businessName: request.businessName,
			businessType: request.businessType,
			items: request.items,
			...(request.cuisine ? { cuisine: request.cuisine } : {}),
			approval: approvalBody,
		};
		const approval = make(approvalId, {
			from: "master",
			to: "market",
			kind: "Approval",
			skill: "approval.ask",
			text: "The user said yes.",
			payload: { approval: approvalBody },
		});
		remember(fields);
		const task = emit({
			from: "master",
			to: "market",
			kind: "Task",
			skill: "task.route",
			text: "Watch the competitors.",
			payload: fields,
		});
		state.phase = "watching";
		return [approval, task];
	}

	async function onWatch(event: BusEvent): Promise<BusEvent[]> {
		if (state.phase !== "watching") return [];
		const monitorId =
			isRecord(event.payload) && typeof event.payload.monitorId === "string" ? event.payload.monitorId.trim() : "";
		if (monitorId.length === 0) return failWatch(["The monitor was not recorded."]);
		await createMonitor(monitorId);
		state.phase = "done";
		return [];
	}

	function userSaidYes(event: BusEvent): boolean {
		return event.kind === "Approval" && event.from === "user" && event.to === "master";
	}

	async function onUserYes(event: BusEvent): Promise<BusEvent[]> {
		if (event.skill === "brief.write") return approveBrief();
		if (event.skill === "approval.ask") return approvePublish();
		if (event.skill === "competition.watch") return approveWatch();
		return [];
	}

	async function onResearchPhase(event: BusEvent): Promise<BusEvent[]> {
		if (event.skill === "report.write") return onResearch(event);
		if (isResearchFailure(event)) return failResearch([event.text.trim()].filter(Boolean));
		return [];
	}

	async function accept(event: BusEvent): Promise<BusEvent[]> {
		if (state.phase === "escalated" || state.phase === "done") return [];
		if (userSaidYes(event)) return onUserYes(event);
		if (event.kind !== "Result" || event.to !== "master") return [];
		if (state.phase === "research") return onResearchPhase(event);
		if (event.skill === "site.preview" && state.phase === "building") return onPreview(event);
		if (event.skill === "site.publish" && state.phase === "publishing") return onPublish(event);
		if (event.skill === "competition.watch" && state.phase === "watching") return onWatch(event);
		return [];
	}

	function snapshot(): MasterSnapshot {
		return {
			phase: state.phase,
			report: state.report,
			brief: state.brief,
			shown: state.shown,
			previewHtml: state.previewHtml,
			previewUrl: state.previewUrl,
			researchFails: state.researchFails,
			pageFails: state.pageFails,
			watchFails: state.watchFails,
			runTaskId: state.runTaskId,
			retryPayload: state.retryPayload,
			seq,
		};
	}

	function restore(saved: MasterSnapshot): void {
		state.phase = saved.phase;
		state.report = saved.report;
		state.brief = saved.brief;
		state.shown = saved.shown;
		state.previewHtml = saved.previewHtml;
		state.previewUrl = saved.previewUrl;
		state.researchFails = saved.researchFails;
		state.pageFails = saved.pageFails;
		state.watchFails = saved.watchFails ?? 0;
		state.runTaskId = saved.runTaskId ?? "";
		state.retryPayload = { ...(saved.retryPayload ?? {}) };
		seq = saved.seq;
	}

	return { start, accept, approveBrief, approvePublish, createMonitor, snapshot, restore };
}
