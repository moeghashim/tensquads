// A small runtime for the design files. The canvas ships its own support.js, which
// is not in this repository. This one reads the same <x-dc> markup and leaves the
// design files unchanged. It exists only for the review pages.
(() => {
	const camel = (name) => name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
	const evaluate = (expr, scope) => {
		const keys = Object.keys(scope).filter((k) => /^[A-Za-z_$][\w$]*$/.test(k));
		return new Function(...keys, `return (${expr});`)(...keys.map((k) => scope[k]));
	};
	const whole = (text) => {
		const m = text.match(/^\s*\{\{([\s\S]+?)\}\}\s*$/);
		return m && !m[1].includes("{{") ? m[1] : null;
	};
	const fill = (text, scope) =>
		text.replace(/\{\{([\s\S]+?)\}\}/g, (_, e) => {
			const v = evaluate(e, scope);
			return v === null || v === undefined ? "" : String(v);
		});
	const BOOL = new Set(["disabled", "checked", "selected", "readonly", "required", "hidden"]);

	class DCLogic {
		constructor(props) {
			this.props = props || {};
			this.state = {};
		}
		setState(next, done) {
			const patch = typeof next === "function" ? next(this.state) : next;
			this.state = { ...this.state, ...patch };
			if (this.__render) this.__render();
			if (done) done();
		}
	}

	const setAttrs = (node, out, scope) => {
		for (const a of node.attributes) {
			if (a.name.startsWith("hint-")) continue;
			const key = whole(a.value);
			if (a.name.startsWith("on") && key) {
				const fn = evaluate(key, scope);
				if (typeof fn === "function") {
					out.__h = out.__h || {};
					out.__h[a.name.slice(2)] = fn;
				}
				continue;
			}
			if (key) {
				const v = evaluate(key, scope);
				if (BOOL.has(a.name)) {
					if (v) out.setAttribute(a.name, "");
					out.__p = out.__p || {};
					out.__p[a.name] = !!v;
					continue;
				}
				if (v === null || v === undefined || v === false) continue;
				if (a.name === "value") {
					out.__v = String(v);
				}
				out.setAttribute(a.name, String(v));
				continue;
			}
			out.setAttribute(a.name, fill(a.value, scope));
		}
	};

	const expand = (node, scope, parent, imports) => {
		if (node.nodeType === 3) {
			parent.append(document.createTextNode(fill(node.textContent, scope)));
			return;
		}
		if (node.nodeType !== 1) return;
		const tag = node.tagName.toLowerCase();
		if (tag === "helmet") return;
		if (tag === "sc-for") {
			const list = evaluate(whole(node.getAttribute("list")), scope) || [];
			const as = node.getAttribute("as");
			for (const item of list) {
				for (const child of node.childNodes) expand(child, { ...scope, [as]: item }, parent, imports);
			}
			return;
		}
		if (tag === "sc-if") {
			if (evaluate(whole(node.getAttribute("value")), scope)) {
				for (const child of node.childNodes) expand(child, scope, parent, imports);
			}
			return;
		}
		if (tag === "dc-import") {
			const slot = document.createElement("div");
			slot.style.display = "contents";
			imports.push({ slot, node });
			parent.append(slot);
			return;
		}
		const svg = node.namespaceURI === "http://www.w3.org/2000/svg";
		const out = svg ? document.createElementNS(node.namespaceURI, node.tagName) : document.createElement(tag);
		setAttrs(node, out, scope);
		for (const child of node.childNodes) expand(child, scope, out, imports);
		parent.append(out);
	};

	// Change the live page to match a new render, so focus and scroll stay.
	const morph = (live, next) => {
		if (live.nodeType !== next.nodeType || live.nodeName !== next.nodeName) {
			live.replaceWith(next);
			wire(next);
			return;
		}
		if (live.nodeType === 3) {
			if (live.textContent !== next.textContent) live.textContent = next.textContent;
			return;
		}
		for (const a of [...live.attributes]) if (!next.hasAttribute(a.name)) live.removeAttribute(a.name);
		for (const a of next.attributes) if (live.getAttribute(a.name) !== a.value) live.setAttribute(a.name, a.value);
		live.__h = next.__h;
		wire(live);
		if (next.__p) for (const [k, v] of Object.entries(next.__p)) live[k === "readonly" ? "readOnly" : k] = v;
		if (next.__v !== undefined && live.value !== next.__v) live.value = next.__v;
		const a = [...live.childNodes];
		const b = [...next.childNodes];
		for (let i = 0; i < b.length; i++) {
			if (a[i]) morph(a[i], b[i]);
			else {
				live.append(b[i]);
				wire(b[i]);
			}
		}
		for (let i = b.length; i < a.length; i++) a[i].remove();
	};

	const EVENTS = ["click", "change", "input", "keydown", "keyup", "submit", "focus", "blur"];
	const wire = (el) => {
		if (el.nodeType !== 1) return;
		if (!el.__wired) {
			el.__wired = true;
			for (const type of EVENTS) {
				el.addEventListener(type, (e) => {
					const h = el.__h;
					if (!h) return;
					const tag = el.tagName;
					const typed = (tag === "INPUT" && el.type !== "checkbox") || tag === "TEXTAREA";
					const name = type === "input" && typed ? "change" : type;
					if (type === "change" && typed) return;
					if (h[name]) h[name](e);
				});
			}
		}
		if (el.__p) for (const [k, v] of Object.entries(el.__p)) el[k === "readonly" ? "readOnly" : k] = v;
		if (el.__v !== undefined) el.value = el.__v;
		for (const c of el.childNodes) wire(c);
	};

	const defaults = (script) => {
		const out = {};
		try {
			const props = JSON.parse(script.getAttribute("data-props") || "{}");
			for (const [k, v] of Object.entries(props)) if (k[0] !== "$" && v && "default" in v) out[k] = v.default;
		} catch {}
		return out;
	};

	const mount = async (root, x, script, props) => {
		const Component = new Function("DCLogic", `${script.textContent}\n;return Component;`)(DCLogic);
		const c = new Component({ ...defaults(script), ...props });
		let first = true;
		const render = () => {
			const scope = { ...c.renderVals() };
			const frag = document.createElement("div");
			const imports = [];
			frag.style.display = "contents";
			for (const child of x.childNodes) expand(child, scope, frag, imports);
			if (first) {
				root.replaceChildren(frag);
				wire(frag);
				first = false;
				for (const { slot, node } of imports) load(slot, node);
			} else {
				morph(root.firstChild, frag);
			}
		};
		c.__render = render;
		render();
		if (c.componentDidMount) c.componentDidMount();
	};

	const helmet = (x) => {
		const h = x.querySelector("helmet");
		if (!h) return;
		for (const n of [...h.children]) document.head.append(document.importNode(n, true));
	};

	const load = async (slot, node) => {
		const name = node.getAttribute("name");
		const text = await (await fetch(`./${name}.dc.html`)).text();
		const doc = new DOMParser().parseFromString(text, "text/html");
		const x = doc.querySelector("x-dc");
		helmet(x);
		const props = {};
		for (const a of node.attributes) {
			if (a.name !== "name" && !a.name.startsWith("hint-")) props[camel(a.name)] = a.value;
		}
		await mount(slot, x, doc.querySelector("script[data-dc-script]"), props);
	};

	addEventListener("DOMContentLoaded", () => {
		const x = document.querySelector("x-dc");
		const script = document.querySelector("script[data-dc-script]");
		const root = document.createElement("div");
		root.style.display = "contents";
		x.replaceWith(root);
		helmet(x);
		mount(root, x, script, {});
	});
})();
