"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, History, Plus } from "lucide-react";
import { localDay, type Row } from "../lib";
import { Chips, Empty, PageHead, Skeleton, useToast } from "../ui";
import { AdjustDrawer, SetupError, SetupNotice, fmtQty, inv, useStock } from "./shared";

type Range = "today" | "7" | "30" | "all";
const REASONS = ["all", "Purchase", "Usage", "Wastage", "Expired", "Correction", "Return"];

export function AdjustmentsPage() {
  const toast = useToast();
  const stock = useStock();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [range, setRange] = useState<Range>("7");
  const [reason, setReason] = useState("all");
  const [item, setItem] = useState("");
  const [setup, setSetup] = useState(false);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setRows(null);
    const params = new URLSearchParams({ resource: "adjustments" });
    if (range !== "all") { const d = new Date(); d.setHours(0, 0, 0, 0); if (range !== "today") d.setDate(d.getDate() - (Number(range) - 1)); params.set("from", d.toISOString()); }
    if (item) params.set("item", item);
    try { setRows((await inv("GET", `?${params}`)).adjustments || []); }
    catch (e) { if (e instanceof SetupError) setSetup(true); else toast("error", e instanceof Error ? e.message : "Could not load adjustments."); setRows([]); }
  }, [range, item, toast]);
  useEffect(() => { void load(); }, [load]);

  const list = useMemo(() => (rows || []).filter((r) => reason === "all" || r.reason === reason), [rows, reason]);
  const wasteValue = useMemo(() => {
    const cost = new Map(stock.items.map((i) => [i.id, Number(i.cost_per_unit) || 0]));
    return list.filter((r) => ["Wastage", "Expired"].includes(r.reason)).reduce((s, r) => s + Math.abs(Number(r.change)) * (cost.get(r.item_id) || 0), 0);
  }, [list, stock.items]);

  function csv() {
    const cell = (v: unknown) => { let t = String(v ?? ""); if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; return `"${t.replaceAll('"', '""')}"`; };
    const out = [["Date", "Time", "Item", "Change", "Unit", "Stock after", "Reason", "Expiry", "Note", "By"], ...list.map((r) => [localDay(r.created_at), new Date(r.created_at).toLocaleTimeString("en-IN", { timeStyle: "short" }), r.inventory_items?.name, r.change, r.inventory_items?.unit, r.quantity_after, r.reason, r.expiry_date || "", r.note, r.created_by_name])];
    const blob = new Blob(["﻿" + out.map((r) => r.map(cell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `stock-adjustments-${localDay(new Date())}.csv`; a.click(); URL.revokeObjectURL(a.href);
  }

  if (setup || stock.setup) return <><PageHead title="Stock adjustments" /><SetupNotice /></>;

  return (
    <>
      <PageHead title="Stock adjustments" subtitle="Every change to kitchen stock: deliveries, usage, wastage and corrections."
        actions={<>
          <button className="btn btn-ghost" onClick={csv} disabled={!list.length}><Download size={15} /> CSV</button>
          <button className="btn btn-primary" onClick={() => setAdding(true)}><Plus size={16} /> New adjustment</button>
        </>} />

      <div className="toolbar">
        <Chips value={range} onChange={setRange} options={[{ id: "today", label: "Today" }, { id: "7", label: "7 days" }, { id: "30", label: "30 days" }, { id: "all", label: "All time" }]} />
        <div className="toolbar-right">
          <select className="input input-sm" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Reason">{REASONS.map((r) => <option key={r} value={r}>{r === "all" ? "All reasons" : r}</option>)}</select>
          <select className="input input-sm" value={item} onChange={(e) => setItem(e.target.value)} aria-label="Item"><option value="">All items</option>{stock.items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select>
        </div>
      </div>

      {wasteValue > 0 && <div className="card card-warn compact">Wastage and expired stock in this view cost about <b>₹{Math.round(wasteValue).toLocaleString("en-IN")}</b>.</div>}

      {!rows ? <Skeleton rows={4} /> : list.length ? (
        <section className="card" style={{ padding: 0 }}>
          <div className="table-wrap tall"><table className="table adj-table">
            <thead><tr><th>When</th><th>Item</th><th className="num">Change</th><th className="num">Stock after</th><th>Reason</th><th>Note</th><th>By</th></tr></thead>
            <tbody>{list.map((r) => {
              const unit = r.inventory_items?.unit || "";
              const up = Number(r.change) > 0;
              return (
                <tr key={r.id}>
                  <td><b>{new Date(r.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</b><br /><span className="muted small">{new Date(r.created_at).toLocaleTimeString("en-IN", { timeStyle: "short" })}</span></td>
                  <td>{r.inventory_items?.name || "Deleted item"}{r.expiry_date && <><br /><span className="muted small">Expiry {new Date(r.expiry_date + "T00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span></>}</td>
                  <td className={`num ${up ? "up-text" : "down-text"}`}><b>{up ? "+" : "−"}{fmtQty(Math.abs(Number(r.change)), unit)}</b></td>
                  <td className="num">{fmtQty(Number(r.quantity_after), unit)}</td>
                  <td><span className={`reason r-${String(r.reason).toLowerCase()}`}>{r.reason}</span></td>
                  <td className="muted">{r.note || "—"}</td>
                  <td className="muted">{r.created_by_name || "—"}</td>
                </tr>
              );
            })}</tbody>
          </table></div>
        </section>
      ) : <Empty icon={<History size={22} />} title="No adjustments here">Changes appear when you add or remove stock.</Empty>}

      <AdjustDrawer open={adding} items={stock.items} onClose={() => setAdding(false)} onDone={() => { void load(); void stock.reload(); }} />
    </>
  );
}
