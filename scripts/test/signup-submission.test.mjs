import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "@playwright/test";
import * as esbuild from "esbuild";

const result = await esbuild.build({
	stdin: {
		contents: `
			import React from "react";
			import { createRoot } from "react-dom/client";
			import { SignupPage } from "./apps/web/src/screens/signup/SignupPage.tsx";
			window.calls = { password: 0, finalize: 0, create: 0, navigate: 0 };
			window.root = createRoot(document.getElementById("root"));
			window.root.render(React.createElement(SignupPage, { publishableKey: "test" }));
		`,
		resolveDir: process.cwd(),
		loader: "tsx",
	},
	bundle: true,
	write: false,
	format: "iife",
	jsx: "automatic",
	plugins: [{
		name: "signup-boundaries",
		setup(build) {
			build.onResolve({ filter: /^(@clerk\/tanstack-react-start|@tanstack\/react-router|#\/server\/create-account.ts)$/ }, (args) => ({ path: args.path, namespace: "boundary" }));
			build.onLoad({ filter: /.*/, namespace: "boundary" }, ({ path }) => ({
				contents: path.startsWith("@clerk") ? `
					const signUp = {
						status: "complete", createdSessionId: "session",
						password: async () => { window.calls.password++; return {}; },
						finalize: async () => { window.calls.finalize++; }
					};
					export const useSignUp = () => ({ signUp });
				` : path.startsWith("@tanstack") ? `
					export const useNavigate = () => async () => { window.calls.navigate++; };
				` : `
					export const createAccount = async () => {
						window.calls.create++;
						await new Promise((resolve, reject) => { window.finish = resolve; window.fail = reject; });
					};
				`,
			}));
		},
	}],
});

test("finalized signup locks credentials and owns pending requests across steps", async () => {
	const browser = await chromium.launch({ headless: true });
	try {
		const page = await browser.newPage();
		await page.setContent('<div id="root"></div>');
		await page.addScriptTag({ content: result.outputFiles[0].text });
		await page.getByRole("button", { name: /A new business/ }).click();
		await page.getByRole("button", { name: "Choose my squads" }).click();
		const submit = page.getByRole("button", { name: "Create my workspace" });
		await submit.click();
		await page.getByLabel("Email").fill("owner@example.com");
		await page.getByLabel("Password").fill("password-at-least-16-characters");
		await submit.click();
		await page.waitForFunction(() => window.calls.create === 1);
		assert.equal(await submit.isDisabled(), true);
		assert.equal(await page.getByRole("button", { name: "Back" }).isDisabled(), true);
		await submit.evaluate((button) => button.click());
		assert.equal(await page.evaluate(() => window.calls.create), 1);
		await page.evaluate(() => window.fail(new Error("create failed")));
		await page.getByRole("alert").waitFor();
		assert.equal(await page.getByRole("alert").textContent(), "Something went wrong. Try again.");
		assert.equal(await page.getByLabel("Email").isDisabled(), true);
		assert.equal(await page.getByLabel("Password").isDisabled(), true);
		assert.equal(await submit.isEnabled(), true);
		await page.getByRole("button", { name: "Back" }).click();
		await submit.click();
		assert.equal(await page.getByLabel("Email").inputValue(), "owner@example.com");
		assert.equal(await page.getByLabel("Email").isDisabled(), true);
		await submit.click();
		await page.waitForFunction(() => window.calls.create === 2);
		assert.deepEqual(await page.evaluate(() => window.calls), { password: 1, finalize: 1, create: 2, navigate: 0 });
		await page.evaluate(() => window.finish());
		await page.waitForFunction(() => window.calls.navigate === 1);
		await submit.click();
		await page.waitForFunction(() => window.calls.create === 3);
		await page.evaluate(() => { window.root.unmount(); window.finish(); });
		await page.evaluate(() => new Promise(requestAnimationFrame));
		assert.equal(await page.evaluate(() => window.calls.navigate), 1);
	} finally {
		await browser.close();
	}
});
