// Worker for testing @desert-ant-labs/emo on the workerd runtime.
//
// Routes:
// - GET  /          service description
// - GET  /health    readiness without triggering a load
// - POST /load      trigger the cold load and report its timings
// - GET  /suggest?q=...[&limit=][&skinTone=]
// - POST /suggest   body { text, limit?, skinTone? }
// - POST /matrix    run the fixed English + Indonesian + no-emoji test matrix

import { debugRun, getTrace, loadEmo } from "./emo-workerd.js";

const TEST_MATRIX = [
	{ label: "en marathon", text: "finished a marathon today" },
	{ label: "id graduation", text: "anak saya lulus ujian" },
	{ label: "id rain", text: "hujan turun sepanjang hari di Pati" },
	{ label: "en coffee", text: "first coffee of the morning" },
	{ label: "no emoji expected", text: "account 8822 validation pending review" },
];

/** @type {{ state: string, ready: boolean }} */
const health = { state: "cold", ready: false };

function json(data, status = 200) {
	return new Response(JSON.stringify(data, null, 2), {
		status,
		headers: { "content-type": "application/json; charset=utf-8" },
	});
}

async function handleSuggest(urlOrBody, origin) {
	const params = urlOrBody instanceof URL
		? { text: urlOrBody.searchParams.get("q") ?? "", limit: urlOrBody.searchParams.get("limit"), skinTone: urlOrBody.searchParams.get("skinTone") }
		: urlOrBody;
	const text = String(params.text ?? "");
	const options = {};
	if (params.limit != null) options.limit = Number(params.limit);
	if (params.skinTone != null) options.skinTone = params.skinTone;

	const { emo, timings: loadTimings } = await loadEmo(origin);
	const t0 = performance.now();
	const suggestions = await emo.suggestions(text, options);
	const ms = Math.round((performance.now() - t0) * 100) / 100;
	return json({
		input: { text, ...options },
		suggestions,
		callMs: ms,
		loadTimings,
	});
}

export default {
	async fetch(request) {
		const url = new URL(request.url);
		const origin = url.origin;
		try {
			if (url.pathname === "/") {
				return json({
					service: "desert-ant-emo workerd test",
					routes: ["GET /", "GET /health", "POST /load", "GET /suggest?q=", "POST /suggest", "POST /matrix"],
				});
			}
			if (url.pathname === "/health") {
				return json({ ...health, loaded: health.ready ? "ready" : health.state });
			}
			if (url.pathname === "/trace") {
				return json({ trace: getTrace() });
			}
			if (url.pathname === "/debug/run") {
				const { loadEmo: load } = await import("./emo-workerd.js");
				await load(origin);
				const result = await debugRun(url.searchParams.get("text") ?? "hello", 0);
				return json({ result });
			}
			if (url.pathname === "/load" && request.method === "POST") {
				const t0 = performance.now();
				const { modelInfo, timings } = await loadEmo(origin);
				health.state = "ready";
				health.ready = true;
				return json({ modelInfo, timings, totalLoadMs: Math.round((performance.now() - t0) * 100) / 100 });
			}
			if (url.pathname === "/suggest" && request.method === "GET") {
				health.state = "ready";
				return handleSuggest(url, origin);
			}
			if (url.pathname === "/suggest" && request.method === "POST") {
				health.state = "ready";
				return handleSuggest(await request.json(), origin);
			}
			if (url.pathname === "/matrix" && request.method === "POST") {
				const t0 = performance.now();
				const { emo, modelInfo, timings } = await loadEmo(origin);
				health.state = "ready";
				health.ready = true;
				const results = [];
				for (const item of TEST_MATRIX) {
					const start = performance.now();
					const suggestions = await emo.suggestions(item.text, { limit: 3 });
					results.push({
						...item,
						suggestions,
						callMs: Math.round((performance.now() - start) * 100) / 100,
					});
				}
				return json({
					modelInfo,
					loadTimings: timings,
					matrixWarmupMs: Math.round((performance.now() - t0) * 100) / 100,
					results,
				});
			}
			return json({ error: `no route for ${request.method} ${url.pathname}` }, 404);
		} catch (cause) {
			return json({ error: String(cause && cause.stack ? cause.stack : cause) }, 500);
		}
	},
};
