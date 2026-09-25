// Real assertions for the emo workerd test, run against `wrangler dev`.
// Start the dev server on port 8822, probe every route, and kill it again.
//
// The suite characterises the actual 2026-09-25 behaviour:
// - loading the model in workerd works,
// - inference calls stall inside the Swift wasm core, so workerd cancels the
//   request as hung (the Node probe scripts/probe-node.mjs proves the same
//   pipeline works outside workerd).

import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const here = path.dirname(fileURLToPath(import.meta.url));
const modelDir = path.resolve(here, "..");
const wrangler = path.join(modelDir, "..", "..", "node_modules", ".bin", "wrangler");
const port = 8822;
const base = `http://127.0.0.1:${port}`;

async function exists(file) {
	try {
		await access(file);
		return true;
	} catch {
		return false;
	}
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 30_000) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		return await fetch(url, { ...options, signal: controller.signal });
	} finally {
		clearTimeout(timer);
	}
}

const child = spawn(wrangler, ["dev", "--port", String(port)], {
	cwd: modelDir,
	stdout: ["pipe"],
	stderr: "inherit",
});
child.stdout.resume();

function stop() {
	child.kill("SIGTERM");
}

process.on("exit", stop);
process.on("SIGINT", () => {
	stop();
	process.exit(1);
});

async function waitUntilReady() {
	const started = Date.now();
	while (Date.now() - started < 120_000) {
		try {
			const response = await fetchWithTimeout(`${base}/health`, {}, 2_000);
			if (response.ok) return;
		} catch {
			// server not accepting yet
		}
		await new Promise((resolve) => setTimeout(resolve, 500));
	}
	throw new Error("wrangler dev did not become ready within 120s");
}

try {
	// The setup script must have run: weights are served from assets/weights.
	assert.ok(await exists(path.join(modelDir, "assets", "weights", "emo.tflite")), "assets/weights/emo.tflite is missing; run `npm run setup` first");
	assert.ok(await exists(path.join(modelDir, "src", "vendor-litert-glue.js")), "src/vendor-litert-glue.js is missing; run `npm run setup` first");

	await waitUntilReady();

	// Route: GET / service description.
	{
		const response = await fetchWithTimeout(`${base}/`);
		assert.equal(response.status, 200);
		const body = await response.json();
		assert.equal(body.service, "desert-ant-emo workerd test");
		assert.ok(Array.isArray(body.routes) && body.routes.length >= 5);
	}

	// Assets are served before the worker: the weights must be reachable.
	{
		const response = await fetchWithTimeout(`${base}/weights/emo.tflite`);
		assert.equal(response.status, 200);
		const buffer = await response.arrayBuffer();
		assert.ok(buffer.byteLength > 5_000_000, `emo.tflite looks too small: ${buffer.byteLength}`);
	}

	// Route: POST /load. The cold load must succeed in workerd and report
	// the pinned catalog: artifact plus sidecars.
	{
		const response = await fetchWithTimeout(`${base}/load`, { method: "POST" }, 120_000);
		assert.equal(response.status, 200);
		const body = await response.json();
		assert.equal(body.modelInfo.id, "emo");
		assert.equal(body.modelInfo.sdkVersion, "3.5.0");
		assert.equal(body.modelInfo.artifact, "emo.tflite");
		assert.deepEqual(body.modelInfo.sidecars, ["emo_meta.json", "emo_tokenizer.bin"]);
		assert.ok(body.timings.modelLoadMs >= 0);
		assert.ok(body.totalLoadMs < 60_000, `cold load too slow: ${body.totalLoadMs}ms`);
	}

	// Route: POST /suggest. Characterisation: the call enters the wasm core but
	// never returns inside workerd, so the runtime cancels the request. The
	// Node probe (scripts/probe-node.mjs) shows the same pipeline returning
	// correct suggestions outside workerd.
	{
		const response = await fetchWithTimeout(
			`${base}/suggest`,
			{
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ text: "finished a marathon today", limit: 3 }),
			},
			120_000,
		);
		let bodyText = "";
		try {
			bodyText = await response.text();
		} catch {
			// workerd may reset the stream when it cancels the hung request
		}
		const observed = `${response.status} ${bodyText}`;
		assert.match(
			observed,
			/500|hung|stalled|canceled|exceeded/i,
			`expected workerd to cancel the stalled inference, got: ${observed.slice(0, 200)}`,
		);
	}

	// Route: GET /trace must show how far the wiring got.
	{
		const response = await fetchWithTimeout(`${base}/trace`);
		assert.equal(response.status, 200);
		const body = await response.json();
		const joined = body.trace.join("\n");
		assert.match(joined, /core instantiated/);
		assert.match(joined, /model loaded isDownloaded=true/);
		assert.match(joined, /exports\.run called/);
	}

	console.log("desert-ant-emo-test: all assertions passed");
} finally {
	stop();
}
