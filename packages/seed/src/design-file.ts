import designJson from "./design.json" with { type: "json" };

import type { DesignFile } from "./types.ts";

export const design = designJson as unknown as DesignFile;
