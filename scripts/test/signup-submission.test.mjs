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
			import { SignInPage } from "./apps/web/src/screens/signin/SignInPage.tsx";
			window.calls = { password: 0, finalize: 0, create: 0, navigate: 0 };
			window.root = createRoot(document.getElementById("root"));
			window.root.render(React.createElement(window.signin ? SignInPage : SignupPage, { publishableKey: "test" }));
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
						status: "missing_requirements", createdSessionId: "session",
						password: async () => { window.calls.password++; signUp.status = "complete"; return {}; },
						finalize: async () => { window.calls.finalize++; return { error: window.finalizeError ? new Error("finalize failed") : null }; }
					};
					export const useSignUp = () => ({ signUp });
					export const useSignIn = () => ({ signIn: signUp });
				` : path.startsWith("@tanstack") ? `
					export const useNavigate = () => async (options) => { window.destination = options.to; window.calls.navigate++; };
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

async function expectCredentialMismatchRejected(page, submit, calls) {
	for (const [label, changed, original] of [
		["Email", "other@example.com", "owner@example.com"],
		["Password", "another-password-at-least-16", "password-at-least-16-characters"],
	]) {
		const field = page.getByLabel(label);
		await field.evaluate((input) => { input.disabled = false; });
		await field.fill(changed);
		await submit.click();
		await page.getByRole("alert").waitFor();
		assert.equal(await page.getByRole("alert").textContent(), "That email or password is wrong.");
		assert.deepEqual(await page.evaluate(() => window.calls), calls);
		await field.evaluate((input) => { input.disabled = false; });
		await field.fill(original);
	}
}

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
		await expectCredentialMismatchRejected(page, submit, { password: 1, finalize: 1, create: 1, navigate: 0 });
		await page.getByRole("button", { name: "Back" }).click();
		await submit.click();
		assert.equal(await page.getByLabel("Email").inputValue(), "owner@example.com");
		assert.equal(await page.getByLabel("Email").isDisabled(), true);
		await submit.click();
		await page.waitForFunction(() => window.calls.create === 2);
		assert.deepEqual(await page.evaluate(() => window.calls), { password: 1, finalize: 1, create: 2, navigate: 0 });
		await page.evaluate(() => window.finish());
		await page.waitForFunction(() => window.calls.navigate === 1);
		assert.equal(await page.evaluate(() => window.destination), "/overview");
		await submit.click();
		await page.waitForFunction(() => window.calls.create === 3);
		await page.evaluate(() => { window.root.unmount(); window.finish(); });
		await page.evaluate(() => new Promise(requestAnimationFrame));
		assert.equal(await page.evaluate(() => window.calls.navigate), 1);
	} finally {
		await browser.close();
	}
});

for (const signin of [false, true]) {
	test(`${signin ? "sign-in" : "sign-up"} reports finalize errors and can retry`, async () => {
		const browser = await chromium.launch({ headless: true });
		try {
			const page = await browser.newPage();
			await page.setContent('<div id="root"></div>');
			await page.evaluate((value) => { window.signin = value; window.finalizeError = true; }, signin);
			await page.addScriptTag({ content: result.outputFiles[0].text });
			if (!signin) {
				await page.getByRole("button", { name: /A new business/ }).click();
				await page.getByRole("button", { name: "Choose my squads" }).click();
				await page.getByRole("button", { name: "Create my workspace" }).click();
			}
			await page.getByLabel("Email").fill("owner@example.com");
			await page.getByLabel("Password").fill("password-at-least-16-characters");
			const submit = page.getByRole("button", { name: signin ? "Sign in" : "Create my workspace", exact: true });
			await submit.click();
			await page.getByRole("alert").waitFor();
			assert.equal(await page.getByRole("alert").textContent(), "That email or password is wrong.");
			assert.equal(await page.getByLabel("Email").isEnabled(), signin);
			assert.equal(await page.getByLabel("Password").isEnabled(), signin);
			assert.deepEqual(await page.evaluate(() => window.calls), { password: 1, finalize: 1, create: 0, navigate: 0 });
			if (!signin) {
				await expectCredentialMismatchRejected(page, submit, { password: 1, finalize: 1, create: 0, navigate: 0 });
			}
			await page.evaluate(() => { window.finalizeError = false; });
			await submit.click();
			if (!signin) {
				await page.waitForFunction(() => window.calls.create === 1);
				assert.equal(await page.evaluate(() => window.calls.password), 1);
				await page.evaluate(() => window.finish());
			}
			await page.waitForFunction(() => window.calls.navigate === 1);
			assert.equal(await page.evaluate(() => window.calls.finalize), 2);
		} finally {
			await browser.close();
		}
	});
}

test("screen details and Back transitions preserve business fields and picked squads", async () => {
	const browser = await chromium.launch({ headless: true });
	try {
		for (const kind of ["new", "existing"]) {
			const page = await browser.newPage();
			await page.setContent('<div id="root"></div>');
			await page.addScriptTag({ content: result.outputFiles[0].text });
			await page.getByRole("button", { name: kind === "new" ? /A new business/ : /An existing business/ }).click();
			await page.getByLabel("Business name").fill("Harbor Coffee");
			await page.getByLabel("Company mission").fill("Serve the neighborhood");
			const details = page.getByRole("button", { name: "Choose my squads" });
			const back = page.getByRole("button", { name: "Back", exact: true });
			await details.click();
			const support = page.getByRole("button", { name: /Replies in your voice/ });
			assert.equal(await support.getAttribute("aria-pressed"), "true");
			await support.click();
			await page.getByRole("button", { name: "Create my workspace" }).click();
			await page.getByLabel("Email").waitFor();
			await back.click();
			assert.equal(await page.getByLabel("Email").count(), 0);
			assert.equal(await support.getAttribute("aria-pressed"), "false");
			await back.click();
			assert.equal(await page.getByLabel("Business name").inputValue(), "Harbor Coffee");
			assert.equal(await page.getByLabel("Company mission").inputValue(), "Serve the neighborhood");
			await details.click();
			assert.equal(await support.getAttribute("aria-pressed"), "false");
			await back.click();
			await back.click();
			await page.getByRole("heading", { name: "Where are you starting from?" }).waitFor();
			assert.deepEqual(await page.evaluate(() => window.calls), { password: 0, finalize: 0, create: 0, navigate: 0 });
			await page.close();
		}
	} finally {
		await browser.close();
	}
});
