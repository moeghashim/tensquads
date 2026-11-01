export interface LiveTick {
	readonly live: boolean;
	readonly refresh: () => void;
}

export async function runLiveTick(_tick: LiveTick): Promise<void> {}
