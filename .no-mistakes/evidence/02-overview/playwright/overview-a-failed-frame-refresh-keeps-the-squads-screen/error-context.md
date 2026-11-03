# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: overview.spec.ts >> a failed frame refresh keeps the squads screen
- Location: e2e/overview.spec.ts:701:1

# Error details

```
Error: publishable, secret, testDatabase is missing.
```

# Test source

```ts
  234 | export function watchPageErrors(page: Page) {
  235 | 	const notes: string[] = [];
  236 | 	const keep = (value: string) => {
  237 | 		const clean = value
  238 | 			.replace(/pk_(?:test|live)_[A-Za-z0-9]+/g, "[redacted]")
  239 | 			.replace(/sk_(?:test|live)_[A-Za-z0-9]+/g, "[redacted]")
  240 | 			.replace(/postgres(?:ql)?:\/\/\S+/gi, "[redacted]")
  241 | 			.replace(/[\w.+-]+@[\w.-]+/g, "[email]")
  242 | 			.slice(0, 240);
  243 | 		if (clean.length > 0) {
  244 | 			notes.push(clean);
  245 | 		}
  246 | 	};
  247 | 	page.on("pageerror", (error) => {
  248 | 		keep(error.message);
  249 | 	});
  250 | 	page.on("response", (response) => {
  251 | 		const url = response.url();
  252 | 		if (!url.includes("clerk")) {
  253 | 			return;
  254 | 		}
  255 | 		void response
  256 | 			.json()
  257 | 			.then((body: { errors?: { code?: string }[]; status?: string; response?: { status?: string } }) => {
  258 | 				const codes = (body.errors ?? []).map((error) => error.code ?? "unknown");
  259 | 				const status = body.response?.status ?? body.status ?? "";
  260 | 				if (codes.length > 0 || response.status() >= 400) {
  261 | 					const path = new URL(url).pathname;
  262 | 					keep(`${response.status()} ${path} ${codes.join(",")} ${status}`);
  263 | 				}
  264 | 			})
  265 | 			.catch(() => undefined);
  266 | 	});
  267 | 	return notes;
  268 | }
  269 | 
  270 | export async function handlerNames(page: Page) {
  271 | 	const names = await page.locator("[data-handler]").evaluateAll((elements) => {
  272 | 		return elements.map((element) => element.getAttribute("data-handler") ?? "");
  273 | 	});
  274 | 	return [...new Set(names)].sort();
  275 | }
  276 | 
  277 | export async function expectNoHorizontalScroll(page: Page) {
  278 | 	const fits = await page.evaluate(() => {
  279 | 		const root = document.documentElement;
  280 | 		return root.scrollWidth <= root.clientWidth;
  281 | 	});
  282 | 	expect(fits).toBe(true);
  283 | }
  284 | 
  285 | export async function expectLabeledInputs(page: Page) {
  286 | 	const inputs = page.locator("input, textarea, select");
  287 | 	const count = await inputs.count();
  288 | 	for (let index = 0; index < count; index += 1) {
  289 | 		const control = inputs.nth(index);
  290 | 		const wrapped = await control.evaluate((element) => element.closest("label") !== null);
  291 | 		if (wrapped) {
  292 | 			continue;
  293 | 		}
  294 | 		const id = await control.getAttribute("id");
  295 | 		expect(id).toBeTruthy();
  296 | 		await expect(page.locator(`label[for="${id}"]`)).toHaveCount(1);
  297 | 	}
  298 | }
  299 | 
  300 | export async function expectNamedButtons(page: Page) {
  301 | 	const unnamed = await page.locator("button").evaluateAll((elements) => {
  302 | 		return elements.filter((element) => {
  303 | 			const label = element.getAttribute("aria-label") ?? "";
  304 | 			const text = (element.textContent ?? "").replace(/\s+/g, " ").trim();
  305 | 			return label.length === 0 && text.length === 0;
  306 | 		}).length;
  307 | 	});
  308 | 	expect(unnamed).toBe(0);
  309 | }
  310 | 
  311 | export function secretsFor(names: readonly ("publishable" | "secret" | "testDatabase")[]) {
  312 | 	const secrets = localSecrets();
  313 | 	const missing = names.filter((name) => secrets[name].length === 0);
  314 | 	if (missing.length === 0) {
  315 | 		return secrets;
  316 | 	}
  317 | 	const actor = process.env.GITHUB_ACTOR ?? "";
  318 | 	if (process.env.GITHUB_ACTIONS === "true" && actor === "dependabot[bot]") {
  319 | 		const labels = missing.map((name) => {
  320 | 			if (name === "publishable") {
  321 | 				return "CLERK_PUBLISHABLE_KEY";
  322 | 			}
  323 | 			if (name === "secret") {
  324 | 				return "CLERK_SECRET_KEY";
  325 | 			}
  326 | 			return "TEST_DATABASE_URL";
  327 | 		});
  328 | 		for (const label of labels) {
  329 | 			console.log(`${label} was skipped. A Dependabot pull request gets no secrets.`);
  330 | 		}
  331 | 		test.skip(true, "A Dependabot pull request gets no secrets.");
  332 | 		return secrets;
  333 | 	}
> 334 | 	throw new Error(`${missing.join(", ")} is missing.`);
      |        ^ Error: publishable, secret, testDatabase is missing.
  335 | }
  336 | 
```