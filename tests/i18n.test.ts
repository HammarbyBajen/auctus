import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import sv from "@/messages/sv.json";
import { t, type MessageKey } from "@/lib/i18n";

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

describe("Swedish messages", () => {
  it("has no empty strings", () => {
    for (const [key, value] of Object.entries(sv)) {
      expect(value.trim(), key).not.toBe("");
    }
  });

  it("defines every key that the code uses", () => {
    const used = new Set<string>();
    for (const file of sourceFiles("src")) {
      for (const match of readFileSync(file, "utf8").matchAll(/\bt\(\s*"([^"]+)"/g)) {
        used.add(match[1]);
      }
    }
    for (const key of used) {
      expect(Object.keys(sv), key).toContain(key);
    }
  });

  it("fills in placeholders", () => {
    expect(t("home.greeting", { name: "Fredrik" })).toBe("Hej Fredrik!");
    expect(t("login.title" as MessageKey)).toBe("Logga in");
  });
});
