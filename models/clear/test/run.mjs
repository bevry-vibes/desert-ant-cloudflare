// Real end-to-end assertions against wrangler dev.
//
// The script starts the worker, waits for readiness (the first load downloads
// the 47 MiB artifact, so the budget is generous), exercises every route,
// checks the enhancement metrics, and always stops the server.

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const modelDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const port = process.env.TEST_PORT ?? 8823;
const base = `http://127.0.0.1:${port}`;
const wranglerBin = path.join(modelDir, "../../node_modules/.bin/wrangler");

let failures = 0;
function check(name, condition, detail = "") {
	if (condition) {
		console.log(`PASS ${name}`);
	} else {
		failures++;
		console.error(`FAIL ${name}${detail ? ` — ${detail}` : ""}`);
	}
}

async function waitForReady(child) {
	const deadline = Date.now() + 300_000;
	while (Date.now() < deadline) {
		try {
			const response = await fetch(`${base}/health`);
			if (response.ok) return;
		} catch {
			// the server is not up yet; poll again
		}
		if (child.exitCode != null) {
			throw new Error(`wrangler dev exited early with code ${child.exitCode}`);
		}
		await new Promise((resolve) => setTimeout(resolve, 2000));
	}
	throw new Error("wrangler dev did not become ready within 300 s");
}

async function getJson(pathname) {
	const response = await fetch(`${base}${pathname}`);
	return { status: response.status, body: await response.json() };
}

const child = spawn(wranglerBin, ["dev", "--port", String(port)], {
	cwd: modelDir,
	stdio: ["ignore", "inherit", "inherit"],
});

try {
	await waitForReady(child);

	const root = await getJson("/");
	check("GET / answers 200", root.status === 200);
	check("GET / names the model", root.body?.model === "clear");

	const health = await getJson("/health");
	check("GET /health answers 200", health.status === 200);
	check("health reports ready", health.body?.ready === true);
	check("health reports model downloaded", health.body?.isDownloaded === true);
	console.log("health:", JSON.stringify(health.body));

	const info = await getJson("/model-info");
	check("model info names the artifact", info.body?.modelInfo?.artifact === "clear-studio.tflite");

	const fixture = fs.readFileSync(path.join(modelDir, "fixtures/jfk-16k-mono-3s-noisy.wav"));
	const enhanced = await fetch(`${base}/enhance`, { method: "POST", body: fixture });
	check("POST /enhance answers 200", enhanced.status === 200, String(enhanced.status));
	const meta = JSON.parse(enhanced.headers.get("x-enhance-meta") ?? "{}");
	check("enhance returns 48 kHz output", meta?.output?.sampleRate === 48000, JSON.stringify(meta));
	check("enhance keeps the duration", Math.abs((meta?.output?.durationSec ?? 0) - 3) < 0.1);
	const enhancedBytes = new Uint8Array(await enhanced.arrayBuffer());
	check("enhance returns a WAV file", String.fromCharCode(...enhancedBytes.slice(0, 4)) === "RIFF");
	console.log("enhance meta:", JSON.stringify(meta));

	const badRequest = await fetch(`${base}/enhance`, { method: "POST", body: new Uint8Array(0) });
	check("POST /enhance rejects an empty body", badRequest.status === 400);

	const matrix = await getJson("/matrix");
	check("GET /matrix answers 200", matrix.status === 200);
	for (const name of ["clean", "noisy"]) {
		const entry = matrix.body?.fixtures?.[name];
		check(`matrix ${name} enhanced`, typeof entry?.metrics?.measuredLUFS === "number", JSON.stringify(entry));
		check(`matrix ${name} output sized`, (entry?.output?.samples ?? 0) > 100000, JSON.stringify(entry?.output));
	}
	const clean = matrix.body?.fixtures?.clean?.metrics?.measuredLUFS;
	const noisy = matrix.body?.fixtures?.noisy?.metrics?.measuredLUFS;
	check("clean and noisy inputs measure differently", clean !== noisy, `clean ${clean} vs noisy ${noisy}`);
	console.log("matrix:", JSON.stringify(matrix.body, null, "\t"));

	const unknown = await getJson("/nope");
	check("unknown route answers 404", unknown.status === 404);
} catch (error) {
	failures++;
	console.error("FAIL harness error —", error);
} finally {
	child.kill("SIGTERM");
	await new Promise((resolve) => {
		child.once("exit", resolve);
		setTimeout(resolve, 5000).unref?.();
	});
}

process.exit(failures === 0 ? 0 : 1);
