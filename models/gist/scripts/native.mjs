// Reference run of @desert-ant-labs/gist/native in plain Node on Linux x86.
// workerd cannot run gist (browser-only wasm entry), so this script records
// what the native core produces: topics, timings, weights, memory.
import { Gist } from "@desert-ant-labs/gist/native";

const samples = [
	"Power of Goodness di GITJ Tlogowungu: kegiatan bulanan melatih keberanian dan kebaikan bersama anak-anak",
	"Sharing happiness: community art day for children in Pati",
];

const t0 = performance.now();
const gist = await Gist.load({ onProgress: (f) => process.stdout.write(`\rdownload ${Math.round(f * 100)}%`) });
const loadMs = performance.now() - t0;
console.log(`\nloaded in ${loadMs.toFixed(0)} ms (first run downloads from the pinned HF tag; cached after)`);

for (const text of samples) {
	const t1 = performance.now();
	const topics = await gist.classify(text, { topK: 4 });
	console.log(`classify ${(performance.now() - t1).toFixed(1)}ms:`, JSON.stringify(topics));
}

console.log(`memory: ${(process.memoryUsage().rss / 1e6).toFixed(1)} MB RSS`);
gist.dispose();
console.log("done");
