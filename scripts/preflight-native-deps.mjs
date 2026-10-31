#!/usr/bin/env node

import { getEnvironmentReport, printEnvironmentReport } from "./native-deps.mjs";

const report = getEnvironmentReport();

if (report.issues.length > 0) {
	printEnvironmentReport(report);
	process.exit(1);
}
