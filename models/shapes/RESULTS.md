# RESULTS: @desert-ant-labs/shapes on Cloudflare workerd

Tested 2026-09-25 with @desert-ant-labs/shapes 3.5.0, @desert-ant-labs/core 3.5.0, @litertjs/core 2.5.3, wrangler 4.140.0.

## Verdict

Passes. The model loads, recognises all five stroke classes in 1 to 3 ms per call, and serves correctly from a deployed Worker. The stock SDK entry does not work in workerd as published, so this worker wires the SDK pieces by hand. See Setup.

## Setup

The default `@desert-ant-labs/shapes` import instantiates the Swift wasm core at import time and initialises LiteRT.js on load. LiteRT.js starts its Emscripten runtime through `importScripts` or a `<script>` tag. workerd offers neither, so the browser wiring cannot run. The native build needs koffi and native libraries, which workerd also cannot load. The working wiring reuses the SDK's own parts:

- The Swift core (ShapesWeb.wasm) enters as a `CompiledWasm` module import and initialises through the package's own `dist/index.js` entry with its BridgeJS runtime and the browser_wasi_shim WASI layer. No DOM code runs in that path.
- `src/litert-workerd.js` bootstraps the real @litertjs/core: it registers the Emscripten glue on globalThis, neutralises the loader's script step with a no-op `importScripts`, and hands the factory an `instantiateWasm` hook backed by a `CompiledWasm` import of litert_wasm_internal.wasm. The glue itself is a verbatim copy of the package file with one added export statement (`src/litert-wasm-glue.mjs`), because the stock file is UMD with no exports.
- `src/workerd-shims.js` replaces the global `process` before the glue evaluates. workerd enables the Node compatibility layer at this compatibility date, so the glue sees `process.versions.node` and takes its Node path, which needs `__dirname` and node:fs. The stub makes the glue take its worker path instead.
- The model loads through the SDK's own self-hosted path: the worker reads shapes.tflite plus shapes_meta.json from the assets binding, verifies the artifact sha256 against the core's pinned hash, compiles the model in LiteRT.js with the `wasm` accelerator (XNNPACK), and hands the sidecars to the core with `createSelfHosted`. `makeShapes` then wraps the `LoadedModel`, so the public API is exactly the SDK's.

Weights: the core downloaded shapes.tflite (1,288,604 bytes) and shapes_meta.json (582 bytes) from the Hugging Face Hub at its pinned revision on first use. The worker copied them into `assets/model/`. The tflite carries sha256 `b7259453caac9ed8a4a0a1e1494d7110ed8cfe9fddbe3c3224173c5de71c8a83`, which the worker re-verifies on load. The 44 MiB ShapesWeb.wasm cannot be an asset, because wrangler enforces a 25 MiB per-file asset ceiling in dev as well as in production; the `CompiledWasm` import is the only path that works.

## Measurements

Local `wrangler dev` on port 8823, x64 Linux. All timings are `performance.now()` wall clock inside the worker.

| Stage | Dev, ms | 
| --- | --- |
| Cold load, total (first request) | 108 to 147 |
| Instantiate Swift core | 32 to 33 |
| Init LiteRT.js | 23 to 28 |
| Read model from assets (1.29 MiB) | 10 to 30 |
| Compile shapes.tflite (LiteRT wasm accelerator) | 33 to 39 |
| Recognise, first call after load | 20 to 30 |
| Recognise, warm | 1 to 3 |
| Full matrix: 5 strokes plus 25 confidence probes | 49 to 102 |

Production (`desert-ant-shapes.bevry.workers.dev`): cold load measured 806 ms, dominated by the asset read. Production reports for the compute stages read 0 ms, because `performance.now()` only advances during I/O there. Compute time is not measurable from inside a production Worker this way.

Weight and bundle sizes: ShapesWeb.wasm 46,133,089 bytes, litert_wasm_internal.wasm 9,367,934 bytes, shapes.tflite 1,288,604 bytes, shapes_meta.json 582 bytes. Deployed script bundle 54,676.75 KiB raw, 21,644.67 KiB gzipped, worker startup time 11 ms.

## Samples and outputs

The matrix synthesises one stroke per class, recognises it, and brackets the classifier confidence by raising `minimumConfidence` until the class gate rejects. Results were stable across repeated runs, locally and deployed:

| Stroke | Expected | Recognised | Confidence bracket | First call |
| --- | --- | --- | --- | --- |
| rectangle | rectangle | rectangle | >= 0.9 | 25 ms then 2 to 3 ms |
| triangle | triangle | triangle | >= 0.9 | 3 ms then 1 to 2 ms |
| line | line | line | >= 0.9 | 2 ms then 1 to 2 ms |
| ellipse | ellipse | ellipse | >= 0.8 | 2 ms |
| star | star | star | >= 0.9 | 2 ms |

The fitter's output is sane: the ellipse stroke (semi-axes 90 and 55 at 20 degrees) came back as `semiMajor 89.97`, `semiMinor 54.99`, `rotation 0.2618` radians, which is the 15 degree snap the README promises. The rectangle corners snapped to the true axes.

## Gotchas

- LiteRT.js cannot initialise in workerd through its own loader. The bootstrap in `src/litert-workerd.js` is the price of admission for every LiteRT-based Desert Ant model.
- The Node compatibility layer is on at compatibility date 2026-09-01. The emscripten glue detects Node and crashes on `__dirname`. Replace `globalThis.process` before the glue evaluates.
- `WebAssembly.instantiate(module, imports)` resolved to a result object whose `instance` field arrived as undefined inside the emscripten callback. Synchronous `new WebAssembly.Instance(module, imports)` works and is what the `instantiateWasm` hook uses.
- `supportsFeature("relaxedSimd")` returns false in workerd, yet the relaxed-simd build of the LiteRT runtime instantiates and runs. Do not trust that probe here; it only changes which file name the stock loader would fetch, and the bootstrap bypasses that choice.
- The 25 MiB asset ceiling applies in local dev too. Plan for a `CompiledWasm` import for any core above the ceiling and accept the bundle size.
- `recognize` returns the fitted shape but no score. Estimate confidence by re-running with `minimumConfidence` set; each probe is a real inference at 1 to 3 ms, so bracketing is cheap.
- The star class gates at 0.75 confidence and rejects borderline strokes outright. A star synthesised with uneven point spacing got rejected at every threshold, while the same geometry sampled uniformly passed at 0.9. Keep test strokes evenly sampled.
- The wasm core records usage telemetry and posts it on its own schedule. No telemetry request failed during testing, but a worker that must not make outbound calls should pass a `deviceId` and review the SDK's usage reporting.

## Integration notes

- Keep one session per isolate behind a lazy singleton. The cold load is a few hundred milliseconds and the warm path is single-digit milliseconds, so a Worker is a good host for this model.
- The worker needs no outbound network at inference time. Only the one-time weight fetch touches the network; self-host the tflite and sidecar from assets or R2 for full determinism.
- The same wiring should carry the other LiteRT-based models of this SDK family. The three workerd-specific pieces (shims, glue copy, LiteRT bootstrap) are self-contained files.
- Production `performance.now()` freezes between I/O, so benchmark in dev or read CPU time from logs, not from in-worker timers.
- A 21.6 MiB gzipped script deployed successfully on this account, which is above the published 10 MiB paid-plan script limit. Confirm plan limits before relying on the `CompiledWasm` import for a 44 MiB core.

## Deployed

`https://desert-ant-shapes.bevry.workers.dev`, deployed 2026-09-25, version 6568000a-b260-47ac-afc2-752abeea30d4. Verified after deploy: `/health` reports ready with the model downloaded, and `/matrix` recognises all five classes correctly.
