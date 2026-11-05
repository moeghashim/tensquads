import { PENDING_TASK_WINDOW_MS } from "@tensquads/adapters/pending-window";

// One 30-second bound for a workspace write and the read that follows it.
export function bounded<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> {
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
		clearBoundedTimer(timer);
	});
}

function clearBoundedTimer(timer: ReturnType<typeof setTimeout> | undefined): void {
	if (timer !== undefined) clearTimeout(timer);
}
