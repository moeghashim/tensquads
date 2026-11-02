const phases = {
	Off: "Off",
	Starting: "Starting",
	On: "On",
	Stopping: "Stopping",
	Paused: "Paused",
};

export const title = "Agent on and off";

export const state = (v) => phases[v.phase];

export const group = (v) => phases[v.phase];

export const colors = {
	Off: "tan",
	Starting: "orange",
	On: "teal",
	Stopping: "yellow",
	Paused: "blue",
};

const hidden = new Set(["Stay", "ChangeAutonomy", "RunSkill", "EndSkill"]);

const labels = {
	SwitchOn: "you switch it on",
	Boot: "it starts",
	SwitchOff: "you switch it off",
	Halt: "it stops",
};

export const step = (action) => {
	if (hidden.has(action)) return null;
	return labels[action] ?? null;
};
