// Desert Ant Labs Clear on Cloudflare workerd: speech enhancement (denoise,
// dereverb, loudness normalise).
//
// The stock browser entry of @desert-ant-labs/clear cannot run here, because
// LiteRT.js initialises through importScripts or a <script> tag and workerd
// has neither. This worker wires the same SDK pieces by hand:
//
// 1. Instantiate the Swift core (ClearWeb.wasm) through the package's own
//    BridgeJS and WASI shim entry, from a CompiledWasm module import.
// 2. Initialise LiteRT.js through src/litert-workerd.js.
// 3. Fetch clear-studio.tflite from the Hugging Face Hub, verify its sha256
//    against the core's pinned manifest hash, compile it in LiteRT.js, and
//    hand the (empty) sidecar set to the core with createSelfHosted().
//
// The tflite lives on the Hub rather than in assets because it is 47 MiB,
// above the 25 MiB per-asset ceiling that wrangler enforces.
//
// Every stage reports its duration, so the numbers land in RESULTS.md.

import { wasmCore, makeLiteRtHost, makeModelHostSeam, readyModel } from "@desert-ant-labs/core";
import { decodeWav, mixdownMono } from "@desert-ant-labs/core/audio";
import * as coreEntry from "../node_modules/@desert-ant-labs/clear/dist/index.js";
import { makeClear } from "../node_modules/@desert-ant-labs/clear/clear.js";
import clearCoreModule from "../node_modules/@desert-ant-labs/clear/dist/ClearWeb.wasm";
import { loadLiteRtWorkerd } from "./litert-workerd.js";

const PACKAGE_NAME = "@desert-ant-labs/clear";
const SDK_VERSION = "3.5.0";
const MODEL_URL = "https://huggingface.co/desert-ant-labs/clear/resolve/main/clear-studio.tflite";
// sha256 of the pinned artifact, as reported by the core's own Hub download.
const ARTIFACT_SHA256 = "fe2438e4e1137455298321ca952c5d3a4d7dde27eca6b8a495789723212fc79f";

// One enhancement session per isolate. The first request pays the cold load.
let sessionPromise = null;

function getSession(env, origin) {
	sessionPromise ??= loadSession(env, origin);
	return sessionPromise;
}

async function loadSession(env, origin) {
	const timings = { coldLoadMs: 0 };
	const started = performance.now();

	const seam = makeModelHostSeam();
	const instantiating = performance.now();
	const { exports } = await coreEntry.init({
		module: clearCoreModule,
		getImports: () => seam.imports,
	});
	timings.instantiateCoreMs = elapsed(instantiating);

	const core = wasmCore(exports);
	const info = exports.modelInfo();

	const downloading = performance.now();
	const modelBytes = await downloadModel();
	timings.downloadModelMs = elapsed(downloading);

	const bootingLitert = performance.now();
	const { litert, ms: litertMs, relaxedSimd } = await loadLiteRtWorkerd(origin);
	timings.initLitertMs = litertMs;
	timings.relaxedSimd = relaxedSimd;

	const { host, setModel } = makeLiteRtHost({
		accelerator: "wasm",
		loadAndCompile: litert.loadAndCompile,
		Tensor: litert.Tensor,
		readModelSource: async (source) => source,
	});
	seam.install(host);

	const compiling = performance.now();
	setModel(await litert.loadAndCompile(modelBytes, { accelerator: "wasm" }));
	timings.compileModelMs = elapsed(compiling);

	const sidecars = {};
	for (const name of info.sidecars) sidecars[name] = new Uint8Array();
	const handle = core.createSelfHosted(sidecars);
	const model = await readyModel({ core, packageName: PACKAGE_NAME, handle });
	const Clear = makeClear({ core, open: async () => model });

	timings.coldLoadMs = elapsed(started);
	return { clear: new Clear(model), core, info, timings };
}

async function downloadModel() {
	const response = await fetch(MODEL_URL);
	if (!response.ok) {
		throw new Error(`model download returned ${response.status}`);
	}
	const bytes = new Uint8Array(await response.arrayBuffer());
	const observed = await sha256Hex(bytes);
	if (observed !== ARTIFACT_SHA256) {
		throw new Error(`artifact hash mismatch: expected ${ARTIFACT_SHA256}, got ${observed}`);
	}
	return bytes;
}

async function assetBytes(env, origin, path) {
	const response = await env.ASSETS.fetch(`${origin}${path}`);
	if (!response.ok) {
		throw new Error(`asset ${path} returned ${response.status}`);
	}
	return new Uint8Array(await response.arrayBuffer());
}

async function sha256Hex(bytes) {
	const digest = await crypto.subtle.digest("SHA-256", bytes);
	return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function elapsed(since) {
	return Math.round((performance.now() - since) * 100) / 100;
}

// ------------------------------------------------------------ audio helpers

/** Decode a WAV body to one mono Float32Array at the file's own sample rate. */
function decodeToMono(bytes) {
	const decoded = decodeWav(bytes);
	const mono = decoded.channels === 1 ? decoded.samples : mixdownMono(decoded.samples, decoded.channels);
	return { samples: mono, sampleRate: decoded.sampleRate, channels: decoded.channels };
}

/** Encode mono float samples as a 16-bit PCM WAV file at 48 kHz. */
function encodeWavPcm16(samples, sampleRate) {
	const dataBytes = samples.length * 2;
	const buffer = new ArrayBuffer(44 + dataBytes);
	const view = new DataView(buffer);
	const ascii = (offset, text) => {
		for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
	};
	ascii(0, "RIFF");
	view.setUint32(4, 36 + dataBytes, true);
	ascii(8, "WAVE");
	ascii(12, "fmt ");
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true);
	view.setUint16(22, 1, true);
	view.setUint32(24, sampleRate, true);
	view.setUint32(28, sampleRate * 2, true);
	view.setUint16(32, 2, true);
	view.setUint16(34, 16, true);
	ascii(36, "data");
	view.setUint32(40, dataBytes, true);
	let offset = 44;
	for (let i = 0; i < samples.length; i++) {
		const clamped = Math.max(-1, Math.min(1, samples[i]));
		view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
		offset += 2;
	}
	return new Uint8Array(buffer);
}

// -------------------------------------------------------------------- matrix

const FIXTURES = [
	{ name: "clean", path: "/fixtures/jfk-16k-mono-3s.wav" },
	{ name: "noisy", path: "/fixtures/jfk-16k-mono-3s-noisy.wav" },
];

async function runMatrix(env, origin) {
	const { clear } = await getSession(env, origin);
	const results = {};
	const matrixStarted = performance.now();
	for (const fixture of FIXTURES) {
		const bytes = await assetBytes(env, origin, fixture.path);
		const input = decodeToMono(bytes);
		const started = performance.now();
		const result = await clear.enhance(input.samples, input.sampleRate);
		const enhanceMs = elapsed(started);
		results[fixture.name] = {
			input: {
				wavBytes: bytes.byteLength,
				samples: input.samples.length,
				sampleRate: input.sampleRate,
				channels: input.channels,
				durationSec: Math.round((input.samples.length / input.sampleRate) * 1000) / 1000,
			},
			output: {
				sampleRate: result.sampleRate,
				samples: result.samples.length,
				wavBytesEstimate: 44 + result.samples.length * 2,
				durationSec: Math.round(result.durationSec * 1000) / 1000,
				firstSamples: Array.from(result.samples.slice(0, 8)).map((v) => Math.round(v * 1e4) / 1e4),
			},
			metrics: {
				measuredLUFS: result.measuredLUFS,
				measuredTruePeakDBFS: result.measuredTruePeakDBFS,
				processingSec: Math.round(result.processingSec * 1e4) / 1e4,
				realtimeFactor: Math.round(result.realtimeFactor * 100) / 100,
			},
			enhanceMs,
		};
	}
	return {
		fixtures: results,
		matrixMs: elapsed(matrixStarted),
	};
}

// -------------------------------------------------------------------- routes

function jsonResponse(data, status = 200) {
	return new Response(JSON.stringify(data, null, "\t"), {
		status,
		headers: { "content-type": "application/json" },
	});
}

export default {
	async fetch(request, env) {
		const origin = new URL(request.url).origin;
		const { pathname, searchParams } = new URL(request.url);
		try {
			if (request.method === "GET" && pathname === "/") {
				return jsonResponse({
					model: "clear",
					sdkVersion: SDK_VERSION,
					runtime: "workerd",
					routes: ["/", "/health", "/model-info", "POST /enhance", "/matrix"],
				});
			}

			if (request.method === "GET" && pathname === "/health") {
				const session = await getSession(env, origin);
				return jsonResponse({
					ready: true,
					modelInfo: session.info,
					isDownloaded: session.clear.isDownloaded(),
					timings: session.timings,
				});
			}

			if (request.method === "GET" && pathname === "/model-info") {
				const session = await getSession(env, origin);
				return jsonResponse({ modelInfo: session.info, timings: session.timings });
			}

			if (request.method === "POST" && pathname === "/enhance") {
				const body = new Uint8Array(await request.arrayBuffer());
				if (body.byteLength === 0) {
					return jsonResponse({ error: "send a WAV file as the request body" }, 400);
				}
				const input = decodeToMono(body);
				const { clear } = await getSession(env, origin);
				const started = performance.now();
				const result = await clear.enhance(input.samples, input.sampleRate);
				const enhanceMs = elapsed(started);
				const meta = {
					input: { samples: input.samples.length, sampleRate: input.sampleRate, channels: input.channels },
					output: {
						sampleRate: result.sampleRate,
						samples: result.samples.length,
						durationSec: Math.round(result.durationSec * 1000) / 1000,
					},
					metrics: {
						measuredLUFS: result.measuredLUFS,
						measuredTruePeakDBFS: result.measuredTruePeakDBFS,
						processingSec: Math.round(result.processingSec * 1e4) / 1e4,
						realtimeFactor: Math.round(result.realtimeFactor * 100) / 100,
					},
					enhanceMs,
				};
				if (searchParams.has("meta")) {
					return jsonResponse(meta);
				}
				const wav = encodeWavPcm16(result.samples, result.sampleRate);
				return new Response(wav, {
					headers: {
						"content-type": "audio/wav",
						"x-enhance-meta": JSON.stringify(meta),
					},
				});
			}

			if (request.method === "GET" && pathname === "/matrix") {
				return jsonResponse(await runMatrix(env, origin));
			}

			return jsonResponse({ error: `no route for ${request.method} ${pathname}` }, 404);
		} catch (error) {
			return jsonResponse({
				error: String(error?.message ?? error),
				stack: String(error?.stack ?? "").split("\n").slice(0, 12),
			}, 500);
		}
	},
};
