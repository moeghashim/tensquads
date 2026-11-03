export const specialAccountCookie = "ts_special_account";

export const specialAccountPattern = /^[A-Za-z0-9_-]+$/;

export const specialAccountMaxAge = 60 * 60;

export const specialAccountCookieOptions = {
	httpOnly: true,
	secure: true,
	sameSite: "lax" as const,
	maxAge: specialAccountMaxAge,
	path: "/",
};
