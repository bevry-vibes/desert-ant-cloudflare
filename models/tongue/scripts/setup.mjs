// copies the bundled tongue weights from the installed package into assets/
// the package exports the files through its "exports" map, so the copy needs no deep paths
// weights are never committed: the local .gitignore excludes the .bin file
import { copyFileSync, mkdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const modelDir = dirname(scriptDir);

// resolves through node_modules, so it works for any install layout
export function packageDir() {
	const require = createRequire(join(modelDir, "package.json"));
	return dirname(require.resolve("@desert-ant-labs/tongue/package.json"));
}

export function weightFiles() {
	return [
		{ name: "tongue_int8.bin", source: join(packageDir(), "dist", "tongue_int8.bin") },
		{ name: "tongue_meta.json", source: join(packageDir(), "dist", "tongue_meta.json") },
	];
}

export function copyWeights() {
	const destDir = join(modelDir, "assets", "models", "tongue");
	mkdirSync(destDir, { recursive: true });
	const copied = [];
	for (const file of weightFiles()) {
		const dest = join(destDir, file.name);
		let needsCopy = true;
		try {
			needsCopy = statSync(dest).size !== statSync(file.source).size;
		} catch {
			// destination missing: copy it
		}
		if (needsCopy) {
			copyFileSync(file.source, dest);
			copied.push(`${file.name} (${statSync(file.source).size} bytes)`);
		}
	}
	return { destDir, copied };
}

export function weightsPresent() {
	return weightFiles().every((file) => {
		try {
			return statSync(join(modelDir, "assets", "models", "tongue", file.name)).size > 0;
		} catch {
			return false;
		}
	});
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] ?? "")).href) {
	const { destDir, copied } = copyWeights();
	if (copied.length > 0) {
		console.log(`copied into ${destDir}:`);
		for (const line of copied) console.log(`  ${line}`);
	} else {
		console.log(`weights already present in ${destDir}`);
	}
}
