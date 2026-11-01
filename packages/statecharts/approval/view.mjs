const spend = {
	Pending: "Pending",
	Approved: "Approved",
	Declined: "Declined",
};

const mission = {
	Proposed: "Proposed",
	Revising: "Revising",
	Approved: "Approved",
};

export const title = "Approval inbox";

export const state = (v) => {
	if (v.approval !== "Pending" && v.proposal === "Approved") {
		return "Nothing waiting";
	}
	if (v.proposal === "Approved") {
		return spend[v.approval];
	}
	return `${spend[v.approval]}, ${mission[v.proposal]}`;
};

const steps = new Map([
	["ApproveSpend", "Approve"],
	["DeclineSpend", "Decline"],
	["ApproveMission", "Approve mission"],
	["DeclineMission", "Decline mission"],
	["AskRevise", "Ask to revise"],
]);

export const step = (action) => steps.get(action) ?? null;
