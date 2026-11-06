// Every boat request stops at the deadline, even outside a flight.
// A flight passes its own abort signal. The request stops at whichever comes first.
export function deadlineFetch(fetchApi: typeof fetch, timeoutMs: number): typeof fetch {
	return (input, init) => {
		const limit = AbortSignal.timeout(timeoutMs);
		const signal = init?.signal ? AbortSignal.any([init.signal, limit]) : limit;
		return fetchApi(input, { ...init, signal });
	};
}
