export function BuildingIcon() {
	return (
		<svg
			width="16"
			height="16"
			viewBox="0 0 16 16"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.5"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			<path d="M2.5 13.5v-8l5.5-3 5.5 3v8" />
			<path d="M2.5 13.5h11M6.5 13.5v-4h3v4" />
		</svg>
	);
}

export function CompaniesIcon() {
	return (
		<svg
			width="16"
			height="16"
			viewBox="0 0 16 16"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.5"
			strokeLinecap="round"
			aria-hidden="true"
		>
			<rect x="2" y="3" width="12" height="10" rx="2" />
			<path d="M2 7h12M6 7v6" />
		</svg>
	);
}

export function CatalogIcon() {
	return (
		<svg
			width="16"
			height="16"
			viewBox="0 0 16 16"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.5"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			<path d="M8 1.8 13.5 5v6L8 14.2 2.5 11V5z" />
			<path d="M2.5 5 8 8l5.5-3M8 8v6.2" />
		</svg>
	);
}

export function ImageMark({ size }: { readonly size: number }) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 16 16"
			fill="none"
			stroke="#0d0d0d"
			strokeWidth="1.5"
			strokeLinecap="round"
			aria-hidden="true"
		>
			<rect x="3" y="5" width="10" height="8" rx="2" />
			<path d="M8 2.5V5M6 9h0M10 9h0" />
		</svg>
	);
}

export function BackIcon() {
	return (
		<svg
			width="14"
			height="14"
			viewBox="0 0 16 16"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.5"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			<path d="M10 3 5 8l5 5" />
		</svg>
	);
}
