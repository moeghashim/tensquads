import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const out = join(here, "public/review");
const ref = process.argv[2] ?? "HEAD";
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 1 << 26 });
const sha = git("rev-parse", "--short", ref).trim();

rmSync(join(here, "public"), { recursive: true, force: true });
mkdirSync(join(out, "design"), { recursive: true });

const canvas = JSON.parse(git("show", `${ref}:design/canvas.json`));
const manifest = JSON.parse(git("show", `${ref}:design/MANIFEST.json`));
for (const file of canvas.order) writeFileSync(join(out, "design", file), git("show", `${ref}:design/${file}`));
cpSync(join(here, "review-src/support.js"), join(out, "design/support.js"));

const page = (title, body) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><title>${title}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
body{margin:0;background:#fcfcfc;color:#282828;font:15px/24px Inter,system-ui,sans-serif;-webkit-font-smoothing:antialiased}
main{max-width:980px;margin:0 auto;padding:32px 24px 80px}
a{color:#0169cc}a:hover{color:#004f99}
h1{font-size:32px;line-height:38px;letter-spacing:-.02em;color:#0d0d0d;margin:16px 0}
h2{font-size:22px;line-height:28px;color:#0d0d0d;margin:40px 0 12px}
h3{font-size:17px;color:#0d0d0d;margin:28px 0 8px}
.note{color:#5d5d5d;font-size:14px}
.scroll{overflow-x:auto}
table{border-collapse:collapse;width:100%;font-size:14px;line-height:21px;margin:12px 0}
th,td{border:1px solid rgba(13,13,13,.1);padding:8px 10px;text-align:left;vertical-align:top}
th{background:#f3f3f3;color:#0d0d0d;font-weight:600}
code{font:13px/20px ui-monospace,monospace;background:rgba(13,13,13,.06);padding:1px 4px;border-radius:4px}
pre{background:#f3f3f3;padding:12px;border-radius:10px;overflow-x:auto}pre code{background:none;padding:0}
.card{display:block;padding:14px 16px;border-radius:12px;box-shadow:0 0 0 1px rgba(13,13,13,.1);background:#fff;text-decoration:none;color:#0d0d0d;font-weight:500;margin:8px 0}
.card:hover{box-shadow:0 0 0 1px rgba(13,13,13,.2)}.card span{display:block;color:#5d5d5d;font-weight:400;font-size:13px}
</style></head><body><main>${body}</main></body></html>`;

// Moe set the customer site domain on 2 November 2026. The repository edit follows in a pull request.
const plan = git("show", `${ref}:docs/PLAN.md`).replaceAll("tensquads.co", "10squads.com").replace(/&#91;embedded content: ([^\\\]]*)\\?\]/g, "*[Diagram not included: $1]*");
const planFile = join(here, ".plan.tmp.md");
writeFileSync(planFile, plan);
const html = execFileSync("npx", ["--yes", "marked@15", "--gfm", "-i", planFile], { encoding: "utf8", maxBuffer: 1 << 26 });
rmSync(planFile);
writeFileSync(
	join(out, "plan.html"),
	page("tensquads build plan", `<p class="note"><a href="/review/">Back to review</a> · Plan at commit ${sha}, with the 10squads.com domain edit.</p>${html.replaceAll("<table>", '<div class="scroll"><table>').replaceAll("</table>", "</table></div>")}`),
);

const cards = canvas.order
	.map((file) => `<a class="card" href="/review/design/${file}">${canvas.boards[file]?.title ?? file}<span>${file}</span></a>`)
	.join("");
writeFileSync(
	join(out, "index.html"),
	page(
		"tensquads review",
		`<h1>tensquads review</h1><p class="note">For team review. Build plan at commit ${sha}. Design canvas version ${manifest.version}. The design files are the originals, and they are interactive.</p><h2>Build plan</h2><a class="card" href="/review/plan">Build plan<span>Decisions, architecture, phases and the proof of concept</span></a><h2>Design</h2>${cards}`,
	),
);
console.log("built", canvas.order.length, "design files from", sha, "manifest", manifest.version);
