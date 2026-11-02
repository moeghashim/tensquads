import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

let runtime;
const modules = {
	"@tanstack/react-router": ["useMatch", "useNavigate", "useRouter"],
	"@tensquads/adapters/pending-window": ["PENDING_TASK_WINDOW_MS"],
	react: ["useSyncExternalStore"],
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

function harness() {
	const reads = [];
	const posts = [];
	let failNext = false;
	let navigations = 0;
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
	const match = { status: "success" };
	const router = {};
	function post(key, update) {
		const failed = failNext;
		failNext = false;
		if (!failed) update();
		const view = structuredClone(server);
		return new Promise((resolve, reject) => {
			posts.push({ key, answer: () => (failed ? reject(new Error("Write failed")) : resolve(view)) });
		});
	}
	runtime = {
		"@tanstack/react-router": {
			useMatch: () => match,
			useNavigate: () => () => {
				navigations += 1;
			},
			useRouter: () => router,
		},
		react: {
			useSyncExternalStore: (_subscribe, snapshot) => snapshot(),
		},
		"#/server/agent-detail.ts": {
			loadAgentDetail: () =>
				new Promise((resolve, reject) => {
					const view = structuredClone(server);
					reads.push({ answer: () => resolve(view), fail: () => reject(new Error("Read failed")) });
				}),
			setSkillEnabled: ({ data }) =>
				post("skill", () => {
					server.skills[0].onStr = String(data.on);
				}),
			setAgentRunning: ({ data }) =>
				post("running", () => {
					server.on = data.on;
				}),
			setAgentAutonomy: ({ data }) =>
				post("autonomy", () => {
					server.autonomyOpts = server.autonomyOpts.map((option) => ({
						...option,
						onStr: String(option.label === data.autonomy),
					}));
				}),
			askAgentRevise: () => post("revise", () => undefined),
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
	function render() {
		return useAgentWrites(loader);
	}
	return {
		render,
		reads,
		posts,
		server,
		failNextPost() {
			failNext = true;
		},
		navigations: () => navigations,
		newLoader(view, status = "success") {
			loader = structuredClone(view);
			match.status = status;
		},
	};
}

async function settle() {
	for (let step = 0; step < 100; step++) await Promise.resolve();
}

for (const action of ["skill", "running", "autonomy", "revise"]) {
	test(`${action} response supplies the snapshot without a confirmation read`, async () => {
		const h = harness();
		const control = h.render();
		if (action === "skill") control.toggleSkill("inbox.read", false);
		if (action === "running") control.toggleAgent(false);
		if (action === "autonomy") control.pickAutonomy("Full auto");
		if (action === "revise") {
			control.askRevise();
			assert.equal(h.navigations(), 1);
		}
		await settle();
		assert.equal(h.posts.length, 1);
		h.posts.shift().answer();
		await settle();
		assert.equal(h.reads.length, 0);
		const view = h.render().view;
		if (action === "skill") assert.equal(view.skills[0].onStr, "false");
		if (action === "running") assert.equal(view.on, false);
		if (action === "autonomy") assert.equal(view.autonomyOpts[1].onStr, "true");
		h.newLoader({ ...h.server, events: ["new message"] });
		assert.deepEqual(h.render().view.events, ["new message"]);
		h.newLoader({ ...h.server, events: ["error"] }, "error");
		assert.deepEqual(h.render().view.events, ["new message"]);
	});
}

test("a held successful on response survives a queued failed off write", async (t) => {
	t.mock.timers.enable({ apis: ["setTimeout"] });
	const h = harness();
	h.render().toggleSkill("inbox.read", false);
	await settle();
	h.posts.shift().answer();
	await settle();
	assert.equal(h.render().view.skills[0].onStr, "false");
	h.render().toggleSkill("inbox.read", true);
	await settle();
	assert.equal(h.server.skills[0].onStr, "true");
	h.failNextPost();
	h.render().toggleSkill("inbox.read", false);
	assert.equal(h.render().view.skills[0].onStr, "false");
	h.posts.shift().answer();
	await settle();
	h.posts.shift().answer();
	await settle();
	assert.equal(h.reads.length, 1);
	h.reads.shift().answer();
	await settle();
	assert.equal(h.render().view.skills[0].onStr, "true");
	assert.equal(h.server.skills[0].onStr, "true");
	t.mock.timers.tick(60_001);
	await settle();
	assert.equal(h.render().view.skills[0].onStr, "true");
	assert.equal(h.reads.length, 0);
});

test("only unsent values coalesce and in-flight responses still update the snapshot", async () => {
	const h = harness();
	h.render().toggleSkill("inbox.read", false);
	await settle();
	for (const on of [true, false, true]) h.render().toggleSkill("inbox.read", on);
	for (const autonomy of ["Full auto", "Ask first"]) h.render().pickAutonomy(autonomy);
	for (const on of [false, true, false]) h.render().toggleAgent(on);
	const sent = [];
	for (let index = 0; index < 4; index++) {
		sent.push(h.posts[0].key);
		h.posts.shift().answer();
		await settle();
	}
	assert.deepEqual(sent, ["skill", "skill", "autonomy", "running"]);
	assert.equal(h.posts.length, 0);
	assert.equal(h.reads.length, 0);
	const view = h.render().view;
	assert.equal(view.skills[0].onStr, "true");
	assert.equal(view.autonomyOpts[0].onStr, "true");
	assert.equal(view.on, false);
});

for (const outcome of ["failure", "timeout"]) {
	test(`a timed-out POST permits the next write and its recovery ${outcome} does not loop`, async (t) => {
		t.mock.timers.enable({ apis: ["setTimeout"] });
		const h = harness();
		h.render().toggleSkill("inbox.read", false);
		await settle();
		h.render().toggleAgent(false);
		t.mock.timers.tick(30_001);
		await settle();
		assert.equal(h.posts.length, 2);
		assert.equal(h.reads.length, 1);
		if (outcome === "failure") h.reads.shift().fail();
		h.posts[1].answer();
		await settle();
		assert.equal(h.render().view.on, false);
		t.mock.timers.tick(90_001);
		await settle();
		assert.equal(h.reads.length, outcome === "failure" ? 0 : 1);
		h.posts[0].answer();
		await settle();
		assert.equal(h.render().view.on, false);
	});
}

test("pending writes survive a fresh loader and keep the on/off display formula", async () => {
	const h = harness();
	h.server.storedCpu = "";
	h.server.storedUptime = "";
	h.newLoader(h.server);
	h.render().toggleAgent(false);
	await settle();
	assert.equal(h.render().view.cpu, "0%");
	assert.equal(h.render().view.uptime, "Paused");
	h.render().toggleAgent(true);
	h.newLoader({ ...h.server, events: ["new message"] });
	assert.equal(h.render().view.cpu, "—");
	assert.equal(h.render().view.uptime, "—");
	assert.deepEqual(h.render().view.events, ["new message"]);
	h.posts.shift().answer();
	await settle();
	h.posts.shift().answer();
	await settle();
	assert.equal(h.render().view.on, true);
});
