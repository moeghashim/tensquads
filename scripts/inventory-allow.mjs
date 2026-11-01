const inventoryAllow = {
	Onboarding: {
		controls: [{ selector: 'a[href="Main.dc.html"]', removeHref: true, tag: "button" }],
		account: `<div><div><label for="email">Email</label><input id="email" data-handler="onEmail" /></div><div><label for="password">Password</label><input id="password" data-handler="onPassword" /></div><div><button data-handler="back">Back</button><button>Create my workspace</button></div></div>`,
	},
	SignIn: {
		controls: [{ selector: '[data-handler="submit"]', removeHref: true, tag: "button" }],
	},
};

export function allowFor(name) {
	return inventoryAllow[name] ?? {};
}
