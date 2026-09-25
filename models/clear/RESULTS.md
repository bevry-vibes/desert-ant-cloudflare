# RESULTS: @desert-ant-labs/clear on Cloudflare workerd

Tested 2026-09-25 with @desert-ant-labs/clear 3.5.0, @desert-ant-labs/core 3.5.0, @litertjs/core 2.5.3, wrangler 4.140.0.

## Verdict

Passes. The audio pipeline survives workerd: the wasm core instantiates, LiteRT.js runs the DeepFilterNet fine-tune on the XNNPACK wasm accelerator, and a 3 second 16 kHz clip is enhanced in about 0.4 s, which is 6.5 to 8 times faster than real time. The 11 second clip runs at 9 times real time. The stock SDK entry does not work in workerd as published, so this worker wires the SDK pieces by hand. See Setup. One deploy-time caveat: the 47 MiB artifact has no local delivery path through wrangler, so the worker fetches it from the Hugging Face Hub at runtime.

## Setup

Clear shares its architecture with @desert-ant-labs/shapes, so the workerd wiring is the same in outline:

- The Swift core (ClearWeb.wasm) enters as a `CompiledWasm` module import and initialises through the package's own `dist/index.js` entry with its BridgeJS runtime and the browser_wasi_shim WASI layer.
- `src/litert-workerd.js` bootstraps the real @litertjs/core: it registers the Emscripten glue on globalThis, neutralises the loader's script step with a no-op `importScripts`, and hands the factory an `instantiateWasm` hook backed by a `CompiledWasm` import of litert_wasm_internal.wasm. The glue is a verbatim copy of the package file with one added export statement (`src/litert-wasm-glue.mjs`), because the stock file is UMD with no exports.
- `src/workerd-shims.js` replaces the global `process` before the glue evaluates, so the glue skips its Node path (which needs `__dirname` and node:fs) under workerd's Node compatibility layer.
- The artifact loads through the SDK's self-hosted path. The worker fetches clear-studio.tflite from the Hugging Face Hub, verifies its sha256 against the core's pinned manifest hash, compiles it in LiteRT.js with the `wasm` accelerator, and hands the empty sidecar set to the core with `createSelfHosted`. `makeClear` then wraps the `LoadedModel`, so the public API is exactly the SDK's.

Weights: clear-studio.tflite is 49,285,108 bytes with sha256 `fe2438e4e1137455298321ca952c5d3a4d7dde27eca6b8a495789723212fc79f`. The core downloaded exactly those bytes from its pinned revision, and `resolve/main` serves the same bytes today. The file exceeds the 25 MiB per-asset ceiling that wrangler enforces in dev as well as production, so it cannot ship as an asset; a production deployment should copy it into R2 and fetch from there instead of the Hub.

Audio decode: the browser decode host of the core needs OfflineAudioContext, which workerd does not have. This worker bypasses it and decodes in JavaScript with the core's own dependency-free helpers (`decodeWav` and `mixdownMono` from `@desert-ant-labs/core/audio`), then passes a mono Float32Array plus the file's sample rate to `enhance`, which resamples to the model's internal 48 kHz. The SDK needs no other decoder for this path, because 16-bit PCM WAV is the only container the pure-JS helpers handle, and that is what the fixtures use.

## Measurements

Local `wrangler dev` on port 8823, x64 Linux. All timings are `performance.now()` wall clock inside the worker.

| Stage | Dev, ms |
| --- | --- |
| Cold load, total (first request) | 35,393 to 41,064 |
| Of which: download 47 MiB artifact from the Hub | 35,213 to 40,878 |
| Instantiate Swift core | 29 to 30 |
| Init LiteRT.js | 23 to 24 |
| Compile clear-studio.tflite (LiteRT wasm accelerator) | 122 to 127 |
| Enhance 3 s of 16 kHz mono, first call | 469 (6.5x real time) |
| Enhance 3 s of 16 kHz mono, warm | 380 to 392 (7.7x to 8.0x) |
| Enhance 11 s of 16 kHz mono | 1,221 to 1,229 (9.0x) |

Production (`desert-ant-clear.bevry.workers.dev`): a fresh isolate pays a 1.3 to 7.5 s Hub download for the artifact. Production reports for compute stages read 0 ms, because `performance.now()` only advances during I/O there, so the production realtime factor is not measurable from inside the Worker.

Weight and bundle sizes: ClearWeb.wasm 46,133,985 bytes, litert_wasm_internal.wasm 9,367,934 bytes, clear-studio.tflite 49,285,108 bytes. Deployed script bundle 54,680.45 KiB raw, 21,629.13 KiB gzipped, worker startup time 12 ms. Peak isolate memory stayed within workerd's limits with the 49 MiB artifact bytes plus the compiled model resident.

## Samples and outputs

Fixtures live in `fixtures/` and mirror into `assets/fixtures/`: jfk.flac from the Whisper test set, converted to 16 kHz mono 16-bit WAV, 3.00 s, 96,078 bytes. The noisy variant mixes pink noise at 0.35 amplitude over the same clip. Both pass through `enhance` with default options (full strength, mastering to the applePodcasts -19 LUFS target with the -1.5 dBTP ceiling).

| Fixture | Input LUFS | Input true peak | Output |
| --- | --- | --- | --- |
| clean, 3 s | -16.70 | -7.73 dBFS | 144,000 samples at 48 kHz, 288,044 bytes as 16-bit WAV |
| noisy, 3 s | -19.87 | -6.00 dBFS | 144,000 samples at 48 kHz, 288,044 bytes as 16-bit WAV |
| clean, 11 s | -18.44 | -4.95 dBFS | 528,000 samples at 48 kHz |

The denoiser is visibly active: the clean clip starts in silence and its first output samples are exactly 0, while the noisy clip's first samples carry a low residual noise floor around 0.003. `POST /enhance` returns the enhanced audio as a 48 kHz 16-bit WAV with the metrics in an `x-enhance-meta` header; enhanced outputs from this run are kept at `/tmp/jfk-enhanced-3s.wav` and `/tmp/jfk-enhanced-prod.wav`.

## Gotchas

- The 47 MiB artifact has no wrangler-compatible local delivery path: assets cap at 25 MiB per file and the worker script would exceed its own limits with the file embedded. Runtime fetch from the Hub with a sha256 check is the working answer; swap the URL for an R2 object in production.
- The first request against the freshly deployed Worker returned edge error 1042 once. Every later isolate served correctly, including repeated cold loads. Treat the first post-deploy hit as a warm-up and retry once.
- LiteRT.js cannot initialise in workerd through its own loader. The bootstrap in `src/litert-workerd.js` (plus `src/workerd-shims.js` and the glue copy) is required for every LiteRT-based model of this family.
- The Node compatibility layer is on at compatibility date 2026-09-01. The emscripten glue detects Node and crashes on `__dirname` unless `globalThis.process` is replaced first.
- `WebAssembly.instantiate(module, imports)` resolved to a result object whose `instance` field arrived as undefined inside the emscripten callback. Synchronous `new WebAssembly.Instance(module, imports)` works and is what the `instantiateWasm` hook uses.
- `supportsFeature("relaxedSimd")` returns false in workerd, yet the relaxed-simd runtime build instantiates and runs. Do not trust that probe here.
- The 25 MiB asset ceiling applies in local dev too. ClearWeb.wasm ships as a `CompiledWasm` import for that reason.
- Production `performance.now()` freezes between I/O, so `processingSec` and `realtimeFactor` read 0 in deployed responses. Benchmark in dev or read CPU time from logs.

## Integration notes

- Keep one session per isolate behind a lazy singleton. The dev cold load is dominated by the artifact download; with the artifact served from R2 in the same data centre, expect the compile stage (about 125 ms) to dominate instead.
- Decode audio in JavaScript with `decodeWav` from the core and never install the browser audio host. Any container beyond PCM WAV needs a pure-JS or wasm decoder, because OfflineAudioContext and Web Audio do not exist in workerd.
- The model always runs at 48 kHz and the SDK resamples the input, so passing 16 kHz mono input is fine. Output defaults to 48 kHz mono; `outputSampleRate` can bring it back down on the way out.
- The enhance path is CPU-bound with no I/O, so a single 3 s clip costs well under a second of billed CPU time locally. Confirm the paid-plan CPU limit covers the 11 s clip before serving long-form audio.
- The same wiring carries the other LiteRT-based models of this SDK family. The three workerd-specific pieces (shims, glue copy, LiteRT bootstrap) are self-contained files shared with models/shapes.

## Deployed

`https://desert-ant-clear.bevry.workers.dev`, deployed 2026-09-25, version c0996733-0053-45fe-a8a4-447337faf3f8. Verified after deploy: `/matrix` enhanced both fixtures with metrics matching local, `/health` reported ready on repeated cold isolates, and `POST /enhance` returned a valid 48 kHz WAV for the noisy fixture.
