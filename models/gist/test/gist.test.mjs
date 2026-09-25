// workerd probe test for @desert-ant-labs/gist.
// The expected outcome is a documented failure: the default entry initialises
// LiteRT browser setup at module init, which crashes in workerd. The test
// asserts that exact failure mode.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";

const wrangler = new URL("../../../node_modules/.bin/wrangler", import.meta.url).pathname;
const port = 8826;
const child = spawn(wrangler, ["dev", "--port", String(port)], {
	stdio: ["ignore", "pipe", "pipe"],
	detached: true,
});
child.stdout.on("data", (d) => process.stdout.write(`[wrangler] ${d}`));
child.stderr.on("data", (d) => process.stderr.write(`[wrangler] ${d}`));

async function waitForServer(path, timeoutMs = 60000) {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		try {
			const res = await fetch(`http://127.0.0.1:${port}${path}`);
			if (res.status === 200 || res.status === 500) return res;
		} catch {
			// server not up yet
		}
		await new Promise((r) => setTimeout(r, 500));
	}
	throw new Error("wrangler dev did not become ready");
}

/** Kill the whole process group; wrangler spawns workerd children. */
function killGroup() {
	try {
		process.kill(-child.pid, "SIGKILL");
	} catch {
		child.kill("SIGKILL");
	}
}

try {
	const res = await waitForServer("/probe");
	const body = await res.json();
	assert.equal(body.ok, false, "the probe must record a failure");
	assert.equal(body.message, "Invalid URL string.", "LiteRT browser setup must crash at module init");
	console.log("probe failure recorded as expected: gist cannot initialise in workerd");
} finally {
	killGroup();
}
