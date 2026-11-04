import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

export interface FakeMachineView {
	readonly id: string;
	readonly state: string;
	readonly env: Readonly<Record<string, string>>;
	readonly labels: Readonly<Record<string, string>>;
	readonly disk: boolean;
	readonly ip: string | null;
	readonly environment: string | null;
	readonly processCount: number;
	readonly deleted: boolean;
	readonly file: string | null;
	readonly from: string | null;
	readonly name: string;
}

interface StoredMachine {
	id: string;
	state: string;
	env: Record<string, string>;
	labels: Record<string, string>;
	disk: boolean;
	ip: string | null;
	environment: string | null;
	processCount: number;
	deleted: boolean;
	file: string | null;
	from: string | null;
	name: string;
	vcpu: number;
	memoryGB: number;
	hydratedAt: string | null;
	createdAt: string;
	gets: number;
	processes: { pid: number; command: string; cpuPercent: number }[];
}

interface StoredTemplate {
	status: string;
	gets: number;
	sourceId: string;
}

export interface SecretCall {
	readonly kind: "admin" | "machine" | "other";
	readonly name: string;
	readonly valuePresent: boolean;
	readonly hasValueField: boolean;
}

export interface FakeBoat {
	readonly basePath: string;
	readonly machineToken: string;
	readonly adminToken: string;
	creates: number;
	processCalls: number;
	refuseEnvironment: boolean;
	failSave: boolean;
	nextError: { readonly status: number; readonly code: string; readonly secret: string } | null;
	readonly secretCalls: SecretCall[];
	close(): Promise<void>;
	machine(id: string): FakeMachineView | undefined;
	machines(): readonly FakeMachineView[];
	template(name: string): { readonly status: string } | undefined;
}

const MACHINE_TOKEN = "machine-token-fixture";
const ADMIN_TOKEN = "admin-token-fixture";

function send(response: ServerResponse, status: number, body: unknown): void {
	const encoded = JSON.stringify(body);
	response.writeHead(status, { "content-type": "application/json" });
	response.end(encoded);
}

function fail(response: ServerResponse, status: number, code: string): void {
	send(response, status, {
		ok: false,
		type: "error",
		status,
		code,
		message: "hidden body must not leak",
		requestId: "req",
		error: { code, message: "hidden body must not leak", status },
	});
}

function sandboxJson(row: StoredMachine, state: string): unknown {
	return {
		id: row.id,
		name: row.name,
		state,
		desktopAvailable: false,
		snapshotAvailable: row.disk,
		vcpu: row.vcpu,
		memoryGB: row.memoryGB,
		labels: row.labels,
		hydratedAt: row.hydratedAt,
		createdAt: row.createdAt,
		environment: row.environment,
		ttlSeconds: null,
	};
}

function labelsFrom(url: URL): string[] {
	return url.searchParams.getAll("label").flatMap((value) => value.split(",").filter((part) => part.length > 0));
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
	const chunks: Buffer[] = [];
	for await (const chunk of request) chunks.push(Buffer.from(chunk));
	if (chunks.length === 0) return {};
	return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
}

export async function startFakeBoat(): Promise<FakeBoat> {
	const machines = new Map<string, StoredMachine>();
	const byKey = new Map<string, string>();
	const templates = new Map<string, StoredTemplate>();
	const operations = new Map<string, { gets: number; targetId: string }>();
	const apiNames: string[] = [];
	const secretCalls: SecretCall[] = [];
	const location = { basePath: "" };
	const state: FakeBoat = {
		get basePath() {
			return location.basePath;
		},
		machineToken: MACHINE_TOKEN,
		adminToken: ADMIN_TOKEN,
		creates: 0,
		processCalls: 0,
		refuseEnvironment: false,
		failSave: false,
		nextError: null,
		secretCalls,
		close: async () => {
			await new Promise<void>((resolve, reject) => {
				server.close((error) => (error ? reject(error) : resolve()));
			});
		},
		machine: (id) => machines.get(id),
		machines: () => [...machines.values()],
		template: (name) => {
			const found = templates.get(name);
			return found ? { status: found.status } : undefined;
		},
	};

	function authKind(request: IncomingMessage): "admin" | "machine" | "other" {
		const header = request.headers.authorization ?? "";
		if (header === `Bearer ${ADMIN_TOKEN}`) return "admin";
		if (header === `Bearer ${MACHINE_TOKEN}`) return "machine";
		return "other";
	}

	function takeError(response: ServerResponse): boolean {
		const pending = state.nextError;
		if (!pending) return false;
		state.nextError = null;
		send(response, pending.status, {
			ok: false,
			type: "error",
			status: pending.status,
			code: pending.code,
			message: pending.secret,
			requestId: "req",
			error: { code: pending.code, message: pending.secret, status: pending.status },
		});
		return true;
	}

	function viewState(row: StoredMachine): string {
		row.gets += 1;
		if (row.state === "provisioning") {
			if (row.gets < 2) return "provisioning";
			row.state = "running";
			return "running";
		}
		if (row.state === "stopping") {
			row.state = "stopped";
			row.ip = null;
			row.processes = [];
			row.processCount = 0;
			return "stopped";
		}
		if (row.state === "starting") {
			row.state = "running";
			return "running";
		}
		return row.state;
	}

	function handle(request: IncomingMessage, response: ServerResponse, url: URL): void {
		const kind = authKind(request);
		if (kind === "other") {
			fail(response, 401, "unauthorized");
			return;
		}
		const path = url.pathname.replace(/^\/api\/v1/, "") || "/";
		if (request.method === "GET" && path === "/sandboxes") {
			const wanted = labelsFrom(url);
			const rows = [...machines.values()].filter(
				(row) =>
					!row.deleted &&
					wanted.every((pair) => {
						const [key, value] = pair.split("=");
						return key !== undefined && row.labels[key] === value;
					}),
			);
			send(response, 200, {
				ok: true,
				type: "sandbox.list",
				sandboxes: rows.map((row) => sandboxJson(row, row.state)),
			});
			return;
		}
		void route(request, response, path, kind, url).catch(() => fail(response, 500, "unavailable"));
	}

	async function route(
		request: IncomingMessage,
		response: ServerResponse,
		path: string,
		kind: "admin" | "machine" | "other",
		_url: URL,
	): Promise<void> {
		if (takeError(response)) return;
		const machineMatch = /^\/sandboxes\/([^/]+)$/.exec(path);
		const actionMatch = /^\/sandboxes\/([^/]+)\/(stop|resume|processes|files)$/.exec(path);
		if (request.method === "POST" && path === "/sandboxes") {
			await create(request, response);
			return;
		}
		if (request.method === "GET" && machineMatch?.[1]) {
			const row = machines.get(machineMatch[1]);
			if (!row || row.deleted) {
				fail(response, 404, "not_found");
				return;
			}
			send(response, 200, { ok: true, type: "sandbox", sandbox: sandboxJson(row, viewState(row)) });
			return;
		}
		if (actionMatch?.[1] && actionMatch[2]) {
			await action(request, response, actionMatch[1], actionMatch[2]);
			return;
		}
		if (request.method === "DELETE" && machineMatch?.[1]) {
			remove(request, response, machineMatch[1]);
			return;
		}
		if (path === "/saved-snapshots" && request.method === "POST") {
			await saveTemplate(request, response);
			return;
		}
		const templateMatch = /^\/saved-snapshots\/([^/]+)$/.exec(path);
		if (templateMatch?.[1] && request.method === "GET") {
			readTemplate(response, decodeURIComponent(templateMatch[1]));
			return;
		}
		if (templateMatch?.[1] && request.method === "DELETE") {
			templates.delete(decodeURIComponent(templateMatch[1]));
			send(response, 200, { ok: true, type: "snapshot.deleted" });
			return;
		}
		const operationMatch = /^\/deletion-operations\/([^/]+)$/.exec(path);
		if (operationMatch?.[1] && request.method === "GET") {
			readOperation(response, operationMatch[1]);
			return;
		}
		if (path === "/credential-profiles" && request.method === "GET") {
			listProfiles(response, kind);
			return;
		}
		const secretMatch = /^\/credential-profiles\/([^/]+)\/custom-apis\/([^/]+)$/.exec(path);
		if (secretMatch?.[1] && secretMatch[2] && (request.method === "PUT" || request.method === "DELETE")) {
			await secret(request, response, kind, decodeURIComponent(secretMatch[2]));
			return;
		}
		fail(response, 404, "not_found");
	}

	async function create(request: IncomingMessage, response: ServerResponse): Promise<void> {
		const body = await readJson(request);
		if (state.refuseEnvironment && typeof body.environment === "string") {
			state.refuseEnvironment = false;
			fail(response, 400, "unknown_environment");
			return;
		}
		const key = request.headers["idempotency-key"];
		const idempotency = Array.isArray(key) ? key[0] : key;
		if (idempotency && byKey.has(idempotency)) {
			const existing = machines.get(byKey.get(idempotency) ?? "");
			if (existing) {
				send(response, 200, {
					ok: true,
					type: "sandbox.created",
					status: "ready",
					ttlSeconds: null,
					sandbox: sandboxJson(existing, existing.state),
				});
				return;
			}
		}
		state.creates += 1;
		const id = `m-${state.creates}`;
		const env = (body.env ?? {}) as Record<string, string>;
		const labels = (body.labels ?? {}) as Record<string, string>;
		const row: StoredMachine = {
			id,
			name: String(body.name ?? id),
			state: "provisioning",
			env,
			labels,
			disk: true,
			ip: "203.0.113.10",
			processCount: 1,
			deleted: false,
			file: null,
			from: typeof body.from === "string" ? body.from : null,
			vcpu: 2,
			memoryGB: 4,
			hydratedAt: null,
			createdAt: new Date(Date.now() - 3 * 86_400_000).toISOString(),
			environment: typeof body.environment === "string" ? body.environment : null,
			gets: 0,
			processes: [{ pid: 1, command: "agent", cpuPercent: 40 }],
		};
		machines.set(id, row);
		if (idempotency) byKey.set(idempotency, id);
		send(response, 202, {
			ok: true,
			type: "sandbox.created",
			status: "provisioning",
			ttlSeconds: body.ttlSeconds ?? null,
			sandbox: sandboxJson(row, "provisioning"),
		});
	}

	async function action(request: IncomingMessage, response: ServerResponse, id: string, name: string): Promise<void> {
		const row = machines.get(id);
		if (!row || row.deleted) {
			fail(response, 404, "not_found");
			return;
		}
		if (name === "processes") {
			state.processCalls += 1;
			send(response, 200, {
				ok: true,
				type: "process.list",
				live: row.state === "running",
				sampledAt: new Date().toISOString(),
				total: row.processes.length,
				processes: row.processes,
			});
			return;
		}
		if (name === "files") {
			const body = await readJson(request);
			row.file = String(body.content ?? "");
			send(response, 200, {
				ok: true,
				type: "file.write",
				success: true,
				path: body.path,
				encoding: "utf8",
				size: row.file.length,
			});
			return;
		}
		if (name === "stop") {
			row.state = "stopping";
			send(response, 200, {
				ok: true,
				type: "sandbox.stop",
				id,
				status: "stopping",
				sandbox: sandboxJson(row, "stopping"),
			});
			return;
		}
		row.state = "starting";
		send(response, 200, {
			ok: true,
			type: "sandbox.resume",
			id,
			status: "starting",
			sandbox: sandboxJson(row, "starting"),
		});
	}

	function remove(request: IncomingMessage, response: ServerResponse, id: string): void {
		const row = machines.get(id);
		const confirm = request.headers["x-ascii-confirm-delete"];
		if (!row || confirm !== id) {
			fail(response, 400, "confirm");
			return;
		}
		row.deleted = true;
		const operationId = `op-${id}`;
		operations.set(operationId, { gets: 0, targetId: id });
		const now = new Date().toISOString();
		send(response, 202, {
			ok: true,
			type: "deletion.accepted",
			operation: {
				id: operationId,
				kind: "sandbox",
				targetId: id,
				reason: "delete",
				status: "running",
				attemptCount: 1,
				requestedAt: now,
				completedAt: now,
			},
		});
	}

	function readOperation(response: ServerResponse, id: string): void {
		const operation = operations.get(id);
		if (!operation) {
			fail(response, 404, "not_found");
			return;
		}
		operation.gets += 1;
		const now = new Date().toISOString();
		send(response, 200, {
			ok: true,
			type: "deletion",
			operation: {
				id,
				kind: "sandbox",
				targetId: operation.targetId,
				reason: "delete",
				status: operation.gets < 2 ? "running" : "completed",
				attemptCount: 1,
				requestedAt: now,
				completedAt: now,
			},
		});
	}

	async function saveTemplate(request: IncomingMessage, response: ServerResponse): Promise<void> {
		const body = await readJson(request);
		const name = String(body.name ?? "");
		templates.set(name, { status: "saving", gets: 0, sourceId: String(body.sandboxId ?? "") });
		const now = new Date().toISOString();
		send(response, 200, {
			ok: true,
			type: "snapshot.saved.saving",
			status: "saving",
			snapshot: { name, status: "saving", sourceSandboxId: body.sandboxId, createdAt: now },
		});
	}

	function readTemplate(response: ServerResponse, name: string): void {
		const template = templates.get(name);
		if (!template) {
			fail(response, 404, "not_found");
			return;
		}
		template.gets += 1;
		if (state.failSave) template.status = "failed";
		else if (template.gets >= 2) template.status = "ready";
		const now = new Date().toISOString();
		send(response, 200, {
			ok: true,
			type: "snapshot.saved.info",
			snapshot: { name, status: template.status, sourceSandboxId: template.sourceId, createdAt: now },
		});
	}

	function listProfiles(response: ServerResponse, kind: "admin" | "machine" | "other"): void {
		secretCalls.push({ kind, name: "list", valuePresent: false, hasValueField: false });
		const now = new Date().toISOString();
		send(response, 200, {
			ok: true,
			type: "credential.list",
			profiles: [
				{
					id: "profile-1",
					name: "tensquads-agents",
					isDefault: false,
					owner: { id: "owner", kind: "personal", name: "trial", aiProxyEnabled: false },
					canManage: true,
					connected: [],
					customApis: [...apiNames],
					createdAt: now,
					updatedAt: now,
				},
			],
		});
	}

	async function secret(
		request: IncomingMessage,
		response: ServerResponse,
		kind: "admin" | "machine" | "other",
		name: string,
	): Promise<void> {
		const body = request.method === "DELETE" ? {} : await readJson(request);
		const valuePresent = typeof body.value === "string" && body.value.length > 0;
		secretCalls.push({ kind, name, valuePresent, hasValueField: Object.hasOwn(body, "value") });
		if (request.method === "DELETE") {
			const index = apiNames.indexOf(name);
			if (index >= 0) apiNames.splice(index, 1);
		} else if (!apiNames.includes(name)) apiNames.push(name);
		const now = new Date().toISOString();
		send(response, 200, {
			ok: true,
			type: "credential.profile",
			success: true,
			profile: {
				id: "profile-1",
				name: "tensquads-agents",
				isDefault: false,
				owner: { id: "owner", kind: "personal", name: "trial", aiProxyEnabled: false },
				canManage: true,
				connected: [],
				customApis: [...apiNames],
				createdAt: now,
				updatedAt: now,
			},
		});
	}

	const server: Server = createServer((request, response) => {
		if (!request.url) {
			fail(response, 404, "not_found");
			return;
		}
		handle(request, response, new URL(request.url, "http://127.0.0.1"));
	});
	await new Promise<void>((resolve) => {
		server.listen(0, "127.0.0.1", () => resolve());
	});
	const address = server.address();
	if (!address || typeof address === "string") throw new Error("The fake machine server did not bind.");
	location.basePath = `http://127.0.0.1:${address.port}/api/v1`;
	return state;
}
