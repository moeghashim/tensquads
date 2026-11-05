import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { currentWrites } from "#/workspace/approval-count.ts";
import {
	acceptOverviewRead,
	badgeCount,
	type DecisionRefresh,
	type DecisionResult,
	enqueueDecision,
	patchSnapshot,
	reconcileDecisions,
	resetDecisions,
	shownApprovalCount,
	subscribeOverviewPage,
	watchServerCount,
} from "./actions.ts";
import type { OverviewData } from "./types.ts";

describe("overview decisions", { concurrency: false }, () => {
	test("a finished decision refreshes and clears the guard", async () => {
		resetDecisions();
		let calls = 0;
		let refreshed = 0;
		await settled(
			"one",
			4,
			async () => {
				calls += 1;
			},
			async () => {
				refreshed += 1;
				return { count: 4, readAt: currentWrites(), dropLanded: true };
			},
		);
		assert.equal(calls, 1);
		assert.equal(refreshed, 1);
		assert.equal(shownApprovalCount(4), 4);
		await settled(
			"two",
			4,
			async () => {
				calls += 1;
			},
			async () => {
				refreshed += 1;
				return { count: 4, readAt: currentWrites(), dropLanded: true };
			},
		);
		assert.equal(calls, 2);
	});

	test("a failed write still refreshes, restores the count, and clears the guard", async () => {
		resetDecisions();
		let refreshed = 0;
		const result = await settled(
			"one",
			4,
			async () => {
				throw new Error("The write failed.");
			},
			async () => {
				refreshed += 1;
				return { count: 4, readAt: currentWrites(), dropLanded: true };
			},
		);
		assert.equal(refreshed, 1);
		assert.equal(result.wrote, false);
		assert.equal(shownApprovalCount(4), 4);
		const again = enqueueDecision(
			patch("one"),
			4,
			async () => undefined,
			async () => ({ count: 4, readAt: currentWrites(), dropLanded: true }),
			() => undefined,
		);
		assert.equal(again, true);
		resetDecisions();
	});

	test("a failed refresh keeps the card until a server read", async () => {
		resetDecisions();
		const result = await settled(
			"one",
			4,
			async () => undefined,
			async () => {
				throw new Error("The refresh failed.");
			},
		);
		assert.equal(result.wrote, true);
		assert.equal(result.refreshed, false);
		assert.equal(shownApprovalCount(4), 3);
		assert.deepEqual(
			patchSnapshot().map((item) => item.key),
			["one"],
		);
		const again = enqueueDecision(
			patch("one"),
			3,
			async () => undefined,
			async () => ({ count: 4, readAt: currentWrites(), dropLanded: true }),
			() => undefined,
		);
		assert.equal(again, false);
		assert.equal(patchSnapshot().filter((item) => item.key === "one").length, 1);
		reconcileDecisions(4);
		assert.deepEqual(patchSnapshot(), []);
		assert.equal(shownApprovalCount(4), 4);
	});

	test("three queued jobs run in click order behind the held job", async () => {
		resetDecisions();
		let release = () => {};
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const seen: string[] = [];
		const held = settled(
			"refund",
			4,
			async () => {
				seen.push("refund");
				await gate;
			},
			async () => {
				seen.push("refresh-refund");
				return { count: 4, readAt: currentWrites(), dropLanded: true };
			},
		);
		const first = settled(
			"marketing",
			4,
			async () => {
				seen.push("marketing");
			},
			async () => {
				seen.push("refresh-marketing");
				return { count: 4, readAt: currentWrites(), dropLanded: true };
			},
		);
		const second = settled(
			"inventory",
			4,
			async () => {
				seen.push("inventory");
			},
			async () => {
				seen.push("refresh-inventory");
				return { count: 4, readAt: currentWrites(), dropLanded: true };
			},
		);
		const third = settled(
			"orders",
			4,
			async () => {
				seen.push("orders");
			},
			async () => {
				seen.push("refresh-orders");
				return { count: 4, readAt: currentWrites(), dropLanded: true };
			},
		);
		await Promise.resolve();
		assert.deepEqual(seen, ["refund"]);
		release();
		await held;
		await first;
		await second;
		await third;
		assert.deepEqual(seen, [
			"refund",
			"refresh-refund",
			"marketing",
			"refresh-marketing",
			"inventory",
			"refresh-inventory",
			"orders",
			"refresh-orders",
		]);
	});

	test("the badge uses the workspace count, including after the page closes", async () => {
		resetDecisions();
		const stop = subscribeOverviewPage(() => undefined);
		try {
			let release = () => {};
			const gate = new Promise<void>((resolve) => {
				release = resolve;
			});
			const job = settled(
				"refund",
				4,
				async () => {
					await gate;
				},
				async () => ({ count: 3, readAt: currentWrites(), dropLanded: true }),
			);
			await Promise.resolve();
			assert.equal(badgeCount(4), 3);
			release();
			await job;
			assert.equal(badgeCount(3), 3);
			assert.equal(badgeCount(3), shownApprovalCount(3));
		} finally {
			stop();
		}
		assert.equal(badgeCount(3), 3);
		assert.equal(badgeCount(3), shownApprovalCount(3));
	});

	test("a write keeps the server row and a missed read leaves the card", async () => {
		resetDecisions();
		const row = { id: "ap1", status: "Approved", count: 9 };
		const result = await settled(
			"refund",
			4,
			async () => row,
			async () => {
				throw new Error("The read failed.");
			},
		);
		assert.equal(result.wrote, true);
		assert.equal(result.refreshed, false);
		assert.equal(result.count, null);
		assert.deepEqual(result.row, row);
		assert.equal(patchSnapshot().length, 1);
		assert.equal(
			enqueueDecision(
				patch("refund"),
				4,
				async () => row,
				async () => ({ count: 3, readAt: currentWrites(), dropLanded: true }),
				() => undefined,
			),
			false,
		);
	});

	test("two cards queue in click order and a double click sends one write", async () => {
		resetDecisions();
		let release = () => {};
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const seen: string[] = [];
		const first = settled(
			"refund",
			4,
			async () => {
				seen.push("refund");
				await gate;
			},
			async () => {
				seen.push("refresh-refund");
				return { count: 4, readAt: currentWrites(), dropLanded: true };
			},
		);
		const second = settled(
			"marketing",
			4,
			async () => {
				seen.push("marketing");
			},
			async () => {
				seen.push("refresh-marketing");
				return { count: 4, readAt: currentWrites(), dropLanded: true };
			},
		);
		await Promise.resolve();
		assert.deepEqual(seen, ["refund"]);
		assert.equal(shownApprovalCount(4), 2);
		const duplicate = enqueueDecision(
			patch("refund"),
			4,
			async () => {
				seen.push("duplicate");
			},
			async () => ({ count: 4, readAt: currentWrites(), dropLanded: true }),
			() => undefined,
		);
		assert.equal(duplicate, false);
		release();
		await first;
		await second;
		assert.deepEqual(seen, ["refund", "refresh-refund", "marketing", "refresh-marketing"]);
	});

	test("a failed write lets the queued card run", async () => {
		resetDecisions();
		let release = () => {};
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const seen: string[] = [];
		const first = settled(
			"refund",
			4,
			async () => {
				seen.push("refund");
				await gate;
				throw new Error("The write failed.");
			},
			async () => {
				seen.push("refresh-refund");
				return { count: 4, readAt: currentWrites(), dropLanded: true };
			},
		);
		const second = settled(
			"marketing",
			4,
			async () => {
				seen.push("marketing");
			},
			async () => {
				seen.push("refresh-marketing");
				return { count: 4, readAt: currentWrites(), dropLanded: true };
			},
		);
		await Promise.resolve();
		assert.equal(shownApprovalCount(4), 2);
		release();
		await first;
		await second;
		assert.deepEqual(seen, ["refund", "refresh-refund", "marketing", "refresh-marketing"]);
		assert.equal(shownApprovalCount(4), 4);
	});

	test("a lost response reconciles the server count before the next write", async () => {
		resetDecisions();
		let release = () => {};
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const first = settled(
			"refund",
			4,
			async () => {
				await gate;
				throw new Error("The response was lost after commit.");
			},
			async () => ({ count: 3, readAt: currentWrites(), dropLanded: true }),
		);
		let releaseSecond = () => {};
		const secondGate = new Promise<void>((resolve) => {
			releaseSecond = resolve;
		});
		const second = settled(
			"marketing",
			4,
			async () => {
				await secondGate;
			},
			async () => ({ count: 2, readAt: currentWrites(), dropLanded: true }),
		);
		assert.equal(shownApprovalCount(4), 2);
		release();
		await first;
		assert.equal(shownApprovalCount(3), 2);
		assert.deepEqual(
			patchSnapshot().map((item) => item.key),
			["marketing"],
		);
		releaseSecond();
		await second;
		assert.equal(shownApprovalCount(2), 2);
		assert.deepEqual(patchSnapshot(), []);
	});

	test("a failed read keeps the optimistic count and patches until a successful read", async () => {
		resetDecisions();
		await settled(
			"refund",
			4,
			async () => {
				throw new Error("Lost response");
			},
			async () => {
				throw new Error("The read failed.");
			},
		);
		assert.equal(shownApprovalCount(4), 3);
		assert.deepEqual(
			patchSnapshot().map((item) => item.key),
			["refund"],
		);
		await settled(
			"marketing",
			4,
			async () => undefined,
			async () => ({ count: 2, readAt: currentWrites(), dropLanded: true }),
		);
		assert.equal(shownApprovalCount(2), 2);
		assert.deepEqual(patchSnapshot(), []);
	});

	test("a timed-out refresh keeps the card until a server read and a second click sends nothing", async (t) => {
		t.mock.timers.enable({ apis: ["setTimeout"] });
		resetDecisions();
		let refreshStarted = () => {};
		const started = new Promise<void>((resolve) => {
			refreshStarted = resolve;
		});
		const first = settled(
			"refund",
			4,
			async () => {
				throw new Error("The response was lost.");
			},
			() => {
				refreshStarted();
				return new Promise(() => undefined);
			},
		);
		await started;
		t.mock.timers.tick(30_000);
		await first;
		assert.deepEqual(
			patchSnapshot().map((item) => item.key),
			["refund"],
		);
		assert.equal(shownApprovalCount(4), 3);
		let sent = 0;
		const duplicate = enqueueDecision(
			patch("refund"),
			4,
			async () => {
				sent += 1;
			},
			async () => ({ count: 4, readAt: currentWrites(), dropLanded: true }),
			() => undefined,
		);
		assert.equal(duplicate, false);
		assert.equal(sent, 0);
		assert.equal(patchSnapshot().filter((item) => item.key === "refund").length, 1);
		let release = () => {};
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const second = settled(
			"marketing",
			4,
			async () => {
				await gate;
			},
			async () => ({ count: 3, readAt: currentWrites(), dropLanded: true }),
		);
		await Promise.resolve();
		reconcileDecisions(4);
		assert.deepEqual(
			patchSnapshot().map((item) => item.key),
			["marketing"],
		);
		assert.equal(shownApprovalCount(4), 3);
		release();
		await second;
		assert.deepEqual(patchSnapshot(), []);
		assert.equal(shownApprovalCount(3), 3);
	});

	for (const withSibling of [false, true]) {
		test(`a frame read keeps a timed-out refund${withSibling ? " beside an in-flight job" : ""}`, async (t) => {
			t.mock.timers.enable({ apis: ["setTimeout"] });
			resetDecisions();
			let refreshStarted = () => {};
			const started = new Promise<void>((resolve) => {
				refreshStarted = resolve;
			});
			const first = settled(
				"refund",
				4,
				async () => {
					throw new Error("The write failed.");
				},
				() => {
					refreshStarted();
					return new Promise(() => undefined);
				},
			);
			await started;
			t.mock.timers.tick(30_000);
			await first;
			assert.deepEqual(
				patchSnapshot().map((item) => item.key),
				["refund"],
			);
			assert.equal(badgeCount(4), 3);
			let sent = 0;
			assert.equal(
				enqueueDecision(
					patch("refund"),
					4,
					async () => {
						sent += 1;
					},
					async () => ({ count: 4, readAt: currentWrites(), dropLanded: true }),
					() => undefined,
				),
				false,
			);
			assert.equal(sent, 0);
			let release = () => {};
			const gate = new Promise<void>((resolve) => {
				release = resolve;
			});
			const second = withSibling
				? settled(
						"marketing",
						4,
						() => gate,
						async () => ({ count: 4, readAt: currentWrites(), dropLanded: true }),
					)
				: null;
			await Promise.resolve();
			const frame = { approvalCount: 4 };
			watchServerCount(frame.approvalCount, frame, currentWrites());
			assert.equal(
				patchSnapshot().some((item) => item.key === "refund"),
				true,
			);
			await Promise.resolve();
			assert.deepEqual(
				patchSnapshot().map((item) => item.key),
				withSibling ? ["refund", "marketing"] : ["refund"],
			);
			assert.equal(badgeCount(4), withSibling ? 3 : 4);
			reconcileDecisions(4, currentWrites(), true);
			assert.deepEqual(
				patchSnapshot().map((item) => item.key),
				withSibling ? ["marketing"] : [],
			);
			release();
			await second;
		});
	}

	test("a refresh-needed decision reconciles an accepted read before the queued decision", async () => {
		resetDecisions();
		const data: OverviewData = {
			accountId: "demo",
			greeting: "",
			mission: "",
			online: "",
			tiles: [],
			bars: [],
			count: 2,
			empty: false,
			emptyText: "",
			masterName: "Petra",
			agents: [],
			proposals: [],
			approvals: ["refund", "marketing"].map((id) => ({
				id,
				agentId: "support",
				agentName: "Support",
				tint: "",
				amount: "$42",
				title: id,
				detail: "",
			})),
		};
		const first = settled(
			"refund",
			2,
			async () => {
				throw new Error("The session needs a refresh.");
			},
			async () => {
				const readAt = currentWrites();
				acceptOverviewRead(data, readAt);
				return { count: 2, readAt, dropLanded: true };
			},
		);
		let release = () => {};
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const second = settled(
			"marketing",
			2,
			() => gate,
			async () => ({ count: 1, readAt: currentWrites(), dropLanded: true }),
		);
		try {
			const result = await first;
			assert.equal(result.refreshNeeded, true);
			assert.equal(shownApprovalCount(2), 1);
			assert.deepEqual(patchSnapshot().map((item) => item.key), ["marketing"]);
		} finally {
			release();
			await second;
		}
	});

	test("a hung write aborts, refreshes, and the queue goes on", async (t) => {
		t.mock.timers.enable({ apis: ["setTimeout"] });
		resetDecisions();
		let refreshed = 0;
		const running = settled(
			"refund",
			4,
			() => new Promise(() => undefined),
			async () => {
				refreshed += 1;
				return { count: 4, readAt: currentWrites(), dropLanded: true };
			},
		);
		const next = settled(
			"marketing",
			4,
			async () => undefined,
			async () => {
				refreshed += 1;
				return { count: 4, readAt: currentWrites(), dropLanded: true };
			},
		);
		await Promise.resolve();
		assert.equal(shownApprovalCount(4), 2);
		t.mock.timers.tick(30_000);
		await running;
		await next;
		assert.equal(refreshed, 2);
		assert.equal(shownApprovalCount(4), 4);
	});
});

function settled(
	key: string,
	serverCount: number,
	work: (signal: AbortSignal) => Promise<unknown>,
	refresh: () => Promise<DecisionRefresh>,
): Promise<DecisionResult> {
	return new Promise((resolve) => {
		const queued = enqueueDecision(patch(key), serverCount, work, refresh, resolve);
		assert.equal(queued, true);
	});
}

function patch(key: string) {
	return { key, id: key, kind: "spend-approve" as const };
}
