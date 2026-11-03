import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { charactersPage } from "./review-src/characters.mjs";
import { DIAGRAM_CSS, DIAGRAMS, summary } from "./review-src/diagrams.mjs";
import { QUESTIONS_CSS, questionsHtml } from "./review-src/questions.mjs";
import { readStatus } from "./review-src/status.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const out = join(here, "public/review");
const ref = process.argv[2] ?? "HEAD";
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 1 << 26 });
const sha = git("rev-parse", "--short", ref).trim();
const date = git("log", "-1", "--format=%cs", ref).trim();
const status = readStatus(git, ref);

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
const plan = git("show", `${ref}:docs/PLAN.md`)
	.replaceAll("tensquads.co", "10squads.com")
	.replace(/&#91;embedded content: ([^\\\]·]*?) ·[^\]]*\]/g, (line, name) => {
		if (!DIAGRAMS[name.trim()]) throw new Error(`No diagram for: ${line}`);
		return `\n\n${DIAGRAMS[name.trim()](status).replace(/\n/g, "")}\n\n`;
	});
if (plan.includes("embedded content")) throw new Error("A diagram placeholder is left in the plan.");
const planFile = join(here, ".plan.tmp.md");
writeFileSync(planFile, plan);
const html = execFileSync("npx", ["--yes", "marked@15", "--gfm", "-i", planFile], { encoding: "utf8", maxBuffer: 1 << 26 });
rmSync(planFile);
writeFileSync(
	join(out, "plan.html"),
	page("tensquads build plan", `<p class="note"><a href="/review/">Back to review</a> · Plan at commit ${sha}, with the 10squads.com domain edit.</p>${DIAGRAM_CSS}${html.replace("</h1>", `</h1>${summary(status, sha, date)}`).replaceAll("<table>", '<div class="scroll"><table>').replaceAll("</table>", "</table></div>")}`),
);

// One thumbnail for each design file: the top of the screen at 1440 px, saved at half size.
const { chromium } = await import("playwright");
mkdirSync(join(out, "design/thumbs"), { recursive: true });
// Wrapper files load Main.dc.html with fetch, so serve the files over HTTP, not file://.
const types = { ".html": "text/html", ".js": "text/javascript" };
const server = createServer((req, res) => {
	const path = join(out, "design", decodeURIComponent(new URL(req.url, "http://x").pathname));
	if (!path.startsWith(join(out, "design")) || !existsSync(path)) return res.writeHead(404).end();
	res.writeHead(200, { "content-type": types[extname(path)] ?? "application/octet-stream" }).end(readFileSync(path));
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch();
const shot = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 0.5 });
for (const file of canvas.order) {
	await shot.goto(base + file, { waitUntil: "networkidle" });
	await shot.waitForTimeout(400);
	await shot.screenshot({ path: join(out, "design/thumbs", file.replace(/\.html$/, ".png")) });
}
await browser.close();
server.close();

const cards = canvas.order
	.map((file) => {
		const title = canvas.boards[file]?.title ?? file;
		const thumb = `/review/design/thumbs/${file.replace(/\.html$/, ".png")}`;
		return `<a class="tile" href="/review/design/${file}"><img src="${thumb}" alt="" width="720" height="450" loading="lazy"><b>${title}</b><span>${file}</span></a>`;
	})
	.join("");
const TILE_CSS = `<style>
.tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px;margin-top:20px}
.tile{display:block;border-radius:12px;background:#fff;box-shadow:0 0 0 1px rgba(13,13,13,.1);overflow:hidden;text-decoration:none;color:#0d0d0d}
.tile:hover{box-shadow:0 0 0 1px rgba(13,13,13,.25)}
.tile img{display:block;width:100%;height:auto;aspect-ratio:16/10;border-bottom:1px solid rgba(13,13,13,.08);background:#f3f3f3}
.tile b{display:block;font-weight:500;padding:12px 14px 0}
.tile span{display:block;color:#5d5d5d;font-size:13px;padding:0 14px 12px}
</style>`;
writeFileSync(
	join(out, "design/index.html"),
	page(
		"tensquads design",
		`<p class="note"><a href="/review/">Back to review</a></p><h1>Design</h1><p class="note">Design canvas version ${manifest.version}. ${canvas.order.length} files. The files are the originals, and they are interactive. Open one to use it.</p>${TILE_CSS}<div class="tiles">${cards}</div>`,
	),
);
writeFileSync(
	join(out, "index.html"),
	page(
		"tensquads review",
		`<h1>tensquads review</h1><p class="note">For team review. Build plan at commit ${sha}. Design canvas version ${manifest.version}.</p><h2>Build plan</h2><a class="card" href="/review/plan">Build plan<span>Decisions, architecture, phases, the proof of concept, and the build status of each part</span></a><h2>Squadmates</h2><a class="card" href="/review/characters">Squadmates<span>Proposal: a name and a character for the master and each agent</span></a><h2>Design</h2><a class="card" href="/review/design/">Design<span>${canvas.order.length} screens from the design canvas, with thumbnails</span></a><h2 id="open-questions">Open questions</h2><p class="note">Not decided yet. Each has a recommended answer for the team to discuss.</p>${QUESTIONS_CSS}${questionsHtml()}`,
	),
);
writeFileSync(join(out, "characters.html"), page("tensquads squadmates", charactersPage()));
console.log("built", canvas.order.length, "design files from", sha, "manifest", manifest.version);
