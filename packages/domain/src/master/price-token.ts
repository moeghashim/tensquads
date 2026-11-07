// A competitor's priceOrOffer must hold a real price or offer token.
// A dish description on the page is not a price, even when the text is on the page.

const CURRENCY_CODES = "AED|SAR|QAR|KWD|BHD|OMR|USD|EUR|GBP|JPY";
// \p{Sc} covers every Unicode currency sign: $, €, £, ¥, ₹, ¢ and the rest.
const CURRENCY_SIGN_NEXT_TO_NUMBER = /\p{Sc}\s*\d|\d\s*\p{Sc}/u;
const CURRENCY_CODE_NEXT_TO_NUMBER = new RegExp(
	`\\b(?:${CURRENCY_CODES})\\s*\\d|\\d\\s*(?:${CURRENCY_CODES})\\b`,
	"iu",
);
// A decimal price such as 14.99. A single decimal place does not count.
const DECIMAL_PRICE = /\b\d+\.\d{2}\b/;
const PERCENT_OFF = /%\s*off\b/iu;
// "free" does not count when it starts a hyphenated word, as in "free-range".
const FREE_OFFER = /\bfree\b(?!-)/iu;
const OFFER_WORDS = ["deal", "discount", "BOGO"] as const;

// Case-insensitive, on word boundaries, with an optional plural "s".
function hasWord(text: string, word: string): boolean {
	return new RegExp(`\\b${word}s?\\b`, "iu").test(text);
}

// True when the text holds a currency sign or code next to a number, a decimal price,
// or a clear offer word. Other text, including dish descriptions, is not a price.
export function hasPriceOrOffer(text: string): boolean {
	if (CURRENCY_SIGN_NEXT_TO_NUMBER.test(text)) return true;
	if (CURRENCY_CODE_NEXT_TO_NUMBER.test(text)) return true;
	if (DECIMAL_PRICE.test(text)) return true;
	if (PERCENT_OFF.test(text) || FREE_OFFER.test(text)) return true;
	return OFFER_WORDS.some((word) => hasWord(text, word));
}
