// Desert Ant Labs tongue inside workerd.
// Routes: / (index), /detect?text=... (detection result plus timings), /warm (cold-load timing).
// The weights are served by the ASSETS binding from assets/models/tongue/.
// tongue is pure JavaScript: no wasm, no inference runtime, no compatibility flags.
import { Tongue, MAX_CHARACTERS } from "@desert-ant-labs/tongue";

// any hostname works with an assets binding; the path must match the assets directory layout
const ASSET_BASE = "https://assets.local/models/tongue";

// cached module-level load, so only the first request pays the cold start
let tonguePromise = null;
let coldLoadMs = null;

const round = (ms) => Math.round(ms * 1000) / 1000;

function loadTongue(env) {
	if (tonguePromise) return tonguePromise;
	const started = performance.now();
	tonguePromise = (async () => {
		const [metaRes, binRes] = await Promise.all([
			env.ASSETS.fetch(`${ASSET_BASE}/tongue_meta.json`),
			env.ASSETS.fetch(`${ASSET_BASE}/tongue_int8.bin`),
		]);
		if (!metaRes.ok) throw new Error(`tongue_meta.json: HTTP ${metaRes.status}`);
		if (!binRes.ok) throw new Error(`tongue_int8.bin: HTTP ${binRes.status}`);
		const metadata = await metaRes.json();
		// fromBytes requires a Uint8Array. A bare ArrayBuffer is rejected.
		const bytes = new Uint8Array(await binRes.arrayBuffer());
		return Tongue.fromBytes(metadata, bytes);
	})();
	tonguePromise.then(
		() => {
			coldLoadMs = round(performance.now() - started);
		},
		() => {
			// clear the failed promise, so the next request retries the load
			tonguePromise = null;
		},
	);
	return tonguePromise;
}

const json = (data, status = 200) =>
	new Response(JSON.stringify(data, null, 1), {
		status,
		headers: { "content-type": "application/json" },
	});

export default {
	async fetch(request, env) {
		const url = new URL(request.url);
		const text = url.searchParams.get("text") ?? "";
		try {
			if (url.pathname === "/") {
				return json({
					ok: true,
					model: "tongue",
					loaded: tonguePromise !== null,
					coldLoadMs,
					maxCharacters: MAX_CHARACTERS,
					routes: ["/", "/detect?text=...", "/warm"],
				});
			}
			if (url.pathname === "/detect") {
				const wasCold = tonguePromise === null;
				const loadStart = performance.now();
				const tongue = await loadTongue(env);
				const loadMs = round(performance.now() - loadStart);
				const detectStart = performance.now();
				const d = tongue.detect(text);
				const detectMs = round(performance.now() - detectStart);
				return json({
					ok: true,
					language: d.language,
					reliability: d.reliability,
					isTooCloseToCall: d.isTooCloseToCall,
					top: d.candidates
						.slice(0, 3)
						.map((c) => ({ language: c.language, probability: Math.round(c.probability * 10000) / 10000 })),
					inputLength: text.length,
					normalizedLength: d.normalized.length,
					normalizedCap: MAX_CHARACTERS,
					// loadMs is set only when this request triggered the load
					loadMs: wasCold ? loadMs : null,
					detectMs,
				});
			}
			if (url.pathname === "/warm") {
				const wasCold = tonguePromise === null;
				const loadStart = performance.now();
				const tongue = await loadTongue(env);
				const loadMs = round(performance.now() - loadStart);
				const detectStart = performance.now();
				const sample = tongue.detect("selamat pagi");
				const detectMs = round(performance.now() - detectStart);
				return json({ ok: true, cold: wasCold, loadMs, detectMs, sample: sample.language, coldLoadMs });
			}
			return json({ ok: false, error: "unknown route" }, 404);
		} catch (error) {
			return json(
				{
					ok: false,
					route: url.pathname,
					error: String(error?.message ?? error),
					stack: String(error?.stack ?? "").slice(0, 500),
				},
				500,
			);
		}
	},
};
