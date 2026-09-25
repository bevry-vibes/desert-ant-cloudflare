// Real end-to-end assertions against wrangler dev.
//
// The script starts the worker, waits for readiness, exercises every route,
// checks the test matrix predictions, and always stops the server.

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

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
	const deadline = Date.now() + 120_000;
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
		await new Promise((resolve) => setTimeout(resolve, 1000));
	}
	throw new Error("wrangler dev did not become ready within 120 s");
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
	check("GET / names the model", root.body?.model === "shapes");

	const health = await getJson("/health");
	check("GET /health answers 200", health.status === 200);
	check("health reports ready", health.body?.ready === true);
	check("health reports model downloaded", health.body?.isDownloaded === true);
	check("health reports a cold load", typeof health.body?.timings?.coldLoadMs === "number");
	console.log("health:", JSON.stringify(health.body));

	const info = await getJson("/model-info");
	check("model info names the artifact", info.body?.modelInfo?.artifact === "shapes.tflite");

	const recognise = await fetch(`${base}/recognize`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ points: [[40, 40], [200, 40], [200, 140], [40, 140], [40, 40]] }),
	});
	const recogniseBody = await recognise.json();
	check("POST /recognize answers 200", recognise.status === 200);
	check("rectangle stroke recognises as rectangle", recogniseBody?.shape?.kind === "rectangle", JSON.stringify(recogniseBody));

	const badRequest = await fetch(`${base}/recognize`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ points: [] }),
	});
	check("POST /recognize rejects an empty stroke", badRequest.status === 400);

	const matrix = await getJson("/matrix");
	check("GET /matrix answers 200", matrix.status === 200);
	for (const expected of ["rectangle", "triangle", "line", "ellipse", "star"]) {
		const result = matrix.body?.strokes?.[expected];
		check(
			`matrix ${expected} prediction`,
			result?.match === true,
			`predicted ${JSON.stringify(result?.shape)}, bracket ${JSON.stringify(result?.highestAcceptedMinimumConfidence)}`,
		);
	}
	check("matrix reports all matched", matrix.body?.allMatched === true);
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
