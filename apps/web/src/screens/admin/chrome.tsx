import { accountFilterStyle } from "@tensquads/domain";

import { css } from "#/screens/css.ts";

const header = "display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-end; justify-content: space-between";
const heading =
	"margin: 0; font-size: 28px; line-height: 34px; font-weight: 600; letter-spacing: -0.02em; color: #0d0d0d";
const sub = "margin: 4px 0 0; color: #5d5d5d";
export const adminPillRow = "display: flex; gap: 8px; flex-wrap: wrap";
const demoPill =
	"height: 22px; padding: 0 8px; border-radius: 999px; background: rgba(13,13,13,.08); font-size: 12px; font-weight: 500; display: inline-flex; align-items: center; color: #5d5d5d";
const tiles = "display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px";
const tile =
	"background: #fff; border-radius: 12px; box-shadow: 0 0 0 1px rgba(13,13,13,.08); padding: 16px; display: flex; flex-direction: column; gap: 6px";
const right = "text-align: right";

interface AdminPill {
	readonly text: string;
	readonly style: string;
	readonly contrast?: string;
}

interface AdminKpi {
	readonly label: string;
	readonly value: string;
	readonly delta: string;
	readonly deltaColor: string;
}

export function AdminIntro({ title, detail, pill }: { title: string; detail: string; pill: AdminPill }) {
	return (
		<header style={css(header)}>
			<div>
				<h1 style={css(heading)}>{title}</h1>
				<p style={css(sub)}>{detail}</p>
			</div>
			<div style={css(adminPillRow)}>
				<span style={css(demoPill)}>Demo data</span>
				<AdminPillView pill={pill} />
			</div>
		</header>
	);
}

function AdminPillView({ pill }: { pill: AdminPill }) {
	if (pill.contrast) {
		return (
			<span data-design-contrast={pill.contrast} style={css(pill.style)}>
				{pill.text}
			</span>
		);
	}
	return <span style={css(pill.style)}>{pill.text}</span>;
}

export function AdminKpiSection({ label, loop, kpis }: { label: string; loop: string; kpis: readonly AdminKpi[] }) {
	return (
		<section aria-label={label} style={css(tiles)}>
			<div data-loop={loop} data-loop-as="k" style={css("display: contents")}>
				{kpis.map((kpi) => (
					<div key={kpi.label} style={css(tile)}>
						<span style={css("font-size: 12px; color: #5d5d5d")}>{kpi.label}</span>
						<span
							style={css(
								"font-size: 24px; line-height: 30px; font-weight: 600; letter-spacing: -0.02em; color: #0d0d0d",
							)}
						>
							{kpi.value}
						</span>
						<span style={css(`font-size: 12px; color: ${kpi.deltaColor}`)}>{kpi.delta}</span>
					</div>
				))}
			</div>
		</section>
	);
}

export function AdminFilterButtons<Id extends string>({
	filters,
	onPick,
}: {
	filters: readonly { readonly id: Id; readonly label: string; readonly on: boolean }[];
	onPick: (id: Id) => void;
}) {
	return filters.map((chip) => (
		<button
			key={chip.id}
			type="button"
			data-handler="f.pick"
			data-event="onClick"
			aria-pressed={pressed(chip.on)}
			onClick={() => onPick(chip.id)}
			style={css(accountFilterStyle(chip.on))}
		>
			{chip.label}
		</button>
	));
}

function pressed(on: boolean): "true" | "false" {
	if (on) return "true";
	return "false";
}

export function RightLabel({ children }: { children: string }) {
	return <span style={css(right)}>{children}</span>;
}
