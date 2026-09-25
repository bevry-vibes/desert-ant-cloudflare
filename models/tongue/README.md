# tongue

Tests the [Desert Ant Labs tongue](https://desertant.com/models/tongue/) on-device language identification model inside Cloudflare `workerd`. tongue identifies 59 languages from short text. It is pure JavaScript with no wasm and no inference runtime.

## Setup

Run `npm install` in the repository root to install wrangler.

Run `npm install` in this directory to install `@desert-ant-labs/tongue`.

Run `npm run setup` to copy the two weight files out of the installed package into `assets/models/tongue/`. The copy is required because a bundler does not serve files out of `node_modules`. The `.bin` file is gitignored, so weights are never committed.

## Test

Run `npm test`. The script starts `wrangler dev` on port 8821, curls every route, asserts the detection matrix, and stops the server. It exits non-zero when a check fails.

Results and measurements live in [RESULTS.md](./RESULTS.md).

## Routes

- `/` reports the load state and the normalisation cap.
- `/detect?text=...` returns the language, reliability, `isTooCloseToCall`, the top three candidates, and timings.
- `/warm` loads the model and reports the cold-load time. Call it once for a cold measurement and again for a warm one.
