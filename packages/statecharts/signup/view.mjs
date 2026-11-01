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
	if (v.step === "created" || v.phase === "open") {
		return "Created";
	}
	if (v.phase === "stored") {
		return "Account created";
	}
	if (v.phase === "request") {
		return "Creating the account";
	}
	if (v.phase === "failed" && v.accounts === 1) {
		return "Account created, still on the form";
	}
	if (v.phase === "failed") {
		return "The request failed";
	}
	return names[v.step];
};

const steps = new Map([
	["PickNew", "A new business"],
	["PickExisting", "An existing business"],
	["Back", "Back"],
	["ChooseSquads", "Choose my squads"],
	["OpenAccount", "Create my workspace"],
	["ToggleOff", "Untick the last squad"],
	["ToggleOn", "Tick the squads again"],
	["Create", "The account is created"],
	["FindExisting", "The account is already there"],
	["FailResponse", "The request fails"],
	["Navigate", "Overview opens"],
	["FailNavigation", "Overview does not open"],
]);

export const step = (action, from) => {
	if (action === "Stay") {
		return null;
	}
	if (action === "Submit") {
		if (from.accounts === 1 || from.phase === "failed") {
			return "Try again";
		}
		return "Create my workspace";
	}
	return steps.get(action) ?? null;
};
