// Desert Ant Labs Shapes on Cloudflare workerd: single-stroke shape recognition.
//
// The stock browser entry of @desert-ant-labs/shapes cannot run here, because
// LiteRT.js initialises through importScripts or a <script> tag and workerd has
// neither. This worker therefore wires the same SDK pieces by hand:
//
// 1. Fetch the Swift core (ShapesWeb.wasm) from the assets binding and
//    instantiate it through the package's own BridgeJS and WASI shim entry.
// 2. Initialise LiteRT.js through src/litert-workerd.js.
// 3. Fetch the .tflite artifact and its sidecar from the assets binding,
//    compile the model in LiteRT.js, and hand the sidecars to the core with
//    createSelfHosted(). This is the SDK's own modelBaseUrl path, minus fetch.
//
// Every stage reports its duration, so the numbers land in RESULTS.md.

import { wasmCore, makeLiteRtHost, makeModelHostSeam, readyModel } from "@desert-ant-labs/core";
import * as coreEntry from "../node_modules/@desert-ant-labs/shapes/dist/index.js";
import { makeShapes } from "../node_modules/@desert-ant-labs/shapes/shapes.js";
import shapesCoreModule from "../node_modules/@desert-ant-labs/shapes/dist/ShapesWeb.wasm";
import { loadLiteRtWorkerd } from "./litert-workerd.js";

const PACKAGE_NAME = "@desert-ant-labs/shapes";
const SDK_VERSION = "3.5.0";
// sha256 of the pinned shapes.tflite, as reported by the core's own Hub
// download; the worker refuses bytes that do not match.
const ARTIFACT_SHA256 = "b7259453caac9ed8a4a0a1e1494d7110ed8cfe9fddbe3c3224173c5de71c8a83";

// One recognition session per isolate. The first request pays the cold load.
let sessionPromise = null;

function getSession(env, origin) {
	sessionPromise ??= loadSession(env, origin);
	return sessionPromise;
}

async function loadSession(env, origin) {
	const timings = { coldLoadMs: 0 };
	const started = performance.now();

	const seam = makeModelHostSeam();
	const instantiating = performance.now();
	console.log("[shapes] instantiating Swift core");
	const { exports } = await coreEntry.init({
		module: shapesCoreModule,
		getImports: () => seam.imports,
	});
	console.log("[shapes] Swift core ready");
	timings.instantiateCoreMs = elapsed(instantiating);

	const core = wasmCore(exports);
	const info = exports.modelInfo();

	const readingModel = performance.now();
	const modelBytes = await assetBytes(env, origin, `/model/${info.artifact}`);
	const observed = await sha256Hex(modelBytes);
	if (observed !== ARTIFACT_SHA256) {
		throw new Error(`artifact hash mismatch: expected ${ARTIFACT_SHA256}, got ${observed}`);
	}
	const sidecars = {};
	for (const name of info.sidecars) {
		sidecars[name] = await assetBytes(env, origin, `/model/${name}`);
	}
	timings.readModelMs = elapsed(readingModel);

	const bootingLitert = performance.now();
	const { litert, ms: litertMs, relaxedSimd } = await loadLiteRtWorkerd(origin);
	timings.initLitertMs = litertMs;
	timings.relaxedSimd = relaxedSimd;

	const { host, setModel } = makeLiteRtHost({
		accelerator: "wasm",
		loadAndCompile: litert.loadAndCompile,
		Tensor: litert.Tensor,
		readModelSource: async (source) => source,
	});
	seam.install(host);

	const compiling = performance.now();
	setModel(await litert.loadAndCompile(modelBytes, { accelerator: "wasm" }));
	timings.compileModelMs = elapsed(compiling);

	const handle = core.createSelfHosted(sidecars);
	const model = await readyModel({ core, packageName: PACKAGE_NAME, handle });
	const Shapes = makeShapes({ core, open: async () => model });

	timings.coldLoadMs = elapsed(started);
	return { shapes: new Shapes(model), core, info, timings };
}

async function assetBytes(env, origin, path) {
	const response = await env.ASSETS.fetch(`${origin}${path}`);
	if (!response.ok) {
		throw new Error(`asset ${path} returned ${response.status}`);
	}
	return new Uint8Array(await response.arrayBuffer());
}

async function sha256Hex(bytes) {
	const digest = await crypto.subtle.digest("SHA-256", bytes);
	return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function elapsed(since) {
	return Math.round((performance.now() - since) * 100) / 100;
}

// --------------------------------------------------------------- test matrix

// Draw one clean stroke for each class the model knows. Points follow canvas
// convention: y grows downwards. A small jitter keeps the strokes honest.
function synthesiseStrokes() {
	const jitter = (amount) => (Math.sin(Math.random() * Math.PI * 2) * amount);
	return {
		rectangle: rectStroke(60, 60, 220, 140, 3),
		triangle: triStroke(150, 40, 60, 220, 240, 220, 2),
		line: segmentStroke(50, 200, 250, 60, 3),
		ellipse: ellipseStroke(150, 120, 90, 55, Math.PI / 9, 64, 2),
		star: starStroke(150, 130, 95, 40, -Math.PI / 2, 5),
		jitter,
	};
}

function rectStroke(x0, y0, x1, y1, wobble) {
	const points = [];
	const corners = [
		[x0, y0],
		[x1, y0],
		[x1, y1],
		[x0, y1],
		[x0, y0],
	];
	for (let c = 0; c < corners.length - 1; c++) {
		const [ax, ay] = corners[c];
		const [bx, by] = corners[c + 1];
		for (let i = 0; i < 16; i++) {
			const t = i / 16;
			points.push({
				x: ax + (bx - ax) * t + wobble * Math.sin(t * Math.PI),
				y: ay + (by - ay) * t,
			});
		}
	}
	points.push({ x: x0, y: y0 });
	return points;
}

function triStroke(ax, ay, bx, by, cx, cy, wobble) {
	const points = [];
	const corners = [
		[ax, ay],
		[bx, by],
		[cx, cy],
		[ax, ay],
	];
	for (let c = 0; c < corners.length - 1; c++) {
		const [sx, sy] = corners[c];
		const [ex, ey] = corners[c + 1];
		for (let i = 0; i < 14; i++) {
			const t = i / 14;
			points.push({
				x: sx + (ex - sx) * t + wobble * Math.sin(t * Math.PI),
				y: sy + (ey - sy) * t,
			});
		}
	}
	return points;
}

function segmentStroke(ax, ay, bx, by, wobble) {
	const points = [];
	for (let i = 0; i <= 32; i++) {
		const t = i / 32;
		points.push({
			x: ax + (bx - ax) * t,
			y: ay + (by - ay) * t + wobble * Math.sin(t * Math.PI),
		});
	}
	return points;
}

function ellipseStroke(cx, cy, rx, ry, rotation, steps, wobble) {
	const points = [];
	const cos = Math.cos(rotation);
	const sin = Math.sin(rotation);
	for (let i = 0; i <= steps; i++) {
		const t = (i / steps) * Math.PI * 2;
		const x = rx * Math.cos(t) * (1 + wobble / 1000 * Math.sin(3 * t));
		const y = ry * Math.sin(t);
		points.push({ x: cx + x * cos - y * sin, y: cy + x * sin + y * cos });
	}
	return points;
}

function starStroke(cx, cy, outer, inner, rotation, pointCount) {
	const edgePoints = 8;
	const corners = [];
	for (let v = 0; v < pointCount * 2; v++) {
		const angle = rotation + (v * Math.PI) / pointCount;
		const radius = v % 2 === 0 ? outer : inner;
		corners.push({ x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) });
	}
	const points = [];
	const along = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
	for (let v = 0; v < corners.length - 1; v++) {
		for (let i = 0; i < edgePoints; i++) {
			points.push(along(corners[v], corners[v + 1], i / edgePoints));
		}
	}
	points.push(corners[corners.length - 1]);
	for (let i = 1; i < edgePoints; i++) {
		points.push(along(corners[corners.length - 1], corners[0], i / edgePoints));
	}
	points.push(points[0]);
	return points;
}

// The recognizer returns the fitted shape but no score. Bracket the classifier
// confidence by raising minimumConfidence until the class gate rejects.
async function recogniseWithBracket(shapes, points) {
	const levels = [0.3, 0.5, 0.7, 0.8, 0.9];
	const started = performance.now();
	const accepted = await shapes.recognize(points);
	const firstMs = elapsed(started);
	let highestAccepted = null;
	if (accepted) {
		highestAccepted = 0;
		for (const level of levels) {
			const attempt = await shapes.recognize(points, { minimumConfidence: level });
			if (attempt) highestAccepted = level;
			else break;
		}
	}
	return { shape: accepted, firstCallMs: firstMs, highestAcceptedMinimumConfidence: highestAccepted };
}

async function runMatrix(env, origin) {
	const { shapes } = await getSession(env, origin);
	const strokes = synthesiseStrokes();
	const expectations = {
		rectangle: "rectangle",
		triangle: "triangle",
		line: "line",
		ellipse: "ellipse",
		star: "star",
	};
	const results = {};
	const matrixStarted = performance.now();
	for (const [name, points] of Object.entries(strokes)) {
		const outcome = await recogniseWithBracket(shapes, points);
		outcome.expected = expectations[name];
		outcome.match = outcome.shape?.kind === expectations[name];
		results[name] = outcome;
	}
	return {
		strokes: results,
		allMatched: Object.values(results).every((r) => r.match),
		matrixMs: elapsed(matrixStarted),
	};
}

// -------------------------------------------------------------------- routes

function jsonResponse(data, status = 200) {
	return new Response(JSON.stringify(data, null, "\t"), {
		status,
		headers: { "content-type": "application/json" },
	});
}

export default {
	async fetch(request, env) {
		const origin = new URL(request.url).origin;
		const { pathname } = new URL(request.url);
		try {
			if (request.method === "GET" && pathname === "/") {
				return jsonResponse({
					model: "shapes",
					sdkVersion: SDK_VERSION,
					runtime: "workerd",
					routes: ["/", "/health", "/model-info", "POST /recognize", "/matrix"],
				});
			}

			if (request.method === "GET" && pathname === "/health") {
				const session = await getSession(env, origin);
				return jsonResponse({
					ready: true,
					modelInfo: session.info,
					isDownloaded: session.shapes.isDownloaded(),
					timings: session.timings,
				});
			}

			if (request.method === "GET" && pathname === "/model-info") {
				const session = await getSession(env, origin);
				return jsonResponse({ modelInfo: session.info, timings: session.timings });
			}

			if (request.method === "POST" && pathname === "/recognize") {
				const body = await request.json();
				const points = Array.isArray(body?.points) ? body.points : null;
				if (!points || points.length < 2) {
					return jsonResponse({ error: "body must hold { points: [[x, y], ...] } with at least two points" }, 400);
				}
				const normalised = points.map((p) => (Array.isArray(p) ? { x: p[0], y: p[1] } : p));
				const { shapes } = await getSession(env, origin);
				const started = performance.now();
				const shape = await shapes.recognize(normalised, {
					minimumConfidence: Number(body?.minimumConfidence ?? 0),
				});
				return jsonResponse({ shape, recogniseMs: elapsed(started), pointCount: normalised.length });
			}

			if (request.method === "GET" && pathname === "/matrix") {
				return jsonResponse(await runMatrix(env, origin));
			}

			return jsonResponse({ error: `no route for ${request.method} ${pathname}` }, 404);
		} catch (error) {
			return jsonResponse({
				error: String(error?.message ?? error),
				stack: String(error?.stack ?? "").split("\n").slice(0, 12),
			}, 500);
		}
	},
};
