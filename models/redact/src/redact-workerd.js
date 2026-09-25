// Wires @desert-ant-labs/redact (browser/WebAssembly build) onto workerd.
//
// The stock entry point instantiates the Swift wasm core with
// `fetch(new URL("RedactWeb.wasm", import.meta.url))`, which cannot resolve
// inside a bundled worker, and workerd bans runtime wasm compilation anyway.
// This module therefore rebuilds the same wiring by hand: the core ships as a
// precompiled CompiledWasm bundle import, the LiteRT.js session comes from the
// workerd bootstrap, and the public `Redact` class is the package's own
// `makeRedact`.

import {
	browserCacheRoot,
	browserReadModelSource,
	browserWasmDir,
	createWasmSdk,
	makeModelHostSeam,
} from "@desert-ant-labs/core";
import { makeRedact } from "../node_modules/@desert-ant-labs/redact/redact.js";
import { defaultBrowserSetup } from "../node_modules/@desert-ant-labs/redact/dist/platforms/browser.js";
import { instantiate as instantiateRedactCore } from "../node_modules/@desert-ant-labs/redact/dist/instantiate.js";
// CompiledWasm import of the Swift core. See the rules entry in wrangler.jsonc.
import redactCoreWasmModule from "../node_modules/@desert-ant-labs/redact/dist/RedactWeb.wasm";
import { litertForWorkerd } from "./litert-workerd.js";

/** @type {Promise<{ redact: object, modelInfo: object, timings: object }> | null} */
let loadPromise = null;

/** Survives request cancellation within the isolate, unlike console output. */
const trace = [];

/** @param {string} message */
function note(message) {
	trace.push(`${new Date().toISOString()} ${message}`);
}

/**
 * Load the model once per isolate and reuse the instance afterwards.
 *
 * @param {string} origin request origin, for example "http://127.0.0.1:8822"
 * @returns {Promise<{ redact: object, modelInfo: object, timings: object }>}
 */
export function loadRedact(origin) {
	loadPromise ??= build(origin);
	return loadPromise;
}

/** Recent buffered trace lines, for reading after a request was canceled. */
export function getTrace() {
	return trace;
}

async function build(origin) {
	const timings = {};
	const seam = makeModelHostSeam();

	note("build start");
	// Instantiate the precompiled Swift wasm core. Instantiating a bundled
	// module generates no new code, which keeps workerd happy.
	const t0 = performance.now();
	const setup = await defaultBrowserSetup({
		module: redactCoreWasmModule,
		getImports: () => seam.imports,
	});
	const { exports } = await instantiateRedactCore({
		module: redactCoreWasmModule,
		wasi: setup.wasi,
		getImports: () => seam.imports,
	});
	timings.coreInstantiateMs = round(performance.now() - t0);
	const modelInfo = exports.modelInfo();
	note(`core instantiated modelInfo=${JSON.stringify(modelInfo)}`);

	const sdk = await createWasmSdk({
		// The seam normally resolved from the package's `#platform` import,
		// rebuilt here with the already instantiated core.
		platform: {
			setupCore: async () => ({ exports, installHost: seam.install }),
			defaultWasmDir: browserWasmDir,
			readModelSource: browserReadModelSource,
			defaultCacheRoot: browserCacheRoot,
		},
		packageName: "@desert-ant-labs/redact",
	});

	// Initialise LiteRT.js, then load and compile the tflite weights that this
	// worker serves from /weights/. `litert` also bypasses the browser guard in
	// open(), which would otherwise demand `document` or `importScripts`.
	const t1 = performance.now();
	const litert = await litertForWorkerd();
	timings.litertInitMs = round(performance.now() - t1);

	const t2 = performance.now();
	const Redact = makeRedact(sdk);
	const redact = await Redact.load({
		litert,
		accelerator: "wasm",
		modelBaseUrl: `${origin}/weights/`,
	});
	timings.modelLoadMs = round(performance.now() - t2);
	note(`model loaded isDownloaded=${redact.isDownloaded()}`);

	return { redact, modelInfo, timings };
}

function round(ms) {
	return Math.round(ms * 100) / 100;
}
