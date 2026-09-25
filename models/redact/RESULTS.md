# RESULTS: @desert-ant-labs/redact 3.5.0 on workerd

Tested 2026-09-25 with wrangler 4.140.0 (local `wrangler dev`, miniflare workerd) and production workerd.

## Verdict

**Partial: the model loads in workerd, but inference never returns.** The behaviour matches the sibling emo model exactly. The full load pipeline (wasm core instantiation, LiteRT.js boot, 24.5 MB tflite compile, self-hosted model adoption) completes in workerd in about 210 ms. Every `redaction()` call then stalls inside the Swift wasm core before it reaches the model host, and workerd cancels the request as hung. The identical wiring runs correctly in plain Node (see `scripts/probe-node.mjs`) and produces correct redactions for English and Indonesian, so the blocker is a workerd-specific incompatibility in the Swift/BridgeJS async execution path. Production workerd fails earlier: the deploy succeeds, but the model compile step inside LiteRT fails (see Deployed).

## Setup (exact load pattern)

The npm package has a split build. `exports["."]` (`browser.js`) is the WebAssembly + LiteRT.js pipeline; `exports["./native"]` (`node.js`) is a koffi native build that cannot run in workerd. Only the wasm build is relevant here, and it cannot be used as shipped:

1. The default entry instantiates the Swift wasm core with `fetch(new URL("RedactWeb.wasm", import.meta.url))`, which cannot resolve in a bundled worker.
2. workerd rejects runtime wasm compilation ("Wasm code generation disallowed by embedder"), so both wasm modules are imported as precompiled `CompiledWasm` bundle modules (see `rules` in `wrangler.jsonc`) and never served from `assets/`. The Cloudflare assets layer also caps single files at 25 MiB, and `RedactWeb.wasm` is 44 MiB, so it cannot live in `assets/` at all.
3. LiteRT.js evaluates its emscripten glue through `importScripts` or a `<script>` tag. workerd has neither. `src/vendor-litert-glue.js` is the stock `litert_wasm_compat_internal.js` with the UMD export block replaced by ES exports, and `src/litert-workerd.js` seeds `globalThis.importScripts`, `self.location`, and `self.ModuleFactory`, then hands the precompiled LiteRT module to emscripten through its `instantiateWasm` hook.
4. The relaxed SIMD probe inside LiteRT.js cannot compile its check module in workerd, so it fails closed and selects the compat build.
5. `src/redact-workerd.js` rebuilds the wiring that the package's `#platform` seam would otherwise provide: `defaultBrowserSetup` + `instantiate` from the package's `dist/` (relative imports, because the package `exports` map blocks them), then `createWasmSdk` from `@desert-ant-labs/core` with a custom platform object, then the package's own `makeRedact`. Only the core's `open()` may call `litert.loadLiteRt()`, exactly once.
6. `Redact.load({ litert, accelerator: "wasm", modelBaseUrl: "<origin>/weights/" })`. The weights are served by the assets layer from `assets/weights/` (`redact.tflite` 24.5 MB, `labels.json` 3.8 KB, `redact_tokenizer.bin` 391 KB).

The sidecar list differs from emo and matters: `exports.modelInfo()` reports `sidecars: ["redact_tokenizer.bin", "labels.json"]`. Serving `redact_meta.json` instead fails the load with a DecodingError ("Key 'id2label' not found"), because the core parses the served sidecars and `labels.json` is the file that carries `id2label`. Always trust `modelInfo()` over the file names on Hugging Face.

A fresh clone reproduces everything with `npm install && npm run setup && npx wrangler dev`.

`scripts/probe-node.mjs` runs the same wiring in plain Node and completes; the outputs below come from it.

## Measurements

Weight and runtime sizes:

- `redact.tflite` (weights): 24 529 472 bytes. Sidecars: `labels.json` 3 842 bytes, `redact_tokenizer.bin` 391 416 bytes.
- `RedactWeb.wasm` (Swift core): 46 268 886 bytes, bundled as CompiledWasm.
- `litert_wasm_compat_internal.wasm` (LiteRT runtime): 9 367 934 bytes, bundled as CompiledWasm.

Timings (local workerd, `POST /load` response):

- Core instantiation: 28 ms.
- LiteRT boot + tflite compile + model adoption (`modelLoadMs`): 181 ms.
- Total cold load: 210 ms.

Per-call inference is unmeasurable in workerd because every call stalls and the request is cancelled. The Node probe measures the same pipeline at about 90-110 ms of inference per call (about 90-140 ms end to end including FFI and decode), with warm calls stable at 90-100 ms.

## Samples and outputs

Captured with `scripts/probe-node.mjs` (identical wiring, Node instead of workerd), default `minimumConfidence` 0.6, all labels:

- "Email Anna Wijaya at anna.wijaya@example.com or call +62 812-3456-7890 about the invoice." (en, 142 ms)
  - redacted: "Email [GIVEN_NAME_1] [SURNAME_1] at [EMAIL_1] or call [PHONE_1] about the invoice."
  - items: Anna / Wijaya / anna.wijaya@example.com / +62 812-3456-7890, all confidence 1
- "Hubungi Budi Santoso di budi.santoso@contoh.co.id atau telepon 0812-3456-7890. Alamat: Jalan Pemuda 12, Pati." (id, 97 ms)
  - redacted: "Hubungi [GIVEN_NAME_1] [SURNAME_1] [EMAIL_1] atau telepon [PHONE_1]. Alamat: [STREET_NAME_1] [BUILDING_NUMBER_1], [CITY_1]."
  - items: Budi / "Santoso di" / budi.santoso@contoh.co.id / 0812-3456-7890 / Jalan Pemuda / 12 / Pati. One quality note: the SURNAME span swallowed the following word "di".
- "Maria Silva lives at 221B Baker Street, London NW1 6XE. Card 4111 1111 1111 1111 is on file." (en address, 99 ms)
  - redacted: "[GIVEN_NAME_1] [SURNAME_1] lives at [BUILDING_NUMBER_1] [STREET_NAME_1], [CITY_1] [ZIP_CODE_1]. Card [CREDIT_CARD_1] is on file."
- "The meeting starts at nine and the agenda is attached." (no-PII control, 99 ms)
  - redacted: "The meeting starts at [STREET_NAME_1] and the agenda is attached."
  - The control is NOT passed through unchanged: "nine" is misdetected as STREET_NAME with confidence 1. Real PII is caught reliably, but the passthrough guarantee needs a confidence gate or an allowlist in front of this model.

In workerd the same calls produce no output: `exports.run` (the wasm `bjs_run` entry) is entered and never returns, and workerd then cancels the request: "The Workers runtime canceled this request because it detected that your Worker's code had hung and would never generate a response."

## Gotchas

- Everything listed for emo applies unchanged: runtime wasm compilation is banned (use `CompiledWasm` imports + emscripten `instantiateWasm`), the 25 MiB assets cap rules out the 44 MiB core wasm in `assets/`, the vendored glue must pin `ENVIRONMENT_IS_NODE = false` and seed `self.location`/`importScripts`, only the core may call `loadLiteRt()`, and the SIMD probe always fails closed to the compat build.
- The sidecar set is `["redact_tokenizer.bin", "labels.json"]`. Serving the Hugging Face `redact_meta.json` fails the load with a DecodingError on `id2label`.
- Per-call cost is roughly 4x emo's (about 90-110 ms of inference), consistent with the 2.4x larger tflite.

## Integration notes

- The wiring in `src/` transfers between Desert Ant wasm-family models with only the model package name, codec, and asset names changed; see the emo RESULTS for the shared details.
- For production use on Cloudflare, keep inference out of `workerd` (browser-side as the SDK intends, or a native-capable host). The redaction restore helper (`Redaction.restore`) is pure string replacement, so a Workers deployment could still host the restore path and the assets.
- `npm test` (test/worker.test.mjs) starts `wrangler dev` on port 8822, asserts the assets, the service route, the successful cold load with the pinned catalog (including the `labels.json` sidecar), the inference stall (characterisation), and the trace, then kills the server. Exit status reflects the assertions.

## Deployed

`wrangler deploy` succeeds: <https://desert-ant-redact.bevry.workers.dev> (version ee0efa10-1793-4669-b7a8-df988db88ff6).

The deployment is not usable. `POST /load` fails in production workerd at LiteRT's model compile with "Failed to load model from buffer" (`loadModel` inside `litert_wasm_compat_internal`), most plausibly the isolate memory ceiling with both wasm runtimes and the 24.5 MB weights resident.
