import { notConfigured } from "./boat-errors.ts";

// Model settings for the two real-run agents. Moe sets these on the Worker. The code has no default.
export interface AgentModelEnv {
	readonly RESEARCH_MODEL?: string;
	readonly RESEARCH_REASONING_EFFORT?: string;
	readonly WEBSITE_MODEL?: string;
	readonly WEBSITE_REASONING_EFFORT?: string;
}

// Copies only the four model settings. Nothing else from the Worker env reaches a machine.
export function agentModelsOf(env: AgentModelEnv): AgentModelEnv {
	return {
		RESEARCH_MODEL: env.RESEARCH_MODEL,
		RESEARCH_REASONING_EFFORT: env.RESEARCH_REASONING_EFFORT,
		WEBSITE_MODEL: env.WEBSITE_MODEL,
		WEBSITE_REASONING_EFFORT: env.WEBSITE_REASONING_EFFORT,
	};
}

function configured(value: string | undefined): string | undefined {
	const text = value?.trim() ?? "";
	return text.length > 0 ? text : undefined;
}

// Returns the two machine variables for one agent. Other agents get none.
// A blank setting throws before any boat request.
export function agentModelEnv(agentId: string, models: AgentModelEnv | undefined): Record<string, string> {
	if (agentId === "market") {
		const model = configured(models?.RESEARCH_MODEL);
		if (!model) throw notConfigured("The research model is not configured.");
		const effort = configured(models?.RESEARCH_REASONING_EFFORT);
		if (!effort) throw notConfigured("The research reasoning effort is not configured.");
		return { RESEARCH_MODEL: model, RESEARCH_REASONING_EFFORT: effort };
	}
	if (agentId === "website") {
		const model = configured(models?.WEBSITE_MODEL);
		if (!model) throw notConfigured("The website model is not configured.");
		const effort = configured(models?.WEBSITE_REASONING_EFFORT);
		if (!effort) throw notConfigured("The website reasoning effort is not configured.");
		return { WEBSITE_MODEL: model, WEBSITE_REASONING_EFFORT: effort };
	}
	return {};
}
