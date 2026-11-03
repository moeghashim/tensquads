import { deleteCookie, getCookie, setCookie } from "@tanstack/react-start/server";

import {
	accountFromSpecialCookie,
	specialAccountCookie,
	specialAccountCookieOptions,
	specialAccountValue,
} from "./special-account.ts";

export function readSpecialAccount(now = Date.now()): string | null {
	const value = getCookie(specialAccountCookie);
	if (value === undefined) return null;
	return accountFromSpecialCookie(value, now);
}

export function writeSpecialAccount(accountId: string, openedAt = Date.now()): void {
	setCookie(specialAccountCookie, specialAccountValue(accountId, openedAt), specialAccountCookieOptions);
}

export function clearSpecialAccount(): void {
	deleteCookie(specialAccountCookie, { path: specialAccountCookieOptions.path });
}
