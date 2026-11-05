import type { PublishedEvent } from "@tensquads/kernel";

// The live module owns the one named openMaster export. This stub is the
// default export, so the build swap has no second named export.
export default function openMasterStub(): Promise<{ accept: (event: unknown) => Promise<PublishedEvent[]> } | null> {
	return Promise.resolve(null);
}
