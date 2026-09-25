// starts wrangler dev, curls every route, and asserts the detection matrix
// usage: node scripts/test.mjs [--out results.json]
import { spawn } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { copyWeights, weightsPresent } from "./setup.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const modelDir = dirname(scriptDir);
const repoDir = dirname(dirname(modelDir));
const PORT = 8821;
const BASE = `http://127.0.0.1:${PORT}`;

const outArg = process.argv.indexOf("--out");
const outFile = outArg > -1 ? process.argv[outArg + 1] : null;

// ---------------------------------------------------------------- test matrix

const SAMPLES = [
	{
		name: "indonesian long paragraph",
		text:
			"Peace Place Pati adalah rumah bagi anak-anak dan keluarga di Kota Pati, Jawa Tengah. " +
			"Kami menyediakan ruang bermain yang aman, kelas belajar, dan kegiatan akhir pekan yang didampingi relawan terlatih. " +
			"Orang tua dapat bekerja dengan tenang karena setiap anak mendapat perhatian yang layak. " +
			"Kami menerima sumbangan buku dan alat tulis untuk perpustakaan kecil kami. " +
			"Pendaftaran gratis bagi setiap keluarga yang tinggal di sekitar Jalan Panglima Sudirman. " +
			"Hubungi kami untuk mendaftarkan anak Anda sebagai peserta atau sebagai relawan.",
		expectLanguage: "id",
	},
	{
		name: "indonesian short title",
		text: "Selamat Datang di Peace Place Pati",
		// ms is an acceptable neighbour answer on a 34 character title
		expectLanguageIn: ["id", "ms"],
	},
	{
		name: "english long paragraph",
		text:
			"Peace Place Pati is a safe community centre for children and families in the city of Pati, Central Java. " +
			"We run a playground, tutoring classes and weekend activities staffed by trained volunteers. " +
			"Parents can work with peace of mind because every child receives proper attention. " +
			"We welcome donations of books and stationery for our small library. " +
			"Registration is free for every family living near Jalan Panglima Sudirman. " +
			"Contact us to enrol your child as a participant or to join us as a volunteer. " +
			"Our doors are open from Monday to Saturday.",
		expectLanguage: "en",
	},
	{
		name: "english short title",
		text: "Welcome to Peace Place Pati",
		expectLanguage: "en",
	},
	{
		name: "ambiguous two words",
		text: "Sharing happiness",
		// no language assertion: shape only, the answer is recorded
	},
	{
		name: "javanese latin script",
		text: "Bareng-bareng ngresiki Joglo karo saking para warga",
		// jv is absent from the 59 labels, so an Indonesian or Malay answer is the expected outcome
		expectLanguageIn: ["id", "ms"],
	},
	{
		name: "malay-like sentence",
		text: "Kerajaan akan mengumumkan bajet baru pada bulan Oktober di Parlimen tahun ini.",
		expectLanguageIn: ["ms", "id"],
	},
	{
		name: "empty string",
		text: "",
		expectEmpty: true,
	},
];

// ---------------------------------------------------------------- assertions

const failures = [];

function check(label, condition, detail) {
	if (condition) return;
	failures.push(`${label}: ${detail}`);
	console.error(`FAIL ${label}: ${detail}`);
}

function checkShape(label, body) {
	check(label, body.ok === true, `ok should be true, got ${JSON.stringify(body.ok)}`);
	check(label, typeof body.language === "string" || body.language === null, `language should be a string or null`);
	check(label, typeof body.reliability === "string", `reliability should be a string`);
	check(
		label,
		typeof body.isTooCloseToCall === "boolean",
		`isTooCloseToCall should be a boolean, got ${typeof body.isTooCloseToCall}`,
	);
	check(label, Array.isArray(body.top), "top should be an array");
	check(label, body.top.length > 0 && body.top.length <= 3, `top should hold 1 to 3 candidates, got ${body.top.length}`);
	check(
		label,
		body.top.every((c, i, a) => typeof c.language === "string" && typeof c.probability === "number" && (i === 0 || a[i - 1].probability >= c.probability)),
		"candidates should carry descending probabilities",
	);
	check(label, typeof body.detectMs === "number" && body.detectMs >= 0, `detectMs should be a non-negative number, got ${body.detectMs}`);
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
	const deadline = Date.now() + 120000;
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
	throw new Error(`wrangler dev did not become ready within 120s:\n${child.output()}`);
}

async function get(pathnameAndQuery) {
	const res = await fetch(`${BASE}${pathnameAndQuery}`);
	const body = await res.json();
	return { status: res.status, body };
}

// ---------------------------------------------------------------- run

const results = { index: null, warmCold: null, warmWarm: null, samples: [], deployed: null };
let child;
let exitCode = 0;

try {
	if (!weightsPresent()) {
		console.log("weights missing, copying from the installed package");
		copyWeights();
	}

	child = startDevServer();
	results.index = await waitUntilReady(child);
	console.log(`dev server ready: maxCharacters=${results.index.maxCharacters}`);

	// cold load, then warm load
	results.warmCold = (await get("/warm")).body;
	results.warmWarm = (await get("/warm")).body;
	check("/warm cold", results.warmCold.cold === true, `first /warm should report cold:true, got ${results.warmCold.cold}`);
	check("/warm cold", typeof results.warmCold.loadMs === "number" && results.warmCold.loadMs > 0, `cold loadMs should be positive, got ${results.warmCold.loadMs}`);
	check("/warm warm", results.warmWarm.cold === false, `second /warm should report cold:false, got ${results.warmWarm.cold}`);
	check("/warm warm", results.warmWarm.loadMs <= results.warmCold.loadMs, `warm loadMs should not exceed cold loadMs`);
	console.log(`cold load: ${results.warmCold.loadMs} ms, warm load: ${results.warmWarm.loadMs} ms`);

	for (const sample of SAMPLES) {
		const label = sample.name;
		const response = await get(`/detect?text=${encodeURIComponent(sample.text)}`);
		const body = response.body;
		const record = { name: label, textLength: sample.text.length, status: response.status, body };
		results.samples.push(record);
		if (response.status !== 200) {
			check(label, false, `HTTP ${response.status}: ${JSON.stringify(body).slice(0, 300)}`);
			continue;
		}
		if (sample.expectEmpty) {
			check(label, body.language === null, `language should be null, got ${JSON.stringify(body.language)}`);
			check(label, body.reliability === "empty", `reliability should be "empty", got ${JSON.stringify(body.reliability)}`);
			check(label, body.top.length === 0, `top should be empty, got ${body.top.length} candidates`);
			console.log(`${label}: language=null reliability=${body.reliability} detectMs=${body.detectMs}`);
			continue;
		}
		checkShape(label, body);
		if (sample.expectLanguage) {
			check(label, body.language === sample.expectLanguage, `language should be ${sample.expectLanguage}, got ${JSON.stringify(body.language)}`);
		}
		if (sample.expectLanguageIn) {
			check(
				label,
				sample.expectLanguageIn.includes(body.language),
				`language should be one of ${sample.expectLanguageIn.join("/")}, got ${JSON.stringify(body.language)}`,
			);
		}
		const top = body.top.map((c) => `${c.language}:${c.probability}`).join(" ");
		console.log(
			`${label}: language=${body.language} reliability=${body.reliability} tooClose=${body.isTooCloseToCall} top=[${top}] detectMs=${body.detectMs}`,
		);
	}
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
