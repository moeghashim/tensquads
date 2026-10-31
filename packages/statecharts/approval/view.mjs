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

export const step = (action) => {
	if (action === "ApproveSpend") {
		return "Approve";
	}
	if (action === "DeclineSpend") {
		return "Decline";
	}
	if (action === "ApproveMission") {
		return "Approve mission";
	}
	if (action === "DeclineMission") {
		return "Decline mission";
	}
	return null;
};
