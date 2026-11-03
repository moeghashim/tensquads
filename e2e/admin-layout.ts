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
	expectNear(actual?.width ?? 0, expected?.width ?? 0, `${label} width`);
	expectNear(actual?.x ?? 0, expected?.x ?? 0, `${label} x`);
	expectNear(actual?.y ?? 0, expected?.y ?? 0, `${label} y`);
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
	return page.evaluate(() => {
		const boxOf = (element: Element) => {
			const box = element.getBoundingClientRect();
			return { x: box.x, y: box.y, width: box.width, right: box.right };
		};
		const tiles = [...document.querySelectorAll("main [data-loop='adm.kpis'] > div")];
		const track = document.querySelector("section[aria-label='New accounts'] > div:nth-child(2)");
		const bars = track ? [...track.querySelectorAll("[data-loop='adm.bars'] > div")] : [];
		const cards = ["New accounts", "Plan mix"].map((label) =>
			document.querySelector(`section[aria-label='${label}']`),
		);
		const nav = document.querySelector("nav[aria-label='Platform admin']");
		const main = document.querySelector("main");
		const wide = wideChild("All accounts");
		const tileGap = tiles.length > 1 ? boxOf(tiles[1] ?? tiles[0]).x - boxOf(tiles[0]).right : 0;
		const cardGap = cards[0] && cards[1] ? boxOf(cards[1]).x - boxOf(cards[0]).right : 0;
		return {
			nav: nav ? boxOf(nav) : { x: 0, y: 0, width: 0 },
			main: main ? boxOf(main) : { x: 0, y: 0, width: 0 },
			tiles: tiles.map(boxOf),
			bars: bars.map(boxOf),
			cards: cards.filter((card): card is Element => card !== null).map(boxOf),
			trackHeight: track ? track.getBoundingClientRect().height : 0,
			tileGap,
			cardGap,
			tableWidth: wide ? wide.getBoundingClientRect().width : 0,
		};

		function wideChild(label: string) {
			const section = document.querySelector(`section[aria-label='${label}']`);
			const scroll = section
				? [...section.querySelectorAll("div")].find((node) => getComputedStyle(node).overflowX === "auto")
				: undefined;
			return scroll?.firstElementChild ?? null;
		}
	});
}

export async function measureImages(page: Page): Promise<ImagesLayout> {
	return page.evaluate(() => {
		const boxOf = (element: Element) => {
			const box = element.getBoundingClientRect();
			return { x: box.x, y: box.y, width: box.width, right: box.right };
		};
		const tiles = [...document.querySelectorAll("main [data-loop='cat.kpis'] > div")];
		const list = document.querySelector("section[aria-label='Images']");
		const aside = document.querySelector("aside[aria-label='Image details']");
		const nav = document.querySelector("nav[aria-label='Platform admin']");
		const main = document.querySelector("main");
		const section = document.querySelector("section[aria-label='Images']");
		const scroll = section
			? [...section.querySelectorAll("div")].find((node) => getComputedStyle(node).overflowX === "auto")
			: undefined;
		const wide = scroll?.firstElementChild ?? null;
		const tileGap = tiles.length > 1 ? boxOf(tiles[1] ?? tiles[0]).x - boxOf(tiles[0]).right : 0;
		const splitGap = list && aside ? boxOf(aside).x - boxOf(list).right : 0;
		return {
			nav: nav ? boxOf(nav) : { x: 0, y: 0, width: 0 },
			main: main ? boxOf(main) : { x: 0, y: 0, width: 0 },
			tiles: tiles.map(boxOf),
			list: list ? boxOf(list) : { x: 0, y: 0, width: 0 },
			aside: aside ? boxOf(aside) : { x: 0, y: 0, width: 0 },
			tileGap,
			splitGap,
			tableWidth: wide ? wide.getBoundingClientRect().width : 0,
		};
	});
}
