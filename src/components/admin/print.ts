import { customerNote, formatPrice, tableText, type Row } from "./lib";

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

// Receipts are sized for 80 mm thermal receipt printers (72 mm printable). They also print fine on A4.
const RECEIPT_STYLE = `@page{size:80mm auto;margin:3mm}
*{box-sizing:border-box}html,body{margin:0;padding:0}
body{width:72mm;font:12.5px/1.4 "Courier New",Consolas,monospace;color:#000;-webkit-print-color-adjust:exact;print-color-adjust:exact}
h1{font-size:17px;text-align:center;margin:0 0 2px;letter-spacing:.08em}h2{font-size:21px;text-align:center;margin:6px 0}
p{margin:1px 0;text-align:center}table{width:100%;border-collapse:collapse;margin:6px 0}td{padding:2px 0;vertical-align:top}
td:last-child{text-align:right;white-space:nowrap;padding-left:6px}hr{border:0;border-top:1px dashed #000;margin:6px 0}
.t td{font-weight:bold;font-size:15px}.big td{font-size:16px;font-weight:bold}.note{text-align:left;border:1px solid #000;padding:5px;margin-top:6px}`;
const REPORT_STYLE = `@page{size:A4;margin:12mm}body{margin:0;font:12px/1.45 system-ui,Arial,sans-serif;color:#000}
h1{font-size:18px;text-align:center;margin:0 0 2px}p{margin:1px 0;text-align:center}hr{border:0;border-top:1px dashed #000;margin:8px 0}
table{width:100%;border-collapse:collapse;margin:10px 0}.wide td,.wide th{border-bottom:1px solid #ccc;padding:4px 6px;text-align:left}.wide th{font-size:10.5px;text-transform:uppercase}`;

/**
 * Prints through a hidden frame on this page: no pop-up window, so pop-up blockers can't stop it,
 * and it still works after waiting for the server (e.g. right after an order is completed).
 * Returns false if the browser refused.
 */
function printHtml(title: string, body: string, wide = false): boolean {
  try {
    document.querySelectorAll("iframe[data-cc-print]").forEach((f) => f.remove());
    const frame = document.createElement("iframe");
    frame.setAttribute("data-cc-print", "");
    frame.setAttribute("aria-hidden", "true");
    frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
    document.body.appendChild(frame);
    const doc = frame.contentDocument!;
    doc.open();
    doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${wide ? REPORT_STYLE : RECEIPT_STYLE}</style></head><body>${body}</body></html>`);
    doc.close();
    const win = frame.contentWindow!;
    const cleanup = () => setTimeout(() => frame.remove(), 1000);
    win.addEventListener("afterprint", cleanup);
    // Give the browser a moment to lay out the page, then open the print dialog.
    setTimeout(() => { try { win.focus(); win.print(); } catch { /* handled below */ } setTimeout(() => frame.isConnected && frame.remove(), 120000); }, 250);
    return true;
  } catch {
    return false;
  }
}

function open(title: string, body: string, wide = false) {
  if (!printHtml(title, body, wide)) alert("This browser blocked printing. Try Chrome or Edge, or use the 🖨 button again.");
}

const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
const header = (o: Row) => `${esc(o.order_number)} · ${esc(o.order_type)}${o.table_number ? ` · ${esc(tableText(o.table_number))}` : ""}`;

/** Customer bill with prices. */
export function printReceipt(o: Row) {
  const rows = (o.order_items || []).map((i: Row) => `<tr><td>${i.quantity} × ${esc(i.product_name)}</td><td>${formatPrice(i.unit_price * i.quantity)}</td></tr>`).join("");
  const gross = Number(o.subtotal) + Number(o.tax_amount || 0) + Number(o.delivery_charge || 0);
  const discount = gross - Number(o.total_amount);
  open(o.order_number, `<h1>CUP CULTURE</h1><p>${header(o)}</p><p>${when(o.created_at)}</p>${o.customer_name ? `<p>${esc(o.customer_name)}${o.customer_phone ? ` · ${esc(o.customer_phone)}` : ""}</p>` : ""}
<hr><table>${rows}</table><hr><table><tr><td>Subtotal</td><td>${formatPrice(o.subtotal)}</td></tr>${Number(o.tax_amount) ? `<tr><td>Tax</td><td>${formatPrice(o.tax_amount)}</td></tr>` : ""}${Number(o.delivery_charge) ? `<tr><td>Delivery</td><td>${formatPrice(o.delivery_charge)}</td></tr>` : ""}${discount > 0.5 ? `<tr><td>Discount</td><td>-${formatPrice(discount)}</td></tr>` : ""}<tr class="t"><td>TOTAL</td><td>${formatPrice(o.total_amount)}</td></tr></table>
<p>${esc(o.payment_method || "")} · ${o.payment_status === "paid" ? "PAID" : "NOT PAID"}</p><hr><p>Thank you! Just what you needed.</p>`);
}

/** Kitchen ticket: items and notes only, large type, no prices. */
export function printKitchenTicket(o: Row) {
  const rows = (o.order_items || []).map((i: Row) => `<tr class="big"><td>${i.quantity} ×</td><td style="text-align:left;padding-left:8px;width:100%">${esc(i.product_name)}${i.special_instructions ? `<br><small>${esc(i.special_instructions)}</small>` : ""}</td></tr>`).join("");
  const note = customerNote(o);
  open(`Kitchen ${o.order_number}`, `<h1>KITCHEN</h1><h2>${esc(o.order_number)}</h2><p>${esc(o.order_type)}</p>${o.table_number ? `<h2>${esc(tableText(o.table_number).toUpperCase())}</h2>` : ""}<p>${new Date(o.created_at).toLocaleTimeString("en-IN", { timeStyle: "short" })}${o.customer_name ? ` · ${esc(o.customer_name)}` : ""}</p><hr><table>${rows}</table>${note ? `<div class="note">${esc(note)}</div>` : ""}`);
}

/** A printable report page. `html` is built by the caller from escaped values. */
export function printReport(title: string, html: string) {
  open(title, `<h1>CUP CULTURE</h1><p><b>${esc(title)}</b></p><p>Printed ${when(new Date().toISOString())}</p><hr>${html}`, true);
}

export { esc };
