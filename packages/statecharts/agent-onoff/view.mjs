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

export const state = (v) => {
	if (v.wait === "reload" && v.owed) return "A later write failed";
	return v.wait === "none" ? phases[v.phase] : waits[v.wait];
};

export const group = (v) => {
	if (v.wait === "reload" && v.owed) return "Failed";
	return v.wait === "none" ? phases[v.phase] : waits[v.wait];
};

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

const hidden = new Set([
	"Stay",
	"ChangeAutonomy",
	"RunSkill",
	"EndSkill",
	"OpenOlder",
	"CommitNewer",
	"ArriveOlder",
	"ArriveOlderFirst",
	"CommitAfterOlder",
]);

const labels = {
	SwitchOn: "you switch it on",
	Boot: "it starts",
	SwitchOff: "you switch it off",
	Halt: "it stops",
	EnterQueue: "you queue a change",
	MarkFailed: "the write fails",
	MarkLate: "the deadline passes",
	MarkReload: "the write response arrives",
	ReadAfterFailure: "one recovery read starts",
	ConfirmRead: "the recovery read returns",
	RefreshTimeout: "the recovery wait ends at its bound",
	FailDuringRead: "a later write fails during the recovery read",
	StaleReadEnds: "the old read ends and the later failure remains",
};

function namedAction(action, from, to) {
	if (action === "RefreshTimeout" && from.owed === true && to.wait === "failed") return "StaleReadEnds";
	return action;
}

export const step = (action, from, to) => {
	const name = namedAction(action, from, to);
	if (hidden.has(name)) return null;
	return labels[name] ?? null;
};
