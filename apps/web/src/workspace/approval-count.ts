export interface ApprovalCount {
	readonly value: number;
	readonly decisionAt: number;
}

export function seedApprovalCount(value: number): ApprovalCount {
	return { value, decisionAt: 0 };
}

// A later answer replaces an earlier one. The first answer is free to replace the seed.
export function noteDecisionCount(current: ApprovalCount, value: number, answeredAt: number): ApprovalCount {
	if (answeredAt < current.decisionAt) {
		return current;
	}
	return { value, decisionAt: answeredAt };
}

// A frame read replaces the count only when that read started after the last decision.
export function noteFrameCount(current: ApprovalCount, value: number, startedAt: number): ApprovalCount {
	if (startedAt <= current.decisionAt) {
		return current;
	}
	return { value, decisionAt: current.decisionAt };
}
