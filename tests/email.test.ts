import { describe, expect, it } from "vitest";
import { emailHtml, emailText } from "@/lib/email/layout";
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

  it("render as HTML and plain text with the studio's name and no images", () => {
    const content = { body: "Hej Anna,\n\nVälkommen till oss.\nVi ses!", studioName: "CrossFit Tegen" };
    const html = emailHtml(content);
    expect(html).toContain("Välkommen till oss.<br>Vi ses!");
    expect(html).toContain('lang="sv"');
    expect(html).not.toContain("<img");
    expect(emailText(content)).toBe("Hej Anna,\n\nVälkommen till oss.\nVi ses!\n\n--\nCrossFit Tegen\n");
  });

  it("escape what Tegen writes, so text can never become markup", () => {
    const html = emailHtml({ body: '<script>alert("x")</script> & <b>fet</b>', studioName: "Tegen & Co" });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &lt;b&gt;fet&lt;/b&gt;");
    expect(html).toContain("Tegen &amp; Co");
  });
});
