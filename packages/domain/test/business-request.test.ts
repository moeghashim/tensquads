import assert from "node:assert/strict";
import test from "node:test";

import { parseBusinessChat, researchFields, researchStart } from "../src/conversation/business-request.ts";

const restaurant = `restaurant: Proof Kitchen
cuisine: Levantine
Chicken tawook | 14 | Mains
Fattoush |  | Salads`;

test("a restaurant chat stores the name, the cuisine, and the items", () => {
	const request = parseBusinessChat(restaurant);
	assert.deepEqual(request, {
		businessName: "Proof Kitchen",
		businessType: "restaurant",
		cuisine: "Levantine",
		items: [
			{ name: "Chicken tawook", price: "14", section: "Mains" },
			{ name: "Fattoush", price: "", section: "Salads" },
		],
	});
	assert.ok(request);
	const fields = researchFields(request);
	assert.equal(fields.text, "Research this business.");
	assert.deepEqual(fields.writes, ["business"]);
	assert.deepEqual(fields.set, { business: request });
	const started = researchStart(request, "business-proof");
	assert.equal(started.id, "business-proof");
	assert.equal(started.kind, "Task");
	assert.equal(started.from, "master");
	assert.equal(started.to, "market");
	assert.equal(started.skill, "task.route");
});

test("a grocer chat has no cuisine, and a grocer cuisine line is rejected", () => {
	assert.deepEqual(parseBusinessChat("grocer: Noon Market\nMilk | 3 | Dairy"), {
		businessName: "Noon Market",
		businessType: "grocer",
		items: [{ name: "Milk", price: "3", section: "Dairy" }],
	});
	assert.equal(parseBusinessChat("grocer: Noon Market\ncuisine: Levantine\nMilk | 3 | Dairy"), null);
	assert.equal(parseBusinessChat("restaurant:\nChicken | 14 | Mains"), null);
	assert.equal(parseBusinessChat("restaurant: Proof Kitchen"), null);
	assert.equal(parseBusinessChat("How did ads do this week?"), null);
});

test("a one-line chat with semicolons parses the same as a multi-line chat", () => {
	const oneLine = "restaurant: Proof Kitchen; cuisine: Levantine; Chicken tawook | 14 | Mains; Fattoush |  | Salads";
	assert.deepEqual(parseBusinessChat(oneLine), parseBusinessChat(restaurant));
	assert.deepEqual(parseBusinessChat("grocer: Noon Market; Milk | 3 | Dairy;"), {
		businessName: "Noon Market",
		businessType: "grocer",
		items: [{ name: "Milk", price: "3", section: "Dairy" }],
	});
});

const cityOneLine = "restaurant: Al Ameer; Cuisine: Lebanese; City: Dearborn Heights, MI; Hummus|7.99|Starters";
const cityMultiLine = `restaurant: Al Ameer
Cuisine: Lebanese
City: Dearborn Heights, MI
Hummus|7.99|Starters`;

test("a City line stores the trimmed location, one line or many", () => {
	const oneLine = parseBusinessChat(cityOneLine);
	assert.equal(oneLine?.location, "Dearborn Heights, MI");
	assert.deepEqual(parseBusinessChat(cityMultiLine), oneLine);
	assert.ok(oneLine);
	assert.equal(researchFields(oneLine).payload.location, "Dearborn Heights, MI");
	assert.deepEqual(researchFields(oneLine).set, { business: oneLine });
});

test("a City line may follow the business line when there is no cuisine", () => {
	const request = parseBusinessChat("restaurant: Al Ameer; city:  Dearborn Heights, MI ; Hummus|7.99|Starters");
	assert.equal(request?.location, "Dearborn Heights, MI");
	assert.equal(request?.cuisine, undefined);
});

test("a chat with no City line has no location key", () => {
	const request = parseBusinessChat(restaurant);
	assert.ok(request);
	assert.equal("location" in request, false);
	assert.equal("location" in researchFields(request).payload, false);
});

test("an empty City line makes the chat invalid", () => {
	assert.equal(parseBusinessChat("restaurant: Al Ameer; Cuisine: Lebanese; City:; Hummus|7.99|Starters"), null);
	assert.equal(parseBusinessChat("restaurant: Al Ameer; City:   ; Hummus|7.99|Starters"), null);
	assert.equal(parseBusinessChat("restaurant: Al Ameer\nCity:\nHummus|7.99|Starters"), null);
});

test("a grocer chat may carry a City line", () => {
	assert.deepEqual(parseBusinessChat("grocer: Noon Market; City: Dearborn Heights, MI; Milk | 3 | Dairy"), {
		businessName: "Noon Market",
		businessType: "grocer",
		location: "Dearborn Heights, MI",
		items: [{ name: "Milk", price: "3", section: "Dairy" }],
	});
});
