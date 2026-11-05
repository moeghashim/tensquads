// Build status for the plan page. Git is the only source, so the page updates
// itself on each deploy. A task is Built when its branch is merged into the ref.
// It is In progress when its branch is on origin but not merged. Else it is Planned.

export const BUILT = "built";
export const PROGRESS = "progress";
export const PLANNED = "planned";

export const LABEL = { [BUILT]: "Built", [PROGRESS]: "In progress", [PLANNED]: "Planned" };

const branches = (git, ...args) =>
	new Set(
		git("branch", "-r", ...args)
			.split("\n")
			.map((line) => line.trim())
			.filter((name) => name.startsWith("origin/") && !name.includes("->"))
			.map((name) => name.slice("origin/".length)),
	);

export function readStatus(git, ref) {
	const merged = branches(git, "--merged", ref);
	for (const subject of git("log", "--merges", "--format=%s", ref).split("\n")) {
		const match = /^Merge pull request #\d+ from moeghashim\/(\S+)$/.exec(subject);
		if (match) merged.add(match[1]);
		// Phase 0 merged as "Merge phase 0 foundation (#1)", with no branch name.
		if (/^Merge phase 0 foundation \(#\d+\)$/.test(subject)) merged.add("00-foundation");
	}
	const open = branches(git);
	const one = (task) => (merged.has(task) ? BUILT : open.has(task) ? PROGRESS : PLANNED);
	// An item with several tasks is Built only when all of them are merged.
	const of = (tasks) => {
		const states = tasks.map(one);
		if (states.length === 0) return PLANNED;
		if (states.every((s) => s === BUILT)) return BUILT;
		if (states.some((s) => s !== PLANNED)) return PROGRESS;
		return PLANNED;
	};
	return { of, one };
}

// What each part of the plan needs. A task id is the branch name (AGENTS.md).
export const SCREENS = [
	["1", "Homepage", ["01-public-screens"]],
	["2", "Sign-up", ["01-public-screens"]],
	["", "Frame and dock", ["02-frame"]],
	["3", "Overview", ["02-overview"]],
	["4", "Chat", ["02-chat"]],
	["5", "Agents", ["02-agents"]],
	["6", "Agent dashboard", ["02-agent-detail"]],
	["7", "Agent traffic", ["02-traffic"]],
	["8", "Rules and limits", ["02-rules"]],
	["9", "All accounts", ["03-super-admin"]],
	["10", "Agent images", ["03-super-admin"]],
];

export const PHASES = [
	["0", "Foundation", "copy, set up, core, schema, seed, tokens, verify passes", ["00-foundation"]],
	["1", "Public", "screens 1, 2, sign-in form, sign-up makes an account", ["01-public-screens"]],
	[
		"2",
		"Workspace",
		"frame, dock, screens 3 to 8 in order",
		["02-frame", "02-overview", "02-chat", "02-agents", "02-agent-detail", "02-traffic", "02-rules"],
	],
	["3", "Admin", "screens 9, 10, open an account, admin role", ["03-super-admin"]],
	["4", "Machines", "boat.dev and bus adapters behind the interfaces", ["04-machine-trial"]],
	[
		"5",
		"Proof",
		"agent kit, researcher, builder, then three squads with two approvals",
		["05-agent-kit", "05-market-researcher", "05-website-builder", "05-proof-of-concept"],
	],
	// Decisions 33 and 34 added these two tasks after the plan had six phases.
	["6", "Squadmates", "a name and a character for Petra and each agent", ["06-squadmates"]],
	["7", "Homepage", "new screen 1: Moe approves the design, then the build", ["07-home-redesign"]],
];
