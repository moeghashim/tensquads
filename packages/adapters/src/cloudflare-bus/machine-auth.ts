import type { WorkerBindings } from "./http.ts";
import { verifyMachineToken } from "./token.ts";

export async function rejectMachine(
	request: Request,
	env: WorkerBindings,
	accountId: string,
	agentId: string,
): Promise<Response | null> {
	if (!env.MACHINE_TOKEN_KEY) return new Response("The machine service is not configured.", { status: 503 });
	const header = request.headers.get("authorization") ?? "";
	const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
	const ok = await verifyMachineToken(env.MACHINE_TOKEN_KEY, token, accountId, agentId);
	if (!ok) return new Response("The token was rejected.", { status: 401 });
	return null;
}
