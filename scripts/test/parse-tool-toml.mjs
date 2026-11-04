import assert from "node:assert/strict";

export function parseToolToml(text) {
	const tokens = [];
	const token = /\s+|#[^\n]*|"(?:[^"\\\n]|\\.)*"|[A-Za-z0-9_-]+|[.[\]{},=]/y;
	while (token.lastIndex < text.length) {
		const offset = token.lastIndex;
		const match = token.exec(text);
		assert.ok(match, `Unsupported tool TOML at ${offset}`);
		if (!/^\s|^#/.test(match[0])) tokens.push(match[0]);
	}
	let index = 0;
	const peek = () => tokens[index];
	function take(expected) {
		const value = tokens[index++];
		assert.ok(value !== undefined, "Unexpected end of tool TOML");
		if (expected !== undefined) assert.equal(value, expected);
		return value;
	}
	function key() {
		const value = take();
		assert.match(value, /^(?:"(?:[^"\\]|\\.)*"|[A-Za-z0-9_-]+)$/);
		return value.startsWith('"') ? JSON.parse(value) : value;
	}
	function assign(table) {
		const name = key();
		take("=");
		assert.equal(Object.hasOwn(table, name), false, `Duplicate key ${name}`);
		table[name] = value();
	}
	function value() {
		if (peek() !== "{") {
			assert.ok(peek()?.startsWith('"'), "Expected a string tool value");
			return JSON.parse(take());
		}
		take("{");
		const table = {};
		while (peek() !== "}") {
			assign(table);
			if (peek() !== "}") take(",");
		}
		take("}");
		return table;
	}
	const result = {};
	let table = result;
	while (index < tokens.length) {
		if (peek() !== "[") {
			assign(table);
			continue;
		}
		take("[");
		const array = peek() === "[";
		if (array) take("[");
		const path = [key()];
		while (peek() === ".") {
			take(".");
			path.push(key());
		}
		take("]");
		if (array) take("]");
		table = result;
		for (const name of path.slice(0, -1)) {
			table[name] ??= {};
			table = table[name];
		}
		const name = path.at(-1);
		if (array) {
			table[name] ??= [];
			const entries = table[name];
			table = {};
			entries.push(table);
		} else {
			table[name] ??= {};
			table = table[name];
		}
	}
	return result;
}
