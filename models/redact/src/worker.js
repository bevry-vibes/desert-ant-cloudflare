// Worker for testing @desert-ant-labs/redact on the workerd runtime.
//
// Routes:
// - GET  /          service description
// - GET  /health    readiness without triggering a load
// - GET  /trace     buffered wiring trace lines
// - POST /load      trigger the cold load and report its timings
// - GET  /redact?q=...[&confidence=]
// - POST /redact    body { text, minimumConfidence?, labels? }
// - POST /matrix    run the fixed English + Indonesian + no-PII test matrix

import { getTrace, loadRedact } from "./redact-workerd.js";

const TEST_MATRIX = [
	{
		label: "en contact",
		text: "Email Anna Wijaya at anna.wijaya@example.com or call +62 812-3456-7890 about the invoice.",
		options: {},
	},
	{
		label: "id contact",
		text: "Hubungi Budi Santoso di budi.santoso@contoh.co.id atau telepon 0812-3456-7890. Alamat: Jalan Pemuda 12, Pati.",
		options: {},
	},
	{
		label: "en address",
		text: "Maria Silva lives at 221B Baker Street, London NW1 6XE. Card 4111 1111 1111 1111 is on file.",
		options: {},
	},
	{
		label: "no PII expected",
		text: "The meeting starts at nine and the agenda is attached.",
		options: {},
	},
];

/** @type {{ state: string, ready: boolean }} */
const health = { state: "cold", ready: false };

function json(data, status = 200) {
	return new Response(JSON.stringify(data, null, 2), {
		status,
		headers: { "content-type": "application/json; charset=utf-8" },
	});
}

async function handleRedact(source, origin) {
	const params = source instanceof URL
		? {
			text: source.searchParams.get("q") ?? "",
			minimumConfidence: source.searchParams.get("confidence"),
			labels: source.searchParams.get("labels"),
		}
		: source;
	const text = String(params.text ?? "");
	const options = {};
	if (params.minimumConfidence != null) options.minimumConfidence = Number(params.minimumConfidence);
	if (params.labels != null) options.labels = String(params.labels).split(",").filter(Boolean);

	const { redact, timings: loadTimings } = await loadRedact(origin);
	const t0 = performance.now();
	const result = await redact.redaction(text, options);
	const ms = Math.round((performance.now() - t0) * 100) / 100;
	return json({
		input: { text, ...options },
		redactedText: result.redactedText,
		items: result.items,
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
					service: "desert-ant-redact workerd test",
					routes: ["GET /", "GET /health", "GET /trace", "POST /load", "GET /redact?q=", "POST /redact", "POST /matrix"],
				});
			}
			if (url.pathname === "/health") {
				return json({ ...health, loaded: health.ready ? "ready" : health.state });
			}
			if (url.pathname === "/trace") {
				return json({ trace: getTrace() });
			}
			if (url.pathname === "/load" && request.method === "POST") {
				const t0 = performance.now();
				const { modelInfo, timings } = await loadRedact(origin);
				health.state = "ready";
				health.ready = true;
				return json({ modelInfo, timings, totalLoadMs: Math.round((performance.now() - t0) * 100) / 100 });
			}
			if (url.pathname === "/redact" && request.method === "GET") {
				health.state = "ready";
				return handleRedact(url, origin);
			}
			if (url.pathname === "/redact" && request.method === "POST") {
				health.state = "ready";
				return handleRedact(await request.json(), origin);
			}
			if (url.pathname === "/matrix" && request.method === "POST") {
				const t0 = performance.now();
				const { redact, modelInfo, timings } = await loadRedact(origin);
				health.state = "ready";
				health.ready = true;
				const results = [];
				for (const item of TEST_MATRIX) {
					const start = performance.now();
					const result = await redact.redaction(item.text, item.options);
					results.push({
						...item,
						redactedText: result.redactedText,
						items: result.items,
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
