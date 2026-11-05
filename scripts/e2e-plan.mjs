const held = "a held account read commits no limit|a read held past the deadline cannot commit the queued writes";

export function suitePlan(ci, cpuCount) {
	const app = ["--project", "app", "--grep-invert", held];
	// CI runners are dedicated, so the app project uses one worker per CPU, and at least 2.
	if (ci) {
		app.push(`--workers=${Math.max(2, cpuCount)}`);
	}
	return [app, ["--project", "rules-fence", "--workers=1"], ["--project", "app", "--workers=1", "--grep", held]];
}
