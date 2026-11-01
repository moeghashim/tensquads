import { useNavigate } from "@tanstack/react-router";

import { useWorkspace } from "./context.ts";
import { kindStyle } from "./styles.ts";

export interface BusEventView {
	readonly id: string;
	readonly kind: string;
	readonly from: string;
	readonly to: string;
}

export function decorate(
	event: BusEventView,
	selectedId: string,
	masterName: string,
	names: Readonly<Record<string, string>>,
) {
	const nameOf = (id: string) => (id === "master" ? masterName : (names[id] ?? id));
	const background = event.id === selectedId ? "rgba(1,105,204,.08)" : "transparent";
	return {
		kindStyle: kindStyle(event.kind),
		route: `${nameOf(event.from)} → ${nameOf(event.to)}`,
		rowStyle: `text-align: left; border: 0; border-radius: 8px; padding: 8px; display: flex; gap: 10px; align-items: center; color: #282828; background: ${background}`,
	};
}

export function useInspect(): (id: string) => void {
	const { setSelEvent } = useWorkspace();
	const navigate = useNavigate();
	return (id: string) => {
		setSelEvent(id);
		void navigate({ to: "/traffic" });
	};
}
