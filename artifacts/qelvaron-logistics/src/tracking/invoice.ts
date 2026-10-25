/*
  Print invoice for the live tracking page.
  Layout follows the ShippingInvoice used in the admin print modal (two pages:
  header with banner, tracking number, company block, FROM / TO + barcode,
  shipment and cost tables, payment methods and stamps, footer; then the cost
  breakdown page), restyled with the Qelvaron theme.

  Edit COMPANY / BOOKING_MODE / ASSETS below to change the printout.
  Only data that exists is printed; anything missing is shown as "--" or left out.
*/

const COMPANY = {
  name: "Qelvaron Logistics",
  address: "Miami, Florida, USA", // (empty = line hidden)
  email: "support@qelvaronlogistics.com", // (empty = line hidden)
  website: window.location.origin,
};

const BOOKING_MODE = "To Pay";

// Files served from your site's public folder. A missing file is simply left out.
const ASSETS = {
  banner: "/Gemini_Generated_Image_ebk705ebk705ebk7.png",
  stamp: "/stamps/Gemini_Generated_Image_3a8m3r3a8m3r3a8m.png",
  stampDuty: "/stamps/IMG_0940.jpeg",
};

type InvoiceEvent = {
  status: string;
  location: string;
  description: string;
  timestamp: string;
};

export type InvoiceRecord = {
  tracking_number: string;
  status: string;
  mode: string;
  carrier: string;
  origin_city: string;
  origin_country: string;
  destination_city: string;
  destination_country: string;
  created_at: string;
  pickup_date: string | null;
  estimated_delivery: string | null;
  weight?: number | string | null;
  stopover_city?: string | null;
  stopover_country?: string | null;
  // Printed only if the lookup returns them.
  id?: number | string | null;
  package_count?: number | null;
  dimensions?: string | null;
  cost?: number | string | null;
  clearance_cost?: number | string | null;
  departure_date?: string | null;
  product_name?: string | null;
  package_description?: string | null;
  sender_name?: string | null;
  sender_address?: string | null;
  sender_phone?: string | null;
  recipient_name?: string | null;
  recipient_address?: string | null;
  recipient_phone?: string | null;
  recipient_email?: string | null;
};

function esc(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function place(city?: string | null, country?: string | null) {
  return [city, country].filter(Boolean).join(", ");
}

function stamp(value: string | null | undefined) {
  if (!value) return "N/A";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "N/A"
    : date.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });
}

function dayLabel(value: string | null | undefined) {
  if (!value) return "--";
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? "--"
    : new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(date);
}

function money(value: number | null) {
  return value === null ? "--" : `$${value.toFixed(2)}`;
}

// "12" -> "12 kg"; "12 kg" / "25 lb" are left as typed.
function weightText(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  return /[a-z]/i.test(text) ? text : `${text} kg`;
}

function toNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function themeValue(name: string, fallback: string) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

/* ------------------------------------------------------------------ */
/* Code 128 (subset B) barcode as inline SVG, no library needed        */
/* ------------------------------------------------------------------ */

const CODE128 = "212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 123122 123221 223211 221132 221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 232121 111323 131123 131321 112313 132113 132311 211313 231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 314111 221411 431111 111224 111422 121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 114131 311141 411131 211412 211214 211232 2331112".split(" ");

function barcodeSvg(text: string, moduleWidth = 1.2, height = 50) {
  const values: number[] = [104]; // Start B
  for (const char of text) {
    const code = char.charCodeAt(0);
    values.push(code >= 32 && code <= 126 ? code - 32 : 31); // unsupported -> "?"
  }
  let checksum = values[0] as number;
  for (let i = 1; i < values.length; i += 1) checksum += (values[i] as number) * i;
  values.push(checksum % 103, 106); // checksum, Stop

  const quiet = 10;
  let x = quiet;
  let bars = "";
  for (const value of values) {
    const widths = (CODE128[value] ?? "").split("").map(Number);
    widths.forEach((width, i) => {
      if (i % 2 === 0) bars += `<rect x="${x}" y="0" width="${width}" height="${height}"/>`;
      x += width;
    });
  }
  const totalModules = x + quiet;
  const label = 16;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalModules} ${height + label}" width="${(totalModules * moduleWidth).toFixed(1)}" height="${((height + label) * 1).toFixed(0)}" preserveAspectRatio="none" shape-rendering="crispEdges" style="max-width:100%;height:auto"><g fill="#000">${bars}</g><text x="${totalModules / 2}" y="${height + 12}" text-anchor="middle" font-family="monospace" font-size="10" fill="#000" style="font-size:10px">${esc(text)}</text></svg>`;
}

/* ------------------------------------------------------------------ */

const ICONS = {
  package:
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>',
  truck:
    '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>',
  shield:
    '<svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg>',
};

function buildInvoice(record: InvoiceRecord, updates: InvoiceEvent[]) {
  const accent = themeValue("--_colors---brand-100", "#ff5d18");
  const ink = themeValue("--_colors---secondary-200", "#060517");
  const muted = themeValue("--_colors---dark-100", "#666d78");
  const origin = (p: string) => (p.startsWith("/") ? window.location.origin + p : p);

  const tracking = record.tracking_number;
  const originText = place(record.origin_city, record.origin_country);
  const destinationText = place(record.destination_city, record.destination_country);
  const stopover = place(record.stopover_city, record.stopover_country);

  const cost = toNumber(record.cost);
  const clearance = toNumber(record.clearance_cost);
  const total = cost === null && clearance === null ? null : (cost ?? 0) + (clearance ?? 0);

  const status = record.status.replace(/[_-]+/g, " ").toUpperCase();
  const service = record.mode ? record.mode.charAt(0).toUpperCase() + record.mode.slice(1) : "Standard";
  const latest = updates[0]?.location;
  const now = new Date();

  const companyLines = [
    COMPANY.address && `<p><strong>Address:</strong> ${esc(COMPANY.address)}</p>`,
    COMPANY.email && `<p class="break"><strong>Email:</strong> ${esc(COMPANY.email)}</p>`,
    COMPANY.website && `<p class="break"><strong>Company Website:</strong> ${esc(COMPANY.website)}</p>`,
  ]
    .filter(Boolean)
    .join("");

  const senderOffice = record.origin_city || "Origin";
  const recipientOffice = record.destination_city || "Destination";

  // The package description if there is one, otherwise the real shipment details we hold.
  const description = record.package_description
    ? esc(record.package_description)
    : [
        `<div><strong>Service:</strong> ${esc(service)} Freight</div>`,
        record.carrier && `<div><strong>Carrier:</strong> ${esc(record.carrier)}</div>`,
        originText &&
          destinationText &&
          `<div><strong>Route:</strong> ${esc(originText)} &rarr; ${esc(destinationText)}</div>`,
        stopover && `<div><strong>Stopover:</strong> ${esc(stopover)}</div>`,
        record.package_count && record.package_count > 0
          ? `<div><strong>Packages:</strong> ${esc(record.package_count)}</div>`
          : "",
        weightText(record.weight) && `<div><strong>Weight:</strong> ${esc(weightText(record.weight))}</div>`,
        record.dimensions && `<div><strong>Dimensions:</strong> ${esc(record.dimensions)}</div>`,
        record.estimated_delivery &&
          `<div><strong>Est. Delivery:</strong> ${esc(dayLabel(record.estimated_delivery))}</div>`,
        latest && `<div><strong>Latest location:</strong> ${esc(latest)}</div>`,
      ]
        .filter(Boolean)
        .join("");

  const departure = record.departure_date || record.pickup_date;
  const pageUrl = window.location.href;
  const header = (page: string) => `
    <div class="bar"><span class="muted">${esc(stamp(now.toISOString()))}</span><strong>${esc(COMPANY.name)} | Invoice</strong></div>
    <div class="pageno">${ICONS.package}<span>${page}</span></div>`;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Invoice - ${esc(tracking)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  @page { size: A4; margin: 10mm; }
  html, body { background: #fff; }
  body { font-family: "Aspekta", Arial, sans-serif; font-size: 12px; line-height: 1.45; color: ${ink}; }
  p { margin: 0; }
  .muted { color: ${muted}; }
  .break { word-break: break-all; }
  .page { position: relative; border: 2px solid #e5e7eb; overflow: hidden; }
  .page + .page { margin-top: 32px; border-top: 4px solid ${ink}; }
  @media print { .page.first { break-after: page; } .page + .page { margin-top: 0; } }
  .bar { display: flex; justify-content: space-between; align-items: center; padding: 10px 20px; border-bottom: 1px solid #e5e7eb; font-size: 12px; }
  .pageno { display: flex; align-items: center; gap: 6px; padding: 6px 20px; background: #f9fafb; color: #6b7280; font-size: 12px; border-bottom: 1px solid #e5e7eb; }
  .brandrow { position: relative; display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; padding: 16px 20px; border-bottom: 1px solid #e5e7eb; }
  .brand { display: flex; align-items: center; gap: 8px; }
  .logo { width: 44px; height: 44px; border-radius: 4px; background: linear-gradient(135deg, ${accent}, ${accent}cc); display: flex; align-items: center; justify-content: center; }
  .brand-name { font-size: 22px; font-weight: 700; color: ${accent}; }
  .banner { width: 240px; height: 110px; border: 2px solid #e5e7eb; border-radius: 8px; overflow: hidden; background: #fff; }
  .banner img { width: 100%; height: 100%; object-fit: cover; object-position: center; display: block; }
  .watermark { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-20deg); opacity: 0.1; font-size: 44px; font-weight: 700; color: #9ca3af; white-space: nowrap; pointer-events: none; }
  .tracking { padding: 12px 20px; border-bottom: 1px solid #e5e7eb; font-size: 20px; font-weight: 700; word-break: break-all; }
  .departure { padding: 8px 20px; border-bottom: 1px solid #e5e7eb; font-size: 12px; }
  .company { padding: 12px 20px; text-align: center; border-bottom: 1px solid #e5e7eb; background: #f9fafb; }
  .company h2 { font-size: 18px; font-weight: 700; margin-bottom: 6px; color: ${ink}; }
  .company p { font-size: 12px; margin-bottom: 3px; }
  .cols3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; padding: 16px 20px; border-bottom: 1px solid #e5e7eb; }
  .cols3 h3 { font-size: 12px; font-weight: 700; text-transform: uppercase; border-bottom: 1px solid #9ca3af; padding-bottom: 4px; margin-bottom: 8px; }
  .party-name { font-weight: 700; font-size: 14px; margin-bottom: 6px; }
  .small { font-size: 11px; color: #4b5563; margin-bottom: 3px; }
  .codecol { display: flex; flex-direction: column; align-items: flex-end; }
  .codemeta { margin-top: 10px; text-align: right; font-size: 11px; width: 100%; line-height: 1.7; }
  .tag { display: inline-block; margin-left: 4px; padding: 1px 8px; background: #e5e7eb; border-radius: 4px; font-size: 11px; }
  .tablewrap { padding: 16px 20px; border-bottom: 1px solid #e5e7eb; }
  table { width: 100%; border-collapse: collapse; border: 1px solid #9ca3af; font-size: 12px; }
  thead { background: #e5e7eb; }
  th, td { text-align: left; padding: 8px; border: 1px solid #9ca3af; vertical-align: top; }
  th { font-weight: 700; }
  .pill { display: inline-block; padding: 3px 8px; background: ${accent}1f; color: ${accent}; border: 1px solid ${accent}66; border-radius: 4px; font-size: 11px; font-weight: 700; white-space: nowrap; }
  .foot3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; padding: 16px 20px; border-bottom: 1px solid #e5e7eb; break-inside: avoid; }
  .foot3 h3 { font-size: 13px; font-weight: 700; margin-bottom: 8px; }
  .paybox { border: 2px solid #d1d5db; border-radius: 4px; padding: 10px; background: ${accent}12; }
  .pay-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; font-size: 11px; font-weight: 600; }
  .pay-s { width: 22px; height: 22px; border-radius: 4px; background: ${accent}; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 11px; }
  .cards { display: flex; gap: 6px; margin-bottom: 6px; }
  .card { padding: 4px 8px; border-radius: 4px; color: #fff; font-size: 11px; font-weight: 700; display: flex; align-items: center; }
  .card.visa { background: ${ink}; }
  .card.mc { background: #dc2626; }
  .card.amex { background: ${accent}; }
  .dots { display: flex; }
  .dots i { width: 11px; height: 11px; border-radius: 50%; display: block; }
  .dots i + i { margin-left: -4px; }
  .paypal { background: #fff; padding: 3px 8px; border-radius: 4px; font-weight: 700; font-size: 13px; }
  .secure { margin-top: 8px; display: flex; align-items: center; gap: 4px; color: #15803d; font-size: 11px; font-weight: 700; }
  .stampbox { position: relative; margin: 0 auto; }
  .stampbox img { width: 100%; height: 100%; object-fit: contain; display: block; }
  .stampbox.big { width: 150px; height: 150px; }
  .stampbox.small-s { width: 110px; height: 110px; transform: rotate(12deg); }
  .stampbox.missing { border: 2px dashed #bbb; border-radius: 8px; display: flex; align-items: center; justify-content: center; text-align: center; color: #999; font-size: 10px; }
  .pagefoot { display: flex; justify-content: space-between; align-items: center; padding: 8px 20px; background: #f9fafb; color: #4b5563; font-size: 11px; }
  .pagefoot.end { justify-content: flex-end; border-top: 1px solid #e5e7eb; }
  .breakdown { padding: 20px; }
  .breakdown h2 { font-size: 14px; font-weight: 700; margin-bottom: 18px; }
  .breakdown-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 28px; }
  .breakdown h3 { font-size: 12px; font-weight: 700; margin-bottom: 6px; }
  .breakdown .amt { font-size: 18px; }
  .breakdown .total { font-size: 22px; font-weight: 700; color: ${accent}; }
</style>
</head>
<body>
<div class="page first">
  ${header("1 of 2")}

  <div class="brandrow">
    <div class="brand"><div class="logo">${ICONS.truck}</div><span class="brand-name">${esc(COMPANY.name)}</span></div>
    <div class="banner"><img src="${esc(origin(ASSETS.banner))}" alt="${esc(COMPANY.name)}"></div>
    <div class="watermark">Verified True Copy</div>
  </div>

  <div class="tracking">Tracking Number: ${esc(tracking)}</div>
  ${departure ? `<div class="departure"><strong>Departure Date:</strong> ${esc(stamp(departure))}</div>` : ""}

  <div class="company">
    <h2>${esc(COMPANY.name)}</h2>
    ${companyLines}
  </div>

  <div class="cols3">
    <div>
      <h3>FROM (SENDER)</h3>
      ${record.sender_name ? `<p class="party-name">${esc(record.sender_name)}</p>` : ""}
      <p class="small"><strong>Address:</strong> ${esc(record.sender_address || originText || "--")}</p>
      ${record.sender_phone ? `<p class="small"><strong>Phone:</strong> ${esc(record.sender_phone)}</p>` : ""}
      <p class="small"><strong>Origin Office:</strong> ${esc(senderOffice)}</p>
    </div>
    <div>
      <h3>TO (CONSIGNEE)</h3>
      ${record.recipient_name ? `<p class="party-name">${esc(record.recipient_name)}</p>` : ""}
      ${record.recipient_phone ? `<p class="small"><strong>Phone:</strong> ${esc(record.recipient_phone)}</p>` : ""}
      ${record.recipient_email ? `<p class="small break"><strong>Email:</strong> ${esc(record.recipient_email)}</p>` : ""}
      <p class="small"><strong>Address:</strong> ${esc(record.recipient_address || destinationText || "--")}</p>
      <p class="small"><strong>Destination Office:</strong> ${esc(recipientOffice)}</p>
    </div>
    <div class="codecol">
      ${barcodeSvg(tracking)}
      <div class="codemeta">
        <p><strong>Order ID:</strong> ${esc(record.id ?? "N/A")}</p>
        <p><strong>Booking Mode:</strong><span class="tag">${esc(BOOKING_MODE)}</span></p>
        <p><strong>Shipment Cost:</strong> ${esc(money(cost))}</p>
        <p class="break" style="font-family:monospace"><strong>Tracking:</strong> ${esc(tracking)}</p>
      </div>
    </div>
  </div>

  <div class="tablewrap">
    <table>
      <thead><tr><th style="width:44px">Qty</th><th style="width:110px">Product</th><th style="width:130px">Status</th><th>Description</th></tr></thead>
      <tbody><tr>
        <td>1</td>
        <td>${esc(record.product_name || "Shipment")}</td>
        <td><span class="pill">${esc(status || "IN TRANSIT")}</span></td>
        <td style="font-size:11px">${description}</td>
      </tr></tbody>
    </table>
  </div>

  <div class="tablewrap">
    <table>
      <thead><tr><th>Shipping Cost</th><th>Clearance Cost</th><th>Total Cost</th></tr></thead>
      <tbody><tr>
        <td><strong>${esc(money(cost))}</strong></td>
        <td>${esc(money(clearance))}</td>
        <td><strong>${esc(money(total))}</strong></td>
      </tr></tbody>
    </table>
  </div>

  <div class="foot3">
    <div>
      <h3>Payment Methods:</h3>
      <div class="paybox">
        <div class="pay-head"><span class="pay-s">S</span><span>SECURED PAYMENT</span></div>
        <div class="cards">
          <span class="card visa">VISA</span>
          <span class="card mc"><span class="dots"><i style="background:#ef4444"></i><i style="background:#fb923c"></i></span></span>
          <span class="card amex">AMEX</span>
        </div>
        <div class="paypal"><span style="color:${ink}">Pay</span><span style="color:${accent}">Pal</span></div>
        <div class="secure">${ICONS.shield}<span>SAFE SHOPPING</span></div>
      </div>
      <p class="small" style="margin-top:8px">For your convenience we have ${esc(COMPANY.name)} several payment methods: reliable, fast, secure.</p>
    </div>
    <div>
      <h3>Official Stamp/${esc(stamp(now.toISOString()).split(",").slice(1, 3).join(",").trim())}</h3>
      <div class="stampbox big"><img data-asset src="${esc(origin(ASSETS.stamp))}" alt="Official Stamp"></div>
      <p style="text-align:center;margin-top:8px;font-weight:700;font-size:13px">Amount Due</p>
    </div>
    <div>
      <h3>Stamp Duty:</h3>
      <div class="stampbox small-s"><img data-asset src="${esc(origin(ASSETS.stampDuty))}" alt="Stamp Duty"></div>
    </div>
  </div>

  <div class="pagefoot"><span class="break">${esc(pageUrl)}</span><span>1/2</span></div>
</div>

<div class="page">
  ${header("2 of 2")}
  <div class="breakdown">
    <h2>SHIPPING COST BREAKDOWN:</h2>
    <div class="breakdown-grid">
      <div><h3>SHIPPING COST:</h3><p class="amt">${esc(money(cost))}</p></div>
      <div><h3>CLEARANCE COST:</h3><p class="amt">${esc(money(clearance))}</p></div>
      <div><h3>TOTAL AMOUNT:</h3><p class="total">${esc(money(total))}</p></div>
    </div>
  </div>
  <div class="pagefoot end"><span>2/2</span></div>
</div>
</body>
</html>`;
}

/** Opens the print dialog for the invoice using a hidden iframe (works on phones too). */
export function printInvoice(record: InvoiceRecord, updates: InvoiceEvent[]) {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText =
    "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;";
  document.body.append(frame);

  const doc = frame.contentDocument;
  const win = frame.contentWindow;
  if (!doc || !win) {
    frame.remove();
    window.alert("Unable to open the print dialog. Please try again.");
    return;
  }

  doc.open();
  doc.write(buildInvoice(record, updates));
  doc.close();

  const cleanup = () => window.setTimeout(() => frame.remove(), 500);
  win.addEventListener("afterprint", cleanup, { once: true });

  // Wait for the banner and stamps (up to 3 s). A file that fails to load is left out.
  const images = Array.from(doc.querySelectorAll<HTMLImageElement>("img"));
  const settled = images.map(
    (image) =>
      new Promise<void>((resolve) => {
        const missing = () => {
          const holder = image.parentElement;
          if (holder?.classList.contains("stampbox")) {
            holder.classList.add("missing");
            holder.textContent = "OFFICIAL STAMP AREA";
          } else {
            holder?.remove();
          }
          resolve();
        };
        if (image.complete) {
          if (image.naturalWidth === 0) missing();
          else resolve();
          return;
        }
        image.addEventListener("load", () => resolve(), { once: true });
        image.addEventListener("error", missing, { once: true });
      }),
  );
  const timeout = new Promise<void>((resolve) => window.setTimeout(resolve, 3000));

  void Promise.race([Promise.all(settled), timeout]).then(() => {
    window.setTimeout(() => {
      win.focus();
      win.print();
      // Fallback cleanup for browsers that never fire afterprint.
      window.setTimeout(() => {
        if (frame.isConnected) frame.remove();
      }, 60_000);
    }, 200);
  });
}
