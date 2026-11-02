import { PENDING_TASK_WINDOW_MS } from "@tensquads/adapters/pending-window";

function bounded<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> {
	const controller = new AbortController();
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<never>((_resolve, reject) => {
		timer = setTimeout(() => {
			controller.abort();
			reject(new DOMException("The operation was aborted.", "AbortError"));
		}, PENDING_TASK_WINDOW_MS);
	});
	const work = Promise.resolve().then(() => run(controller.signal));
	void work.then(
		() => undefined,
		() => undefined,
	);
	return Promise.race([work, timeout]).finally(() => {
		if (timer !== undefined) {
			clearTimeout(timer);
		}
	});
}

export async function runDecision(
	pending: { current: boolean },
	work: (signal: AbortSignal) => Promise<unknown>,
	refresh: () => Promise<unknown>,
): Promise<void> {
	if (pending.current) {
		return;
	}
	pending.current = true;
	try {
		await bounded(work);
	} catch {
		// The write settled with an error. The page reads the data again.
	}
	try {
		await bounded(() => refresh());
	} catch {
		// The refresh settled with an error. The guard still clears.
	} finally {
		pending.current = false;
	}
}
