export type AdapterChoice = "test" | "real";

export function chooseAdapters(flag: string | undefined): AdapterChoice {
	return flag === "real" ? "real" : "test";
}
