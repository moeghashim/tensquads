import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createServer } from "node:net";
import test from "node:test";

import { appOrigin, choosePort, parsePort, resolveE2ePort, stablePort } from "../e2e-port.mjs";

let envChain = Promise.resolve();

function withEnv(values, run) {
	const turn = envChain.then(async () => {
		const saved = new Map();
		for (const [key, value] of Object.entries({ TS_E2E_PORT_READY: undefined, ...values })) {
			saved.set(key, process.env[key]);
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
		try {
			return await run();
		} finally {
			for (const [key, value] of saved) {
				if (value === undefined) delete process.env[key];
				else process.env[key] = value;
			}
		}
	});
	envChain = turn.then(
		() => undefined,
		() => undefined,
	);
	return turn;
}

function hold(port, host) {
	return new Promise((resolve, reject) => {
		const server = createServer();
		server.once("error", reject);
		server.listen({ port, host, exclusive: true, ipv6Only: host.includes(":") }, () => resolve(server));
	});
}

function close(server) {
	return new Promise((resolve) => server.close(resolve));
}

async function ephemeral(host) {
	const server = await hold(0, host);
	const address = server.address();
	const port = typeof address === "object" && address !== null ? address.port : 0;
	return { server, port };
}

test("a set port is used and an invalid port is rejected", async () => {
	assert.equal(parsePort("40123"), 40123);
	assert.throws(() => parsePort("0"), /TS_E2E_PORT/);
	assert.throws(() => parsePort("3000 "), /TS_E2E_PORT/);
	assert.throws(() => parsePort("65536"), /TS_E2E_PORT/);
	const open = await ephemeral("127.0.0.1");
	await close(open.server);
	await withEnv({ TS_E2E_PORT: String(open.port), CI: undefined }, async () => {
		assert.equal(appOrigin(), `http://localhost:${open.port}`);
		assert.equal(await resolveE2ePort(), open.port);
		assert.equal(process.env.TS_E2E_PORT_READY, "1");
	});
});

test("CI keeps port 3000 when the variable is unset", async () => {
	await withEnv({ TS_E2E_PORT: undefined, CI: "true" }, async () => {
		assert.equal(await resolveE2ePort(), 3000);
		assert.equal(process.env.TS_E2E_PORT, "3000");
		assert.equal(process.env.TS_E2E_PORT_READY, "1");
		assert.equal(appOrigin(), "http://localhost:3000");
	});
});

test("the worktree port is stable and a busy port is skipped", async () => {
	assert.equal(stablePort("/tmp/tensquads-a"), stablePort("/tmp/tensquads-a"));
	assert.notEqual(stablePort("/tmp/tensquads-a"), stablePort("/tmp/tensquads-b"));
	assert.equal(stablePort("/tmp/tensquads-a") >= 20000, true);
	assert.equal(stablePort("/tmp/tensquads-a") < 40000, true);
	const busy = stablePort("/tmp/tensquads-a");
	assert.equal(await choosePort(busy, async (port) => port !== busy), busy === 39999 ? 20000 : busy + 1);
});

test("a chosen port that is already in use fails", async () => {
	const { server, port } = await ephemeral("127.0.0.1");
	try {
		await withEnv({ TS_E2E_PORT: String(port), CI: undefined }, async () => {
			await assert.rejects(resolveE2ePort(), new RegExp(`TS_E2E_PORT ${port} is already in use`));
		});
	} finally {
		await close(server);
	}
});

test("an occupied ::1 port is skipped", async (t) => {
	const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
	const preferred = stablePort(root);
	let server;
	try {
		server = await hold(preferred, "::1");
	} catch (error) {
		const code = typeof error === "object" && error !== null && "code" in error ? error.code : "";
		if (code === "EADDRNOTAVAIL" || code === "EAFNOSUPPORT" || code === "EPROTONOSUPPORT") {
			t.skip("This machine has no ::1 address.");
			return;
		}
		throw error;
	}
	try {
		await withEnv({ TS_E2E_PORT: undefined, CI: undefined }, async () => {
			const chosen = await resolveE2ePort();
			assert.notEqual(chosen, preferred);
			assert.equal(chosen >= 20000, true);
			assert.equal(chosen < 40000, true);
		});
		await withEnv({ TS_E2E_PORT: String(preferred), CI: undefined }, async () => {
			await assert.rejects(resolveE2ePort(), new RegExp(`TS_E2E_PORT ${preferred} is already in use`));
		});
	} finally {
		await close(server);
	}
});

test("a worker reuses a ready port while the server listens on ::1", async () => {
	const { server, port } = await ephemeral("::1");
	try {
		await withEnv({ TS_E2E_PORT: String(port), TS_E2E_PORT_READY: "1" }, async () => {
			assert.equal(await resolveE2ePort(), port);
		});
	} finally {
		await close(server);
	}
});

test("a ready marker does not bypass port validation", async () => {
	await withEnv({ TS_E2E_PORT: "65536", TS_E2E_PORT_READY: "1" }, async () => {
		await assert.rejects(resolveE2ePort(), /TS_E2E_PORT must be a port/);
	});
});
