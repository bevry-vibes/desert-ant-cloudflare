// Reference run of @desert-ant-labs/align/native in plain Node on Linux x86.
// workerd cannot run this entry, so this script records what the native core
// actually produces: per-word timestamps, timings, weights, memory.
import { readdirSync, readFileSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Align } from "@desert-ant-labs/align/native";
import { wavToFloat32 } from "../src/worker.js";

const FIXTURE = new URL("../fixtures/jfk-16k-mono.wav", import.meta.url);
const TRANSCRIPT =
	"And so my fellow Americans ask not what your country can do for you ask what you can do for your country";

/** Read a WAV file as float32 samples. */
function readWav(file) {
	const bytes = new Uint8Array(readFileSync(file));
	return wavToFloat32(bytes);
}

/** List model cache files below a directory with sizes. */
function listFiles(dir, depth = 0) {
	if (depth > 4) return [];
	const out = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) out.push(...listFiles(full, depth + 1));
		else out.push({ file: full, bytes: statSync(full).size });
	}
	return out;
}

const { samples, sampleRate } = readWav(FIXTURE);
const duration = samples.length / sampleRate;
const words = TRANSCRIPT.split(" ");
const slot = duration / words.length;
const coarse = words.map((text, i) => ({ text, start: +(i * slot).toFixed(3), end: +((i + 1) * slot).toFixed(3) }));

console.log(`audio: ${samples.length} samples at ${sampleRate} Hz = ${duration.toFixed(3)} s`);
console.log(`rss before load: ${(process.memoryUsage().rss / 1e6).toFixed(1)} MB`);

const t0 = performance.now();
const align = await Align.load({ onProgress: (f) => process.stdout.write(`\rdownload ${Math.round(f * 100)}%`) });
const loadMs = performance.now() - t0;
console.log(`\nloaded in ${loadMs.toFixed(0)} ms (includes download on first run; cached afterwards)`);
console.log(`sdkVersion: ${Align.sdkVersion}, isDownloaded: ${align.isDownloaded()}`);

// Locate the managed cache so the weight sizes land in the record.
const cacheRoots = [
	path.join(os.homedir(), ".cache", "desert-ant-labs"),
	path.join(os.homedir(), ".cache", "desert-ant"),
	path.join(os.tmpdir(), "desert-ant-labs"),
];
for (const root of cacheRoots) {
	try {
		const files = listFiles(root);
		if (files.length) {
			console.log(`cache under ${root}:`);
			for (const f of files) console.log(`  ${f.file} ${(f.bytes / 1e6).toFixed(2)} MB`);
		}
	} catch {
		// no cache at this root
	}
}

const refined = await align.refine(samples, sampleRate, coarse, { language: "en" });
console.log("\nrefined words:");
for (const w of refined) {
	console.log(`  ${String(w.start.toFixed(3)).padStart(7)} → ${w.end.toFixed(3).padStart(7)}  ${w.refined ? "refined  " : "passthru "} ${w.text}`);
}

// Timing over repeat calls.
const runs = [];
for (let i = 0; i < 5; i++) {
	const t1 = performance.now();
	await align.refine(samples, sampleRate, coarse, { language: "en" });
	runs.push(performance.now() - t1);
}
console.log(`\nrefine timings (ms) over 5 runs: ${runs.map((r) => r.toFixed(1)).join(", ")}`);

// Validation behaviour, from the same loaded model.
try {
	await align.refine(new Float32Array(0), 16000, coarse, { language: "en" });
} catch (error) {
	console.log(`empty audio: ${error.constructor.name}: ${error.message}`);
}
console.log(`rss after: ${(process.memoryUsage().rss / 1e6).toFixed(1)} MB`);

align.dispose();
console.log("done");
