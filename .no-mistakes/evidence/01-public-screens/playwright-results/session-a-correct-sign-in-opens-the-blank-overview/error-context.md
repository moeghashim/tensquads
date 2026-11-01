# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: session.spec.ts >> a correct sign-in opens the blank overview
- Location: e2e/session.spec.ts:12:1

# Error details

```
Error: publishable, secret, testDatabase is missing.
```

# Test source

```ts
  211 | 			});
  212 | 			return send.apply(this, args as [Document | XMLHttpRequestBodyInit | null | undefined]);
  213 | 		};
  214 | 	});
  215 | 	return notes;
  216 | }
  217 | 
  218 | export function watchPageErrors(page: Page) {
  219 | 	const notes: string[] = [];
  220 | 	const keep = (value: string) => {
  221 | 		const clean = value
  222 | 			.replace(/pk_(?:test|live)_[A-Za-z0-9]+/g, "[redacted]")
  223 | 			.replace(/sk_(?:test|live)_[A-Za-z0-9]+/g, "[redacted]")
  224 | 			.replace(/postgres(?:ql)?:\/\/\S+/gi, "[redacted]")
  225 | 			.replace(/[\w.+-]+@[\w.-]+/g, "[email]")
  226 | 			.slice(0, 240);
  227 | 		if (clean.length > 0) {
  228 | 			notes.push(clean);
  229 | 		}
  230 | 	};
  231 | 	page.on("pageerror", (error) => {
  232 | 		keep(error.message);
  233 | 	});
  234 | 	page.on("response", (response) => {
  235 | 		const url = response.url();
  236 | 		if (!url.includes("clerk")) {
  237 | 			return;
  238 | 		}
  239 | 		void response
  240 | 			.json()
  241 | 			.then((body: { errors?: { code?: string }[]; status?: string; response?: { status?: string } }) => {
  242 | 				const codes = (body.errors ?? []).map((error) => error.code ?? "unknown");
  243 | 				const status = body.response?.status ?? body.status ?? "";
  244 | 				if (codes.length > 0 || response.status() >= 400) {
  245 | 					const path = new URL(url).pathname;
  246 | 					keep(`${response.status()} ${path} ${codes.join(",")} ${status}`);
  247 | 				}
  248 | 			})
  249 | 			.catch(() => undefined);
  250 | 	});
  251 | 	return notes;
  252 | }
  253 | 
  254 | export async function handlerNames(page: Page) {
  255 | 	const names = await page.locator("[data-handler]").evaluateAll((elements) => {
  256 | 		return elements.map((element) => element.getAttribute("data-handler") ?? "");
  257 | 	});
  258 | 	return [...new Set(names)].sort();
  259 | }
  260 | 
  261 | export async function expectNoHorizontalScroll(page: Page) {
  262 | 	const fits = await page.evaluate(() => {
  263 | 		const root = document.documentElement;
  264 | 		return root.scrollWidth <= root.clientWidth;
  265 | 	});
  266 | 	expect(fits).toBe(true);
  267 | }
  268 | 
  269 | export async function expectLabeledInputs(page: Page) {
  270 | 	const inputs = page.locator("input, textarea");
  271 | 	const count = await inputs.count();
  272 | 	for (let index = 0; index < count; index += 1) {
  273 | 		const id = await inputs.nth(index).getAttribute("id");
  274 | 		expect(id).toBeTruthy();
  275 | 		await expect(page.locator(`label[for="${id}"]`)).toHaveCount(1);
  276 | 	}
  277 | }
  278 | 
  279 | export async function expectNamedButtons(page: Page) {
  280 | 	const unnamed = await page.locator("button").evaluateAll((elements) => {
  281 | 		return elements.filter((element) => {
  282 | 			const label = element.getAttribute("aria-label") ?? "";
  283 | 			const text = (element.textContent ?? "").replace(/\s+/g, " ").trim();
  284 | 			return label.length === 0 && text.length === 0;
  285 | 		}).length;
  286 | 	});
  287 | 	expect(unnamed).toBe(0);
  288 | }
  289 | 
  290 | export function secretsFor(names: readonly ("publishable" | "secret" | "testDatabase")[]) {
  291 | 	const secrets = localSecrets();
  292 | 	const missing = names.filter((name) => secrets[name].length === 0);
  293 | 	if (missing.length === 0) {
  294 | 		return secrets;
  295 | 	}
  296 | 	const actor = process.env.GITHUB_ACTOR ?? "";
  297 | 	if (process.env.GITHUB_ACTIONS === "true" && actor === "dependabot[bot]") {
  298 | 		const labels = missing.map((name) => {
  299 | 			if (name === "publishable") {
  300 | 				return "CLERK_PUBLISHABLE_KEY";
  301 | 			}
  302 | 			if (name === "secret") {
  303 | 				return "CLERK_SECRET_KEY";
  304 | 			}
  305 | 			return "TEST_DATABASE_URL";
  306 | 		});
  307 | 		console.log(`${labels.join(", ")} was skipped. A Dependabot pull request gets no secrets.`);
  308 | 		test.skip(true, "A Dependabot pull request gets no secrets.");
  309 | 		return secrets;
  310 | 	}
> 311 | 	throw new Error(`${missing.join(", ")} is missing.`);
      |        ^ Error: publishable, secret, testDatabase is missing.
  312 | }
  313 | 
```