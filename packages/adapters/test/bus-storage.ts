import type { BusStorage } from "../src/cloudflare-bus/account-bus.ts";

export class Storage implements BusStorage {
	rows = new Map<string, unknown>();
	alarm: number | null = null;
	private tail = Promise.resolve();
	async get<T>(key: string): Promise<T | undefined> {
		return structuredClone(this.rows.get(key)) as T | undefined;
	}
	async put<T>(key: string, value: T): Promise<void> {
		this.rows.set(key, structuredClone(value));
	}
	async list<T>({ prefix = "" } = {}): Promise<Map<string, T>> {
		return new Map([...this.rows].filter(([key]) => key.startsWith(prefix))) as Map<string, T>;
	}
	transaction<T>(closure: (txn: BusStorage) => Promise<T>): Promise<T> {
		const next = this.tail.then(async () => {
			const before = structuredClone(this.rows);
			const alarm = this.alarm;
			try {
				return await closure(this);
			} catch (error) {
				this.rows = before;
				this.alarm = alarm;
				throw error;
			}
		});
		this.tail = next.then(
			() => undefined,
			() => undefined,
		);
		return next;
	}
	async setAlarm(time: number | Date): Promise<void> {
		this.alarm = Number(time);
	}
	async getAlarm(): Promise<number | null> {
		return this.alarm;
	}
	async deleteAlarm(): Promise<void> {
		this.alarm = null;
	}
}
