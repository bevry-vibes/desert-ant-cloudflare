// fetches the test fixture from stable public sources
// both files are small enough to commit, so this script only needs to run on a
// fresh clone when the fixtures are missing
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const modelDir = dirname(scriptDir);
const fixturesDir = join(modelDir, "assets", "fixtures");

// Wikimedia Commons serves its thumbnails to agents that send a user agent
const UA = "desert-ant-cloudflare-harness/1.0 (model runtime test)";

const FIXTURES = [
	{
		name: "benign.jpg",
		// the Cat03.jpg lead image, resolved through the Commons imageinfo API;
		// 960px is the standard thumbnail bucket Wikimedia serves on request
		url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/3/3a/Cat03.jpg/960px-Cat03.jpg",
	},
];

async function fetchFixture(fixture) {
	const res = await fetch(fixture.url, { headers: { "user-agent": UA }, redirect: "follow" });
	if (!res.ok) throw new Error(`${fixture.url}: HTTP ${res.status}`);
	const bytes = Buffer.from(await res.arrayBuffer());
	if (bytes.length > 1024 * 1024) throw new Error(`${fixture.name}: ${bytes.length} bytes exceeds 1 MiB`);
	return bytes;
}

const results = [];
mkdirSync(fixturesDir, { recursive: true });
for (const fixture of FIXTURES) {
	const bytes = await fetchFixture(fixture);
	const dest = join(fixturesDir, fixture.name);
	writeFileSync(dest, bytes);
	results.push(`${fixture.name}: ${bytes.length} bytes from ${fixture.url}`);
}
for (const line of results) console.log(line);
