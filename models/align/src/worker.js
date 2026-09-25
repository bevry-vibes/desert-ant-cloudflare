// workerd test harness for @desert-ant-labs/align.
// The package ships two entries: the default entry (import-safe, refuses to load)
// and /native (koffi FFI, Node-only). These routes record what each does in workerd.

// The default entry promises to import cleanly everywhere, SSR included. A static
// import here tests that promise: if workerd cannot even bundle this file, wrangler
// dev fails before any route runs.
import { Align } from "@desert-ant-labs/align";

const TRANSCRIPT =
	"And so my fellow Americans ask not what your country can do for you ask what you can do for your country";

const FIXTURE = "jfk-16k-mono.wav"; // 16 kHz mono 16-bit PCM, 11 s, 352 KB

/** Time one async step and capture its failure. */
async function step(name, body) {
	const t0 = performance.now();
	try {
		const value = await body();
		return { step: name, ok: true, ms: round(performance.now() - t0), value };
	} catch (error) {
		return {
			step: name,
			ok: false,
			ms: round(performance.now() - t0),
			error: serialiseError(error),
		};
	}
}

function round(ms) {
	return Math.round(ms * 100) / 100;
}

/** Keep the exact name, message, and constructor for the record. */
function serialiseError(error) {
	const out = { name: error?.name, type: error?.constructor?.name, message: error?.message };
	if (error?.cause) out.cause = serialiseError(error.cause);
	if (typeof error?.stack === "string") {
		// First three lines are enough to locate the throw site.
		out.stackHead = error.stack.split("\n").slice(0, 3).join("\n");
	}
	return out;
}

/**
 * Decode a 16-bit mono WAV to float32 samples in [-1, 1).
 * Walks the RIFF chunk list, so extra LIST chunks from ffmpeg are fine.
 */
export function wavToFloat32(bytes) {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const tag = String.fromCharCode(...bytes.subarray(0, 4));
	if (tag !== "RIFF") throw new Error(`not a RIFF file, got ${JSON.stringify(tag)}`);
	if (String.fromCharCode(...bytes.subarray(8, 12)) !== "WAVE") {
		throw new Error("not a WAVE file");
	}
	let offset = 12;
	let format = null;
	let data = null;
	while (offset + 8 <= bytes.byteLength) {
		const id = String.fromCharCode(...bytes.subarray(offset, offset + 4));
		const size = view.getUint32(offset + 4, true);
		const body = bytes.subarray(offset + 8, offset + 8 + size);
		if (id === "fmt ") {
			format = {
				audioFormat: view.getUint16(offset + 8, true),
				channels: view.getUint16(offset + 10, true),
				sampleRate: view.getUint32(offset + 12, true),
				bitsPerSample: view.getUint16(offset + 22, true),
			};
		} else if (id === "data") {
			data = body;
		}
		offset += 8 + size + (size % 2); // chunks are word-aligned
	}
	if (!format || !data) throw new Error("missing fmt or data chunk");
	if (format.audioFormat !== 1 || format.bitsPerSample !== 16) {
		throw new Error(`expected 16-bit PCM, got format ${format.audioFormat} at ${format.bitsPerSample} bits`);
	}
	if (format.channels !== 1) throw new Error(`expected mono, got ${format.channels} channels`);
	const samples = new Float32Array(data.byteLength / 2);
	for (let i = 0; i < samples.length; i++) samples[i] = view.getInt16(data.byteOffset + i * 2, true) / 32768;
	return { samples, sampleRate: format.sampleRate };
}

/** Peak absolute sample, without spreading a big array into Math.max. */
function peakAbsolute(samples) {
	let peak = 0;
	for (let i = 0; i < samples.length; i++) {
		const value = Math.abs(samples[i]);
		if (value > peak) peak = value;
	}
	return peak;
}

/** The transcript as coarse word guesses, evenly spread over the audio. Align's job is to fix them. */
function coarseWords(durationSeconds) {
	const words = TRANSCRIPT.split(" ");
	const slot = durationSeconds / words.length;
	return words.map((text, i) => ({ text, start: +(i * slot).toFixed(3), end: +((i + 1) * slot).toFixed(3) }));
}

function json(data, status = 200) {
	return new Response(JSON.stringify(data, null, "\t") + "\n", {
		status,
		headers: { "content-type": "application/json; charset=utf-8" },
	});
}

export default {
	async fetch(request, env) {
		try {
			return await handle(request, env);
		} catch (error) {
			// A harness bug must never hide behind a runtime error page.
			return json({ unexpectedError: serialiseError(error) }, 500);
		}
	},
};

async function handle(request, env) {
	const url = new URL(request.url);
	const route = url.pathname.replace(/\/+$/, "") || "/";

	if (route === "/") {
		// These statics are pure JavaScript, so they must work in any runtime.
		return json({
			runtime: navigator.userAgent,
			fixture: FIXTURE,
			transcript: TRANSCRIPT,
			defaultEntry: {
				// The default entry binds no version: only /native may read package.json.
				sdkVersion: Align.sdkVersion ?? null,
				languages: Align.languages,
				isSupportedChecks: [
					{ code: "en", supported: Align.isSupported("en") },
					{ code: "pt-BR", supported: Align.isSupported("pt-BR") },
					{ code: "sv", supported: Align.isSupported("sv") },
					{ code: "id", supported: Align.isSupported("id") },
				],
			},
			routes: ["/", "/fixture", "/default/load", "/native/import", "/align"],
		});
	}

	if (route === "/fixture") {
		// Proves the assets binding and the WAV decoder before the model is blamed for anything.
		const result = await step("load and decode fixture", async () => {
			const response = await env.FIXTURES.fetch(new URL(`/${FIXTURE}`, url.origin));
			if (!response.ok) throw new Error(`asset fetch returned ${response.status}`);
			const bytes = new Uint8Array(await response.arrayBuffer());
			const { samples, sampleRate } = wavToFloat32(bytes);
			return {
				bytes: bytes.byteLength,
				samples: samples.length,
				sampleRate,
				durationSeconds: round((samples.length / sampleRate) * 1000) / 1000,
				peak: peakAbsolute(samples).toFixed(4),
				words: coarseWords(samples.length / sampleRate).length,
			};
		});
		return json(result, result.ok ? 200 : 500);
	}

	if (route === "/default/load") {
		// Expected refusal: the default entry has no browser/WebAssembly build.
		const result = await step("Align.load() on the default entry", () => Align.load());
		return json(result, result.ok ? 200 : 500);
	}

	if (route === "/native/import") {
		// Expected failure: koffi cannot dlopen a native addon inside workerd.
		const result = await step("import @desert-ant-labs/align/native", async () => {
			const mod = await import("@desert-ant-labs/align/native");
			return { imported: true, exports: Object.keys(mod), sdkVersion: mod.Align?.sdkVersion ?? null };
		});
		return json(result, result.ok ? 200 : 500);
	}

	if (route === "/align") {
		// The end-to-end attempt: fixture in, refined word times out.
		const steps = [];
		let audio = null;
		steps.push(
			await step("load and decode fixture", async () => {
				const response = await env.FIXTURES.fetch(new URL(`/${FIXTURE}`, url.origin));
				if (!response.ok) throw new Error(`asset fetch returned ${response.status}`);
				audio = wavToFloat32(new Uint8Array(await response.arrayBuffer()));
				// Sample arrays are not JSON-friendly, so the step records metadata only.
				return { samples: audio.samples.length, sampleRate: audio.sampleRate };
			}),
		);
		if (!audio) return json({ ok: false, steps }, 500);
		const { samples, sampleRate } = audio;
		const durationSeconds = samples.length / sampleRate;
		steps.push(await step("Align.load() on the default entry", () => Align.load()));

		// Only reachable if some entry ever loads in workerd; recorded for completeness.
		steps.push(
			await step("refine()", async () => {
				const model = await Align.load();
				const refined = await model.refine(samples, sampleRate, coarseWords(durationSeconds), {
					language: "en",
				});
				model.dispose();
				return refined;
			}),
		);
		const ok = steps.every((s) => s.ok);
		return json({ ok, steps }, ok ? 200 : 500);
	}

	return json({ error: `unknown route ${route}` }, 404);
}
