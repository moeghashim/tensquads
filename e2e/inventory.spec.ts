import { bodyText, expect, handlerNames, readInventory, test } from "./support.ts";

test("the homepage inventory matches the design texts and handlers", async ({ page }) => {
	const inventory = readInventory("Home");
	await page.goto("/");
	await page.getByRole("button", { name: "New business" }).click();
	const text = await bodyText(page);
	const missing = inventory.texts.filter((item) => !text.includes(item.replace(/\s+/g, " ").trim()));
	expect(missing).toEqual([]);
	expect(await handlerNames(page)).toEqual(["ex.pick", "k.pick", "onDraft"]);
	await expect(page.getByText("Leen Dates").first()).toBeVisible();
	await expect(page.getByText("Website builder").first()).toBeVisible();
	await expect(page.getByText("Meet the squad", { exact: true })).toBeVisible();
});

test("the sign-up inventory matches the design texts and handlers", async ({ page }) => {
	const inventory = readInventory("Onboarding");
	await page.goto("/signup");
	let text = await bodyText(page);
	await page.getByRole("button", { name: /A new business/ }).click();
	text = `${text} ${await bodyText(page)}`;
	await page.getByRole("button", { name: "Choose my squads" }).click();
	text = `${text} ${await bodyText(page)}`;
	await page.getByRole("button", { name: "Create my workspace" }).click();
	text = `${text} ${await bodyText(page)}`;
	await page.goto("/signup");
	await page.getByRole("button", { name: /An existing business/ }).click();
	text = `${text} ${await bodyText(page)}`;
	const flat = text.replace(/\s+/g, " ");
	const missing = inventory.texts.filter((item) => !flat.includes(item.replace(/\s+/g, " ").trim()));
	expect(missing).toEqual([]);
	const handlers = new Set<string>();
	await page.goto("/signup");
	for (const name of await handlerNames(page)) {
		handlers.add(name);
	}
	await page.getByRole("button", { name: /A new business/ }).click();
	for (const name of await handlerNames(page)) {
		handlers.add(name);
	}
	await page.getByRole("button", { name: "Choose my squads" }).click();
	for (const name of await handlerNames(page)) {
		handlers.add(name);
	}
	await expect(page.getByRole("button", { name: /Market researcher/ })).toBeVisible();
	await page.getByRole("button", { name: "Create my workspace" }).click();
	for (const name of await handlerNames(page)) {
		handlers.add(name);
	}
	await page.goto("/signup");
	await page.getByRole("button", { name: /An existing business/ }).click();
	for (const name of await handlerNames(page)) {
		handlers.add(name);
	}
	const expected = [...new Set(inventory.handlers.map((item) => item.handler)), "onEmail", "onPassword"].sort();
	expect([...handlers].sort()).toEqual(expected);
});

test("the sign-in inventory matches the design texts and handlers", async ({ page }) => {
	const inventory = readInventory("SignIn");
	await page.goto("/signin");
	await page.getByRole("button", { name: "Sign in" }).click();
	const text = await bodyText(page);
	const missing = inventory.texts.filter((item) => !text.includes(item.replace(/\s+/g, " ").trim()));
	expect(missing).toEqual([]);
	expect(await handlerNames(page)).toEqual(["onEmail", "onPassword", "submit"]);
});
