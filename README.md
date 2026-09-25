# desert-ant-cloudflare

Cloudflare Workers test harness for the [Desert Ant Labs](https://desertant.com) on-device models.

Desert Ant publishes small specialised models for language detection, topic tagging, keyword extraction, speech, and text generation. Their JavaScript SDKs target browsers and Node. This repository answers one question for each model: **does it run on Cloudflare's `workerd` runtime, and how well?**

Each model directory contains a self-contained worker test. Results land in `models/<name>/RESULTS.md`, and the combined picture lives in `docs/results.md`.

## Results summary

See [docs/results.md](./docs/results.md) for the current table. The short version, tested 2026-09-25:

| Model | Cloudflare verdict |
| --- | --- |
| tongue | Passes in `workerd` |

## License

Unless stated otherwise all works are:

- Copyright &copy; [Benjamin Lupton](https://balupton.com)

and licensed under:

- [Reciprocal Public License 1.5](http://spdx.org/licenses/RPL-1.5.html)
