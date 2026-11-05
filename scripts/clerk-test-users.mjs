import { pathToFileURL } from "node:url";

import { localSecrets } from "./write-dev-vars.mjs";

// The whole address must match. A plus tag, a shorter or longer local part, or another domain does not.
export const staleTestUserEmail = /^sq-[0-9a-f]{8}@example\.com$/i;

export const staleTestUserAgeMs = 2 * 60 * 60 * 1000;

// The company super admin stays even when a list row carries a test address.
const protectedUserId = "user_3Lazhi4zDFFw28I6hhujdsQrV4W";

const pageLimit = 10;

export function isExpiredTestUser(email, createdAtMs, nowMs) {
	if (typeof email !== "string" || !staleTestUserEmail.test(email)) return false;
	if (typeof createdAtMs !== "number" || typeof nowMs !== "number") return false;
	if (!Number.isFinite(createdAtMs) || !Number.isFinite(nowMs)) return false;
	return createdAtMs < nowMs - staleTestUserAgeMs;
}

function textEmail(entry) {
	if (!entry || typeof entry !== "object") return "";
	return typeof entry.email_address === "string" ? entry.email_address : "";
}

function onlyStaleAddress(user) {
	const emails = Array.isArray(user?.email_addresses) ? user.email_addresses : [];
	if (emails.length === 0) return "";
	let match = "";
	for (const entry of emails) {
		const email = textEmail(entry);
		if (!staleTestUserEmail.test(email)) return "";
		match = email;
	}
	return match;
}

function createdAtMs(user) {
	const value = user?.created_at;
	if (typeof value === "number") return value;
	if (typeof value === "string" && /^[0-9]+$/.test(value)) return Number(value);
	return Number.NaN;
}

function listedUsers(body) {
	if (Array.isArray(body)) return body;
	if (body && typeof body === "object" && Array.isArray(body.data)) return body.data;
	throw new Error("Clerk list users returned an unexpected list.");
}

export async function sweepExpiredTestUsers({ now, list, remove, pageSize = 100 }) {
	let offset = 0;
	let deleted = 0;
	for (let page = 0; page < pageLimit; page += 1) {
		const users = listedUsers(await list({ offset, limit: pageSize }));
		for (const user of users) {
			const id = typeof user?.id === "string" ? user.id : "";
			if (!id.startsWith("user_") || id === protectedUserId) continue;
			const email = onlyStaleAddress(user);
			if (!isExpiredTestUser(email, createdAtMs(user), now)) continue;
			await remove(id);
			deleted += 1;
		}
		if (users.length < pageSize) return deleted;
		offset += users.length;
	}
	throw new Error("Clerk list users did not end.");
}

async function clerkResponse(secret, path, method) {
	const response = await fetch(`https://api.clerk.com/v1${path}`, {
		method,
		headers: { Authorization: `Bearer ${secret}` },
	});
	if (!response.ok && !(method === "DELETE" && response.status === 404)) {
		const action = method === "DELETE" ? "delete user" : "list users";
		throw new Error(`Clerk ${action} failed with status ${response.status}.`);
	}
	return response;
}

export async function sweepClerkTestUsers(options = {}) {
	const secret = options.secret ?? localSecrets().secret;
	if (typeof secret !== "string" || secret.length === 0) {
		throw new Error("CLERK_SECRET_KEY is missing.");
	}
	const now = options.now ?? Date.now();
	const deleted = await sweepExpiredTestUsers({
		now,
		list: async ({ offset, limit }) => {
			const response = await clerkResponse(secret, `/users?limit=${limit}&offset=${offset}`, "GET");
			return response.json();
		},
		remove: async (id) => {
			await clerkResponse(secret, `/users/${id}`, "DELETE");
		},
	});
	console.log(`deleted ${deleted} stale test users`);
	return deleted;
}

function isDirectRun() {
	const entry = process.argv[1];
	if (!entry) return false;
	return import.meta.url === pathToFileURL(entry).href;
}

if (isDirectRun()) {
	sweepClerkTestUsers().catch((error) => {
		console.error(error instanceof Error ? error.message : "Clerk test user sweep failed.");
		process.exit(1);
	});
}
