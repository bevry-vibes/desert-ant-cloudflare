// Wires @desert-ant-labs/emo (browser/WebAssembly build) onto workerd.
//
// The stock entry point instantiates the Swift wasm core with
// `fetch(new URL("EmoWeb.wasm", import.meta.url))`, which cannot resolve inside
// a bundled worker, and workerd bans runtime wasm compilation anyway. This
// module therefore rebuilds the same wiring by hand: the core ships as a
// precompiled CompiledWasm bundle import, the LiteRT.js session comes from the
// workerd bootstrap, and the public `Emo` class is the package's own `makeEmo`.

import {
	browserCacheRoot,
	browserReadModelSource,
	browserWasmDir,
	createWasmSdk,
	makeModelHostSeam,
} from "@desert-ant-labs/core";
import { makeEmo } from "../node_modules/@desert-ant-labs/emo/emo.js";
import { defaultBrowserSetup } from "../node_modules/@desert-ant-labs/emo/dist/platforms/browser.js";
import { instantiate as instantiateEmoCore } from "../node_modules/@desert-ant-labs/emo/dist/instantiate.js";
// CompiledWasm import of the Swift core. See the rules entry in wrangler.jsonc.
import emoCoreWasmModule from "../node_modules/@desert-ant-labs/emo/dist/EmoWeb.wasm";
import { litertForWorkerd } from "./litert-workerd.js";

/** @type {Promise<{ emo: object, modelInfo: object, timings: object }> | null} */
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
 * @returns {Promise<{ emo: object, modelInfo: object, timings: object }>}
 */
export function loadEmo(origin) {
	loadPromise ??= build(origin);
	return loadPromise;
}

/** Recent buffered trace lines, for reading after a request was canceled. */
export function getTrace() {
	return trace;
}

let currentExports = null;
let currentHandle = null;

/**
 * Call the wasm core's run with an arbitrary handle, to tell a hang in the
 * BridgeJS async wrapper apart from a hang in real model work.
 */
export async function debugRun(text, handleOffset = 0) {
	if (!currentExports) throw new Error("model not built yet");
	const bytes = new TextEncoder().encode(String(text ?? ""));
	const input = new Uint8Array(4 + bytes.length);
	new DataView(input.buffer).setUint32(0, bytes.length);
	input.set(bytes, 4);
	const options = new Uint8Array(8);
	new DataView(options.buffer).setUint32(0, 3);
	const { FfiReader } = await import("@desert-ant-labs/core");
	const reader = await currentExports.run(
		(currentHandle ?? 0) + handleOffset,
		input,
		options,
		null,
		null,
	);
	const count = reader.u32();
	const out = [];
	for (let i = 0; i < count; i++) out.push({ emoji: reader.str(), confidence: reader.f64() });
	return out;
}

async function build(origin) {
	const timings = {};
	const seam = makeModelHostSeam();

	note("build start");
	// Instantiate the precompiled Swift wasm core. Instantiating a bundled
	// module generates no new code, which keeps workerd happy.
	const t0 = performance.now();
	// Drive instantiation by hand (instead of the package's init()) so the WASI
	// imports can be wrapped with tracing.
	const setup = await defaultBrowserSetup({
		module: emoCoreWasmModule,
		getImports: () => seam.imports,
	});
	setup.wasi.wasiImport = new Proxy(setup.wasi.wasiImport, {
		get(target, prop) {
			const original = target[prop];
			if (typeof original !== "function") return original;
			return (...args) => {
				note(`wasi ${String(prop)}`);
				return original.apply(target, args);
			};
		},
	});
	const { exports: rawExports } = await instantiateEmoCore({
		module: emoCoreWasmModule,
		wasi: setup.wasi,
		getImports: () => seam.imports,
	});
	// Wrap the wasm ABI entry points with tracing, so a stall shows whether the
	// core was even entered.
	const exports = { ...rawExports };
	for (const name of ["run", "download", "createSelfHosted", "create", "isDownloaded"]) {
		if (typeof rawExports[name] !== "function") continue;
		exports[name] = (...args) => {
			note(`exports.${name} called`);
			try {
				const result = rawExports[name](...args);
				if (result instanceof Promise) {
					return result.then(
						(value) => {
							note(`exports.${name} resolved`);
							return value;
						},
						(cause) => {
							note(`exports.${name} rejected: ${cause}`);
							throw cause;
						},
					);
				}
				note(`exports.${name} returned sync`);
				return result;
			} catch (cause) {
				note(`exports.${name} threw: ${cause}`);
				throw cause;
			}
		};
	}
	timings.coreInstantiateMs = round(performance.now() - t0);
	const modelInfo = exports.modelInfo();
	note(`core instantiated modelInfo=${JSON.stringify(modelInfo)}`);

	const sdk = await createWasmSdk({
		// The seam normally resolved from the package's `#platform` import,
		// rebuilt here with the already instantiated core. The install hook wraps
		// the model host with tracing, so a hang inside run() shows how far the
		// wasm core got.
		platform: {
			setupCore: async () => ({
				exports,
				installHost: (host) => {
				const traced = {};
				for (const [name, method] of Object.entries(host)) {
					traced[name] = async (...args) => {
						const start = performance.now();
						note(`host ${name} start ${name === "run" ? Object.keys(args[0]).join(",") : ""}`);
						try {
							const result = await method.apply(host, args);
							note(`host ${name} done ${round(performance.now() - start)}ms`);
							return result;
						} catch (cause) {
							note(`host ${name} failed: ${cause}`);
							throw cause;
						}
					};
				}
				seam.install(traced);
			},
			}),
			defaultWasmDir: browserWasmDir,
			readModelSource: browserReadModelSource,
			defaultCacheRoot: browserCacheRoot,
		},
		packageName: "@desert-ant-labs/emo",
	});

	// Initialise LiteRT.js, then load and compile the tflite weights that this
	// worker serves from /weights/. `litert` also bypasses the browser guard in
	// open(), which would otherwise demand `document` or `importScripts`.
	const t1 = performance.now();
	const litert = await litertForWorkerd();
	timings.litertInitMs = round(performance.now() - t1);
	note("litert ready");

	const t2 = performance.now();
	const Emo = makeEmo(sdk);
	const emo = await Emo.load({
		litert,
		accelerator: "wasm",
		modelBaseUrl: `${origin}/weights/`,
	});
	timings.modelLoadMs = round(performance.now() - t2);
	note(`model loaded isDownloaded=${emo.isDownloaded()}`);

	// The real handle is private to LoadedModel, so debugRun exercises the
	// BridgeJS async wrapper with a bogus handle (0). A fast error there, while
	// real suggestions hang, would locate the stall inside model work.
	currentExports = exports;

	return { emo, modelInfo, timings };
}

function round(ms) {
	return Math.round(ms * 100) / 100;
}
