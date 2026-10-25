// ── Email template ────────────────────────────────────────────────────────────
// Table-based layout with inline styles (works in Gmail, Outlook and Apple Mail),
// a matching plain-text version, no remote images and no tracking pixels.
// NOTE: this block is identical in the admin app (emailTemplate.ts) and the
// "resend" edge function. If you edit one, copy the change to the other.
const BRAND = {
  name: "Qelvaron Global Logistics",
  tagline: "Miami / Operations desk",
  address: "Miami, Florida, USA", // EDIT: use your registered business address
  dark: "#0f1b2d",
  accent: "#d9480f",
};

const esc = (v: string) =>
  v
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

export type EmailParts = {
  subject: string;
  body: string;
  tracking?: string;
  siteUrl?: string;
};

export function renderEmailHtml({ subject, body, tracking, siteUrl }: EmailParts): string {
  const clean = body.replace(/\r\n/g, "\n").trim();
  const paragraphs = clean
    .split(/\n{2,}/)
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:#1f2933;">${esc(p).replace(/\n/g, "<br>")}</p>`,
    )
    .join("");
  const preheader = esc(clean.replace(/\s+/g, " ").slice(0, 110));
  const trackUrl = siteUrl ? `${siteUrl.replace(/\/+$/, "")}/tracking/` : "";

  const reference = tracking
    ? `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:8px 0 20px;"><tr><td style="background:#f4f6f8;border-left:3px solid ${BRAND.accent};padding:12px 16px;"><div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#5b6670;">Tracking reference</div><div style="font-size:16px;font-weight:700;color:${BRAND.dark};font-family:'Courier New',Courier,monospace;word-break:break-all;overflow-wrap:anywhere;">${esc(tracking)}</div></td></tr></table>`
    : "";
  const button =
    tracking && trackUrl
      ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 8px;"><tr><td style="background:${BRAND.accent};border-radius:6px;"><a href="${esc(trackUrl)}" style="display:inline-block;padding:12px 22px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;font-family:Arial,Helvetica,sans-serif;">Track your shipment</a></td></tr></table>`
      : "";

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #e3e8ee;">
<tr><td style="background:${BRAND.dark};padding:22px 28px;"><div style="font-size:18px;font-weight:700;color:#ffffff;font-family:Arial,Helvetica,sans-serif;">${esc(BRAND.name)}</div><div style="font-size:12px;color:#aab4c0;margin-top:3px;font-family:Arial,Helvetica,sans-serif;">${esc(BRAND.tagline)}</div></td></tr>
<tr><td style="background:${BRAND.accent};height:3px;line-height:3px;font-size:0;">&nbsp;</td></tr>
<tr><td style="padding:28px;font-family:Arial,Helvetica,sans-serif;">${paragraphs}${reference}${button}</td></tr>
<tr><td style="padding:18px 28px;background:#f9fafb;border-top:1px solid #e3e8ee;font-family:Arial,Helvetica,sans-serif;"><div style="font-size:12px;line-height:1.6;color:#5b6670;">This is a service message about a shipment handled by ${esc(BRAND.name)}. Reply to this email if you have any questions.</div><div style="font-size:12px;line-height:1.6;color:#85909a;margin-top:6px;">${esc(BRAND.name)} · ${esc(BRAND.address)}</div></td></tr>
</table></td></tr></table></body></html>`;
}

export function renderEmailText({ body, tracking, siteUrl }: EmailParts): string {
  const parts = [body.replace(/\r\n/g, "\n").trim()];
  if (tracking) parts.push(`Tracking reference: ${tracking}`);
  if (tracking && siteUrl) parts.push(`Track your shipment: ${siteUrl.replace(/\/+$/, "")}/tracking/`);
  parts.push(`--\n${BRAND.name}\n${BRAND.address}`);
  return parts.join("\n\n");
}
