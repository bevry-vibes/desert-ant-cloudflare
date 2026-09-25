// LiteRT.js bootstrap for workerd.
//
// LiteRT.js loads its Emscripten runtime in one of two ways: importScripts in
// a worker, or a <script> tag in a page. workerd offers neither. The stock
// loader also cannot run at all here, so this module prepares the environment
// before the stock loader starts:
//
// 1. The Emscripten glue is imported as a module. The stock glue file is UMD
//    with no exports, so src/litert-wasm-glue.mjs is a verbatim copy with one
//    added default export statement.
// 2. globalThis.importScripts is replaced with a no-op, so the stock loader's
//    script step finds the glue already registered and does nothing.
// 3. globalThis.Module carries an instantiateWasm hook backed by a
//    CompiledWasm import, so the 9 MB runtime never crosses the network and no
//    fetch URL is needed. workerd rejects relative fetch URLs, so serving the
//    runtime from assets would need an absolute URL anyway.

import "./workerd-shims.js";
import ModuleFactory from "./litert-wasm-glue.mjs";
import litertWasmModule from "@litertjs/core/wasm/litert_wasm_internal.wasm";

let state = null;

/**
 * Initialise LiteRT.js once per isolate and return the module plus timings.
 * @param {string} origin absolute origin of the current request (unused, kept for symmetry)
 * @returns {Promise<{ litert: any, ms: number, relaxedSimd: boolean }>}
 */
export function loadLiteRtWorkerd(origin) {
	state ??= initialise(origin);
	return state;
}

async function initialise(origin) {
	globalThis.self ??= globalThis;
	globalThis.location ??= { href: `${origin}/` };
	globalThis.importScripts = () => {};
	const realFactory = ModuleFactory;
	globalThis.ModuleFactory = async (moduleArg) => {
		console.log("[litert] factory entered");
		const result = await realFactory(moduleArg);
		console.log("[litert] factory resolved");
		return result;
	};
	globalThis.Module = {
		// Synchronous construction against the pre-compiled module import: the
		// promise-based WebAssembly.instantiate(module, imports) returned a
		// result object whose instance field never arrived here.
		instantiateWasm(imports, receive) {
			console.log("[litert] instantiateWasm called");
			try {
				const instance = new WebAssembly.Instance(litertWasmModule, imports);
				console.log("[litert] runtime instance constructed");
				receive(instance, litertWasmModule);
				return instance.exports;
			} catch (error) {
				console.error("[litert] runtime instantiation failed:", error);
				throw error;
			}
		},
	};

	const started = performance.now();
	const litert = await import("@litertjs/core");
	console.log("[litert] dist module imported");
	let relaxedSimd = false;
	try {
		relaxedSimd = await litert.supportsFeature("relaxedSimd");
	} catch {
		relaxedSimd = false;
	}
	console.log("[litert] relaxedSimd:", relaxedSimd);
	await litert.loadLiteRt(`${origin}/litert/`);
	console.log("[litert] loadLiteRt resolved");
	return { litert, ms: performance.now() - started, relaxedSimd };
}
