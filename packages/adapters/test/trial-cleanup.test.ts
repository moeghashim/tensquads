import assert from "node:assert/strict";
import test from "node:test";
import type { BoatApi } from "@boatdev/sdk";

import { cleanupTrial, formatCleanup } from "./live/cleanup.ts";
import { TRIAL_PROFILE, trialIdentity, trialSecretName } from "./live/identity.ts";

test("cleanup removes and reports only this run's secret", async () => {
	const trial = trialIdentity("111111");
	const names = new Set([trialSecretName(trial.runId), trialSecretName("222222")]);
	const deleted: string[] = [];
	const machine = {
		async sandboxes() {
			return { sandboxes: [] };
		},
		async listSavedSnapshots() {
			return { snapshots: [] };
		},
	};
	const admin = {
		async deleteCredentialProfileCustomApi(input: { profile: string; name: string }) {
			assert.equal(input.profile, TRIAL_PROFILE);
			deleted.push(input.name);
			names.delete(input.name);
		},
		async listCredentialProfiles() {
			return { profiles: [{ name: TRIAL_PROFILE, customApis: [...names] }] };
		},
	};
	const report = await cleanupTrial(machine as unknown as BoatApi, admin as unknown as BoatApi, trial);
	assert.deepEqual(deleted, ["TENSQUADS_TRIAL_KEY_111111"]);
	assert.deepEqual([...names], ["TENSQUADS_TRIAL_KEY_222222"]);
	assert.equal(report.customApis.length, 0);
	assert.equal(formatCleanup(trial, report), "cleanup-check run=111111 sandboxes=0 snapshots=0 custom_apis=0");
});
