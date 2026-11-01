import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { designInventory, inventoryHtml } from "./design-inventory.mjs";

const linkMap = {
	"Home.dc.html": "/",
	"SignIn.dc.html": "/signin",
	"Onboarding.dc.html": "/signup",
	"Main.dc.html": "/overview",
	"Chat.dc.html": "/chat",
};

export async function renderDesign(page, design, state = {}, approval = {}) {
	const source = readFileSync(new URL(`../design/${design.file}`, import.meta.url), "utf8");
	assert.deepEqual(designInventory(design.file, source), design);
	const html = await page.evaluate(
		({ source, state, approval, account, linkMap }) => {
			class DCLogic {
				constructor(props) {
					this.props = props;
				}
				setState(next) {
					Object.assign(this.state, next);
				}
			}
			const documentSource = new DOMParser().parseFromString(source, "text/html");
			const script = documentSource.querySelector('script[type="text/x-dc"]');
			const Component = new Function("DCLogic", `${script.textContent}; return Component;`)(DCLogic);
			const component = new Component({});
			Object.assign(component.state, state);
			if (state.kind && component.defaultAgents) component.state.picked = component.defaultAgents(state.kind);
			const values = component.renderVals();
			const template = documentSource.querySelector("x-dc");
			template.querySelector("helmet")?.remove();
			const marked = new Set();
			const value = (expression, scope) =>
				new Function(...Object.keys(scope), `return (${expression});`)(...Object.values(scope));
			const expression = (node, attr) => node.getAttribute(attr).slice(2, -2);
			const markLoop = (node, result) => {
				if (marked.has(node)) return;
				result.dataset.loop = expression(node, "list");
				result.dataset.loopAs = node.getAttribute("as");
				marked.add(node);
			};
			const expandLoop = (node, result, scope) => {
				markLoop(node, result);
				for (const item of value(expression(node, "list"), scope)) {
					for (const child of node.childNodes)
						result.append(expand(child, { ...scope, [node.getAttribute("as")]: item }));
				}
				return result;
			};
			const copyAttributes = (node, result, scope) => {
				for (const attr of node.attributes) {
					if (/^on(Click|Change)$/i.test(attr.name)) {
						result.dataset.handler = attr.value.slice(2, -2);
						result.dataset.event = attr.name.toLowerCase() === "onclick" ? "onClick" : "onChange";
					} else {
						result.setAttribute(
							attr.name,
							attr.value.replace(/\{\{([^}]+)\}\}/g, (_, key) => String(value(key, scope))),
						);
					}
				}
			};
			const markCondition = (node, result) => {
				if (marked.has(node)) return;
				result.dataset.if = expression(node, "value");
				marked.add(node);
			};
			const elementTag = (node) => (node.tagName === "SC-FOR" || node.tagName === "SC-IF" ? "div" : node.tagName);
			const expandElement = (node, scope) => {
				const result = document.createElement(elementTag(node));
				if (node.tagName === "SC-FOR") return expandLoop(node, result, scope);
				if (node.tagName === "SC-IF") {
					if (!value(expression(node, "value"), scope)) return document.createTextNode("");
					markCondition(node, result);
				} else {
					copyAttributes(node, result, scope);
				}
				for (const child of node.childNodes) result.append(expand(child, scope));
				return result;
			};
			const expand = (node, scope) => {
				if (node.nodeType === Node.TEXT_NODE) {
					return document.createTextNode(
						node.textContent.replace(/\{\{([^}]+)\}\}/g, (_, key) => String(value(key, scope))),
					);
				}
				if (node.nodeType !== Node.ELEMENT_NODE) return document.createTextNode("");
				return expandElement(node, scope);
			};
			const rendered = expand(template, values);
			const applyControls = () => {
				for (const change of approval.controls ?? []) {
					const control = rendered.querySelector(change.selector);
					if (!control) continue;
					if (change.removeHref) control.removeAttribute("href");
					if (change.tag) {
						const replacement = document.createElement(change.tag);
						for (const attr of control.attributes) replacement.setAttribute(attr.name, attr.value);
						replacement.append(...control.childNodes);
						control.replaceWith(replacement);
					}
				}
			};
			applyControls();
			if (account) {
				const card = rendered.querySelector('[aria-label="Create your business"]');
				card.querySelector('[data-if="isAgents"]').outerHTML = approval.account;
			}
			for (const anchor of rendered.querySelectorAll("a[href]")) {
				const href = anchor.getAttribute("href");
				if (linkMap[href]) anchor.setAttribute("href", linkMap[href]);
			}
			return rendered.outerHTML;
		},
		{
			source,
			linkMap,
			account: state.step === "account",
			state: state.step === "account" ? { ...state, step: "agents" } : state,
			approval,
		},
	);
	return inventoryHtml(html);
}
