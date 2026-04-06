import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

function getSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "__tests__" || entry === "node_modules" || entry === "dist") continue;
      files.push(...getSourceFiles(full));
    } else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts") && !entry.endsWith(".d.ts")) {
      files.push(full);
    }
  }
  return files;
}

function getImports(filePath: string): string[] {
  const content = readFileSync(filePath, "utf-8");
  const imports: string[] = [];
  // Match: import ... from "..."  and  import "..."
  const regex = /(?:import|from)\s+["']([^"']+)["']/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    imports.push(match[1]);
  }
  return imports;
}

describe("dependency boundaries", () => {
  it("packages/queries does not import from apps/", () => {
    const queriesSrc = join(__dirname, "..", "..");
    const files = getSourceFiles(join(queriesSrc, "src"));
    const violations: { file: string; import: string }[] = [];

    for (const file of files) {
      for (const imp of getImports(file)) {
        if (imp.includes("apps/") || imp.startsWith("@/")) {
          violations.push({ file, import: imp });
        }
      }
    }

    expect(violations, `Found ${violations.length} violations: ${JSON.stringify(violations, null, 2)}`).toHaveLength(0);
  });

  it("packages/types does not import from apps/ or packages/queries", () => {
    const typesSrc = join(__dirname, "..", "..", "..", "types");
    const files = getSourceFiles(join(typesSrc, "src"));
    const violations: { file: string; import: string }[] = [];

    for (const file of files) {
      for (const imp of getImports(file)) {
        if (imp.includes("apps/") || imp.includes("@dothesenow/queries") || imp.startsWith("@/")) {
          violations.push({ file, import: imp });
        }
      }
    }

    expect(violations, `Found ${violations.length} violations: ${JSON.stringify(violations, null, 2)}`).toHaveLength(0);
  });

  it("packages/queries only imports from allowed packages", () => {
    const queriesSrc = join(__dirname, "..", "..");
    const files = getSourceFiles(join(queriesSrc, "src"));
    const allowedExternalPrefixes = [
      "@dothesenow/types",
      "@supabase/supabase-js",
    ];

    const violations: { file: string; import: string }[] = [];

    for (const file of files) {
      for (const imp of getImports(file)) {
        // Skip relative imports
        if (imp.startsWith(".")) continue;
        // Check against allowlist
        if (!allowedExternalPrefixes.some((prefix) => imp.startsWith(prefix))) {
          violations.push({ file, import: imp });
        }
      }
    }

    expect(violations, `Unexpected imports: ${JSON.stringify(violations, null, 2)}`).toHaveLength(0);
  });
});
