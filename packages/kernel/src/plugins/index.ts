export { bus } from "./bus.ts";
export { catalog } from "./catalog.ts";
export {
	conversation,
	type LiveStart,
	noAgentReply,
	pausedReply,
	resultFor,
	route,
	skillFor,
	storedResearchReply,
	taskPayload,
	workingReply,
} from "./conversation.ts";
export { platform } from "./platform.ts";
export { policy } from "./policy.ts";
export { squads } from "./squads.ts";

import { bus } from "./bus.ts";
import { catalog } from "./catalog.ts";
import { conversation } from "./conversation.ts";
import { platform } from "./platform.ts";
import { policy } from "./policy.ts";
import { squads } from "./squads.ts";

export const plugins = [platform, squads, bus, policy, catalog, conversation] as const;
