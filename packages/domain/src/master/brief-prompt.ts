import type { BriefInput } from "./loop.ts";

// The model writes the brief prose only. The check reads its words before use.
export function briefPrompt(input: BriefInput): string {
	const lines = [
		"Write the research brief for this business. Stay under 150 words.",
		// The check looks for the gap sentence as written, so the model must copy it, not reword it.
		"Start the brief with this sentence. Copy it exactly, character for character:",
		input.report.gap,
		`Business: ${input.businessName}`,
		`Type: ${input.businessType}`,
		"Source URLs:",
		...input.report.sources,
		"Do not mention any price, number, currency, offer, discount, or menu item.",
	];
	if (input.reason) lines.push(`Your last brief was refused: ${input.reason} Write it again.`);
	return lines.join("\n");
}
