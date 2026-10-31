// These six plug-ins are empty on purpose. Phase 0 only registers their names.
// This file must not import cordis. kernel.ts is the only cordis import.

export function platform(): void {}

export function squads(): void {}

export function bus(): void {}

export function policy(): void {}

export function catalog(): void {}

export function conversation(): void {}

export const emptyPlugins = [platform, squads, bus, policy, catalog, conversation] as const;
