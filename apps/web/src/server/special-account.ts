export const specialAccountCookie = "ts_special_account";

export const specialAccountPattern = /^[A-Za-z0-9_-]+$/;

export const specialAccountMaxAge = 60 * 60;

const openedSeparator = ".";

export function specialAccountValue(accountId: string, openedAt: number): string {
	if (!specialAccountPattern.test(accountId) || !Number.isSafeInteger(openedAt) || openedAt < 0) {
		throw new Error("The account id is not valid.");
	}
	return `${accountId}${openedSeparator}${openedAt}`;
}

// The open time is inside the value. Age is the server clock minus that time.
// A time after one hour is rejected. The value is not signed.
export function accountFromSpecialCookie(value: string, now: number): string | null {
	const split = value.lastIndexOf(openedSeparator);
	if (split <= 0) return null;
	const accountId = value.slice(0, split);
	const stamp = value.slice(split + 1);
	if (!specialAccountPattern.test(accountId) || !/^[0-9]+$/.test(stamp)) return null;
	const openedAt = Number(stamp);
	if (!Number.isSafeInteger(openedAt)) return null;
	if (now - openedAt > specialAccountMaxAge * 1000) return null;
	return accountId;
}

export const specialAccountCookieOptions = {
	httpOnly: true,
	secure: true,
	sameSite: "lax" as const,
	maxAge: specialAccountMaxAge,
	path: "/",
};
