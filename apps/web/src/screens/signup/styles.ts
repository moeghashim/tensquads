export function pill(on: boolean): string {
	const background = on ? "#181818" : "rgba(13,13,13,.06)";
	const color = on ? "#fff" : "#282828";
	return `height: 36px; padding: 0 14px; border: 0; border-radius: 999px; font-size: 13px; font-weight: 500; display: inline-flex; align-items: center; justify-content: center; gap: 8px; background: ${background}; color: ${color}`;
}

export function optionStyle(on: boolean): string {
	const background = on ? "#fff" : "#f9f9f9";
	const ring = on ? "2px #181818" : "1px rgba(13,13,13,.1)";
	return `text-align: left; border: 0; border-radius: 14px; padding: 18px; display: flex; flex-direction: column; gap: 10px; background: ${background}; box-shadow: 0 0 0 ${ring}; color: #282828`;
}

export function squadStyle(on: boolean): string {
	const background = on ? "#fff" : "#f9f9f9";
	const ring = on ? "2px #181818" : "1px rgba(13,13,13,.1)";
	return `width: 100%; border: 0; border-radius: 12px; padding: 12px 14px; display: flex; gap: 12px; align-items: center; background: ${background}; box-shadow: 0 0 0 ${ring}; color: #282828`;
}

export function checkStyle(on: boolean): string {
	const background = on ? "#181818" : "rgba(13,13,13,.06)";
	const color = on ? "#fff" : "transparent";
	return `width: 22px; height: 22px; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center; flex: none; background: ${background}; color: ${color}`;
}

export function stepDot(on: boolean): string {
	const background = on ? "#181818" : "rgba(13,13,13,.08)";
	const color = on ? "#fff" : "#5d5d5d";
	return `width: 22px; height: 22px; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 600; background: ${background}; color: ${color}`;
}

export const fieldStyle =
	"height: 40px; box-sizing: border-box; padding: 0 12px; border: 0; border-radius: 10px; background: rgba(13,13,13,.06); font-family: inherit; font-size: 14px; color: #0d0d0d";

export const areaStyle =
	"box-sizing: border-box; padding: 10px 12px; border: 0; border-radius: 10px; background: rgba(13,13,13,.06); font-family: inherit; font-size: 14px; line-height: 20px; color: #0d0d0d; resize: vertical";
