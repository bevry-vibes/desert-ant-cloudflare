# RESULTS: @desert-ant-labs/emo 3.5.0 on workerd

Tested 2026-09-25 with wrangler 4.140.0 (local `wrangler dev`, miniflare workerd) and production workerd.

## Verdict

**Partial: the model loads in workerd, but inference never returns.** The full load pipeline (wasm core instantiation, LiteRT.js boot, tflite compile, self-hosted model adoption) completes in workerd in about 165 ms. Every `suggestions()` call then stalls inside the Swift wasm core before it reaches the model host, and workerd cancels the request as hung. The identical wiring runs correctly in plain Node (see `scripts/probe-node.mjs`), so the blocker is a workerd-specific incompatibility in the Swift/BridgeJS async execution path, not the wiring, the weights, or LiteRT.js. Production workerd fails earlier: the deploy succeeds, but the model compile step inside LiteRT fails (see Deployed).

## Setup (exact load pattern)

The npm package has a split build. `exports["."]` (`browser.js`) is the WebAssembly + LiteRT.js pipeline; `exports["./native"]` (`node.js`) is a koffi native build that cannot run in workerd. Only the wasm build is relevant here, and it cannot be used as shipped:

1. The default entry instantiates the Swift wasm core with `fetch(new URL("EmoWeb.wasm", import.meta.url))`, which cannot resolve in a bundled worker.
2. workerd rejects runtime wasm compilation ("Wasm code generation disallowed by embedder"), so both wasm modules are imported as precompiled `CompiledWasm` bundle modules (see `rules` in `wrangler.jsonc`) and never served from `assets/`. The Cloudflare assets layer also caps single files at 25 MiB, and `EmoWeb.wasm` is 44 MiB, so it cannot live in `assets/` at all.
3. LiteRT.js evaluates its emscripten glue through `importScripts` or a `<script>` tag. workerd has neither. `src/vendor-litert-glue.js` is the stock `litert_wasm_compat_internal.js` with the UMD export block replaced by ES exports, and `src/litert-workerd.js` seeds `globalThis.importScripts`, `self.location`, and `self.ModuleFactory`, then hands the precompiled LiteRT module to emscripten through its `instantiateWasm` hook.
4. The relaxed SIMD probe inside LiteRT.js cannot compile its check module in workerd, so it fails closed and selects the compat build. The vendored glue and the bundled wasm are therefore the compat variants.
5. `src/emo-workerd.js` rebuilds the wiring that the package's `#platform` seam would otherwise provide: `defaultBrowserSetup` + `instantiate` from the package's `dist/` (relative imports, because the package `exports` map blocks them), then `createWasmSdk` from `@desert-ant-labs/core` with a custom platform object, then the package's own `makeEmo`. The model host wrapper must not call `litert.loadLiteRt()` itself; only the core's `open()` may call it exactly once (a second call throws "LiteRT is already loading / loaded").
6. `Emo.load({ litert, accelerator: "wasm", modelBaseUrl: "<origin>/weights/" })`. The `litert` option also bypasses `assertBrowserRuntime`, which would otherwise demand `document` or `importScripts`. The weights are served by the assets layer from `assets/weights/` (`emo.tflite` 10.2 MB, `emo_meta.json` 6.3 KB, `emo_tokenizer.bin` 733 KB) and reach the core through `fetchSelfHostedModel` + LiteRT `loadAndCompile` + `createSelfHosted`.

A fresh clone reproduces everything with `npm install && npm run setup && npx wrangler dev`.

`scripts/probe-node.mjs` runs the same wiring in plain Node and completes, which is how the outputs below were captured.

## Measurements

Weight and runtime sizes:

- `emo.tflite` (weights): 10 222 736 bytes. Sidecars: `emo_meta.json` 6 280 bytes, `emo_tokenizer.bin` 733 197 bytes.
- `EmoWeb.wasm` (Swift core): 46 082 149 bytes, bundled as CompiledWasm.
- `litert_wasm_compat_internal.wasm` (LiteRT runtime): 9 367 934 bytes, bundled as CompiledWasm.
- Deployed bundle: 54 644.07 KiB raw / 21 617.83 KiB gzip, plus 10.9 MB of assets.

Timings (local workerd, warm hardware, `POST /load` response):

- Core instantiation: 28-31 ms.
- LiteRT boot + tflite compile + model adoption (`modelLoadMs`): 133-181 ms.
- Total cold load: 165-210 ms. The first isolate does all of it; later calls reuse the cached model.

Per-call inference is unmeasurable in workerd because every call stalls and the request is cancelled. The Node probe measures the same pipeline at 27 ms for the first call and 3-5 ms warm, so the stall costs workerd everything.

## Samples and outputs

Captured with `scripts/probe-node.mjs` (identical wiring, Node instead of workerd), `limit: 3`, default skin tone:

| Input | Suggestions (top first) |
| --- | --- |
| "finished a marathon today" (en) | 🏁 0.433, 🏃 0.209, ✅ 0.107 (27 ms first call) |
| "anak saya lulus ujian" (id) | 📚 0.300, 🎓 0.135, 👶 0.102 |
| "hujan turun sepanjang hari di Pati" (id) | 🌧️ 0.417, ☔ 0.117, 📉 0.074 |
| "first coffee of the morning" (en) | ☕ 0.472, 🌅 0.249, ☀️ 0.078 |
| "account 8822 validation pending review" (no-emoji control) | ✅ 0.127, ⏰ 0.121, 🔍 0.093 |

The model always returns ranked suggestions. The no-emoji control is distinguishable only by its low confidences (all below 0.13 versus 0.4+ for the emoji-appropriate inputs).

In workerd the same calls produce no output: `exports.run` (the wasm `bjs_run` entry) is entered and never returns, not even for an invalid model handle, and workerd then cancels the request: "The Workers runtime canceled this request because it detected that your Worker's code had hung and would never generate a response."

## Gotchas

- workerd bans runtime wasm compilation. `WebAssembly.compile()` on fetched bytes fails with "Wasm code generation disallowed by embedder"; the only path is `CompiledWasm` bundle imports plus `new WebAssembly.Instance(module, imports)` inside emscripten's `instantiateWasm` hook.
- The assets layer rejects files above 25 MiB even in `wrangler dev`, so the 44 MiB core wasm cannot be served from `assets/`.
- wrangler shims `process` enough that emscripten's Node probe (`process.versions.node`) misfires; the vendored glue pins `ENVIRONMENT_IS_NODE = false` or it demands `__dirname` and `fs`.
- workerd defines `WorkerGlobalScope` but no `self.location`; the glue reads `self.location.href` during the factory call and crashes unless a location is seeded.
- Calling `litert.loadLiteRt()` from the host wrapper and then again from the core's `open()` throws "LiteRT is already loading / loaded". Only the core may drive it.
- LiteRT's global state is module-scoped and survives a failed attempt inside one isolate across wrangler hot reloads; a clean restart clears it.
- The relaxed SIMD probe compiles a check module and therefore always fails in workerd; the compat (non-relaxed-SIMD) LiteRT build must be the one bundled.
- `redact_meta.json` analog: emo's catalog sidecar names come from `exports.modelInfo()` at runtime, not from the package docs. Trust `modelInfo()`.

## Integration notes

- A consumer needs four pieces: `CompiledWasm` imports of both wasm binaries, the vendored compat glue with the workerd tweaks, a platform seam that reuses the instantiated core, and an origin-relative `modelBaseUrl` served from the assets layer. All of it lives in `src/` here and transfers to other Desert Ant wasm-family models unchanged except for the model package name and codec.
- Because inference stalls in workerd, a Cloudflare Workers deployment of this SDK family should use the native build in Workers Containers/Workers Rust hosts, or keep inference client-side in the browser (the SDK's intended home) and use Workers only for asset serving.
- `npm test` (test/worker.test.mjs) starts `wrangler dev` on port 8822, asserts the assets, the service route, the successful cold load with the pinned catalog, the inference stall (characterisation), and the trace, then kills the server. Exit status reflects the assertions.

## Deployed

`wrangler deploy` succeeds: <https://desert-ant-emo.bevry.workers.dev> (version aec582d5-7170-4af3-bdd8-91bf5b4ed7ae, 54 644.07 KiB raw / 21 617.83 KiB gzip, 3 asset files, Worker Startup Time 13 ms).

The deployment is not usable. `POST /load` fails in production workerd at LiteRT's model compile with "Failed to load model from buffer" (`loadModel` inside `litert_wasm_compat_internal`), most plausibly the isolate memory ceiling with both wasm runtimes and the weights resident. `POST /suggest` consequently surfaces as Cloudflare error 1101.
