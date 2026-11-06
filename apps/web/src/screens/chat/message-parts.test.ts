import assert from "node:assert/strict";
import test from "node:test";

import { messageParts } from "./message-parts.ts";

test("plain text stays one text part", () => {
	const text = "Any refunds waiting?";
	assert.deepEqual(messageParts(text), [{ kind: "text", value: text, start: 0 }]);
});

test("an https address becomes a link and keeps the trailing period", () => {
	assert.deepEqual(messageParts("The site preview is https://preview.example/proof."), [
		{ kind: "text", value: "The site preview is ", start: 0 },
		{ kind: "link", href: "https://preview.example/proof", start: 20 },
		{ kind: "text", value: ".", start: 49 },
	]);
});

test("an http address, javascript, and markup stay text", () => {
	assert.deepEqual(messageParts("http://example.com"), [{ kind: "text", value: "http://example.com", start: 0 }]);
	assert.equal(messageParts("javascript:alert(1)")[0]?.kind, "text");
	assert.equal(messageParts("<img src=x onerror=alert(1)>")[0]?.kind, "text");
});
