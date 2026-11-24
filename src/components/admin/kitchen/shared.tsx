"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Database, Loader2, Minus, Plus } from "lucide-react";
import { formatPrice, localDay, type Row } from "../lib";
import { Drawer, Empty, useToast } from "../ui";

export class SetupError extends Error {}

export async function inv<T = any>(method: string, query = "", body?: unknown): Promise<T> {
  const r = await fetch(`/api/admin/inventory${query}`, { method, cache: "no-store", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  if (r.status === 401) { window.location.href = "/login"; throw new Error("Please sign in again."); }
  const j = await r.json().catch(() => ({}));
  if (j.setup) throw new SetupError(j.error);
  if (!r.ok) throw new Error(j.error || "Something went wrong.");
  return j as T;
}

export const fmtQty = (n: number, unit: string) => `${Number(n.toFixed(3)).toLocaleString("en-IN")} ${unit}`;

export function daysUntil(date: string) {
  const today = new Date(localDay(new Date()) + "T00:00");
  return Math.round((+new Date(date + "T00:00") - +today) / 86400000);
}
export function expiryText(date: string) {
  const d = daysUntil(date);
  if (d < 0) return `Expired ${-d} day${d === -1 ? "" : "s"} ago`;
  if (d === 0) return "Expires today";
  if (d === 1) return "Expires tomorrow";
  return `Expires in ${d} days`;
}

export type StockItem = Row & { qty: number; value: number; status: "out" | "low" | "ok"; nextExpiry: string | null; batches: Row[]; categoryName: string; brandName: string };

/** Loads items + batches + categories + brands and works out stock per item. */
export function useStock() {
  const toast = useToast();
  const [raw, setRaw] = useState<Row | null>(null);
  const [setup, setSetup] = useState(false);
  const load = useCallback(async () => {
    try { setRaw(await inv("GET", "?resource=stock")); setSetup(false); }
    catch (e) { if (e instanceof SetupError) setSetup(true); else toast("error", e instanceof Error ? e.message : "Could not load stock."); setRaw((r) => r || { items: [], batches: [], categories: [], brands: [], units: [], reasons: [] }); }
  }, [toast]);
  useEffect(() => { void load(); }, [load]);

  const items: StockItem[] = useMemo(() => {
    if (!raw) return [];
    const cats = new Map((raw.categories || []).map((c: Row) => [c.id, c.name]));
    const brands = new Map((raw.brands || []).map((b: Row) => [b.id, b.name]));
    return (raw.items || []).map((i: Row) => {
      const batches = (raw.batches || []).filter((b: Row) => b.item_id === i.id);
      const qty = batches.reduce((s: number, b: Row) => s + Number(b.quantity), 0);
      const nextExpiry = batches.map((b: Row) => b.expiry_date).filter(Boolean).sort()[0] || null;
      return { ...i, qty, value: qty * Number(i.cost_per_unit || 0), batches, nextExpiry, categoryName: (cats.get(i.category_id) as string) || "Uncategorised", brandName: (brands.get(i.brand_id) as string) || "", status: qty <= 0 ? "out" : qty <= Number(i.reorder_level) ? "low" : "ok" } as StockItem;
    });
  }, [raw]);

  return { raw, items, setup, loaded: !!raw, reload: load, categories: (raw?.categories || []) as Row[], brands: (raw?.brands || []) as Row[], units: (raw?.units || []) as string[] };
}

export function SetupNotice() {
  return (
    <section className="card setup-card">
      <Empty icon={<Database size={22} />} title="One-time setup needed">
        Kitchen stock needs new tables in your Supabase database.
      </Empty>
      <ol className="setup-steps">
        <li>Open your project at <b>supabase.com</b> → <b>SQL Editor</b> → <b>New query</b>.</li>
        <li>Open the file <code>supabase/migrations/202611230004_kitchen_inventory.sql</code> in the Cup Culture site folder, copy everything, and paste it in.</li>
        <li>Press <b>Run</b>, then refresh this page.</li>
      </ol>
    </section>
  );
}

export function StatusTag({ status }: { status: StockItem["status"] }) {
  return <span className={`pill ${status === "out" ? "pill-danger" : status === "low" ? "pill-new" : "pill-done"}`}><i />{status === "out" ? "Out of stock" : status === "low" ? "Low stock" : "In stock"}</span>;
}

/* ---------- Add / remove stock panel ---------- */
type Mode = "add" | "remove" | "count";
export function AdjustDrawer({ open, item, items, mode: startMode = "add", batch, onClose, onDone }: { open: boolean; item?: StockItem | null; items: StockItem[]; mode?: Mode; batch?: Row | null; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [itemId, setItemId] = useState("");
  const [mode, setMode] = useState<Mode>(startMode);
  const [qty, setQty] = useState<number | "">("");
  const [reason, setReason] = useState("Purchase");
  const [expiry, setExpiry] = useState("");
  const [cost, setCost] = useState<number | "">("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setItemId(item?.id || ""); setMode(startMode); setQty(batch ? Number(batch.quantity) : ""); setExpiry(""); setNote(""); setCost(item ? Number(item.cost_per_unit) || "" : "");
    setReason(startMode === "add" ? "Purchase" : startMode === "count" ? "Correction" : batch ? "Expired" : "Usage");
  }, [open, item, startMode, batch]);

  const current = items.find((i) => i.id === itemId);
  const amount = Number(qty) || 0;
  const change = mode === "add" ? amount : mode === "remove" ? -amount : current ? amount - current.qty : 0;
  const after = (current?.qty || 0) + change;

  function pickMode(m: Mode) { setMode(m); setReason(m === "add" ? "Purchase" : m === "count" ? "Correction" : "Usage"); }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!current) return toast("error", "Choose an item.");
    if (qty === "" || (mode !== "count" && amount <= 0)) return toast("error", "Enter a quantity.");
    if (change === 0) return toast("error", "That’s already the current stock.");
    if (after < 0) return toast("error", `Only ${fmtQty(current.qty, current.unit)} in stock.`);
    setBusy(true);
    try {
      await inv("POST", "", { action: "adjust", item_id: current.id, change, reason: mode === "count" ? "Correction" : reason, note, expiry_date: change > 0 ? expiry : "", cost_per_unit: cost, batch_id: batch?.id });
      toast("ok", `${current.name}: now ${fmtQty(after, current.unit)}`); onDone(); onClose();
    } catch (err) { toast("error", err instanceof Error ? err.message : "Could not save."); } finally { setBusy(false); }
  }

  const addReasons = ["Purchase", "Return", "Correction"];
  const removeReasons = ["Usage", "Wastage", "Expired", "Correction"];

  return (
    <Drawer open={open} onClose={onClose} title={batch ? "Remove expired stock" : mode === "add" ? "Add stock" : mode === "remove" ? "Remove stock" : "Count stock"} subtitle={current ? `${current.name} · now ${fmtQty(current.qty, current.unit)}` : "Choose an item"}
      footer={<>
        {current && <div className="foot-total"><span>After this</span><strong className={after < 0 ? "danger-text" : ""}>{fmtQty(Math.max(after, 0), current.unit)}</strong></div>}
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button type="submit" form="adjust-form" className="btn btn-primary" disabled={busy}>{busy ? <><Loader2 size={15} className="spin" /> Saving…</> : "Save"}</button>
      </>}>
      <form id="adjust-form" className="form" onSubmit={save}>
        {!batch && <div className="segmented full">
          <button type="button" className={mode === "add" ? "active" : ""} onClick={() => pickMode("add")}><Plus size={14} /> Add</button>
          <button type="button" className={mode === "remove" ? "active" : ""} onClick={() => pickMode("remove")}><Minus size={14} /> Remove</button>
          <button type="button" className={mode === "count" ? "active" : ""} onClick={() => pickMode("count")}>Set exact count</button>
        </div>}
        <label className="field"><span>Item</span>
          <select className="input" value={itemId} onChange={(e) => setItemId(e.target.value)} required disabled={!!item}>
            <option value="">Choose an item…</option>
            {items.filter((i) => i.is_active || i.id === itemId).map((i) => <option key={i.id} value={i.id}>{i.name} ({fmtQty(i.qty, i.unit)})</option>)}
          </select>
        </label>
        <label className="field"><span>{mode === "count" ? "Counted quantity on the shelf" : "Quantity"}</span>
          <div className="input-affix"><input className="input" type="number" min={0} step="any" value={qty} onChange={(e) => setQty(e.target.value === "" ? "" : Number(e.target.value))} required autoFocus readOnly={!!batch} /><b className="suffix">{current?.unit || ""}</b></div>
          {mode === "count" && current && qty !== "" && <small>{change === 0 ? "Matches the current stock." : `${change > 0 ? "+" : ""}${fmtQty(change, current.unit)} correction`}</small>}
        </label>
        {mode !== "count" && !batch && <label className="field"><span>Reason</span>
          <div className="chips wrap">{(mode === "add" ? addReasons : removeReasons).map((r) => <button type="button" key={r} className={`chip ${reason === r ? "active" : ""}`} onClick={() => setReason(r)}>{r}</button>)}</div>
        </label>}
        {mode === "add" && <div className="field-row">
          <label className="field"><span>Expiry date {current?.track_expiry ? "" : <em>optional</em>}</span><input className="input" type="date" value={expiry} min={localDay(new Date())} onChange={(e) => setExpiry(e.target.value)} /></label>
          <label className="field"><span>Cost per {current?.unit || "unit"} <em>optional</em></span><div className="input-affix"><b>₹</b><input className="input" type="number" min={0} step="any" value={cost} onChange={(e) => setCost(e.target.value === "" ? "" : Number(e.target.value))} /></div></label>
        </div>}
        {mode === "add" && amount > 0 && Number(cost) > 0 && <p className="muted small">Purchase value {formatPrice(amount * Number(cost))}</p>}
        <label className="field"><span>Note <em>optional</em></span><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder={mode === "add" ? "e.g. Bill no. 2241" : "e.g. Spilled, used for event"} /></label>
      </form>
    </Drawer>
  );
}
