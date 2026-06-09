import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const searchRoots = [
  path.join(root, "artifacts", "prettified"),
  path.join(root, "artifacts", "raw"),
];

const defaultTerms = [
  "data-aave-glass-container",
  "feDisplacementMap",
  "displacement",
  "generateLensMap",
  "initRefraction",
  "refractionTarget",
  "chroma",
  "lens",
  "backdrop-filter",
  "webgl",
  "shader",
  "filterUnits",
];

const terms = process.argv.slice(2).length ? process.argv.slice(2) : defaultTerms;
const loweredTerms = terms.map((term) => term.toLowerCase());
const extensions = new Set([".html", ".js", ".css", ".map", ".json"]);

async function* walk(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const filePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(filePath);
    } else if (extensions.has(path.extname(entry.name))) {
      yield filePath;
    }
  }
}

function compactLine(line) {
  return line.trim().replace(/\s+/g, " ").slice(0, 240);
}

let hits = 0;

for (const searchRoot of searchRoots) {
  for await (const filePath of walk(searchRoot)) {
    const fileStat = await stat(filePath);
    if (fileStat.size > 20_000_000) continue;

    const text = await readFile(filePath, "utf8");
    const lower = text.toLowerCase();
    if (!loweredTerms.some((term) => lower.includes(term))) continue;

    const lines = text.split(/\r?\n/);
    const rel = path.relative(root, filePath);

    lines.forEach((line, index) => {
      const lowerLine = line.toLowerCase();
      const matchedTerms = loweredTerms.filter((term) => lowerLine.includes(term));
      if (!matchedTerms.length) return;

      hits += 1;
      console.log(`${rel}:${index + 1} [${matchedTerms.join(", ")}] ${compactLine(line)}`);
    });
  }
}

if (!hits) {
  console.log(`No hits for: ${terms.join(", ")}`);
}
