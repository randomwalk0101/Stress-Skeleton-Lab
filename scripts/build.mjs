import { cp, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const dist = join(root, "dist");

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

for (const path of ["manifest.json", "README.md", "LICENSE", "src", "assets", "_locales"]) {
  await cp(join(root, path), join(dist, path), { recursive: true });
}

console.log("Built extension in dist");
