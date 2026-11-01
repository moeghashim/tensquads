import { readFileSync } from "node:fs";
import { test as base, expect, type Page } from "@playwright/test";

import { localSecrets } from "../scripts/write-dev-vars.mjs";

const fontStylesheetUrl =
	"https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap";
const fontStylesheet = readFileSync(new URL("./fonts/google-fonts.css", import.meta.url), "utf8");
const fontFiles = new Map(
	[...fontStylesheet.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map(([, url]) => [
		url,
		readFileSync(new URL(`./fonts/${new URL(url).pathname.split("/").at(-1)}`, import.meta.url)),
	]),
);

export const test = base.extend({
	page: async ({ page }, use) => {
		await page.route(fontStylesheetUrl, (route) => route.fulfill({ contentType: "text/css", body: fontStylesheet }));
		await page.route("https://fonts.gstatic.com/**", (route) => {
			const body = fontFiles.get(route.request().url());
			if (!body) {
				throw new Error(`Unpinned font request: ${route.request().url()}`);
			}
			return route.fulfill({
				contentType: "font/woff2",
				headers: { "access-control-allow-origin": "*" },
				body,
			});
		});
		const goto = page.goto.bind(page);
		page.goto = (async (url: string, options?: Parameters<Page["goto"]>[1]) => {
			const response = await goto(url, options);
			await waitForHydration(page);
			return response;
		}) as Page["goto"];
		await use(page);
	},
});

export { expect };

export function skipUnlessMacScreenshot() {
	test.skip(
		process.platform !== "darwin",
		"Baselines are macOS captures. The macOS required job runs this pixel check.",
	);
}

export const viewports = [
	{ name: "1440", width: 1440, height: 900 },
	{ name: "390", width: 390, height: 844 },
] as const;

export function readInventory(name: string) {
	const file = new URL(`../design/inventory/${name}.json`, import.meta.url);
	return JSON.parse(readFileSync(file, "utf8")) as {
		file: string;
		texts: string[];
		strings: Record<string, number>;
		handlers: { tag: string; event: string; handler: string }[];
		loops: { kind: string; list?: string; as?: string; value?: string }[];
		links: string[];
	};
}

export async function bodyText(page: Page) {
	const text = await page.locator("body").evaluate((body) => {
		const parts: string[] = [];
		const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT, {
			acceptNode(node) {
				const parent = node.parentElement;
				if (!parent) {
					return NodeFilter.FILTER_REJECT;
				}
				const tag = parent.tagName;
				if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT") {
					return NodeFilter.FILTER_REJECT;
				}
				return NodeFilter.FILTER_ACCEPT;
			},
		});
		while (walker.nextNode()) {
			parts.push(walker.currentNode.textContent ?? "");
		}
		return parts.join(" ");
	});
	return text.replace(/\s+/g, " ").trim();
}

export async function waitForHydration(page: Page) {
	await page.waitForFunction(() => {
		const nodes = document.querySelectorAll("button, a, input, textarea");
		return Array.from(nodes).some((node) => Object.keys(node).some((key) => key.startsWith("__reactProps$")));
	});
}

export async function waitForScreenFonts(page: Page) {
	await page.waitForFunction(() => document.fonts.size > 0);
	const ready = await page.evaluate(async () => {
		const faces = [
			"400 15px Inter",
			"500 15px Inter",
			"600 15px Inter",
			"700 15px Inter",
			"400 14px Inter",
			"500 14px Inter",
			"500 12px Inter",
			"400 13px Inter",
			"400 12px 'JetBrains Mono'",
			"500 11px 'JetBrains Mono'",
		];
		await Promise.all(faces.map((face) => document.fonts.load(face)));
		await document.fonts.ready;
		return document.fonts.check("500 14px Inter") && document.fonts.check("400 15px Inter");
	});
	if (!ready) {
		throw new Error("Inter is not loaded.");
	}
	await page.addStyleTag({
		content: "html { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }",
	});
}

export async function allowTestSignUp(page: Page, publishable: string, secret: string) {
	const host = clerkFrontendHost(publishable);
	const token = await clerkTestingToken(secret);
	const escaped = host.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	await page.route(new RegExp(`^https://${escaped}/v1/`), async (route) => {
		const url = new URL(route.request().url());
		url.searchParams.set("__clerk_testing_token", token);
		const response = await route.fetch({ url: url.toString() });
		const type = response.headers()["content-type"] ?? "";
		if (!type.includes("json")) {
			await route.fulfill({ response });
			return;
		}
		const json = (await response.json()) as {
			response?: { captcha_bypass?: boolean };
			client?: { captcha_bypass?: boolean };
		};
		if (json.response?.captcha_bypass === false) {
			json.response.captcha_bypass = true;
		}
		if (json.client?.captcha_bypass === false) {
			json.client.captcha_bypass = true;
		}
		await route.fulfill({ response, json });
	});
}

function clerkFrontendHost(publishable: string) {
	const encoded = publishable
		.replace(/^pk_(?:test|live)_/, "")
		.replace(/-/g, "+")
		.replace(/_/g, "/");
	const host = Buffer.from(encoded, "base64").toString("utf8").replace(/\$$/, "");
	if (!host.endsWith(".clerk.accounts.dev")) {
		throw new Error("Clerk publishable key has no frontend host.");
	}
	return host;
}

async function clerkTestingToken(secret: string) {
	const response = await fetch("https://api.clerk.com/v1/testing_tokens", {
		method: "POST",
		headers: { Authorization: `Bearer ${secret}` },
	});
	if (!response.ok) {
		throw new Error(`Clerk testing token failed with status ${response.status}.`);
	}
	const body = (await response.json()) as { token?: string };
	if (!body.token) {
		throw new Error("Clerk testing token returned no token.");
	}
	return body.token;
}

export async function recordAuthNotes(page: Page) {
	const notes: string[] = [];
	await page.exposeBinding("__recordAuthNote", (_source, note: string) => {
		notes.push(note.slice(0, 180));
	});
	await page.addInitScript(() => {
		const known = new Set([
			"complete",
			"needs_identifier",
			"needs_first_factor",
			"needs_second_factor",
			"needs_new_password",
			"needs_client_trust",
			"needs_protect_check",
			"missing_requirements",
			"abandoned",
		]);
		function authExtra(text: string) {
			try {
				const body = JSON.parse(text) as {
					errors?: { code?: string }[];
					response?: { status?: string; errors?: { code?: string }[] };
				};
				const codes = [...(body.errors ?? []), ...(body.response?.errors ?? [])]
					.map((error) => error.code ?? "")
					.filter((code) => code.length > 0 && code.length < 80);
				const flow = body.response?.status ?? "";
				return `${codes.join(",")} ${known.has(flow) ? flow : ""}`.trim();
			} catch {
				return "";
			}
		}
		const record = (url: string, status: number, text: string) => {
			let path = url;
			try {
				path = new URL(url, location.href).pathname;
			} catch {
				path = "request";
			}
			if (path.startsWith("/@") || path.startsWith("/node_modules") || path.startsWith("/src")) {
				return;
			}
			const extra = authExtra(text);
			if (status < 400 && extra.length === 0) {
				return;
			}
			void (window as unknown as { __recordAuthNote: (note: string) => void }).__recordAuthNote(
				`${status} ${path} ${extra}`,
			);
		};
		const original = window.fetch;
		window.fetch = async (input, init) => {
			const response = await original(input, init);
			const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
			const text = await response.clone().text();
			record(url, response.status, text);
			return response;
		};
		const open = XMLHttpRequest.prototype.open;
		const send = XMLHttpRequest.prototype.send;
		XMLHttpRequest.prototype.open = function (method: string, url: string | URL, ...rest: unknown[]) {
			(this as XMLHttpRequest & { __url?: string }).__url = String(url);
			return open.call(this, method, url, ...(rest as [boolean, string?, string?]));
		};
		XMLHttpRequest.prototype.send = function (...args: unknown[]) {
			this.addEventListener("load", () => {
				const target = this as XMLHttpRequest & { __url?: string };
				record(target.__url ?? "", target.status, target.responseText);
			});
			return send.apply(this, args as [Document | XMLHttpRequestBodyInit | null | undefined]);
		};
	});
	return notes;
}

export function watchPageErrors(page: Page) {
	const notes: string[] = [];
	const keep = (value: string) => {
		const clean = value
			.replace(/pk_(?:test|live)_[A-Za-z0-9]+/g, "[redacted]")
			.replace(/sk_(?:test|live)_[A-Za-z0-9]+/g, "[redacted]")
			.replace(/postgres(?:ql)?:\/\/\S+/gi, "[redacted]")
			.replace(/[\w.+-]+@[\w.-]+/g, "[email]")
			.slice(0, 240);
		if (clean.length > 0) {
			notes.push(clean);
		}
	};
	page.on("pageerror", (error) => {
		keep(error.message);
	});
	page.on("response", (response) => {
		const url = response.url();
		if (!url.includes("clerk")) {
			return;
		}
		void response
			.json()
			.then((body: { errors?: { code?: string }[]; status?: string; response?: { status?: string } }) => {
				const codes = (body.errors ?? []).map((error) => error.code ?? "unknown");
				const status = body.response?.status ?? body.status ?? "";
				if (codes.length > 0 || response.status() >= 400) {
					const path = new URL(url).pathname;
					keep(`${response.status()} ${path} ${codes.join(",")} ${status}`);
				}
			})
			.catch(() => undefined);
	});
	return notes;
}

export async function handlerNames(page: Page) {
	const names = await page.locator("[data-handler]").evaluateAll((elements) => {
		return elements.map((element) => element.getAttribute("data-handler") ?? "");
	});
	return [...new Set(names)].sort();
}

export async function expectNoHorizontalScroll(page: Page) {
	const fits = await page.evaluate(() => {
		const root = document.documentElement;
		return root.scrollWidth <= root.clientWidth;
	});
	expect(fits).toBe(true);
}

export async function expectLabeledInputs(page: Page) {
	const inputs = page.locator("input, textarea");
	const count = await inputs.count();
	for (let index = 0; index < count; index += 1) {
		const id = await inputs.nth(index).getAttribute("id");
		expect(id).toBeTruthy();
		await expect(page.locator(`label[for="${id}"]`)).toHaveCount(1);
	}
}

export async function expectNamedButtons(page: Page) {
	const unnamed = await page.locator("button").evaluateAll((elements) => {
		return elements.filter((element) => {
			const label = element.getAttribute("aria-label") ?? "";
			const text = (element.textContent ?? "").replace(/\s+/g, " ").trim();
			return label.length === 0 && text.length === 0;
		}).length;
	});
	expect(unnamed).toBe(0);
}

export function secretsFor(names: readonly ("publishable" | "secret" | "testDatabase")[]) {
	const secrets = localSecrets();
	const missing = names.filter((name) => secrets[name].length === 0);
	if (missing.length === 0) {
		return secrets;
	}
	const actor = process.env.GITHUB_ACTOR ?? "";
	if (process.env.GITHUB_ACTIONS === "true" && actor === "dependabot[bot]") {
		const labels = missing.map((name) => {
			if (name === "publishable") {
				return "CLERK_PUBLISHABLE_KEY";
			}
			if (name === "secret") {
				return "CLERK_SECRET_KEY";
			}
			return "TEST_DATABASE_URL";
		});
		for (const label of labels) {
			console.log(`${label} was skipped. A Dependabot pull request gets no secrets.`);
		}
		test.skip(true, "A Dependabot pull request gets no secrets.");
		return secrets;
	}
	throw new Error(`${missing.join(", ")} is missing.`);
}
