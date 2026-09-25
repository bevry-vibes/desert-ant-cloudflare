// Populates assets/ and src/ for the emo workerd test. A fresh clone runs:
//   npm install && npm run setup
//
// workerd bans wasm code generation at runtime, so both wasm modules are
// imported into the bundle as precompiled CompiledWasm modules and no wasm
// file lives in assets/ at all:
// - EmoWeb.wasm and litert_wasm_compat_internal.wasm are imported straight out
//   of node_modules at build time (see wrangler.jsonc rules).
// - Only the model weights land in assets/, downloaded from the Hugging Face
//   Hub at the revision the SDK pins today (main as at 2026-09-25). Weights
//   stay out of git per the repository rules.
//
// The LiteRT emscripten glue needs one mechanical tweak, applied below.

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const modelDir = path.resolve(here, "..");
const assetsDir = path.join(modelDir, "assets");
const srcDir = path.join(modelDir, "src");

const HF_BASE = "https://huggingface.co/desert-ant-labs/emo/resolve/main";

/** Weight files fetched from the Hugging Face Hub. */
const downloads = [
	{ name: "emo.tflite", minBytes: 5_000_000 },
	{ name: "emo_meta.json", minBytes: 1_000 },
	{ name: "emo_tokenizer.bin", minBytes: 100_000 },
];

await mkdir(path.join(assetsDir, "weights"), { recursive: true });
// Remove artefacts of earlier setups that precompiled wasm lived in assets/.
await rm(path.join(assetsDir, "core"), { recursive: true, force: true });
await rm(path.join(assetsDir, "litert"), { recursive: true, force: true });

for (const file of downloads) {
	const destination = path.join(assetsDir, "weights", file.name);
	let size = 0;
	try {
		const stat = await readFile(destination);
		size = stat.byteLength;
	} catch {
		// absent, download below
	}
	if (size >= file.minBytes) {
		console.log(`kept existing ${path.relative(modelDir, destination)} (${size} bytes)`);
		continue;
	}
	const response = await fetch(`${HF_BASE}/${file.name}`);
	if (!response.ok) {
		throw new Error(`download of ${file.name} failed with status ${response.status}`);
	}
	const bytes = new Uint8Array(await response.arrayBuffer());
	if (bytes.byteLength < file.minBytes) {
		throw new Error(`download of ${file.name} is too small: ${bytes.byteLength} bytes`);
	}
	await writeFile(destination, bytes);
	console.log(`downloaded ${file.name} -> ${path.relative(modelDir, destination)} (${bytes.byteLength} bytes)`);
}

// The LiteRT emscripten glue is bundled as an ES module. workerd has no DOM and
// no importScripts, and the UMD export block at the end of the stock file would
// be dead code in an ES module, so replace that block with direct ES exports.
// The compat build is vendored because the relaxed SIMD probe cannot compile
// its check module inside workerd, so LiteRT.js always selects this build.
// The marker keeps this step idempotent.
const glueSource = path.join(modelDir, "node_modules/@litertjs/core/wasm/litert_wasm_compat_internal.js");
const glueTarget = path.join(srcDir, "vendor-litert-glue.js");
const marker = "re-export the factory directly";
const glue = await readFile(glueSource, "utf8");
	// workerd is not Node, but wrangler shims `process` enough that the stock
	// environment probe misfires and the glue then wants __dirname and fs. Pin
	// the probe to false for this vendored copy.
	const nodeProbe = 'var ENVIRONMENT_IS_NODE = globalThis.process?.versions?.node && globalThis.process?.type != "renderer";';
	if (!glue.includes(nodeProbe)) {
		throw new Error("unexpected litert_wasm_compat_internal.js layout: Node probe not found");
	}
	const withoutNode = glue.replace(
		nodeProbe,
		"var ENVIRONMENT_IS_NODE = false; // workerd tweak: workerd is not Node even though wrangler shims `process`",
	);
	const umdStart = withoutNode.indexOf("// Export using a UMD style export");
	if (umdStart < 0) {
		throw new Error("unexpected litert_wasm_compat_internal.js layout: UMD block not found");
	}
	const existing = await readFile(glueTarget, "utf8").catch(() => null);
	if (existing == null || !existing.includes(marker) || !existing.includes("compat")) {
		const patched =
			"// Vendored from node_modules/@litertjs/core/wasm/litert_wasm_compat_internal.js\n" +
			"// (LiteRT.js compat build, no relaxed SIMD). Regenerate with `npm run setup`.\n" +
			"//\n" +
			`${withoutNode.slice(0, umdStart)}\n` +
			"// workerd tweak: the stock UMD export block was removed. It is inert in an\n" +
			"// ES module context, so the factory is re-exported directly instead. The\n" +
			"// wrapping module is authored once by the fetch-weights setup.\n" +
			"export default ModuleFactory;\n" +
			"export { ModuleFactory };\n";
	await writeFile(glueTarget, patched);
	console.log(`wrote ${path.relative(modelDir, glueTarget)} (stock compat glue, UMD block replaced with ES exports)`);
} else {
	console.log(`kept existing ${path.relative(modelDir, glueTarget)}`);
}

console.log("setup complete");
