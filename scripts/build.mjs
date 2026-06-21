import { cp, mkdir, readdir, rm } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const dist = join(root, "dist");

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

for (const path of ["manifest.json", "README.md", "LICENSE", "assets", "_locales"]) {
  await cp(join(root, path), join(dist, path), { recursive: true, force: true });
}

await copyDirContents(join(root, "src"), join(dist, "src"));
await mkdir(join(dist, "src", "vendor"), { recursive: true });
await cp(
  join(root, "node_modules", "pdfjs-dist", "build", "pdf.min.mjs"),
  join(dist, "src", "vendor", "pdf.min.mjs")
);
await cp(
  join(root, "node_modules", "pdfjs-dist", "build", "pdf.worker.min.mjs"),
  join(dist, "src", "vendor", "pdf.worker.min.mjs")
);

console.log("Built extension in dist");

async function copyDirContents(sourceDir, targetDir) {
  await mkdir(targetDir, { recursive: true });
  const entries = await readdir(sourceDir, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = join(sourceDir, entry.name);
    const targetPath = join(targetDir, entry.name);
    await cp(sourcePath, targetPath, {
      recursive: entry.isDirectory(),
      force: true
    });
  }
}
