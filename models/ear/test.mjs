// Real test for desert-ant-ear: boots `wrangler dev`, drives every route, and
// asserts the measured model behaviour inside workerd.
//
// Run with `npm test` in this directory.
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
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

async function identify(fixture) {
	const bytes = await readFile(new URL(`./fixtures/${fixture}`, import.meta.url));
	const response = await fetch(`${BASE}/identify?name=${fixture}`, {
		method: "POST",
		body: bytes,
	});
	assert.equal(response.status, 200, `identify ${fixture} failed`);
	return response.json();
}

test("health: the worker boots the 46 MiB wasm core", async () => {
	const response = await fetch(`${BASE}/health`);
	assert.equal(response.status, 200);
	const body = await response.json();
	assert.equal(body.worker, "desert-ant-ear");
});

test("load: the self-hosted path initialises LiteRT and the model", async () => {
	const response = await fetch(`${BASE}/load`);
	assert.equal(response.status, 200);
	const body = await response.json();
	assert.equal(body.loaded, true);
	assert.equal(body.modelInfo.id, "ear");
	assert.equal(body.modelInfo.artifact, "ear.tflite");
	assert.ok(body.loadMs > 0);
});

test("identify: English speech classifies as en, reliably", async () => {
	const body = await identify("jfk.wav");
	assert.equal(body.detection.language, "en");
	assert.equal(body.detection.isReliable, true);
	assert.ok(body.detection.confidence > 0.9, `confidence ${body.detection.confidence}`);
	assert.equal(body.audio.seconds, 11);
});

test("identify: a pure tone is answered but flagged unreliable", async () => {
	const body = await identify("tone.wav");
	assert.equal(body.detection.isReliable, false, "non-speech must not be trusted");
});

test("identify: Indonesian speech has id as the top candidate", async () => {
	// The fixture is espeak-ng synthesis, so the margin is small and
	// isReliable stays false; the top candidate is the assertion.
	const body = await identify("id.wav");
	assert.equal(body.detection.candidates[0].language, "id");
});
