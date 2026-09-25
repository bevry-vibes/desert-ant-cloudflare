// desert-ant-ear: the Desert Ant Labs ear model (spoken language
// identification) inside the Cloudflare workerd runtime.
//
// The SDK's default import is the browser/WebAssembly path: a Swift core
// compiled to WebAssembly (EarWeb.wasm, BridgeJS bindings) over a LiteRT.js
// (TensorFlow Lite) inference session. That path needs three small seams in
// workerd, and this worker provides all of them:
//
// 1. The wasm binaries (the ear core and the LiteRT.js runtime) ride the
//    worker module graph as pre-compiled modules through the CompiledWasm
//    rule in wrangler.jsonc.
// 2. LiteRT.js loads its emscripten runtime with `importScripts` or a DOM
//    script tag. workerd has neither. The worker preloads the emscripten
//    factory directly (the `.mjs` file is the upstream loader with one added
//    export) and installs a no-op `importScripts`, so LiteRT.js finds the
//    factory already in place.
// 3. The emscripten factory receives the pre-compiled LiteRT module through
//    its `instantiateWasm` hook, because workerd forbids compiling wasm from
//    runtime bytes.
//
// Model weights are not bundled: the wasm core downloads ear.tflite and its
// sidecars from the Hugging Face Hub at the revision pinned inside the SDK,
// and keeps them in memory (the browser cache root is empty).

import { createWasmSdk } from "@desert-ant-labs/core";
import { decodeWav, mixdownMono, resampleLinear } from "@desert-ant-labs/core/audio";
import { makeEar } from "../node_modules/@desert-ant-labs/ear/ear.js";
import { instantiate } from "../node_modules/@desert-ant-labs/ear/dist/instantiate.js";
import { defaultBrowserSetup } from "../node_modules/@desert-ant-labs/ear/dist/platforms/browser.js";
import relaxedFactory from "./litert-wasm-internal-relaxed.mjs";
// Imported as pre-compiled WebAssembly.Modules through the CompiledWasm rule
// in wrangler.jsonc. workerd forbids compiling wasm from runtime bytes
// ("Wasm code generation disallowed by embedder"), and the assets pipeline
// rejects files over 25 MiB (enforced even by wrangler dev), so every wasm
// binary has to ride the module graph. Importing the relaxed-SIMD LiteRT
// binary doubles as the feature probe: a runtime that could not compile it
// would fail the worker at startup, so no separate probe is needed.
import earCoreModule from "../node_modules/@desert-ant-labs/ear/dist/EarWeb.wasm";
import litertWasm from "../node_modules/@litertjs/core/wasm/litert_wasm_internal.wasm";

const PACKAGE_NAME = "@desert-ant-labs/ear";

/// The Hub location of the weights, at the revision the SDK pins (the wasm
/// core downloads v0.1.0 of this repo on its own path; modelInfo() reports the
/// file names, this worker supplies the base).
const HUB_BASE = "https://huggingface.co/desert-ant-labs/ear/resolve/v0.1.0/";

/// The `#platform` seam the SDK's browser path expects, built for workerd.
async function setupCore() {
	const { makeModelHostSeam } = await import("@desert-ant-labs/core");
	const seam = makeModelHostSeam();
	const setup = await defaultBrowserSetup({
		module: earCoreModule,
		getImports: () => seam.imports,
	});
	const { exports } = await instantiate(setup);
	state.exports = exports;
	return { exports, installHost: seam.install };
}

const platform = {
	setupCore,
	defaultWasmDir: async () => "/litert/",
	readModelSource: async (source) => source,
	defaultCacheRoot: async () => "",
};

/// Everything the worker needs after a successful boot.
const state = {
	env: null,
	ear: null,
	sdk: null,
	exports: null,
	loadMs: null,
	steps: {},
};

async function boot(env) {
	if (state.ear) return state;
	state.env = env;
	const t0 = performance.now();

	// 1. The LiteRT.js runtime. Its emscripten factory is preloaded here and
	//    hands it a pre-compiled module through the instantiateWasm hook, so no
	//    DOM, no importScripts, and no wasm code generation at runtime.
	//    Wrangler dev injects a partial `process` global (and emscripten's
	//    Node detection then reads __dirname), and its worker detection sees
	//    workerd's WorkerGlobalScope and reads self.location.href. None of
	//    those globals exist in a deployed worker; stub them so the emscripten
	//    bootstrap stays on the generic path, and drop the process shim so the
	//    Swift core takes its browser (in-memory cache) path rather than
	//    demanding the Node filesystem seam.
	try { delete globalThis.process; } catch { state.steps.processShimStuck = true; }
	state.steps.processShim = "deleted";
	console.log("[ear] process shim deleted");
	// The Swift core reads these globals: verbose HTTP logging, usage
	// telemetry off, and a wrapped fetch so a download attempt is visible.
	globalThis.__dalHttpDebug = true;
	globalThis.__dalUsageDisabled = true;
	const coreFetch = globalThis.fetch;
	globalThis.fetch = (input, init) => {
		console.log(`[ear] fetch ${String(input)}`);
		return coreFetch(input, init).then((response) => {
			console.log(`[ear] fetch ${String(input)} -> ${response.status}`);
			return response;
		}, (cause) => {
			console.log(`[ear] fetch ${String(input)} !! ${cause}`);
			throw cause;
		});
	};
	globalThis.location ??= { href: "https://localhost/litert/litert_wasm_internal.js" };
	globalThis.ModuleFactory = relaxedFactory;
	globalThis.Module = {
		instantiateWasm: (imports, done) => {
			WebAssembly.instantiate(litertWasm, imports)
				.then((instance) => done(instance, instance.exports))
				.catch((cause) => state.steps.litertWasmError = String(cause));
		},
	};
	// LiteRT.js's script loader checks importScripts first. The factory is
	// already in place, so a no-op satisfies the check and skips the DOM path.
	globalThis.importScripts = () => {};
	const litert = await import("@litertjs/core");
	state.steps.litertImport = "done";
	console.log("[ear] litert module imported");
	state.steps.litertWasm = "litert_wasm_internal.wasm (pre-compiled module)";

	// 2. Bind the SDK (this instantiates the wasm core through setupCore) and
	//    load the model. `litert` is passed explicitly: the SDK's own runtime
	//    check demands document or importScripts otherwise.
	state.steps.bind = "start";
	const sdk = await createWasmSdk({ platform, packageName: PACKAGE_NAME });
	state.steps.bind = "done";
	console.log("[ear] sdk bound, loading model");
	const Ear = makeEar(sdk);
	const tLoad = performance.now();
	// The Hub-download path hangs in workerd: the core's Swift URLSession shim
	// stops after the response headers (see RESULTS.md). The self-hosted path
	// fetches the same pinned files on the JS side, compiles the model in
	// LiteRT.js here, and hands only the small sidecars into the core.
	state.ear = await Ear.load({
		litert,
		litertWasmDir: "/litert/",
		modelBaseUrl: HUB_BASE,
	});
	state.steps.loadMs = Math.round(performance.now() - tLoad);
	state.sdk = sdk;
	state.loadMs = Math.round(performance.now() - t0);
	return state;
}

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

const json = (data, status = 200) =>
	new Response(JSON.stringify(data, null, "\t") + "\n", {
		status,
		headers: { "content-type": "application/json" },
	});

export default {
	async fetch(request, env) {
		const url = new URL(request.url);
		const started = performance.now();

		try {
			if (request.method === "GET" && url.pathname === "/health") {
				return json({
					worker: "desert-ant-ear",
					loaded: state.ear != null,
					loadMs: state.loadMs,
					steps: state.steps,
				});
			}

			if (request.method === "GET" && url.pathname === "/load") {
				const s = await boot(env);
				return json({
					worker: "desert-ant-ear",
					loaded: true,
					loadMs: s.loadMs,
					steps: s.steps,
					// The wasm core reports the catalog it was built with.
					modelInfo: s.exports?.modelInfo?.() ?? null,
					requestMs: Math.round(performance.now() - started),
				});
			}

			if (request.method === "POST" && url.pathname === "/identify") {
				await boot(env);
				const bytes = new Uint8Array(await request.arrayBuffer());
				if (!bytes.length) return json({ error: "empty body; send a WAV file" }, 400);
				const audio = toMono16k(bytes);
				const t0 = performance.now();
				const detection = await state.ear.identify(audio.samples, 16000);
				return json({
					name: url.searchParams.get("name") ?? "upload",
					detection,
					audio: {
						sampleRate: audio.sampleRate,
						channels: audio.channels,
						samples: audio.samples.length,
						seconds: Math.round(audio.samples.length / 160) / 100,
					},
					identifyMs: Math.round(performance.now() - t0),
					requestMs: Math.round(performance.now() - started),
				});
			}

			return json({ error: "unknown route" }, 404);
		} catch (cause) {
			return json({
				error: String(cause?.message ?? cause),
				name: cause?.name,
				stack: String(cause?.stack ?? "").split("\n").slice(0, 6),
				requestMs: Math.round(performance.now() - started),
			}, 500);
		}
	},
};

