import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = process.cwd();
const dist = join(root, "dist");
const outputsRoot = join(root, "outputs", "browser-builds");
const browserArg = process.argv[2];
const browsers = browserArg ? [browserArg] : ["chrome", "edge", "firefox"];
const packagePrefix = "stress-skeleton-lab";

await execFileAsync("node", ["scripts/build.mjs"], { cwd: root });
await rm(outputsRoot, { recursive: true, force: true });
await mkdir(outputsRoot, { recursive: true });

for (const browser of browsers) {
  if (!["chrome", "edge", "firefox"].includes(browser)) {
    throw new Error(`Unsupported browser target: ${browser}`);
  }

  const targetDir = join(outputsRoot, browser);
  await cp(dist, targetDir, { recursive: true });

  if (browser === "firefox") {
    const manifestPath = join(targetDir, "manifest.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.browser_specific_settings = {
      gecko: {
        id: "stress-skeleton-lab@codex.local",
        strict_min_version: "128.0"
      }
    };
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  }

  const zipName = `${packagePrefix}-${browser}.zip`;
  const zipPath = join(outputsRoot, zipName);
  await rm(zipPath, { force: true });
  await execFileAsync("zip", ["-rq", zipPath, "."], { cwd: targetDir });
}

console.log(`Packaged browser builds in ${outputsRoot}`);
