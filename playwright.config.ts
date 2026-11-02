import { defineConfig } from "@playwright/test";

const rulesFenceRepeat = Number(process.env.RULES_FENCE_REPEAT ?? "1");

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
		baseURL: "http://localhost:3000",
		deviceScaleFactor: 1,
		viewport: { width: 1440, height: 900 },
		launchOptions: {
			args: ["--font-render-hinting=none", "--disable-font-subpixel-positioning", "--force-color-profile=srgb"],
		},
	},
	webServer: {
		command: "npm run dev -w @tensquads/web",
		url: "http://localhost:3000",
		reuseExistingServer: false,
		timeout: 120_000,
	},
	projects: [
		{
			name: "app",
			testIgnore: /rules-fence\.spec\.ts/,
			fullyParallel: true,
		},
		{
			name: "rules-fence",
			testMatch: /rules-fence\.spec\.ts/,
			// scripts/e2e.mjs runs this project alone with --workers=1. fullyParallel does not set workers.
			fullyParallel: false,
			repeatEach: Number.isInteger(rulesFenceRepeat) && rulesFenceRepeat > 0 ? rulesFenceRepeat : 1,
		},
	],
});
