import { approvalCovers, digestOf, readApproval, type Skill } from "@tensquads/agent-kit";

const PUBLISH_SKILL = "website.publish";

const publishSkill: Skill = {
	id: PUBLISH_SKILL,
	gate: "Ask first",
	subjectOf(payload) {
		const html = payload.pageHtml;
		return digestOf(typeof html === "string" ? html : "");
	},
	run() {
		return Promise.reject(new Error("The publish skill does not run on the worker."));
	},
};

// The stored Mandate must name this skill and the digest of the exact HTML text.
export function publishCovered(stored: unknown, html: string): boolean {
	const approval = readApproval({
		id: "publish",
		from: "website",
		to: "master",
		kind: "Task",
		skill: PUBLISH_SKILL,
		text: "Publish the site.",
		payload: { pageHtml: html, approval: { skill: PUBLISH_SKILL, mandate: stored } },
		writes: [],
	});
	const subjectOf = publishSkill.subjectOf;
	if (!approval || !subjectOf) return false;
	return approvalCovers(approval, publishSkill, subjectOf({ pageHtml: html }));
}
