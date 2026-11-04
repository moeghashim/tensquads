import {
	BoatApi,
	Configuration,
	type CreateSandboxRequest,
	ResponseError,
	type Sandbox,
	waitUntilReady,
} from "@boatdev/sdk";
import type { AccountMachine, AccountScope, MachineTemplate, StartedMachine } from "@tensquads/kernel";

import { faultFromStatus, machineFault, missingMachine, notConfigured, readErrorBody } from "./boat-errors.ts";
import {
	cpuText,
	hostName,
	hostOf,
	imageFromTemplate,
	imageTag,
	sizeText,
	sourceName,
	startKey,
	templateKey,
	templateName,
	uptimeText,
} from "./boat-fields.ts";

const LIVE = new Set(["ready", "idle", "running"]);

function paused(state: string): boolean {
	return state === "stopped" || state === "stopping";
}

function stopped(state: string): boolean {
	return state === "stopped";
}
const REGION = "EU";
const ENVIRONMENT = "tensquads-agents";

export interface BoatWait {
	readonly intervalMs: number;
	readonly timeoutMs: number;
}

export interface BoatMachineOptions {
	readonly token: string;
	readonly adminToken?: string;
	readonly fetchApi?: typeof fetch;
	readonly basePath?: string;
	readonly profileName: string;
	readonly now?: () => Date;
	readonly wait?: BoatWait;
	readonly secretBaseUrl?: string;
}

interface BoatContext {
	readonly machine: BoatApi;
	readonly admin: BoatApi | null;
	readonly profileName: string;
	readonly secretBaseUrl: string | undefined;
	readonly now: () => Date;
	readonly wait: BoatWait;
	readonly hosts: Map<string, string[]>;
}

function client(token: string, options: BoatMachineOptions): BoatApi {
	return new BoatApi(
		new Configuration({
			basePath: options.basePath,
			accessToken: token,
			fetchApi: options.fetchApi ?? fetch,
		}),
	);
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

async function asFault(error: unknown, duringStop: boolean): Promise<never> {
	if (error instanceof ResponseError) {
		throw faultFromStatus(await readErrorBody(error.response), duringStop);
	}
	throw error instanceof Error && error.name === "MachineFault" ? error : machineFault("unavailable");
}

async function call<T>(run: () => Promise<T>, duringStop = false): Promise<T> {
	try {
		return await run();
	} catch (error) {
		return asFault(error, duringStop);
	}
}

async function missing(error: unknown): Promise<boolean> {
	if (!(error instanceof ResponseError) || error.response.status !== 404) return false;
	await error.response.text().catch(() => "");
	return true;
}

function matches(row: Sandbox, scope: AccountScope, agentId: string): boolean {
	return row.labels?.account === scope.accountId && row.labels?.agent === agentId;
}

async function findMachine(ctx: BoatContext, scope: AccountScope, agentId: string): Promise<Sandbox | undefined> {
	const listed = await call(() =>
		ctx.machine.sandboxes({ label: [`agent=${agentId}`, `account=${scope.accountId}`] }),
	);
	return listed.sandboxes.find((row) => matches(row, scope, agentId));
}

async function requireMachine(ctx: BoatContext, scope: AccountScope, agentId: string): Promise<Sandbox> {
	const found = await findMachine(ctx, scope, agentId);
	if (!found) throw missingMachine();
	return found;
}

async function waitReady(ctx: BoatContext, id: string): Promise<Sandbox> {
	try {
		return await waitUntilReady(ctx.machine, id, ctx.wait);
	} catch (error) {
		if (error instanceof ResponseError) return asFault(error, false);
		throw machineFault("unavailable");
	}
}

async function until(ctx: BoatContext, read: () => Promise<string>, done: (state: string) => boolean): Promise<void> {
	const deadline = Date.now() + ctx.wait.timeoutMs;
	for (;;) {
		const state = await read();
		if (done(state)) return;
		if (Date.now() >= deadline) throw machineFault("unavailable");
		await delay(ctx.wait.intervalMs);
	}
}

function createBody(
	name: string,
	env: Record<string, string>,
	labels: Record<string, string>,
	from?: string,
): CreateSandboxRequest {
	return {
		type: "small",
		noEnv: true,
		ttlSeconds: null,
		environment: ENVIRONMENT,
		env,
		labels,
		name,
		from,
	};
}

async function createOnce(ctx: BoatContext, body: CreateSandboxRequest, idempotencyKey: string): Promise<Sandbox> {
	try {
		const created = await ctx.machine.create({ idempotencyKey, createSandboxRequest: body });
		return created.sandbox;
	} catch (error) {
		if (!(error instanceof ResponseError)) return asFault(error, false);
		const facts = await readErrorBody(error.response);
		if (facts.status !== 400 || body.environment === undefined) throw faultFromStatus(facts, false);
		const { environment: _environment, ...withoutEnvironment } = body;
		const created = await call(() =>
			ctx.machine.create({ idempotencyKey, createSandboxRequest: withoutEnvironment }),
		);
		return created.sandbox;
	}
}

async function removeById(ctx: BoatContext, id: string): Promise<void> {
	const started = await call(() => ctx.machine.deleteSandbox({ sandboxId: id, xAsciiConfirmDelete: id }));
	await until(
		ctx,
		async () =>
			(await call(() => ctx.machine.getDeletionOperation({ operationId: started.operation.id }))).operation.status,
		(status) => status === "completed",
	);
}

async function readTemplate(ctx: BoatContext, name: string) {
	try {
		return (await ctx.machine.getSavedSnapshot({ name })).snapshot;
	} catch (error) {
		if (await missing(error)) return undefined;
		return asFault(error, false);
	}
}

async function readyTemplate(ctx: BoatContext, name: string): Promise<MachineTemplate | undefined> {
	const existing = await readTemplate(ctx, name);
	if (existing?.status === "ready") return { id: name };
	if (existing?.status === "failed") throw machineFault("save_failed");
	if (existing?.status === "saving") {
		await pollTemplate(ctx, name);
		return { id: name };
	}
	return undefined;
}

async function publishTemplate(
	ctx: BoatContext,
	sourceId: string,
	imageId: string,
	version: string,
	name: string,
): Promise<void> {
	let failure: unknown;
	try {
		await waitReady(ctx, sourceId);
		await call(() =>
			ctx.machine.writeFile({
				sandboxId: sourceId,
				fileWriteRequest: { path: "/home/user/tensquads-image", content: `${imageId}\n${version}\n` },
			}),
		);
		await call(() => ctx.machine.saveSavedSnapshot({ savedSnapshotSaveRequest: { sandboxId: sourceId, name } }));
		await pollTemplate(ctx, name);
	} catch (error) {
		failure = error instanceof ResponseError ? machineFault("save_failed") : error;
	} finally {
		try {
			await removeById(ctx, sourceId);
		} catch (error) {
			failure ??= error;
		}
	}
	if (failure) throw failure;
}

async function pollTemplate(ctx: BoatContext, name: string): Promise<void> {
	await until(
		ctx,
		async () => {
			const snapshot = await readTemplate(ctx, name);
			if (snapshot?.status === "failed") throw machineFault("save_failed");
			return snapshot?.status ?? "";
		},
		(status) => status === "ready",
	);
}

function shownCpu(percents: readonly number[], vcpu: number | undefined): string {
	return cpuText(percents, vcpu && vcpu > 0 ? vcpu : 1);
}

export function createBoatMachine(options: BoatMachineOptions): AccountMachine {
	if (!options.token || !options.profileName) throw notConfigured();
	if (options.profileName === "default") throw notConfigured("The default profile is closed.");
	const ctx: BoatContext = {
		machine: client(options.token, options),
		admin: options.adminToken ? client(options.adminToken, options) : null,
		profileName: options.profileName,
		secretBaseUrl: options.secretBaseUrl,
		now: options.now ?? (() => new Date()),
		wait: options.wait ?? { intervalMs: 2_000, timeoutMs: 300_000 },
		hosts: new Map(),
	};

	async function remember(scope: AccountScope, baseUrl: string): Promise<void> {
		const host = hostOf(baseUrl);
		const current = ctx.hosts.get(scope.accountId) ?? [];
		if (!current.includes(host)) ctx.hosts.set(scope.accountId, [...current, host]);
	}

	return {
		async host(scope, agentId) {
			await requireMachine(ctx, scope, agentId);
			return hostName(agentId);
		},
		async region(scope, agentId) {
			await requireMachine(ctx, scope, agentId);
			return REGION;
		},
		async size(scope, agentId) {
			const row = await requireMachine(ctx, scope, agentId);
			return sizeText(row.vcpu ?? 2, row.memoryGB ?? 4);
		},
		async cpu(scope, agentId) {
			const row = await requireMachine(ctx, scope, agentId);
			if (!LIVE.has(row.state)) return "0%";
			const list = await call(() => ctx.machine.processes({ sandboxId: row.id }));
			return shownCpu(
				list.processes.map((process) => process.cpuPercent ?? 0),
				row.vcpu,
			);
		},
		async uptime(scope, agentId) {
			const row = await requireMachine(ctx, scope, agentId);
			if (!LIVE.has(row.state)) return "Paused";
			return uptimeText(ctx.now(), row.hydratedAt ?? null, row.createdAt ?? null);
		},
		async egress(scope, agentId) {
			await requireMachine(ctx, scope, agentId);
			return ctx.hosts.get(scope.accountId) ?? [];
		},
		async secrets(scope, agentId) {
			await requireMachine(ctx, scope, agentId);
			const admin = ctx.admin;
			if (!admin) throw notConfigured("The secret registration is not configured.");
			const listed = await call(() => admin.listCredentialProfiles());
			return listed.profiles.find((profile) => profile.name === ctx.profileName)?.customApis ?? [];
		},
		async start(scope, agentId, tag) {
			const existing = await findMachine(ctx, scope, agentId);
			if (existing) {
				if (!paused(existing.state) && !LIVE.has(existing.state)) {
					await waitReady(ctx, existing.id);
				}
				return;
			}
			const created = await createOnce(
				ctx,
				createBody(
					hostName(agentId),
					{ ACCOUNT_ID: scope.accountId, AGENT_ID: agentId, IMAGE_TAG: tag },
					{ account: scope.accountId, agent: agentId, image: tag },
				),
				startKey(scope.accountId, agentId, tag),
			);
			await waitReady(ctx, created.id);
		},
		async stop(scope, agentId) {
			const row = await requireMachine(ctx, scope, agentId);
			if (stopped(row.state)) return;
			await call(() => ctx.machine.stop({ sandboxId: row.id }), true);
			await until(
				ctx,
				async () => (await call(() => ctx.machine.get({ sandboxId: row.id }))).sandbox.state,
				stopped,
			);
		},
		async resume(scope, agentId) {
			const row = await requireMachine(ctx, scope, agentId);
			await call(() => ctx.machine.resume({ sandboxId: row.id }));
			await waitReady(ctx, row.id);
		},
		async remove(scope, agentId) {
			const row = await requireMachine(ctx, scope, agentId);
			await removeById(ctx, row.id);
		},
		async registerSecret(scope, name) {
			const admin = ctx.admin;
			if (!admin || !ctx.secretBaseUrl) throw notConfigured("The secret registration is not configured.");
			const baseUrl = ctx.secretBaseUrl;
			await call(() =>
				admin.setCredentialProfileCustomApi({
					profile: ctx.profileName,
					name,
					setCustomApiRequest: { value: "configured", baseUrl },
				}),
			);
			await remember(scope, baseUrl);
		},
		async removeSecret(_scope, name) {
			const admin = ctx.admin;
			if (!admin) throw notConfigured("The secret registration is not configured.");
			await call(() => admin.deleteCredentialProfileCustomApi({ profile: ctx.profileName, name }));
		},
		async makeTemplate(scope, imageId, version): Promise<MachineTemplate> {
			const name = templateName(imageId, version);
			const ready = await readyTemplate(ctx, name);
			if (ready) return ready;
			const tag = imageTag(imageId, version);
			const source = await createOnce(
				ctx,
				createBody(
					sourceName(imageId, version),
					{ ACCOUNT_ID: scope.accountId, IMAGE_TAG: tag },
					{ account: scope.accountId, image: tag },
				),
				templateKey(scope.accountId, imageId, version),
			);
			await publishTemplate(ctx, source.id, imageId, version, name);
			return { id: name };
		},
		async startFromTemplate(scope, templateId, agentId): Promise<StartedMachine> {
			const image = imageFromTemplate(templateId);
			const tag = imageTag(image.imageId, image.version);
			const existing = await findMachine(ctx, scope, agentId);
			if (!existing) {
				const created = await createOnce(
					ctx,
					{
						...createBody(
							hostName(agentId),
							{ ACCOUNT_ID: scope.accountId, AGENT_ID: agentId, IMAGE_TAG: tag },
							{ account: scope.accountId, agent: agentId, image: tag },
							templateId,
						),
					},
					startKey(scope.accountId, agentId, tag),
				);
				await waitReady(ctx, created.id);
			} else if (!LIVE.has(existing.state)) {
				await waitReady(ctx, existing.id);
			}
			return { templateId, agentId };
		},
		async removeTemplate(_scope, templateId) {
			await call(() => ctx.machine.deleteSavedSnapshot({ name: templateId }));
		},
	};
}
