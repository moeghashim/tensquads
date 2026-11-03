import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";
import { setImmediate } from "node:timers/promises";

const root = new URL("../../", import.meta.url);
const web = new URL("apps/web/src/", root);
const state = { admin: true, target: "demo", owner: "demo", writes: [], store: {}, closed: 0 };
globalThis.workspaceAccountTest = state;
const mocks = {
	"@tanstack/react-router": "export const redirect = (options) => Object.assign(new Error('Redirect'), options);",
	"@tanstack/react-start": `export function createServerFn() {
		let validate = (input) => input;
		return { validator(fn) { validate = fn; return this; },
			handler(fn) { return async (options = {}) => fn({ data: validate(options.data) }); } };
	}`,
	"react": "export const useSyncExternalStore = () => {};",
	"@tensquads/adapters": `const state = globalThis.workspaceAccountTest;
		export const openPostgres = () => ({ db: {}, close: async () => { state.closed++; } });
		export const accountForClerkUser = async () => ({ id: state.owner });
		export const createRepositories = () => ({
			platform: { listAccounts: async () => [{ id: 'demo' }, { id: 'northwind' }] },
			policy: { listRules: async () => [] },
			bus: { readStore: async () => state.store, listEvents: async () => [] },
		});`,
	"@tensquads/kernel": `export class Kernel {
		constructor() { return new Proxy(this, { get: (_, method) => async (scope) => {
			globalThis.workspaceAccountTest.writes.push({ method, accountId: scope.accountId });
			return { count: 0 };
		} }); }
	}`,
	"./session.ts": "export const requireClerkUser = async () => 'owner';",
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
const overview = await import(new URL("server/overview.ts", web));
const chat = await import(new URL("server/workspace.ts", web));
const traffic = await import(new URL("server/traffic.ts", web));
const { requireWorkspace } = await import(new URL("server/workspace-session.ts", web));
const { limitDefinitions } = await import(new URL("packages/domain/src/policy/rule-commands.ts", root));
const queue = await import(new URL("screens/rules/write-queue.ts", web));
const decisions = await import(new URL("screens/overview/actions.ts", web));
const { nextWriteFence } = await import(new URL("write-fence.ts", web));
const writes = [
	(accountId) => rules.setRuleEnabled({ data: { accountId, id: "r1", on: false, tab: "tab", seq: 1 } }),
	(accountId) => rules.setRuleLimit({ data: { accountId, key: "policy.daily_ad_cap", value: 200, tab: "tab", seq: 2 } }),
	(accountId) => rules.addWorkspaceRule({ data: { accountId, when: "When", agent: "orders", action: "Then", approval: "Auto" } }),
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
	assert.deepEqual((await rules.loadRulesPage()).limits.map((limit) => limit.value), [1, 2, 3]);
	assert.deepEqual(state.store, stored);
});

test("target reset drops queued decisions, patches and approval count without changing the fence tab", async () => {
	globalThis.window = {};
	try {
		const tab = nextWriteFence().tab;
		let release;
		const held = new Promise((resolve) => { release = resolve; });
		let secondCalls = 0;
		const enqueue = (id, work) => decisions.enqueueDecision(
			{ key: id, id, kind: "spend-approve" }, 5, work,
			async () => { throw new Error("Old account refreshed"); }, () => {},
		);
		enqueue("first", () => held);
		enqueue("second", async () => { secondCalls++; });
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

test.after(() => {
	hooks.deregister();
	delete globalThis.workspaceAccountTest;
});
