# voz on Cloudflare Workers — Results

Model: Desert Ant Labs voz 3.5.0 (on-device speech recognition, 25 languages).
Runtime: workerd via wrangler 4.140.0, compatibility date 2026-09-01.

## Verdict

Does not run. The Swift wasm core itself is healthy in workerd, and the worker fetches the whole weight bundle, but the ONNX Runtime layer cannot initialise. Three independent blockers stand between voz and a working transcription, and any one of them is fatal:

1. ONNX Runtime Web cannot create a session in workerd. Its wasm backend fails to initialise with `no available backend found. ERR: [wasm] Error: cannot determine the script source URL.`
2. workerd forbids wasm code generation from runtime bytes. A probe module fails with `WebAssembly.Module(): Wasm code generation disallowed by embedder`. The ONNX backend library must be compiled at runtime, so no configuration (`wasmPaths`, the embedded-wasm bundle variant, `numThreads = 1`) can avoid blocker 1.
3. The weights exceed the Workers isolate memory limit. The bundle is about 385 MB over the wire and the resident set is about 1.19 GB; the production limit is 128 MB. `wrangler dev` enforces no limit, which is why the full fetch succeeds locally before blocker 1 fires.

## The npm package question

The models page at desertant.com lists voz as Swift-only, but `@desert-ant-labs/voz` 3.5.0 on npm is real and complete. It contains the same Pipeline as the Swift SDK compiled to WebAssembly (BridgeJS bindings over `VozWeb.wasm`), an isomorphic platform seam (browser and Node), chunked audio decoding through mediabunny, and word-level timestamp output. The Node documentation inside the package confirms the split: the browser gets onnxruntime-web, Node is told to pass `onnxruntime-node`, a native addon. The package is not a stub; it is the browser and Node SDK, and the models page claim is out of date or refers to the native server core that does not exist for voz.

## Setup

The worker composes the SDK's browser path with a workerd platform seam (`makeVoz(platform)`):

1. `VozWeb.wasm` (44.1 MiB) rides the module graph as a `CompiledWasm` import. The core boots and reports its catalog: id `voz`, SDK 3.5.0, repo `desert-ant-labs/voz`, revision `main`.
2. The bundled `onnxruntime-web` 1.30.0 (embedded-wasm variant) is passed to `Voz.load({ ort, ep: "wasm", cache: false })`, the way a Node caller passes onnxruntime-node. The import succeeds; the backend does not.
3. WAV input is decoded by the SDK family's portable codec (`decodeWav`, mixdown, linear resample to 16 kHz), so no Web Audio and no Node audio host is needed.

## Weight source and size

The SDK derives the Hub location from the wasm core's catalog. Measured fetches during a full `/load`:

| File | Size | Fetch time (dev) |
| --- | --- | --- |
| web/meta.json | 539 bytes | 0.5 s |
| web/vocab.json | 78,654 bytes | 0.9 s |
| web/encoder.onnx | 813,056 bytes | 2.9 s |
| web/embedding.f16 | 10,487,040 bytes | 19.9 s |
| web/decoder.webgpu.onnx | 24,472,430 bytes | 44.9 s |
| web/encoder.onnx.data | 348,981,248 bytes | 251.5 s |

Total: about 385 MB over the wire. The code documents about 1.19 GB resident once the encoder's external data is loaded by the runtime. The catalog also lists `web/encoder.q4`, a 4-bit wire format that the SDK expands in memory before the session is built; that path needs the `Float16Array` global and was not exercised, because `meta.json` on `main` currently selects the external-data layout.

## Measurements

| Stage | wrangler dev | deployed |
| --- | --- | --- |
| Core boot plus catalog (`/info`) | 36 ms | < 1 s |
| ONNX session probe (24 MB decoder.onnx fetched, then `InferenceSession.create`) | fails after 13.1 s | fails after 1.4 s |
| Full `/load` (all six files, then session creation) | fails after 252 s | not attempted (the 349 MB fetch cannot fit the 128 MB isolate) |
| Transcription | impossible | impossible |

Memory is not measurable from inside workerd. The dev machine held the 349 MB byte array and the rest of the bundle without complaint; production kills the isolate at 128 MB long before the session stage.

## Samples and outputs

None exist. No transcript can be produced in workerd, so the transcription matrix (jfk.wav, tone.wav, id.wav) could not be executed. `POST /transcribe` correctly refuses with 503 until a load succeeds, and a load never succeeds. The fixtures are shared with the ear directory, in case the model is retried on a runtime that can host it.

## Gotchas

- The catalog pins revision `main`, not a tag. The weights can drift under the SDK, and the ear SDK pins `v0.1.0`, so the inconsistency looks unintentional.
- The deployed upload is 47.5 MiB (19.2 MiB gzip) and is accepted, but size is not the obstacle; the ONNX backend and the memory ceiling are.
- The first request after a deploy can fail with `error code: 1042`. A retry succeeds.
- `wrangler dev` enforces no isolate memory limit. A load that survives locally dies in production at the first large fetch, which makes dev success misleading for this model.
- The assets pipeline rejects files over 25 MiB before the server starts, even in dev, so the wasm core can only ride the module graph.

## Integration notes

- Do not plan on Cloudflare Workers for voz. The blockers are runtime properties of workerd, not wiring mistakes: there is no wasm codegen opt-in, and the weights are an order of magnitude over the isolate limit.
- Run voz where its SDK expects to run: a browser with WebGPU, Apple devices through the Swift SDK (Core ML), or a Node server with `onnxruntime-node` on a host with gigabytes to spare.
- If Cloudflare must serve the request, keep the worker as a thin proxy to a GPU host; the wasm core and catalog routes in this worker are useful for probing bundle versions.

## Deployed

Deployed as `desert-ant-voz`: https://desert-ant-voz.bevry.workers.dev

Routes: `GET /health`, `GET /info` (catalog plus capability probes), `POST /ort-session` (minimal ONNX session probe), `POST /load` (full SDK path), `POST /transcribe`. Verified on the deployment: `/info` reproduces the catalog and the codegen ban in production, and `/ort-session` reproduces the ONNX backend failure with the identical error text.

`npm test` in this directory asserts the failure ladder against `wrangler dev` on port 8824: catalog identity, the exact codegen error, the exact ONNX backend error, the 503 gate on transcription, and (with `VOZ_FULL_LOAD=1`, because it fetches 349 MB) the full-load failure after every file arrives. Six assertions pass; the full-load assertion is skipped by default.
