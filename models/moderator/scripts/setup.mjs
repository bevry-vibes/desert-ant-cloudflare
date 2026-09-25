// generates the importable copy of the LiteRT.js emscripten glue
// the glue is a UMD script with no export statements, and esbuild refuses a
// default import from it, so scripts copy it as an .mjs file and append one
// export line. That turns it into an importable ES module without touching its
// logic. The copy is generated, never committed: .gitignore excludes it.
// usage: node scripts/setup.mjs
import { appendFileSync, copyFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const modelDir = dirname(scriptDir);

export function copyGlue() {
	const require = createRequire(join(modelDir, "package.json"));
	const litertDir = dirname(require.resolve("@litertjs/core/package.json"));
	const source = join(litertDir, "wasm", "litert_wasm_internal.js");
	const destDir = join(modelDir, "src", "generated");
	mkdirSync(destDir, { recursive: true });
	const dest = join(destDir, "litert_wasm_internal.mjs");
	copyFileSync(source, dest);
	appendFileSync(dest, "\n// appended by scripts/setup.mjs\nexport default ModuleFactory;\n");
	return dest;
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] ?? "")).href) {
	console.log(`glue written to ${copyGlue()}`);
}
