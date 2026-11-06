import { approvalCovers, digestOf, readApproval, type Skill } from "@tensquads/agent-kit";

const publishSkill: Skill = {
	id: "site.publish",
	gate: "Ask first",
	subjectOf(payload) {
		const html = payload.pageHtml;
		return digestOf(typeof html === "string" ? html : "");
	},
	run() {
		return Promise.reject(new Error("The publish skill does not run on the worker."));
	},
};

export function publishCovered(mandate: unknown, html: string): boolean {
	const approval = readApproval({
		id: "publish",
		from: "website",
		to: "master",
		kind: "Task",
		skill: "site.publish",
		text: "Publish the site.",
		payload: { pageHtml: html, approval: { skill: "site.publish", mandate } },
		writes: [],
	});
	const subjectOf = publishSkill.subjectOf;
	if (!approval || !subjectOf) return false;
	return approvalCovers(approval, publishSkill, subjectOf({ pageHtml: html }));
}
