# gist on Cloudflare Workers

## Verdict

**FAILS in workerd — the model is browser-only or Container-only by design.** Two independent blockers:

1. The default npm entry initialises LiteRT.js browser setup at module init. In workerd that crashes the module with `TypeError: Invalid URL string.` before `Gist.load()` is reachable. A static import crashes the whole isolate at boot; only a dynamic import turns the crash into a catchable request-time failure.
2. The `/native` entry (the server path) is a koffi native addon. Native addons cannot run in workerd. In plain Node it works, and the measured 203 MB RSS exceeds the fixed 128 MB workerd isolate cap, so even a wasm-capable build would not fit with the multilingual weights.

Cloudflare homes for gist: the admin UI browser (LiteRT.js, the intended design) or a Cloudflare Container running Node with the native core.

## Setup

- `src/worker.js` — the workerd probe. It uses a dynamic import inside the route so the module-init crash becomes a catchable failure, and returns the exact error.
- `scripts/native.mjs` — the Node reference run against `@desert-ant-labs/gist/native` on Linux x86.
- `test/gist.test.mjs` — `npm test` boots wrangler dev and asserts the recorded failure mode.

The model downloads from the pinned Hugging Face tag on first use (about 80 MB) and caches. Nothing model-sized ships in the npm tarball.

## Measurements

| Measurement | Value |
| --- | --- |
| workerd, static import | isolate crash at boot (`initBrowser` → `Invalid URL string.`); no route serves |
| workerd, dynamic import | request-time `TypeError: Invalid URL string.` after 1 ms |
| Node native, load (warm cache) | 316–346 ms |
| Node native, classify | 519.5 ms first call, 2.9 ms after |
| Node native, memory | 203–215 MB RSS |
| Isolate cap comparison | 128 MB fixed — the native build cannot fit even if the wasm gap closed |

## Samples and outputs

workerd probe (`/probe`):

```json
{
	"ok": false,
	"failedAfterMs": 1,
	"name": "TypeError",
	"message": "Invalid URL string.",
	"stackHead": "TypeError: Invalid URL string.\n    at initBrowser ...\n    at init ...\n    at browserSetup ..."
}
```

Node native classify output:

```
["Power of Goodness di GITJ Tlogowungu: kegiatan bulanan melatih keberanian..."]
→ self-improvement 0.913, health-fitness 0.782, parenting-family 0.579

["Sharing happiness: community art day for children in Pati"]
→ parenting-family 0.887, arts-culture 0.658, society-culture 0.538
```

## Gotchas

- The static-import crash is the sharpest edge: it kills the isolate before any route runs. Any worker that merely imports the package for SSR-style reuse dies. Use a dynamic import if you must attempt the browser path, but the outcome below stands.
- The failure comes from LiteRT browser setup, not from the model: gist's model card states the model is a static embedding plus hashed n-grams with no transformer at inference. The weights would likely fit near the isolate cap; the runtime, not the maths, is the blocker.
- The English-only build (about 15 MB) is currently selectable from the Swift SDK only, so it cannot narrow the gap on Workers either.

## Integration notes

- Browser: `Gist.load()` in the admin UI works as designed (LiteRT.js in a real browser context). This is the zero-server path.
- Server: run the Node native core in a Cloudflare Container (GA 2026-04, scale to zero), reached over a service binding. Classification is 3 ms per call after load, so a tiny container serves the whole corpus.
- Workers AI cannot host these weights (no arbitrary-model upload), and AI Gateway does not host anything — it only routes.

## Deployed

Not deployed. The worker cannot start with a static import and cannot load the model with a dynamic one, so there is nothing to deploy.
