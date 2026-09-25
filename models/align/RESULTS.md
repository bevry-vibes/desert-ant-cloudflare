# align on Cloudflare Workers

## Verdict

**NOT TESTABLE ON CLOUDFLARE WORKERS (SDK has no wasm build) — PASSES in Node via the native core.** The package bundles into workerd cleanly, but `Align.load()` refuses to run outside Node by design. The Cloudflare path for align is a Container running Node, not a Worker.

The models page (desertant.com/models/align/) lists align as Swift-only, yet `@desert-ant-labs/align` 3.5.0 exists on npm with a full native core for Linux and macOS. The npm package is real and current; the page is out of date.

## Setup

The package ships two entries:

- The default entry imports cleanly in any runtime, including workerd and SSR. `Align.load()` then throws an actionable error.
- `@desert-ant-labs/native` loads a koffi native addon (LiteRT core). Native addons cannot run in workerd.

The Node reference run lives in `scripts/node-align.mjs`. It reads the WAV fixture, builds coarse per-word slots from the known transcript, and calls `align.refine(samples, sampleRate, coarse, { language: "en" })`.

The worker probe lives in `src/worker.js`. It decodes the fixture inside workerd (proving the audio path works) and records the exact load refusal.

## Measurements

| Measurement | Value |
| --- | --- |
| Weight download | HF pinned tag; cached after first use (load 53 ms warm) |
| Load, Node native, warm | 53 ms |
| Refine, 11 s audio, 22 words | 350.7–368.7 ms over 5 runs |
| Memory, Node RSS after load and refine | 154.5 MB (66.4 MB before load) |
| workerd bundle | imports cleanly; `Align.load()` throws before any model work |
| Fixture | `fixtures/jfk-16k-mono.wav`, 352,078 bytes, 16 kHz mono, 11.000 s |

## Samples and outputs

Refined word timestamps for the JFK fixture (coarse slots in, word-accurate times out):

```
0.359 → 0.539  And
0.602 → 0.928  so
0.988 → 1.248  my
1.288 → 1.957  fellow
2.034 → 2.328  Americans
...
10.556 → 11.249  country
```

Words the model could not locate keep their coarse slot and report `passthru`. Empty audio raises `RangeError: align: the audio is empty`.

workerd probe (`/align` route): fixture decode succeeds (176,000 samples at 16 kHz in 6 ms), then `Align.load()` fails with:

```
@desert-ant-labs/align has no browser/WebAssembly build: word-timestamp refinement
runs a two-graph cascade and the wasm host compiles one model per module.
On a server, import "@desert-ant-labs/native".
```

## Gotchas

- The refusal is by design, not a workerd bug: the wasm host compiles one model per module, and align needs a two-graph cascade.
- The native core needs koffi, which cannot load in workerd.
- The 154 MB Node RSS also rules out the 128 MB workerd isolate cap, independent of the wasm gap.

## Integration notes

- Run align behind a Cloudflare Container (GA 2026-04) with the Node native core, scale to zero, and call it over a service binding. The refine step is cheap (about 355 ms per 11 s of audio), so the container stays warm for minutes of work.
- Align pairs with a transcriber: coarse slots in, refined word times out. The `refined`/`passthru` flag tells you which words moved.

## Deployed

Not deployed. The worker cannot load the model in workerd, so there is nothing to deploy.
