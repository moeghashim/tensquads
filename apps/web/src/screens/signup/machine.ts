import { type BusinessKind, defaultSquadIds } from "./catalog.ts";

export type SignupStep = "choose" | "details" | "agents" | "account" | "created";

export interface SignupState {
	readonly step: SignupStep;
	readonly kind: BusinessKind | null;
	readonly name: string;
	readonly mission: string;
	readonly idea: string;
	readonly url: string;
	readonly channels: readonly string[];
	readonly platforms: readonly string[];
	readonly volume: string;
	readonly picked: readonly string[];
	readonly email: string;
	readonly password: string;
	readonly tried: boolean;
}

export function initialSignup(): SignupState {
	return {
		step: "choose",
		kind: null,
		name: "",
		mission: "",
		idea: "",
		url: "",
		channels: ["Online store"],
		platforms: ["Shopify"],
		volume: "100 to 500",
		picked: [],
		email: "",
		password: "",
		tried: false,
	};
}

export function pickKind(state: SignupState, kind: BusinessKind): SignupState {
	return { ...state, kind, step: "details", picked: defaultSquadIds(kind), tried: false };
}

export function toggleValue(values: readonly string[], value: string): readonly string[] {
	return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

export function togglePicked(state: SignupState, id: string): SignupState {
	return { ...state, picked: toggleValue(state.picked, id) };
}

export function openAccount(state: SignupState): SignupState {
	if (state.step !== "agents" || state.picked.length === 0) {
		return state;
	}
	return { ...state, step: "account", tried: false };
}

export function fieldsComplete(email: string, password: string): boolean {
	return email.trim().length > 0 && password.length > 0;
}
