export const title = "Rules and limits";

const rule = (on) => (on ? "On" : "Off");
const money = (bit, full) => (bit === 1 ? full : "$0");

const added = (v) => {
	if (v.added === 1 && v.action === "text") return "Added, typed again";
	if (v.added === 1 && v.pending === 1 && v.save === "reading") return "Waiting for the read";
	if (v.added === 1 && v.pending === 1) return "Saved row stays";
	if (v.added === 1) return "Added, on";
	if (v.save === "adding") return "Adding";
	if (v.action === "text") return "Action typed";
	return "Empty action";
};

const saved = {
	idle: "Idle",
	adding: "Adding",
	saving: "Saving a limit",
	reading: "Waiting for the read",
	stays: "Saved row stays",
};

export const state = (v) => ({
	"Refund rule": rule(v.ruleA),
	"Monday rule": rule(v.ruleB),
	"Refund limit": money(v.refund, "$50"),
	"Ad cap": money(v.ads, "$200"),
	"Reorder limit": money(v.reorder, "$500"),
	"New rule": added(v),
	Save: saved[v.save],
});

const hidden = new Set(["AddBlank"]);

const labels = {
	ToggleA: "you switch the refund rule",
	ToggleB: "you switch the Monday rule",
	StartRefund: "you move the refund limit",
	StartAds: "you move the ad cap",
	CommitRefund: "the refund limit is saved",
	CommitAds: "the ad cap is saved",
	FailRefund: "the refund limit fails",
	FailAds: "the ad cap fails",
	LateRefund: "the refund limit is late",
	LateAds: "the ad cap is late",
	TypeAction: "you type an action",
	StartAdd: "you add the rule",
	CommitAdd: "the add is saved",
	FailAdd: "the add fails",
	LateAdd: "the add is late",
	RefreshTimeout: "the read times out",
	LaterRead: "the read confirms the row",
};

export const step = (action) => {
	if (hidden.has(action)) return null;
	const label = labels[action];
	if (!label) {
		throw new Error(`Unlabeled step ${action}`);
	}
	return label;
};
