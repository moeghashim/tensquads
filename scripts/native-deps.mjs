import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// .nvmrc is the single source of truth for the supported Node major.
const EXPECTED_NODE_MAJOR = Number(readFileSync(join(process.cwd(), ".nvmrc"), "utf8").trim().split(".")[0]);

function readCommand(command, args) {
	const result = spawnSync(command, args, { encoding: "utf8" });
	if (result.status !== 0) {
		return null;
	}
	return result.stdout.trim();
}

function platformArchSuffix() {
	const arch = process.arch;
	const platform = process.platform;
	if (!["arm64", "x64"].includes(arch)) {
		return null;
	}
	if (!["darwin", "linux", "win32"].includes(platform)) {
		return null;
	}
	return `${platform}-${arch}`;
}

function scanInstalledVariants(scopeName, expectedPrefix) {
	const scopePath = join(process.cwd(), "node_modules", scopeName);
	if (!existsSync(scopePath)) {
		return [];
	}
	return readdirSync(scopePath)
		.map((entry) => `${scopeName}/${entry}`)
		.filter((name) => name.startsWith(expectedPrefix));
}

function collectNativePackageIssue(label, expectedPackage) {
	const suffix = platformArchSuffix();
	if (!suffix) {
		return {
			issue: null,
			warning: `${label}: no explicit check for ${process.platform}/${process.arch}.`,
		};
	}

	const expected = expectedPackage(suffix);
	if (existsSync(join(process.cwd(), "node_modules", ...expected.split("/")))) {
		return { issue: null, warning: null };
	}

	const [scopeName] = expected.split("/");
	const variantPrefix = expected.replace(/-[^-]+-[^-]+$/, "");
	const installedVariants = scanInstalledVariants(scopeName, variantPrefix);
	if (installedVariants.length === 0) {
		return {
			issue: `${label}: expected ${expected} but it is not installed. Run npm install or npm run reinstall:clean.`,
			warning: null,
		};
	}

	return {
		issue: `${label}: expected ${expected}, but found ${installedVariants.join(", ")}. Reinstall dependencies for the current architecture.`,
		warning: null,
	};
}

export function getEnvironmentReport() {
	const issues = [];
	const warnings = [];
	const nodeVersion = process.version;
	const npmVersion = readCommand("npm", ["-v"]);

	if (Number(process.versions.node.split(".")[0]) !== EXPECTED_NODE_MAJOR) {
		issues.push(`Expected Node ${EXPECTED_NODE_MAJOR}.x, found ${nodeVersion}.`);
	}

	if (!npmVersion) {
		issues.push("npm is not available on PATH.");
	}

	if (!existsSync(join(process.cwd(), "node_modules"))) {
		warnings.push("Dependencies are not installed yet. Run npm install after fixing any Node/npm mismatch.");
		return {
			issues,
			warnings,
			nodeVersion,
			npmVersion,
			platform: process.platform,
			architecture: process.arch,
		};
	}

	for (const { label, packageName } of [
		{ label: "Biome", packageName: (suffix) => `@biomejs/cli-${suffix}` },
		{ label: "esbuild", packageName: (suffix) => `@esbuild/${suffix}` },
		{ label: "TypeScript", packageName: (suffix) => `@typescript/typescript-${suffix}` },
	]) {
		const result = collectNativePackageIssue(label, packageName);
		if (result.issue) {
			issues.push(result.issue);
		}
		if (result.warning) {
			warnings.push(result.warning);
		}
	}

	return {
		issues,
		warnings,
		nodeVersion,
		npmVersion,
		platform: process.platform,
		architecture: process.arch,
	};
}

export function printEnvironmentReport({ issues, warnings, nodeVersion, npmVersion, platform, architecture }) {
	console.log(`Node: ${nodeVersion}`);
	console.log(`npm: ${npmVersion ?? "not found"}`);
	console.log(`Platform: ${platform}`);
	console.log(`Architecture: ${architecture}`);

	if (warnings.length > 0) {
		console.log("\nWarnings:");
		for (const warning of warnings) {
			console.log(`- ${warning}`);
		}
	}

	if (issues.length > 0) {
		console.error("\nIssues:");
		for (const issue of issues) {
			console.error(`- ${issue}`);
		}
		console.error(
			`\nSuggested fix: use Node ${EXPECTED_NODE_MAJOR} on this machine, then run npm install or npm run reinstall:clean so native dependencies match the current OS and CPU architecture.`,
		);
	}
}
