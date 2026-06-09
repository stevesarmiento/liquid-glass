import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const manifest = JSON.parse(
  await readFile(path.join(root, "artifacts", "raw", "manifest.json"), "utf8"),
);

const ok = manifest.resources.filter((resource) => resource.ok);
const failed = manifest.resources.filter((resource) => !resource.ok);
const byType = Object.groupBy(ok, (resource) => resource.type || "unknown");
const maps = ok.filter((resource) => resource.type === "map");
const largest = [...ok]
  .sort((a, b) => b.size - a.size)
  .slice(0, 12)
  .map((resource) => ({
    type: resource.type,
    sizeKb: Math.round(resource.size / 102.4) / 10,
    path: resource.path,
    url: resource.url,
  }));

console.log(`Target: ${manifest.targetUrl}`);
console.log(`Captured: ${manifest.capturedAt}`);
console.log(`Downloaded: ${ok.length}`);
console.log(`Failed: ${failed.length}`);
console.log("By type:");
for (const [type, resources] of Object.entries(byType)) {
  console.log(`  ${type}: ${resources.length}`);
}
console.log(`Source maps: ${maps.length}`);
console.log("Largest resources:");
for (const resource of largest) {
  console.log(`  ${resource.sizeKb} KB ${resource.type} ${resource.path}`);
}
