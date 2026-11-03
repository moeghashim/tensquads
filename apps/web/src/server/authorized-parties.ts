// Clerk accepts a session token only when its azp is one of these origins.
// Production adds its origin to this list. Customer domains stay out until then.
export const authorizedParties = ["https://tensquads.moe-678.workers.dev", "http://localhost:3000"];
