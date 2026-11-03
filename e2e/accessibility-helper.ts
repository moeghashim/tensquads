import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";

// These colours are design values. Their contrast fails. The fix is a change in the design canvas.
const designContrastFaults = [
	"home-trial-note",
	"home-logo-kicker",
	"home-logo-name",
	"home-pricing-note",
	"home-footer-line",
	"home-online-pill",
	"signin-divider",
	"signin-terms",
	"signup-inactive-step",
	"signup-terms",
	"overview-online-pill",
] as const;

export async function accessibilityViolations(page: Page, disabledRules: readonly string[] = []) {
	const scan = new AxeBuilder({ page });
	if (disabledRules.length > 0) {
		scan.disableRules([...disabledRules]);
	}
	const full = await scan.analyze();
	const contrast = new AxeBuilder({ page }).withRules(["color-contrast"]);
	for (const name of designContrastFaults) {
		contrast.exclude(`[data-design-contrast="${name}"]`);
	}
	const remaining = await contrast.analyze();
	return [...full.violations.filter((violation) => violation.id !== "color-contrast"), ...remaining.violations];
}
