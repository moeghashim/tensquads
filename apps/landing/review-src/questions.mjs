// Open questions for the team. None of these is a decision yet. When Moe decides
// one, it moves to the decisions table in docs/PLAN.md and leaves this list.

export const QUESTIONS = [
	{
		q: "How does an account connect third-party services: Google Search Console, Google Ads, the Meta pixel, the Google tag, and others? Do we use Composio or Treg?",
		now: "Every service sits behind the IntegrationGateway interface. In version 1 the adapters are placeholders: Shopify, Gmail and Stripe do nothing. Agent keys go to the boat.dev key proxy, never to a machine. The plan does not name a connection broker.",
		rec: [
			"Split the services into two kinds. API services (Search Console, Google Ads, Meta Ads) need an OAuth sign-in and a token. Pixels and tags (Meta pixel, Google tag) need only an ID on the customer's site.",
			"For API services, use one managed OAuth broker behind IntegrationGateway, so we do not build and review one OAuth app per provider. Composio is the first candidate. The token stays in the broker, and the agent gets only a scoped call.",
			"For pixels and tags, the user pastes the ID, and the Website builder adds it to the published page. No broker is needed.",
			"Apply for the Google Ads developer token early. Google approves it by hand, and that can take weeks.",
			"Confirm the name \"Treg\" and its site, so we can compare it with Composio.",
		],
	},
	{
		q: "How does the master connect to Slack and WhatsApp?",
		now: "Decision 32 makes every inbound message a Trigger from a Source. The chat is one Source. The plan has no Slack or WhatsApp Source and no outbound channel other than the chat.",
		rec: [
			"Each channel is one more Source in, and one more place for the master's replies out. Both go through the master core in the account's Durable Object (decision 17).",
			"Slack first: one tensquads Slack app, installed by each account with OAuth. Slack events go to a Worker endpoint and become bus events to the master.",
			"WhatsApp second, through the WhatsApp Business Platform (Cloud API). It needs a verified Meta business. After 24 hours without a user message, the master can send only approved template messages.",
			"Start WhatsApp with one shared tensquads number. Add a number for each account later, if customers ask for it.",
		],
	},
	{
		q: "Does each master get its own email address?",
		now: "The plan lists resend/email as a later service. It has no inbound email and no address for an account.",
		rec: [
			"Yes. Give each master one address on a subdomain of ours, for example <slug>@team.10squads.com. A customer can forward mail to it.",
			"Inbound: Cloudflare Email Routing with a catch-all on that subdomain, into an Email Worker. Each email becomes a Trigger to the master (decision 32).",
			"Outbound: Resend, as the plan already names, with the same subdomain verified for sending.",
			"A mailbox-for-agents service (for example AgentMail) is the alternative. It costs more, but it keeps threads and attachments for us.",
		],
	},
	{
		q: "How do we replace Ahrefs?",
		now: "The plan has no SEO data source. The Market researcher uses context.dev Search, context.dev maps and reviews, and Scrapling to read pages (task 05).",
		rec: [
			"Do not build our own crawler or backlink index. Split what Ahrefs gives into two parts.",
			"The customer's own site: Google Search Console, through the broker in question 1. It is free and first-party: real queries, clicks, impressions and positions.",
			"Competitors and keywords: a pay-per-call SEO data API behind IntegrationGateway. DataForSEO is the first candidate: search results, keyword volumes, ranked keywords per domain, and backlinks. We pay per request, not per seat.",
			"Expose it as researcher skills, for example seo.keywords and seo.competitor_domain. Each number in a report carries its source, as the report check already asks.",
		],
	},
	{
		q: "How do we understand a competitor's marketing strategy and performance?",
		now: "Task 05 reports competitors, their offers and prices, and one gap. competition.watch makes a context.dev monitor that sends change.detected to the master. Marketing channels and performance are not covered.",
		rec: [
			"Make it a second researcher report, after the proof of concept: \"How they market\". It has the channels, the messages and offers, and an estimate of performance.",
			"Paid search: the keywords a competitor bids on and its estimated paid traffic, from the SEO data API in question 4.",
			"Paid social: the Meta Ad Library. Its API covers all ads only in the EU, and political ads elsewhere. Outside the EU, the researcher reads the public library pages. The Google Ads Transparency Center has no public API, so the same applies.",
			"Organic: ranked keywords and estimated organic traffic (question 4), public social profiles and posting rate, and reviews from the maps sources already in task 05.",
			"Change over time: competition.watch already notices site changes. Add new ads and price changes as more Triggers to the master.",
			"Performance from outside is always an estimate. Each figure shows its source and the word \"estimate\". The check rejects a figure with no source.",
		],
	},
];

const esc = (s) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

export const QUESTIONS_CSS = `<style>
.oq{border-radius:12px;box-shadow:0 0 0 1px rgba(13,13,13,.1);background:#fff;padding:16px 18px;margin:12px 0}
.oq h3{margin:0 0 10px;font-size:16px;line-height:23px}
.oq .n{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:999px;background:#181818;color:#fff;font-size:12px;margin-right:8px;vertical-align:1px}
.oq .st{float:right;height:22px;padding:0 9px;border-radius:999px;background:#fff1d1;color:#7a4a00;font-size:12px;font-weight:500;display:inline-flex;align-items:center;margin-left:8px}
.oq dt{font-size:12px;font-weight:600;color:#5d5d5d;text-transform:uppercase;letter-spacing:.04em;margin-top:10px}
.oq dd{margin:4px 0 0;font-size:14px;line-height:21px}
.oq ul{margin:4px 0 0;padding-left:18px}.oq li{margin:3px 0}
</style>`;

export const questionsHtml = () =>
	QUESTIONS.map(
		({ q, now, rec }, i) =>
			`<div class="oq"><span class="st">Open</span><h3><span class="n">${i + 1}</span>${esc(q)}</h3><dl><dt>What the plan says now</dt><dd>${esc(now)}</dd><dt>Recommended answer</dt><dd><ul>${rec.map((r) => `<li>${esc(r)}</li>`).join("")}</ul></dd></dl></div>`,
	).join("");
