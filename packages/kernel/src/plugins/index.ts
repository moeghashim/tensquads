// These six plug-ins are empty on purpose. This file must not import cordis.

export { bus } from "./bus.ts";
export { catalog } from "./catalog.ts";
export {
	conversation,
	noAgentReply,
	pausedReply,
	resultFor,
	route,
	skillFor,
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

export const emptyPlugins = [platform, squads, bus, policy, catalog, conversation] as const;
