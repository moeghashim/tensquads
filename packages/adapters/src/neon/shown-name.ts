import { characterName } from "@tensquads/squadmates";

// The database keeps the design name. Callers show the character name.
export function shownAgentName(id: string, stored: string): string {
	return characterName(id) ?? stored;
}

export function shownMasterName(): string {
	return characterName("master") ?? "Petra";
}
