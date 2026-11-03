export const title = "Rules and limits";

const rule = (on) => (on ? "On" : "Off");
const money = (bit, full) => (bit === 1 ? full : "$0");

const added = (v) => {
	if (v.added === 1 && v.action === "text") return "Added, typed again";
	if (v.added === 1) return "Added, on";
	if (v.save === "adding") return "Adding";
	if (v.save === "reading") return "One read";
	if (v.action === "text") return "Action typed";
	return "Empty action";
};

const saved = {
	idle: "Idle",
	adding: "Adding",
	saving: "Saving a limit",
	reading: "Waiting for one read",
	toggling: "Switching a rule",
};

const saveName = (v) => {
	const label = v.readStale ? "Waiting for an older read" : saved[v.save];
	return v.needsRead ? `${label}, read again` : label;
};

export const state = (v) => ({
	"Refund rule": rule(v.save === "toggling" ? !v.ruleA : v.ruleA),
	"Monday rule": rule(v.ruleB),
	"Refund limit": money(v.refund, "$50"),
	"Ad cap": money(v.ads, "$200"),
	"Reorder limit": money(v.reorder, "$500"),
	"New rule": added(v),
	Save: saveName(v),
});

const hidden = new Set(["AddBlank"]);

const labels = {
	StartToggle: "you switch the refund rule",
	CommitToggle: "the refund rule is saved",
	FailToggle: "the refund rule fails",
	LateToggle: "the refund rule is late",
	Reload: "you open the screen again",
	Navigate: "you navigate to the screen",
	FailureDuringRead: "a later write or read fails",
	StartRefund: "you move the refund limit",
	StartAds: "you move the ad cap",
	CommitRefund: "the refund limit is saved",
	CommitAds: "the ad cap is saved",
	FailRefund: "the refund limit fails",
	FailAds: "the ad cap fails",
	LateRefund: "the refund limit is late",
	LateAds: "the ad cap is late",
	OpenLate: "the late ad cap can still arrive",
	ArriveLate: "the late ad cap reaches the server",
	TypeAction: "you type an action",
	StartAdd: "you add the rule",
	CommitAdd: "the add returns the row",
	FailAdd: "the add fails",
	LateAdd: "the add is late",
	ReadOk: "the read returns the snapshot",
	ReadFail: "the read fails and the wait stops",
};

export const step = (action) => {
	if (hidden.has(action)) return null;
	const label = labels[action];
	if (!label) {
		throw new Error(`Unlabeled step ${action}`);
	}
	return label;
};
