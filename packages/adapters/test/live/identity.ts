import { imageTag, templateName } from "../../src/boat-fields.ts";

export const TRIAL_PROFILE = "tensquads-agents";
export const SECRET_BASE_URL = "https://example.com";

const closedProfiles = new Set(["default", "moe@10claws.com"]);

export function assertTrialProfile(name: string): void {
	if (closedProfiles.has(name) || name !== TRIAL_PROFILE) {
		throw new Error("The trial profile is closed.");
	}
}

export interface TrialIdentity {
	readonly runId: string;
	readonly accountId: string;
	readonly agentId: string;
	readonly imageId: string;
	readonly version: string;
	readonly tag: string;
	readonly templateId: string;
	readonly scope: { readonly accountId: string; readonly mode: "account" };
}

function assertRunId(runId: string): void {
	if (!/^\d{6,}$/.test(runId)) throw new Error("The run id is not valid.");
}

export function trialSecretName(runId: string): string {
	assertRunId(runId);
	return `TENSQUADS_TRIAL_KEY_${runId}`;
}

export function trialIdentity(runId: string): TrialIdentity {
	assertRunId(runId);
	const imageId = `img${runId}`;
	const version = "1";
	return {
		runId,
		accountId: `trial${runId}`,
		agentId: `a${runId}`,
		imageId,
		version,
		tag: imageTag(imageId, version),
		templateId: templateName(imageId, version),
		scope: { accountId: `trial${runId}`, mode: "account" },
	};
}
