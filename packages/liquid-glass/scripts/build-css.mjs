// Emits dist/react/index.css from the same string that powers runtime style
// injection (src/react/inject-styles.ts), so consumers can opt into an
// explicit `import "liquid-glass/styles.css"` instead.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const distReactDir = path.join(here, "..", "dist", "react");
const modulePath = path.join(distReactDir, "inject-styles.js");

const { LIQUID_GLASS_STYLES } = await import(pathToFileURL(modulePath).href);

await mkdir(distReactDir, { recursive: true });
await writeFile(path.join(distReactDir, "index.css"), LIQUID_GLASS_STYLES, "utf8");
console.log("liquid-glass: wrote dist/react/index.css");
