const held = "a held account read commits no limit|a read held past the deadline cannot commit the queued writes";

export function suitePlan(ci, platform, cpuCount) {
	const app = ["--project", "app", "--grep-invert", held];
	if (ci && platform === "darwin") {
		app.push(`--workers=${Math.max(2, cpuCount)}`);
	}
	return [app, ["--project", "rules-fence", "--workers=1"], ["--project", "app", "--workers=1", "--grep", held]];
}
