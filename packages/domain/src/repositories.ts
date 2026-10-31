import type { BusRepository } from "./bus/repository.ts";
import type { CatalogRepository } from "./catalog/repository.ts";
import type { ConversationRepository } from "./conversation/repository.ts";
import type { PlatformRepository } from "./platform/repository.ts";
import type { PolicyRepository } from "./policy/repository.ts";
import type { SquadsRepository } from "./squads/repository.ts";

export interface RepositoryBag {
	readonly platform: PlatformRepository;
	readonly squads: SquadsRepository;
	readonly bus: BusRepository;
	readonly policy: PolicyRepository;
	readonly catalog: CatalogRepository;
	readonly conversation: ConversationRepository;
}
