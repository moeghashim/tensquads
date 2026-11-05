// The plan's three diagrams, redrawn after the originals, with the build status
// on each part. See ../README.md for the status sources. Plain HTML, CSS and SVG.
import { BUILT, LABEL, PHASES, PLANNED, PROGRESS, SCREENS } from "./status.mjs";

const css = `<style>
.dg{margin:20px 0 32px;font-size:14px;line-height:20px;color:#282828}
.dg-lead{font-size:17px;line-height:24px;color:#0d0d0d;font-weight:600;margin:0 0 16px}
.dg-note{font-size:13px;line-height:19px;color:#5d5d5d;margin:12px 0 0}
.legend{display:flex;flex-wrap:wrap;gap:8px;align-items:center;font-size:13px;color:#5d5d5d}
.pill{display:inline-flex;align-items:center;gap:6px;height:22px;padding:0 9px;border-radius:999px;font-size:12px;font-weight:500;white-space:nowrap}
.pill::before{content:"";width:7px;height:7px;border-radius:999px;flex:none}
.pill.built{background:#04b84c14;color:#00692a}.pill.built::before{background:#00a240}
.pill.progress{background:#fff1d1;color:#7a4a00}.pill.progress::before{background:#e39b00}
.pill.planned{background:#f3f3f3;color:#5d5d5d}.pill.planned::before{background:transparent;box-shadow:inset 0 0 0 1.5px #8f8f8f}
.bx{position:relative;border-radius:12px;background:#fff;box-shadow:0 0 0 1px rgba(13,13,13,.14);padding:14px 14px 12px;text-align:center}
.bx b{display:block;color:#0d0d0d;font-size:15px;line-height:21px;font-weight:600}
.bx small{display:block;color:#5d5d5d;font-size:13px;line-height:19px;margin-top:3px}
.bx .pill{margin-top:10px}
.bx.built{box-shadow:0 0 0 1.5px #00a240;background:#f5fcf7}
.bx.progress{box-shadow:none;outline:1.5px dashed #e39b00;outline-offset:-1.5px;background:#fffaf0}
.bx.planned{background:#fafafa}.bx.planned b{color:#5d5d5d}
.frame{border-radius:14px;box-shadow:0 0 0 1px rgba(13,13,13,.14);padding:16px;background:#fff}
.frame>.ft{font-weight:600;color:#0d0d0d;font-size:15px;margin:0 0 12px;text-align:left}
.g3{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
.g4{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
.dn{height:22px;display:flex;justify-content:center}.dn::before{content:"";width:1.5px;background:#bdbdbd}
.dn.dash::before{background:repeating-linear-gradient(#bdbdbd 0 4px,transparent 4px 7px)}
.top{background:#f3f3f3}
.screens{display:flex;flex-wrap:wrap;justify-content:center;gap:6px;margin-top:10px}
.sc{display:inline-flex;align-items:center;gap:6px;height:24px;padding:0 9px;border-radius:999px;font-size:12px;background:#fff;box-shadow:0 0 0 1px rgba(13,13,13,.1);color:#282828}
.sc i{width:7px;height:7px;border-radius:999px;flex:none}
.sc.built i{background:#00a240}.sc.progress i{background:#e39b00}.sc.planned i{box-shadow:inset 0 0 0 1.5px #8f8f8f}
.sc.planned{color:#8f8f8f}
.ph{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
.ph .bx{text-align:left;padding:12px}
.ph .bx b{font-size:14px}
.bar{height:6px;border-radius:999px;background:rgba(13,13,13,.08);overflow:hidden;margin-top:10px}
.bar span{display:block;height:100%;background:#00a240}
.cnt{font-size:12px;color:#5d5d5d;margin-top:4px}
.seq{overflow-x:auto}.seq svg{display:block;min-width:720px;width:100%;height:auto}
.hero{border-radius:16px;background:#181818;color:#fff;padding:22px 22px 20px;margin:8px 0 28px}
.hero h2{color:#fff;margin:0;font-size:24px;line-height:30px}
.hero p{color:#c9c9c9;margin:6px 0 0;font-size:15px}
.hero .big{display:flex;align-items:baseline;gap:10px;margin-top:14px}
.hero .big strong{font-size:44px;line-height:48px;letter-spacing:-.02em}
.hero .big span{color:#c9c9c9}
.hero .bar{background:rgba(255,255,255,.15);height:8px}
.now{margin-top:14px;font-size:14px;color:#e8e8e8}.now b{color:#fff}
@media (max-width:760px){.g3{grid-template-columns:1fr 1fr}.g4{grid-template-columns:1fr 1fr}.ph{grid-template-columns:1fr 1fr}.dn{height:12px}.dn::before{display:none}}
</style>`;

const pill = (s) => `<span class="pill ${s}">${LABEL[s]}</span>`;
const box = (s, title, sub, extra = "") => `<div class="bx ${s}"><b>${title}</b>${sub ? `<small>${sub}</small>` : ""}${extra}${pill(s)}</div>`;
const legend = `<div class="legend">${pill(BUILT)}${pill(PROGRESS)}${pill(PLANNED)}<span>Status comes from git: a task is built when its branch is merged into main.</span></div>`;

function layers(st) {
	const web = st.of(SCREENS.flatMap(([, , t]) => t));
	const built = SCREENS.filter(([n, , t]) => n && st.of(t) === BUILT).length;
	const chips = SCREENS.map(([n, name, t]) => `<span class="sc ${st.of(t)}"><i></i>${n ? `${n} ` : ""}${name}</span>`).join("");
	const f = st.of(["00-foundation"]);
	const later = st.of(["04-machine-trial"]);
	const core = [
		["Platform", "accounts, plans, admin totals", ["00-foundation", "03-super-admin"]],
		["Squads and Agents", "agents, skills, autonomy, machine", ["02-agents", "02-agent-detail"]],
		["Bus and Shared State", "events, state writes, nextEvent()", ["02-traffic"]],
		["Policy", "rules, limits, approvals", ["02-overview", "02-rules"]],
		["Catalog", "agent images, bugs, features", ["03-super-admin"]],
		["Conversation", "master thread, send(), dock", ["02-frame", "02-chat"]],
	];
	return `<div class="dg" role="img" aria-label="Four layers: web app, core, interfaces, adapters, each with its build status.">
<p class="dg-lead">Each screen uses the core. Machines and services connect through interfaces.</p>
<div class="bx top ${web}"><b>Web app: TanStack Start on Cloudflare Workers (PI-Starter tooling), Clerk sessions</b><small>Ten screens from the design canvas, three shells: public, workspace, super-admin. ${built} of 10 built.</small><div class="screens">${chips}</div>${pill(web)}</div>
<div class="dn"></div>
<div class="frame"><p class="ft">Core: one cordis context. Each domain area is one plug-in.</p><div class="g3">${core.map(([t, s, tasks]) => box(st.of(tasks), t, s)).join("")}</div></div>
<div class="dn"></div>
<div class="frame"><p class="ft">Interfaces: the boundary layer. The domain reaches outside only here.</p><div class="g4">${["MachineProvider", "EventBus", "IntegrationGateway", "Repositories"].map((t) => box(f, t, "")).join("")}</div>
<p class="dg-note" style="text-align:left">Decider is the fifth interface. It exists, with no adapter in version 1 (decision 19).</p></div>
<div class="g4" style="margin-top:0">${["", "", "", ""].map(() => '<div class="dn"></div>').join("")}</div>
<div class="g4">
${box(f, "Test machines", "version 1<br>host, CPU and uptime from the design")}
${box(f, "In-memory bus", "version 1<br>nextEvent() steps the design's events")}
${box(f, "Placeholders", "version 1<br>Shopify, Gmail, Stripe do nothing")}
${box(f, "Neon Postgres", "through Drizzle<br>account_id on each account row, the bus record")}
</div>
<div class="g4">${'<div class="dn dash"></div>'.repeat(2)}<div></div><div></div></div>
<div class="g4">
${box(later, "boat.dev machines", "later, phase 4<br>one machine per agent, keys kept outside")}
${box(later, "Cloudflare bus", "later, phase 4<br>Queues carry messages, one Durable Object per account")}
</div>
<p class="dg-note">A dashed line: the same interface, a different adapter later. The master core runs in that Durable Object (decision 17).</p>
</div>`;
}

function phases(st) {
	const cards = PHASES.map(([n, t, d, tasks]) => {
		const s = st.of(tasks);
		const done = tasks.filter((k) => st.one(k) === BUILT).length;
		const sub = tasks.length > 1 ? `<div class="bar"><span style="width:${Math.round((done / tasks.length) * 100)}%"></span></div><div class="cnt">${done} of ${tasks.length} tasks merged</div>` : "";
		return `<div class="bx ${s}"><b>${n} ${t}</b><small>${d}</small>${sub}${pill(s)}</div>`;
	}).join("");
	return `<div class="dg" role="img" aria-label="Eight phases, each with its build status.">
<p class="dg-lead">Eight phases. Each phase ends with a check. Screens follow the design order.</p>
<div class="ph">${cards}</div>
<p class="dg-note">Each phase ends with a check: make verify returns 0 in CI, the screenshots are attached, the reviewer found no fault, and Moe answered the open questions. A green phase passed its check. The final report comes after phase 3.</p>
</div>`;
}

const STEPS = [
	[0, 1, "1. Business name and mission"],
	[1, 2, "2. Task: research the market"],
	[2, 1, "3. Result: competitors, prices, sources"],
	[1, 1, "4. Check: three live URLs, each with an offer"],
	[1, 0, "5. Approval: build the site with this brief?"],
	[0, 1, "6. Approve"],
	[1, 2, "7. Task: build the landing page"],
	[2, 1, "8. Result: preview URL"],
	[1, 1, "9. Check: page is live, shows the name and the offer"],
	[1, 0, "10. Approval: publish the site?"],
	[0, 1, "11. Approve"],
	[1, 2, "12. Task: publish to slug.10squads.com"],
	[2, 1, "13. Result: published"],
];
const STROKE = { [BUILT]: "#00a240", [PROGRESS]: "#e39b00", [PLANNED]: "#a8a8a8" };
const FILL = { [BUILT]: "#f5fcf7", [PROGRESS]: "#fffaf0", [PLANNED]: "#f3f3f3" };
const esc = (s) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;");

function sequence(st) {
	const X = [160, 480, 800];
	const lanes = [
		["You, in the chat", "", st.of(["02-chat"])],
		["Master core", "Cloudflare Durable Object", st.of(["04-machine-trial", "05-proof-of-concept"])],
		["Squad machines", "boat.dev, one per squad", st.of(["04-machine-trial", "05-proof-of-concept"])],
	];
	const step = st.of(["05-proof-of-concept"]);
	const top = 120;
	const gap = 54;
	const h = top + STEPS.length * gap + 20;
	const heads = lanes
		.map(([t, s, ls], i) => {
			const x = X[i];
			return `<rect x="${x - 140}" y="16" width="280" height="64" rx="10" fill="${FILL[ls]}" stroke="${STROKE[ls]}" stroke-width="1.5"${ls === PROGRESS ? ' stroke-dasharray="5 4"' : ""}/>
<text x="${x}" y="${s ? 42 : 52}" text-anchor="middle" font-size="16" font-weight="600" fill="#0d0d0d">${t}</text>
${s ? `<text x="${x}" y="62" text-anchor="middle" font-size="13" fill="#5d5d5d">${s}</text>` : ""}
<text x="${x}" y="100" text-anchor="middle" font-size="11" font-weight="600" fill="${STROKE[ls] === "#a8a8a8" ? "#5d5d5d" : STROKE[ls]}">${LABEL[ls].toUpperCase()}</text>
<line x1="${x}" y1="108" x2="${x}" y2="${h - 10}" stroke="#d4d4d4" stroke-dasharray="4 4"/>`;
		})
		.join("");
	const color = STROKE[step];
	const rows = STEPS.map(([a, b, label], i) => {
		const y = top + i * gap + 30;
		if (a === b) {
			const x = X[a];
			return `<path d="M${x} ${y - 14} h36 v24 h-36" fill="none" stroke="#0169cc" stroke-width="1.5"/><path d="M${x} ${y + 10} l7 -4 v8 z" fill="#0169cc"/>
<text x="${x + 46}" y="${y + 2}" font-size="13" fill="#5d5d5d">${esc(label)}</text>`;
		}
		const [x1, x2] = [X[a], X[b]];
		const dir = x2 > x1 ? -1 : 1;
		return `<line x1="${x1}" y1="${y}" x2="${x2 + dir * 2}" y2="${y}" stroke="${color}" stroke-width="1.5"${step === PLANNED ? ' stroke-dasharray="6 4"' : ""}/>
<path d="M${x2} ${y} l${dir * 9} -4.5 v9 z" fill="${color}"/>
<text x="${(x1 + x2) / 2}" y="${y - 9}" text-anchor="middle" font-size="13" fill="#282828">${esc(label)}</text>`;
	}).join("");
	return `<div class="dg">
<p class="dg-lead">One run: research, a brief, your yes, a landing page, your yes, publish ${pill(step)}</p>
<div class="seq"><svg viewBox="0 0 960 ${h}" role="img" aria-label="Thirteen bus events between you, the master core and the squad machines, with two checks and two approvals. Status: ${LABEL[step]}." font-family="Inter,system-ui,sans-serif">${heads}${rows}</svg></div>
<p class="dg-note">Blue loops are checks that code runs. Every arrow is one event on the bus and shows on the traffic screen. A dashed arrow is not built yet; it turns green when phase 5 merges.</p>
</div>`;
}

// The status summary at the top of the plan page.
export function summary(st, sha, date) {
	const tasks = [...new Set(PHASES.flatMap(([, , , t]) => t))];
	const done = tasks.filter((t) => st.one(t) === BUILT).length;
	const now = tasks.filter((t) => st.one(t) === PROGRESS);
	const current = PHASES.find(([, , , t]) => st.of(t) !== BUILT);
	return `<div class="hero"><h2>Where the build is</h2><p>Plan at commit ${sha}, ${date}. Every part of the plan below shows its status.</p>
<div class="big"><strong>${done} of ${tasks.length}</strong><span>tasks merged into main</span></div>
<div class="bar"><span style="width:${Math.round((done / tasks.length) * 100)}%"></span></div>
<div class="now">${current ? `Current phase: <b>${current[0]} ${current[1]}</b>. ` : ""}${now.length ? `In progress: <b>${now.join(", ")}</b>.` : "Nothing in progress."}</div></div>
${legend}`;
}

export const DIAGRAMS = { "system layers": layers, "build phases": phases, "proof of concept": sequence };
export const DIAGRAM_CSS = css;
