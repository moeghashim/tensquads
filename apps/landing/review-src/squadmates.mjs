// Squadmates: one character for the master and for each agent image.
// A character is one round body, two eyes and one role accessory, on a 64 by 64 grid.
// The eyes show the Agent loop state (docs/PLAN.md, decision 32).
// Each name is a famous place. Moe chose this set on 3 November 2026.
// A customer cannot rename the master. The product does not use these yet.

export const SQUADMATES = [
	{ id: "master", name: "Petra", place: "Petra, Jordan", role: "Master", tint: "#e8e8e8", body: "#1f1f1f", eye: "#ffffff", prop: "crown", line: "Keeps the squad in sync and asks you only when it matters." },
	{ id: "orders", name: "Pisa", place: "Pisa, Italy", role: "Orders", tint: "#e7efff", body: "#5b8def", prop: "cap", line: "Fulfils orders and chases tracking numbers." },
	{ id: "support", name: "Kyoto", place: "Kyoto, Japan", role: "Support", tint: "#def5ee", body: "#34b98c", prop: "headset", line: "Answers the inbox and handles refunds." },
	{ id: "marketing", name: "Rio", place: "Rio de Janeiro, Brazil", role: "Marketing", tint: "#ece3ff", body: "#9a6bf2", prop: "antenna", line: "Runs ads, social and email." },
	{ id: "finance", name: "Zurich", place: "Zurich, Switzerland", role: "Finance", tint: "#ffefa4", body: "#f0bd1d", prop: "visor", line: "Watches payouts, costs and profit." },
	{ id: "inventory", name: "Giza", place: "Giza, Egypt", role: "Inventory", tint: "#fee7c2", body: "#f39a3d", prop: "beanie", line: "Counts stock and talks to suppliers." },
	{ id: "market", name: "Machu", place: "Machu Picchu, Peru", role: "Market researcher", tint: "#fde2f3", body: "#e8679f", prop: "glasses", line: "Finds the competitors and reads their prices." },
	{ id: "website", name: "Angkor", place: "Angkor Wat, Cambodia", role: "Website builder", tint: "#e5e9f0", body: "#6c7d99", prop: "hardhat", line: "Builds the page and publishes on your yes." },
	{ id: "analytics", name: "Delphi", place: "Delphi, Greece", role: "Analytics", tint: "#e7efff", body: "#4a6fd1", prop: "monocle", line: "Writes the reports and the weekly digest." },
];

// The Agent loop states, in the order of the state model.
export const STATES = [
	["waiting", "Waiting", "Nothing to do now. Blinks slowly."],
	["planning", "Planning", "Looks up while it plans."],
	["running", "Running skill", "Looks at the work."],
	["checking", "Checking", "Squints while the code check runs."],
	["done", "Done", "The check passed."],
	["sentback", "Sent back", "The check failed once. Looks down."],
	["blocked", "Blocked", "Waits for a person. Holds no machine."],
	["escalated", "Escalated", "Second fail. Needs you now."],
	["dropped", "Dropped", "Nothing to do at all. Asleep."],
];

const L = 25; // left eye x
const R = 39; // right eye x
const Y = 37; // eye y

const pill = (x, y, c, ry = 4.2) => `<rect x="${x - 2.6}" y="${y - ry}" width="5.2" height="${ry * 2}" rx="2.6" fill="${c}"/>`;
const bar = (x, y, c, w = 7) => `<rect x="${x - w / 2}" y="${y - 1.3}" width="${w}" height="2.6" rx="1.3" fill="${c}"/>`;
const arc = (x, y, c, up = true) => `<path d="M${x - 3.6} ${y + (up ? 1.6 : -1.6)} Q${x} ${y + (up ? -3.4 : 3.4)} ${x + 3.6} ${y + (up ? 1.6 : -1.6)}" fill="none" stroke="${c}" stroke-width="2.6" stroke-linecap="round"/>`;

function eyes(state, c) {
	switch (state) {
		case "waiting":
			return pill(L, Y + 1, c, 2.4) + pill(R, Y + 1, c, 2.4);
		case "planning":
			return pill(L + 2, Y - 3, c) + pill(R + 2, Y - 3, c) + `<circle cx="53" cy="13" r="2" fill="#a8a8a8"/><circle cx="57.5" cy="8" r="2.8" fill="#a8a8a8"/>`;
		case "running":
			return pill(L + 3, Y, c, 3.6) + pill(R + 3, Y, c, 3.6);
		case "checking":
			return pill(L, Y, c) + bar(R, Y, c, 6.4);
		case "done":
			return arc(L, Y, c) + arc(R, Y, c) + `<path d="M28.5 46 Q32 49.5 35.5 46" fill="none" stroke="${c}" stroke-width="2.2" stroke-linecap="round"/>`;
		case "sentback":
			return pill(L - 1, Y + 3, c, 3.4) + pill(R - 1, Y + 3, c, 3.4) + bar(32, 49, c, 4.6);
		case "blocked":
			return bar(L, Y, c) + bar(R, Y, c);
		case "escalated":
			return `<circle cx="${L}" cy="${Y}" r="4.4" fill="${c}"/><circle cx="${R}" cy="${Y}" r="4.4" fill="${c}"/><circle cx="${L + 1.4}" cy="${Y - 1.4}" r="1.3" fill="#fff" opacity=".9"/><circle cx="${R + 1.4}" cy="${Y - 1.4}" r="1.3" fill="#fff" opacity=".9"/><ellipse cx="32" cy="48" rx="2.4" ry="2.8" fill="${c}"/>`;
		case "dropped":
			return arc(L, Y, c, false) + arc(R, Y, c, false);
		default:
			return pill(L, Y, c) + pill(R, Y, c);
	}
}

// A small badge in the lower right for the states a person must see.
function badge(state) {
	if (state === "escalated") return `<circle cx="53" cy="53" r="8" fill="#e5484d" stroke="#fff" stroke-width="2.5"/><rect x="52" y="48.2" width="2" height="6" rx="1" fill="#fff"/><circle cx="53" cy="57.2" r="1.15" fill="#fff"/>`;
	if (state === "blocked") return `<circle cx="53" cy="53" r="8" fill="#e39b00" stroke="#fff" stroke-width="2.5"/><rect x="49.8" y="49.5" width="2.2" height="7" rx="1" fill="#fff"/><rect x="54" y="49.5" width="2.2" height="7" rx="1" fill="#fff"/>`;
	if (state === "done") return `<circle cx="53" cy="53" r="8" fill="#00a240" stroke="#fff" stroke-width="2.5"/><path d="M49.4 53.2 l2.5 2.5 l4.7 -5" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`;
	if (state === "dropped") return `<text x="50" y="16" font-family="Inter,system-ui,sans-serif" font-size="11" font-weight="700" fill="#8f8f8f">z</text><text x="56" y="9" font-family="Inter,system-ui,sans-serif" font-size="8" font-weight="700" fill="#b4b4b4">z</text>`;
	return "";
}

// Role accessories. Each one is a simple outline that still reads at 24 px.
function prop(kind, body) {
	const dark = "rgba(13,13,13,.78)";
	switch (kind) {
		case "crown":
			return `<path d="M21 17 L24 8 L29 13.5 L32 6 L35 13.5 L40 8 L43 17 Z" fill="#f2c230" stroke="#c99400" stroke-width="1.2" stroke-linejoin="round"/>`;
		case "cap":
			return `<path d="M14 25 Q14 12 32 12 Q50 12 50 25 Z" fill="#2f5fc4"/><path d="M40 24 Q52 23 57 26.5 Q50 28 40 27.5 Z" fill="#244c9e"/><circle cx="32" cy="12.5" r="1.8" fill="#244c9e"/>`;
		case "headset":
			return `<path d="M12.5 33 Q12.5 10 32 10 Q51.5 10 51.5 33" fill="none" stroke="${dark}" stroke-width="3.2" stroke-linecap="round"/><rect x="8" y="29" width="8" height="12" rx="4" fill="${dark}"/><path d="M12 41 Q14 51 24.5 49.5" fill="none" stroke="${dark}" stroke-width="2.2" stroke-linecap="round"/><circle cx="25.5" cy="49.3" r="2.3" fill="${dark}"/>`;
		case "antenna":
			return `<path d="M32 14 L32 6" stroke="${dark}" stroke-width="2.4" stroke-linecap="round"/><path d="M32 0.5 l1.6 3.3 l3.6 .5 l-2.6 2.5 l.6 3.6 l-3.2 -1.7 l-3.2 1.7 l.6 -3.6 l-2.6 -2.5 l3.6 -.5 z" fill="#f2c230" stroke="#c99400" stroke-width=".9" stroke-linejoin="round"/>`;
		case "visor":
			return `<path d="M13 26 Q32 17 51 26 L51 29 Q32 21.5 13 29 Z" fill="#1f8f5f"/><path d="M18 27.5 Q32 33 46 27.5 Q32 31 18 27.5 Z" fill="#167048" opacity=".9"/>`;
		case "beanie":
			return `<path d="M13.5 26 Q14 9 32 9 Q50 9 50.5 26 Z" fill="#c24f2a"/><rect x="12.5" y="22.5" width="39" height="6" rx="3" fill="#a3401f"/><circle cx="32" cy="7.5" r="4" fill="#fff4e8"/>`;
		case "glasses":
			return `<circle cx="${L}" cy="${Y}" r="7" fill="rgba(255,255,255,.28)" stroke="${dark}" stroke-width="2.2"/><circle cx="${R}" cy="${Y}" r="7" fill="rgba(255,255,255,.28)" stroke="${dark}" stroke-width="2.2"/><path d="M30.5 ${Y - 1} Q32 ${Y - 3} 33.5 ${Y - 1}" fill="none" stroke="${dark}" stroke-width="2"/>`;
		case "hardhat":
			return `<path d="M15 25 Q15 10 32 10 Q49 10 49 25 Z" fill="#f2c230"/><rect x="11" y="23" width="42" height="4.6" rx="2.3" fill="#d9a70f"/><rect x="30" y="10.5" width="4" height="13" rx="2" fill="#d9a70f"/>`;
		case "monocle":
			return `<circle cx="${R}" cy="${Y}" r="7.4" fill="rgba(255,255,255,.3)" stroke="#c99400" stroke-width="2.2"/><path d="M45.5 41 Q48 50 44 56" fill="none" stroke="#c99400" stroke-width="1.4"/>`;
		default:
			return "";
	}
}

// One squadmate as an SVG string. `size` is the drawn width in pixels.
export function avatar(mate, state = "idle", size = 64) {
	const eye = mate.eye ?? "#0d0d0d";
	const blink = state === "waiting" || state === "idle" ? ' class="sm-blink"' : "";
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${size}" height="${size}" role="img" aria-label="${mate.name}, ${mate.role}${state === "idle" ? "" : `, ${state}`}">
<ellipse cx="32" cy="60" rx="16" ry="2.4" fill="rgba(13,13,13,.10)"/>
<rect x="11" y="14" width="42" height="44" rx="21" fill="${mate.body}"/>
<ellipse cx="22" cy="23" rx="6.5" ry="4" fill="#fff" opacity=".22" transform="rotate(-24 22 23)"/>
${prop(mate.prop, mate.body)}
<g${blink}>${eyes(state, eye)}</g>
${badge(state)}
</svg>`;
}

// The blink for the idle and Waiting states. Respects reduced motion.
export const SQUADMATE_CSS = `<style>
.sm-blink{transform-box:fill-box;transform-origin:center;animation:sm-blink 4.8s infinite}
@keyframes sm-blink{0%,92%,100%{transform:scaleY(1)}95%{transform:scaleY(.1)}}
@media (prefers-reduced-motion:reduce){.sm-blink{animation:none}}
</style>`;
