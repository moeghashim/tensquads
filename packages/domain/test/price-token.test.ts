import assert from "node:assert/strict";
import test from "node:test";

import { hasPriceOrOffer } from "../src/master/price-token.ts";

test("a currency sign or code next to a number is a price", () => {
	for (const text of ["$12", "12 $", "€ 9.50", "£7", "¥800", "12 EUR", "AED45", "SAR 30", "45 QAR", "USD12"]) {
		assert.equal(hasPriceOrOffer(text), true, text);
	}
});

test("a decimal price such as 14.99 is a price", () => {
	assert.equal(hasPriceOrOffer("14.99"), true);
	assert.equal(hasPriceOrOffer("Lunch box 8.50"), true);
});

test("a clear offer word is an offer", () => {
	for (const text of [
		"20% off",
		"50 % OFF",
		"Free delivery",
		"Weekend deal",
		"10% discount",
		"BOGO wraps",
		"Buy one get one BOGO",
	]) {
		assert.equal(hasPriceOrOffer(text), true, text);
	}
});

test("dish descriptions are not prices or offers", () => {
	for (const text of [
		"generous platters made to share.",
		"FATTOUSH BIBEIRUT fresh vegetables tossed with lemon juice and olive oil",
		"Grilled chicken with rice and 2 sides",
		"Free-range chicken, slow roasted",
		"Freedom fries",
		"Dealer's choice of mezze",
		"Served with 3 sauces and 1 pickle",
		"",
		"   ",
	]) {
		assert.equal(hasPriceOrOffer(text), false, text);
	}
});

test("an integer price with any ISO currency code counts", () => {
	assert.equal(hasPriceOrOffer("CAD 15"), true);
	assert.equal(hasPriceOrOffer("15 AUD"), true);
	assert.equal(hasPriceOrOffer("MXN 120"), true);
	assert.equal(hasPriceOrOffer("Table for 4"), false);
});
