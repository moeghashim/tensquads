export function pill(background: string, color: string): string {
	return `height: 22px; padding: 0 8px; border-radius: 999px; background: ${background}; color: ${color}; font-size: 12px; font-weight: 500; display: inline-flex; align-items: center; flex: none; white-space: nowrap`;
}

const taskColor = ["#0285ff14", "#004f99"] as const;

const kindColors: Record<string, readonly [string, string]> = {
	Task: taskColor,
	Result: ["#04b84c14", "#00692a"],
	Request: taskColor,
	Relay: ["#924ff714", "#532d8d"],
	Escalation: ["#fb6a2214", "#923b0f"],
	Approval: ["#04b84c14", "#00692a"],
	Declined: ["#fa423e14", "#911e1b"],
};

export function kindStyle(kind: string): string {
	const colors = kindColors[kind] ?? taskColor;
	return `${pill(colors[0], colors[1])}; width: 84px; justify-content: center`;
}

export function navStyle(on: boolean): string {
	const color = on ? "#0d0d0d" : "#414141";
	const weight = on ? "600" : "400";
	const background = on ? "rgba(13,13,13,.08)" : "transparent";
	return `display: flex; align-items: center; gap: 10px; min-height: 40px; padding: 0 10px; border: 0; border-radius: 8px; font-size: 14px; text-align: left; color: ${color}; font-weight: ${weight}; background: ${background}`;
}

export function switchParts(on: boolean): {
	readonly switchBg: string;
	readonly switchJustify: string;
	readonly onStr: string;
} {
	return {
		switchBg: on ? "#181818" : "#cdcdcd",
		switchJustify: on ? "flex-end" : "flex-start",
		onStr: on ? "true" : "false",
	};
}

export function gateStyle(gate: string): string {
	if (gate === "Auto") {
		return pill("#04b84c14", "#00692a");
	}
	if (gate === "Ask first") {
		return pill("#fb6a2214", "#923b0f");
	}
	return pill("#0285ff14", "#004f99");
}
