interface IconProps {
	readonly size?: number;
}

function svg(size: number) {
	return {
		width: size,
		height: size,
		viewBox: "0 0 16 16",
		fill: "none",
		stroke: "currentColor",
		strokeWidth: 1.5,
		strokeLinecap: "round" as const,
	};
}

export function OverviewIcon() {
	return (
		<svg {...icon(svg(16))} aria-hidden="true">
			<rect x="2" y="2" width="5" height="5" rx="1" />
			<rect x="9" y="2" width="5" height="5" rx="1" />
			<rect x="2" y="9" width="5" height="5" rx="1" />
			<rect x="9" y="9" width="5" height="5" rx="1" />
		</svg>
	);
}

export function ChatIcon() {
	return (
		<svg {...icon(svg(16))} strokeLinejoin="round" aria-hidden="true">
			<path d="M2.5 4.5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H7l-3 2.5v-2.5h0a2 2 0 0 1-1.5-2z" />
		</svg>
	);
}

export function SquadsIcon() {
	return (
		<svg {...icon(svg(16))} aria-hidden="true">
			<circle cx="5.5" cy="5.5" r="2.5" />
			<circle cx="11" cy="6.5" r="2" />
			<path d="M1.5 13.5c.5-2.2 2-3.5 4-3.5s3.5 1.3 4 3.5M10 10.2c1.8 0 3.2 1.2 3.6 3.3" />
		</svg>
	);
}

export function FlowIcon() {
	return (
		<svg {...icon(svg(16))} strokeLinejoin="round" aria-hidden="true">
			<circle cx="8" cy="3.5" r="1.8" />
			<circle cx="3" cy="12.5" r="1.8" />
			<circle cx="13" cy="12.5" r="1.8" />
			<path d="M7 5 4 11M9 5l3 6M4.8 12.5h6.4" />
		</svg>
	);
}

export function RulesIcon() {
	return (
		<svg {...icon(svg(16))} aria-hidden="true">
			<path d="M2.5 4h7M12.5 4h1M2.5 8h2M7.5 8h6M2.5 12h5M10.5 12h3" />
			<circle cx="11" cy="4" r="1.5" />
			<circle cx="6" cy="8" r="1.5" />
			<circle cx="9" cy="12" r="1.5" />
		</svg>
	);
}

export function CloseIcon() {
	return (
		<svg {...icon(svg(14))} aria-hidden="true">
			<path d="M4 4l8 8M12 4l-8 8" />
		</svg>
	);
}

export function SendIcon() {
	return (
		<svg {...icon(svg(14))} strokeLinejoin="round" aria-hidden="true">
			<path d="M8 13V3M3.5 7.5 8 3l4.5 4.5" />
		</svg>
	);
}

function icon(props: ReturnType<typeof svg> & IconProps) {
	return {
		width: props.width,
		height: props.height,
		viewBox: props.viewBox,
		fill: props.fill,
		stroke: props.stroke,
		strokeWidth: props.strokeWidth,
		strokeLinecap: props.strokeLinecap,
	};
}
