import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const SAFETY_ONLY_TABLES = ["wellness_checks", "safety_watchdog_state", "safety_events", "location_breadcrumbs"];
const ACCOUNTABILITY_ONLY_MARKERS = ["photo_verifications", "verification_score", "verification_signals", "flag_status", "flag_reasons"];

function readSource(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

/** Any file under repositories/ whose name suggests it's a production/reporting module. */
function reportingRepositoryFiles(): string[] {
  const dir = path.join(repoRoot, "src", "repositories");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".ts") && /stat|report|production/i.test(f))
    .map((f) => path.join("src", "repositories", f));
}

describe("safety/accountability firewall (docs/ARCHITECTURE.md section 8.0)", () => {
  it("production-stats.ts never mentions any safety-only table", () => {
    const files = ["src/repositories/production-stats.ts", ...reportingRepositoryFiles()];
    for (const file of new Set(files)) {
      const source = readSource(file);
      for (const table of SAFETY_ONLY_TABLES) {
        expect(source.includes(table), `${file} must never mention "${table}"`).toBe(false);
      }
    }
  });

  it("production-stats.ts never imports repositories/safety.ts", () => {
    const source = readSource("src/repositories/production-stats.ts");
    expect(source).not.toMatch(/from\s+["'].*repositories\/safety(\.js)?["']/);
  });

  it("safety.ts never mentions photo_verifications or contact_attempts' scoring/flag columns", () => {
    const source = readSource("src/repositories/safety.ts");
    for (const marker of ACCOUNTABILITY_ONLY_MARKERS) {
      expect(source.includes(marker), `safety.ts must never mention "${marker}"`).toBe(false);
    }
  });

  it("safety.ts never imports repositories/production-stats.ts", () => {
    const source = readSource("src/repositories/safety.ts");
    expect(source).not.toMatch(/from\s+["'].*repositories\/production-stats(\.js)?["']/);
  });

  it("console live-ops route keeps safetyAlerts and accountabilityAlerts as separate arrays", () => {
    const source = readSource("src/routes/console.ts");
    // The two-stack rule: never merged into one `alerts` array.
    expect(source).not.toMatch(/\balerts\s*:/);
    expect(source).toMatch(/safetyAlerts/);
    expect(source).toMatch(/accountabilityAlerts/);
  });
});
