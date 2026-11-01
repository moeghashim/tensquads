import { defineConfig } from "@playwright/test";

export default defineConfig({
	testDir: "e2e",
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
	},
	webServer: {
		command: "npm run dev -w @tensquads/web",
		url: "http://localhost:3000",
		reuseExistingServer: false,
		timeout: 120_000,
	},
});
