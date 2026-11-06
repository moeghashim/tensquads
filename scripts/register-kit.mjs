import { register } from "node:module";
import { load } from "./kit-types-hook.mjs";

// Node does not strip TypeScript inside node_modules. Register the kit hook first.
if (typeof load !== "function") throw new Error("The kit type hook is missing.");
register("./kit-types-hook.mjs", import.meta.url);
