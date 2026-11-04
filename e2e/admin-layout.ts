import { expect, type Page } from "@playwright/test";

type Box = { x: number; y: number; width: number };

export type AccountsLayout = {
	nav: Box;
	main: Box;
	tiles: Box[];
	bars: Box[];
	cards: Box[];
	trackHeight: number;
	tileGap: number;
	cardGap: number;
	tableWidth: number;
};

export type ImagesLayout = {
	nav: Box;
	main: Box;
	tiles: Box[];
	list: Box;
	aside: Box;
	tileGap: number;
	splitGap: number;
	tableWidth: number;
};

export function expectNear(actual: number, expected: number, label: string) {
	expect(Math.abs(actual - expected), `${label}: build ${actual}, design ${expected}`).toBeLessThanOrEqual(0.5);
}

function expectBox(actual: Box | undefined, expected: Box | undefined, label: string) {
	expectNear(boxField(actual, "width"), boxField(expected, "width"), `${label} width`);
	expectNear(boxField(actual, "x"), boxField(expected, "x"), `${label} x`);
	expectNear(boxField(actual, "y"), boxField(expected, "y"), `${label} y`);
}

function boxField(box: Box | undefined, key: keyof Box): number {
	if (!box) return 0;
	return box[key];
}

function expectBoxes(built: readonly Box[], design: readonly Box[], name: string) {
	expect(built.length).toBe(design.length);
	for (const [index, box] of built.entries()) {
		expectBox(box, design[index], `${name} ${index}`);
	}
}

export async function expectContents(page: Page, name: string) {
	const displays = await page.evaluate(() =>
		[...document.querySelectorAll("[data-loop], [data-if]")].map((node) => getComputedStyle(node).display),
	);
	expect(displays.length, `${name} loop wrappers`).toBeGreaterThan(1);
	for (const display of displays) expect(display, `${name} display`).toBe("contents");
}

export function expectAccounts(built: AccountsLayout, design: AccountsLayout, name: string) {
	expect(design.tiles.length).toBe(6);
	expect(design.bars.length).toBe(8);
	expect(design.cards.length).toBe(2);
	expect(design.tableWidth).toBeGreaterThanOrEqual(1360);
	expectBox(built.nav, design.nav, `${name} nav`);
	expectBox(built.main, design.main, `${name} main`);
	expectBoxes(built.tiles, design.tiles, `${name} tile`);
	expectBoxes(built.bars, design.bars, `${name} bar`);
	expectBoxes(built.cards, design.cards, `${name} card`);
	expectNear(built.trackHeight, design.trackHeight, `${name} bar track height`);
	expectNear(built.tileGap, design.tileGap, `${name} tile gap`);
	expectNear(built.cardGap, design.cardGap, `${name} card gap`);
	expectNear(built.tableWidth, design.tableWidth, `${name} table width`);
}

export function expectImages(built: ImagesLayout, design: ImagesLayout, name: string) {
	expect(design.tiles.length).toBe(5);
	expect(design.tableWidth).toBeGreaterThanOrEqual(720);
	expectBox(built.nav, design.nav, `${name} nav`);
	expectBox(built.main, design.main, `${name} main`);
	expectBoxes(built.tiles, design.tiles, `${name} tile`);
	expectBox(built.list, design.list, `${name} list`);
	expectBox(built.aside, design.aside, `${name} aside`);
	expectNear(built.tileGap, design.tileGap, `${name} tile gap`);
	expectNear(built.splitGap, design.splitGap, `${name} split gap`);
	expectNear(built.tableWidth, design.tableWidth, `${name} table width`);
}

export async function measureAccounts(page: Page): Promise<AccountsLayout> {
	return page.evaluate(readAdminLayout, "accounts") as Promise<AccountsLayout>;
}

export async function measureImages(page: Page): Promise<ImagesLayout> {
	return page.evaluate(readAdminLayout, "images") as Promise<ImagesLayout>;
}

function readAdminLayout(mode: "accounts" | "images"): AccountsLayout | ImagesLayout {
	if (mode === "images") return imagesLayout();
	return accountsLayout();

	function accountsLayout(): AccountsLayout {
		const tiles = loopChildren("main [data-loop='adm.kpis'] > div");
		const track = document.querySelector("section[aria-label='New accounts'] > div:nth-child(2)");
		const bars = trackChildren(track, "[data-loop='adm.bars'] > div");
		const cards = ["New accounts", "Plan mix"].map((label) => sectionByLabel(label));
		const wide = scrollChild(sectionByLabel("All accounts"));
		return {
			nav: boxOrEmpty(document.querySelector("nav[aria-label='Platform admin']")),
			main: boxOrEmpty(document.querySelector("main")),
			tiles: tiles.map(readBox),
			bars: bars.map(readBox),
			cards: present(cards).map(readBox),
			trackHeight: elementHeight(track),
			tileGap: pairGap(tiles[0], tiles[1]),
			cardGap: pairGap(cards[0], cards[1]),
			tableWidth: elementWidth(wide),
		};
	}

	function imagesLayout(): ImagesLayout {
		const tiles = loopChildren("main [data-loop='cat.kpis'] > div");
		const list = document.querySelector("section[aria-label='Images']");
		const aside = document.querySelector("aside[aria-label='Image details']");
		const wide = scrollChild(list);
		return {
			nav: boxOrEmpty(document.querySelector("nav[aria-label='Platform admin']")),
			main: boxOrEmpty(document.querySelector("main")),
			tiles: tiles.map(readBox),
			list: boxOrEmpty(list),
			aside: boxOrEmpty(aside),
			tileGap: pairGap(tiles[0], tiles[1]),
			splitGap: pairGap(list, aside),
			tableWidth: elementWidth(wide),
		};
	}

	function readBox(element: Element) {
		const box = element.getBoundingClientRect();
		return { x: box.x, y: box.y, width: box.width, right: box.right };
	}

	function boxOrEmpty(element: Element | null): Box {
		if (!element) return { x: 0, y: 0, width: 0 };
		return readBox(element);
	}

	function pairGap(left: Element | null | undefined, right: Element | null | undefined) {
		if (!left || !right) return 0;
		return readBox(right).x - readBox(left).right;
	}

	function loopChildren(selector: string) {
		return [...document.querySelectorAll(selector)];
	}

	function sectionByLabel(label: string) {
		return document.querySelector(`section[aria-label='${label}']`);
	}

	function trackChildren(track: Element | null, selector: string) {
		if (!track) return [];
		return [...track.querySelectorAll(selector)];
	}

	function present(cards: (Element | null)[]): Element[] {
		const found: Element[] = [];
		for (const card of cards) {
			if (card) found.push(card);
		}
		return found;
	}

	function elementHeight(element: Element | null) {
		if (!element) return 0;
		return element.getBoundingClientRect().height;
	}

	function elementWidth(element: Element | null) {
		if (!element) return 0;
		return element.getBoundingClientRect().width;
	}

	function scrollChild(section: Element | null) {
		if (!section) return null;
		return firstScrollChild(section);
	}

	function firstScrollChild(section: Element) {
		const scroll = [...section.querySelectorAll("div")].find((node) => getComputedStyle(node).overflowX === "auto");
		if (!scroll) return null;
		return scroll.firstElementChild;
	}
}
