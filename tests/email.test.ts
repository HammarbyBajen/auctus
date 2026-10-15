import { describe, expect, it } from "vitest";
import { render } from "react-email";
import { EmailLayout } from "@/lib/email/layout";
import { emailMode, normaliseAddress, recipientFor, testAddress } from "@/lib/email/mode";
import { fillTemplate, firstName, paragraphs } from "@/lib/email/template";

describe("when an email may reach a real person", () => {
  it("only when the server and an owner both say so, and there is a key", () => {
    expect(emailMode({ hasKey: true, serverLive: true, ownerLive: true })).toBe("live");
    expect(emailMode({ hasKey: true, serverLive: true, ownerLive: false })).toBe("test");
    expect(emailMode({ hasKey: true, serverLive: false, ownerLive: true })).toBe("test");
    expect(emailMode({ hasKey: false, serverLive: true, ownerLive: true })).toBe("dry_run");
  });

  it("sends a test email to Resend's test address, never to the person", () => {
    expect(recipientFor("test", "anna@example.test")).toBe(testAddress);
    expect(recipientFor("live", "anna@example.test")).toBe("anna@example.test");
    expect(normaliseAddress("  Anna@Example.TEST ")).toBe("anna@example.test");
  });
});

describe("templates", () => {
  it("fill in the name", () => {
    expect(fillTemplate("Hej {förnamn}! Vi har pratat, {namn}.", "Åsa Öberg")).toBe("Hej Åsa! Vi har pratat, Åsa Öberg.");
    expect(fillTemplate("Hej {förnamn}!", null)).toBe("Hej !");
    expect(firstName("  Bo  Ek ")).toBe("Bo");
  });

  it("split into paragraphs on blank lines, keeping single line breaks", () => {
    expect(paragraphs("Hej Anna,\r\n\r\nVälkommen in.\nVi ses!\n\n\nTegen")).toEqual(["Hej Anna,", "Välkommen in.\nVi ses!", "Tegen"]);
  });

  it("render as HTML and plain text with the studio's name and no images", async () => {
    const layout = EmailLayout({ body: "Hej Anna,\n\nVälkommen till oss.", studioName: "CrossFit Tegen" });
    const html = await render(layout);
    const text = await render(layout, { plainText: true });
    expect(html).toContain("Välkommen till oss.");
    expect(html).toContain('lang="sv"');
    expect(html).not.toContain("<img");
    expect(text).toContain("Hej Anna,");
    expect(text).toContain("CrossFit Tegen");
  });
});
