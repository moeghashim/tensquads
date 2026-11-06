import type { IncomingMessage, ServerResponse } from "node:http";

import type { SecretCall } from "./boat-fake.ts";

export interface FakeEnvironment {
	readonly id: string;
	readonly name: string;
	credentialProfileId: string | null;
	safeForThirdParties: boolean;
	proxyAiCredentials: boolean;
	updates: number;
}

interface Io {
	readJson(request: IncomingMessage): Promise<Record<string, unknown>>;
	send(response: ServerResponse, status: number, body: unknown): void;
	fail(response: ServerResponse, status: number, code: string): void;
}

function profileJson(name: string, customApis: readonly string[]) {
	const now = new Date().toISOString();
	return {
		id: `profile-${name}`,
		name,
		isDefault: false,
		canManage: true,
		connected: [],
		owner: { id: "owner", kind: "personal", name: "trial", aiProxyEnabled: false },
		customApis: [...customApis],
		createdAt: now,
		updatedAt: now,
	};
}

function environmentJson(row: FakeEnvironment): unknown {
	const now = new Date().toISOString();
	return {
		id: row.id,
		name: row.name,
		isDefault: false,
		latestVersionId: `${row.id}-v${row.updates + 1}`,
		latestVersionNumber: row.updates + 1,
		safeForThirdParties: row.safeForThirdParties,
		passGithub: false,
		passSecrets: false,
		passSandboxCredentials: false,
		passAgentsCredentials: false,
		credentialProfileId: row.credentialProfileId,
		proxyAiCredentials: row.proxyAiCredentials,
		envContents: "",
		secretFiles: [],
		versions: [
			{
				id: `${row.id}-v${row.updates + 1}`,
				versionNumber: row.updates + 1,
				sandboxCount: 0,
				createdAt: now,
			},
		],
	};
}

export function createAccountRoutes(secretCalls: SecretCall[]) {
	const profileApis = new Map<string, string[]>([["tensquads-agents", []]]);
	const environments = new Map<string, FakeEnvironment>();
	let nextId = 0;

	function apisFor(profile: string): string[] {
		const found = profileApis.get(profile);
		if (found) return found;
		profileApis.set(profile, []);
		return profileApis.get(profile) ?? [];
	}

	function listBody(): unknown {
		return {
			ok: true,
			type: "environments.list",
			environments: [...environments.values()].map((row) => environmentJson(row)),
		};
	}

	return {
		environments: (): readonly FakeEnvironment[] => [...environments.values()],
		async route(
			request: IncomingMessage,
			response: ServerResponse,
			path: string,
			kind: SecretCall["kind"],
			io: Io,
		): Promise<boolean> {
			if (path === "/credential-profiles" && request.method === "GET") {
				secretCalls.push({ kind, name: "list", valuePresent: false, hasValueField: false });
				io.send(response, 200, {
					ok: true,
					type: "credential.list",
					profiles: [...profileApis.entries()].map(([name, apis]) => profileJson(name, apis)),
				});
				return true;
			}
			if (path === "/credential-profiles" && request.method === "POST") {
				const body = await io.readJson(request);
				const name = typeof body.name === "string" ? body.name : "";
				if (name.length === 0) {
					io.fail(response, 400, "invalid");
					return true;
				}
				apisFor(name);
				secretCalls.push({
					kind,
					name: "profile",
					profile: name,
					valuePresent: false,
					hasValueField: false,
					copyFrom: typeof body.copyFrom === "string" ? body.copyFrom : undefined,
				});
				io.send(response, 201, {
					ok: true,
					type: "credential.profile",
					success: true,
					profile: profileJson(name, apisFor(name)),
				});
				return true;
			}
			const secretMatch = /^\/credential-profiles\/([^/]+)\/custom-apis\/([^/]+)$/.exec(path);
			if (secretMatch?.[1] && secretMatch[2] && (request.method === "PUT" || request.method === "DELETE")) {
				const profile = decodeURIComponent(secretMatch[1]);
				const name = decodeURIComponent(secretMatch[2]);
				const body = request.method === "DELETE" ? {} : await io.readJson(request);
				const value = typeof body.value === "string" ? body.value : undefined;
				secretCalls.push({
					kind,
					name,
					profile,
					valuePresent: typeof value === "string" && value.length > 0,
					hasValueField: Object.hasOwn(body, "value"),
					value,
					baseUrl: typeof body.baseUrl === "string" ? body.baseUrl : undefined,
				});
				const apis = apisFor(profile);
				if (request.method === "DELETE") {
					const index = apis.indexOf(name);
					if (index >= 0) apis.splice(index, 1);
				} else if (!apis.includes(name)) apis.push(name);
				io.send(response, 200, {
					ok: true,
					type: "credential.profile",
					success: true,
					profile: profileJson(profile, apis),
				});
				return true;
			}
			if (path === "/environments" && request.method === "GET") {
				io.send(response, 200, listBody());
				return true;
			}
			if (path === "/environments" && request.method === "POST") {
				const body = await io.readJson(request);
				const name = typeof body.name === "string" ? body.name : "";
				if (name.length === 0 || environments.has(name)) {
					io.fail(response, 400, "invalid");
					return true;
				}
				nextId += 1;
				environments.set(name, {
					id: `env-${nextId}`,
					name,
					credentialProfileId: null,
					safeForThirdParties: false,
					proxyAiCredentials: false,
					updates: 0,
				});
				io.send(response, 201, listBody());
				return true;
			}
			const environmentMatch = /^\/environments\/([^/]+)$/.exec(path);
			if (environmentMatch?.[1] && request.method === "PUT") {
				const id = decodeURIComponent(environmentMatch[1]);
				const row = [...environments.values()].find((item) => item.id === id);
				if (!row) {
					io.fail(response, 404, "not_found");
					return true;
				}
				const body = await io.readJson(request);
				if (typeof body.credentialProfileId === "string") row.credentialProfileId = body.credentialProfileId;
				if (typeof body.safeForThirdParties === "boolean") row.safeForThirdParties = body.safeForThirdParties;
				if (typeof body.proxyAiCredentials === "boolean") row.proxyAiCredentials = body.proxyAiCredentials;
				row.updates += 1;
				io.send(response, 200, { success: true, environment: environmentJson(row) });
				return true;
			}
			return false;
		},
	};
}
