// Real test for desert-ant-voz: boots `wrangler dev` and asserts the precise
// failure ladder that stops the model inside workerd.
//
// The model cannot run on Cloudflare Workers. Three independent blockers are
// asserted, in the order a load hits them:
//
// 1. ONNX Runtime Web cannot initialise its wasm backend in workerd
//    ("no available backend found ... cannot determine the script source URL").
// 2. workerd forbids wasm code generation from runtime bytes, which no ONNX
//    Runtime configuration can avoid (the backend library compiles at runtime).
// 3. The weights are far beyond the isolate memory limit: the encoder's
//    external data alone is 349 MB, resident about 1.19 GB, against the 128 MB
//    production limit. `wrangler dev` does not enforce that limit, so the full
//    bundle fetch succeeds locally before the session creation fails.
//
// The full `/load` fetches 349 MB from the Hub and takes minutes; set
// VOZ_FULL_LOAD=1 to include it.
//
// Run with `npm test` in this directory.
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import test from "node:test";

const PORT = 8824;
const BASE = `http://127.0.0.1:${PORT}`;

let child;

async function waitForServer(timeoutMs = 180000) {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		try {
			const response = await fetch(`${BASE}/health`);
			if (response.ok) return;
		} catch {
			// not up yet
		}
		await new Promise((resolve) => setTimeout(resolve, 1000));
	}
	throw new Error("wrangler dev did not become ready in time");
}

test.before(async () => {
	child = spawn("npx", ["wrangler", "dev", "--port", String(PORT)], {
		cwd: new URL(".", import.meta.url).pathname,
		stdio: "ignore",
		detached: true,
	});
	await waitForServer();
});

test.after(() => {
	if (child?.pid) {
		try { process.kill(-child.pid, "SIGTERM"); } catch { child.kill("SIGTERM"); }
	}
});

test("health: the worker boots the 46 MiB wasm core", async () => {
	const response = await fetch(`${BASE}/health`);
	assert.equal(response.status, 200);
	const body = await response.json();
	assert.equal(body.worker, "desert-ant-voz");
});

test("info: the Swift core catalog matches the SDK version", async () => {
	const response = await fetch(`${BASE}/info`);
	assert.equal(response.status, 200);
	const body = await response.json();
	assert.equal(body.modelInfo.id, "voz");
	assert.equal(body.modelInfo.sdkVersion, "3.5.0");
	assert.equal(body.modelInfo.repo, "desert-ant-labs/voz");
	// Worth recording: the pin is a branch, not a tag, so weights can drift.
	assert.equal(body.modelInfo.revision, "main");
	assert.ok(body.modelInfo.files.includes("web/encoder.onnx"));
});

test("info: workerd forbids runtime wasm code generation", async () => {
	const response = await fetch(`${BASE}/info`);
	const body = await response.json();
	assert.equal(body.wasmCodegenProbe.ok, false);
	assert.match(
		body.wasmCodegenProbe.error,
		/Wasm code generation disallowed by embedder/,
	);
});

test("info: the bundled onnxruntime-web imports but has no working backend", async () => {
	const response = await fetch(`${BASE}/info`);
	const body = await response.json();
	assert.equal(body.ort.imported, true);
	assert.equal(body.ort.backend, null);
});

test("ort-session: InferenceSession.create fails with the exact workerd error", async () => {
	const response = await fetch(`${BASE}/ort-session`, { method: "POST" });
	assert.equal(response.status, 500);
	const body = await response.json();
	assert.equal(body.ok, false);
	assert.match(body.error, /no available backend found/);
	assert.match(body.error, /cannot determine the script source URL/);
});

test("transcribe: refused before a successful load", async () => {
	const response = await fetch(`${BASE}/transcribe`, { method: "POST", body: "x" });
	assert.equal(response.status, 503);
});

test("load: the full SDK path fails at session creation, after all files fetch", { skip: !process.env.VOZ_FULL_LOAD }, async () => {
	const response = await fetch(`${BASE}/load`, { method: "POST" });
	assert.equal(response.status, 500);
	const body = await response.json();
	// Every file arrived, including the 349 MB encoder external data
	// (wrangler dev enforces no memory limit), then the backend failed.
	assert.ok(body.steps["file:encoder.onnx.data"], "the 349 MB encoder data was not fetched");
	assert.match(body.error, /no available backend found/);
});
