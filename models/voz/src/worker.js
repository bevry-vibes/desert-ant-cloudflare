// desert-ant-voz: the Desert Ant Labs voz model (speech recognition) inside
// the Cloudflare workerd runtime.
//
// The SDK's default import is the browser/WebAssembly path: a Swift core
// compiled to WebAssembly (VozWeb.wasm, BridgeJS bindings) over three ONNX
// Runtime Web sessions (mel, encoder, decoder). This worker composes the same
// path with workerd seams:
//
// 1. The wasm core rides the worker module graph as a pre-compiled module
//    (CompiledWasm rule in wrangler.jsonc). workerd forbids wasm code
//    generation from runtime bytes, and the assets pipeline rejects files over
//    25 MiB even in local dev.
// 2. The ONNX Runtime Web module is bundled and passed to the SDK explicitly,
//    the way a Node caller passes onnxruntime-node.
// 3. Bundle files are fetched from the Hugging Face Hub through a custom
//    `makeFetchFile`, with per-file sizes logged, so a failure names the file
//    that caused it.
//
// The weights are huge (the encoder's external data alone is 349 MB and the
// resident set is about 1.19 GB), which is above the 128 MB Workers isolate
// limit; the routes below are built to isolate each stage of that failure.

import { makeVoz } from "../node_modules/@desert-ant-labs/voz/voz.js";
import { instantiate } from "../node_modules/@desert-ant-labs/voz/dist/instantiate.js";
import { defaultBrowserSetup } from "../node_modules/@desert-ant-labs/voz/dist/platforms/browser.js";
import { decodeWav, mixdownMono, resampleLinear } from "@desert-ant-labs/core/audio";
import vozCoreModule from "../node_modules/@desert-ant-labs/voz/dist/VozWeb.wasm";

const PACKAGE_NAME = "@desert-ant-labs/voz";

const json = (data, status = 200) =>
	new Response(JSON.stringify(data, null, "\t") + "\n", {
		status,
		headers: { "content-type": "application/json" },
	});

/// Boot state: the wasm core's exports and, after a successful load, the
/// transcriber. `steps` records how far the last boot reached.
const state = {
	exports: null,
	coreBooted: false,
	voz: null,
	loadMs: null,
	steps: {},
};

/// The `#platform` seam the SDK's browser path expects, built for workerd.
async function setupCore() {
	const { makeModelHostSeam } = await import("@desert-ant-labs/core");
	const seam = makeModelHostSeam();
	const setup = await defaultBrowserSetup({
		module: vozCoreModule,
		getImports: () => seam.imports,
	});
	const { exports } = await instantiate(setup);
	state.exports = exports;
	return { exports };
}

const platform = {
	setupCore,

	/// The bundled ONNX Runtime Web. The Node SDK demands onnxruntime-node
	/// (a native addon, impossible here); the browser default is the same
	/// package this worker imports.
	defaultRuntime: async () => {
		state.steps.ortImport = "start";
		const ort = await import("onnxruntime-web");
		state.steps.ortImport = "done";
		console.log(`[voz] onnxruntime-web ${ort.env?.version ?? "?"} imported`);
		return ort;
	},

	/// No navigator.gpu in workerd: the CPU ("wasm") execution provider.
	bestProvider: async () => "wasm",

	defaultOrtWasmDir: async () => undefined,

	/// Fetch bundle files from the Hub. Every file is logged with its size, so
	/// a failure names the file that caused it. `cache` is ignored: workerd
	/// has no persistent store, so every cold start pays the download.
	makeFetchFile: ({ info, revision, cache, onProgress }) => {
		let done = 0;
		const names = new Set();
		return async (url, name) => {
			names.add(name);
			const started = performance.now();
			console.log(`[voz] fetch ${name} (${url})`);
			const response = await fetch(url);
			if (!response.ok) {
				throw new Error(`voz: ${name} -> HTTP ${response.status}`);
			}
			const bytes = new Uint8Array(await response.arrayBuffer());
			const ms = Math.round(performance.now() - started);
			state.steps[`file:${name}`] = `${bytes.byteLength} bytes in ${ms} ms`;
			console.log(`[voz] fetched ${name}: ${bytes.byteLength} bytes in ${ms} ms`);
			onProgress?.(++done / Math.max(names.size, 1));
			return bytes;
		};
	},

	/// Samples are handed over directly; no Blob streaming needed.
	asBlob: async () => null,

	/// Portable WAV decode (mono 16 kHz), from the SDK family's own codec.
	decodeAudio: async (bytes, sampleRate) => {
		const decoded = decodeWav(bytes);
		return resampleLinear(mixdownMono(decoded.samples, decoded.channels), decoded.sampleRate, sampleRate);
	},

	pageUrl: () => "https://localhost/",
};

async function bootCore() {
	if (state.coreBooted) return state;
	// Wrangler dev injects a partial `process` global; emscripten's Node
	// detection reads it and then demands __dirname. A deployed worker has
	// neither global, so drop the shim before any emscripten code runs.
	try { delete globalThis.process; } catch { state.steps.processShimStuck = true; }
	globalThis.location ??= { href: "https://localhost/VozWeb.wasm" };
	state.coreBooted = true;
	return state;
}

/// The decisive workerd probe: can this isolate compile wasm at runtime? ONNX
/// Runtime Web has to do exactly this for its own backend library.
function wasmCodegenProbe() {
	try {
		const empty = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
		const module = new WebAssembly.Module(empty);
		return { ok: true, detail: `compiled ${module instanceof WebAssembly.Module ? "a module" : "?"}` };
	} catch (cause) {
		return { ok: false, error: String(cause?.message ?? cause), name: cause?.name };
	}
}

async function loadOrt() {
	const ort = await import("onnxruntime-web");
	return {
		imported: true,
		version: ort.env?.version ?? null,
		backend: ort.env?.wasm?.backend ?? null,
		numThreads: ort.env?.wasm?.numThreads ?? null,
	};
}

export default {
	async fetch(request, env) {
		const url = new URL(request.url);
		const started = performance.now();

		try {
			if (request.method === "GET" && url.pathname === "/health") {
				return json({
					worker: "desert-ant-voz",
					coreBooted: state.coreBooted,
					loaded: state.voz != null,
					loadMs: state.loadMs,
					steps: state.steps,
				});
			}

			// The wasm core alone: catalog, revision, file list, and the runtime
			// capability probes that decide everything else.
			if (request.method === "GET" && url.pathname === "/info") {
				await bootCore();
				const info = platform.setupCore().then(() => state.exports.modelInfo());
				return json({
					worker: "desert-ant-voz",
					modelInfo: await info,
					wasmCodegenProbe: wasmCodegenProbe(),
					ort: await loadOrt().catch((cause) => ({ imported: false, error: String(cause?.message ?? cause) })),
					requestMs: Math.round(performance.now() - started),
				});
			}

			// ONNX Runtime session probe: the smallest graph in the bundle
			// (decoder.onnx, 24 MB). If ORT cannot initialise its wasm backend in
			// workerd, this names the exact error without the 349 MB download.
			if (request.method === "POST" && url.pathname === "/ort-session") {
				await bootCore();
				const ort = await import("onnxruntime-web");
				const started2 = performance.now();
				const response = await fetch("https://huggingface.co/desert-ant-labs/voz/resolve/main/web/decoder.onnx");
				if (!response.ok) return json({ error: `decoder.onnx -> HTTP ${response.status}` }, 502);
				const bytes = new Uint8Array(await response.arrayBuffer());
				const fetchedMs = Math.round(performance.now() - started2);
				try {
					const session = await ort.InferenceSession.create(bytes, {
						executionProviders: ["wasm"],
						graphOptimizationLevel: "disabled",
					});
					return json({
						ok: true,
						inputNames: session.inputNames,
						fetchedMs,
						requestMs: Math.round(performance.now() - started),
					});
				} catch (cause) {
					return json({
						ok: false,
						stage: "InferenceSession.create (decoder.onnx, wasm EP)",
						fetchedMs,
						error: String(cause?.message ?? cause),
						name: cause?.name,
						requestMs: Math.round(performance.now() - started),
					}, 500);
				}
			}

			// The full SDK load: fetch every bundle file, compile the three
			// graphs, wire the core. This is where the 349 MB encoder weights
			// meet the isolate memory limit.
			if (request.method === "POST" && url.pathname === "/load") {
				await bootCore();
				state.steps.bind = "start";
				const sdkExports = (await platform.setupCore()).exports;
				state.steps.bind = "done";
				const info = sdkExports.modelInfo();
				// No modelBaseUrl: the SDK builds the Hub URL from the pinned repo
				// and revision the wasm core reports in modelInfo().
				const Voz = makeVoz(platform);
				const t0 = performance.now();
				state.voz = await Voz.load({
					ort: await import("onnxruntime-web"),
					ep: "wasm",
					cache: false,
				});
				state.loadMs = Math.round(performance.now() - t0);
				return json({
					worker: "desert-ant-voz",
					loaded: true,
					loadMs: state.loadMs,
					steps: state.steps,
					requestMs: Math.round(performance.now() - started),
				});
			}

			if (request.method === "POST" && url.pathname === "/transcribe") {
				if (!state.voz) {
					return json({ error: "not loaded; POST /load first" }, 503);
				}
				const bytes = new Uint8Array(await request.arrayBuffer());
				if (!bytes.length) return json({ error: "empty body; send a WAV file" }, 400);
				const audio = toMono16k(bytes);
				const t0 = performance.now();
				// Samples are already mono 16 kHz, so no resample option needed.
				const result = await state.voz.transcribe(audio.samples);
				return json({
					name: url.searchParams.get("name") ?? "upload",
					text: result.text,
					words: result.words,
					duration: result.duration,
					processingTime: result.processingTime,
					realtimeFactor: result.realtimeFactor,
					timings: state.voz.timings,
					audio: {
						sampleRate: audio.sampleRate,
						channels: audio.channels,
						samples: audio.samples.length,
						seconds: Math.round(audio.samples.length / 160) / 100,
					},
					transcribeMs: Math.round(performance.now() - t0),
					requestMs: Math.round(performance.now() - started),
				});
			}

			return json({ error: "unknown route" }, 404);
		} catch (cause) {
			return json({
				error: String(cause?.message ?? cause),
				name: cause?.name,
				stack: String(cause?.stack ?? "").split("\n").slice(0, 6),
				steps: state.steps,
				requestMs: Math.round(performance.now() - started),
			}, 500);
		}
	},
};

/// WAV bytes -> mono 16 kHz Float32Array, via the SDK family's portable codec.
function toMono16k(bytes) {
	const decoded = decodeWav(bytes);
	const mono = mixdownMono(decoded.samples, decoded.channels);
	return {
		samples: resampleLinear(mono, decoded.sampleRate, 16000),
		sampleRate: decoded.sampleRate,
		channels: decoded.channels,
	};
}
