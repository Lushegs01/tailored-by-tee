import { siteConfig } from "@/config/site";

/*
 * The one email frame: paper ground, ink type, a serif heading, one button.
 * Table layout and inline styles because email clients ignore stylesheets.
 * Every interpolated value passes through escapeHtml.
 */

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const INK = "#161513";
const PAPER = "#f4f1ea";
const STONE = "#6a665f";
const HAIRLINE = "#d9d3c7";
const SANS = "'Helvetica Neue', Helvetica, Arial, sans-serif";
const SERIF = "Georgia, 'Times New Roman', serif";

export interface EmailLayoutInput {
  /** Hidden preview line shown by inbox lists. */
  preheader: string;
  heading: string;
  /** Pre-escaped HTML paragraphs. */
  bodyHtml: string;
  cta?: { label: string; url: string };
  /** Plain line under the button (e.g. expiry or "didn't ask for this?"). */
  footnote?: string;
}

export function renderEmail({ preheader, heading, bodyHtml, cta, footnote }: EmailLayoutInput): string {
  const button = cta
    ? `<tr><td style="padding:28px 0 8px"><a href="${escapeHtml(cta.url)}" style="display:inline-block;background:${INK};color:${PAPER};font-family:${SANS};font-size:12px;letter-spacing:2px;text-transform:uppercase;text-decoration:none;padding:16px 28px">${escapeHtml(cta.label)}</a></td></tr>`
    : "";
  const note = footnote
    ? `<tr><td style="padding-top:20px;font-family:${SANS};font-size:13px;line-height:20px;color:${STONE}">${escapeHtml(footnote)}</td></tr>`
    : "";

  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(heading)}</title></head>
<body style="margin:0;padding:0;background:${PAPER}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAPER}">
<tr><td align="center" style="padding:40px 20px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px">
<tr><td style="padding-bottom:28px;border-bottom:1px solid ${HAIRLINE};font-family:${SANS};font-size:12px;letter-spacing:4px;text-transform:uppercase;color:${INK}">${escapeHtml(siteConfig.wordmark.primary)} <span style="font-family:${SERIF};font-style:italic;letter-spacing:0;text-transform:none">${escapeHtml(siteConfig.wordmark.secondary)}</span></td></tr>
<tr><td style="padding-top:32px;font-family:${SERIF};font-size:30px;line-height:36px;color:${INK}">${escapeHtml(heading)}</td></tr>
<tr><td style="padding-top:16px;font-family:${SANS};font-size:15px;line-height:24px;color:${INK}">${bodyHtml}</td></tr>
${button}
${note}
<tr><td style="padding-top:40px;margin-top:40px;border-top:1px solid ${HAIRLINE};font-family:${SANS};font-size:12px;line-height:18px;color:${STONE}">${escapeHtml(siteConfig.name)} · ${escapeHtml(siteConfig.location)}<br>${escapeHtml(siteConfig.contact.email)}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}
