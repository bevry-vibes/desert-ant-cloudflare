# Desert Ant Labs model inventory

Compiled on 2026-09-25 from the sources listed at the end of this page.
Every claim below was checked against a fetched source.
The catalogue snapshot at desertant.com is dated 2026-09-24.

## About the lab

Desert Ant Labs is a laboratory for on-device models and inference.
It publishes small, specialised models, with SDKs for Apple, Android, and the web.
The models run on the user's device, so text, audio, and images never leave it.
Every model is free below 100,000 monthly active devices per SDK.
Inference is unlimited per user.

## Licence

All 17 hub repositories carry the same licence.
The Hugging Face cards record `license: other` with `license_name: desert-ant-labs-source-available-1.0`.
The terms are device-framed throughout.
The free tier counts monthly active devices per platform, for each model.
Above 100,000 devices on one platform, a commercial licence is required.
Research and teaching use is exempt from that threshold.
You must not train a competing model on the weights, their outputs, or their logs.
You must credit Desert Ant Labs in your application.
This table abbreviates the licence token as DAL-SA-1.0.

## SDK architecture

The SDKs live in the `desert-ant-core` repository on GitHub, with one product per model.
Swift packages use Core ML, and require iOS 18+, macOS 15+, tvOS 18+, or visionOS 2+.
Kotlin packages use LiteRT, and require Android API 24+ on arm64-v8a and x86_64.
Each JavaScript model is its own npm package, published at version 3.5.0.
The JavaScript packages follow one of three shapes:

- Pure JavaScript: Tongue bundles its weights, needs no runtime, and runs in any host.
- WebAssembly: the browser builds run a LiteRT model through LiteRT.js, with a WASI shim.
- Native: the Node builds load a prebuilt native core through FFI, for linux-x64, linux-arm64, and darwin-arm64.

Weights are published on the Hugging Face hub.
Each SDK version pins one model revision, and every download is verified before use.
Tongue is the exception: its weights ship inside the packages, so nothing downloads.
The shared runtime package is `@desert-ant-labs/core` at 3.5.0.
It holds the LiteRT.js host session, the koffi native loader, and the FFI buffer reader.

## Inventory

The Cloudflare verdict records feasibility on Cloudflare's `workerd` runtime only.
The measured runtime outcomes live in `docs/results.md` and `models/*/RESULTS.md`.
Sizes are decimal megabytes (MB), taken from the Hugging Face file trees.
`*.mlmodelc/` entries are compiled Core ML bundles for Apple platforms.

| Model | Purpose | SDK platforms | npm package | Hugging Face weight files | Licence | Cloudflare verdict |
| --- | --- | --- | --- | --- | --- | --- |
| Redact | Strips personal data from typed text in 27 languages. | Swift, Kotlin, JS (browser WASM + Node native) | `@desert-ant-labs/redact` 3.5.0 | `redact.tflite` 24.5 MB<br>`redact_tokenizer.bin` 0.4 MB<br>`tokenizer.json` 2.3 MB<br>`labels.json`, `config.json`<br>`redact.mlmodelc/` | DAL-SA-1.0 | Feasible through the browser WASM build. The Node build is native and cannot load. Untested. |
| Emo | Suggests emoji for a message in 22 languages. | Swift, Kotlin, JS | `@desert-ant-labs/emo` 3.5.0 | `emo.tflite` 10.2 MB<br>`emo_tokenizer.bin` 0.7 MB<br>`emo_meta.json`<br>`emo.mlmodelc/` | DAL-SA-1.0 | Feasible through the browser WASM build. Untested. |
| Gist | Assigns topics from a 36-topic taxonomy in 101 languages. | Swift, Kotlin, JS (English variant only via Swift) | `@desert-ant-labs/gist` 3.5.0 | `gist.tflite` 13.0 MB<br>`gist_embedding.i8` 66.9 MB<br>`gist_tokenizer.bin` 4.6 MB<br>`taxonomy.json`<br>`en/` English variant, about 15 MB | DAL-SA-1.0 | Feasible through the browser WASM build. About 85 MB of weights must be fetched. Untested. |
| Shapes | Classifies one hand-drawn stroke as a rectangle, ellipse, triangle, star, or line. | Swift, Kotlin, JS | `@desert-ant-labs/shapes` 3.5.0 | `shapes.tflite` 1.3 MB<br>`shapes.safetensors` 0.2 MB | DAL-SA-1.0 | Feasible through the browser WASM build. The weights are small. Untested. |
| Clear | Denoises, dereverberates, and loudness-normalises speech audio. | Swift, Kotlin, JS | `@desert-ant-labs/clear` 3.5.0 | per variant (`studio`, `natural`):<br>`clear-*.onnx` 24.8 MB<br>`clear-*.tflite` 49.3 MB<br>`clear-*.mlmodelc.zip` 9.0 MB<br>`clear-*.aimodel.zip` 22.1 MB | DAL-SA-1.0 | Feasible in principle through the browser WASM build. 49 MB per variant. Untested. |
| Uhm | Marks filler words in audio to within 20 ms. | Swift only (Kotlin and JS announced) | none | `uhm.onnx` 94.0 MB<br>`uhm-web-fp16.onnx` 47.0 MB<br>`uhm.tflite` 23.9 MB<br>`UhmLabel.mlmodel` 0.01 MB | DAL-SA-1.0 | No JS SDK exists. The published ONNX weights make a custom ONNX Runtime Web port plausible. Untested. |
| Tongue | Identifies the language of short text across 84 languages. | Swift, Kotlin, JS (pure JS, weights bundled) | `@desert-ant-labs/tongue` 3.5.0 | `tongue.onnx` 8.4 MB<br>`tongue_int8.bin` 2.1 MB<br>`tongue_int4.bin` 1.1 MB<br>`labels.json`, `tongue_meta.json` | DAL-SA-1.0 | Passes in `workerd`: pure JavaScript with bundled weights. See `docs/results.md`. |
| Align | Refines the word timestamps of a transcript against the audio. | Swift. A Node-only JS package exists on npm; the site lists JS as coming soon. | `@desert-ant-labs/align` 3.5.0 (Node only) | `align-coarse.tflite` 0.5 MB<br>`align-fine.tflite` 0.5 MB<br>`calibrator.bin` 0.07 MB<br>`mel_filters.bin` 0.04 MB | DAL-SA-1.0 | The JS package needs the native core by design, and no browser build exists. Not feasible without a new port. |
| Clips | Ranks highlights and shorts from a transcript. | Swift (LiteRT files published but unsupported in the SDK) | none | `clips-scorer.tflite` 282.6 MB<br>`clips-selector.tflite` 283.2 MB<br>`clip_tokenizer.bin` 4.1 MB | DAL-SA-1.0 | Swift SDK only, and the published LiteRT files total 566 MB. Not feasible. |
| Ear | Identifies the spoken language of a recording across 99 languages. | Swift, Kotlin, JS | `@desert-ant-labs/ear` 3.5.0 | `ear.tflite` 23.1 MB<br>`mel_filters.f32` 0.06 MB<br>`languages.json` | DAL-SA-1.0 | Feasible through the browser WASM build. Untested. |
| Title | Writes a three to eight word title and a short description for a passage. | Swift only, Apple silicon, MLX | none | `model.safetensors` 286.4 MB<br>`tokenizer.json` 7.2 MB<br>`config.json`, `chat_template.jinja` | DAL-SA-1.0 | MLX runs on Apple silicon only. No workerd path exists. Not feasible. |
| Voz | Transcribes speech with word timestamps in 25 languages. | Swift. A JS package exists on npm (browser WebGPU + Node); the site lists JS as coming soon. | `@desert-ant-labs/voz` 3.5.0 | `encoder.tflite` 1,207.5 MB<br>`decoder.tflite` 24.5 MB<br>`mel.tflite` 1.7 MB<br>`embedding.f16` 10.5 MB<br>`web/`: `encoder.onnx` 0.8 MB + `encoder.onnx.data` 349.0 MB, `decoder.onnx` 23.3 MB | DAL-SA-1.0 | `workerd` has no WebGPU, and the encoder alone exceeds 1.2 GB. Not feasible. |
| Moderator | Scores an image for nudity before upload. | HF card and npm list every platform; the marketing site still lists closed beta. | `@desert-ant-labs/moderator` 3.5.0 | `moderator.tflite` 9.6 MB<br>`moderator.mlmodelc/` | DAL-SA-1.0 | Feasible through the browser WASM build at 9.6 MB. Untested. |
| Toxic | Flags hateful, abusive, and threatening text in 23 European languages. | none (closed beta) | none | `toxic.onnx` 100.2 MB<br>`toxic.tflite` 90.6 MB<br>`tokenizer.json` 3.7 MB<br>`toxic_tokenizer.bin` 1.3 MB | DAL-SA-1.0 | No SDK yet. The ONNX file is published for ONNX Runtime Web, so a custom port is plausible. |
| Toxic-en | English-only specialist of the toxic family. | none (closed beta) | none | `toxic-en.onnx` 32.6 MB<br>`toxic-en.tflite` 33.9 MB<br>`toxic-en.pt` 129.2 MB<br>`tokenizer.json` 1.2 MB | DAL-SA-1.0 | No SDK yet. The 32.6 MB ONNX file is the most tractable candidate on the hub. |
| Who | Labels speakers in a recording with face boxes and timestamps. | none (closed beta, Apple first) | none | compiled Core ML bundles only:<br>`who-voice` 5.5 MB, `who-segment` 2.8 MB<br>`who-face` 0.7 MB, `silero-vad-batch` 1.4 MB<br>plus five smaller bundles and two `.f32` tables | DAL-SA-1.0 | Only compiled Core ML bundles are published. No portable weight format exists. Not feasible. |
| Schemer | Extracts typed JSON fields from text against a caller-supplied schema. | none shipped (closed beta) | none | `schemer-encoder.tflite` 116.9 MB<br>`schemer-decode.tflite` 20.0 MB<br>`schemer-label.tflite` 3.0 MB<br>`embeddings.q` 79.6 MB<br>`schemer_tokenizer.bin` 11.0 MB | DAL-SA-1.0 | No SDK yet. The LiteRT files are WASM-runnable in principle, but they total about 230 MB. |

Notes on the table:

- Two bases are third-party. Voz is built on NVIDIA Parakeet TDT 0.6B v3, released under CC BY 4.0, with the conversion and compression by Desert Ant Labs. Title is fine-tuned from `ibm-granite/granite-4.0-350m`.
- The catalogue lists JS support for Align and Voz as coming soon. Both npm packages exist at 3.5.0. The Align package is Node-only: its default entry imports everywhere, but `load()` refuses without the `/native` subpath.
- The catalogue still lists Moderator as closed beta with no SDK repository. Its Hugging Face card publishes install lines for every platform, the `desert-ant-core` README lists it as available, and the npm package exists.
- The site's closed-beta list also names Eye and Face. The catalogue gives weight URLs for both, but no public repositories exist on the hub: the API returns 401. They are omitted from this table.

## Hugging Face only

These five repositories have published weights but no shipped JavaScript SDK.
The `desert-ant-core` README lists Toxic, Schemer, and Who under "In closed beta":
weights exist and the models work, but no SDK ships them yet.
The npm registry returns 404 for `@desert-ant-labs/toxic`, `toxic-en`, `schemer`, and `who`.
Moderator is the exception, and it is described with that correction below.

### Toxic

Toxic is a triage aid for hate speech, not a verdict machine.
It scores three content heads, named `HATEFUL`, `ABUSIVE`, and `THREAT`, plus ten protected-group target heads covering race, colour, religion, and other grounds.
It covers 23 European languages from one encoder of 159.6M parameters.
The card reports 0.847 macro-F1 on real Multilingual HateCheck across seven EU languages, measured on the shipped weights.
The artefacts are an ONNX int4 file of 100.2 MB, a LiteRT int4 file of 90.6 MB, and a Core ML bundle of 80.2 MB.
The card describes the ONNX file as the browser artefact for ONNX Runtime Web.
There is no JS SDK because the model is closed beta.
The lab has shipped no package, and the core README records that no SDK ships it.
The published ONNX browser artefact keeps a custom Workers port plausible.

### Toxic-en

Toxic-en is the English specialist of the toxic family, sized after Whisper's `.en` models.
It has about 31.9M parameters, roughly a fifth of the multilingual model, and scores 0.855 macro-F1 on English HateCheck against 0.8523 for Toxic.
It ships int8 rather than int4, because int4 costs its smaller encoder too much quality; the card states that choice was measured.
The artefacts are an ONNX file of 32.6 MB, a LiteRT file of 33.9 MB, and a Core ML bundle.
A 129.2 MB PyTorch state dict is also published.
There is no JS SDK for the same reason: closed beta, with no package published.

### Who

Who performs audio-visual speaker labelling.
It splits a recording into per-person turns, each with a speaker id, a face-track id, a normalised face box, and millisecond timestamps.
The Hugging Face card is a stub of 106 bytes: frontmatter plus a title, with the prose living on the website instead.
The repository publishes only compiled Core ML bundles, zipped `.mlmodelc` directories for voice, face, segmentation, VAD, and support models, plus two small `.f32` tables.
There is no JS SDK because no SDK ships the model, and no portable weight format exists for a Workers port.

### Moderator

Moderator scores an image from 0 to 1 for nudity or sexual activity, with per-region detail.
It is a MobileNetV4-Conv-Medium model at 384 pixels, trained only on licensed and synthetic images.
This entry corrects the brief: Moderator is no longer hub-only in practice.
Its Hugging Face card publishes install lines for iOS, macOS, tvOS, visionOS, Android, Linux, Windows, Browser, and Node.
The `desert-ant-core` README lists it in the available table, and `@desert-ant-labs/moderator` 3.5.0 exists on npm.
The marketing catalogue still shows closed beta with no repository, so the site lags the SDK release.

### Schemer

Schemer extracts typed JSON from text against a caller-supplied JSON schema.
It decodes strings, numbers, booleans, datetimes, labels, and arrays.
It reports a missing field as null instead of inventing one.
The card scores that absence detection at 0.911.
The site specs put the model at 211M parameters, a pruned mmBERT-base encoder, at about 230 MB per platform across 13 languages.
The repository publishes LiteRT int8 files of 116.9 MB, 20.0 MB, and 3.0 MB, with Core ML bundles beside them.
It also publishes a shared 79.6 MB int8 embedding table and an 11.0 MB tokenizer.
There is no JS SDK.
The core README lists Schemer as closed beta, its card install block names no platforms, and the npm package does not exist.

## Weight portability

These highlights describe how far each format travels beyond the official SDKs.

### Title

The repository holds one 286.4 MB `model.safetensors` file with a shard index, `config.json`, a generation config, tokenizer files, and `chat_template.jinja`.
Any runtime that loads safetensors can read the bytes.
The card adds two cautions.
The repo is an MLX model directory with 6-bit quantisation, so the loader must understand MLX checkpoints.
The chat template is part of the task definition.
MLX itself runs on Apple silicon and nowhere else, so the published SDK path stays Apple-only.

### Tongue

The ONNX graph is fp32, opset 17, and 8.4 MB, and it carries only the linear head.
The host performs normalisation, feature hashing, and script routing before the graph, as documented in `tongue_meta.json`.
No tokenizer file exists, so nothing needs version matching.
The raw `tongue_int8.bin` (2.1 MB) and `tongue_int4.bin` (1.1 MB) bins feed the same host logic.
Any runtime that can hash characters and multiply a sparse vector by a matrix can reproduce the model.
That is why the JS package needs no runtime.

### Gist

The card states the design directly: "static embedding + hashed n-grams, no transformer at inference".
Inference is an embedding lookup plus a small head, and nothing else.
The head ships as a 13.0 MB LiteRT file and a Core ML bundle.
The 66.9 MB int8 embedding table and the 4.6 MB tokenizer are ordinary data files.
The English-only variant under `en/` shrinks the embedding to 8.3 MB, for about 15 MB in total.
A host that implements the lookup, the hashing, and the head arithmetic could run Gist without LiteRT.

### What this means outside the official SDKs

Models that publish ONNX files are candidates for ONNX Runtime Web under WASM: Tongue, Clear, Uhm, Toxic, Toxic-en, and the Voz web encoder.
Models that publish LiteRT files are candidates for LiteRT.js under WASM: Redact, Emo, Gist, Shapes, Ear, Moderator, Schemer, and the Clips files.
Compiled Core ML bundles are Apple-only and unusable in `workerd`.
The prebuilt native Node cores cannot load in `workerd` either, which rules out the default Node path for every WASM model.

## Sources

Every URL below was fetched on 2026-09-25.

- Machine-readable catalogue: https://desertant.com/llms.txt
- Full site content export: https://desertant.com/llms-full.txt
- JSON catalogue of models and platforms: https://desertant.com/catalog.json
- Model page sampled directly (the twelve pages share one shape; their content was consumed through the three mirrors above): https://desertant.com/models/align/
- Licence terms: https://license.desertant.com/1.0
- Licence pointer notice in the Align repository: https://huggingface.co/desert-ant-labs/align/raw/main/LICENSE.md
- Hugging Face organisation listing: https://huggingface.co/api/models?author=desert-ant-labs&limit=100
- File tree per repository, for all 17 repositories: https://huggingface.co/api/models/desert-ant-labs/<repo>/tree/main
- Sub-tree for the Voz web artefacts: https://huggingface.co/api/models/desert-ant-labs/voz/tree/main/web
- Sub-tree for the Gist English variant: https://huggingface.co/api/models/desert-ant-labs/gist/tree/main/en
- Model card per repository, for all 17 repositories: https://huggingface.co/desert-ant-labs/<repo>/raw/main/README.md
- GitHub organisation repositories: https://api.github.com/orgs/Desert-Ant-Labs/repos?per_page=100
- SDK monorepo README: https://raw.githubusercontent.com/Desert-Ant-Labs/desert-ant-core/main/README.md
- COnnxRuntime README: https://raw.githubusercontent.com/Desert-Ant-Labs/COnnxRuntime/main/README.md
- npm registry per package: https://registry.npmjs.org/@desert-ant-labs/<name>
- npm packages confirmed present at 3.5.0: `core`, `tongue`, `gist`, `emo`, `redact`, `shapes`, `clear`, `ear`, `voz`, `align`, `moderator`
- npm packages confirmed absent (HTTP 404): `toxic`, `toxic-en`, `title`, `uhm`, `clips`, `schemer`, `who`, `eye`, `face`

### GitHub organisation

- `desert-ant-core`: the SDKs for Swift, Kotlin, and JavaScript, on Core ML, LiteRT, and WebAssembly.
- `desert-ant-swift`: shared Swift core: design tokens, demo components, and a ModelStore that downloads and caches Hugging Face weights.
- `desert-ant-cli`: runs the models from a terminal, on macOS (Apple silicon) and Linux, installable through Homebrew.
- `desert-ant-web-examples`: web examples repository, listed without a description on GitHub.
- `demo-clipper`: example macOS app and CLI that generates short clips fully on device.
- `COnnxRuntime`: a thin C shim over the ONNX Runtime C API, packaged for SwiftPM.
  It owns one session and its output buffers, so Swift code avoids the function-pointer API table.
  It was split out of `desert-ant-core`, where it backs the `OnnxSession` inference backend and the Windows build of Voz.
  The README states that Windows is the only platform it has been built and run on.
- `homebrew-tap`: Homebrew casks for Desert Ant Labs apps.
- `.github`: organisation profile.

### Not verified

- The file trees were read one level deep, plus the `voz/web` and `gist/en` sub-trees.
  The contents inside each `.mlmodelc/` bundle were not enumerated.
- The Eye and Face repositories: the API returns 401, so their existence as gated private repositories could not be confirmed or denied.
- Runtime behaviour in `workerd` for every model except Tongue.
  The per-model tests live in `models/*/RESULTS.md` and `docs/results.md`, outside this document.
