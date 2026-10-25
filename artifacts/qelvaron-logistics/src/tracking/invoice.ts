/*
  Print invoice for the live tracking page.
  Same layout as the original receipt (tracking header with "True Copy"
  watermark, company block, FROM / TO with details box, shipment table,
  payment / stamp / amount-due row, cost footer) restyled for Qelvaron.

  Edit COMPANY below to change the company block on the printout.
*/

const COMPANY = {
  name: "Qelvaron Logistics",
  address: "", // e.g. "Canada, USA, UK, Asia and Europe"  (left empty = line hidden)
  email: "", //   e.g. "support@yourdomain.com"             (left empty = line hidden)
  website: window.location.origin,
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
  // Only printed if the lookup returns them; otherwise shown as "--".
  cost?: number | string | null;
  sender_name?: string | null;
  recipient_name?: string | null;
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

function dateLabel(value: string | null | undefined) {
  if (!value) return "--";
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? "--"
    : new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(date);
}

function themeValue(name: string, fallback: string) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function buildInvoice(record: InvoiceRecord, updates: InvoiceEvent[]) {
  const accent = themeValue("--_colors---brand-100", "#ff5d18");
  const ink = themeValue("--_colors---secondary-200", "#060517");
  const muted = themeValue("--_colors---dark-100", "#666d78");

  const origin = place(record.origin_city, record.origin_country) || "--";
  const destination = place(record.destination_city, record.destination_country) || "--";
  const stopover = place(record.stopover_city, record.stopover_country);
  const cost = record.cost !== undefined && record.cost !== null && record.cost !== "" ? `USD ${record.cost}` : "USD --";
  const status = record.status.replace(/[_-]+/g, " ").toUpperCase();
  const service = record.mode ? record.mode.charAt(0).toUpperCase() + record.mode.slice(1) : "Standard";
  const latest = updates[0]?.location;

  const companyLines = [
    COMPANY.address && `<div>Address: ${esc(COMPANY.address)}</div>`,
    COMPANY.email && `<div>Email: ${esc(COMPANY.email)}</div>`,
    COMPANY.website && `<div>Company Website: ${esc(COMPANY.website)}</div>`,
  ]
    .filter(Boolean)
    .join("");

  const description = [
    `<div><strong>Service:</strong> ${esc(service)} Freight</div>`,
    record.carrier && `<div><strong>Carrier:</strong> ${esc(record.carrier)}</div>`,
    `<div><strong>Route:</strong> ${esc(origin)} &rarr; ${esc(destination)}</div>`,
    stopover && `<div><strong>Stopover:</strong> ${esc(stopover)}</div>`,
    record.weight !== undefined && record.weight !== null && record.weight !== ""
      ? `<div><strong>Weight:</strong> ${esc(record.weight)} kg</div>`
      : "",
    record.estimated_delivery &&
      `<div><strong>Est. Delivery:</strong> ${esc(dateLabel(record.estimated_delivery))}</div>`,
    latest && `<div><strong>Latest location:</strong> ${esc(latest)}</div>`,
  ]
    .filter(Boolean)
    .join("");

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Invoice - ${esc(record.tracking_number)}</title>
<style>
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  @page { size: A4; margin: 10mm 15mm; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body { font-family: "Aspekta", Arial, sans-serif; font-size: 11pt; line-height: 1.5; color: ${ink}; }
  .sheet { position: relative; padding: 24px 8px; overflow: hidden; }
  .watermark { position: absolute; top: 150px; right: 40px; transform: rotate(-45deg); font-size: 60pt; font-weight: bold; opacity: 0.07; color: ${accent}; white-space: nowrap; pointer-events: none; }
  .head { text-align: center; margin-bottom: 20px; }
  .head h2 { margin: 0; font-size: 14pt; font-weight: normal; }
  .head strong { font-size: 16pt; }
  .company { text-align: center; margin-bottom: 30px; border-bottom: 2px solid ${accent}; padding-bottom: 15px; }
  .company-name { font-size: 14pt; font-weight: bold; margin-bottom: 8px; color: ${accent}; }
  .company-info { font-size: 10pt; line-height: 1.6; color: ${muted}; }
  .parties { display: grid; grid-template-columns: 1fr 250px; gap: 20px; margin-bottom: 20px; }
  .parties-inner { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
  .party-title { font-weight: bold; font-size: 11pt; margin-bottom: 10px; border-bottom: 1px solid #ddd; padding-bottom: 5px; }
  .party-body { font-size: 10pt; line-height: 1.7; }
  .box { border: 2px solid ${accent}; padding: 15px; background: #fafafa; font-size: 9pt; border-radius: 9px; }
  .box .label { color: ${muted}; }
  .box .value { font-weight: bold; margin-bottom: 8px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 10pt; }
  thead tr { background: #f4f4f5; border-top: 2px solid ${accent}; border-bottom: 2px solid ${accent}; }
  th { padding: 10px; text-align: left; border: 1px solid #d8d8dc; }
  td { padding: 12px; border: 1px solid #d8d8dc; vertical-align: top; }
  .r { text-align: right; }
  .pill { display: inline-block; padding: 4px 8px; background: #fff1ea; border: 1px solid ${accent}; border-radius: 4px; font-size: 9pt; font-weight: bold; color: ${accent}; }
  .desc { font-size: 9pt; line-height: 1.6; }
  .foot3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-bottom: 30px; border-top: 1px solid #ddd; padding-top: 20px; font-size: 9pt; }
  .stamp { width: 120px; height: 120px; border: 2px dashed #aaa; margin: 0 auto; display: flex; align-items: center; justify-content: center; border-radius: 8px; background: #fafafa; font-size: 8pt; color: #999; text-align: center; }
  .totals { border-top: 3px double ${accent}; padding-top: 20px; margin-top: 30px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; text-align: center; }
  .totals .label { color: ${muted}; font-size: 9pt; margin-bottom: 5px; }
  .totals .amount { font-weight: bold; font-size: 14pt; }
  .totals .total .amount { color: ${accent}; }
  @media (max-width: 600px) {
    body { font-size: 9pt; }
    .parties, .parties-inner, .foot3, .totals { grid-template-columns: 1fr; }
    table { font-size: 8pt; }
    th, td { padding: 6px; }
  }
</style>
</head>
<body>
<div class="sheet">
  <div class="watermark">True Copy</div>

  <div class="head">
    <h2>Tracking Number: <strong>${esc(record.tracking_number)}</strong></h2>
  </div>

  <div class="company">
    <div class="company-name">${esc(COMPANY.name)}</div>
    <div class="company-info">${companyLines}</div>
  </div>

  <div class="parties">
    <div class="parties-inner">
      <div>
        <div class="party-title">FROM (SENDER)</div>
        <div class="party-body">
          ${record.sender_name ? `<div style="font-weight:bold">${esc(record.sender_name)}</div>` : ""}
          <div>Origin: ${esc(origin)}</div>
          <div style="margin-top:8px">Origin Office: ${esc(record.origin_city || "--")}</div>
        </div>
      </div>
      <div>
        <div class="party-title">TO (CONSIGNEE)</div>
        <div class="party-body">
          ${record.recipient_name ? `<div style="font-weight:bold">${esc(record.recipient_name)}</div>` : ""}
          <div>Destination: ${esc(destination)}</div>
          <div style="margin-top:8px">Destination Office: ${esc(record.destination_city || "--")}</div>
        </div>
      </div>
    </div>

    <div class="box">
      <div class="label">Booked:</div>
      <div class="value">${esc(dateLabel(record.created_at))}</div>
      <div class="label">Service:</div>
      <div class="value">${esc(service)}</div>
      <div class="label">Shipment Cost:</div>
      <div class="value" style="font-size:11pt">${esc(cost)}</div>
      <div class="label">Tracking Number:</div>
      <div class="value" style="font-family:monospace;margin-bottom:0">${esc(record.tracking_number)}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:60px">Qty</th>
        <th style="width:90px">Product</th>
        <th style="width:100px">Status</th>
        <th>Description</th>
        <th class="r" style="width:100px">Shipping Cost</th>
        <th class="r" style="width:100px">Clearance Cost</th>
        <th class="r" style="width:100px">Total Cost</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td style="text-align:center">1</td>
        <td>Parcel</td>
        <td><span class="pill">${esc(status)}</span></td>
        <td class="desc">${description}</td>
        <td class="r" style="font-weight:bold">${esc(cost)}</td>
        <td class="r">USD --</td>
        <td class="r" style="font-weight:bold;font-size:11pt">${esc(cost)}</td>
      </tr>
    </tbody>
  </table>

  <div class="foot3">
    <div>
      <div style="font-weight:bold;margin-bottom:8px">Payment Methods:</div>
      <div style="line-height:1.8;color:${muted}">
        For your convenience we have<br>
        ${esc(COMPANY.name)} several<br>
        payment options: reliable, fast, secure.
      </div>
    </div>
    <div style="text-align:center">
      <div style="font-weight:bold;margin-bottom:10px">Official Stamp/${esc(new Date().toDateString())}</div>
      <div class="stamp">OFFICIAL<br>STAMP<br>AREA</div>
    </div>
    <div style="text-align:right">
      <div style="font-weight:bold;margin-bottom:8px">Stamp Duty:</div>
      <div style="font-size:18pt;font-weight:bold;margin-top:15px;color:${ink}">Amount Due</div>
    </div>
  </div>

  <div class="totals">
    <div><div class="label">SHIPPING COST:</div><div class="amount">${esc(cost)}</div></div>
    <div><div class="label">CLEARANCE COST:</div><div class="amount">USD --</div></div>
    <div class="total"><div class="label">TOTAL AMOUNT:</div><div class="amount">${esc(cost)}</div></div>
  </div>
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

  // Give fonts/layout a moment before the dialog opens.
  window.setTimeout(() => {
    win.focus();
    win.print();
    // Fallback cleanup for browsers that never fire afterprint.
    window.setTimeout(() => {
      if (frame.isConnected) frame.remove();
    }, 60_000);
  }, 300);
}
