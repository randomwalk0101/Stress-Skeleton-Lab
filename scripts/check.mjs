import { readFile } from "node:fs/promises";

const manifest = JSON.parse(await readFile("manifest.json", "utf8"));
const required = [
  "src/background/service-worker.js",
  "src/content/page-translator.js",
  "src/content/hover-dictionary.js",
  "src/content/youtube-captions.js",
  "src/popup/popup.html",
  "src/options/options.html",
  "src/reader/reader.html"
];

if (manifest.manifest_version !== 3) throw new Error("Manifest must be v3");
for (const path of required) {
  await readFile(path, "utf8");
}

console.log("Manifest and source files look OK");
