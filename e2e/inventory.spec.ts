import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compareInventory, type inventoryHtml } from "../scripts/design-inventory.mjs";
import { allowFor } from "../scripts/inventory-allow.mjs";
import { renderDesign } from "../scripts/render-design.mjs";
import { agentNames, rewriteBuiltInventory } from "./squadmate-copy.ts";
import { expect, readInventory, test } from "./support.ts";

const root = new URL("..", import.meta.url).pathname;

function builtInventory(html: string) {
	const directory = mkdtempSync(join(tmpdir(), "tensquads-screen-"));
	const file = join(directory, "body.html");
	const out = join(directory, "body.json");
	writeFileSync(file, html);
	try {
		execFileSync(process.execPath, ["scripts/design-inventory.mjs", "--html", file, "--out", out], { cwd: root });
		return JSON.parse(readFileSync(out, "utf8")) as ReturnType<typeof inventoryHtml>;
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
}

async function bodyHtml(page: { locator: (selector: string) => { innerHTML: () => Promise<string> } }) {
	return page.locator("body").innerHTML();
}

async function expectInventory(
	page: import("@playwright/test").Page,
	name: "Home" | "Onboarding" | "SignIn",
	built: ReturnType<typeof builtInventory>,
	state: Record<string, unknown> = {},
) {
	const canvas = await page.context().newPage();
	try {
		const rendered = await renderDesign(canvas, readInventory(name), state, allowFor(name));
		const expected = name === "Onboarding" ? rewriteBuiltInventory(rendered, agentNames) : rendered;
		const diff = compareInventory(expected, built);
		expect(diff.extraTexts).toEqual([]);
		expect(diff.missingTexts).toEqual([]);
		expect(diff.extraLinks).toEqual([]);
		expect(diff.missingLinks).toEqual([]);
		expect(diff.extraHandlers).toEqual([]);
		expect(diff.missingHandlers).toEqual([]);
		expect(diff.extraLoops).toEqual([]);
		expect(diff.missingLoops).toEqual([]);
	} finally {
		await canvas.close();
	}
}

test("the homepage inventory matches the design texts, handlers, loops, and links", async ({ page }) => {
	await page.goto("/");
	await page.getByRole("button", { name: "New business" }).click();
	await expectInventory(page, "Home", builtInventory(await bodyHtml(page)), { kind: "new" });
	await expect(page.getByText("Leen Dates").first()).toBeVisible();
	await expect(page.getByText("Website builder").first()).toBeVisible();
	await expect(page.getByText("Meet the squad", { exact: true })).toBeVisible();
});

for (const fault of ["extra paragraph", "missing logo", "changed Security target"]) {
	test(`${fault} fails the homepage inventory`, async ({ page }) => {
		await page.goto("/");
		await page.evaluate((fault) => {
			if (fault === "extra paragraph") {
				const paragraph = document.createElement("p");
				paragraph.textContent = "About Terms";
				document.body.append(paragraph);
			} else if (fault === "missing logo") {
				Array.from(document.querySelectorAll("span"))
					.find((node) => node.textContent === "Northwind Apparel")
					?.remove();
			} else {
				Array.from(document.querySelectorAll("a"))
					.find((node) => node.textContent?.trim() === "Security")
					?.setAttribute("href", "/signup");
			}
		}, fault);
		await expect(expectInventory(page, "Home", builtInventory(await bodyHtml(page)))).rejects.toThrow();
	});
}

test("the sign-up inventory matches the design texts, handlers, loops, and links", async ({ page }) => {
	await page.goto("/signup");
	await expectInventory(page, "Onboarding", builtInventory(await bodyHtml(page)));
	for (const kind of ["new", "existing"]) {
		await page.goto("/signup");
		await page.getByRole("button", { name: kind === "new" ? /A new business/ : /An existing business/ }).click();
		await expectInventory(page, "Onboarding", builtInventory(await bodyHtml(page)), { kind, step: "details" });
		await page.getByRole("button", { name: "Choose my squads" }).click();
		await expectInventory(page, "Onboarding", builtInventory(await bodyHtml(page)), { kind, step: "agents" });
		await page.getByRole("button", { name: "Create my workspace" }).click();
		await expectInventory(page, "Onboarding", builtInventory(await bodyHtml(page)), { kind, step: "account" });
	}
});

test("the sign-in inventory matches the design texts, handlers, loops, and links", async ({ page }) => {
	await page.goto("/signin");
	await expectInventory(page, "SignIn", builtInventory(await bodyHtml(page)));
	await page.getByRole("button", { name: "Sign in" }).click();
	await expectInventory(page, "SignIn", builtInventory(await bodyHtml(page)), { tried: true });
});
