import { digestOf, type Mandate, type ResearchReport } from "@tensquads/agent-kit";

import type { BusEvent, BusKind } from "../bus/types.ts";
import { researchFields } from "../conversation/business-request.ts";
import { checkBrief, checkPage, checkPublished, checkResearch, readReport } from "./checks.ts";
import type { RenderedPage } from "./render-page.ts";
import { type BusinessRequest, mandateFor, type PageAudit, type PageReader } from "./types.ts";

export interface BriefModel {
	writeBrief(report: ResearchReport): Promise<string> | string;
}

export interface MasterPorts {
	readonly readPage: PageReader;
	readonly audit: (html: string) => PageAudit | Promise<PageAudit>;
	readonly model: BriefModel;
	readonly mandateAt?: string;
	readonly accountSlug?: string;
	readonly browser?: (html: string) => Promise<RenderedPage>;
	readonly recordMonitor?: (monitorId: string) => void | Promise<void>;
}

type Phase = "research" | "brief" | "building" | "publish" | "publishing" | "watch" | "watching" | "done" | "escalated";

export interface MasterSnapshot {
	readonly phase: Phase;
	readonly report?: ResearchReport;
	readonly brief?: string;
	readonly previewHtml?: string;
	readonly previewUrl?: string;
	readonly researchFails: number;
	readonly pageFails: number;
	readonly watchFails?: number;
	readonly seq: number;
}

interface State {
	phase: Phase;
	report?: ResearchReport;
	brief?: string;
	previewHtml?: string;
	previewUrl?: string;
	researchFails: number;
	pageFails: number;
	watchFails: number;
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

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
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
	const state: State = { phase: "research", researchFails: 0, pageFails: 0, watchFails: 0 };
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
			payload: { evidence },
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

	function start(): BusEvent {
		const task = researchFields(request);
		return emit({
			from: "master",
			to: "market",
			kind: "Task",
			skill: "task.route",
			text: task.text,
			payload: task.payload,
			writes: task.writes,
			set: task.set,
		});
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

	async function onResearch(event: BusEvent): Promise<BusEvent[]> {
		const raw = isRecord(event.payload) ? event.payload.report : undefined;
		const result = await checkResearch(raw, ports.readPage);
		if (!result.pass) return failResearch(result.evidence);
		const report = readReport(raw);
		if (!report) return failResearch(["The report was rejected."]);
		const brief = String(await ports.model.writeBrief(report));
		const briefCheck = checkBrief(brief, report);
		if (!briefCheck.pass) {
			state.phase = "escalated";
			return [escalation("The brief check failed.", briefCheck.evidence)];
		}
		state.report = report;
		state.brief = brief;
		state.phase = "brief";
		return [
			emit({
				from: "master",
				to: "user",
				kind: "Approval",
				skill: "brief.write",
				text: "Build the site with this brief?",
				payload: { brief: { text: brief, gap: report.gap } },
			}),
		];
	}

	async function approveBrief(): Promise<BusEvent[]> {
		if (request.businessName.trim().length === 0) throw new Error("The business is not stored.");
		if (state.phase !== "brief" || !state.report || !state.brief) return [];
		const report = state.report;
		const brief = state.brief;
		const approvalId = nextId();
		const mandate: Mandate = mandateFor({
			approvalId,
			ruleId: "poc-brief",
			ruleWhen: "The brief is ready.",
			ruleAction: "site.build",
			subject: await digestOf(brief),
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
		const task = emit({
			from: "master",
			to: "website",
			kind: "Task",
			skill: "task.route",
			text: `Build the page. ${report.gap} ${report.gapEvidence.sourceUrl}`,
			payload: {
				...websiteFields(brief, report),
				approval: { skill: "site.build", mandate },
			},
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
				payload: { previewUrl },
			}),
		];
	}

	async function approvePublish(): Promise<BusEvent[]> {
		if (state.phase !== "publish" || !state.previewHtml || !state.report || !state.brief) return [];
		const approvalId = nextId();
		const mandate = mandateFor({
			approvalId,
			ruleId: "poc-publish",
			ruleWhen: "The page passed the check.",
			ruleAction: "site.publish",
			subject: await digestOf(state.previewHtml),
			at: ports.mandateAt,
		});
		const pageHtml = state.previewHtml;
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
		const task = emit({
			from: "master",
			to: "website",
			kind: "Task",
			skill: "task.route",
			text: "Publish the page.",
			payload: {
				...websiteFields(state.brief, state.report),
				approval: approvalBody,
				mandate,
				html: pageHtml,
				pageHtml,
				previewUrl,
			},
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
		return [
			emit({
				from: "master",
				to: "user",
				kind: "Approval",
				skill: "competition.watch",
				text: "Watch the competitors?",
				payload: {},
			}),
		];
	}

	async function approveWatch(): Promise<BusEvent[]> {
		if (state.phase !== "watch") return [];
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

	async function accept(event: BusEvent): Promise<BusEvent[]> {
		if (state.phase === "escalated" || state.phase === "done") return [];
		if (userSaidYes(event)) return onUserYes(event);
		if (event.kind !== "Result" || event.to !== "master") return [];
		if (event.skill === "report.write" && state.phase === "research") return onResearch(event);
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
			previewHtml: state.previewHtml,
			previewUrl: state.previewUrl,
			researchFails: state.researchFails,
			pageFails: state.pageFails,
			watchFails: state.watchFails,
			seq,
		};
	}

	function restore(saved: MasterSnapshot): void {
		state.phase = saved.phase;
		state.report = saved.report;
		state.brief = saved.brief;
		state.previewHtml = saved.previewHtml;
		state.previewUrl = saved.previewUrl;
		state.researchFails = saved.researchFails;
		state.pageFails = saved.pageFails;
		state.watchFails = saved.watchFails ?? 0;
		seq = saved.seq;
	}

	return { start, accept, approveBrief, approvePublish, createMonitor, snapshot, restore };
}
