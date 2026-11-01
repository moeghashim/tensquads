const names = {
	type: "Type",
	details: "Details",
	squad: "Squad",
	account: "Account",
	created: "Created",
};

export const title = "Sign up";

function failedState(v) {
	return v.accounts === 1 ? "Account created, still on the form" : "The request failed";
}

function phaseState(v) {
	if (v.phase === "stored") return "Account created";
	if (v.phase === "request") return "Creating the account";
	if (v.phase === "failed") return failedState(v);
	return names[v.step];
}

function isCreated(v) {
	return v.step === "created" || v.phase === "open";
}

export const state = (v) => {
	if (v.step === "squad" && v.picked === 0) {
		return "Squad, none picked";
	}
	if (isCreated(v)) return "Created";
	return phaseState(v);
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

function submitLabel(from) {
	return from.accounts === 1 || from.phase === "failed" ? "Try again" : "Create my workspace";
}

export const step = (action, from) => {
	if (action === "Stay") return null;
	if (action === "Submit") return submitLabel(from);
	return steps.get(action) ?? null;
};
