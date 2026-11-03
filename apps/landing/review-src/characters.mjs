// The character sheet at /review/characters. A proposal for Moe, not product code.
import { AGENT_LOOP_STATES, SQUADMATE_CSS, SQUADMATES, squadmateMarkup } from "@tensquads/squadmates";

const STATES = AGENT_LOOP_STATES.map((state) => [state.id, state.label, state.hint]);
const avatar = (mate, state, size) => squadmateMarkup(mate.id, state, size);

const byId = Object.fromEntries(SQUADMATES.map((m) => [m.id, m]));

const CSS = `<style>
.cast{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:14px;margin-top:16px}
.mate{border-radius:14px;padding:18px 16px 16px;box-shadow:0 0 0 1px rgba(13,13,13,.08);text-align:center}
.mate svg{display:block;margin:0 auto 8px}
.mate b{display:block;font-size:18px;line-height:24px;color:#0d0d0d}
.tag{display:inline-block;margin:4px 0 8px;padding:1px 8px;border-radius:6px;background:rgba(255,255,255,.75);color:#5d5d5d;font-size:12px;line-height:20px;font-weight:500}
.mate .pl{font-size:12px;color:#8f8f8f;margin:0 0 6px}
.mate p{margin:0;font-size:13px;line-height:19px;color:#5d5d5d}
.states{overflow-x:auto;margin-top:12px}
.states table{border-collapse:collapse;min-width:820px}
.states th,.states td{border:none;background:none;padding:6px 4px;text-align:center;vertical-align:top;font-size:12px;line-height:16px}
.states th{color:#0d0d0d;font-weight:600;width:84px}
.states td.who{text-align:left;font-weight:600;color:#0d0d0d;width:90px;padding-top:26px}
.states small{display:block;color:#8f8f8f;font-weight:400;margin-top:2px}
.list{max-width:440px;border-radius:16px;background:#fff;box-shadow:0 0 0 1px rgba(13,13,13,.1);padding:6px;margin-top:12px}
.row{display:grid;grid-template-columns:44px 1fr auto;gap:10px;align-items:center;padding:8px 10px;border-radius:12px}
.row.on{background:#f3f3f3}
.row .nm{display:flex;align-items:center;gap:6px;min-width:0}
.row .nm b{color:#0d0d0d;font-size:15px}
.row .nm .tag{margin:0;background:#f3f3f3;white-space:nowrap}
.row.on .nm .tag{background:#fff}
.row .msg{color:#5d5d5d;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px}
.row .t{color:#8f8f8f;font-size:12px;text-align:right}
.row .st{display:inline-block;margin-top:4px;padding:0 7px;border-radius:999px;font-size:11px;line-height:18px;background:#f3f3f3;color:#5d5d5d}
.row .st.run{background:#e7efff;color:#0169cc}.row .st.ok{background:#04b84c14;color:#00692a}.row .st.wait{background:#fff1d1;color:#7a4a00}.row .st.esc{background:#fde7e7;color:#b42318}
.sizes{display:flex;align-items:flex-end;gap:22px;flex-wrap:wrap;margin-top:12px}
.sizes div{text-align:center;font-size:12px;color:#8f8f8f}
.ask{background:#fff8e1;border-radius:12px;padding:14px 16px;margin:16px 0}
.ask ol{margin:6px 0 0;padding-left:20px}
</style>`;

const ROWS = [
	["master", "running", "on", "Pisa is checking A-1007. I'll tell you when it ships.", "3m", "Working", "run"],
	["orders", "checking", "", "Petra handed A-1007 to Pisa", "3m", "Checking", "run"],
	["support", "done", "", "Refund for Maya sent, under the limit.", "5m", "Done", "ok"],
	["inventory", "blocked", "", "Needs your yes to reorder 40 units", "12m", "Waiting for you", "wait"],
	["marketing", "escalated", "", "Ad spend hit the daily cap twice", "37m", "Escalated", "esc"],
	["finance", "waiting", "", "Weekly profit summary is ready", "1h", "Idle", ""],
	["market", "dropped", "", "No competitor changes today", "10h", "Idle", ""],
];

export function charactersPage() {
	const cast = SQUADMATES.map(
		(m) => `<div class="mate" style="background:${m.tint}">${avatar(m, "idle", 112)}<b>${m.name}</b><span class="tag">${m.role}</span><p class="pl">Named after ${m.place}</p><p>${m.line}</p></div>`,
	).join("");
	const head = `<tr><th></th>${STATES.map(([, label, hint]) => `<th>${label}<small>${hint}</small></th>`).join("")}</tr>`;
	const rows = ["master", "support", "website"]
		.map((id) => `<tr><td class="who">${byId[id].name}</td>${STATES.map(([s]) => `<td>${avatar(byId[id], s, 64)}</td>`).join("")}</tr>`)
		.join("");
	const list = ROWS.map(([id, state, on, msg, t, st, cls]) => {
		const m = byId[id];
		return `<div class="row ${on}">${avatar(m, state, 44)}<div style="min-width:0"><div class="nm"><b>${m.name}</b><span class="tag">${m.role}</span></div><div class="msg">${msg}</div></div><div class="t">${t}<br><span class="st ${cls}">${st}</span></div></div>`;
	}).join("");
	const sizes = [16, 24, 32, 48, 96].map((s) => `<div>${avatar(byId.support, "idle", s)}<br>${s} px</div>`).join("");
	return `${SQUADMATE_CSS}${CSS}
<p class="note"><a href="/review/">Back to review</a></p>
<h1>Squadmates</h1>
<p class="note">One character for the master and for each agent. The body takes the agent's colour from the design. The accessory shows the role. The eyes show what the agent is doing now, from the Agent loop states in the plan. The product adds them next.</p>
<div class="ask"><b>Decided by Moe on 3 November 2026</b><ol><li>Each squadmate is named after a famous place: Petra, Pisa, Kyoto, Rio, Zurich, Giza, Machu, Angkor and Delphi.</li><li>A customer cannot rename the master.</li><li>The style stays: one round body, one accessory, eyes that change with the state.</li></ol></div>
<h2>The squad</h2><div class="cast">${cast}</div>
<h2>States</h2><p class="note">The nine Agent loop states. Waiting and idle blink slowly. A badge shows the states a person must see.</p>
<div class="states"><table>${head}${rows}</table></div>
<h2>In use</h2><p class="note">A squad list, the way the sidebar or the dock could show it. Sample text only.</p>
<div class="list">${list}</div>
<h2>Sizes</h2><p class="note">The sidebar uses 24 or 32 px. The accessory must still read at 24 px.</p>
<div class="sizes">${sizes}</div>`;
}
