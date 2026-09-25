# ear on Cloudflare Workers — Results

Model: Desert Ant Labs ear 3.5.0 (on-device spoken language identification).
Runtime: workerd via wrangler 4.140.0, compatibility date 2026-09-01.

## Verdict

Works. ear runs inside workerd, both under `wrangler dev` and on the deployed Worker. The audio pipeline is pure WebAssembly (a Swift core plus LiteRT.js); it needs no Node compatibility flag and no native addon. Three workerd seams are required, and every one of them is small and stable. The default Hub-download path hangs, so the worker uses the SDK's self-hosted load path instead.

## Setup

The SDK ships two cores. The `@desert-ant-labs/ear/native` entry binds a koffi addon over `libEarNode.so` and cannot run in workerd. The default entry is the WebAssembly path: the Swift core `EarWeb.wasm` (44.0 MiB) over a LiteRT.js session. This worker composes that path by hand:

1. `EarWeb.wasm` rides the module graph as a `CompiledWasm` import. workerd refuses to compile wasm from runtime bytes, and the assets pipeline rejects files over 25 MiB even in local dev, so the bundle is the only place it fits.
2. `@litertjs/core` (2.5.3) normally loads its emscripten runtime with `importScripts` or a DOM script tag. The worker preloads the emscripten factory instead (`src/litert-wasm-internal-relaxed.mjs`, the upstream loader plus one export line) and installs a no-op `importScripts`. The pre-compiled `litert_wasm_internal.wasm` (relaxed-SIMD build) reaches the factory through emscripten's `instantiateWasm` hook, which removes every runtime wasm compilation.
3. `Ear.load({ litert })` receives the LiteRT module explicitly, which bypasses the SDK's own browser check (`document` or `importScripts`).

The weight source is the Hugging Face Hub repo `desert-ant-labs/ear` at the revision pinned in the SDK, `v0.1.0`:

| File | Size |
| --- | --- |
| ear.tflite | 23,062,016 bytes (22.0 MiB) |
| mel_filters.f32 | 64,328 bytes |
| ear_meta.json | 3,894 bytes |
| languages.json | 595 bytes |

The SDK's default download path runs inside the Swift core and hangs in workerd: it fetches the model URL, logs the 200, and never returns, so the runtime cancels the request as hung. The worker therefore passes `modelBaseUrl` and takes the SDK's self-hosted path: `fetchSelfHostedModel` fetches the same pinned files on the JS side, LiteRT.js compiles the model bytes, and only the sidecars cross into the wasm core through `createSelfHosted`.

## Measurements

workerd exposes no memory API to a Worker, so isolate memory is not measurable from inside. A 44.0 MiB module, the LiteRT runtime, and the 22.0 MiB model stay under the 128 MB production isolate limit, as the deployment proves.

| Stage | wrangler dev | deployed |
| --- | --- | --- |
| Cold load (wasm boot, LiteRT init, model download and compile) | 13.9 s | 6.2 s |
| identify, first call (11 s clip, 1 window) | 2.5 s | — |
| identify, warm calls | 1.79–1.85 s | — |

Warm calls run 11.0 s of audio in about 1.8 s, roughly 6x realtime, on the LiteRT wasm CPU backend. Clips shorter than 30 s use one window, because the SDK's default of three windows only applies to longer recordings.

## Samples and outputs

All fixtures are mono 16 kHz 16-bit WAV.

| Fixture | Content | Top candidate | Confidence | isReliable |
| --- | --- | --- | --- | --- |
| jfk.wav | 11.0 s English speech (OpenAI whisper test clip) | en | 0.9791 | true |
| tone.wav | 4 s 440 Hz sine (non-speech) | en | 0.3806 | false |
| id.wav | 14.1 s Indonesian speech (espeak-ng synthesis) | id | 0.2051 | false |

The English clip is named with 97.9% confidence, and the runner-up languages (la, haw, mi, pt) sit below 0.3%. The tone produces an answer but the SDK flags it unreliable, which is the documented behaviour for audio without speech. The Indonesian clip is robotic synthesis, so the margin is small and reliability stays false, but the top candidate is still id, ahead of en, jw, th, and ms.

## Gotchas

- Wrangler dev injects a partial `process` global even without `nodejs_compat`. The Swift core reads it, takes its Node branch, and fails with `mkdirSync: missing from the __DalNodeFS host seam`. The worker deletes the shim before boot, which puts the core on its browser (in-memory) path.
- Emscripten's environment detection reads `self.location.href` inside workerd, because workerd exposes `WorkerGlobalScope`. A stub `location` keeps the bootstrap alive; nothing loads from it.
- The first request to a freshly deployed Worker can fail with `error code: 1042`. A retry succeeds. This happened once for each model after deploy, and matches a cold start carrying a 54.7 MiB bundle.
- The assets pipeline rejects files over 25 MiB before the server even starts, in dev as well as in production.
- Usage telemetry is disabled in this worker with `globalThis.__dalUsageDisabled = true`; otherwise the SDK reports calls to `events.desertant.com`.

## Integration notes

- Reuse the isolate: the model is held in module state, so load it lazily on the first request and keep it resident. A cold load is seconds; a warm call is 1.8 s.
- Serve the weights from your own origin or Workers Assets through `modelBaseUrl` rather than re-downloading from the Hub on every cold start.
- Keep every wasm binary in the module graph with a `CompiledWasm` rule. No runtime compilation is possible.
- The uploaded deploy is 54.7 MiB (21.6 MiB gzip) and is accepted on this account; plan bundle budgets accordingly.
- `nodejs_compat` is not needed for this model.

## Deployed

Deployed as `desert-ant-ear`: https://desert-ant-ear.bevry.workers.dev

Routes: `GET /health`, `GET /load`, `POST /identify` (WAV body, `?name=` label). Verified on the deployment: `/health`, `/load` (6.2 s, model info reported), and `/identify` with jfk.wav returned en at 0.9791 with isReliable true, matching local results exactly.

`npm test` in this directory asserts the matrix against `wrangler dev` on port 8824: boot, load, the English and Indonesian fixtures, and the unreliable flag on the tone. All five pass.
