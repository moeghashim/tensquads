import assert from "node:assert/strict";
import test from "node:test";

import { pageHas, pageText } from "../src/master/page-text.ts";

test("pageText joins text nodes with one space and drops the tags", () => {
	assert.equal(pageText("<p>Fresh <b>salad</b> daily</p>"), "Fresh salad daily");
	assert.equal(pageText("<span>$</span>12"), "$ 12");
});

test("pageText drops script, style, noscript and template with their content", () => {
	const html = "a<script>x()</script>b<style>p{color:red}</style>c<noscript>n</noscript>d<template>t</template>e";
	assert.equal(pageText(html), "a b c d e");
	assert.equal(pageText("<SCRIPT type='x'>secret</SCRIPT>visible"), "visible");
});

test("pageText drops comments, including a comment that hides a script", () => {
	assert.equal(pageText("a<!-- <script>x</script> -->b"), "a b");
	assert.equal(pageText("<!doctype html><p>Menu</p>"), "Menu");
});

test("pageText drops an unclosed script to the end of the page", () => {
	assert.equal(pageText("a<script>never closed"), "a");
});

test("pageText decodes named entities once", () => {
	assert.equal(pageText("&amp; &lt; &gt; &quot; &apos;"), `& < > " '`);
	assert.equal(pageText("&ndash; &mdash; &rsquo; &lsquo; &ldquo; &rdquo; &hellip;"), "– — ’ ‘ “ ” …");
	assert.equal(pageText("&amp;lt;"), "&lt;");
	assert.equal(pageText("Tom &amp; Jerry&#39;s"), "Tom & Jerry's");
});

test("pageText decodes decimal and hex numeric entities", () => {
	assert.equal(pageText("&#39; &#x27; &#X2014;"), "' ' —");
	assert.equal(pageText("&#x1F600;"), "😀");
});

test("pageText keeps entities it does not know and code points out of range", () => {
	assert.equal(pageText("&foo; &#x110000; &#0;"), "&foo; &#x110000; &#0;");
});

test("pageText treats non-breaking spaces as white space and trims the result", () => {
	assert.equal(pageText("&nbsp;&nbsp;a&nbsp;b\n\t c   "), "a b c");
	assert.equal(pageText("a&nbsp;&nbsp;b"), "a b");
});

test("pageText leaves a less-than sign that is not a tag", () => {
	assert.equal(pageText("price < 5 > 3"), "price < 5 > 3");
});

test("pageHas finds a quote or price whatever the white space between words", () => {
	assert.equal(pageHas("<span>$</span>12", "$12"), true);
	assert.equal(pageHas("<span>$</span>12", "$ 12"), true);
	assert.equal(pageHas("Fresh <b>salad</b> daily", "Fresh salad daily"), true);
	assert.equal(pageHas("<p>The menu hides salad prices.</p>", "The menu hides salad prise."), false);
	assert.equal(pageHas("<span>$</span>12", "$13"), false);
	assert.equal(pageHas("<script>$12</script>", "$12"), false);
});

test("a custom element whose name starts like a skipped one keeps its text", () => {
	assert.equal(pageText("<script-loader>Fresh salad daily</script-loader>"), "Fresh salad daily");
	assert.equal(pageText("<styled-box>Tom</styled-box> <template-card>Jerry</template-card>"), "Tom Jerry");
	assert.equal(pageText("<script >hidden()</script>shown"), "shown");
});

test("a quote that is empty without its white space is never found", () => {
	assert.equal(pageHas("<p>Fresh salad daily</p>", "   "), false);
	assert.equal(pageHas("<p>Fresh salad daily</p>", ""), false);
});
