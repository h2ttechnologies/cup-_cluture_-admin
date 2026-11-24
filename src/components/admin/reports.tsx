"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Loader2, Printer, TrendingDown, TrendingUp } from "lucide-react";
import { formatPrice, localDay, statusLabel, type Row } from "./lib";
import { esc, printReport } from "./print";
import { Chips, PageHead, Pill, Skeleton, useToast } from "./ui";

type Mode = "daily" | "weekly" | "monthly";

/** Start and end (exclusive) of the period containing `anchor`. Weeks run Monday–Sunday. */
function period(mode: Mode, anchor: Date) {
  const start = new Date(anchor); start.setHours(0, 0, 0, 0);
  if (mode === "weekly") start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  if (mode === "monthly") start.setDate(1);
  const end = new Date(start);
  if (mode === "daily") end.setDate(end.getDate() + 1);
  if (mode === "weekly") end.setDate(end.getDate() + 7);
  if (mode === "monthly") end.setMonth(end.getMonth() + 1);
  return { start, end };
}
function shift(mode: Mode, anchor: Date, dir: number) {
  const d = new Date(anchor);
  if (mode === "daily") d.setDate(d.getDate() + dir);
  if (mode === "weekly") d.setDate(d.getDate() + 7 * dir);
  if (mode === "monthly") { d.setDate(1); d.setMonth(d.getMonth() + dir); }
  return d;
}
function label(mode: Mode, start: Date, end: Date) {
  if (mode === "daily") return start.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  if (mode === "monthly") return start.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  const last = new Date(end); last.setDate(last.getDate() - 1);
  return `${start.toLocaleDateString("en-IN", { day: "numeric", month: "short" })} – ${last.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`;
}

function summarise(orders: Row[]) {
  const valid = orders.filter((o) => o.status !== "Cancelled");
  const cancelled = orders.filter((o) => o.status === "Cancelled");
  const sum = (list: Row[], key = "total_amount") => list.reduce((s, o) => s + Number(o[key] || 0), 0);
  const paid = valid.filter((o) => o.payment_status === "paid");
  const sales = sum(valid);
  return {
    valid, cancelled, sales, received: sum(paid), unpaid: sales - sum(paid), tax: sum(valid, "tax_amount"), delivery: sum(valid, "delivery_charge"),
    discount: valid.reduce((s, o) => s + Math.max(0, Number(o.subtotal) + Number(o.tax_amount || 0) + Number(o.delivery_charge || 0) - Number(o.total_amount)), 0),
    avg: valid.length ? sales / valid.length : 0, cancelledValue: sum(cancelled),
  };
}

function group<T extends string>(orders: Row[], keyOf: (o: Row) => T) {
  const map = new Map<T, { count: number; total: number; paid: number }>();
  for (const o of orders) { const k = keyOf(o); const cur = map.get(k) || { count: 0, total: 0, paid: 0 }; map.set(k, { count: cur.count + 1, total: cur.total + Number(o.total_amount), paid: cur.paid + (o.payment_status === "paid" ? Number(o.total_amount) : 0) }); }
  return [...map.entries()].sort((a, b) => b[1].total - a[1].total);
}

export function Reports() {
  const toast = useToast();
  const [mode, setMode] = useState<Mode>("daily");
  const [anchor, setAnchor] = useState(() => new Date());
  const [orders, setOrders] = useState<Row[] | null>(null);
  const [previous, setPrevious] = useState<Row[]>([]);
  const { start, end } = useMemo(() => period(mode, anchor), [mode, anchor]);
  const isCurrent = new Date() >= start && new Date() < end;

  const load = useCallback(async () => {
    setOrders(null);
    const prev = period(mode, shift(mode, start, -1));
    const get = async (a: Date, b: Date) => {
      const r = await fetch(`/api/admin/report?from=${encodeURIComponent(a.toISOString())}&to=${encodeURIComponent(b.toISOString())}`, { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Could not load the report.");
      return (j.orders || []) as Row[];
    };
    try { const [now, before] = await Promise.all([get(start, end), get(prev.start, prev.end)]); setOrders(now); setPrevious(before); }
    catch (e) { toast("error", e instanceof Error ? e.message : "Could not load the report."); setOrders([]); }
  }, [mode, start, end, toast]);
  useEffect(() => { void load(); }, [load]);

  const s = useMemo(() => summarise(orders || []), [orders]);
  const p = useMemo(() => summarise(previous), [previous]);
  const change = p.sales ? ((s.sales - p.sales) / p.sales) * 100 : null;

  const buckets = useMemo(() => {
    if (!orders) return [];
    if (mode === "daily") return Array.from({ length: 24 }, (_, h) => { const list = s.valid.filter((o) => new Date(o.created_at).getHours() === h); return { key: String(h), label: `${((h + 11) % 12) + 1}${h >= 12 ? "p" : "a"}`, long: `${((h + 11) % 12) + 1} ${h >= 12 ? "pm" : "am"}`, total: list.reduce((x, o) => x + Number(o.total_amount), 0), count: list.length }; }).filter((b, i, all) => b.count || (i >= 7 && i <= 22) || all.some((x) => x.count));
    const out = [];
    for (const d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
      const day = localDay(d); const list = s.valid.filter((o) => localDay(o.created_at) === day);
      out.push({ key: day, label: mode === "weekly" ? d.toLocaleDateString("en-IN", { weekday: "short" }) : String(d.getDate()), long: d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }), total: list.reduce((x, o) => x + Number(o.total_amount), 0), count: list.length });
    }
    return out;
  }, [orders, mode, s.valid, start, end]);
  const max = Math.max(1, ...buckets.map((b) => b.total));

  const items = useMemo(() => {
    const map = new Map<string, { qty: number; total: number }>();
    for (const o of s.valid) for (const i of o.order_items || []) { const cur = map.get(i.product_name) || { qty: 0, total: 0 }; map.set(i.product_name, { qty: cur.qty + Number(i.quantity), total: cur.total + Number(i.quantity) * Number(i.unit_price) }); }
    return [...map.entries()].sort((a, b) => b[1].total - a[1].total);
  }, [s.valid]);
  const byMethod = group(s.valid, (o) => (o.payment_method || "Other") as string);
  const byType = group(s.valid, (o) => o.order_type as string);
  const title = `${mode === "daily" ? "Daily" : mode === "weekly" ? "Weekly" : "Monthly"} report · ${label(mode, start, end)}`;

  function downloadCsv() {
    const cell = (v: unknown) => { let t = String(v ?? ""); if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; return `"${t.replaceAll('"', '""')}"`; };
    const rows = [["Order", "Date", "Time", "Customer", "Phone", "Type", "Items", "Payment method", "Paid", "Status", "Subtotal", "Tax", "Delivery", "Total"],
      ...(orders || []).map((o) => [o.order_number, localDay(o.created_at), new Date(o.created_at).toLocaleTimeString("en-IN", { timeStyle: "short" }), o.customer_name, o.customer_phone, o.order_type, (o.order_items || []).map((i: Row) => `${i.quantity}x ${i.product_name}`).join("; "), o.payment_method, o.payment_status === "paid" ? "Yes" : "No", statusLabel(o.status), o.subtotal, o.tax_amount, o.delivery_charge, o.total_amount])];
    const blob = new Blob(["﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `cup-culture-${mode}-${localDay(start)}.csv`; a.click(); URL.revokeObjectURL(a.href);
  }

  function print() {
    const t = (rows: string[][], head: string[]) => `<table class="wide"><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr>${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</table>`;
    printReport(title,
      t([["Total sales", formatPrice(s.sales)], ["Received", formatPrice(s.received)], ["Not yet paid", formatPrice(s.unpaid)], ["Orders", String(s.valid.length)], ["Average order", formatPrice(s.avg)], ["Tax collected", formatPrice(s.tax)], ["Discounts", formatPrice(s.discount)], ["Cancelled", `${s.cancelled.length} (${formatPrice(s.cancelledValue)})`]], ["Summary", ""]) +
      t(byMethod.map(([k, v]) => [k, String(v.count), formatPrice(v.total), formatPrice(v.paid)]), ["Payment method", "Orders", "Sales", "Received"]) +
      t(byType.map(([k, v]) => [k, String(v.count), formatPrice(v.total)]), ["Order type", "Orders", "Sales"]) +
      t(items.map(([k, v]) => [k, String(v.qty), formatPrice(v.total)]), ["Item", "Qty", "Sales"]) +
      (mode === "daily" ? t((orders || []).map((o) => [o.order_number, new Date(o.created_at).toLocaleTimeString("en-IN", { timeStyle: "short" }), o.customer_name, o.order_type, o.payment_method, o.payment_status === "paid" ? "Paid" : "Not paid", statusLabel(o.status), formatPrice(o.total_amount)]), ["Order", "Time", "Customer", "Type", "Payment", "Paid", "Status", "Total"]) : ""));
  }

  const cmpLabel = mode === "daily" ? "yesterday" : mode === "weekly" ? "last week" : "last month";

  return (
    <>
      <PageHead title="Reports" subtitle="Daily, weekly and monthly sales. Cancelled orders are left out of sales."
        actions={<>
          <button className="btn btn-ghost" onClick={downloadCsv} disabled={!orders?.length}><Download size={15} /> CSV</button>
          <button className="btn btn-primary" onClick={print} disabled={!orders}><Printer size={15} /> Print report</button>
        </>} />

      <div className="toolbar">
        <Chips value={mode} onChange={(m) => { setMode(m); setAnchor(new Date()); }} options={[{ id: "daily", label: "Daily" }, { id: "weekly", label: "Weekly" }, { id: "monthly", label: "Monthly" }]} />
        <div className="period">
          <button className="icon-btn" onClick={() => setAnchor(shift(mode, anchor, -1))} aria-label="Previous period"><ChevronLeft size={18} /></button>
          <strong>{label(mode, start, end)}</strong>
          <button className="icon-btn" onClick={() => setAnchor(shift(mode, anchor, 1))} disabled={isCurrent} aria-label="Next period"><ChevronRight size={18} /></button>
          {mode === "daily" && <input className="input input-sm" type="date" value={localDay(anchor)} max={localDay(new Date())} onChange={(e) => e.target.value && setAnchor(new Date(e.target.value + "T12:00"))} aria-label="Pick a day" />}
          {!isCurrent && <button className="link" onClick={() => setAnchor(new Date())}>{mode === "daily" ? "Today" : mode === "weekly" ? "This week" : "This month"}</button>}
        </div>
      </div>

      {!orders ? <Skeleton rows={4} /> : <>
        <div className="kpis">
          <article className="kpi"><span>Total sales</span><strong>{formatPrice(s.sales)}</strong>
            <small className={change === null ? "" : change >= 0 ? "up" : "down"}>{change === null ? `Nothing to compare with ${cmpLabel}` : <>{change >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />} {Math.abs(change).toFixed(0)}% vs {cmpLabel}</>}</small></article>
          <article className="kpi"><span>Received</span><strong>{formatPrice(s.received)}</strong><small>{s.unpaid > 0 ? `${formatPrice(s.unpaid)} not yet paid` : "Everything collected"}</small></article>
          <article className="kpi"><span>Orders</span><strong>{s.valid.length}</strong><small>Average {formatPrice(s.avg)} each</small></article>
          <article className="kpi"><span>Cancelled</span><strong>{s.cancelled.length}</strong><small>{formatPrice(s.cancelledValue)} not counted</small></article>
        </div>

        <section className="card">
          <header className="card-head"><div><h2>{mode === "daily" ? "Sales by hour" : "Sales by day"}</h2><p>Hover a bar for the exact amount.</p></div><div className="mini-stats"><span>Tax <b>{formatPrice(s.tax)}</b></span><span>Delivery <b>{formatPrice(s.delivery)}</b></span><span>Discounts <b>{formatPrice(s.discount)}</b></span></div></header>
          <div className="chart" role="img" aria-label={mode === "daily" ? "Sales by hour" : "Sales by day"}>
            {buckets.map((b) => (
              <div key={b.key} className="chart-col" title={`${b.long}: ${formatPrice(b.total)} · ${b.count} order${b.count === 1 ? "" : "s"}`}>
                <div className="chart-bar"><i style={{ height: `${(b.total / max) * 100}%` }} />{buckets.length <= 8 && b.total > 0 && <em>{formatPrice(b.total)}</em>}</div>
                <span>{b.label}</span>
              </div>
            ))}
          </div>
        </section>

        <div className="grid-2">
          <section className="card">
            <header className="card-head"><div><h2>Item-wise sales</h2><p>Every item sold in this period.</p></div></header>
            {items.length ? <div className="table-wrap"><table className="table"><thead><tr><th>Item</th><th className="num">Qty</th><th className="num">Sales</th></tr></thead><tbody>{items.map(([n, v]) => <tr key={n}><td>{n}</td><td className="num">{v.qty}</td><td className="num">{formatPrice(v.total)}</td></tr>)}</tbody></table></div> : <p className="muted">No sales in this period.</p>}
          </section>
          <div className="stack">
            <section className="card">
              <header className="card-head"><div><h2>Payment methods</h2></div></header>
              {byMethod.length ? <table className="table"><thead><tr><th>Method</th><th className="num">Orders</th><th className="num">Sales</th><th className="num">Received</th></tr></thead><tbody>{byMethod.map(([k, v]) => <tr key={k}><td>{k}</td><td className="num">{v.count}</td><td className="num">{formatPrice(v.total)}</td><td className="num">{formatPrice(v.paid)}</td></tr>)}</tbody></table> : <p className="muted">No payments yet.</p>}
            </section>
            <section className="card">
              <header className="card-head"><div><h2>Order types</h2></div></header>
              {byType.length ? <ul className="bars">{byType.map(([k, v]) => <li key={k}><span>{k}</span><div className="bar"><i style={{ width: `${(v.count / Math.max(1, s.valid.length)) * 100}%` }} /></div><b>{v.count}</b></li>)}</ul> : <p className="muted">No orders yet.</p>}
            </section>
          </div>
        </div>

        {mode === "daily" && (
          <section className="card">
            <header className="card-head"><div><h2>All orders this day</h2><p>{orders.length} order{orders.length === 1 ? "" : "s"}, including cancelled.</p></div></header>
            {orders.length ? <div className="table-wrap"><table className="table"><thead><tr><th>Order</th><th>Time</th><th>Customer</th><th>Type</th><th>Payment</th><th>Status</th><th className="num">Total</th></tr></thead><tbody>
              {orders.map((o) => <tr key={o.id}><td><b>{o.order_number}</b></td><td>{new Date(o.created_at).toLocaleTimeString("en-IN", { timeStyle: "short" })}</td><td>{o.customer_name}</td><td>{o.order_type}</td><td>{o.payment_method} · <span className={o.payment_status === "paid" ? "paid-text" : "unpaid-text"}>{o.payment_status === "paid" ? "Paid" : "Not paid"}</span></td><td><Pill status={o.status} /></td><td className="num">{formatPrice(o.total_amount)}</td></tr>)}
            </tbody></table></div> : <p className="muted">No orders on this day.</p>}
          </section>
        )}
      </>}
      {orders === null && <p className="muted small"><Loader2 size={13} className="spin" /> Building report…</p>}
    </>
  );
}
