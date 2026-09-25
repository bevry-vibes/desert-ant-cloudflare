// Node probe: runs the same wiring as the worker, without workerd.
// Purpose: decide whether the inference stall inside the Swift wasm core is a
// workerd problem or a problem of the SDK's browser build itself.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as litert from "@litertjs/core";
import { createWasmSdk, makeModelHostSeam, wasmCore } from "@desert-ant-labs/core";
import { init as initEmoCore } from "../node_modules/@desert-ant-labs/emo/dist/index.js";

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
const litertWasmBytes = await readFile(
	path.join(modelDir, "node_modules/@litertjs/core/wasm/litert_wasm_compat_internal.wasm"),
);
const litertModule = await WebAssembly.compile(litertWasmBytes);

self.ModuleFactory = ModuleFactory;
self.Module = {
	instantiateWasm(imports, success) {
		const instance = new WebAssembly.Instance(litertModule, imports);
		success(instance, litertModule);
		return instance.exports;
	},
};

console.log("compiling EmoWeb.wasm...");
const emoCoreModule = await WebAssembly.compile(
	await readFile(path.join(modelDir, "node_modules/@desert-ant-labs/emo/dist/EmoWeb.wasm")),
);
console.log("EmoWeb.wasm compiled");

const seam = makeModelHostSeam();
const t0 = Date.now();
const { exports } = await initEmoCore({ module: emoCoreModule, getImports: () => seam.imports });
console.log(`core instantiated in ${Date.now() - t0}ms`, JSON.stringify(exports.modelInfo()));

await createWasmSdk({
	platform: {
		setupCore: async () => ({ exports, installHost: seam.install }),
		defaultWasmDir: async () => "https://cdn.jsdelivr.net/npm/@litertjs/core/wasm/",
		readModelSource: async (source) => source,
		defaultCacheRoot: async () => "",
	},
	packageName: "@desert-ant-labs/emo",
}).then(async (sdk) => {
	// createWasmSdk only wires the sdk object; open() is driven manually below.
	void sdk;
});

await litert.loadLiteRt("/bundled/litert_wasm_compat_internal.js");
console.log("litert ready");

const weightsDir = path.join(modelDir, "assets/weights");
const modelBytes = new Uint8Array(await readFile(path.join(weightsDir, "emo.tflite")));
const sidecars = {
	"emo_meta.json": new Uint8Array(await readFile(path.join(weightsDir, "emo_meta.json"))),
	"emo_tokenizer.bin": new Uint8Array(await readFile(path.join(weightsDir, "emo_tokenizer.bin"))),
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
		console.log("host run with", Object.keys(inputs).join(","));
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

// Encode like the package's codec: length-prefixed UTF-8, then u32 limit and
// u32 skinTone.
function encodeInput(text) {
	const bytes = new TextEncoder().encode(text);
	const out = new Uint8Array(4 + bytes.length);
	new DataView(out.buffer).setUint32(0, bytes.length);
	out.set(bytes, 4);
	return out;
}
function encodeOptions(limit, skinTone) {
	const out = new Uint8Array(8);
	new DataView(out.buffer).setUint32(0, limit);
	new DataView(out.buffer).setUint32(4, skinTone);
	return out;
}

const CASES = [
	"finished a marathon today",
	"anak saya lulus ujian",
	"hujan turun sepanjang hari di Pati",
	"first coffee of the morning",
	"account 8822 validation pending review",
];

for (const text of CASES) {
	const started = Date.now();
	const reader = await core.run(handle, encodeInput(text), encodeOptions(3, 0), null, null);
	const count = reader.u32();
	const suggestions = [];
	for (let i = 0; i < count; i++) {
		suggestions.push({ emoji: reader.str(), confidence: reader.f64() });
	}
	console.log(`${Date.now() - started}ms  ${text}\n  -> ${JSON.stringify(suggestions)}`);
}
process.exit(0);
