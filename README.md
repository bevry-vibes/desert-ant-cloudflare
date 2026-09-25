# desert-ant-cloudflare

Cloudflare Workers test harness for the [Desert Ant Labs](https://desertant.com) on-device models.

Desert Ant publishes small specialised models for language detection, topic tagging, keyword extraction, speech, and text generation. Their JavaScript SDKs target browsers and Node. This repository answers one question for each model: **does it run on Cloudflare's `workerd` runtime, and how well?**

Each model directory contains a self-contained worker test. Results land in `models/<name>/RESULTS.md`, and the combined picture lives in [docs/results.md](./docs/results.md).

## Results summary

Tested 2026-09-25. Full table and the decision tree in [docs/results.md](./docs/results.md).

| Model | workerd verdict |
| --- | --- |
| tongue | **Passes** — pure JS, 0–1 ms per detection |
| shapes | **Passes** — LiteRT.js wasm, 1–3 ms per stroke |
| clear | **Passes** — speech enhancement at 6.5–8× realtime |
| ear | **Passes** — spoken language ID, ~6× realtime |
| moderator | **Passes with caveats** — image NSFW classification, flat frames false-positive |
| emo, redact | **Partial** — loads, but inference stalls in the BridgeJS async path (works in Node) |
| gist, align | **Fail in workerd** — LiteRT browser-only or koffi native; Node and Cloudflare Containers work |
| voz | **Fails** — onnxruntime-web cannot initialise; weights exceed the isolate cap |
| title, uhm, clips, toxic, and friends | **No JS SDK** — Swift only, or Hugging Face weights only |

Five workers are deployed and verified on `*.bevry.workers.dev` (tongue, shapes, clear, ear, moderator). See each `RESULTS.md` for URLs and evidence.

## Layout

| Path | Purpose |
| --- | --- |
| `models/<name>/` | One self-contained test per model: `package.json`, `wrangler.jsonc`, `src/worker.js`, optional `assets/` and `fixtures/`, `RESULTS.md` |
| `docs/models.md` | Inventory of every Desert Ant model, its SDK platforms, and weight formats |
| `docs/results.md` | Combined results table and the runtime decision tree |

## Commands

```bash
npm install        # install wrangler at the repository root
npm test           # run every model test that defines a test script
```

Run one model in isolation:

```bash
cd models/<name>
npm install        # per-model dependencies
npm test           # boots wrangler dev, runs assertions, stops the server
```

## Rules

- Model weights are fetched, never committed. The root `.gitignore` excludes the weight formats under `models/*/assets/`.
- Each model keeps its own `package.json`, so dependency installs stay isolated and parallel.
- Write all content in Simplified Technical English with International English spelling. See the conventions skill.

<!-- LICENSE/ -->

## License

Unless stated otherwise all works are:

- Copyright &copy; [Benjamin Lupton](https://balupton.com)

and licensed under:

- [Reciprocal Public License 1.5](http://spdx.org/licenses/RPL-1.5.html)

<!-- /LICENSE -->
