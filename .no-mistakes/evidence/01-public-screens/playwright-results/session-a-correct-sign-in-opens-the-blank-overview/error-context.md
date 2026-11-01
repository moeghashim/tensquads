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
  226 | 		};
  227 | 	});
  228 | 	return notes;
  229 | }
  230 | 
  231 | export function watchPageErrors(page: Page) {
  232 | 	const notes: string[] = [];
  233 | 	const keep = (value: string) => {
  234 | 		const clean = value
  235 | 			.replace(/pk_(?:test|live)_[A-Za-z0-9]+/g, "[redacted]")
  236 | 			.replace(/sk_(?:test|live)_[A-Za-z0-9]+/g, "[redacted]")
  237 | 			.replace(/postgres(?:ql)?:\/\/\S+/gi, "[redacted]")
  238 | 			.replace(/[\w.+-]+@[\w.-]+/g, "[email]")
  239 | 			.slice(0, 240);
  240 | 		if (clean.length > 0) {
  241 | 			notes.push(clean);
  242 | 		}
  243 | 	};
  244 | 	page.on("pageerror", (error) => {
  245 | 		keep(error.message);
  246 | 	});
  247 | 	page.on("response", (response) => {
  248 | 		const url = response.url();
  249 | 		if (!url.includes("clerk")) {
  250 | 			return;
  251 | 		}
  252 | 		void response
  253 | 			.json()
  254 | 			.then((body: { errors?: { code?: string }[]; status?: string; response?: { status?: string } }) => {
  255 | 				const codes = (body.errors ?? []).map((error) => error.code ?? "unknown");
  256 | 				const status = body.response?.status ?? body.status ?? "";
  257 | 				if (codes.length > 0 || response.status() >= 400) {
  258 | 					const path = new URL(url).pathname;
  259 | 					keep(`${response.status()} ${path} ${codes.join(",")} ${status}`);
  260 | 				}
  261 | 			})
  262 | 			.catch(() => undefined);
  263 | 	});
  264 | 	return notes;
  265 | }
  266 | 
  267 | export async function handlerNames(page: Page) {
  268 | 	const names = await page.locator("[data-handler]").evaluateAll((elements) => {
  269 | 		return elements.map((element) => element.getAttribute("data-handler") ?? "");
  270 | 	});
  271 | 	return [...new Set(names)].sort();
  272 | }
  273 | 
  274 | export async function expectNoHorizontalScroll(page: Page) {
  275 | 	const fits = await page.evaluate(() => {
  276 | 		const root = document.documentElement;
  277 | 		return root.scrollWidth <= root.clientWidth;
  278 | 	});
  279 | 	expect(fits).toBe(true);
  280 | }
  281 | 
  282 | export async function expectLabeledInputs(page: Page) {
  283 | 	const inputs = page.locator("input, textarea");
  284 | 	const count = await inputs.count();
  285 | 	for (let index = 0; index < count; index += 1) {
  286 | 		const id = await inputs.nth(index).getAttribute("id");
  287 | 		expect(id).toBeTruthy();
  288 | 		await expect(page.locator(`label[for="${id}"]`)).toHaveCount(1);
  289 | 	}
  290 | }
  291 | 
  292 | export async function expectNamedButtons(page: Page) {
  293 | 	const unnamed = await page.locator("button").evaluateAll((elements) => {
  294 | 		return elements.filter((element) => {
  295 | 			const label = element.getAttribute("aria-label") ?? "";
  296 | 			const text = (element.textContent ?? "").replace(/\s+/g, " ").trim();
  297 | 			return label.length === 0 && text.length === 0;
  298 | 		}).length;
  299 | 	});
  300 | 	expect(unnamed).toBe(0);
  301 | }
  302 | 
  303 | export function secretsFor(names: readonly ("publishable" | "secret" | "testDatabase")[]) {
  304 | 	const secrets = localSecrets();
  305 | 	const missing = names.filter((name) => secrets[name].length === 0);
  306 | 	if (missing.length === 0) {
  307 | 		return secrets;
  308 | 	}
  309 | 	const actor = process.env.GITHUB_ACTOR ?? "";
  310 | 	if (process.env.GITHUB_ACTIONS === "true" && actor === "dependabot[bot]") {
  311 | 		const labels = missing.map((name) => {
  312 | 			if (name === "publishable") {
  313 | 				return "CLERK_PUBLISHABLE_KEY";
  314 | 			}
  315 | 			if (name === "secret") {
  316 | 				return "CLERK_SECRET_KEY";
  317 | 			}
  318 | 			return "TEST_DATABASE_URL";
  319 | 		});
  320 | 		for (const label of labels) {
  321 | 			console.log(`${label} was skipped. A Dependabot pull request gets no secrets.`);
  322 | 		}
  323 | 		test.skip(true, "A Dependabot pull request gets no secrets.");
  324 | 		return secrets;
  325 | 	}
> 326 | 	throw new Error(`${missing.join(", ")} is missing.`);
      |        ^ Error: publishable, secret, testDatabase is missing.
  327 | }
  328 | 
```