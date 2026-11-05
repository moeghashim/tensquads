const STALE_MS = 2 * 60 * 60 * 1000;
const PRODUCTION = new Set(["tensquads", "tensquads-bus", "tensquads-bus-dlq"]);

export function isTrialWorker(name) {
	return /^tensquads-trial-\d{6,}$/.test(name);
}

export function isTrialQueue(name) {
	return /^tensquads-bus-\d{6,}$/.test(name) || /^tensquads-bus-dlq-\d{6,}$/.test(name);
}

function trialRunId(name) {
	return (
		/^tensquads-trial-(\d{6,})$/.exec(name)?.[1] ??
		/^tensquads-bus-dlq-(\d{6,})$/.exec(name)?.[1] ??
		/^tensquads-bus-(\d{6,})$/.exec(name)?.[1] ??
		""
	);
}

export function assertDeletable(name, kind) {
	if (PRODUCTION.has(name)) throw new Error("Refusing to delete a production resource.");
	if (kind === "worker" && !isTrialWorker(name)) throw new Error("Refusing to delete a non-trial worker.");
	if (kind === "queue" && !isTrialQueue(name)) throw new Error("Refusing to delete a non-trial queue.");
}

function olderThan(createdOn, now) {
	const created = Date.parse(createdOn ?? "");
	return Number.isFinite(created) && now - created > STALE_MS;
}

function groupFor(groups, runId) {
	if (!/^\d{6,}$/.test(runId)) return null;
	let group = groups.get(runId);
	if (!group) {
		group = { runId, worker: "", queues: [] };
		groups.set(runId, group);
	}
	return group;
}

function addStaleWorkers(groups, plan, scripts, now) {
	for (const script of scripts) {
		if (PRODUCTION.has(script.name) || !isTrialWorker(script.name)) continue;
		const runId = trialRunId(script.name);
		if (runId === plan.runId || !olderThan(script.createdOn, now)) continue;
		const group = groupFor(groups, runId);
		if (group) group.worker = script.name;
	}
}

function addStaleQueues(groups, plan, queues, now) {
	for (const queue of queues) {
		if (PRODUCTION.has(queue.name) || !isTrialQueue(queue.name)) continue;
		const runId = trialRunId(queue.name);
		if (runId === plan.runId || !olderThan(queue.createdOn, now)) continue;
		const group = groupFor(groups, runId);
		if (group && !group.queues.includes(queue.name)) group.queues.push(queue.name);
	}
}

function cleanupTargets(plan, scripts, queues, now = Date.now()) {
	const groups = new Map();
	const current = groupFor(groups, plan.runId);
	current.worker = plan.workerName;
	current.queues = [plan.queue, plan.deadLetter];
	addStaleWorkers(groups, plan, scripts, now);
	addStaleQueues(groups, plan, queues, now);
	for (const group of groups.values()) {
		if (!group.worker) group.worker = `tensquads-trial-${group.runId}`;
		assertDeletable(group.worker, "worker");
		for (const name of group.queues) assertDeletable(name, "queue");
	}
	return [...groups.values()].sort(
		(left, right) => Number(right.runId === plan.runId) - Number(left.runId === plan.runId),
	);
}

function accountPath(accountId) {
	if (!/^[a-f0-9]{32}$/i.test(accountId)) throw new Error("The Cloudflare account id is not valid.");
	return `/accounts/${accountId}`;
}

function gone(response) {
	if (response.status === 404) return true;
	return (response.errors ?? []).some((error) => {
		if (error.code === 10007) return true;
		return /not found|does not exist/i.test(String(error.message ?? ""));
	});
}

function failureCode(response) {
	return `code:${response.errors?.[0]?.code ?? response.status}`;
}

async function listPages(api, path) {
	const items = [];
	for (let page = 1; page <= 20; page += 1) {
		const response = await api({ method: "GET", path: `${path}?page=${page}&per_page=100` });
		if (!response.success) {
			const error = response.errors?.[0];
			throw new Error(
				`Cloudflare list failed with code ${error?.code ?? response.status}. ${error?.message ?? "The Cloudflare list failed."}`,
			);
		}
		if (!Array.isArray(response.result)) throw new Error("Cloudflare list returned no result.");
		items.push(...response.result);
		if (page >= (response.result_info?.total_pages ?? 1)) break;
	}
	return items;
}

function asScripts(items) {
	return items
		.map((item) => ({ name: item.id ?? item.name ?? "", createdOn: item.created_on ?? "" }))
		.filter((item) => item.name);
}

function asQueues(items) {
	return items
		.map((item) => ({ name: item.queue_name ?? "", id: item.queue_id ?? "", createdOn: item.created_on ?? "" }))
		.filter((item) => item.name && item.id);
}

function orderedQueues(names) {
	return [...names].sort((left, right) => Number(left.includes("-dlq-")) - Number(right.includes("-dlq-")));
}

function safeId(value) {
	return /^[A-Za-z0-9_-]{1,64}$/.test(value);
}

async function deleteResource(api, path, failures) {
	const response = await api({ method: "DELETE", path });
	if (response.success || gone(response)) return;
	failures.push(failureCode(response));
}

async function removeConsumers(api, root, worker, queue, failures) {
	const listed = await api({ method: "GET", path: `${root}/queues/${queue.id}/consumers` });
	if (!listed.success) {
		if (!gone(listed)) failures.push(failureCode(listed));
		return;
	}
	for (const consumer of Array.isArray(listed.result) ? listed.result : []) {
		if (consumer.script_name !== worker) {
			if (consumer.script_name) failures.push(`consumer:${consumer.script_name}`);
			continue;
		}
		if (!safeId(consumer.consumer_id ?? "")) {
			failures.push("code:bad-id");
			continue;
		}
		await deleteResource(api, `${root}/queues/${queue.id}/consumers/${consumer.consumer_id}`, failures);
	}
}

async function removeOne(api, root, group, queuesByName, failures) {
	const queues = orderedQueues(group.queues);
	for (const name of queues) {
		const queue = queuesByName.get(name);
		if (!queue || !safeId(queue.id)) continue;
		await removeConsumers(api, root, group.worker, queue, failures);
	}
	await deleteResource(api, `${root}/workers/scripts/${encodeURIComponent(group.worker)}?force=true`, failures);
	for (const name of queues) {
		const queue = queuesByName.get(name);
		if (!queue || !safeId(queue.id)) continue;
		await deleteResource(api, `${root}/queues/${queue.id}`, failures);
	}
}

function leftovers(plan, scripts, queues, now) {
	const names = [];
	for (const script of scripts) {
		if (script.name === plan.workerName || (isTrialWorker(script.name) && olderThan(script.createdOn, now)))
			names.push(script.name);
	}
	for (const queue of queues) {
		if (
			queue.name === plan.queue ||
			queue.name === plan.deadLetter ||
			(isTrialQueue(queue.name) && olderThan(queue.createdOn, now))
		) {
			names.push(queue.name);
		}
	}
	return names;
}

export async function cleanupTrial(plan, api, now = Date.now()) {
	const root = accountPath(plan.cloudflareAccountId);
	const scripts = asScripts(await listPages(api, `${root}/workers/scripts`));
	const queues = asQueues(await listPages(api, `${root}/queues`));
	const failures = [];
	const queuesByName = new Map(queues.map((queue) => [queue.name, queue]));
	for (const target of cleanupTargets(plan, scripts, queues, now)) {
		await removeOne(api, root, target, queuesByName, failures);
	}
	const left = leftovers(
		plan,
		asScripts(await listPages(api, `${root}/workers/scripts`)),
		asQueues(await listPages(api, `${root}/queues`)),
		now,
	);
	return [...left, ...new Set(failures)];
}
