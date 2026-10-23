import { describe, expect, it } from "vitest";
import { cleanDocument, plainText, safeHref } from "@/lib/handbook/document";

const doc = (...content: unknown[]) => ({ type: "doc", content });
const p = (text: string, marks?: unknown[]) => ({ type: "paragraph", content: [{ type: "text", text, ...(marks ? { marks } : {}) }] });

describe("a routine's text (ticket 37)", () => {
  it("keeps headings, lists, checklists and formatting", () => {
    const input = doc(
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Öppna" }] },
      { type: "taskList", content: [{ type: "taskItem", attrs: { checked: true }, content: [p("Lås upp")] }] },
      { type: "orderedList", attrs: { start: 1 }, content: [{ type: "listItem", content: [p("Tänd", [{ type: "bold" }])] }] },
    );
    expect(cleanDocument(input)).toEqual(input);
  });

  it("drops what Handbok does not allow, and links that are not to the web, email or phone", () => {
    const cleaned = cleanDocument(
      doc(
        { type: "image", attrs: { src: "x" } },
        { type: "heading", attrs: { level: 1, onclick: "x" }, content: [{ type: "text", text: "Rubrik" }] },
        p("klicka", [{ type: "link", attrs: { href: "javascript:alert(1)" } }, { type: "italic" }, { type: "highlight" }]),
        p("hemsidan", [{ type: "link", attrs: { href: "https://crossfittegen.se" } }]),
      ),
    );
    expect(cleaned.content).toEqual([
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Rubrik" }] },
      p("klicka", [{ type: "italic" }]),
      p("hemsidan", [{ type: "link", attrs: { href: "https://crossfittegen.se", target: "_blank", rel: "noopener noreferrer nofollow" } }]),
    ]);
  });

  it("refuses what is not a document, and documents that are too big", () => {
    expect(() => cleanDocument({ type: "paragraph" })).toThrow();
    expect(() => cleanDocument("not json")).toThrow();
    expect(() => cleanDocument(doc(p("x".repeat(250_000))))).toThrow();
  });

  it("reads from the JSON the form sends, and an empty document still has a line to write on", () => {
    expect(cleanDocument(JSON.stringify(doc()))).toEqual({ type: "doc", content: [{ type: "paragraph" }] });
  });

  it("allows web, email and phone links only", () => {
    expect(safeHref("https://a.se")).toBe("https://a.se");
    expect(safeHref("mailto:hej@a.se")).toBe("mailto:hej@a.se");
    expect(safeHref("tel:+4670")).toBe("tel:+4670");
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref("data:text/html,x")).toBeNull();
  });

  it("is plain text for search, a line per paragraph or heading", () => {
    const text = plainText(
      doc(
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Stänga" }] },
        { type: "bulletList", content: [{ type: "listItem", content: [p("Släck i omklädningsrummet")] }] },
        { type: "paragraph", content: [{ type: "text", text: "Lås" }, { type: "hardBreak" }, { type: "text", text: "dörren" }] },
      ) as never,
    );
    expect(text).toBe("Stänga\nSläck i omklädningsrummet\nLås dörren");
  });
});
