const phases = { idle: "Idle", working: "Working", replied: "Replied" };

export const title = "Chat and dock";

export const state = (v) => phases[v.phase];

const hidden = new Set([
	"Stay",
	"Type",
	"SendEmpty",
	"SecondSend",
	"OpenChat",
	"LeaveChat",
	"OpenAdmin",
	"LeaveAdmin",
	"OpenDock",
	"CloseDock",
]);

const labels = {
	SendNone: "no agent matches",
	SendPaused: "the agent is paused",
	SendOn: "you send",
	SendNoSkill: "you send with no skill on",
	Finish: "the agent replies",
	Reload: "you reload",
};

export const step = (action) => {
	if (hidden.has(action)) return null;
	return labels[action] ?? null;
};

export const group = (v) => phases[v.phase];

export const colors = { Idle: "blue", Working: "orange", Replied: "teal" };
