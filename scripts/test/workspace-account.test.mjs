import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";
import { setImmediate } from "node:timers/promises";
import { isRedirect } from "@tanstack/react-router";

const root = new URL("../../", import.meta.url);
const web = new URL("apps/web/src/", root);
const state = {
	admin: true,
	target: "demo",
	owner: "demo",
	writes: [],
	store: {},
	closed: 0,
	refreshError: null,
	sessionError: null,
	readGate: null,
	holdWrite: null,
	holdAccount: "",
	limitWrite: null,
};
globalThis.workspaceAccountTest = state;
const mocks = {
	"@tanstack/react-start": `export function createServerFn() {
		let validate = (input) => input;
		return { validator(fn) { validate = fn; return this; },
			handler(fn) { return async (options = {}) => fn({ data: validate(options.data) }); } };
	}`,
	react: `export const useSyncExternalStore = () => {};
		export const createContext = () => ({});
		export const useContext = () => globalThis.workspaceAccountTest.workspace;
		export const useRef = (current) => ({ current });`,
	"@tensquads/adapters": `const state = globalThis.workspaceAccountTest;
		export const chooseAdapters = (flag) => flag === "real" ? "real" : "test";
		export const switchingMachine = () => undefined;
		export const switchAgentMachine = (_machine, _scope, _agentId, persist) => persist();
		export const createCloudflareBus = () => ({});
		export const trafficScript = () => [];
		export const openPostgres = () => ({ db: {}, close: async () => { state.closed++; } });
		export const accountForClerkUser = async () => ({ id: state.owner });
		export const createRepositories = () => ({
			platform: { listAccounts: async () => [{ id: 'demo' }, { id: 'northwind' }] },
			policy: { listRules: async () => [] },
			squads: { listAgents: async () => [], master: async () => ({ name: "Master" }) },
			bus: { readStore: async () => {
				if (state.readGate) { const gate = state.readGate; state.readGate = null; await gate; }
				if (state.refreshError) throw state.refreshError;
				if (state.failRules) throw new Error("Read failed");
				return state.store;
			}, listEvents: async () => [] },
		});
		export const readOverviewSnapshot = async (_, scope) => ({
			accounts: [{ id: scope.accountId, owner: 'Moe', mission: '' }], agents: [], tasksDone: 0,
			master: { name: 'Master' }, stored: [], revenue: [],
			inbox: { count: 0, empty: true, emptyText: '', proposals: [], approvals: [] },
		});`,
	"@tensquads/kernel": `export class Kernel {
		constructor() { return new Proxy(this, { get: (_, method) => async (scope) => {
			const state = globalThis.workspaceAccountTest;
			if (method === "setLimit" && state.holdWrite && scope.accountId === state.holdAccount) {
				const held = state.holdWrite;
				state.holdWrite = null;
				await held;
			}
			state.writes.push({ method, accountId: scope.accountId });
			if (method === "setLimit" && state.limitWrite) return state.limitWrite;
			return { count: 0 };
		} }); }
	}`,
	"./session.ts":
		"export const requireClerkUser = async () => 'owner'; export const requireClerkSession = async () => { if (globalThis.workspaceAccountTest.sessionError) throw globalThis.workspaceAccountTest.sessionError; return { userId: 'owner', organizationId: null, role: null }; };",
	"./super-admin.ts": "export const isSuperAdmin = async () => globalThis.workspaceAccountTest.admin;",
	"./database-url.ts": "export const databaseUrl = async () => 'test';",
	"./special-session.ts": "export const readSpecialAccount = () => globalThis.workspaceAccountTest.target;",
	"./platform-scope.ts": "export const withPlatform = async (work) => work({ mode: 'platform' }, {});",
};
const hooks = registerHooks({
	resolve(specifier, context, nextResolve) {
		if (Object.hasOwn(mocks, specifier)) return { url: `test:${specifier}`, shortCircuit: true };
		if (specifier.startsWith("#/")) return { url: new URL(specifier.slice(2), web).href, shortCircuit: true };
		if (specifier === "@tensquads/adapters/pending-window") {
			return { url: new URL("packages/adapters/src/pending-window.ts", root).href, shortCircuit: true };
		}
		if (specifier === "@tensquads/domain") {
			return { url: new URL("packages/domain/src/index.ts", root).href, shortCircuit: true };
		}
		return nextResolve(specifier, context);
	},
	load(url, context, nextLoad) {
		if (url.startsWith("test:")) return { format: "module", source: mocks[url.slice(5)], shortCircuit: true };
		return nextLoad(url, context);
	},
});

const rules = await import(new URL("server/rules.ts", web));
const agent = await import(new URL("server/agent-detail.ts", web));
const { SessionRefreshNeeded } = await import(new URL("server/session-error.ts", web));
const overview = await import(new URL("server/overview.ts", web));
const chat = await import(new URL("server/workspace.ts", web));
const traffic = await import(new URL("server/traffic.ts", web));
const { requireWorkspace } = await import(new URL("server/workspace-session.ts", web));
const { limitDefinitions } = await import(new URL("packages/domain/src/policy/rule-commands.ts", root));
const queue = await import(new URL("screens/rules/write-queue.ts", web));
await import(new URL("screens/agent-detail/write.ts", web));
const { publishAgentOn, agentOnSnapshot, resetAgentClientState } = await import(new URL("workspace/agent-on.ts", web));
const decisions = await import(new URL("screens/overview/actions.ts", web));
const { nextWriteFence } = await import(new URL("write-fence.ts", web));
const { useWorkspacePage } = await import(new URL("workspace/context.ts", web));
const { loadRulesSnapshot } = await import(new URL("screens/rules/loader.ts", web));
const { clearOverviewHold, loadHeldOverview, overviewEpoch } = await import(new URL("screens/overview/load.ts", web));
const { clearFrameHold, loadHeldFrame, frameEpoch } = await import(new URL("workspace/frame-load.ts", web));
const { currentWrites, advanceWrites, overviewMatchStamp } = await import(new URL("workspace/approval-count.ts", web));
const writes = [
	(accountId) => rules.setRuleEnabled({ data: { accountId, id: "r1", on: false, tab: "tab", seq: 1 } }),
	(accountId) =>
		rules.setRuleLimit({ data: { accountId, key: "policy.daily_ad_cap", value: 200, tab: "tab", seq: 2 } }),
	(accountId) =>
		rules.addWorkspaceRule({ data: { accountId, when: "When", agent: "orders", action: "Then", approval: "Auto" } }),
	(accountId) => overview.decideOverview({ data: { accountId, id: "ap1", ok: true } }),
	(accountId) => overview.decideMissionOverview({ data: { accountId, id: "mp1", ok: false } }),
	(accountId) => chat.beginWorkspaceSend({ data: { accountId, text: "Hello" } }),
	(accountId) => chat.finishWorkspaceSend({ data: { accountId, text: "task1" } }),
	(accountId) => traffic.advanceTraffic({ data: accountId }),
];

test("all workspace writes reject stale or absent displayed accounts and accept the resolved account", async () => {
	for (const admin of [true, false]) {
		state.admin = admin;
		state.target = admin ? "northwind" : "demo";
		state.owner = "northwind";
		for (const write of writes) {
			state.writes = [];
			await assert.rejects(write("demo"), /The workspace write did not finish/);
			assert.deepEqual(state.writes, []);
			await assert.rejects(write(undefined));
			assert.deepEqual(state.writes, []);
			await write("northwind");
			assert.equal(state.writes.length, 1);
			assert.equal(state.writes[0].accountId, "northwind");
		}
	}
});

test("workspace reads retain the resolved scope", async () => {
	state.admin = true;
	state.target = "northwind";
	assert.equal(await requireWorkspace(async (scope) => scope.accountId), "northwind");
	state.admin = false;
	state.owner = "demo";
	assert.equal(await requireWorkspace(async (scope) => scope.accountId), "demo");
});

test("missing policy values yield no limits while three stored values yield three sliders", async () => {
	state.store = {};
	assert.deepEqual((await rules.loadRulesPage()).limits, []);
	const stored = Object.fromEntries(limitDefinitions.map((definition, index) => [definition.key, index + 1]));
	for (const definition of limitDefinitions) {
		state.store = { ...stored };
		delete state.store[definition.key];
		assert.deepEqual((await rules.loadRulesPage()).limits, []);
	}
	state.store = stored;
	assert.deepEqual(
		(await rules.loadRulesPage()).limits.map((limit) => limit.value),
		[1, 2, 3],
	);
	assert.deepEqual(state.store, stored);
});

test("a held rules limit does not land after the frame account changes", async () => {
	globalThis.window = {};
	let release = () => {};
	try {
		clearFrameHold();
		queue.resetTargetAccount();
		state.admin = true;
		state.target = "demo";
		state.holdAccount = "demo";
		state.limitWrite = { status: "written", row: { key: "policy.daily_ad_cap", value: 260 } };
		const frame = (accountId) => ({
			accountId,
			accountName: accountId,
			owner: "Moe",
			masterName: "Master",
			squadCount: 1,
			superAdmin: true,
			agents: [],
			approvalCount: 0,
			messages: [],
		});
		await loadHeldFrame(frameEpoch(), currentWrites(), async () => frame("demo"));
		state.holdWrite = new Promise((resolve) => {
			release = resolve;
		});
		queue.queueLimit("policy.daily_ad_cap", 260, "demo", async () => {});
		await setImmediate();
		assert.equal(queue.shownLimit("policy.daily_ad_cap", 200), 260);
		state.target = "northwind";
		await loadHeldFrame(frameEpoch(), currentWrites(), async () => frame("northwind"));
		assert.equal(queue.shownLimit("policy.daily_ad_cap", 200), 200);
		release();
		await setImmediate();
		await setImmediate();
		assert.equal(queue.shownLimit("policy.daily_ad_cap", 200), 200);
		assert.deepEqual(queue.rulesWrittenSince(0), { rules: [], limits: [] });
	} finally {
		release();
		state.holdWrite = null;
		state.holdAccount = "";
		state.limitWrite = null;
		state.target = "demo";
		queue.resetTargetAccount();
		clearFrameHold();
		delete globalThis.window;
	}
});

test("target reset drops queued decisions, patches and approval count without changing the fence tab", async () => {
	globalThis.window = {};
	try {
		const tab = nextWriteFence().tab;
		let release;
		const held = new Promise((resolve) => {
			release = resolve;
		});
		let secondCalls = 0;
		const enqueue = (id, work) =>
			decisions.enqueueDecision(
				{ key: id, id, kind: "spend-approve" },
				5,
				work,
				async () => {
					throw new Error("Old account refreshed");
				},
				() => {},
			);
		enqueue("first", () => held);
		enqueue("second", async () => {
			secondCalls++;
		});
		await setImmediate();
		assert.equal(decisions.shownApprovalCount(5), 3);
		queue.resetTargetAccount();
		assert.deepEqual(decisions.patchSnapshot(), []);
		assert.equal(decisions.shownApprovalCount(0), 0);
		assert.equal(nextWriteFence().tab, tab);
		release({ id: "first", status: "Approved", count: 4 });
		await setImmediate();
		assert.equal(secondCalls, 0);
		assert.deepEqual(decisions.patchSnapshot(), []);
		assert.equal(decisions.shownApprovalCount(0), 0);
	} finally {
		delete globalThis.window;
	}
});

test("page loaders and retained snapshots keep their loaded account and reject mixed frames", async () => {
	globalThis.window = {};
	try {
		queue.resetTargetAccount();
		state.admin = true;
		state.target = "demo";
		state.store = Object.fromEntries(limitDefinitions.map((definition) => [definition.key, 100]));
		state.failRules = false;
		const rulesPage = await loadRulesSnapshot();
		const overviewPage = await loadHeldOverview(overviewEpoch(), currentWrites(), () => overview.loadOverview());
		const trafficPage = await traffic.loadTraffic();
		for (const page of [rulesPage, overviewPage, trafficPage]) assert.equal(page.accountId, "demo");
		state.target = "northwind";
		state.store = {};
		state.failRules = true;
		const retainedRules = await loadRulesSnapshot();
		const retainedOverview = await loadHeldOverview(overviewEpoch(), currentWrites(), async () => {
			throw new Error("Read failed");
		});
		assert.equal(retainedRules.accountId, "demo");
		assert.equal(retainedRules.limits.length, 3);
		assert.equal(retainedOverview.accountId, "demo");
		for (const page of [retainedRules, retainedOverview, trafficPage]) {
			state.workspace = { frame: { accountId: "demo" } };
			assert.equal(useWorkspacePage(page.accountId), state.workspace);
			state.workspace = { frame: { accountId: "northwind" } };
			assert.throws(() => useWorkspacePage(page.accountId), /The workspace write did not finish/);
			state.writes = [];
			await assert.rejects(writes[1](page.accountId), /The workspace write did not finish/);
			assert.deepEqual(state.writes, []);
		}
		assert.equal(overviewMatchStamp({ ...retainedOverview, count: 4 }, "northwind"), null);
		assert.equal(typeof overviewMatchStamp({ ...retainedOverview, count: 4 }, "demo"), "string");
		state.failRules = false;
		const fresh = await loadRulesSnapshot();
		assert.equal(fresh.accountId, "northwind");
		assert.deepEqual(fresh.limits, []);
		assert.equal(useWorkspacePage(fresh.accountId), state.workspace);
		state.workspace = { frame: { accountId: "demo" } };
		assert.throws(() => useWorkspacePage(fresh.accountId), /The workspace write did not finish/);
	} finally {
		state.failRules = false;
		clearOverviewHold();
		delete globalThis.window;
	}
});

test("workspace retention propagates expired-session redirects and keeps ordinary read failures", async () => {
	globalThis.window = {};
	try {
		queue.resetTargetAccount();
		clearFrameHold();
		clearOverviewHold();
		state.admin = true;
		state.target = "northwind";
		state.failRules = false;
		const readFrame = () =>
			requireWorkspace(async (scope) => ({ accountId: scope.accountId, approvalCount: 0, messages: [] }));
		const failedRead = async () => {
			throw new Error("Read failed");
		};
		const loaders = [
			{
				load: () => loadHeldFrame(frameEpoch(), currentWrites(), readFrame),
				fail: () => loadHeldFrame(frameEpoch(), currentWrites(), failedRead),
			},
			{
				load: () => loadHeldOverview(overviewEpoch(), currentWrites(), () => overview.loadOverview()),
				fail: () => loadHeldOverview(overviewEpoch(), currentWrites(), failedRead),
			},
			{ load: () => loadRulesSnapshot(), fail: () => loadRulesSnapshot() },
		];
		for (const { load, fail } of loaders) {
			const held = await load();
			assert.equal(held.accountId, "northwind");
			state.target = null;
			await assert.rejects(load, (error) => isRedirect(error) && error.options.to === "/admin");
			state.target = "northwind";
			state.failRules = true;
			const retained = await fail();
			assert.strictEqual(retained, held);
			state.failRules = false;
			assert.equal((await load()).accountId, "northwind");
		}
	} finally {
		state.failRules = false;
		state.target = "northwind";
		queue.resetTargetAccount();
		clearFrameHold();
		clearOverviewHold();
		delete globalThis.window;
	}
});

test("workspace retention propagates a session refresh and does not keep it", async () => {
	const { SessionRefreshNeeded, isSessionRefreshNeeded } = await import(new URL("server/session-error.ts", web));
	globalThis.window = {};
	try {
		queue.resetTargetAccount();
		clearFrameHold();
		clearOverviewHold();
		state.admin = true;
		state.target = "northwind";
		state.failRules = false;
		state.refreshError = null;
		const refresh = new SessionRefreshNeeded();
		const readFrame = () =>
			requireWorkspace(async (scope) => ({ accountId: scope.accountId, approvalCount: 0, messages: [] }));
		const loaders = [
			{
				load: () => loadHeldFrame(frameEpoch(), currentWrites(), readFrame),
				refresh: () =>
					loadHeldFrame(frameEpoch(), currentWrites(), async () => {
						throw refresh;
					}),
				fail: () =>
					loadHeldFrame(frameEpoch(), currentWrites(), async () => {
						throw new Error("Read failed");
					}),
			},
			{
				load: () => loadHeldOverview(overviewEpoch(), currentWrites(), () => overview.loadOverview()),
				refresh: () =>
					loadHeldOverview(overviewEpoch(), currentWrites(), async () => {
						throw refresh;
					}),
				fail: () =>
					loadHeldOverview(overviewEpoch(), currentWrites(), async () => {
						throw new Error("Read failed");
					}),
			},
			{
				load: () => loadRulesSnapshot(),
				refresh: () => {
					state.refreshError = refresh;
					return loadRulesSnapshot();
				},
				fail: () => {
					state.refreshError = null;
					state.failRules = true;
					return loadRulesSnapshot();
				},
			},
		];
		for (const loader of loaders) {
			const held = await loader.load();
			assert.equal(held.accountId, "northwind");
			await assert.rejects(loader.refresh, (error) => isSessionRefreshNeeded(error));
			state.refreshError = null;
			const retained = await loader.fail();
			assert.strictEqual(retained, held);
			state.failRules = false;
		}
	} finally {
		state.failRules = false;
		state.refreshError = null;
		state.target = "northwind";
		queue.resetTargetAccount();
		clearFrameHold();
		clearOverviewHold();
		delete globalThis.window;
	}
});

test("accepting a new frame account clears old optimistic state even during a write", async () => {
	globalThis.window = {};
	try {
		queue.resetTargetAccount();
		clearFrameHold();
		const frame = (accountId) => ({ accountId, approvalCount: 0, messages: [] });
		await loadHeldFrame(frameEpoch(), currentWrites(), async () => frame("demo"));
		queue.placeRule({ id: "r1", on: true, when: "When", agent: "orders", action: "Then", approval: "Auto" });
		const writeAt = currentWrites();
		advanceWrites();
		const tab = nextWriteFence().tab;
		const next = await loadHeldFrame(frameEpoch(), writeAt, async () => frame("northwind"));
		assert.equal(next.accountId, "northwind");
		assert.deepEqual(queue.rulesWrittenSince(0), { rules: [], limits: [] });
		assert.equal(nextWriteFence().tab, tab);
		const retained = await loadHeldFrame(frameEpoch(), currentWrites(), async () => {
			throw new Error("Read failed");
		});
		assert.equal(retained.accountId, "northwind");
	} finally {
		clearFrameHold();
		delete globalThis.window;
	}
});

test("an agent command for a different displayed account does not reach the kernel", async () => {
	state.admin = true;
	state.target = "northwind";
	const fence = { tab: "review", seq: 1, retires: [] };
	const commands = [
		() => agent.setAgentRunning({ data: { accountId: "demo", agentId: "support", on: false, ...fence } }),
		() =>
			agent.setSkillEnabled({
				data: { accountId: "demo", agentId: "support", skillId: "inbox.read", on: false, ...fence, seq: 2 },
			}),
		() =>
			agent.setAgentAutonomy({
				data: { accountId: "demo", agentId: "support", autonomy: "Ask first", ...fence, seq: 3 },
			}),
		() => agent.askAgentRevise({ data: { accountId: "demo", agentId: "support" } }),
	];
	for (const command of commands) {
		state.writes = [];
		await assert.rejects(command(), /The workspace write did not finish/);
		assert.deepEqual(state.writes, []);
	}
	const missing = [
		() => agent.setAgentRunning({ data: { agentId: "support", on: false, ...fence, seq: 4 } }),
		() =>
			agent.setSkillEnabled({
				data: { agentId: "support", skillId: "inbox.read", on: false, ...fence, seq: 5 },
			}),
		() =>
			agent.setAgentAutonomy({
				data: { agentId: "support", autonomy: "Ask first", ...fence, seq: 6 },
			}),
		() => agent.askAgentRevise({ data: { agentId: "support" } }),
		() => agent.askAgentRevise({ data: "support" }),
	];
	for (const command of missing) {
		state.writes = [];
		await assert.rejects(command(), /The agent request is not valid/);
		assert.deepEqual(state.writes, []);
	}
	state.writes = [];
	await agent
		.setAgentRunning({ data: { accountId: "northwind", agentId: "support", on: true, ...fence, seq: 5 } })
		.catch(() => undefined);
	assert.equal(state.writes.length, 1);
	assert.equal(state.writes[0].method, "setAgentOn");
	assert.equal(state.writes[0].accountId, "northwind");
});

test("the account picker clears a published agent overlay", async () => {
	globalThis.window = {};
	try {
		resetAgentClientState();
		queue.resetTargetAccount();
		publishAgentOn("support", false);
		assert.equal(agentOnSnapshot().get("support"), false);
		queue.resetTargetAccount();
		assert.equal(agentOnSnapshot().size, 0);
	} finally {
		resetAgentClientState();
		queue.resetTargetAccount();
		delete globalThis.window;
	}
});

test("a refresh-needed rules write shows the stored limit and does not replay it", async () => {
	globalThis.window = {};
	try {
		queue.resetTargetAccount();
		state.writes = [];
		state.sessionError = new SessionRefreshNeeded();
		let reads = 0;
		const result = queue.queueLimit("policy.daily_ad_cap", 260, "demo", async () => {
			reads += 1;
		});
		assert.equal(queue.shownLimit("policy.daily_ad_cap", 200), 260);
		for (let i = 0; i < 15; i += 1) await setImmediate();
		assert.equal(result, undefined);
		assert.equal(reads, 1);
		assert.equal(queue.shownLimit("policy.daily_ad_cap", 200), 200);
		assert.deepEqual(queue.rulesWrittenSince(0).limits, []);
		assert.equal(state.writes.length, 0);
	} finally {
		state.sessionError = null;
		state.writes = [];
		queue.resetTargetAccount();
		delete globalThis.window;
	}
});

test("a late old-account rules read does not erase the new account snapshot", async () => {
	globalThis.window = {};
	try {
		queue.resetTargetAccount();
		state.admin = true;
		state.target = "demo";
		state.failRules = false;
		state.store = {};
		await loadRulesSnapshot();
		let release = () => {};
		state.readGate = new Promise((resolve) => {
			release = resolve;
		});
		const old = loadRulesSnapshot();
		await setImmediate();
		queue.resetTargetAccount();
		state.target = "northwind";
		const fresh = await loadRulesSnapshot();
		assert.equal(fresh.accountId, "northwind");
		release();
		await old;
		state.failRules = true;
		const kept = await loadRulesSnapshot();
		assert.equal(kept.accountId, "northwind");
	} finally {
		state.failRules = false;
		state.readGate = null;
		state.target = "demo";
		queue.resetTargetAccount();
		delete globalThis.window;
	}
});

test.after(() => {
	hooks.deregister();
	delete globalThis.workspaceAccountTest;
});
