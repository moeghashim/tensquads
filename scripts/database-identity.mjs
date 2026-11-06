import parseConnectionString from "pg-connection-string";

const blockedQueryKeys = new Set(["host", "hostaddr", "service", "sslcert", "sslkey", "sslrootcert"]);

export function connectionIdentity(url) {
	if (typeof url !== "string" || unsafeConnection(url)) return undefined;
	const config = parsedConfig(url);
	if (!config) return undefined;
	const database = databaseName(config.database);
	const host = roleIndependentHost(config.host);
	if (database === undefined || host === undefined) return undefined;
	return { database, host, endpoint: endpointId(host) };
}

export function sameDatabaseTarget(left, right) {
	if (!left || !right) return false;
	if (left.database.length === 0 || left.database !== right.database) return false;
	if (left.host.length > 0 && left.host === right.host) return true;
	return left.endpoint.length > 0 && left.endpoint === right.endpoint;
}

function unsafeConnection(url) {
	return blockedQuery(url) || encodedHostOrDatabase(url);
}

function parsedConfig(url) {
	try {
		const config = parseConnectionString(url);
		if (blockedDriverOption(config)) return undefined;
		return config;
	} catch {
		return undefined;
	}
}

function blockedDriverOption(config) {
	return Boolean(config.hostaddr || config.service || config.sslcert || config.sslkey || config.sslrootcert);
}

function databaseName(value) {
	if (typeof value !== "string") return undefined;
	const name = value.replace(/\/+$/, "");
	return name.length === 0 ? undefined : name;
}

function roleIndependentHost(value) {
	if (typeof value !== "string") return undefined;
	return value.toLowerCase().replace(/-pooler(?=\.|$)/g, "");
}

function endpointId(host) {
	const label = host.split(".")[0] ?? "";
	return label.startsWith("ep-") ? label : "";
}

function blockedQuery(url) {
	const query = url.split("#")[0]?.split("?")[1];
	if (query === undefined) return false;
	for (const part of query.split("&")) {
		if (part.length === 0) continue;
		const key = queryKey(part);
		if (key === undefined || blockedQueryKeys.has(key)) return true;
	}
	return false;
}

function queryKey(part) {
	try {
		return decodeURIComponent((part.split("=")[0] ?? "").replaceAll("+", " ")).toLowerCase();
	} catch {
		return undefined;
	}
}

function encodedHostOrDatabase(url) {
	const marker = "://";
	const scheme = url.indexOf(marker);
	if (scheme === -1) return false;
	const rest = url.slice(scheme + marker.length);
	const queryAt = rest.indexOf("?");
	const beforeQuery = queryAt === -1 ? rest : rest.slice(0, queryAt);
	const at = beforeQuery.lastIndexOf("@");
	return (at === -1 ? beforeQuery : beforeQuery.slice(at + 1)).includes("%");
}
