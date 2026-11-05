import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { BoatApi, Configuration, ResponseError } from "@boatdev/sdk";

import { assertTrialProfile, TRIAL_PROFILE, type TrialIdentity, trialIdentity, trialSecretName } from "./identity.ts";

interface ListedSandbox {
	readonly id: string;
	readonly name?: string;
	readonly labels?: Readonly<Record<string, string>>;
}

function client(token: string): BoatApi {
	return new BoatApi(new Configuration({ accessToken: token }));
}

function missing(error: unknown): boolean {
	return error instanceof ResponseError && error.response.status === 404;
}

async function pages(machine: BoatApi, label: string): Promise<ListedSandbox[]> {
	const rows: ListedSandbox[] = [];
	let cursor: string | null = null;
	do {
		const page = await machine.sandboxes({ label: [label], limit: 100, cursor });
		rows.push(...page.sandboxes);
		const info = page.pageInfo;
		if (!info?.hasMore) break;
		if (!info.nextCursor) throw new Error("The machine list was cut off.");
		cursor = info.nextCursor;
	} while (cursor);
	return rows;
}

async function owned(machine: BoatApi, trial: TrialIdentity): Promise<ListedSandbox[]> {
	const [byRun, byAccount] = await Promise.all([
		pages(machine, `run=${trial.runId}`),
		pages(machine, `account=${trial.accountId}`),
	]);
	const seen = new Map<string, ListedSandbox>();
	for (const row of [...byRun, ...byAccount]) seen.set(row.id, row);
	return [...seen.values()];
}

async function removeMachine(machine: BoatApi, id: string): Promise<void> {
	try {
		const started = await machine.deleteSandbox({ sandboxId: id, xAsciiConfirmDelete: id });
		const deadline = Date.now() + 180_000;
		for (;;) {
			const current = await machine.getDeletionOperation({ operationId: started.operation.id });
			if (current.operation.status === "completed") return;
			if (Date.now() >= deadline) throw new Error(`The machine ${id} is still deleting.`);
			await new Promise((resolve) => setTimeout(resolve, 2_000));
		}
	} catch (error) {
		if (missing(error)) return;
		throw new Error("A trial machine could not be removed.");
	}
}

async function removeSecret(admin: BoatApi, trial: TrialIdentity): Promise<void> {
	assertTrialProfile(TRIAL_PROFILE);
	try {
		await admin.deleteCredentialProfileCustomApi({ profile: TRIAL_PROFILE, name: trialSecretName(trial.runId) });
	} catch (error) {
		if (missing(error)) return;
		throw new Error("The trial secret name could not be removed.");
	}
}

async function customApiNames(admin: BoatApi): Promise<readonly string[]> {
	assertTrialProfile(TRIAL_PROFILE);
	const listed = await admin.listCredentialProfiles();
	return listed.profiles.find((profile) => profile.name === TRIAL_PROFILE)?.customApis ?? [];
}

export interface CleanupReport {
	readonly sandboxes: readonly string[];
	readonly snapshots: readonly string[];
	readonly customApis: readonly string[];
}

export async function cleanupTrial(machine: BoatApi, admin: BoatApi, trial: TrialIdentity): Promise<CleanupReport> {
	assertTrialProfile(TRIAL_PROFILE);
	for (const row of await owned(machine, trial)) await removeMachine(machine, row.id);
	const snapshots = await machine.listSavedSnapshots();
	for (const snapshot of snapshots.snapshots) {
		if (snapshot.name !== trial.templateId) continue;
		try {
			await machine.deleteSavedSnapshot({ name: snapshot.name });
		} catch (error) {
			if (!missing(error)) throw new Error("The trial template could not be removed.");
		}
	}
	await removeSecret(admin, trial);
	const leftMachines = await owned(machine, trial);
	const leftSnapshots = (await machine.listSavedSnapshots()).snapshots.filter(
		(snapshot) => snapshot.name === trial.templateId,
	);
	const apis = await customApiNames(admin);
	return {
		sandboxes: leftMachines.map((row) => row.name || row.id),
		snapshots: leftSnapshots.map((snapshot) => snapshot.name),
		customApis: apis.filter((name) => name === trialSecretName(trial.runId)),
	};
}

export function formatCleanup(trial: TrialIdentity, report: CleanupReport): string {
	const lines = [
		`cleanup-check run=${trial.runId} sandboxes=${report.sandboxes.length} snapshots=${report.snapshots.length} custom_apis=${report.customApis.length}`,
	];
	if (report.sandboxes.length > 0) lines.push(`left sandboxes: ${report.sandboxes.join(", ")}`);
	if (report.snapshots.length > 0) lines.push(`left snapshots: ${report.snapshots.join(", ")}`);
	if (report.customApis.length > 0) lines.push(`left custom apis: ${report.customApis.join(", ")}`);
	return lines.join("\n");
}

async function main(): Promise<number> {
	const token = process.env.BOAT_API_KEY ?? "";
	const adminToken = process.env.BOAT_ADMIN_API_KEY ?? "";
	const runId = process.env.GITHUB_RUN_ID ?? "";
	if (!token || !adminToken) {
		console.error("The boat trial credentials are absent.");
		return 1;
	}
	assertTrialProfile(process.env.BOAT_PROFILE ?? TRIAL_PROFILE);
	const trial = trialIdentity(runId);
	const report = await cleanupTrial(client(token), client(adminToken), trial);
	const text = formatCleanup(trial, report);
	console.log(text);
	return report.sandboxes.length + report.snapshots.length + report.customApis.length === 0 ? 0 : 1;
}

const entry = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === entry) {
	main()
		.then((code) => {
			process.exitCode = code;
		})
		.catch((error: unknown) => {
			console.error(error instanceof Error ? error.message : "The trial cleanup failed.");
			process.exitCode = 1;
		});
}
