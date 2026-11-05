import { defineConfig } from "@playwright/test";

import { appOrigin, resolveE2ePort } from "./scripts/e2e-port.mjs";

const rulesFenceRepeat = Number(process.env.RULES_FENCE_REPEAT ?? "1");
const e2ePort = await resolveE2ePort();
const origin = appOrigin(e2ePort);

export default defineConfig({
	testDir: "e2e",
	timeout: 120_000,
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: 0,
	reporter: "line",
	snapshotPathTemplate: "{testDir}/{testFilePath}-snapshots/{arg}{ext}",
	expect: {
		toHaveScreenshot: {
			animations: "disabled",
			caret: "hide",
			scale: "css",
		},
	},
	use: {
		baseURL: origin,
		deviceScaleFactor: 1,
		viewport: { width: 1440, height: 900 },
		launchOptions: {
			args: ["--font-render-hinting=none", "--disable-font-subpixel-positioning", "--force-color-profile=srgb"],
		},
	},
	webServer: {
		command: "npm run dev -w @tensquads/web",
		url: origin,
		reuseExistingServer: false,
		timeout: 120_000,
		env: { ...process.env, TS_E2E_PORT: String(e2ePort) },
	},
	projects: [
		{
			name: "app",
			testIgnore: [/rules-fence\.spec\.ts/, /agent-fence\.spec\.ts/, /admin-.*\.spec\.ts/],
			fullyParallel: true,
		},
		{
			name: "admin",
			testMatch: /admin-.*\.spec\.ts/,
			fullyParallel: false,
		},
		{
			name: "rules-fence",
			testMatch: /rules-fence\.spec\.ts|agent-fence\.spec\.ts/,
			// scripts/e2e.mjs runs this project alone with --workers=1. fullyParallel does not set workers.
			fullyParallel: false,
			repeatEach: Number.isInteger(rulesFenceRepeat) && rulesFenceRepeat > 0 ? rulesFenceRepeat : 1,
		},
	],
});
