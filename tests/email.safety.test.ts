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
const transport = path.join("src", "lib", "email", "transport.ts");

describe("email goes through one guarded door (M8)", () => {
  it("only the transport talks to Resend", () => {
    const importers = files("src").filter((f) => /from ["']resend["']/.test(read(f)));
    expect(importers).toEqual([transport]);
  });

  it("only the transport reads the Resend key and webhook secret, and it is server-only", () => {
    const readers = files("src").filter((f) => /process\.env\.RESEND_(API_KEY|WEBHOOK_SECRET)/.test(read(f)));
    expect(readers).toEqual([transport]);
    expect(read(transport)).toContain('import "server-only"');
    expect(read(path.join("src", "lib", "email", "service.ts"))).toContain('import "server-only"');
  });

  it("only the service reads the server's live switch", () => {
    const readers = files("src").filter((f) => read(f).includes("process.env.EMAIL_LIVE"));
    expect(readers).toEqual([path.join("src", "lib", "email", "service.ts")]);
  });

  it("no client component reaches the sending code", () => {
    for (const file of files("src")) {
      const source = read(file);
      if (!/^["']use client["']/m.test(source)) continue;
      expect(source, file).not.toMatch(/lib\/email\/(service|transport)/);
      expect(source, file).not.toMatch(/RESEND_|NEXT_PUBLIC_RESEND/);
    }
  });
});
