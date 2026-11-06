export const GRANT_MS = 24 * 60 * 60 * 1000;

export const BUILD_SKILL = "website.build";
export const PUBLISH_SKILL = "website.publish";
export const WATCH_SKILL = "competition.watch";

export interface GrantQuery {
	readonly accountId: string;
	readonly taskId: string;
	readonly skill: string;
	readonly subject: string;
	readonly slug: string | null;
	readonly ownerId: string;
	readonly now: string;
}

export interface StoredGrant {
	readonly accountId: string;
	readonly taskId: string;
	readonly skill: string;
	readonly subject: string;
	readonly slug: string | null;
	readonly saidYes: string;
	readonly saidAt: string;
	readonly expiresAt: string;
}

export function grantAllows(row: StoredGrant | null, query: GrantQuery): boolean {
	if (!row) return false;
	if (row.accountId !== query.accountId) return false;
	if (row.taskId !== query.taskId) return false;
	if (row.skill !== query.skill) return false;
	if (row.subject !== query.subject) return false;
	if (row.slug !== query.slug) return false;
	if (row.saidYes !== query.ownerId) return false;
	const nowMs = Date.parse(query.now);
	const expiresMs = Date.parse(row.expiresAt);
	if (!Number.isFinite(nowMs) || !Number.isFinite(expiresMs)) return false;
	return nowMs < expiresMs;
}

export function syntheticGrant(query: GrantQuery): StoredGrant {
	const nowMs = Date.parse(query.now);
	const base = Number.isFinite(nowMs) ? nowMs : Date.parse("2026-11-05T12:00:00.000Z");
	return {
		accountId: query.accountId,
		taskId: query.taskId,
		skill: query.skill,
		subject: query.subject,
		slug: query.slug,
		saidYes: query.ownerId,
		saidAt: query.now,
		expiresAt: new Date(base + GRANT_MS).toISOString(),
	};
}
