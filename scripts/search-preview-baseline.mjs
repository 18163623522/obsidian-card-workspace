import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const DEFAULT_PREVIEW_BASELINE = "4064ce04c4534dc0f55e57d121ab4198819f29c7";

/** Share installed dependencies only; production source is fully isolated. */
export function freezePreviewBaseline(ref = DEFAULT_PREVIEW_BASELINE) {
  const revision = execFileSync("git", ["rev-parse", "--verify", `${ref}^{commit}`], { cwd: root, encoding: "utf8" }).trim();
  const temporary = mkdtempSync(join(tmpdir(), "card-workspace-preview-"));
  const baselineRoot = join(temporary, "baseline");
  try {
    mkdirSync(baselineRoot);
    const archive = execFileSync("git", ["archive", revision, "src", "styles.css", "package.json", "package-lock.json"], { cwd: root, maxBuffer: 32 * 1024 * 1024 });
    execFileSync("tar", ["-x", "-C", baselineRoot], { input: archive });
    symlinkSync(join(root, "node_modules"), join(baselineRoot, "node_modules"), "dir");
    return { revision, temporary, baselineRoot, dispose: () => rmSync(temporary, { recursive: true, force: true }) };
  } catch (error) {
    rmSync(temporary, { recursive: true, force: true });
    throw error;
  }
}

export function summarize(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  return { median: sorted[Math.floor(sorted.length / 2)], p95: sorted[Math.ceil(sorted.length * 0.95) - 1], max: sorted.at(-1), samples };
}

export function timingGate(name, before, after, relative, absolute) {
  const limits = Object.fromEntries(["median", "p95"].map(stat => [stat, before[stat] + Math.max(before[stat] * relative, absolute)]));
  return { name, limits, passed: after.median <= limits.median && after.p95 <= limits.p95 };
}
