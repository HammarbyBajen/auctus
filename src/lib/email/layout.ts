import { paragraphs } from "./template";

/**
 * The one layout every email from Tegen HQ uses (M8): the text Tegen wrote,
 * as paragraphs, and the studio's name at the bottom. No images, no tracking.
 * Plain HTML built here (everything escaped), since React rendering is not
 * available where server actions run, and the email is simple enough not to
 * need it. Mail programs cannot read the app's CSS variables, so colours are
 * written out.
 */

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export function emailHtml({ body, studioName }: { body: string; studioName: string }): string {
  const parts = paragraphs(body);
  const preview = escapeHtml((parts[0] ?? "").slice(0, 120));
  const text = parts
    .map((p) => `<p style="font-size:16px;line-height:24px;margin:0 0 16px">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
  return [
    '<!DOCTYPE html><html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>',
    '<body style="margin:0;background-color:#ffffff;color:#1a1a1a;font-family:Helvetica,Arial,sans-serif">',
    `<div style="display:none;max-height:0;overflow:hidden">${preview}</div>`,
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center">',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px"><tr><td style="padding:24px 16px">',
    text,
    '<hr style="border:none;border-top:1px solid #e5e5e5;margin:24px 0 12px">',
    `<p style="font-size:13px;line-height:20px;color:#6b6b6b;margin:0">${escapeHtml(studioName)}</p>`,
    "</td></tr></table></td></tr></table></body></html>",
  ].join("");
}

export function emailText({ body, studioName }: { body: string; studioName: string }): string {
  return `${paragraphs(body).join("\n\n")}\n\n--\n${studioName}\n`;
}
