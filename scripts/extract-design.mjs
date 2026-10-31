import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function traceFor(id) {
	return `tr_${createHash("sha256").update(id).digest("hex").slice(0, 6)}`;
}

function read(path) {
	return readFileSync(join(root, path), "utf8");
}

function sliceFunction(source, signature) {
	const start = source.indexOf(signature);
	if (start < 0) {
		throw new Error(`Missing ${signature}`);
	}
	const open = source.indexOf("{", start);
	let depth = 0;
	for (let index = open; index < source.length; index += 1) {
		const char = source[index];
		if (char === "{") {
			depth += 1;
		} else if (char === "}") {
			depth -= 1;
			if (depth === 0) {
				return source.slice(open, index + 1);
			}
		}
	}
	throw new Error(`Unclosed ${signature}`);
}

function sliceLiteral(source, marker) {
	const start = source.indexOf(marker);
	if (start < 0) {
		throw new Error(`Missing ${marker}`);
	}
	let open = start + marker.length;
	while (source[open] === " " || source[open] === "\n" || source[open] === "\t") {
		open += 1;
	}
	const closer = source[open] === "[" ? "];" : "};";
	const end = source.indexOf(closer, open);
	if (end < 0) {
		throw new Error(`Unclosed ${marker}`);
	}
	return source.slice(open, end + 1);
}

function evalLiteral(literal, params = {}) {
	const names = Object.keys(params);
	const values = Object.values(params);
	return new Function(...names, `return (${literal});`)(...values);
}

export function extractDesign() {
	const main = read("design/Main.dc.html");
	const home = read("design/Home.dc.html");
	const onboarding = read("design/Onboarding.dc.html");
	const random = Math.random;
	Math.random = () => 0.5;
	let seed;
	try {
		const body = sliceFunction(main, "seed() {");
		seed = new Function(`return function seed() ${body};`)()();
	} finally {
		Math.random = random;
	}
	for (const event of seed.bus) {
		event.trace = traceFor(event.id);
	}

	const missionLiteral = sliceLiteral(main, "const companyMissions = ");
	const companyMissions = evalLiteral(missionLiteral.replace("s.companyMission", JSON.stringify(seed.companyMission)));
	const thisWeek = evalLiteral(sliceLiteral(main, "const thisWeek = "));
	const lastWeek = evalLiteral(sliceLiteral(main, "const lastWeek = "));
	const amounts = lastWeek.concat(thisWeek);
	const revenue = amounts.map((amount, index) => {
		const date = new Date(Date.UTC(2026, 9, 14 + index));
		return {
			day: date.toISOString().slice(0, 10),
			amount,
			h: Math.round((amount / 1500) * 100),
			fill: index < 7 ? "#c9c9c9" : "#181818",
			label: String(14 + index),
			title: `Oct ${14 + index}: $${amount.toLocaleString("en-US")}`,
		};
	});
	const tasksTotal = seed.agents.reduce((sum, agent) => sum + agent.tasks, 0);
	const kpiLiteral = sliceLiteral(main, "const kpis = ").replaceAll(
		"String(tasksTotal)",
		JSON.stringify(String(tasksTotal)),
	);
	const tiles = evalLiteral(kpiLiteral);
	const script = evalLiteral(sliceLiteral(main, "const script = "));
	const planPrice = evalLiteral(sliceLiteral(main, "const planPrice = "));
	const emptyMatch = main.match(/Nothing waiting\. Your squads are working inside their limits\./);
	if (!emptyMatch) {
		throw new Error("Missing empty inbox copy.");
	}
	const homepage = evalLiteral(sliceLiteral(home, "const agents = "));
	const agentDefs = sliceLiteral(onboarding, "const agentDefs = ");
	const signup = {
		new: evalLiteral(agentDefs, { s: { kind: "new" } }),
		existing: evalLiteral(agentDefs, { s: { kind: "existing" } }),
	};
	const defaultBody = sliceFunction(onboarding, "defaultAgents(kind) {");
	const defaultAgents = new Function(`return function defaultAgents(kind) ${defaultBody};`)();

	return {
		seed,
		companyMissions,
		revenue,
		tiles,
		script,
		planPrice,
		emptyInbox: emptyMatch[0],
		homepage,
		signup,
		defaultAgents: {
			new: defaultAgents("new"),
			existing: defaultAgents("existing"),
		},
	};
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
	process.stdout.write(`${JSON.stringify(extractDesign(), null, "\t")}\n`);
}
