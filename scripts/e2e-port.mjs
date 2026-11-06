import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";

const defaultPort = 3000;
const rangeStart = 20000;
const rangeSpan = 20000;

export function appOrigin(port = currentPort()) {
	return `http://localhost:${port}`;
}

export function parsePort(raw) {
	if (!/^[1-9]\d{0,4}$/.test(raw)) {
		throw new Error("TS_E2E_PORT must be a port from 1 to 65535.");
	}
	const port = Number(raw);
	if (port > 65535) {
		throw new Error("TS_E2E_PORT must be a port from 1 to 65535.");
	}
	return port;
}

function currentPort() {
	const raw = process.env.TS_E2E_PORT;
	if (raw === undefined || raw === "") return defaultPort;
	return parsePort(raw);
}

export function stablePort(root) {
	const hash = createHash("sha256").update(root).digest();
	return rangeStart + (hash.readUInt32BE(0) % rangeSpan);
}

function worktreeRoot() {
	try {
		return execFileSync("git", ["rev-parse", "--show-toplevel"], {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		}).trim();
	} catch {
		return fileURLToPath(new URL("..", import.meta.url));
	}
}

function familyFree(port, host) {
	return new Promise((resolve) => {
		const server = createServer();
		server.unref();
		server.once("error", (error) => {
			const code = typeof error === "object" && error !== null && "code" in error ? error.code : "";
			// This machine has no IPv6 localhost. Nothing can occupy ::1.
			resolve(code === "EADDRNOTAVAIL" || code === "EAFNOSUPPORT" || code === "EPROTONOSUPPORT");
		});
		server.listen({ port, host, exclusive: true, ipv6Only: host.includes(":") }, () => {
			server.close(() => resolve(true));
		});
	});
}

// Vite on this Mac listens on ::1. localhost can resolve to that address.
// A port is free only when both localhost families can take it.
function listenFree(port) {
	return familyFree(port, "127.0.0.1").then((free) => (free ? familyFree(port, "::1") : false));
}

export async function choosePort(preferred, isFree) {
	if (await isFree(preferred)) return preferred;
	for (let offset = 1; offset < rangeSpan; offset += 1) {
		const port = rangeStart + ((preferred - rangeStart + offset) % rangeSpan);
		if (await isFree(port)) return port;
	}
	throw new Error("No free port was found for this worktree.");
}

// CI keeps port 3000 when TS_E2E_PORT is unset. A laptop picks a free port from the worktree path.
export async function resolveE2ePort() {
	const raw = process.env.TS_E2E_PORT;
	if (raw !== undefined && raw !== "") {
		const port = parsePort(raw);
		if (process.env.TS_E2E_PORT_READY === "1") return port;
		if (!(await listenFree(port))) {
			throw new Error(`TS_E2E_PORT ${port} is already in use.`);
		}
		process.env.TS_E2E_PORT = String(port);
		process.env.TS_E2E_PORT_READY = "1";
		return port;
	}
	const port = process.env.CI ? defaultPort : await choosePort(stablePort(worktreeRoot()), listenFree);
	process.env.TS_E2E_PORT = String(port);
	process.env.TS_E2E_PORT_READY = "1";
	return port;
}
