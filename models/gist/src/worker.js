// workerd probe for @desert-ant-labs/gist.
// The default entry is a LiteRT.js (wasm) pipeline for browsers. A static
// import crashes the isolate at boot (LiteRT browser setup runs at module
// init), so the probe uses a dynamic import inside the route and records
// the exact failure.
const json = (data, status = 200) =>
	new Response(JSON.stringify(data, null, 1), {
		status,
		headers: { "content-type": "application/json" },
	});

export default {
	async fetch(request) {
		const url = new URL(request.url);
		if (url.pathname !== "/probe") return json({ ok: false, error: "unknown route" }, 404);
		const t0 = performance.now();
		try {
			const { Gist } = await import("@desert-ant-labs/gist");
			const gist = await Gist.load();
			const topics = await gist.classify("Power of Goodness activities with children in Pati");
			return json({ ok: true, loadMs: Math.round(performance.now() - t0), topics });
		} catch (error) {
			return json({
				ok: false,
				failedAfterMs: Math.round(performance.now() - t0),
				name: error?.name,
				type: error?.constructor?.name,
				message: error?.message,
				stackHead: typeof error?.stack === "string" ? error.stack.split("\n").slice(0, 4).join("\n") : undefined,
			});
		}
	},
};
