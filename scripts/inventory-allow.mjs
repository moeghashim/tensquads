const inventoryAllow = {
	Onboarding: {
		controls: [{ selector: 'a[href="Main.dc.html"]', removeHref: true, tag: "button" }],
		account: `<div><div><label>Email</label><input data-handler="onEmail" /></div><div><label>Password</label><input data-handler="onPassword" /></div><div><button data-handler="back">Back</button><button>Create my workspace</button></div></div>`,
	},
	SignIn: {
		controls: [{ selector: '[data-handler="submit"]', removeHref: true, tag: "button" }],
	},
};

export function allowFor(name) {
	return inventoryAllow[name] ?? {};
}
