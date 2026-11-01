import { clerkMiddleware } from "@clerk/tanstack-react-start/server";
import { createCsrfMiddleware, createStart } from "@tanstack/react-start";

const csrf = createCsrfMiddleware({
	filter: (ctx) => ctx.handlerType === "serverFn",
});

export const startInstance = createStart(() => {
	const secret = process.env.CLERK_SECRET_KEY ?? "";
	const requestMiddleware = secret.length > 0 ? [csrf, clerkMiddleware()] : [csrf];
	return { requestMiddleware };
});
