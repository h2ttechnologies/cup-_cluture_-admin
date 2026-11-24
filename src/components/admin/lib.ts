export type Row = Record<string, any>;

export const formatPrice = (value: number) => `₹${Math.round(Number(value) || 0).toLocaleString("en-IN")}`;

export const ORDER_STATUSES = ["Order Placed", "Order Confirmed", "Preparing", "Ready for Pickup", "Out for Delivery", "Delivered", "Cancelled"] as const;
export const RESERVATION_STATUSES = ["Pending", "Confirmed", "Rejected", "Cancelled", "Completed"] as const;
export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export const ACTIVE_ORDER = (o: Row) => !["Delivered", "Cancelled"].includes(o.status);

/** The next step for an order, given how it's being served. */
export function nextOrderStep(order: Row): { status: string; label: string } | null {
  const ready = order.order_type === "Home Delivery" ? "Out for Delivery" : "Ready for Pickup";
  switch (order.status) {
    case "Order Placed": return { status: "Order Confirmed", label: "Accept order" };
    case "Order Confirmed": return { status: "Preparing", label: "Start preparing" };
    case "Preparing": return { status: ready, label: order.order_type === "Home Delivery" ? "Send out" : order.order_type === "Dine In" ? "Ready to serve" : "Ready for pickup" };
    case "Ready for Pickup":
    case "Out for Delivery": return { status: "Delivered", label: order.order_type === "Home Delivery" ? "Mark delivered" : "Mark completed" };
    default: return null;
  }
}

export function statusTone(status: string): "new" | "progress" | "ready" | "done" | "muted" | "danger" {
  if (status === "Order Placed" || status === "Pending") return "new";
  if (status === "Order Confirmed" || status === "Preparing" || status === "Confirmed") return "progress";
  if (status === "Ready for Pickup" || status === "Out for Delivery") return "ready";
  if (status === "Delivered" || status === "Completed") return "done";
  if (status === "Cancelled" || status === "Rejected") return "danger";
  return "muted";
}

export function statusLabel(status: string) {
  return status === "Delivered" ? "Completed" : status;
}

export function timeAgo(iso: string) {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export const localDay = (date: Date | string) => {
  const d = typeof date === "string" ? new Date(date) : date;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const shortTime = (time: string) => {
  const [h, m] = String(time).split(":").map(Number);
  const suffix = h >= 12 ? "pm" : "am";
  return `${((h + 11) % 12) + 1}:${String(m || 0).padStart(2, "0")} ${suffix}`;
};

export async function api<T = any>(method: string, query: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/admin${query}`, {
    method,
    cache: "no-store",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (response.status === 401) { window.location.href = "/login"; throw new Error("Please sign in again."); }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Something went wrong. Please try again.");
  return result as T;
}


/** Orders made from the admin site carry a marker in their notes. */
export const isAdminOrder = (o: Row) => String(o.special_instructions || "").split(" · ").includes("Created in admin");
/** The note without the admin markers ("Created in admin", "Discount ₹…"). */
export const customerNote = (o: Row) => String(o.special_instructions || "").split(" · ").filter((p) => p && p !== "Created in admin" && !/^Discount ₹/.test(p)).join(" · ");

/** Splits a stored table like "Ground Floor — Table 2" into { number: "2", area: "Ground Floor" }. */
export function tableInfo(raw?: string | null): { number: string; area: string } | null {
  const text = String(raw || "").trim();
  if (!text) return null;
  const m = text.match(/table\s*[:#-]?\s*([\w-]+)/i);
  if (!m) return { number: text, area: "" };
  const area = text.replace(m[0], "").replace(/[\s·—–\-|,]+$/g, "").replace(/^[\s·—–\-|,]+/g, "").trim();
  return { number: m[1], area };
}
/** "Table 2 · Ground Floor" — readable one-line version of a stored table. */
export const tableText = (raw?: string | null) => { const t = tableInfo(raw); return t ? `Table ${t.number}${t.area ? ` · ${t.area}` : ""}` : ""; };
