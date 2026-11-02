import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

let runtime;
const modules = {
	"@tanstack/react-router": ["useMatch", "useNavigate", "useRouter"],
	"@tensquads/adapters/pending-window": ["PENDING_TASK_WINDOW_MS"],
	react: ["useEffect", "useSyncExternalStore"],
	"#/server/agent-detail.ts": [
		"askAgentRevise",
		"loadAgentDetail",
		"setAgentAutonomy",
		"setAgentRunning",
		"setSkillEnabled",
	],
	"#/workspace/agent-view.ts": ["agentStatus", "missionBits"],
	"#/workspace/event-view.ts": ["decorate"],
	"#/workspace/styles.ts": ["switchParts", "gateStyle", "pill"],
};
globalThis.agentWriteTestCall = (module, name, args) => runtime[module][name](...args);
registerHooks({
	resolve(specifier, context, nextResolve) {
		const names = modules[specifier];
		if (!names) return nextResolve(specifier, context);
		const source = names
			.map((name) =>
				name === "PENDING_TASK_WINDOW_MS"
					? `export const ${name} = 30000;`
					: `export const ${name} = (...args) => globalThis.agentWriteTestCall(${JSON.stringify(specifier)}, ${JSON.stringify(name)}, args);`,
			)
			.join("\n");
		return { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true };
	},
});
const moduleUrl = process.env.AGENT_WRITE_TEST_MODULE
	? pathToFileURL(process.env.AGENT_WRITE_TEST_MODULE)
	: new URL("../../apps/web/src/screens/agent-detail/write.ts", import.meta.url);
const { useAgentWrites } = await import(moduleUrl.href);

function harness({ failPost = false } = {}) {
	const effects = [];
	const reads = [];
	const server = {
		id: "support",
		on: true,
		storedCpu: "22%",
		storedUptime: "18 days",
		events: ["old message"],
		skills: [{ id: "inbox.read", onStr: "true" }],
		autonomyOpts: [{ label: "Ask first", onStr: "true" }, { label: "Full auto", onStr: "false" }],
	};
	let loader = structuredClone(server);
	const match = {
		routeId: "/_workspace/agents/$id",
		params: { id: "support" },
		status: "success",
		updatedAt: 100,
	};
	const router = { state: { matches: [match] } };
	runtime = {
		"@tanstack/react-router": {
			useMatch: () => match,
			useNavigate: () => () => undefined,
			useRouter: () => router,
		},
		react: {
			useEffect: (effect) => effects.push(effect),
			useSyncExternalStore: (_subscribe, snapshot) => snapshot(),
		},
		"#/server/agent-detail.ts": {
			loadAgentDetail: () =>
				new Promise((resolve) => {
					const view = structuredClone(server);
					reads.push(() => resolve(view));
				}),
			setSkillEnabled: async ({ data }) => {
				if (failPost) throw new Error("Write failed");
				server.skills[0].onStr = String(data.on);
			},
			setAgentRunning: async ({ data }) => {
				server.on = data.on;
			},
			setAgentAutonomy: async ({ data }) => {
				server.autonomyOpts = server.autonomyOpts.map((option) => ({
					...option,
					onStr: String(option.label === data.autonomy),
				}));
			},
			askAgentRevise: async () => undefined,
		},
		"#/workspace/agent-view.ts": {
			agentStatus: (on) => ({ statusLabel: on ? "Running" : "Paused" }),
			missionBits: () => ({}),
		},
		"#/workspace/event-view.ts": { decorate: (value) => value },
		"#/workspace/styles.ts": {
			switchParts: (on) => ({ onStr: String(on) }),
			gateStyle: () => "",
			pill: () => "",
		},
	};
	function commitEffects() {
		while (effects.length) effects.shift()();
	}
	function render(commit = true) {
		const result = useAgentWrites(loader);
		if (commit) commitEffects();
		return result;
	}
	return {
		render,
		reads,
		server,
		commitEffects,
		newLoader(view, status = "success") {
			loader = structuredClone(view);
			match.updatedAt += 100;
			match.status = status;
		},
	};
}

async function settle() {
	for (let step = 0; step < 100; step++) await Promise.resolve();
}

for (const adoption of ["before response", "after response"]) {
	for (const action of ["skill", "running", "autonomy", "revise"]) {
		test(`late ${action} confirmation preserves loader messages adopted ${adoption}`, async () => {
			const h = harness();
			const control = h.render();
			if (action === "skill") control.toggleSkill("inbox.read", false);
			if (action === "running") control.toggleAgent(false);
			if (action === "autonomy") control.pickAutonomy("Full auto");
			if (action === "revise") control.askRevise();
			await settle();
			assert.equal(h.reads.length, 1);
			const fresh = { ...structuredClone(h.server), events: ["new message"] };
			fresh.skills[0].onStr = "true";
			fresh.on = true;
			fresh.autonomyOpts = [{ label: "Ask first", onStr: "true" }, { label: "Full auto", onStr: "false" }];
			h.newLoader(fresh);
			h.render(adoption === "before response");
			h.reads.shift()();
			await settle();
			const beforeEffect = h.render(false).view;
			assert.deepEqual(beforeEffect.events, ["new message"]);
			if (action === "skill") assert.equal(beforeEffect.skills[0].onStr, "false");
			if (action === "running") assert.equal(beforeEffect.on, false);
			if (action === "autonomy") assert.equal(beforeEffect.autonomyOpts[1].onStr, "true");
			h.commitEffects();
			const view = h.render().view;
			assert.deepEqual(view.events, ["new message"]);
			if (action === "skill") assert.equal(view.skills[0].onStr, "false");
			if (action === "running") assert.equal(view.on, false);
			if (action === "autonomy") assert.equal(view.autonomyOpts[1].onStr, "true");
			assert.equal(h.reads.length, 0);
		});
	}
}

test("a failed-write recovery read cannot replace a newer adopted loader", async () => {
	const h = harness({ failPost: true });
	h.render().toggleSkill("inbox.read", false);
	await settle();
	h.newLoader({ ...h.server, events: ["new message"] });
	h.render();
	h.reads.shift()();
	await settle();
	assert.deepEqual(h.render().view.events, ["new message"]);
	assert.equal(h.render().view.skills[0].onStr, "true");
});

test("a confirming read stays visible over the same loader and an error match", async () => {
	const h = harness();
	h.render().toggleSkill("inbox.read", false);
	await settle();
	h.reads.shift()();
	await settle();
	assert.equal(h.render().view.skills[0].onStr, "false");
	h.newLoader({ ...h.server, skills: [{ id: "inbox.read", onStr: "true" }] }, "error");
	assert.equal(h.render().view.skills[0].onStr, "false");
});

test("a stale route adopted after confirmation preserves the skill and newer messages", async () => {
	const h = harness();
	const captured = structuredClone(h.server);
	h.render().toggleSkill("inbox.read", false);
	await settle();
	h.reads.shift()();
	await settle();
	h.newLoader({ ...captured, events: ["new message"] });
	const beforeEffect = h.render(false).view;
	assert.equal(beforeEffect.skills[0].onStr, "false");
	assert.deepEqual(beforeEffect.events, ["new message"]);
	h.commitEffects();
	assert.equal(h.render().view.skills[0].onStr, "false");
	assert.deepEqual(h.render().view.events, ["new message"]);
});

test("a loader that catches up releases the confirmed patch", async () => {
	const h = harness();
	h.render().toggleSkill("inbox.read", false);
	await settle();
	h.reads.shift()();
	await settle();
	h.newLoader({ ...h.server, events: ["caught up"] });
	assert.equal(h.render().view.skills[0].onStr, "false");
	h.newLoader({ ...h.server, skills: [{ id: "inbox.read", onStr: "true" }], events: ["later change"] });
	assert.equal(h.render().view.skills[0].onStr, "true");
	assert.deepEqual(h.render().view.events, ["later change"]);
});

test("pending writes override confirmed patches and a new confirmation replaces the same key", async () => {
	const h = harness();
	h.render().toggleSkill("inbox.read", false);
	await settle();
	h.reads.shift()();
	await settle();
	h.render().toggleSkill("inbox.read", true);
	assert.equal(h.render().view.skills[0].onStr, "true");
	await settle();
	h.reads.shift()();
	await settle();
	h.newLoader({ ...h.server, skills: [{ id: "inbox.read", onStr: "false" }], events: ["new message"] });
	assert.equal(h.render(false).view.skills[0].onStr, "true");
	h.commitEffects();
	assert.equal(h.render().view.skills[0].onStr, "true");
	assert.deepEqual(h.render().view.events, ["new message"]);
});
