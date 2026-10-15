import { Body, Container, Head, Hr, Html, Preview, Section, Text } from "react-email";
import { paragraphs } from "./template";

/**
 * The one layout every email from Tegen HQ uses (M8): the text Tegen wrote,
 * as paragraphs, and the studio's name at the bottom. No images, no tracking.
 * The words are Tegen's; this only sets them out.
 */
export function EmailLayout({ body, studioName }: { body: string; studioName: string }) {
  const parts = paragraphs(body);
  return (
    <Html lang="sv">
      <Head />
      <Body style={{ backgroundColor: "#ffffff", fontFamily: "Helvetica, Arial, sans-serif", color: "#1a1a1a", margin: 0 }}>
        <Preview>{parts[0]?.slice(0, 120) ?? ""}</Preview>
        <Container style={{ maxWidth: "560px", padding: "24px 16px" }}>
          <Section>
            {parts.map((p, i) => (
              <Text key={i} style={{ fontSize: "16px", lineHeight: "24px", margin: "0 0 16px", whiteSpace: "pre-line" }}>
                {p}
              </Text>
            ))}
          </Section>
          <Hr style={{ borderColor: "#e5e5e5", margin: "24px 0 12px" }} />
          <Text style={{ fontSize: "13px", lineHeight: "20px", color: "#6b6b6b", margin: 0 }}>{studioName}</Text>
        </Container>
      </Body>
    </Html>
  );
}
