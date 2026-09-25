// Desert Ant Labs moderator inside workerd.
// moderator scores images for nudity. It takes RGB(A) pixels, never text.
//
// workerd disallows compiling wasm bytes at runtime ("Wasm code generation
// disallowed by embedder"), so both wasm binaries are bundled as precompiled
// modules through the CompiledWasm rule and instantiated with runtime imports:
//   - the Desert Ant wasm core instantiates through the package's own
//     instantiate.js and WASI shim, fed the bundled module,
//   - LiteRT.js is injected through the official `litert` option, with its
//     instantiateWasm hook instantiating the bundled LiteRT module,
//   - the model weights come from MODEL_BASE_URL through the official
//     `modelBaseUrl` option. Weights are bytes, not wasm, so they face no code
//     generation limit.
// Only the small fixtures ride the ASSETS binding, because a 43.9 MiB asset
// exceeds the 25 MiB Workers asset limit.
import "./shims.js";
import { env } from "cloudflare:workers";
import jpeg from "jpeg-js";
import * as liteRt from "@litertjs/core";
// the CompiledWasm rule matches import specifiers, not resolved files, so the
// wasm imports must be relative paths ending in .wasm; a bare package subpath
// such as "@litertjs/core/wasm/...wasm" would miss the glob and fall through
// to esbuild, which has no .wasm loader
import litertWasmModule from "../node_modules/@litertjs/core/wasm/litert_wasm_internal.wasm";
import moderatorCoreModule from "../node_modules/@desert-ant-labs/moderator/dist/ModeratorWeb.wasm";
import ModuleFactory from "./generated/litert_wasm_internal.mjs";
import { createWasmSdk, makeModelHostSeam } from "@desert-ant-labs/core";
import { makeModerator } from "@desert-ant-labs/moderator/moderator.js";
import { instantiate } from "@desert-ant-labs/moderator/dist/instantiate.js";
import { defaultBrowserSetup } from "@desert-ant-labs/moderator/dist/platforms/browser.js";

const PACKAGE_NAME = "@desert-ant-labs/moderator";
// any hostname works with an assets binding; only the path matters, and it is
// relative to the assets directory root (./assets, which holds fixtures/)
const ASSET_BASE = "https://assets.local";

async function fetchAsset(path) {
	const res = await env.ASSETS.fetch(`${ASSET_BASE}/${path}`);
	if (!res.ok) throw new Error(`asset ${path}: HTTP ${res.status}`);
	return new Uint8Array(await res.arrayBuffer());
}

// LiteRT.js runs its emscripten factory through this hook. The runtime wasm is
// bundled, so the hook only instantiates the precompiled module with the
// factory's imports. The factory itself is bundled and registered on self, so
// the loader's importScripts no-op in shims.js finds it in place.
	self.ModuleFactory = ModuleFactory;
	self.Module = {
		instantiateWasm: (info, successCallback) => {
			stage("litert instantiateWasm hook entered");
			return WebAssembly.instantiate(litertWasmModule, info).then((settled) => {
				stage("litert wasm instantiated");
				// workerd resolves the module+imports overload to the instance
				// itself, while browsers resolve to { module, instance }
				const instance = settled.instance ?? settled;
				try {
					successCallback(instance, settled.module ?? litertWasmModule);
					stage("litert receiveInstance callback returned");
				} catch (error) {
					stage(`litert receiveInstance threw: ${String(error?.message ?? error)}`);
					console.error("[litert receiveInstance error]", String(error?.stack ?? error));
					throw error;
				}
				return instance.exports;
			});
		},
		onRuntimeInitialized: () => stage("litert onRuntimeInitialized fired"),
		print: (text) => console.log("[litert]", text),
		printErr: (text) => console.error("[litert:err]", text),
	};
	// wrap the factory, so the stages bracket the emscripten run() lifecycle
	const glueFactory = ModuleFactory;
	self.ModuleFactory = (moduleArg) => {
		stage("glue factory called");
		return Promise.resolve(glueFactory(moduleArg)).then((module) => {
			stage("glue factory resolved");
			return module;
		});
	};

// what the wasm core reports about its model, captured during setup
let modelInfo = null;

// The platform seam createWasmSdk would normally get from the package's
// #platform import, bound here to the bundled core module instead of a
// runtime-fetched one.
const platform = {
	async setupCore() {
		const seam = makeModelHostSeam();
		stage("setupCore: instantiating the bundled 46 MB wasm core");
		const setup = await defaultBrowserSetup({
			module: moderatorCoreModule,
			getImports: () => seam.imports,
			onStdoutLine: (line) => console.log("[moderator core]", line),
			onStderrLine: (line) => console.error("[moderator core:err]", line),
		});
		const { exports } = await instantiate(setup);
		stage("setupCore: wasm core exports ready");
		try {
			modelInfo = exports.modelInfo();
		} catch {
			modelInfo = null;
		}
		return { exports, installHost: seam.install };
	},
	defaultWasmDir: async () => "",
	readModelSource: async (source) => source,
	defaultCacheRoot: async () => "",
};

// the 46 MB core compiles on the first load, so every route stays diagnostic
let sdkPromise = null;
let moderatorPromise = null;
let coreMs = null;
let modelMs = null;
// records the load stages, so a hang shows how far the chain got
const stages = [];
function stage(name) {
	stages.push(`${name} @ ${Math.round(performance.now())}ms`);
	console.log("[stage]", name);
}

function getSdk() {
	if (sdkPromise) return sdkPromise;
	const started = performance.now();
	sdkPromise = createWasmSdk({ platform, packageName: PACKAGE_NAME }).then((sdk) => {
		coreMs = Math.round(performance.now() - started);
		return sdk;
	});
	sdkPromise.catch(() => {
		sdkPromise = null;
	});
	return sdkPromise;
}

function loadModerator() {
	if (moderatorPromise) return moderatorPromise;
	const started = performance.now();
	moderatorPromise = (async () => {
		const sdk = await getSdk();
		stage("core instantiated");
		// makeModerator builds the public class over the loaded sdk; its load()
		// calls sdk.open and wraps the result, so analyze() exists on it
		const Moderator = makeModerator(sdk);
		const moderator = await Moderator.load({
			// the litert option bypasses the browser guard and the dynamic import
			litert: liteRt,
			modelBaseUrl: env.MODEL_BASE_URL,
			accelerator: "wasm",
		});
		stage("model open complete");
		modelMs = Math.round(performance.now() - started);
		return moderator;
	})();
	moderatorPromise.catch(() => {
		moderatorPromise = null;
	});
	return moderatorPromise;
}

function decodeFixture(bytes) {
	// jpeg-js is pure JavaScript, so it decodes inside workerd; workerd has no
	// createImageBitmap or OffscreenCanvas for the SDK to use
	return jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true });
}

// a solid mid-grey frame, as a decoder-free control for the pipeline
function syntheticPixels(size = 64) {
	return { data: new Uint8Array(size * size * 4).fill(128), width: size, height: size };
}

const round = (ms) => Math.round(ms * 1000) / 1000;

const json = (data, status = 200) =>
	new Response(JSON.stringify(data, null, 1), {
		status,
		headers: { "content-type": "application/json" },
	});

function fail(url, error) {
	return json(
		{
			ok: false,
			route: url.pathname,
			error: String(error?.message ?? error),
			stack: String(error?.stack ?? "").slice(0, 800),
			stages,
		},
		500,
	);
}

export default {
	async fetch(request) {
		const url = new URL(request.url);
		try {
			if (url.pathname === "/") {
				return json({
					ok: true,
					model: "moderator",
					loaded: moderatorPromise !== null,
					coreMs,
					modelMs,
					modelInfo,
					stages,
					routes: [
						"/",
						"/warm",
						"/analyze?img=benign&quality=fast|balanced|accurate&policy=standard|allowTopless",
						"/analyze?text=... (documents the image-only input contract)",
					],
				});
			}
			if (url.pathname === "/warm") {
				const wasCold = moderatorPromise === null;
				const moderator = await loadModerator();
				const analyzeStart = performance.now();
				const sample = await moderator.analyze(syntheticPixels(), { quality: "fast" });
				const analyzeMs = round(performance.now() - analyzeStart);
				return json({
					ok: true,
					cold: wasCold,
					coreMs,
					modelMs,
					analyzeMs,
					sample: { score: sample.score, isNSFW: sample.isNSFW },
				});
			}
			if (url.pathname === "/analyze") {
				const text = url.searchParams.get("text");
				if (text !== null) {
					// the input contract is pixels only; record whatever happens
					const moderator = await loadModerator();
					const analyzeStart = performance.now();
					try {
						const result = await moderator.analyze(text, { quality: "fast" });
						return json({ ok: true, accepted: true, unexpected: "text was accepted", result });
					} catch (error) {
						return json({
							ok: true,
							accepted: false,
							contract: "pixels only",
							error: String(error?.message ?? error),
							analyzeMs: round(performance.now() - analyzeStart),
						});
					}
				}
				const img = url.searchParams.get("img");
				if (!img) return json({ ok: false, error: "pass img=benign or text=..." }, 400);
				const quality = url.searchParams.get("quality") ?? "accurate";
				const policy = url.searchParams.get("policy") ?? "standard";
				const thresholdParam = url.searchParams.get("threshold");
				const wasCold = moderatorPromise === null;
				const moderator = await loadModerator();
				const assetStart = performance.now();
				const bytes = await fetchAsset(`fixtures/${img}.jpg`);
				const assetMs = round(performance.now() - assetStart);
				const decodeStart = performance.now();
				const pixels = decodeFixture(bytes);
				const decodeMs = round(performance.now() - decodeStart);
				const analyzeStart = performance.now();
				const options = { quality, policy };
				if (thresholdParam !== null) options.threshold = Number(thresholdParam);
				const result = await moderator.analyze(pixels, options);
				const analyzeMs = round(performance.now() - analyzeStart);
				return json({
					ok: true,
					img,
					bytes: bytes.length,
					width: pixels.width,
					height: pixels.height,
					quality,
					policy,
					threshold: thresholdParam === null ? 0.5 : Number(thresholdParam),
					score: result.score,
					isNSFW: result.isNSFW,
					regions: result.regions,
					cold: wasCold,
					assetMs,
					decodeMs,
					analyzeMs,
				});
			}
			return json({ ok: false, error: "unknown route" }, 404);
		} catch (error) {
			return fail(url, error);
		}
	},
};
