const phases = {
	Off: "Off",
	Starting: "Starting",
	On: "On",
	Stopping: "Stopping",
	Paused: "Paused",
};

const waits = {
	queue: "Queued",
	failed: "Failed",
	late: "Late",
	reload: "Reload",
};

export const title = "Agent on and off";

export const state = (v) => (v.wait === "none" ? phases[v.phase] : waits[v.wait]);

export const group = (v) => (v.wait === "none" ? phases[v.phase] : waits[v.wait]);

export const colors = {
	Off: "tan",
	Starting: "orange",
	On: "teal",
	Stopping: "yellow",
	Paused: "blue",
	Queued: "purple",
	Failed: "pink",
	Late: "orange",
	Reload: "yellow",
};

const hidden = new Set(["Stay", "ChangeAutonomy", "RunSkill", "EndSkill", "RefreshTimeout"]);

const labels = {
	SwitchOn: "you switch it on",
	Boot: "it starts",
	SwitchOff: "you switch it off",
	Halt: "it stops",
	EnterQueue: "you queue a change",
	MarkFailed: "the write fails",
	MarkLate: "the deadline passes",
	MarkReload: "the write lands",
	ReadAfterFailure: "the page reads again",
	ConfirmRead: "the read confirms",
};

export const step = (action) => {
	if (hidden.has(action)) return null;
	return labels[action] ?? null;
};
