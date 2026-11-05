import type { BusEvent, BusKind } from "../bus/types.ts";
import { checkBrief, checkPage, checkPublished, checkResearch, readReport } from "./checks.ts";
import { digestOf } from "./digest.ts";
import {
	type BusinessRequest,
	mandateFor,
	type PageAudit,
	type PageReader,
	type PocMandate,
	type ResearchReport,
} from "./types.ts";

export interface BriefModel {
	writeBrief(report: ResearchReport): Promise<string> | string;
}

export interface MasterPorts {
	readonly readPage: PageReader;
	readonly audit: (html: string) => PageAudit | Promise<PageAudit>;
	readonly model: BriefModel;
	readonly mandateAt?: string;
}

type Phase = "research" | "brief" | "building" | "publish" | "publishing" | "done" | "escalated";

interface State {
	phase: Phase;
	report?: ResearchReport;
	brief?: string;
	previewHtml?: string;
	previewUrl?: string;
	researchFails: number;
	pageFails: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function createMaster(request: BusinessRequest, ports: MasterPorts) {
	const state: State = { phase: "research", researchFails: 0, pageFails: 0 };
	let seq = 0;

	function nextId(): string {
		seq += 1;
		return `m-${String(seq).padStart(2, "0")}`;
	}

	function make(
		id: string,
		fields: {
			readonly from: string;
			readonly to: string;
			readonly kind: BusKind;
			readonly skill: string;
			readonly text: string;
			readonly payload: Readonly<Record<string, unknown>>;
		},
	): BusEvent {
		return {
			id,
			time: `12:${String(seq).padStart(2, "0")}`,
			from: fields.from,
			to: fields.to,
			kind: fields.kind,
			skill: fields.skill,
			text: fields.text,
			payload: fields.payload,
			writes: [],
			trace: `tr_${id}`,
		};
	}

	function emit(fields: Parameters<typeof make>[1]): BusEvent {
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

	function start(): BusEvent {
		return emit({
			from: "master",
			to: "market",
			kind: "Task",
			skill: "task.route",
			text: "Research this business.",
			payload: {
				businessName: request.businessName,
				businessType: request.businessType,
				items: request.items,
				...(request.cuisine ? { cuisine: request.cuisine } : {}),
			},
		});
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
		if (state.phase !== "brief" || !state.report || !state.brief) return [];
		const report = state.report;
		const brief = state.brief;
		const approvalId = nextId();
		const mandate: PocMandate = mandateFor({
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
				businessName: request.businessName,
				businessType: request.businessType,
				brief: { text: brief, gap: report.gap },
				report,
				gapEvidence: report.gapEvidence,
				items: request.items,
				...(request.cuisine ? { cuisine: request.cuisine } : {}),
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
			readPage: ports.readPage,
			audit: ports.audit,
		});
		if (!result.pass) return failPage(result.evidence);
		const page = await ports.readPage(previewUrl);
		state.previewHtml = page.body;
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
		if (state.phase !== "publish" || !state.previewHtml) return [];
		const approvalId = nextId();
		const mandate = mandateFor({
			approvalId,
			ruleId: "poc-publish",
			ruleWhen: "The page passed the check.",
			ruleAction: "site.publish",
			subject: await digestOf(state.previewHtml),
			at: ports.mandateAt,
		});
		state.phase = "publishing";
		return [
			make(approvalId, {
				from: "master",
				to: "website",
				kind: "Approval",
				skill: "approval.ask",
				text: "The user said yes.",
				payload: {
					approval: { skill: "site.publish", mandate },
					pageHtml: state.previewHtml,
					previewUrl: state.previewUrl ?? "",
				},
			}),
		];
	}

	async function onPublish(event: BusEvent): Promise<BusEvent[]> {
		if (!state.previewHtml) return failPage(["The preview is missing."]);
		const publishedUrl =
			isRecord(event.payload) && typeof event.payload.publishedUrl === "string" ? event.payload.publishedUrl : "";
		if (publishedUrl.length === 0) return failPage(["The published URL did not return 200."]);
		const result = await checkPublished(state.previewHtml, publishedUrl, ports.readPage);
		if (!result.pass) return failPage(result.evidence);
		state.phase = "done";
		return [];
	}

	async function accept(event: BusEvent): Promise<BusEvent[]> {
		if (state.phase === "escalated" || state.phase === "done") return [];
		if (event.kind !== "Result" || event.to !== "master") return [];
		if (event.skill === "report.write" && state.phase === "research") return onResearch(event);
		if (event.skill === "site.preview" && state.phase === "building") return onPreview(event);
		if (event.skill === "site.publish" && state.phase === "publishing") return onPublish(event);
		return [];
	}

	return { start, accept, approveBrief, approvePublish };
}
