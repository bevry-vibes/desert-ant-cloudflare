// LiteRT.js bootstrap for the workerd runtime.
//
// Two workerd restrictions shape this module:
// - LiteRT.js evaluates its emscripten glue through `importScripts` (Worker) or
//   a `<script>` tag (browser). workerd has neither, so the glue is vendored as
//   a bundled ES module and registered on `self` the way runScript would.
// - workerd bans wasm code generation at runtime, so the LiteRT wasm ships as
//   a precompiled CompiledWasm bundle import and is handed to emscripten
//   through its `instantiateWasm` hook.
//
// The compat (no relaxed SIMD) build is used because the runtime probe cannot
// compile its check module inside workerd, so LiteRT.js always selects compat.

import * as litert from "@litertjs/core";
import { ModuleFactory } from "./vendor-litert-glue.js";
// CompiledWasm import: the default export is a WebAssembly.Module compiled at
// build time. See the rules entry in wrangler.jsonc.
import litertWasmModule from "../node_modules/@litertjs/core/wasm/litert_wasm_compat_internal.wasm";

let readyPromise = null;

/**
 * Initialise LiteRT.js once per isolate. Resolves to the module object the
 * Desert Ant core expects: `{ loadLiteRt, loadAndCompile, Tensor }`.
 *
 * @returns {Promise<typeof import("@litertjs/core")>}
 */
export function litertForWorkerd() {
	readyPromise ??= (async () => {
		if (typeof globalThis.importScripts !== "function") {
			// LiteRT.js calls importScripts to evaluate the glue file. The glue is
			// bundled into this worker, so the stub only has to exist and return.
			globalThis.importScripts = () => {};
		}
		if (typeof self.location === "undefined") {
			// The emscripten glue sees WorkerGlobalScope in workerd and reads
			// self.location.href for its script name. workerd defines the scope
			// marker but no location, so seed a harmless one.
			self.location = { href: "https://bundled.invalid/litert_wasm_compat_internal.js" };
		}
		self.ModuleFactory = ModuleFactory;
		self.Module = {
			// Hand the precompiled module to emscripten. Instantiating an already
			// compiled module generates no new code, so workerd allows it.
			instantiateWasm(imports, success) {
				try {
					const instance = new WebAssembly.Instance(litertWasmModule, imports);
					success(instance, litertWasmModule);
					return instance.exports;
				} catch (cause) {
					console.error("LiteRT wasm instantiation failed:", cause);
					throw cause;
				}
			},
		};
		// LiteRT.js must stay uninitialised here. The Desert Ant core's open()
		// calls lrt.loadLiteRt() through its own wrapper exactly once and caches
		// the promise, so this bootstrap only prepares the environment above and
		// hands back the module. If a previous attempt in this isolate left a
		// settled promise behind, drain it so the guard does not misfire.
		const leftover = litert.getGlobalLiteRtPromise();
		if (leftover) {
			try {
				await leftover;
			} catch {
				// the previous load failed and already cleared its own state
			}
		}
		return litert;
	})();
	return readyPromise;
}
