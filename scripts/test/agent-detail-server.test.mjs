import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";

let state;
const scope = { accountId: "test-account", mode: "account" };
function repositories() {
	const scoped = (run) => async (received) => {
		assert.deepEqual(received, scope);
		return run();
	};
	return {
		squads: {
			listAgents: scoped(() => {
				state.loads += 1;
				state.now += state.loadDelay;
				return [state.agent];
			}),
			master: scoped(() => ({ name: "Master" })),
		},
		platform: { listAccounts: scoped(() => [{ id: scope.accountId, mission: "Company mission" }]) },
		bus: { listEvents: scoped(() => []) },
	};
}
class TestKernel {
	async change(received, fence, deadlineAt, change) {
		assert.deepEqual(received, scope);
		assert.equal(typeof fence.tab, "string");
		assert.equal(fence.seq >= 1, true);
		state.fences.push(fence);
		state.deadlines.push(deadlineAt);
		state.now += state.writeDelay;
		if (state.now >= deadlineAt) throw new Error("The workspace write did not finish.");
		change();
		return { status: "written" };
	}
	setAgentOn(received, _id, on, fence, deadlineAt) {
		return this.change(received, fence, deadlineAt, () => {
			state.agent.on = on;
		});
	}
	setSkillOn(received, _id, _skill, on, fence, deadlineAt) {
		return this.change(received, fence, deadlineAt, () => {
			state.agent.skills[0].on = on;
		});
	}
	setAutonomy(received, _id, autonomy, fence, deadlineAt) {
		return this.change(received, fence, deadlineAt, () => {
			state.agent.autonomy = autonomy;
		});
	}
	askRevise(received, _id, deadlineAt) {
		assert.deepEqual(received, scope);
		state.deadlines.push(deadlineAt);
		state.now += state.writeDelay;
		if (state.now >= deadlineAt) throw new Error("The workspace write did not finish.");
		state.agent.mission = "Revision requested";
	}
}
const exports = {
	"@tanstack/react-router": { redirect: (options) => options },
	"@tanstack/react-start": {
		createServerFn: () => ({
			validator: (validate) => ({
				handler:
					(run) =>
					({ data }) =>
						run({ data: validate(data) }),
			}),
		}),
	},
	"@tensquads/adapters/pending-window": { PENDING_TASK_WINDOW_MS: 30_000 },
	"@tensquads/kernel": { Kernel: TestKernel },
	"@tensquads/adapters": {
		createRepositories: repositories,
		chooseAdapters: (flag) => (flag === "real" ? "real" : "test"),
		switchingMachine: () => undefined,
		switchAgentMachine: (_machine, _scope, _agentId, persist) => persist(),
		readLiveMachine: async () => {
			state.liveReads += 1;
			if (state.boatStatus === 503) throw Object.assign(new Error("unavailable"), { status: 503 });
			return state.liveMachine;
		},
		createTestMachine: ([row]) =>
			Object.fromEntries(
				["host", "region", "size", "cpu", "uptime", "egress", "secrets"].map((key) => [key, () => row[key]]),
			),
	},
	"./workspace-session.ts": {
		requireWorkspace: async (run) => {
			state.now += state.accountDelay;
			return run(scope, {});
		},
	},
	"#/workspace/event-view.ts": { decorate: (event) => event },
};
globalThis.agentServerTestExports = exports;
registerHooks({
	resolve(specifier, context, nextResolve) {
		if (!exports[specifier]) return nextResolve(specifier, context);
		const source = Object.keys(exports[specifier])
			.map(
				(name) =>
					`export const ${name} = globalThis.agentServerTestExports[${JSON.stringify(specifier)}][${JSON.stringify(name)}];`,
			)
			.join("\n");
		return { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true };
	},
});
const server = await import("../../apps/web/src/server/agent-detail.ts");

function setup(t, options = {}) {
	state = {
		now: 1000,
		loads: 0,
		liveReads: 0,
		liveMachine: null,
		boatStatus: 0,
		deadlines: [],
		fences: [],
		accountDelay: 0,
		writeDelay: 0,
		loadDelay: 0,
		agent: {
			id: "support",
			name: "Support",
			role: "Support",
			tint: "#def5ee",
			on: true,
			autonomy: "Ask first",
			mission: "Initial mission",
			contribution: 0,
			targets: [],
			kpis: [],
			skills: [{ id: "inbox.read", on: true, desc: "Read inbox", gate: "Auto", runs: 0 }],
			host: "machine",
			region: "test",
			size: "small",
			cpu: "22%",
			uptime: "18 days",
			egress: [],
			secrets: [],
		},
		...options,
	};
	const original = Date.now;
	Date.now = () => state.now;
	t.after(() => {
		Date.now = original;
	});
}

const fence = { tab: "tab-1", seq: 1, retires: [] };
const accountId = scope.accountId;
const writes = [
	["setAgentRunning", { accountId, agentId: "support", on: false, ...fence }, (view) => assert.equal(view.on, false)],
	[
		"setSkillEnabled",
		{ accountId, agentId: "support", skillId: "inbox.read", on: false, ...fence },
		(view) => assert.equal(view.skills[0].onStr, "false"),
	],
	[
		"setAgentAutonomy",
		{ accountId, agentId: "support", autonomy: "Full auto", ...fence },
		(view) => assert.equal(view.autonomyOpts[2].onStr, "true"),
	],
	[
		"askAgentRevise",
		{ accountId, agentId: "support" },
		(view) => assert.equal(view.missionText, "Revision requested"),
	],
];
for (const [name, data, check] of writes) {
	test(`${name} returns its updated scoped view in the POST response`, async (t) => {
		setup(t);
		const result = await server[name]({ data });
		if (name === "askAgentRevise") {
			check(result);
			assert.equal(state.fences.length, 0);
		} else {
			assert.equal(result.status, "written");
			check(result.row);
			assert.equal(state.fences.length, 1);
		}
		assert.equal(state.loads, 1);
		assert.deepEqual(state.deadlines, [31_000]);
	});
	test(`${name} cannot write after the account read exhausts the deadline`, async (t) => {
		setup(t, { accountDelay: 65_000 });
		await assert.rejects(server[name]({ data }), /The workspace write did not finish/);
		assert.deepEqual(state.deadlines, []);
		assert.equal(state.loads, 0);
	});
}

test("the response load does not get a fresh deadline", async (t) => {
	setup(t, { writeDelay: 29_000, loadDelay: 2000 });
	await assert.rejects(
		server.setAgentRunning({ data: { accountId, agentId: "support", on: false, ...fence } }),
		/The workspace write did not finish/,
	);
	assert.deepEqual(state.deadlines, [31_000]);
});

test("an invalid fence does not call the kernel", async (t) => {
	setup(t);
	assert.throws(
		() => server.setAgentRunning({ data: { agentId: "support", on: false, tab: " ", seq: 1, retires: [] } }),
		/The write fence is not valid/,
	);
	assert.deepEqual(state.deadlines, []);
	assert.equal(state.fences.length, 0);
	assert.equal(state.loads, 0);
	assert.equal(state.agent.on, true);
});

test("real mode reads host, cpu, and uptime for the real-run agents", async (t) => {
	const previous = process.env.ADAPTERS;
	t.after(() => {
		if (previous === undefined) delete process.env.ADAPTERS;
		else process.env.ADAPTERS = previous;
	});
	process.env.ADAPTERS = "real";
	setup(t, {
		liveMachine: { host: "vps-market-01", cpu: "20%", uptime: "3 days" },
		agent: {
			id: "market",
			name: "Market",
			role: "Research",
			tint: "#def5ee",
			on: true,
			autonomy: "Ask first",
			mission: "Initial mission",
			contribution: 0,
			targets: [],
			kpis: [],
			skills: [],
			host: "machine",
			region: "test",
			size: "small",
			cpu: "22%",
			uptime: "18 days",
			egress: ["kept.example"],
			secrets: ["kept-secret"],
		},
	});
	const view = await server.loadAgentDetail({ data: "market" });
	assert.equal(view.host, "vps-market-01");
	assert.equal(view.cpu, "20%");
	assert.equal(view.uptime, "3 days");
	assert.equal(view.region, "test");
	assert.equal(view.size, "small");
	assert.deepEqual(view.egress, ["kept.example"]);
	assert.deepEqual(view.secrets, ["kept-secret"]);
	assert.equal(state.liveReads, 1);

	state.agent.id = "support";
	state.liveReads = 0;
	const design = await server.loadAgentDetail({ data: "support" });
	assert.equal(design.host, "machine");
	assert.equal(design.cpu, "22%");
	assert.equal(state.liveReads, 0);

	state.agent.id = "market";
	state.agent.on = false;
	state.liveReads = 0;
	const paused = await server.loadAgentDetail({ data: "market" });
	assert.equal(paused.cpu, "0%");
	assert.equal(paused.uptime, "Paused");
	assert.equal(paused.region, "test");
	state.agent.on = true;

	process.env.ADAPTERS = "test";
	state.agent.id = "market";
	const stored = await server.loadAgentDetail({ data: "market" });
	assert.equal(stored.host, "machine");
	assert.equal(stored.cpu, "22%");
	assert.equal(state.liveReads, 0);
});

test("a boat 503 shows dashes for host, cpu, and uptime", async (t) => {
	const previous = process.env.ADAPTERS;
	t.after(() => {
		if (previous === undefined) delete process.env.ADAPTERS;
		else process.env.ADAPTERS = previous;
	});
	process.env.ADAPTERS = "real";
	setup(t, {
		boatStatus: 503,
		agent: {
			id: "market",
			name: "Market",
			role: "Research",
			tint: "#def5ee",
			on: true,
			autonomy: "Ask first",
			mission: "Initial mission",
			contribution: 0,
			targets: [],
			kpis: [],
			skills: [],
			host: "machine",
			region: "test",
			size: "small",
			cpu: "22%",
			uptime: "18 days",
			egress: ["kept.example"],
			secrets: ["kept-secret"],
		},
	});
	const view = await server.loadAgentDetail({ data: "market" });
	assert.equal(view.host, "—");
	assert.equal(view.cpu, "—");
	assert.equal(view.uptime, "—");
	assert.equal(view.region, "test");
	assert.equal(view.size, "small");
	assert.deepEqual(view.egress, ["kept.example"]);
	assert.deepEqual(view.secrets, ["kept-secret"]);
	assert.equal(state.liveReads, 1);
});
