import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return files(full);
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}
const read = (file: string) => readFileSync(file, "utf8");
const client = path.join("src", "lib", "ai", "client.ts");

describe("the AI goes through one guarded door (ticket 30)", () => {
  it("only the AI client talks to Anthropic", () => {
    const importers = files("src").filter((f) => /from ["']@anthropic-ai\/sdk/.test(read(f)));
    expect(importers).toEqual([client]);
  });

  it("only the AI client reads the key, and it is server-only; one light module may say whether it is set", () => {
    const enabled = path.join("src", "lib", "ai", "enabled.ts");
    const readers = files("src").filter((f) => read(f).includes("process.env.ANTHROPIC_API_KEY"));
    expect(readers.sort()).toEqual([client, enabled].sort());
    expect(read(client)).toContain('import "server-only"');
    // It answers yes or no, never the key itself.
    expect(read(enabled)).toMatch(/Boolean\(process\.env\.ANTHROPIC_API_KEY\)/);
    expect(read(enabled).match(/process\.env\.ANTHROPIC_API_KEY/g)).toHaveLength(1);
  });

  it("no client component reaches the AI client or the tools", () => {
    for (const file of files("src")) {
      const source = read(file);
      if (!/^["']use client["']/m.test(source)) continue;
      expect(source, file).not.toMatch(/lib\/ai\/(client|tools)/);
      expect(source, file).not.toMatch(/ANTHROPIC_/);
    }
  });

  it("the tools never hand out phone numbers or email addresses", () => {
    const tools = read(path.join("src", "lib", "ai", "tools.ts"));
    expect(tools).not.toMatch(/person\.(phone|email)\b|row\.(phone|email)\b/);
  });
});
