import type { IntegrationGateway } from "@tensquads/kernel";

// Every method returns the design store value. write does not change the store.
export function createPlaceholderServices(store: Readonly<Record<string, unknown>>): IntegrationGateway {
	return {
		read(key) {
			return store[key];
		},
		write(key) {
			return store[key];
		},
	};
}
