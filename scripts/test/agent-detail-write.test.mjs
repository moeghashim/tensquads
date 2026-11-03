import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

globalThis.window = {};

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
const { agentSession, stampAgentRead, stampAgentReads, applyAgentOn, agentOnSnapshot, resetAgentClientState } =
	await import("../../apps/web/src/workspace/agent-on.ts");

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
		autonomyOpts: [
			{ label: "Ask first", onStr: "true" },
			{ label: "Full auto", onStr: "false" },
		],
	};
	let loader = structuredClone(server);
	let stamped;
	let loaderSession = agentSession();
	const match = { status: "success" };
	const router = {};
	function post(key, update) {
		const failed = failNext;
		failNext = false;
		if (!failed) update();
		const view = structuredClone(server);
		return new Promise((resolve, reject) => {
			posts.push({
				key,
				answer: () => (failed ? reject(new Error("Write failed")) : resolve(view)),
				lose: () => reject(new Error("Response lost")),
			});
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
		return useAgentWrites(loader, stamped ?? stampAgentRead(loader.id), loaderSession);
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
		newLoader(view, status = "success", readAt, session = agentSession()) {
			loaderSession = session;
			loader = structuredClone(view);
			match.status = status;
			stamped = readAt;
		},
	};
}

function sameControls(view, server) {
	assert.equal(view.on, server.on);
	assert.deepEqual(view.skills, server.skills);
	assert.deepEqual(
		view.autonomyOpts.map((option) => option.onStr),
		server.autonomyOpts.map((option) => option.onStr),
	);
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

for (const action of ["running", "skill", "autonomy", "revise"]) {
	test(`a held recovery cannot replace a later successful ${action} response`, async (t) => {
		t.mock.timers.enable({ apis: ["setTimeout"] });
		const h = harness();
		h.failNextPost();
		h.render().toggleAgent(false);
		await settle();
		h.posts.shift().answer();
		await settle();
		assert.equal(h.reads.length, 1);
		assert.equal(h.render().view.on, true);
		h.server.events = ["post response"];
		const control = h.render();
		if (action === "running") control.toggleAgent(false);
		if (action === "skill") control.toggleSkill("inbox.read", false);
		if (action === "autonomy") control.pickAutonomy("Full auto");
		if (action === "revise") control.askRevise();
		await settle();
		h.posts.shift().answer();
		await settle();
		h.reads.shift().answer();
		await settle();
		const view = h.render().view;
		assert.deepEqual(view.events, ["post response"]);
		if (action === "running") assert.equal(view.on, false);
		if (action === "skill") assert.equal(view.skills[0].onStr, "false");
		if (action === "autonomy") assert.equal(view.autonomyOpts[1].onStr, "true");
		t.mock.timers.tick(30_001);
		await settle();
		assert.deepEqual(h.render().view.events, ["post response"]);
		assert.equal(h.reads.length, 0);
	});
}

for (const outcome of ["answer", "fail", "timeout"]) {
	test(`one recovery read runs at a time and a ${outcome} permits a later recovery`, async (t) => {
		t.mock.timers.enable({ apis: ["setTimeout"] });
		const h = harness();
		for (let index = 0; index < 2; index++) {
			h.failNextPost();
			h.render().toggleAgent(false);
			await settle();
			h.posts.shift().answer();
			await settle();
		}
		assert.equal(h.reads.length, 1);
		const read = h.reads.shift();
		if (outcome === "timeout") t.mock.timers.tick(30_001);
		else read[outcome]();
		await settle();
		h.failNextPost();
		h.render().toggleAgent(false);
		await settle();
		h.posts.shift().answer();
		await settle();
		assert.equal(h.reads.length, 1);
		h.reads.shift().answer();
		await settle();
	});
}

for (const action of ["running", "skill", "autonomy"]) {
	test(`a read started before a successful ${action} write does not replace it`, async () => {
		const h = harness();
		const readAt = stampAgentRead("support");
		const old = structuredClone(h.server);
		const control = h.render();
		if (action === "running") control.toggleAgent(false);
		if (action === "skill") control.toggleSkill("inbox.read", false);
		if (action === "autonomy") control.pickAutonomy("Full auto");
		await settle();
		h.posts.shift().answer();
		await settle();
		h.newLoader(old, "success", readAt);
		sameControls(h.render().view, h.server);
	});

	test(`a read started before a successful ${action} write does not replace it after a timeout`, async (t) => {
		t.mock.timers.enable({ apis: ["setTimeout"] });
		const h = harness();
		h.render().toggleSkill("inbox.read", false);
		await settle();
		t.mock.timers.tick(30_001);
		await settle();
		h.reads.shift().answer();
		await settle();
		const readAt = stampAgentRead("support");
		const old = structuredClone(h.server);
		const control = h.render();
		if (action === "running") control.toggleAgent(false);
		if (action === "skill") control.toggleSkill("inbox.read", true);
		if (action === "autonomy") control.pickAutonomy("Full auto");
		await settle();
		h.posts.at(-1).answer();
		await settle();
		h.newLoader(old, "success", readAt);
		sameControls(h.render().view, h.server);
	});
}

test("a recovery read started before a later lost response does not satisfy that failure", async () => {
	const h = harness();
	h.failNextPost();
	h.render().toggleAgent(false);
	await settle();
	h.posts.shift().answer();
	await settle();
	assert.equal(h.reads.length, 1);
	h.render().toggleSkill("inbox.read", false);
	await settle();
	assert.equal(h.server.skills[0].onStr, "false");
	h.posts.shift().lose();
	await settle();
	h.reads.shift().answer();
	await settle();
	assert.equal(h.reads.length, 1);
	h.reads.shift().answer();
	await settle();
	assert.equal(h.render().view.skills[0].onStr, "false");
	assert.equal(h.reads.length, 0);
});

test("a pre-write loader started after queued skill and autonomy clicks cannot replace their responses", async () => {
	const h = harness();
	const control = h.render();
	control.toggleSkill("inbox.read", false);
	control.pickAutonomy("Full auto");
	const readAt = stampAgentRead("support");
	const old = structuredClone(h.server);
	await settle();
	assert.equal(h.posts.length, 1);
	h.posts.shift().answer();
	await settle();
	assert.equal(h.posts[0].key, "autonomy");
	h.posts.shift().answer();
	await settle();
	h.newLoader(old, "success", readAt);
	const view = h.render().view;
	assert.equal(view.skills[0].onStr, "false");
	assert.equal(view.autonomyOpts[1].onStr, "true");
	sameControls(view, h.server);
	assert.equal(h.reads.length, 0);
});

for (const action of ["running", "skill", "autonomy"]) {
	for (const outcome of ["lost response", "timeout"]) {
		test(`an old ${action} loader cannot undo recovery after a ${outcome}`, async (t) => {
			t.mock.timers.enable({ apis: ["setTimeout"] });
			const h = harness();
			const control = h.render();
			if (action === "running") control.toggleAgent(false);
			if (action === "skill") control.toggleSkill("inbox.read", false);
			if (action === "autonomy") control.pickAutonomy("Full auto");
			const readAt = stampAgentRead("support");
			const old = structuredClone(h.server);
			await settle();
			if (outcome === "timeout") t.mock.timers.tick(30_001);
			else h.posts[0].lose();
			await settle();
			assert.equal(h.reads.length, 1);
			h.reads.shift().answer();
			await settle();
			sameControls(h.render().view, h.server);
			h.newLoader(old, "success", readAt);
			sameControls(h.render().view, h.server);
			assert.equal(h.reads.length, 0);
		});
	}
}

for (const on of [false, true]) {
	test(`an older frame keeps accepted ${on} and a later frame accepts server ${!on}`, async () => {
		const h = harness();
		h.server.on = !on;
		h.newLoader(h.server);
		h.render();
		const readAt = stampAgentReads();
		const old = [
			{ id: "support", on: !on },
			{ id: "inventory", on: false },
		];
		h.render().toggleAgent(on);
		await settle();
		h.posts.shift().answer();
		await settle();
		assert.deepEqual(applyAgentOn(old, agentOnSnapshot(), readAt), [
			{ id: "support", on },
			{ id: "inventory", on: false },
		]);
		const laterReadAt = stampAgentReads();
		const later = [
			{ id: "support", on: !on },
			{ id: "inventory", on: true },
		];
		assert.equal(applyAgentOn(later, agentOnSnapshot(), laterReadAt), later);
	});
}

test("a reset drops published and pending state, and a late response cannot publish it", async () => {
	const h = harness();
	h.render().toggleAgent(false);
	await settle();
	h.posts.shift().answer();
	await settle();
	assert.equal(agentOnSnapshot().get("support"), false);
	h.render().toggleSkill("inbox.read", false);
	await settle();
	assert.equal(h.render().view.skills[0].onStr, "false");
	const late = h.posts[0];
	resetAgentClientState();
	assert.equal(agentOnSnapshot().size, 0);
	const next = harness();
	next.newLoader(next.server, "success", 0);
	assert.equal(next.render().view.on, true);
	assert.equal(next.render().view.skills[0].onStr, "true");
	late.answer();
	await settle();
	assert.equal(next.render().view.on, true);
	assert.equal(next.render().view.skills[0].onStr, "true");
	assert.equal(agentOnSnapshot().has("support"), false);
	assert.equal(h.server.on, false);
	assert.equal(h.server.skills[0].onStr, "false");
	assert.equal(next.server.on, true);
	assert.equal(next.server.skills[0].onStr, "true");
});

for (const outcome of ["success", "recovery"]) {
	test(`mounted old-session data and a late ${outcome} cannot seed the next account`, async () => {
		const h = harness();
		const previousSession = agentSession();
		const oldLoader = structuredClone(h.server);
		h.render().toggleAgent(false);
		await settle();
		if (outcome === "recovery") {
			h.posts.shift().lose();
			await settle();
		}
		resetAgentClientState();
		assert.equal(h.render(), null);
		h.newLoader({ ...oldLoader, events: ["account B message"], mission: "account B mission" }, "success", 0);
		assert.equal(h.render().view.on, true);
		assert.equal(h.render().view.mission, "account B mission");
		if (outcome === "recovery") h.reads.shift().answer();
		else h.posts.shift().answer();
		await settle();
		assert.equal(agentOnSnapshot().size, 0);
		assert.deepEqual(h.render().view.events, ["account B message"]);
		h.newLoader(oldLoader, "success", 0, previousSession);
		assert.equal(h.render(), null);
	});
}

test("SSR renders do not reuse persistent client queues", () => {
	const browserWindow = globalThis.window;
	delete globalThis.window;
	try {
		const h = harness();
		assert.deepEqual(h.render().view.events, ["old message"]);
		h.newLoader({ ...h.server, events: ["new request"] }, "success", -1);
		assert.deepEqual(h.render().view.events, ["new request"]);
	} finally {
		globalThis.window = browserWindow;
	}
});
