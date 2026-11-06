import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { adaptersMode, masterStubId, publishStubId } from "../../apps/web/adapters-mode.ts";

const wrangler = readFileSync(new URL("../../apps/web/wrangler.jsonc", import.meta.url), "utf8");

// The first ADAPTERS string in the file is production. A real build must not use it.
const flipped = `{"env":{"real":{"vars":{"ADAPTERS":"real"}}},"vars":{"ADAPTERS":"test"}}`;

test("a production build stubs the master and a real build does not", () => {
	assert.equal(/"ADAPTERS"\s*:\s*"([^"]*)"/.exec(wrangler)?.[1], "test");
	assert.equal(adaptersMode(wrangler, undefined), "test");
	assert.equal(adaptersMode(wrangler, ""), "test");
	assert.equal(adaptersMode(wrangler, "real"), "real");
	assert.equal(adaptersMode(wrangler, "staging"), "test");
	assert.equal(/"ADAPTERS"\s*:\s*"([^"]*)"/.exec(flipped)?.[1], "real");
	assert.equal(adaptersMode(flipped, undefined), "test");
	assert.equal(adaptersMode(flipped, "real"), "real");
});

async function resolveWithVite(id, importer) {
	const { createServer } = await import("vite");
	const server = await createServer({
		configFile: fileURLToPath(new URL("../../apps/web/vite.config.ts", import.meta.url)),
		root: fileURLToPath(new URL("../../apps/web/", import.meta.url)),
		logLevel: "silent",
		server: { middlewareMode: true },
		appType: "custom",
	});
	try {
		const found = await server.pluginContainer.resolveId(id, importer, { ssr: true });
		return typeof found === "string" ? found : (found?.id ?? null);
	} finally {
		await server.close();
	}
}

test("the real Vite build resolves the master to the real domain code, not the typecheck stub", async () => {
	const before = process.env.CLOUDFLARE_ENV;
	process.env.CLOUDFLARE_ENV = "real";
	try {
		const masterLive = fileURLToPath(
			new URL("../../packages/adapters/src/cloudflare-bus/master-live.ts", import.meta.url),
		);
		const masterStep = fileURLToPath(
			new URL("../../packages/adapters/src/cloudflare-bus/master-step.ts", import.meta.url),
		);
		const live = await resolveWithVite("./master-live.ts", masterStep);
		assert.equal(live, masterLive);
		const publishRoutes = fileURLToPath(
			new URL("../../packages/adapters/src/cloudflare-bus/publish-routes.ts", import.meta.url),
		);
		const publishLive = fileURLToPath(
			new URL("../../packages/adapters/src/cloudflare-bus/publish-live.ts", import.meta.url),
		);
		assert.equal(await resolveWithVite("./publish-live.ts", publishRoutes), publishLive);
		const domain = await resolveWithVite("@tensquads/domain/master", masterLive);
		assert.ok(domain, "the real domain master did not resolve");
		assert.equal(domain.includes("master-typecheck"), false, `real build resolved the typecheck stub: ${domain}`);
		assert.equal(
			domain.endsWith(joinPath("domain", "src", "master", "index.ts")),
			true,
			`real build resolved: ${domain}`,
		);
	} finally {
		if (before === undefined) delete process.env.CLOUDFLARE_ENV;
		else process.env.CLOUDFLARE_ENV = before;
	}
});

test("the production Vite build resolves the master to the stub", async () => {
	const before = process.env.CLOUDFLARE_ENV;
	delete process.env.CLOUDFLARE_ENV;
	try {
		const masterStep = fileURLToPath(
			new URL("../../packages/adapters/src/cloudflare-bus/master-step.ts", import.meta.url),
		);
		const stub = fileURLToPath(new URL("../../packages/adapters/src/cloudflare-bus/master-stub.ts", import.meta.url));
		const live = await resolveWithVite("./master-live.ts", masterStep);
		assert.equal(live, stub);
		const publishRoutes = fileURLToPath(
			new URL("../../packages/adapters/src/cloudflare-bus/publish-routes.ts", import.meta.url),
		);
		const publishStub = fileURLToPath(
			new URL("../../packages/adapters/src/cloudflare-bus/publish-stub.ts", import.meta.url),
		);
		assert.equal(await resolveWithVite("./publish-live.ts", publishRoutes), publishStub);
	} finally {
		if (before === undefined) delete process.env.CLOUDFLARE_ENV;
		else process.env.CLOUDFLARE_ENV = before;
	}
});

function joinPath(...parts) {
	return parts.join("/");
}

test("the stub resolution follows that mode", () => {
	const stub = fileURLToPath(new URL("../../packages/adapters/src/cloudflare-bus/master-stub.ts", import.meta.url));
	assert.equal(masterStubId(adaptersMode(wrangler, undefined), "/app/master-live.ts", stub), stub);
	assert.equal(masterStubId(adaptersMode(wrangler, "real"), "/app/master-live.ts", stub), null);
	assert.equal(masterStubId(adaptersMode(wrangler, undefined), "/app/other.ts", stub), null);
	assert.equal(masterStubId(adaptersMode(wrangler, "real"), "/app/other.ts", stub), null);
	const publishStub = fileURLToPath(
		new URL("../../packages/adapters/src/cloudflare-bus/publish-stub.ts", import.meta.url),
	);
	assert.equal(publishStubId(adaptersMode(wrangler, undefined), "/app/publish-live.ts", publishStub), publishStub);
	assert.equal(publishStubId(adaptersMode(wrangler, "real"), "/app/publish-live.ts", publishStub), null);
	assert.equal(publishStubId(adaptersMode(wrangler, undefined), "/app/other.ts", publishStub), null);
});
