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

describe("the Mana key stays on the server", () => {
  it("is read in one place only, which is marked server-only", () => {
    const readers = files("src").filter((f) => read(f).includes("MANA_API_KEY"));
    expect(readers).toEqual([path.join("src", "lib", "mana", "config.ts")]);
    expect(read(readers[0])).toContain('import "server-only"');
  });

  it("is not reachable from any client component", () => {
    for (const file of files("src")) {
      const source = read(file);
      if (!/^["']use client["']/m.test(source)) continue;
      expect(source, file).not.toMatch(/lib\/mana/);
      expect(source, file).not.toContain("MANA_API_KEY");
    }
  });

  it("is never exposed as a public variable", () => {
    for (const file of files("src")) {
      expect(read(file), file).not.toMatch(/NEXT_PUBLIC_MANA/);
    }
  });

  it("the client module is server-only", () => {
    expect(read("src/lib/mana/client.ts")).toContain('import "server-only"');
  });

  it("is never written to a log", () => {
    for (const file of files("src/lib/mana").concat(files("src/workflows"))) {
      const lines = read(file).split("\n");
      for (const line of lines) {
        if (/console\.(log|error|warn|info|debug)/.test(line)) {
          expect(line, file).not.toMatch(/apiKey|API_KEY|Authorization/i);
        }
      }
    }
  });
});

describe("the CRM never writes to Mana", () => {
  it("sends no HTTP method but GET in the code that talks to Mana", () => {
    for (const file of files("src/lib/mana").concat(files("src/workflows"))) {
      expect(read(file), file).not.toMatch(/method:\s*["'](POST|PUT|PATCH|DELETE)["']/i);
    }
    // The one request the client makes is a GET.
    expect(read("src/lib/mana/client.ts")).toMatch(/method:\s*"GET"/);
  });

  it("makes web requests in one file only, the Mana client", () => {
    const callers = files("src").filter((f) => /\bfetch\(|\bfetchFn\(/.test(read(f)));
    expect(callers).toEqual([path.join("src", "lib", "mana", "client.ts")]);
  });

  it("exposes no method on the client that could change anything", () => {
    const source = read("src/lib/mana/client.ts");
    const publicMethods = [...source.matchAll(/^\s{2}async (\w+)\(/gm)].map((m) => m[1]);
    expect(publicMethods.sort()).toEqual(["getClassBookings", "getGymCheckIns", "getPaidPayments", "getUserMemberships", "getUsersPage", "searchUsers"]);
  });
});
