import { expect, openWorkspace, test } from "./workspace.ts";

test("a refund limit change appears in Traffic shared state", async ({ page, workspaceUser }) => {
	await openWorkspace(page, workspaceUser);
	await page.goto("/rules");
	await expect(page.locator("#lim-refund")).toHaveValue("50");
	const [saved] = await Promise.all([
		page.waitForResponse((response) => {
			const request = response.request();
			return request.method() === "POST" && (request.postData() ?? "").includes("policy.refund_auto_limit");
		}),
		page.locator("#lim-refund").fill("55"),
	]);
	expect(saved.ok()).toBe(true);
	await saved.finished();
	await expect(page.locator("#lim-refund")).toHaveValue("55");
	await page.goto("/traffic");
	await expect(page.getByRole("heading", { name: "Shared state held by Master" })).toBeVisible();
	const refund = page.locator("[data-loop='stateRows'] > div").filter({
		has: page.getByText("policy.refund_auto_limit", { exact: true }),
	});
	await expect(refund.locator("span")).toHaveText(["policy.refund_auto_limit", "55"]);
});
