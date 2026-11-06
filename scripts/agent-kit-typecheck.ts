export interface Mandate {
	readonly approvalId: string;
	readonly ruleId: string;
	readonly ruleWhen: string;
	readonly ruleAction: string;
	readonly ruleApproval: string;
	readonly limitValue: number;
	readonly policyVersion: string;
	readonly saidYes: string;
	readonly at: string;
	readonly subject: string;
}

export interface TaskApproval {
	readonly skill: string;
	readonly mandate: Mandate;
}

export interface Skill {
	readonly id: string;
	readonly gate: "Auto" | "Ask first" | "Under limit";
	subjectOf?(payload: Readonly<Record<string, unknown>>): string;
	run(task: unknown, earlier: readonly unknown[]): Promise<unknown>;
}

export function digestOf(_text: string): string {
	return "";
}

export function readApproval(_task: unknown): TaskApproval | null {
	return null;
}

export function approvalCovers(_approval: TaskApproval, _skill: Skill, _subject: string): boolean {
	return false;
}
