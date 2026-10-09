import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Pins the rules of docs/DESIGN.md (sections 4 to 12) so drift fails the
 * build instead of piling up. Adapted from the description of Erik's
 * design-invariants test in the LAB37 hq app.
 */

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === ".well-known" ? [] : files(full);
    return /\.(tsx|ts)$/.test(entry.name) ? [full] : [];
  });
}

const ui = files("src").filter((f) => !f.endsWith(".d.ts"));
const read = (f: string) => readFileSync(f, "utf8");

/** Class strings: the contents of every "...", '...' and `...` literal. */
function classLiterals(source: string): string[] {
  return [...source.matchAll(/(["'`])((?:(?!\1)[^\\]|\\.)*)\1/g)].map((m) => m[2]);
}

function violations(rule: RegExp, options: { except?: string[]; inClassesOnly?: boolean } = {}) {
  const found: string[] = [];
  for (const file of ui) {
    if (options.except?.some((e) => file.endsWith(e))) continue;
    const source = read(file);
    const haystacks = options.inClassesOnly ? classLiterals(source) : [source];
    for (const text of haystacks) {
      const match = text.match(rule);
      if (match) found.push(`${file}: ${match[0]}`);
    }
  }
  return found;
}

describe("design invariants (docs/DESIGN.md)", () => {
  it("uses the one focus ring, never a hand-written one", () => {
    expect(violations(/focus(-visible)?:(ring|outline)-?[\w[\]/.-]*/, { inClassesOnly: true })).toEqual([]);
    expect(violations(/(^|\s)outline-none(\s|$)/, { inClassesOnly: true })).toEqual([]);
  });

  it("uses only the type scale, no arbitrary font sizes", () => {
    expect(violations(/(^|\s)text-\[(\d|0\.)[^\]]*\]/, { inClassesOnly: true })).toEqual([]);
  });

  it("uses only the named radius steps", () => {
    expect(violations(/(^|\s)rounded(\s|$)/, { inClassesOnly: true })).toEqual([]);
    expect(violations(/(^|\s)rounded(-[trblxyse]{1,2})?-(\[|3xl|4xl)/, { inClassesOnly: true })).toEqual([]);
  });

  it("keeps the app-window radius on the app window only", () => {
    expect(violations(/(^|\s)(lg:)?rounded-2xl/, { inClassesOnly: true, except: ["src/app/(app)/layout.tsx"] })).toEqual([]);
  });

  it("never hardcodes a colour in a component", () => {
    // theme-color in the root layout is a meta value, not a style, and cannot read a CSS variable.
    expect(violations(/#[0-9a-fA-F]{3,8}\b/, { inClassesOnly: true, except: ["src/app/layout.tsx"] })).toEqual([]);
    expect(violations(/(^|\s)(text|bg|border)-(white|black)(\s|$|\/)/, { inClassesOnly: true })).toEqual([]);
    expect(
      violations(/(^|\s)[a-z:-]*(text|bg|border|ring|fill|stroke)-(red|amber|green|blue|yellow|orange|stone|slate|gray|neutral|zinc|emerald|sky|indigo)-\d{2,3}/, {
        inClassesOnly: true,
      }),
    ).toEqual([]);
  });

  it("makes status tints with .chip-tint, never by hand", () => {
    expect(violations(/(^|\s)bg-(destructive|warning|success)\/\d+/, { inClassesOnly: true })).toEqual([]);
  });

  it("never lowers muted text further with opacity", () => {
    expect(violations(/text-muted-foreground\/\d+/, { inClassesOnly: true })).toEqual([]);
    const both = ui.flatMap((f) =>
      classLiterals(read(f))
        .filter((c) => /(^|\s)text-muted-foreground(\s|$)/.test(c) && /(^|\s)opacity-\d+/.test(c))
        .map((c) => `${f}: ${c}`),
    );
    expect(both).toEqual([]);
  });

  it("uses the elevation utilities, no big shadows, no glass", () => {
    expect(violations(/(^|\s)shadow-(md|lg|xl|2xl)(\s|$)/, { inClassesOnly: true })).toEqual([]);
    expect(violations(/(^|\s)backdrop-(blur|filter)/, { inClassesOnly: true })).toEqual([]);
  });

  it("animates listed properties only, never transition-all", () => {
    expect(violations(/(^|\s)transition-all(\s|$)/, { inClassesOnly: true })).toEqual([]);
  });

  it("uses motion/react, lucide-react and Geist only", () => {
    expect(violations(/from ["']framer-motion["']/)).toEqual([]);
    expect(violations(/from ["'](react-icons|@heroicons|@radix-ui\/react-icons|@tabler)/)).toEqual([]);
    expect(violations(/from ["']radix-ui["']|from ["']@radix-ui\//)).toEqual([]);
    const fonts = ui.flatMap((f) =>
      [...read(f).matchAll(/import \{([^}]+)\} from ["']next\/font\/google["']/g)].flatMap((m) =>
        m[1].split(",").map((s) => s.trim()).filter((name) => name && !["Geist", "Geist_Mono"].includes(name)).map((name) => `${f}: ${name}`),
      ),
    );
    expect(fonts).toEqual([]);
  });

  it("writes empty values as words, never a dash", () => {
    const messages = JSON.parse(read("src/messages/sv.json")) as Record<string, string>;
    const dashes = Object.entries(messages).filter(([, v]) => /—/.test(v) || /^\s*[-–]\s*$/.test(v));
    expect(dashes).toEqual([]);
    expect(violations(/>\s*[–—-]\s*</)).toEqual([]);
    expect(violations(/\?\?\s*["'][–—-]["']/)).toEqual([]);
  });
});
