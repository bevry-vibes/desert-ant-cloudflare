# Results

Tested 2026-09-25 against `workerd` (wrangler 4.137+ local dev) and, where noted, against deployed Workers. Every model directory has a `RESULTS.md` with the full evidence.

## Summary table

| Model | workerd verdict | Deployed | Load | Per call | Weights | Runtime shape |
| --- | --- | --- | --- | --- | --- | --- |
| [tongue](../models/tongue/RESULTS.md) | **PASSES** | [desert-ant-tongue.bevry.workers.dev](https://desert-ant-tongue.bevry.workers.dev) | 7 ms | 0–1 ms | 2.0 MB (bundled assets) | pure JS, no wasm, no flags |
| [shapes](../models/shapes/RESULTS.md) | **PASSES** | [desert-ant-shapes.bevry.workers.dev](https://desert-ant-shapes.bevry.workers.dev) | 108–147 ms | 1–3 ms | 1.3 MB tflite | LiteRT.js wasm, hand-wired bootstrap |
| [clear](../models/clear/RESULTS.md) | **PASSES** | [desert-ant-clear.bevry.workers.dev](https://desert-ant-clear.bevry.workers.dev) | 35–41 s (49 MB hub fetch) | 380–469 ms per 3 s audio | 49 MB tflite | LiteRT.js wasm + XNNPACK |
| [ear](../models/ear/RESULTS.md) | **PASSES** | [desert-ant-ear.bevry.workers.dev](https://desert-ant-ear.bevry.workers.dev) | 6.2–13.9 s (22 MB weights) | ~1.8 s per 11 s audio | 22 MB tflite | Swift wasm core + LiteRT.js |
| [moderator](../models/moderator/RESULTS.md) | **PASSES WITH CAVEATS** | [desert-ant-moderator.bevry.workers.dev](https://desert-ant-moderator.bevry.workers.dev) | 1.4 s deployed first isolate | 137–148 ms per 960 px image (fast tier) | 9.2 MB tflite | MobileNetV4 via LiteRT.js; flat frames false-positive |
| [emo](../models/emo/RESULTS.md) | **PARTIAL — inference stalls** | deployed as evidence only | 165 ms | stalls in workerd; 3–5 ms in Node | 10.2 MB tflite | LiteRT load works; BridgeJS async path hangs |
| [redact](../models/redact/RESULTS.md) | **PARTIAL — inference stalls** | deployed as evidence only | 210 ms | stalls in workerd; 90–110 ms in Node | 24.5 MB tflite | same stall profile as emo |
| [gist](../models/gist/RESULTS.md) | **FAILS** | not deployable | module-init crash | — | 80 MB via HF | LiteRT browser-only; Node native core needs 203 MB RSS |
| [align](../models/align/RESULTS.md) | **FAILS (by design)** | not deployable | load refuses | — | small, via HF | no wasm build; Node native core works (154 MB RSS) |
| [voz](../models/voz/RESULTS.md) | **FAILS** | probe deployed as evidence | wasm core boots | — | 385 MB wire, 1.19 GB resident | onnxruntime-web cannot pick a backend; isolate cap |
| title, uhm, clips | **NOT TESTABLE VIA JS** | — | — | — | title: 286 MB safetensors | no npm package; Swift SDKs only |
| toxic, toxic-en, who, moderator (pre-beta), schemer, eye, face | **NOT TESTED — no JS SDK** | — | — | — | see [models.md](./models.md) | Hugging Face only, or gated |

## The decision tree for Desert Ant models on Workers

1. **Pure JavaScript model (tongue).** Works with zero compatibility flags. Load weights through an assets binding and the platform-free `fromBytes` path. Pass a `Uint8Array`, not an ArrayBuffer.
2. **LiteRT.js inference (shapes, clear, ear, moderator).** Works after hand-wiring: wasm cores must ship as `CompiledWasm` module imports (workerd bans runtime wasm compilation, and the assets layer caps at 25 MiB even in dev), LiteRT's emscripten glue needs shims (`importScripts` no-op, `window`/`location`, `process` removal, precompiled module via `instantiateWasm`), and the SDK's own self-hosted model path replaces the Hub fetch (which hangs in workerd for Swift-side downloads). The reusable shims live in `models/shapes/src/` and `models/ear/src/`.
3. **BridgeJS async Swift pipeline (emo, redact).** The load path completes, but every inference call stalls inside the wasm async wrapper and workerd cancels the request. Plain Node with identical wiring works, so this is a workerd-specific incompatibility. Production deploys additionally fail LiteRT's `loadModel` with both wasm runtimes resident.
4. **onnxruntime-web (voz).** Cannot initialise any backend in workerd; runtime wasm compilation is banned and the weights exceed the isolate cap regardless.
5. **koffi native cores (gist, align).** Native addons cannot run in workerd. Node works; a Cloudflare Container (GA 2026-04, scale to zero) is the server-side home.
6. **No JS SDK (title, uhm, clips, toxic, and friends).** Out of scope for Workers; some weights are portable (title ships plain safetensors) for self-hosted runtimes.

## Cross-cutting findings

- **Bundle size:** Cloudflare accepted 47–55 MB raw (19–22 MB gzip) worker uploads on this paid account, far past the documented 10 MB paid limit. Do not rely on this; free-plan Workers cannot take these bundles.
- **25 MiB assets cap** applies in local dev too, so large cores must ride the module graph as `CompiledWasm` imports.
- **First request after a big deploy** fails with `error code: 1042`, then recovers (cold start of the large bundle).
- **`performance.now()` freezes between I/O in production**, so compute timings read 0 in deployed responses. Dev numbers are the real ones.
- **wrangler's injected `process` shim** makes emscripten glue misdetect Node; the shims pin `ENVIRONMENT_IS_NODE = false` or delete `globalThis.process`.
- **`nodejs_compat` is unnecessary** for this family; the SDKs guard all Node access.
- **Weight pinning is inconsistent:** most models pin HF tags, voz pins `main` — silent weight drift risk.
- **`supportsFeature("relaxedSimd")` lies in workerd** (returns false while the relaxed-simd build runs fine).
- **Node memory ceiling:** LiteRT native cores land at 154–215 MB RSS, above the 128 MB workerd isolate cap — independent confirmation that the native path belongs in a Container.
- **Desert Ant SDK fixes worth requesting upstream:** a workerd-safe LiteRT bootstrap in the core, a BridgeJS async fix for the emo/redact stall, and tag pinning for voz.
