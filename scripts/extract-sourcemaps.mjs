import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const manifest = JSON.parse(
  await readFile(path.join(root, "artifacts", "raw", "manifest.json"), "utf8"),
);
const outRoot = path.join(root, "artifacts", "sourcemaps");
const maps = manifest.resources.filter((resource) => resource.ok && resource.type === "map");

function safeSegment(segment) {
  return segment.replace(/^[a-z]+:\/\//i, "").replace(/[^a-zA-Z0-9._-]+/g, "_");
}

function safeSourcePath(source, index) {
  const clean = source
    .replace(/^webpack:\/\//, "")
    .replace(/^file:\/\//, "")
    .replace(/^\/+/, "");
  const parts = clean.split(/[\\/]+/).filter(Boolean).map(safeSegment);
  return parts.length ? path.join(...parts) : `${index}.js`;
}

let extracted = 0;

for (const mapResource of maps) {
  const mapText = await readFile(path.join(root, mapResource.path), "utf8");
  const map = JSON.parse(mapText);
  const mapName = safeSegment(path.basename(new URL(mapResource.url).pathname));
  const mapOut = path.join(outRoot, mapName);
  await mkdir(mapOut, { recursive: true });

  await writeFile(
    path.join(mapOut, "metadata.json"),
    `${JSON.stringify(
      {
        url: mapResource.url,
        file: map.file,
        sourceRoot: map.sourceRoot,
        sources: map.sources || [],
        hasSourcesContent: Array.isArray(map.sourcesContent),
      },
      null,
      2,
    )}\n`,
  );

  if (!Array.isArray(map.sourcesContent)) {
    console.log(`${mapResource.path}: no sourcesContent`);
    continue;
  }

  for (let index = 0; index < map.sourcesContent.length; index += 1) {
    const content = map.sourcesContent[index];
    if (typeof content !== "string") continue;

    const source = map.sources?.[index] || `${index}.js`;
    const outputPath = path.join(mapOut, "sources", safeSourcePath(source, index));
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, content);
    extracted += 1;
  }
}

console.log(`Maps found: ${maps.length}`);
console.log(`Source files extracted: ${extracted}`);
