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
	async change(received, deadlineAt, change) {
		assert.deepEqual(received, scope);
		state.deadlines.push(deadlineAt);
		state.now += state.writeDelay;
		if (state.now >= deadlineAt) throw new Error("The workspace write did not finish.");
		change();
	}
	setAgentOn(received, _id, on, deadlineAt) {
		return this.change(received, deadlineAt, () => {
			state.agent.on = on;
		});
	}
	setSkillOn(received, _id, _skill, on, deadlineAt) {
		return this.change(received, deadlineAt, () => {
			state.agent.skills[0].on = on;
		});
	}
	setAutonomy(received, _id, autonomy, deadlineAt) {
		return this.change(received, deadlineAt, () => {
			state.agent.autonomy = autonomy;
		});
	}
	askRevise(received, _id, deadlineAt) {
		return this.change(received, deadlineAt, () => {
			state.agent.mission = "Revision requested";
		});
	}
}
const exports = {
	"@tanstack/react-router": { redirect: (options) => options },
	"@tanstack/react-start": {
		createServerFn: () => ({
			validator: (validate) => ({ handler: (run) => ({ data }) => run({ data: validate(data) }) }),
		}),
	},
	"@tensquads/adapters/pending-window": { PENDING_TASK_WINDOW_MS: 30_000 },
	"@tensquads/kernel": { Kernel: TestKernel },
	"@tensquads/adapters": {
		createRepositories: repositories,
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
		deadlines: [],
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

const writes = [
	["setAgentRunning", { agentId: "support", on: false }, (view) => assert.equal(view.on, false)],
	[
		"setSkillEnabled",
		{ agentId: "support", skillId: "inbox.read", on: false },
		(view) => assert.equal(view.skills[0].onStr, "false"),
	],
	[
		"setAgentAutonomy",
		{ agentId: "support", autonomy: "Full auto" },
		(view) => assert.equal(view.autonomyOpts[2].onStr, "true"),
	],
	["askAgentRevise", "support", (view) => assert.equal(view.missionText, "Revision requested")],
];
for (const [name, data, check] of writes) {
	test(`${name} returns its updated scoped view in the POST response`, async (t) => {
		setup(t);
		const view = await server[name]({ data });
		check(view);
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
		server.setAgentRunning({ data: { agentId: "support", on: false } }),
		/The workspace write did not finish/,
	);
	assert.deepEqual(state.deadlines, [31_000]);
});
