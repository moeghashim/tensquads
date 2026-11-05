import { MachineFault, type MachineFaultCode } from "@tensquads/kernel";

const text: Record<MachineFaultCode, string> = {
	rate_limited: "The machine service is busy. Try again later.",
	limit_reached: "The account has reached its machine limit.",
	billing_required: "The account needs a paid plan before this machine can start.",
	out_of_capacity: "No machine is free right now.",
	data_expired: "The stopped machine data is no longer available.",
	stop_refused: "The machine refused to stop.",
	save_failed: "The template save failed.",
	unavailable: "The machine service is unavailable.",
};

const closedWord = /boat|sandbox|snapshot|credential|proxy/i;

export function machineFault(code: MachineFaultCode, message = text[code]): MachineFault {
	if (closedWord.test(message)) {
		return new MachineFault("unavailable", text.unavailable);
	}
	return new MachineFault(code, message);
}

export function missingMachine(): MachineFault {
	return new MachineFault("unavailable", "No machine for this agent.");
}

export function notConfigured(message = "The machine service is not configured."): MachineFault {
	return new MachineFault("unavailable", message);
}

export interface ErrorFacts {
	readonly status: number;
	readonly code: string;
}

export async function readErrorBody(response: Response): Promise<ErrorFacts> {
	let code = "";
	try {
		const parsed = JSON.parse(await response.text()) as { code?: unknown; error?: { code?: unknown } };
		if (typeof parsed.code === "string") code = parsed.code;
		else if (typeof parsed.error?.code === "string") code = parsed.error.code;
	} catch {
		code = "";
	}
	return { status: response.status, code };
}

export function faultFromStatus(facts: ErrorFacts, duringStop: boolean): MachineFault {
	if (facts.status === 404) return missingMachine();
	if (facts.status === 429 && facts.code === "limit_reached") return machineFault("limit_reached");
	if (facts.status === 429) return machineFault("rate_limited");
	if (facts.status === 402) return machineFault("billing_required");
	if (facts.status === 503) return machineFault("out_of_capacity");
	if (facts.status === 409 && facts.code === "snapshot_data_expired") return machineFault("data_expired");
	if (facts.status === 409 && duringStop) return machineFault("stop_refused");
	return machineFault("unavailable");
}
