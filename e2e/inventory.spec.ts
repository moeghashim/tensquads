import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compareInventory, mergeInventories } from "../scripts/design-inventory.mjs";
import { allowFor } from "../scripts/inventory-allow.mjs";
import { expect, readInventory, test } from "./support.ts";

const root = new URL("..", import.meta.url).pathname;

function builtInventory(html: string) {
	const directory = mkdtempSync(join(tmpdir(), "tensquads-screen-"));
	const file = join(directory, "body.html");
	const out = join(directory, "body.json");
	writeFileSync(file, html);
	try {
		execFileSync(process.execPath, ["scripts/design-inventory.mjs", "--html", file, "--out", out], { cwd: root });
		return JSON.parse(readFileSync(out, "utf8")) as ReturnType<typeof mergeInventories>;
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
}

async function bodyHtml(page: { locator: (selector: string) => { innerHTML: () => Promise<string> } }) {
	return page.locator("body").innerHTML();
}

function expectInventory(
	name: "Home" | "Onboarding" | "SignIn",
	built: ReturnType<typeof builtInventory>,
	handlerTags: { handler: string; design: string; built: string }[],
) {
	const diff = compareInventory(readInventory(name), built, allowFor(name));
	expect(diff.extraTexts).toEqual([]);
	expect(diff.missingTexts).toEqual([]);
	expect(diff.extraLinks).toEqual([]);
	expect(diff.missingLinks).toEqual([]);
	expect(diff.extraHandlers).toEqual([]);
	expect(diff.missingHandlers).toEqual([]);
	expect(diff.extraLoops).toEqual([]);
	expect(diff.missingLoops).toEqual([]);
	expect(diff.handlerTags).toEqual(handlerTags);
}

test("the homepage inventory matches the design texts, handlers, loops, and links", async ({ page }) => {
	await page.goto("/");
	await page.getByRole("button", { name: "New business" }).click();
	expectInventory("Home", builtInventory(await bodyHtml(page)), []);
	await expect(page.getByText("Leen Dates").first()).toBeVisible();
	await expect(page.getByText("Website builder").first()).toBeVisible();
	await expect(page.getByText("Meet the squad", { exact: true })).toBeVisible();
});

test("an extra paragraph fails the homepage inventory", async ({ page }) => {
	await page.goto("/");
	await page.evaluate(() => {
		const paragraph = document.createElement("p");
		paragraph.textContent = "Not approved.";
		document.body.append(paragraph);
	});
	const diff = compareInventory(readInventory("Home"), builtInventory(await bodyHtml(page)), allowFor("Home"));
	expect(diff.extraTexts).toContain("Not approved.");
});

test("the sign-up inventory matches the design texts, handlers, loops, and links", async ({ page }) => {
	await page.goto("/signup");
	const pages = [await bodyHtml(page)];
	await page.getByRole("button", { name: /A new business/ }).click();
	pages.push(await bodyHtml(page));
	await page.getByRole("button", { name: "Choose my squads" }).click();
	pages.push(await bodyHtml(page));
	await expect(page.getByRole("button", { name: /Market researcher/ })).toBeVisible();
	await page.getByRole("button", { name: "Create my workspace" }).click();
	pages.push(await bodyHtml(page));
	await page.goto("/signup");
	await page.getByRole("button", { name: /An existing business/ }).click();
	pages.push(await bodyHtml(page));
	await page.getByRole("button", { name: "Choose my squads" }).click();
	pages.push(await bodyHtml(page));
	expectInventory("Onboarding", mergeInventories(pages.map((html) => builtInventory(html))), []);
});

test("the sign-in inventory matches the design texts, handlers, loops, and links", async ({ page }) => {
	await page.goto("/signin");
	await page.getByRole("button", { name: "Sign in" }).click();
	expectInventory("SignIn", builtInventory(await bodyHtml(page)), [
		{ handler: "submit", design: "a", built: "button" },
	]);
});
