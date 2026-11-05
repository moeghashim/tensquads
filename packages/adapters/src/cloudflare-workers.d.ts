// The adapters package does not include the generated Worker types.
// This names the one binding the approval path reads at runtime.
declare module "cloudflare:workers" {
	export const env: {
		readonly ACCOUNT_BUS?: import("./cloudflare-bus/http.ts").BusNamespace;
	};
}
