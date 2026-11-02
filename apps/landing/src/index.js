const TEXT = {
	title: "Hire a squad of AI agents to run your business",
	body: "Orders, support, marketing, finance and stock, each handled by its own agent. One master keeps them in sync and only interrupts you when it matters.",
};

const ICON =
	'<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><rect x="3" y="5" width="10" height="8" rx="2"></rect><path d="M8 2.5V5M6 9h0M10 9h0"></path></svg>';

const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>tensquads</title>
<meta name="description" content="${TEXT.body}">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 30 30'%3E%3Crect width='30' height='30' rx='8' fill='%23181818'/%3E%3Cg transform='translate(7 7)' fill='none' stroke='%23fff' stroke-width='1.5' stroke-linecap='round'%3E%3Crect x='3' y='5' width='10' height='8' rx='2'/%3E%3Cpath d='M8 2.5V5M6 9h0M10 9h0'/%3E%3C/g%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap">
<style>
*{box-sizing:border-box}
html,body{height:100%}
body{margin:0;background:#fcfcfc;color:#0d0d0d;font-family:Inter,system-ui,sans-serif;-webkit-font-smoothing:antialiased;display:flex;flex-direction:column}
.brand{max-width:1200px;width:100%;margin:0 auto;padding:12px 24px;display:flex;align-items:center;gap:10px}
.mark{width:30px;height:30px;border-radius:8px;background:#181818;color:#fff;display:inline-flex;align-items:center;justify-content:center}
.name{font-weight:600;font-size:15px}
main{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:20px;padding:24px 24px 96px}
.pill{height:28px;padding:0 12px;border-radius:999px;background:#04b84c14;color:#00692a;font-size:13px;font-weight:500;display:inline-flex;align-items:center;gap:8px}
.dot{width:8px;height:8px;border-radius:999px;background:#00a240}
h1{margin:0;max-width:860px;font-size:64px;line-height:68px;font-weight:700;letter-spacing:-.035em;color:#0d0d0d}
p{margin:0;max-width:620px;font-size:19px;line-height:28px;color:#5d5d5d}
@media (max-width:640px){h1{font-size:40px;line-height:44px}p{font-size:17px;line-height:26px}}
</style>
</head>
<body>
<header class="brand"><span class="mark">${ICON}</span><span class="name">tensquads</span></header>
<main>
<span class="pill"><span class="dot"></span>Coming soon</span>
<h1>${TEXT.title}</h1>
<p>${TEXT.body}</p>
</main>
</body>
</html>
`;

const HEADERS = {
	"content-type": "text/html; charset=utf-8",
	"cache-control": "public, max-age=300",
	"content-security-policy":
		"default-src 'none'; img-src data:; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
	"referrer-policy": "no-referrer",
	"x-content-type-options": "nosniff",
};

export default {
	fetch(request) {
		const url = new URL(request.url);
		if (url.hostname === "www.10squads.com") {
			return Response.redirect(`https://10squads.com${url.pathname}`, 301);
		}
		if (request.method !== "GET" && request.method !== "HEAD") {
			return new Response(null, { status: 405, headers: { allow: "GET, HEAD" } });
		}
		if (url.pathname !== "/") {
			return Response.redirect("https://10squads.com/", 302);
		}
		return new Response(request.method === "HEAD" ? null : PAGE, { headers: HEADERS });
	},
};
