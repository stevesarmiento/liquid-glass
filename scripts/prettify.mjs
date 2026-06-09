import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import prettier from "prettier";

const root = process.cwd();
const manifestPath = path.join(root, "artifacts", "raw", "manifest.json");
const outDir = path.join(root, "artifacts", "prettified");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

await mkdir(outDir, { recursive: true });

const parserFor = {
  js: "babel",
  css: "css",
  html: "html",
  map: "json",
};

let count = 0;

for (const resource of manifest.resources) {
  if (!resource.ok) continue;
  const parser = parserFor[resource.type];
  if (!parser) continue;

  const sourcePath = path.join(root, resource.path);
  const source = await readFile(sourcePath, "utf8");
  let formatted;

  try {
    formatted = await prettier.format(source, { parser });
  } catch (error) {
    console.warn(`Skipped ${resource.path}: ${error.message}`);
    continue;
  }

  const parsed = new URL(resource.url);
  const basename = path.basename(parsed.pathname) || "page.html";
  const extension = resource.type === "html" ? "html" : resource.type;
  const outputPath = path.join(outDir, `${count.toString().padStart(3, "0")}-${basename}.pretty.${extension}`);
  await writeFile(outputPath, formatted);
  count += 1;
}

console.log(`Prettified ${count} resources into artifacts/prettified/`);
