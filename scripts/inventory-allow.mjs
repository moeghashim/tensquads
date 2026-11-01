// Strings and targets the task adds on top of the design inventories.
// tasks/01-public-screens.md: the account step reuses the sign-in fields.
// The squads control no longer navigates to Main, and the sign-in submit target is dynamic.

export const inventoryAllow = {
	Onboarding: {
		texts: ["Email", "Password", "Enter your email and password to sign in.", "you@company.com", "Your password"],
		handlers: ["onEmail", "onPassword"],
		links: ["Main.dc.html"],
	},
	SignIn: {
		texts: [],
		handlers: [],
		links: ["{{target}}"],
	},
};

export function allowFor(name) {
	return inventoryAllow[name] ?? { texts: [], handlers: [], links: [] };
}
