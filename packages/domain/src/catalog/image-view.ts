import type { AgentImage, Bug, FeatureRequest, FeatureStage, ImageStatus, Severity } from "./types.ts";

export const NOTHING_REQUESTED = "Nothing requested yet.";
export const NO_OPEN_BUGS = "No open bugs on this version.";
export const NOT_DEPLOYED = "Not deployed yet";
export const INITIAL_IMAGE = "support";

export type ImageFilter = "all" | "Needs attention" | "bugs" | "features";

export interface ImageKpi {
	readonly label: string;
	readonly value: string;
	readonly delta: string;
	readonly deltaColor: string;
}

export interface ImageFilterChip {
	readonly id: ImageFilter;
	readonly label: string;
	readonly on: boolean;
}

export interface ImageRowView {
	readonly id: string;
	readonly name: string;
	readonly tag: string;
	readonly tint: string;
	readonly version: string;
	readonly updated: string;
	readonly deployed: number;
	readonly bugCount: number;
	readonly featureCount: number;
	readonly bugColor: string;
	readonly status: ImageStatus;
	readonly statusStyle: string;
	readonly on: boolean;
	readonly rowStyle: string;
}

export interface BugView {
	readonly id: string;
	readonly title: string;
	readonly sev: Severity;
	readonly sevStyle: string;
	readonly meta: string;
}

export interface FeatureView {
	readonly id: string;
	readonly title: string;
	readonly stage: FeatureStage;
	readonly stageStyle: string;
	readonly meta: string;
}

export interface ImageDetailView {
	readonly id: string;
	readonly name: string;
	readonly role: string;
	readonly tint: string;
	readonly tag: string;
	readonly version: string;
	readonly nextVersion: string;
	readonly updatedFull: string;
	readonly status: ImageStatus;
	readonly statusStyle: string;
	readonly deployedFull: string;
	readonly onLatest: string;
	readonly bugCount: number;
	readonly featureCount: number;
	readonly noBugs: boolean;
	readonly noFeatures: boolean;
	readonly bugBadgeBg: string;
	readonly bugBadgeFg: string;
	readonly bugs: readonly BugView[];
	readonly features: readonly FeatureView[];
}

export interface ImageCatalogView {
	readonly count: string;
	readonly attention: number;
	readonly hasAttention: boolean;
	readonly kpis: readonly ImageKpi[];
	readonly filters: readonly ImageFilterChip[];
	readonly rows: readonly ImageRowView[];
	readonly detail: ImageDetailView;
}

export function updatedThisWeek(updated: string): boolean {
	return /h ago/.test(updated) || (/day/.test(updated) && Number.parseInt(updated, 10) <= 7);
}

export function onLatestLine(deployed: number, onLatest: number): string {
	if (deployed === 0) return NOT_DEPLOYED;
	return `${onLatest} of ${deployed} (${Math.round((onLatest / deployed) * 100)}%)`;
}

export function attentionCount(images: readonly AgentImage[]): number {
	return images.filter((image) => image.status === "Needs attention").length;
}

function pill(background: string, color: string): string {
	return `height: 22px; padding: 0 8px; border-radius: 999px; background: ${background}; color: ${color}; font-size: 12px; font-weight: 500; display: inline-flex; align-items: center; flex: none; white-space: nowrap`;
}

function imageStatusStyle(status: ImageStatus): string {
	if (status === "Stable") return pill("#04b84c14", "#00692a");
	if (status === "Needs attention") return pill("#fa423e14", "#911e1b");
	if (status === "Beta") return pill("#0285ff14", "#004f99");
	return pill("rgba(13,13,13,.06)", "#5d5d5d");
}

function severityStyle(severity: Severity): string {
	const base =
		severity === "High"
			? pill("#fa423e14", "#911e1b")
			: severity === "Medium"
				? pill("#fb6a2214", "#923b0f")
				: pill("rgba(13,13,13,.06)", "#5d5d5d");
	return `${base}; width: 64px; justify-content: center`;
}

function stageStyle(stage: FeatureStage): string {
	if (stage === "In progress") return pill("#924ff714", "#532d8d");
	if (stage === "In review") return pill("#0285ff14", "#004f99");
	if (stage === "Planned") return pill("#04b84c14", "#00692a");
	return pill("rgba(13,13,13,.06)", "#5d5d5d");
}

function rowStyle(on: boolean): string {
	const background = on ? "rgba(1,105,204,.08)" : "transparent";
	return `display: grid; grid-template-columns: minmax(200px, 2fr) 90px 120px 90px 70px 80px 110px; gap: 12px; align-items: center; width: 100%; min-height: 56px; padding: 8px 20px; border: 0; border-bottom: 1px solid rgba(13,13,13,.06); text-align: left; color: #282828; font-size: 14px; background: ${background}`;
}

function shown(image: AgentImage, filter: ImageFilter): boolean {
	if (filter === "all") return true;
	if (filter === "bugs") return image.bugs.length > 0;
	if (filter === "features") return image.features.length > 0;
	return image.status === filter;
}

function bugMeta(bug: Bug): string {
	const accounts = bug.reports === 1 ? "account" : "accounts";
	return `${bug.id} · open ${bug.age} · reported by ${bug.reports} ${accounts}`;
}

function featureMeta(feature: FeatureRequest): string {
	const accounts = feature.votes === 1 ? "account" : "accounts";
	return `${feature.id} · requested by ${feature.votes} ${accounts}`;
}

function detail(image: AgentImage): ImageDetailView {
	return {
		id: image.id,
		name: image.name,
		role: image.role,
		tint: image.tint,
		tag: image.tag,
		version: image.version,
		nextVersion: image.nextVersion,
		updatedFull: image.updatedFull,
		status: image.status,
		statusStyle: imageStatusStyle(image.status),
		deployedFull: `${image.deployed} ${image.deployed === 1 ? "account" : "accounts"}`,
		onLatest: onLatestLine(image.deployed, image.onLatest),
		bugCount: image.bugs.length,
		featureCount: image.features.length,
		noBugs: image.bugs.length === 0,
		noFeatures: image.features.length === 0,
		bugBadgeBg: image.bugs.length > 0 ? "#fa423e14" : "rgba(13,13,13,.06)",
		bugBadgeFg: image.bugs.length > 0 ? "#911e1b" : "#5d5d5d",
		bugs: image.bugs.map((bug) => ({
			id: bug.id,
			title: bug.title,
			sev: bug.sev,
			sevStyle: severityStyle(bug.sev),
			meta: bugMeta(bug),
		})),
		features: image.features.map((feature) => ({
			id: feature.id,
			title: feature.title,
			stage: feature.stage,
			stageStyle: stageStyle(feature.stage),
			meta: featureMeta(feature),
		})),
	};
}

export function imageCatalogView(
	images: readonly AgentImage[],
	filter: ImageFilter,
	selectedId: string,
): ImageCatalogView {
	const visible = images.filter((image) => shown(image, filter));
	const bugsTotal = images.reduce((total, image) => total + image.bugs.length, 0);
	const highBugs = images.reduce((total, image) => total + image.bugs.filter((bug) => bug.sev === "High").length, 0);
	const features = images.reduce((total, image) => total + image.features.length, 0);
	const attention = attentionCount(images);
	const selected = images.find((image) => image.id === selectedId) ?? images[0];
	if (!selected) {
		throw new Error("The image catalog has no image.");
	}
	const filterRows = [
		["all", "All"],
		["Needs attention", "Needs attention"],
		["bugs", "With bugs"],
		["features", "With requests"],
	] as const satisfies readonly (readonly [ImageFilter, string])[];
	const filters: ImageFilterChip[] = filterRows.map(([id, label]) => ({ id, label, on: filter === id }));
	return {
		count: `${visible.length} of ${images.length}`,
		attention,
		hasAttention: attention > 0,
		kpis: [
			{
				label: "Images",
				value: String(images.length),
				delta: `${images.filter((image) => image.status === "Stable").length} stable · ${images.filter((image) => image.status === "Beta" || image.status === "Draft").length} beta or draft`,
				deltaColor: "#5d5d5d",
			},
			{
				label: "Deployments",
				value: String(images.reduce((total, image) => total + image.deployed, 0)),
				delta: `${images.reduce((total, image) => total + (image.deployed - image.onLatest), 0)} behind the latest version`,
				deltaColor: "#923b0f",
			},
			{
				label: "Open bugs",
				value: String(bugsTotal),
				delta: `${highBugs} high severity`,
				deltaColor: highBugs > 0 ? "#911e1b" : "#5d5d5d",
			},
			{
				label: "Features requested",
				value: String(features),
				delta: `${images.reduce((total, image) => total + image.features.filter((feature) => feature.stage === "In progress").length, 0)} in progress`,
				deltaColor: "#532d8d",
			},
			{
				label: "Updated this week",
				value: String(images.filter((image) => updatedThisWeek(image.updated)).length),
				delta: `of ${images.length} images`,
				deltaColor: "#5d5d5d",
			},
		],
		filters,
		rows: visible.map((image) => {
			const on = selected.id === image.id;
			const bugColor = image.bugs.some((bug) => bug.sev === "High")
				? "#911e1b"
				: image.bugs.length > 0
					? "#923b0f"
					: "#8f8f8f";
			return {
				id: image.id,
				name: image.name,
				tag: image.tag,
				tint: image.tint,
				version: image.version,
				updated: image.updated,
				deployed: image.deployed,
				bugCount: image.bugs.length,
				featureCount: image.features.length,
				bugColor,
				status: image.status,
				statusStyle: imageStatusStyle(image.status),
				on,
				rowStyle: rowStyle(on),
			};
		}),
		detail: detail(selected),
	};
}
