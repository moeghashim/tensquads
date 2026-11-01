# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: session.spec.ts >> a new user makes one account and reaches overview
- Location: e2e/session.spec.ts:38:1

# Error details

```
Error: publishable, secret, testDatabase is missing.
```

# Test source

```ts
  213 | 			});
  214 | 			return send.apply(this, args as [Document | XMLHttpRequestBodyInit | null | undefined]);
  215 | 		};
  216 | 	});
  217 | 	return notes;
  218 | }
  219 | 
  220 | export function watchPageErrors(page: Page) {
  221 | 	const notes: string[] = [];
  222 | 	const keep = (value: string) => {
  223 | 		const clean = value
  224 | 			.replace(/pk_(?:test|live)_[A-Za-z0-9]+/g, "[redacted]")
  225 | 			.replace(/sk_(?:test|live)_[A-Za-z0-9]+/g, "[redacted]")
  226 | 			.replace(/postgres(?:ql)?:\/\/\S+/gi, "[redacted]")
  227 | 			.replace(/[\w.+-]+@[\w.-]+/g, "[email]")
  228 | 			.slice(0, 240);
  229 | 		if (clean.length > 0) {
  230 | 			notes.push(clean);
  231 | 		}
  232 | 	};
  233 | 	page.on("pageerror", (error) => {
  234 | 		keep(error.message);
  235 | 	});
  236 | 	page.on("response", (response) => {
  237 | 		const url = response.url();
  238 | 		if (!url.includes("clerk")) {
  239 | 			return;
  240 | 		}
  241 | 		void response
  242 | 			.json()
  243 | 			.then((body: { errors?: { code?: string }[]; status?: string; response?: { status?: string } }) => {
  244 | 				const codes = (body.errors ?? []).map((error) => error.code ?? "unknown");
  245 | 				const status = body.response?.status ?? body.status ?? "";
  246 | 				if (codes.length > 0 || response.status() >= 400) {
  247 | 					const path = new URL(url).pathname;
  248 | 					keep(`${response.status()} ${path} ${codes.join(",")} ${status}`);
  249 | 				}
  250 | 			})
  251 | 			.catch(() => undefined);
  252 | 	});
  253 | 	return notes;
  254 | }
  255 | 
  256 | export async function handlerNames(page: Page) {
  257 | 	const names = await page.locator("[data-handler]").evaluateAll((elements) => {
  258 | 		return elements.map((element) => element.getAttribute("data-handler") ?? "");
  259 | 	});
  260 | 	return [...new Set(names)].sort();
  261 | }
  262 | 
  263 | export async function expectNoHorizontalScroll(page: Page) {
  264 | 	const fits = await page.evaluate(() => {
  265 | 		const root = document.documentElement;
  266 | 		return root.scrollWidth <= root.clientWidth;
  267 | 	});
  268 | 	expect(fits).toBe(true);
  269 | }
  270 | 
  271 | export async function expectLabeledInputs(page: Page) {
  272 | 	const inputs = page.locator("input, textarea");
  273 | 	const count = await inputs.count();
  274 | 	for (let index = 0; index < count; index += 1) {
  275 | 		const id = await inputs.nth(index).getAttribute("id");
  276 | 		expect(id).toBeTruthy();
  277 | 		await expect(page.locator(`label[for="${id}"]`)).toHaveCount(1);
  278 | 	}
  279 | }
  280 | 
  281 | export async function expectNamedButtons(page: Page) {
  282 | 	const unnamed = await page.locator("button").evaluateAll((elements) => {
  283 | 		return elements.filter((element) => {
  284 | 			const label = element.getAttribute("aria-label") ?? "";
  285 | 			const text = (element.textContent ?? "").replace(/\s+/g, " ").trim();
  286 | 			return label.length === 0 && text.length === 0;
  287 | 		}).length;
  288 | 	});
  289 | 	expect(unnamed).toBe(0);
  290 | }
  291 | 
  292 | export function secretsFor(names: readonly ("publishable" | "secret" | "testDatabase")[]) {
  293 | 	const secrets = localSecrets();
  294 | 	const missing = names.filter((name) => secrets[name].length === 0);
  295 | 	if (missing.length === 0) {
  296 | 		return secrets;
  297 | 	}
  298 | 	const actor = process.env.GITHUB_ACTOR ?? "";
  299 | 	if (process.env.GITHUB_ACTIONS === "true" && actor === "dependabot[bot]") {
  300 | 		const labels = missing.map((name) => {
  301 | 			if (name === "publishable") {
  302 | 				return "CLERK_PUBLISHABLE_KEY";
  303 | 			}
  304 | 			if (name === "secret") {
  305 | 				return "CLERK_SECRET_KEY";
  306 | 			}
  307 | 			return "TEST_DATABASE_URL";
  308 | 		});
  309 | 		console.log(`${labels.join(", ")} was skipped. A Dependabot pull request gets no secrets.`);
  310 | 		test.skip(true, "A Dependabot pull request gets no secrets.");
  311 | 		return secrets;
  312 | 	}
> 313 | 	throw new Error(`${missing.join(", ")} is missing.`);
      |        ^ Error: publishable, secret, testDatabase is missing.
  314 | }
  315 | 
```