import type { AccountScope } from "../scope.ts";
import type { Account, DailyRevenue, OverviewTile, Plan, PlatformTotals } from "./types.ts";

export interface PlatformRepository {
	listAccounts(scope: AccountScope): Promise<readonly Account[]>;
	totals(scope: AccountScope): Promise<PlatformTotals>;
	listPlans(scope: AccountScope): Promise<readonly Plan[]>;
	overviewTiles(scope: AccountScope): Promise<readonly OverviewTile[] | null>;
	dailyRevenue(scope: AccountScope): Promise<readonly DailyRevenue[]>;
}
