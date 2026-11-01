const names = {
	type: "Type",
	details: "Details",
	squad: "Squad",
	account: "Account",
	created: "Created",
};

export const title = "Sign up";

export const state = (v) => {
	if (v.step === "squad" && v.picked === 0) {
		return "Squad, none picked";
	}
	return names[v.step];
};

const steps = new Map([
	["PickNew", "A new business"],
	["PickExisting", "An existing business"],
	["Back", "Back"],
	["ChooseSquads", "Choose my squads"],
	["OpenAccount", "Create my workspace"],
	["Submit", "Create my workspace"],
	["ToggleOff", "Untick the last squad"],
	["ToggleOn", "Tick the squads again"],
]);

export const step = (action) => steps.get(action) ?? null;
