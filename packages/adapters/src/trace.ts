import { createHash } from "node:crypto";

// Main.dc.html:991 builds a trace with Math.random. The seed and memory bus use a hash of the event id
// so the same id always has the same trace: tr_ plus the first 6 hex characters of sha256.
export function traceFor(id: string): string {
	return `tr_${createHash("sha256").update(id).digest("hex").slice(0, 6)}`;
}
