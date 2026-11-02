export const title = "Rules and limits";

const rule = (on) => (on ? "On" : "Off");
const money = (bit, full) => (bit === 1 ? full : "$0");

export const state = (v) => ({
	"Refund rule": rule(v.ruleA),
	"Monday rule": rule(v.ruleB),
	"Refund limit": money(v.refund, "$50"),
	"Ad cap": money(v.ads, "$200"),
	"Reorder limit": money(v.reorder, "$500"),
	"New rule": v.added === 1 ? "Added, on" : v.action === "text" ? "Action typed" : "Empty action",
});

const hidden = new Set(["AddBlank"]);

const labels = {
	ToggleA: "you switch the refund rule",
	ToggleB: "you switch the Monday rule",
	SetRefund: "you move the refund limit",
	SetAds: "you move the ad cap",
	SetReorder: "you move the reorder limit",
	TypeAction: "you type an action",
	Add: "you add the rule",
};

export const step = (action) => {
	if (hidden.has(action)) return null;
	return labels[action] ?? null;
};
