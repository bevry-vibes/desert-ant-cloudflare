// Environment shims for workerd. This module must be imported before any
// Emscripten glue, because the glue computes its environment at evaluation
// time.
//
// workerd ships a Node compatibility layer, so the glue sees a process global
// with process.versions.node and picks its Node path. That path wants
// __dirname, node:fs, and process.argv, and none of them help here. Replace
// the global with a stub, so the glue takes its worker path instead. The
// worker read/write hooks of that path stay unused, because the LiteRT
// bootstrap hands the factory a pre-instantiated wasm module.

globalThis.process = { env: {} };
globalThis.self ??= globalThis;
globalThis.importScripts = () => {};
