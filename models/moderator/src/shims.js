// Runtime shims for the LiteRT.js loader and the emscripten glue inside workerd.
// This module must stay the first import of the worker, so the globals exist
// before the glue evaluates its environment checks at import time.

// The emscripten glue picks its loading path from the environment it detects.
// workerd has no window, no WorkerGlobalScope, and no process, so the checks
// find nothing. Declaring a window selects the web path: fetch based, no fs.
globalThis.window = globalThis;

// The web path reads self.location.href to build its script directory. workerd
// exposes no location global, so provide one; the real wasm location comes
// from the bundled modules, so the value only needs to be a valid URL.
globalThis.location ??= { href: "https://assets.local/worker" };

// The bundler injects a partial process shim whose versions.node makes the
// emscripten glue take its Node branch, which reads __dirname and node:fs.
// workerd has neither, so remove the tell before the glue evaluates it.
try {
	delete globalThis.process;
} catch {
	globalThis.process = undefined;
}

// The LiteRT.js script loader uses importScripts in a worker and a script tag
// in a document. workerd has neither, but the glue is bundled statically, so a
// no-op importScripts satisfies the loader: it then finds self.ModuleFactory
// already set by the worker.
globalThis.importScripts ||= () => {};

// Turn the Desert Ant usage POST off for harness runs.
globalThis.__dalUsageDisabled = true;
