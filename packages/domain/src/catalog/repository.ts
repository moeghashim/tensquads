import type { AccountScope } from "../scope.ts";
import type { AgentImage, CatalogCounts } from "./types.ts";

// Catalog rows are platform data. They have no account_id. The call still requires a scope.
export interface CatalogRepository {
	listImages(scope: AccountScope): Promise<readonly AgentImage[]>;
	counts(scope: AccountScope): Promise<CatalogCounts>;
}
