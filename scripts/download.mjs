import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_URL = "https://aave.com/design/building-glass-for-the-web";
const targetUrl = process.argv[2] || DEFAULT_URL;
const root = process.cwd();
const rawDir = path.join(root, "artifacts", "raw");

await mkdir(rawDir, { recursive: true });

const seen = new Set();
const resources = [];

function sha256(textOrBytes) {
  return createHash("sha256").update(textOrBytes).digest("hex");
}

function sanitizeUrlToPath(url) {
  const parsed = new URL(url);
  const cleanPath = parsed.pathname.replace(/^\/+/, "") || "index";
  const queryHash = parsed.search ? `.${sha256(parsed.search).slice(0, 8)}` : "";
  return path.join(rawDir, parsed.hostname, `${cleanPath}${queryHash}`);
}

function inferType(url, contentType = "") {
  const pathname = new URL(url).pathname;
  if (pathname.endsWith(".js") || contentType.includes("javascript")) return "js";
  if (pathname.endsWith(".css") || contentType.includes("css")) return "css";
  if (pathname.endsWith(".map") || contentType.includes("json")) return "map";
  if (contentType.includes("html")) return "html";
  return "asset";
}

function absoluteUrl(candidate, baseUrl) {
  try {
    return new URL(candidate, baseUrl).toString();
  } catch {
    return null;
  }
}

function extractPublicResources(html, baseUrl) {
  const urls = new Set();
  const attrPattern = /\b(?:src|href)=["']([^"']+)["']/g;
  let match;

  while ((match = attrPattern.exec(html))) {
    const value = match[1];
    const absolute = absoluteUrl(value, baseUrl);
    if (!absolute) continue;

    const parsed = new URL(absolute);
    const isNextStatic = parsed.pathname.includes("/_next/static/");
    const isDesignDemo = parsed.pathname.includes("/design/demo/");
    const isCss = parsed.pathname.endsWith(".css");
    const isJs = parsed.pathname.endsWith(".js");
    const isImageOrVideo = /\.(png|jpe?g|webp|gif|mp4|webm|svg|woff2?)$/i.test(parsed.pathname);

    if (isNextStatic || isDesignDemo || isCss || isJs || isImageOrVideo) {
      urls.add(absolute);
    }
  }

  return [...urls];
}

function extractSourceMapUrls(text, resourceUrl) {
  const urls = [];
  const inlinePattern = /sourceMappingURL=([^\s"')]+)/g;
  let match;

  while ((match = inlinePattern.exec(text))) {
    const value = match[1].trim();
    if (value.startsWith("data:")) continue;
    const absolute = absoluteUrl(value, resourceUrl);
    if (absolute) urls.push(absolute);
  }

  return urls;
}

async function fetchResource(url, role = "resource") {
  if (seen.has(url)) return null;
  seen.add(url);

  const response = await fetch(url, {
    headers: {
      Accept: "*/*",
      "User-Agent": "aave-glass-research/0.1 public-resource-inspector",
    },
  });

  if (!response.ok) {
    resources.push({ url, role, ok: false, status: response.status });
    return null;
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  const contentType = response.headers.get("content-type") || "";
  const filePath = sanitizeUrlToPath(url);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, bytes);

  const record = {
    url,
    role,
    ok: true,
    status: response.status,
    type: inferType(url, contentType),
    contentType,
    size: bytes.byteLength,
    sha256: sha256(bytes),
    path: path.relative(root, filePath),
  };
  resources.push(record);

  return { bytes, text: new TextDecoder().decode(bytes), record };
}

async function tryAdjacentSourceMap(url) {
  const parsed = new URL(url);
  parsed.search = "";
  const mapUrl = `${parsed.toString()}.map`;
  return fetchResource(mapUrl, "adjacent-sourcemap");
}

console.log(`Downloading ${targetUrl}`);
const page = await fetchResource(targetUrl, "page");
if (!page) {
  throw new Error(`Could not download ${targetUrl}`);
}

const publicUrls = extractPublicResources(page.text, targetUrl);
console.log(`Found ${publicUrls.length} referenced public resources`);

for (const url of publicUrls) {
  const fetched = await fetchResource(url, "referenced");
  if (!fetched) continue;

  if (fetched.record.type === "js" || fetched.record.type === "css") {
    for (const mapUrl of extractSourceMapUrls(fetched.text, url)) {
      await fetchResource(mapUrl, "declared-sourcemap");
    }

    await tryAdjacentSourceMap(url);
  }
}

const manifest = {
  capturedAt: new Date().toISOString(),
  targetUrl,
  resources,
};

await writeFile(
  path.join(rawDir, "manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);

const okCount = resources.filter((resource) => resource.ok).length;
const mapCount = resources.filter((resource) => resource.ok && resource.type === "map").length;
console.log(`Downloaded ${okCount} resources`);
console.log(`Source maps available: ${mapCount}`);
console.log("Manifest: artifacts/raw/manifest.json");
