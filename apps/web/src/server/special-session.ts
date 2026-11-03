import { deleteCookie, getCookie, setCookie } from "@tanstack/react-start/server";

import { specialAccountCookie, specialAccountCookieOptions, specialAccountPattern } from "./special-account.ts";

export function readSpecialAccount(): string | null {
	const value = getCookie(specialAccountCookie);
	if (value === undefined || !specialAccountPattern.test(value)) {
		return null;
	}
	return value;
}

export function writeSpecialAccount(accountId: string): void {
	if (!specialAccountPattern.test(accountId)) {
		throw new Error("The account id is not valid.");
	}
	setCookie(specialAccountCookie, accountId, specialAccountCookieOptions);
}

export function clearSpecialAccount(): void {
	deleteCookie(specialAccountCookie, { path: specialAccountCookieOptions.path });
}
