export const title = "Image release";

export const state = (value) => {
	const motion = value.rollout === "running" ? "Rolling out" : "No rollout";
	return `${value.status}, ${motion}`;
};

export const step = (action, from, to) => {
	if (action === "RollOut" || action === "ShowDeploy") return null;
	if (state(from) === state(to)) return null;
	if (action === "SetStatus") return `the status becomes ${to.status}`;
	if (action === "BeginRollout") return "a rollout starts";
	if (action === "HealthPass") return "every account reaches the new version";
	if (action === "HealthFail") return "the rollout stops after two failed checks";
	return null;
};
