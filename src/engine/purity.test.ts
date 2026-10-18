import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// The engine runs in the browser, on the server and in CLI scripts, so its
// source may only import other engine files.

const ENGINE_DIR = path.dirname(fileURLToPath(import.meta.url));

function engineSources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return engineSources(full);
    return entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") ? [full] : [];
  });
}

describe("engine purity", () => {
  const files = engineSources(ENGINE_DIR);

  it("finds the engine sources", () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it.each(files.map((f) => [path.relative(ENGINE_DIR, f), f]))("%s imports only engine files", (_, file) => {
    const source = readFileSync(file, "utf8");
    const specifiers = [...source.matchAll(/(?:import|export)[^"']*?from\s*["']([^"']+)["']/g)].map((m) => m[1]);
    for (const spec of specifiers) expect(spec, `${file} imports ${spec}`).toMatch(/^\.\.?\//);
    expect(source).not.toMatch(/\brequire\(|\bprocess\.|\bimport\(/);
  });
});
