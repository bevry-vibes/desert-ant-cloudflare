# moderator on Cloudflare workerd — results

Tested 2026-09-25 with wrangler 4.140.0 (`compatibility_date` 2026-09-01), no compatibility flags. The model is `@desert-ant-labs/moderator` 3.5.0 with `@desert-ant-labs/core` 3.5.0 and `@litertjs/core` 2.5.3. Local runs use `wrangler dev` on port 8827. Run `npm test` in this directory to reproduce every assertion below.

## Verdict

**PASSES WITH CAVEATS.**

moderator runs end to end in `workerd`, in local dev and on the deployed worker. The model is image-only: it scores pixels for nudity and refuses text. The caveats are size shaped. The JavaScript build needs two wasm binaries, the 43.9 MiB Desert Ant core and the 8.9 MiB LiteRT runtime. workerd forbids compiling wasm bytes at runtime, and the static asset store caps files at 25 MiB, so both binaries must ride in the worker bundle as precompiled modules. That bundle is 21.1 MiB gzipped, which this paid account accepts. The weights are small by comparison, so the worker fetches `moderator.tflite` (9.2 MB) from the Hugging Face resolve URL on every cold isolate. None of this works on a free plan, and no of it works if Cloudflare reverts the script size headroom.

The Hugging Face pipeline tag (`image-classification`) is accurate. The card, the npm package, and the runtime behaviour agree: the input is an image, the output is one 0 to 1 NSFW score, a boolean decision, and five region confidences (`nipples`, `genitals`, `buttocks`, `nude`, `sexAct`). The model card reports recall 88% and false-block rate 6.3% at `accurate` quality. In this test the cat fixture passed, although with less headroom than expected (see Samples). The model card's swimwear claim was not re-tested; this harness keeps person photos out of the repository.

## Setup

The SDK's default entry cannot run here. It instantiates its wasm core with `fetch(new URL("ModeratorWeb.wasm", import.meta.url))` at import time, and a bundler cannot satisfy that URL. The worker therefore wires the same official pieces by hand:

1. Both wasm binaries are bundled as precompiled modules through the `CompiledWasm` rule. workerd rejects `WebAssembly.compile()` on bytes, but `WebAssembly.instantiate(module, imports)` on a bundled module is allowed.
2. LiteRT.js is injected through the official `litert` load option. Its emscripten glue is bundled statically and registered on `self`, and its `instantiateWasm` hook instantiates the bundled LiteRT module.
3. The weights come from the official `modelBaseUrl` option, pointed at the public Hugging Face resolve URL. `modelInfo()` reports `sidecars: []`, so that one file is the whole download.

This is the exact load pattern, with the shims collapsed (full source in `src/worker.js` and `src/shims.js`):

```js
import "./shims.js";
import { env } from "cloudflare:workers";
import * as liteRt from "@litertjs/core";
import litertWasmModule from "../node_modules/@litertjs/core/wasm/litert_wasm_internal.wasm";
import moderatorCoreModule from "../node_modules/@desert-ant-labs/moderator/dist/ModeratorWeb.wasm";
import ModuleFactory from "./generated/litert_wasm_internal.mjs";
import { createWasmSdk, makeModelHostSeam } from "@desert-ant-labs/core";
import { makeModerator } from "@desert-ant-labs/moderator/moderator.js";
import { instantiate } from "@desert-ant-labs/moderator/dist/instantiate.js";
import { defaultBrowserSetup } from "@desert-ant-labs/moderator/dist/platforms/browser.js";

// the emscripten factory is pre-bundled and registered on self, so the
// loader's importScripts no-op in shims.js finds it in place
self.ModuleFactory = ModuleFactory;
self.Module = {
	instantiateWasm: (info, successCallback) =>
		WebAssembly.instantiate(litertWasmModule, info).then((settled) => {
			const instance = settled.instance ?? settled;
			successCallback(instance, settled.module ?? litertWasmModule);
			return instance.exports;
		}),
};

// the platform seam the package would normally resolve through #platform,
// bound here to the bundled core module
const platform = {
	async setupCore() {
		const seam = makeModelHostSeam();
		const setup = await defaultBrowserSetup({
			module: moderatorCoreModule,
			getImports: () => seam.imports,
		});
		return { exports: (await instantiate(setup)).exports, installHost: seam.install };
	},
	defaultWasmDir: async () => "",
	readModelSource: async (source) => source,
	defaultCacheRoot: async () => "",
};

// cached at module scope, so only the first request on an isolate pays the load
let sdkPromise = null;
let moderatorPromise = null;

function loadModerator() {
	if (moderatorPromise) return moderatorPromise;
	moderatorPromise = (async () => {
		const sdk = await createWasmSdk({ platform, packageName: "@desert-ant-labs/moderator" });
		const Moderator = makeModerator(sdk);
		return Moderator.load({
			litert: liteRt,
			modelBaseUrl: env.MODEL_BASE_URL,
			accelerator: "wasm",
		});
	})();
	moderatorPromise.catch(() => (moderatorPromise = null));
	return moderatorPromise;
}
```

The `analyze` call takes raw pixels, because workerd has no `createImageBitmap` and no `OffscreenCanvas`:

```js
const pixels = jpeg.decode(jpegBytes, { useTArray: true, formatAsRGBA: true });
const result = await moderator.analyze(pixels, { quality: "accurate" });
```

Fresh clone setup: `npm install`, then `npm run dev` or `npm test`. `scripts/setup.mjs` regenerates the emscripten glue copy, and `scripts/fetch-fixtures.mjs` re-fetches the two committed fixtures if they are missing.

## Measurements

| Measurement | Value |
| --- | --- |
| Wasm core instantiate (bundled module), local dev | 30–33 ms |
| Model open, local dev (HF fetch + LiteRT compile of the tflite) | 6.2 s, 9.4 s, 11.3 s, 26.2 s across runs |
| Model open, deployed, first isolate | 1,363 ms |
| Analyze per call, local dev, 64×64 fast crop, warm | 126–261 ms |
| Analyze per image, local dev, 960×959 or 960×1536, `fast` | 137–148 ms (1 crop) |
| Analyze per image, local dev, same, `balanced` | 554–587 ms (4 crops) |
| Analyze per image, local dev, same, `accurate` | 1,072–1,812 ms (8 crops) |
| JPEG decode (jpeg-js, 960 px), local dev | 27–66 ms |
| Weight payload: `moderator.tflite` (fetched per cold isolate) | 9,618,016 bytes (9.17 MiB) |
| Bundled: `ModeratorWeb.wasm` (Desert Ant wasm core) | 46,065,400 bytes (43.9 MiB) |
| Bundled: `litert_wasm_internal.wasm` (LiteRT runtime) | 9,367,934 bytes (8.93 MiB) |
| Worker bundle, deployed | 54,677.72 KiB raw / 21,624.97 KiB gzip |
| Worker startup time (wrangler-reported) | 5 ms |

The spread in model open time is network, not inference: the HF resolve URL redirects to a signed CDN URL that varies in speed and occasionally drops mid-stream. Callers should retry large fetches with a size check against the repo pointer (9,618,016 bytes); the deployed worker leaves that to the SDK and tolerates the variance through the caller.

## Samples and outputs

Local `wrangler dev`, warm isolate. `benign` is a 960×959 cat photo (147 KB), a Wikimedia image committed under `assets/fixtures/`. Person photos stay out of the repository; the second case is the in-code synthetic 64×64 flat grey frame, which doubles as the out-of-distribution check.

| Case | Quality | Policy | Score | isNSFW | analyze ms |
| --- | --- | --- | --- | --- | --- |
| benign cat, accurate | accurate | standard | 0.3999687 | false | 1,098 |
| benign cat, fast | fast | standard | 0.2628098 | false | 147 |
| synthetic 64×64 solid grey, fast | fast | standard | 0.5690591 | true | 126–160 |
| text input ("hello world") | — | — | refused | — | 0 |

Full region payload for the benign fixture at `accurate`:

```json
{
	"nipples": 0.3259838819503784,
	"genitals": 0.3779771625995636,
	"buttocks": 0.06781161576509476,
	"nude": 0.3999687135219574,
	"sexAct": 0.04650348797440529
}
```

The text refusal is the documented input contract, returned verbatim by the SDK: `pass { data, width, height } with RGB or RGBA bytes (decode the image first, e.g. with sharp)`. moderator has no text path; the Toxic and Toxic-en models in the same catalogue are the text specialists, and both are closed beta without an SDK.

Deployed scores are bit-identical to local: 0.3999687135219574, 0.19428034126758575, 0.11044109612703323. The model is deterministic across isolates and machines.

## Gotchas

- **`WebAssembly.compile()` is forbidden.** `CompileError: WebAssembly.compile(): Wasm code generation disallowed by embedder`. No compatibility flag changes this. Bundle wasm through the `CompiledWasm` rule and instantiate the bundled module.
- **The 25 MiB asset limit bites in local dev too.** `✘ [ERROR] Asset too large. Cloudflare Workers supports assets with sizes of up to 25 MiB.` for the 43.9 MiB core. The ASSETS binding cannot serve it, so it rides in the bundle.
- **The `CompiledWasm` rule matches import specifiers, not resolved files.** A bare subpath such as `@desert-ant-labs/moderator/wasm` carries no `.wasm` suffix, misses the glob, and dies with `No loader is configured for ".wasm" files`. Import the wasm with relative paths that end in `.wasm`.
- **The LiteRT.js emscripten glue is a UMD script with no exports.** esbuild fails with `No matching export ... for import "default"`. `scripts/setup.mjs` copies it to `src/generated/litert_wasm_internal.mjs` and appends `export default ModuleFactory;`.
- **The glue detects its environment badly in workerd.** Three shims fix it, in `src/shims.js`, which must stay the first import: `globalThis.window = globalThis` selects the fetch based web path; `globalThis.location ??= { href }` feeds the web path's script directory; `delete globalThis.process` stops the bundler's process shim from making the glue take its Node branch (which dies on `__dirname is not defined`). `globalThis.importScripts ||= () => {}` satisfies the LiteRT.js script loader.
- **A throwing `instantiateWasm` hook hangs instead of failing.** Emscripten wraps only the success path in its executor, so a rejected hook promise leaves the glue's `await createWasm()` unsettled and workerd cancels the request with `your Worker's code had hung`. Wrap the callback in try/catch and log; never let the hook's promise reject silently.
- **workerd's `WebAssembly.instantiate(module, imports)` resolves to the instance itself**, not to `{ module, instance }` as in browsers. Handle both shapes.
- **`modelInfo()` is the source of truth for the download set.** It reports `{ id: "moderator", sdkVersion: "3.5.0", artifact: "moderator.tflite", sidecars: [] }`, so a self-hosted mirror needs exactly one file.
- **The HF resolve URL drops connections occasionally.** Large fetches through the xet CDN sometimes end mid-stream (`UND_ERR_SOCKET`, `other side closed`). Retry with a size check against the repo pointer (9,618,016 bytes).
- **Quality changes the score materially.** The cat image moves 0.26 → 0.40 between `fast` and `accurate`. The model card claims swimwear passes while nudity flags; this harness does not re-test that claim with person photos. Pick one quality per pipeline and do not compare scores across qualities.
- **Out-of-distribution frames score high.** A solid mid-grey 64×64 frame scores 0.569, above the default 0.5 threshold. Do not feed synthetic or flat frames to this model and trust the answer.
- **`nodejs_compat` is not needed.** The glue's `node:fs` and `node:crypto` imports sit in dead Node branches and are aliased to an empty stub in `wrangler.jsonc`. `@desert-ant-labs/core` and LiteRT.js are browser-safe.
- **Telemetry.** The worker sets `globalThis.__dalUsageDisabled = true` in the shims, so no usage POST leaves the harness.
- **Deployed timers quantise.** `decodeMs` and `analyzeMs` report 0 on the deployed worker because `performance.now()` resolution is coarser there. Benchmark on local dev, where the same calls read 137 to 1,812 ms.

## Integration notes

Embedding moderator in a Cloudflare Worker takes four steps:

1. Add `@desert-ant-labs/moderator`, `@litertjs/core`, and a pure-JS image decoder (`jpeg-js` here) as dependencies. Copy the two wasm binaries into the bundle as `CompiledWasm` imports and generate the importable glue copy (`scripts/setup.mjs`).
2. Bind the fixtures directory through the `assets` binding if you self-serve test images; the weights need no binding.
3. Wire the SDK as in Setup: `createWasmSdk` over a hand-built platform seam, LiteRT.js injected through `load({ litert, modelBaseUrl, accelerator: "wasm" })`, weights served from any HTTPS origin.
4. Decode images to `{ data, width, height }` RGBA before `analyze`. Decode and 8-crop `accurate` analysis cost about 1.1 to 1.2 s wall per 960 px image on local workerd; use `fast` for anything realtime.

Sizing notes for planners: the 55.3 MiB of wasm and the SDK code ride in the worker bundle at 21.1 MiB gzipped, so the whole model consumes script size, not memory on disk. The 9.2 MB tflite is fetched once per cold isolate and compiled by LiteRT's XNNPACK CPU accelerator; plan for that download on every isolate placement. The native Node path (`@desert-ant-labs/moderator/native`, koffi plus 57 MB of `.so` files) remains impossible in workerd; the wasm path documented here is the only one.

## Deployed

Deploy succeeded on 2026-09-25 with `wrangler deploy` from this directory, against expectations: the 21.1 MiB gzipped bundle was accepted by this Workers paid account, well past the historic 10 MiB script limit.

- URL: https://desert-ant-moderator.bevry.workers.dev
- Version: `f213e12c-d4e5-430b-b3ee-441ed2590251`
- Upload: 2 assets (2 fixtures), worker bundle 54,677.72 KiB / 21,624.97 KiB gzip, startup 5 ms

Deployed route checks:

| Route | Result |
| --- | --- |
| `/warm` (cold isolate) | `ok`, core 0 ms, model open 1,363 ms, synthetic score 0.5690591, wall 4.3 s |
| `/analyze?img=benign` | score 0.3999687, `isNSFW` false, identical to local |
| `/analyze?text=hello` | refused, pixel contract message, identical to local |
