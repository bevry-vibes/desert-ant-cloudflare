// starts wrangler dev, exercises every route, and asserts the moderation matrix
// usage: node scripts/test.mjs [--out results.json]
import { spawn } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { copyGlue } from "./setup.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const modelDir = dirname(scriptDir);
const repoDir = dirname(dirname(modelDir));
const PORT = 8827;
const BASE = `http://127.0.0.1:${PORT}`;

const outArg = process.argv.indexOf("--out");
const outFile = outArg > -1 ? process.argv[outArg + 1] : null;

if (!existsSync(join(modelDir, "src", "generated", "litert_wasm_internal.mjs"))) {
	copyGlue();
}

// ---------------------------------------------------------------- assertions

const failures = [];

function check(label, condition, detail) {
	if (condition) return;
	failures.push(`${label}: ${detail}`);
	console.error(`FAIL ${label}: ${detail}`);
}

const REGION_KEYS = ["nipples", "genitals", "buttocks", "nude", "sexAct"];

function checkScore(label, body) {
	check(label, body.ok === true, `ok should be true, got ${JSON.stringify(body.ok)}`);
	check(label, typeof body.score === "number" && body.score >= 0 && body.score <= 1, `score should lie in [0,1], got ${body.score}`);
	check(label, typeof body.isNSFW === "boolean", `isNSFW should be a boolean, got ${typeof body.isNSFW}`);
	check(label, typeof body.regions === "object" && body.regions !== null, `regions should be an object`);
	if (body.regions) {
		for (const key of REGION_KEYS) {
			const value = body.regions[key];
			check(label, typeof value === "number" && value >= 0 && value <= 1, `regions.${key} should lie in [0,1], got ${value}`);
		}
	}
	check(label, typeof body.analyzeMs === "number" && body.analyzeMs >= 0, `analyzeMs should be a non-negative number, got ${body.analyzeMs}`);
}

// ---------------------------------------------------------------- harness

function resolveWrangler() {
	const candidates = [
		join(modelDir, "node_modules", ".bin", "wrangler"),
		join(repoDir, "node_modules", ".bin", "wrangler"),
	];
	for (const candidate of candidates) {
		if (existsSync(candidate)) return { bin: candidate, args: [] };
	}
	// fall back to npx, which resolves through the ancestor node_modules
	return { bin: "npx", args: ["wrangler"] };
}

function startDevServer() {
	const { bin, args } = resolveWrangler();
	console.log(`starting: ${bin} ${args.join(" ")} dev --port ${PORT} --ip 127.0.0.1`);
	const child = spawn(bin, [...args, "dev", "--port", String(PORT), "--ip", "127.0.0.1"], {
		cwd: modelDir,
		detached: true,
		stdio: ["ignore", "pipe", "pipe"],
	});
	let output = "";
	child.stdout.on("data", (chunk) => (output += chunk));
	child.stderr.on("data", (chunk) => (output += chunk));
	let exited = null;
	child.on("exit", (code, signal) => (exited = { code, signal }));
	child.stop = () => {
		if (exited || child.pid === undefined) return;
		try {
			process.kill(-child.pid, "SIGTERM");
		} catch {
			// already gone
		}
		const deadline = Date.now() + 5000;
		const escalate = setInterval(() => {
			if (exited || Date.now() > deadline) {
				clearInterval(escalate);
				return;
			}
			try {
				process.kill(-child.pid, "SIGKILL");
			} catch {
				// already gone
			}
		}, 1000);
	};
	child.output = () => output.slice(-3000);
	return child;
}

async function waitUntilReady(child) {
	const deadline = Date.now() + 180000;
	while (Date.now() < deadline) {
		if (child.exited) throw new Error(`wrangler dev exited early (${JSON.stringify(child.exited)}):\n${child.output()}`);
		try {
			const res = await fetch(`${BASE}/`);
			if (res.ok) return res.json();
		} catch {
			// not listening yet
		}
		await new Promise((resolve) => setTimeout(resolve, 500));
	}
	throw new Error(`wrangler dev did not become ready within 180s:\n${child.output()}`);
}

async function get(pathnameAndQuery) {
	const res = await fetch(`${BASE}${pathnameAndQuery}`);
	const body = await res.json();
	return { status: res.status, body };
}

// ---------------------------------------------------------------- run

const results = { index: null, warmCold: null, warmWarm: null, samples: [], textContract: null };
let child;
let exitCode = 0;

try {
	child = startDevServer();
	await waitUntilReady(child);
	console.log("dev server ready");

	// cold load first, so the index route can report modelInfo
	results.warmCold = (await get("/warm")).body;
	results.warmWarm = (await get("/warm")).body;
	check("/warm cold", results.warmCold.ok === true, `first /warm should be ok, got ${JSON.stringify(results.warmCold).slice(0, 200)}`);
	check("/warm cold", results.warmCold.coreMs > 0, `cold coreMs should be positive, got ${results.warmCold.coreMs}`);
	check("/warm cold", results.warmCold.modelMs > 0, `cold modelMs should be positive, got ${results.warmCold.modelMs}`);
	check("/warm warm", results.warmWarm.cold === false, `second /warm should report cold:false, got ${results.warmWarm.cold}`);
	console.log(`cold load: core ${results.warmCold.coreMs} ms + model ${results.warmCold.modelMs} ms, warm analyze ${results.warmWarm.analyzeMs} ms`);

	results.index = (await get("/")).body;
	check("index", results.index.ok === true, "ok should be true");
	check("index", results.index.modelInfo?.id === "moderator", `modelInfo.id should be "moderator", got ${JSON.stringify(results.index.modelInfo)}`);
	check("index", results.index.modelInfo?.artifact === "moderator.tflite", `modelInfo.artifact should be "moderator.tflite"`);
	check("index", Array.isArray(results.index.modelInfo?.sidecars) && results.index.modelInfo.sidecars.length === 0, "modelInfo.sidecars should be empty");

	// the moderation matrix; the model is tuned to pass swimwear (borderline)
	const SAMPLES = [
		{ name: "benign cat photo, accurate", query: "img=benign", expectNSFW: false },
		{ name: "benign cat photo, fast", query: "img=benign&quality=fast", expectNSFW: false },
		{ name: "borderline bikini photo, accurate", query: "img=borderline", expectNSFW: false },
		{ name: "borderline bikini photo, fast", query: "img=borderline&quality=fast", expectNSFW: false },
		{ name: "borderline bikini photo, balanced", query: "img=borderline&quality=balanced", expectNSFW: false },
		{ name: "borderline bikini photo, allowTopless", query: "img=borderline&policy=allowTopless", expectNSFW: false },
	];
	for (const sample of SAMPLES) {
		const response = await get(`/analyze?${sample.query}`);
		const body = response.body;
		results.samples.push({ name: sample.name, query: sample.query, status: response.status, body });
		if (response.status !== 200) {
			check(sample.name, false, `HTTP ${response.status}: ${JSON.stringify(body).slice(0, 200)}`);
			continue;
		}
		checkScore(sample.name, body);
		check(sample.name, body.isNSFW === sample.expectNSFW, `isNSFW should be ${sample.expectNSFW}, got ${body.isNSFW} (score ${body.score})`);
		console.log(
			`${sample.name}: score=${body.score?.toFixed(4)} isNSFW=${body.isNSFW} decodeMs=${body.decodeMs} analyzeMs=${body.analyzeMs}`,
		);
	}

	// the input contract: text is refused, because moderator takes pixels only
	const textResponse = await get("/analyze?text=hello%20world");
	results.textContract = textResponse.body;
	check("text contract", textResponse.body.accepted === false, `text should be refused, got ${JSON.stringify(textResponse.body.accepted)}`);
	check("text contract", /RGB or RGBA/.test(textResponse.body.error ?? ""), `the refusal should state the pixel contract, got ${textResponse.body.error}`);
	console.log(`text contract: accepted=${textResponse.body.accepted} error=${textResponse.body.error}`);
} catch (error) {
	failures.push(`harness: ${error?.message ?? error}`);
	console.error(error);
} finally {
	if (child) child.stop();
}

if (outFile) {
	writeFileSync(outFile, JSON.stringify(results, null, "\t"));
	console.log(`raw results written to ${outFile}`);
}

if (failures.length > 0) {
	console.error(`\n${failures.length} check(s) failed`);
	exitCode = 1;
} else {
	console.log("\nall checks passed");
}
process.exit(exitCode);
