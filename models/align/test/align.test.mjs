// Assertions for the align harness. The Node cases need the native core;
// skip them on hosts without the prebuilt library. The workerd cases start
// wrangler dev on port 8825 and assert the recorded failure modes.
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { spawn } from "node:child_process";
import { once } from "node:events";

const PORT = 8825;
const BASE = `http://localhost:${PORT}`;
const REFUSAL =
	"@desert-ant-labs/align has no browser/WebAssembly build: word-timestamp refinement runs a "
	+ "two-graph cascade and the wasm host compiles one model per module. "
	+ `On a server, import "@desert-ant-labs/align/native".`;

describe("align package surface (runs anywhere)", () => {
	it("the default entry imports and exposes the nine languages", async () => {
		const { Align } = await import("@desert-ant-labs/align");
		assert.deepEqual([...Align.languages], ["de", "en", "es", "fr", "it", "ja", "ko", "pt", "zh"]);
		assert.equal(Align.isSupported("pt-BR"), true);
		assert.equal(Align.isSupported("sv"), false);
		assert.equal(Align.isSupported("id"), false);
	});

	it("the default entry refuses to load with the documented message", async () => {
		const { Align } = await import("@desert-ant-labs/align");
		await assert.rejects(() => Align.load(), (error) => {
			assert.equal(error.constructor.name, "Error");
			assert.equal(error.message, REFUSAL);
			return true;
		});
	});
});

describe("align native core (Linux x64 and macOS)", () => {
	it("refines the jfk fixture against the transcript", async () => {
		const { Align } = await import("@desert-ant-labs/align/native");
		const { wavToFloat32 } = await import("../src/worker.js");
		const { readFileSync } = await import("node:fs");
		if (!Align.isSupported("en")) throw new Error("english must be supported");
		const audio = wavToFloat32(new Uint8Array(readFileSync(new URL("../fixtures/jfk-16k-mono.wav", import.meta.url))));
		const transcript =
			"And so my fellow Americans ask not what your country can do for you ask what you can do for your country";
		const slot = audio.samples.length / audio.sampleRate / transcript.split(" ").length;
		const coarse = transcript.split(" ").map((text, i) => ({ text, start: i * slot, end: (i + 1) * slot }));
		const align = await Align.load();
		try {
			const refined = await align.refine(audio.samples, audio.sampleRate, coarse, { language: "en" });
			assert.equal(refined.length, 22);
			for (const word of refined) {
				assert.equal(typeof word.start, "number");
				assert.equal(typeof word.end, "number");
				assert.ok(word.start >= 0 && word.end <= 12, `word ${word.text} out of range`);
				assert.ok(word.end > word.start, `word ${word.text} has a non-positive span`);
			}
			assert.ok(refined.filter((w) => w.refined).length >= 15, "most words should be refined");
			// The famous opening lands near the front of the clip.
			assert.ok(refined[0].start < 1, `first word starts at ${refined[0].start}`);
			assert.equal(refined[21].text, "country");
		} finally {
			align.dispose();
		}
	});
});

describe("align workerd harness (wrangler dev)", () => {
	let child;

	before(async () => {
		child = spawn("npx", ["wrangler", "dev", "--port", String(PORT)], {
			cwd: new URL("..", import.meta.url).pathname,
			stdio: "ignore",
			detached: true,
		});
		// Poll until the worker answers.
		const deadline = Date.now() + 60_000;
		for (;;) {
			try {
				const response = await fetch(`${BASE}/`);
				if (response.ok) return;
			} catch {
				// not up yet
			}
			if (Date.now() > deadline) throw new Error("wrangler dev did not become ready in 60 s");
			await new Promise((resolve) => setTimeout(resolve, 1000));
		}
	});

	after(() => {
		if (child.pid) process.kill(-child.pid, "SIGTERM");
	});

	it("serves the fixture through the assets binding and decodes it", async () => {
		const response = await fetch(`${BASE}/fixture`);
		const body = await response.json();
		assert.equal(body.ok, true);
		assert.equal(body.value.samples, 176000);
		assert.equal(body.value.sampleRate, 16000);
		assert.equal(body.value.durationSeconds, 11);
		assert.equal(body.value.words, 22);
	});

	it("Align.load() refuses in workerd with the documented message", async () => {
		const response = await fetch(`${BASE}/default/load`);
		const body = await response.json();
		assert.equal(body.ok, false);
		assert.equal(body.error.message, REFUSAL);
	});

	it("the /native entry fails to initialise in workerd", async () => {
		const response = await fetch(`${BASE}/native/import`);
		const body = await response.json();
		assert.equal(body.ok, false);
		// The core loader dies in createRequire(import.meta.url) before any dlopen.
		assert.equal(body.error.name, "TypeError");
		assert.match(body.error.message, /The argument 'path'/);
		assert.match(body.error.message, /Received 'undefined'/);
	});

	it("the end-to-end /align route reports the refusal, not a crash", async () => {
		const response = await fetch(`${BASE}/align`);
		const body = await response.json();
		assert.equal(body.ok, false);
		assert.equal(body.steps[0].ok, true, "the fixture must decode");
		assert.match(body.steps[1].error.message, /no browser\/WebAssembly build/);
	});
});

// Keep the event loop alive long enough for the wrangler teardown, then exit cleanly.
await once(process, "test:end").catch(() => {});
