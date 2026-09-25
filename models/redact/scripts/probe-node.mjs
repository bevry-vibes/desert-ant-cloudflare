// Node probe: runs the same wiring as the redact worker, without workerd.
// Purpose: decide whether the inference stall inside the Swift wasm core is a
// workerd problem or a problem of the SDK's browser build itself, and record
// real redaction outputs and timings.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as litert from "@litertjs/core";
import { createWasmSdk, makeModelHostSeam, wasmCore } from "@desert-ant-labs/core";
import { defaultBrowserSetup } from "../node_modules/@desert-ant-labs/redact/dist/platforms/browser.js";
import { instantiate as instantiateRedactCore } from "../node_modules/@desert-ant-labs/redact/dist/instantiate.js";
import { decodeRedaction, encodeInput, encodeOptions } from "../node_modules/@desert-ant-labs/redact/codec.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const modelDir = path.resolve(here, "..");

// Minimal browser-ish globals for the emscripten glue, mirroring the workerd
// bootstrap: no importScripts, no document, and a self.location to read.
if (typeof globalThis.self === "undefined") globalThis.self = globalThis;
if (typeof globalThis.importScripts !== "function") globalThis.importScripts = () => {};
if (typeof self.location === "undefined") {
	self.location = { href: "https://bundled.invalid/litert_wasm_compat_internal.js" };
}

const { ModuleFactory } = await import("../src/vendor-litert-glue.js");
const litertModule = await WebAssembly.compile(
	await readFile(path.join(modelDir, "node_modules/@litertjs/core/wasm/litert_wasm_compat_internal.wasm")),
);
self.ModuleFactory = ModuleFactory;
self.Module = {
	instantiateWasm(imports, success) {
		const instance = new WebAssembly.Instance(litertModule, imports);
		success(instance, litertModule);
		return instance.exports;
	},
};

const redactCoreModule = await WebAssembly.compile(
	await readFile(path.join(modelDir, "node_modules/@desert-ant-labs/redact/dist/RedactWeb.wasm")),
);
console.log("RedactWeb.wasm compiled");

const seam = makeModelHostSeam();
const t0 = Date.now();
const setup = await defaultBrowserSetup({
	module: redactCoreModule,
	getImports: () => seam.imports,
});
const { exports } = await instantiateRedactCore({
	module: redactCoreModule,
	wasi: setup.wasi,
	getImports: () => seam.imports,
});
console.log(`core instantiated in ${Date.now() - t0}ms`, JSON.stringify(exports.modelInfo()));

await createWasmSdk({
	platform: {
		setupCore: async () => ({ exports, installHost: seam.install }),
		defaultWasmDir: async () => "https://cdn.jsdelivr.net/npm/@litertjs/core/wasm/",
		readModelSource: async (source) => source,
		defaultCacheRoot: async () => "",
	},
	packageName: "@desert-ant-labs/redact",
});

await litert.loadLiteRt("/bundled/litert_wasm_compat_internal.js");
console.log("litert ready");

const weightsDir = path.join(modelDir, "assets/weights");
const modelBytes = new Uint8Array(await readFile(path.join(weightsDir, "redact.tflite")));
const sidecars = {
	"labels.json": new Uint8Array(await readFile(path.join(weightsDir, "labels.json"))),
	"redact_tokenizer.bin": new Uint8Array(await readFile(path.join(weightsDir, "redact_tokenizer.bin"))),
};

const t1 = Date.now();
const model = await litert.loadAndCompile(modelBytes, { accelerator: "wasm" });
console.log(`tflite compiled in ${Date.now() - t1}ms`);

// The model host the wasm core calls into, mirroring makeLiteRtHost with the
// accelerator pinned to "wasm".
seam.install({
	createSessionFromPath: async () => {
		throw new Error("createSessionFromPath not used in this probe");
	},
	createSessionFromBytes: async () => {
		throw new Error("createSessionFromBytes not used in this probe");
	},
	run: async (inputs) => {
		const feeds = {};
		const made = [];
		for (const [name, t] of Object.entries(inputs)) {
			const bytes = t.data.slice();
			const Ctor =
				t.type === "int32" ? Int32Array : t.type === "float32" ? Float32Array : Uint8Array;
			const tensor = new litert.Tensor(new Ctor(bytes.buffer), Array.from(t.dims));
			feeds[name] = tensor;
			made.push(tensor);
		}
		const started = Date.now();
		const results = await model.run(feeds);
		console.log(`inference took ${Date.now() - started}ms`);
		const outputs = {};
		const toDelete = [...made];
		for (const [name, out] of Object.entries(results)) {
			const arr = out.toTypedArray();
			outputs[name] = {
				data: new Uint8Array(arr.buffer.slice(arr.byteOffset, arr.byteOffset + arr.byteLength)),
				dims: Array.from(out.type.layout.dimensions),
				type: out.type.dtype,
			};
			toDelete.push(out);
		}
		for (const tensor of toDelete) tensor.delete();
		return outputs;
	},
});

const core = wasmCore(exports);
const handle = exports.createSelfHosted(sidecars);
await core.download(handle, () => {});
console.log("handle ready, isDownloaded:", core.isDownloaded(handle));

const CASES = [
	"Email Anna Wijaya at anna.wijaya@example.com or call +62 812-3456-7890 about the invoice.",
	"Hubungi Budi Santoso di budi.santoso@contoh.co.id atau telepon 0812-3456-7890. Alamat: Jalan Pemuda 12, Pati.",
	"Maria Silva lives at 221B Baker Street, London NW1 6XE. Card 4111 1111 1111 1111 is on file.",
	"The meeting starts at nine and the agenda is attached.",
];

for (const text of CASES) {
	const started = Date.now();
	const reader = await core.run(handle, encodeInput(text), encodeOptions({ minimumConfidence: 0.6, labels: [] }), null, null);
	const result = decodeRedaction(reader);
	const ms = Date.now() - started;
	console.log(`\n--- ${ms}ms ---\n${text}`);
	console.log(`redacted: ${result.redactedText}`);
	console.log(`items: ${JSON.stringify(result.items.map(({ label, original, placeholder, confidence }) => ({ label, original, placeholder, confidence })))}`);
}
process.exit(0);
