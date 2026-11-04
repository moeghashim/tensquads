export const title = "Image release";

export const state = (value) => {
	const motion = value.rollout === "running" ? "Rolling out" : "No rollout";
	return `${value.status}, ${motion}`;
};

export const step = (action, from, to) => {
	if (skippedStep(action, from, to)) return null;
	return stepLabel(action, to);
};

function skippedStep(action, from, to) {
	if (action === "RollOut" || action === "ShowDeploy") return true;
	return state(from) === state(to);
}

function stepLabel(action, to) {
	if (action === "SetStatus") return `the status becomes ${to.status}`;
	if (action === "BeginRollout") return "a rollout starts";
	return rolloutHealthLabel(action);
}

function rolloutHealthLabel(action) {
	if (action === "HealthPass") return "every account reaches the new version";
	if (action === "HealthFail") return "the rollout stops after two failed checks";
	return null;
}
