# tongue on Cloudflare workerd — results

Tested 2026-09-25 with wrangler 4.140.0 (`compatibility_date` 2026-09-01), no compatibility flags. The model is `@desert-ant-labs/tongue` 3.5.0. Local runs use `wrangler dev` on port 8821. Run `npm test` in this directory to reproduce every assertion below.

## Verdict

**PASSES.**

tongue runs in `workerd` with no wasm, no inference runtime, and no `nodejs_compat` flag. The cold load is 7 ms from the assets binding in local dev, and a detection costs 0 to 3 ms after the load. The deployed worker answers correctly on `workers.dev`. The only caveats are model-level, not runtime-level: Javanese is absent from the 59 labels, and the Indonesian/Malay pair can finish close without raising `isTooCloseToCall`.

## Setup

The worker imports the package directly and reads the two weight files from the `ASSETS` binding. `npm run setup` copies the files from the installed package into `assets/models/tongue/`, because a bundler does not serve files out of `node_modules`.

This is the exact load pattern:

```js
import { Tongue } from "@desert-ant-labs/tongue";

// cached at module scope, so only the first request on an isolate pays the load
let tonguePromise = null;

function loadTongue(env) {
	if (tonguePromise) return tonguePromise;
	const started = performance.now();
	tonguePromise = (async () => {
		const [metaRes, binRes] = await Promise.all([
			env.ASSETS.fetch("https://assets.local/models/tongue/tongue_meta.json"),
			env.ASSETS.fetch("https://assets.local/models/tongue/tongue_int8.bin"),
		]);
		const metadata = await metaRes.json();
		// fromBytes requires a Uint8Array. A bare ArrayBuffer is rejected.
		const bytes = new Uint8Array(await binRes.arrayBuffer());
		return Tongue.fromBytes(metadata, bytes);
	})();
	tonguePromise.catch(() => (tonguePromise = null));
	return tonguePromise;
}
```

The hostname in the assets fetch is arbitrary. Only the path matters, and it must match the assets directory layout (`assets/models/tongue/...`).

## Measurements

| Measurement | Value |
| --- | --- |
| Cold load, local dev (assets fetch + `fromBytes`) | 7 ms |
| Warm load, local dev | 0 ms (below the 1 ms timer resolution) |
| Detection per call, local dev | 0–3 ms |
| Cold load, deployed (first isolate) | 667 ms |
| Cold load, deployed (further fresh isolates) | 325 ms, then 14 ms |
| Inline load on a deployed `/detect` request (fresh isolate) | 55 ms |
| Detection per call, deployed | 0–1 ms |
| Weight payload: `tongue_int8.bin` | 2,104,940 bytes (2.01 MiB) |
| Weight payload: `tongue_meta.json` | 2,457 bytes |
| Total weight payload | 2,107,397 bytes (2.01 MiB) |
| Worker bundle (esbuild output) | 54.92 KiB, 17.32 KiB gzip |
| Worker startup time (wrangler-reported) | 1 ms |

The deployed cold load spreads from 14 to 667 ms because each new isolate pays the asset read and the parse on its own. The number depends on isolate placement, not on the model.

## Samples and outputs

The matrix below is the local `wrangler dev` run. `detect` timings are warm-isolate values.

| Case | Input (chars) | Language | Reliability | Too close | Top 3 | detect ms |
| --- | --- | --- | --- | --- | --- | --- |
| Indonesian long paragraph | 532 | `id` | confident | false | `id` 1.0, `ms` 0, `tl` 0 | 3 |
| Indonesian short title | 34 | `id` | confident | false | `id` 0.9795, `ms` 0.0181, `sq` 0.0024 | 0 |
| English long paragraph | 544 | `en` | confident | false | `en` 1.0, `ca` 0, `fr` 0 | 1 |
| English short title | 27 | `en` | confident | false | `en` 1.0, `it` 0, `st` 0 | 1 |
| Ambiguous two words ("Sharing happiness") | 17 | `en` | likely | false | `en` 0.9999, `sw` 0, `it` 0 | 0 |
| Javanese Latin script | 51 | `id` | confident | false | `id` 0.9996, `tl` 0.0002, `ms` 0.0001 | 0 |
| Malay-like sentence | 78 | `ms` | tentative | false | `ms` 0.5961, `id` 0.4039, `sq` 0 | 1 |
| Empty string | 0 | `null` | empty | false | (none) | 0 |

Every case returned HTTP 200 with `ok: true`. Empty input is a defined state, not an error: `language` is `null`, `reliability` is `"empty"`, and `candidates` is empty.

Full response bodies from the local run:

```json
{
 "GET /": {
  "ok": true,
  "model": "tongue",
  "loaded": false,
  "coldLoadMs": null,
  "maxCharacters": 512,
  "routes": ["/", "/detect?text=...", "/warm"]
 },
 "GET /warm (call 1, cold)": { "ok": true, "cold": true, "loadMs": 7, "detectMs": 5, "sample": "id", "coldLoadMs": 7 },
 "GET /warm (call 2, warm)": { "ok": true, "cold": false, "loadMs": 0, "detectMs": 0, "sample": "id", "coldLoadMs": 7 },
 "GET /detect indonesian long paragraph": {
  "ok": true,
  "language": "id",
  "reliability": "confident",
  "isTooCloseToCall": false,
  "top": [
   { "language": "id", "probability": 1 },
   { "language": "ms", "probability": 0 },
   { "language": "tl", "probability": 0 }
  ],
  "inputLength": 532,
  "normalizedLength": 512,
  "normalizedCap": 512,
  "loadMs": null,
  "detectMs": 3
 },
 "GET /detect indonesian short title": {
  "ok": true,
  "language": "id",
  "reliability": "confident",
  "isTooCloseToCall": false,
  "top": [
   { "language": "id", "probability": 0.9795 },
   { "language": "ms", "probability": 0.0181 },
   { "language": "sq", "probability": 0.0024 }
  ],
  "inputLength": 34,
  "normalizedLength": 34,
  "normalizedCap": 512,
  "loadMs": null,
  "detectMs": 0
 },
 "GET /detect english long paragraph": {
  "ok": true,
  "language": "en",
  "reliability": "confident",
  "isTooCloseToCall": false,
  "top": [
   { "language": "en", "probability": 1 },
   { "language": "ca", "probability": 0 },
   { "language": "fr", "probability": 0 }
  ],
  "inputLength": 544,
  "normalizedLength": 512,
  "normalizedCap": 512,
  "loadMs": null,
  "detectMs": 1
 },
 "GET /detect english short title": {
  "ok": true,
  "language": "en",
  "reliability": "confident",
  "isTooCloseToCall": false,
  "top": [
   { "language": "en", "probability": 1 },
   { "language": "it", "probability": 0 },
   { "language": "st", "probability": 0 }
  ],
  "inputLength": 27,
  "normalizedLength": 27,
  "normalizedCap": 512,
  "loadMs": null,
  "detectMs": 1
 },
 "GET /detect ambiguous two words": {
  "ok": true,
  "language": "en",
  "reliability": "likely",
  "isTooCloseToCall": false,
  "top": [
   { "language": "en", "probability": 0.9999 },
   { "language": "sw", "probability": 0 },
   { "language": "it", "probability": 0 }
  ],
  "inputLength": 17,
  "normalizedLength": 17,
  "normalizedCap": 512,
  "loadMs": null,
  "detectMs": 0
 },
 "GET /detect javanese latin script": {
  "ok": true,
  "language": "id",
  "reliability": "confident",
  "isTooCloseToCall": false,
  "top": [
   { "language": "id", "probability": 0.9996 },
   { "language": "tl", "probability": 0.0002 },
   { "language": "ms", "probability": 0.0001 }
  ],
  "inputLength": 51,
  "normalizedLength": 51,
  "normalizedCap": 512,
  "loadMs": null,
  "detectMs": 0
 },
 "GET /detect malay-like sentence": {
  "ok": true,
  "language": "ms",
  "reliability": "tentative",
  "isTooCloseToCall": false,
  "top": [
   { "language": "ms", "probability": 0.5961 },
   { "language": "id", "probability": 0.4039 },
   { "language": "sq", "probability": 0 }
  ],
  "inputLength": 78,
  "normalizedLength": 78,
  "normalizedCap": 512,
  "loadMs": null,
  "detectMs": 1
 },
 "GET /detect empty string": {
  "ok": true,
  "language": null,
  "reliability": "empty",
  "isTooCloseToCall": false,
  "top": [],
  "inputLength": 0,
  "normalizedLength": 0,
  "normalizedCap": 512,
  "loadMs": null,
  "detectMs": 0
 }
}
```

## Gotchas

- **`fromBytes` requires a `Uint8Array`.** A bare `ArrayBuffer` is rejected. Wrap every bytes read: `new Uint8Array(await res.arrayBuffer())`.
- **Input is capped at 512 characters.** Normalisation truncates to `MAX_CHARACTERS = 512` code points before scoring. A 544 character paragraph is scored on its first 512. Check `normalizedLength` when inputs can be long.
- **No `nodejs_compat` needed.** The package guards all `process` access behind `globalThis.process?.env` and reaches node builtins only through dynamic imports inside try/catch. The worker above ran with zero compatibility flags.
- **`isTooCloseToCall` is conservative.** The Malay sentence split `ms` 0.5961 against `id` 0.4039, a 19 point margin, yet the flag stayed `false`. Read `reliability` (`tentative`) as the low-confidence signal. For the Indonesian/Malay pair, treat anything below `confident` as ambiguous.
- **Javanese is not in the 59 labels.** Latin-script Javanese scores as Indonesian with 0.9996 confidence. The model has no way to signal the gap. Downstream code that needs Javanese must not trust a `confident` `id` answer for Javanese-looking text.
- **The load cache is per isolate.** In production, each fresh isolate repeats the asset fetch and the parse. Cache the `Tongue` promise at module scope, and expect the first request after a placement to pay 14 to 667 ms.
- **Timer resolution.** `workerd` quantises `performance.now()`, so most warm detections report 0 or 1 ms. Fine-grained per-call benchmarking needs batching, not single calls.
- **Telemetry turnstile.** The SDK debounces a usage POST to `events.desertant.com` by 3 seconds. A short-lived worker isolate usually exits before it fires, and no text is ever sent. Set `globalThis.__dalUsageDisabled = true` before any detection to switch it off; the `process.env.DAL_USAGE_DISABLED` route also works with `nodejs_compat` enabled.

## Integration notes

Embedding tongue in a Cloudflare Worker takes three steps:

1. Add `"@desert-ant-labs/tongue": "^3.5.0"` as a dependency and copy the two files from the package `dist/` into an assets directory. `npm run setup` in this directory does the copy from the installed package.
2. Bind the assets directory in `wrangler.jsonc`:

```jsonc
{
	"name": "my-worker",
	"main": "src/worker.js",
	"compatibility_date": "2026-09-01",
	"assets": {
		"directory": "./assets",
		"binding": "ASSETS"
	}
}
```

3. Load once at module scope with `Tongue.fromBytes(metadata, new Uint8Array(bytes))`, as in the Setup section. Call `tongue.detect(text)` per request.

Sizing notes for planners: the 2.01 MiB of weights ride in the assets store, not in the worker bundle, so they do not touch the 3 MiB gzipped script limit. The bundle itself is 54.92 KiB with the library included. A detection is arithmetic over the metadata tables, so memory use stays near the 2 MB weight footprint. The model fits routing and triage use cases well: classify short text in under a millisecond, then send only hard cases (`likely`, `tentative`, `isTooCloseToCall`) to a larger model.

## Deployed

Deploy succeeded on 2026-09-25 with `wrangler deploy` from this directory.

- URL: https://desert-ant-tongue.bevry.workers.dev
- Version: `bd6db0ee-cdbb-4115-ad7a-98654595b770`
- Upload: 2 assets (2.01 MiB), worker bundle 54.92 KiB, startup 1 ms

Deployed route checks:

| Route | Result |
| --- | --- |
| `/warm` (1st hit) | cold, load 667 ms, sample `id` |
| `/warm` (2nd hit) | cold, load 325 ms (fresh isolate) |
| `/warm` (3rd hit) | cold, load 14 ms (fresh isolate) |
| `/detect` Indonesian, 153 chars | `id`, confident, false, `id` 0.9919 / `ms` 0.0081 / `tl` 0, inline load 55 ms, detect 0 ms |
| `/detect` English, 104 chars | `en`, confident, false, `en` 1 / `ca` 0 / `it` 0, load 0 ms, detect 0 ms |
