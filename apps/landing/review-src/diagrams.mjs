// Three diagrams for the plan. The originals are not in the repository, so these
// are redrawn from the plan's text and task 05. Each one is plain HTML and CSS.

const css = `<style>
.dg{margin:20px 0 28px;font-size:14px;line-height:20px;color:#282828}
.dg-lead{font-size:16px;line-height:24px;color:#0d0d0d;font-weight:500;margin:0 0 14px}
.dg-note{font-size:13px;color:#5d5d5d;margin:10px 0 0}
.lay{border-radius:12px;padding:14px 16px;box-shadow:0 0 0 1px rgba(13,13,13,.1);background:#fff}
.lay b{display:block;color:#0d0d0d;font-size:15px}
.lay small{display:block;color:#5d5d5d;font-size:13px;margin-top:2px}
.lay.a{background:#e7efff}.lay.b{background:#ece3ff}.lay.c{background:#fee7c2}.lay.d{background:#def5ee}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
.chip{background:#fff;border-radius:999px;padding:3px 10px;font-size:13px;box-shadow:0 0 0 1px rgba(13,13,13,.1)}
.down{text-align:center;color:#8f8f8f;font-size:18px;line-height:26px}
.ph{display:grid;grid-template-columns:repeat(5,1fr);gap:0}
.ph-i{background:#fff;border-radius:12px;box-shadow:0 0 0 1px rgba(13,13,13,.1);padding:12px}
.ph-i b{display:block;color:#0d0d0d}.ph-i span{display:block;color:#5d5d5d;font-size:13px;line-height:18px;margin-top:4px}
.ph-n{font-size:12px;font-weight:600;color:#5d5d5d}
.gate{background:#def5ee;border-radius:10px;padding:8px 12px;font-size:13px;line-height:18px;margin-top:8px;color:#00692a}
.ph-col{display:flex;flex-direction:column;padding:0 4px}
.ph5{margin-top:12px;background:#181818;color:#fff;border-radius:12px;padding:12px 14px}.ph5 b{color:#fff}
.who{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px}
.st{display:grid;grid-template-columns:34px 1fr;gap:10px;align-items:stretch;margin:0}
.st-n{display:flex;flex-direction:column;align-items:center}
.st-n i{font-style:normal;width:28px;height:28px;border-radius:999px;background:#181818;color:#fff;font-size:12px;font-weight:600;display:flex;align-items:center;justify-content:center;flex:none}
.st-n u{flex:1;width:2px;background:rgba(13,13,13,.12);text-decoration:none;min-height:8px}
.st-c{border-radius:12px;padding:9px 12px;margin-bottom:8px;box-shadow:0 0 0 1px rgba(13,13,13,.08);background:#fff}
.st-c small{display:block;font-size:12px;font-weight:600;color:#5d5d5d}
.st-c strong{font-weight:500;color:#0d0d0d}
.you{background:#ffefa4}.mas{background:#e7efff}.res{background:#fde2f3}.bui{background:#e5e9f0}
.tag{float:right;border-radius:999px;background:#181818;color:#fff;font-size:12px;font-weight:500;padding:1px 9px;margin-left:8px}
@media (max-width:760px){.ph{grid-template-columns:1fr}.ph-col{padding:0 0 8px}}
</style>`;

const layers = `<div class="dg" role="img" aria-label="Four layers: web app, core, interfaces, adapters. Requests go down, one layer at a time.">
<p class="dg-lead">Four layers. Each layer talks only to the layer below it.</p>
<div class="lay a"><b>1. Web app</b><small>The screens people see. TanStack Start on a Cloudflare Worker.</small></div>
<div class="down">↓</div>
<div class="lay b"><b>2. Core</b><small>The business rules, in six areas. Each area is one plug-in.</small>
<div class="chips"><span class="chip">Platform</span><span class="chip">Squads and Agents</span><span class="chip">Bus and Shared State</span><span class="chip">Policy</span><span class="chip">Catalog</span><span class="chip">Conversation</span></div></div>
<div class="down">↓</div>
<div class="lay c"><b>3. Interfaces</b><small>Fixed plugs. The core never sees what sits behind them.</small>
<div class="chips"><span class="chip">MachineProvider</span><span class="chip">EventBus</span><span class="chip">IntegrationGateway</span><span class="chip">Repositories</span><span class="chip">Decider</span></div></div>
<div class="down">↓</div>
<div class="lay d"><b>4. Adapters</b><small>The real services. Swap one and no screen changes.</small>
<div class="chips"><span class="chip">Neon database</span><span class="chip">Test machines now, boat.dev later</span><span class="chip">Memory bus now, Cloudflare Queues later</span></div></div>
<p class="dg-note">Why it matters: we start with test adapters, and move to real machines later without touching a screen.</p>
</div>`;

const P = [
	["0", "Foundation", "Empty app, database, tokens, checks", "CI green, preview deploys, seed tests pass"],
	["1", "Public screens", "Homepage, sign-up, sign-in", "Both screens pass, and a new account exists in Neon"],
	["2", "Workspace", "Frame, then six screens. The largest phase", "All six pass, and Tasks done 331 is computed"],
	["3", "Super admin", "Accounts and images screens", "Both pass, and all totals are computed"],
	["4", "Machine trial", "Real boat.dev and Cloudflare adapters", "Adapter tests pass on a real machine, and no screen changes"],
];
const phases = `<div class="dg" role="img" aria-label="Phases 0 to 4 run in order, each with a gate. Phase 5 is the proof of concept.">
<p class="dg-lead">One phase at a time. A phase starts only when the gate before it passes.</p>
<div class="ph">${P.map(([n, t, d, g]) => `<div class="ph-col"><div class="ph-i"><div class="ph-n">Phase ${n}</div><b>${t}</b><span>${d}</span></div><div class="gate">Gate: ${g}</div></div>`).join("")}</div>
<div class="ph5"><b>Phase 5: Proof of concept.</b> Real agents run one full job for a restaurant or a grocer. See the last diagram.</div>
</div>`;

const S = [
	["you", "You", "Enter the business name, type, and your menu or item list"],
	["mas", "Master", "Gives the researcher a task"],
	["res", "Market researcher", "Finds the competitors, reads their sites, and writes a report"],
	["res", "Market researcher", "Sends the report to the master"],
	["mas", "Master", "Checks the report with code", "Check 1"],
	["mas", "Master", "Writes a brief of under 150 words"],
	["you", "You", "Say yes: build the site with this brief", "Approval 1"],
	["mas", "Master", "Gives the builder a task, with the brief, report and list"],
	["bui", "Website builder", "Builds the page, reviews it, and makes a preview"],
	["bui", "Website builder", "Sends the preview link to the master"],
	["mas", "Master", "Checks the page with code", "Check 2"],
	["you", "You", "Say yes: publish the site", "Approval 2"],
	["bui", "Website builder", "Publishes the page at &lt;slug&gt;.10squads.com"],
];
const poc = `<div class="dg" role="img" aria-label="Thirteen steps with two checks and two approvals, from your list to a live page.">
<p class="dg-lead">13 steps from your list to a live page. Code runs 2 checks. You give 2 approvals.</p>
<div class="who"><span class="chip you">You</span><span class="chip mas">Master</span><span class="chip res">Market researcher</span><span class="chip bui">Website builder</span></div>
${S.map(([c, w, t, tag], i) => `<div class="st"><div class="st-n"><i>${i + 1}</i>${i < S.length - 1 ? "<u></u>" : ""}</div><div class="st-c ${c}">${tag ? `<span class="tag">${tag}</span>` : ""}<small>${w}</small><strong>${t}</strong></div></div>`).join("")}
<p class="dg-note">If a check fails, the task goes back once with the evidence. A second fail goes to you. An agent never grades its own work.</p>
</div>`;

export const DIAGRAMS = { "system layers": layers, "build phases": phases, "proof of concept": poc };
export const DIAGRAM_CSS = css;
export const DIAGRAM_NOTE = '<p class="dg-note">Redrawn from the text of this plan. The original diagram file is not in the repository.</p>';
