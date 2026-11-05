import { isSessionRefreshNeeded } from "#/server/session-error.ts";

export interface SessionRefreshDeps {
	token(): Promise<string | null>;
	reload(): void;
	signIn(): Promise<void> | void;
}

export function createSessionRefresh(deps: SessionRefreshDeps) {
	let generation = 0;
	let nextId = 1;
	let spent = false;
	let signingIn = false;
	let wave: Promise<void> | null = null;
	let waveGeneration = -1;
	let waveIds = new Set<number>();
	const open = new Set<number>();

	function noteAction(): void {
		generation += 1;
		spent = false;
		signingIn = false;
	}

	function begin(): number {
		const id = nextId;
		nextId += 1;
		open.add(id);
		return id;
	}

	function end(id: number): void {
		open.delete(id);
	}

	async function goSignIn(): Promise<void> {
		if (signingIn) return;
		signingIn = true;
		await deps.signIn();
	}

	async function finish(error: unknown, method: string, id: number): Promise<void> {
		if (!startsRefresh(error, method)) return;
		if (wave && waveGeneration === generation && !spent) waveIds.add(id);
		if (wave && waveGeneration === generation && waveIds.has(id)) {
			const seen = generation;
			try {
				await wave;
			} catch {
				if (seen === generation) await goSignIn();
			}
			return;
		}
		if (spent) {
			await goSignIn();
			return;
		}
		const seen = generation;
		waveIds = new Set(open);
		waveIds.add(id);
		try {
			await runWave(seen);
		} catch {
			if (seen === generation) await goSignIn();
		}
	}

	function runWave(seen: number): Promise<void> {
		let settle = (_error?: unknown) => undefined;
		const pending = new Promise<void>((resolve, reject) => {
			settle = (error) => {
				if (error === undefined) resolve();
				else reject(error);
			};
		});
		wave = pending;
		waveGeneration = seen;
		void (async () => {
			try {
				const token = await deps.token();
				if (typeof token !== "string" || token.length === 0) {
					throw new Error("The session token is missing.");
				}
				// A newer action keeps its own allowance. This recovery still reloads.
				if (seen === generation) {
					for (const current of open) waveIds.add(current);
					spent = true;
				}
				deps.reload();
				settle();
			} catch (error) {
				settle(error);
			} finally {
				if (wave === pending) wave = null;
			}
		})();
		return pending;
	}

	return { noteAction, begin, end, finish };
}

function startsRefresh(error: unknown, method: string): boolean {
	return isSessionRefreshNeeded(error) && (method === "GET" || method === "POST");
}
