"use client";

import { useMemo, useState } from "react";
import { Loader2, Package, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { formatPrice, localDay, type Row } from "../lib";
import { Drawer, Empty, PageHead, Skeleton, Switch, useConfirm, useToast } from "../ui";
import { SetupNotice, StatusTag, fmtQty, inv, useStock } from "./shared";

const blank = { id: "", name: "", category_id: "", brand_id: "", unit: "kg", reorder_level: "" as number | "", cost_per_unit: "" as number | "", track_expiry: true, is_active: true, notes: "", opening_stock: "" as number | "", opening_expiry: "" };

export function ItemsPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const { items, loaded, setup, reload, categories, brands, units } = useStock();
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState("all");
  const [editing, setEditing] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => (cat === "all" || i.category_id === cat) && (!q || `${i.name} ${i.brandName}`.toLowerCase().includes(q)));
  }, [items, cat, query]);

  const set = (patch: Row) => setEditing((e) => ({ ...e!, ...patch }));

  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    try { await inv("POST", "", { resource: "items", ...editing }); toast("ok", `${editing!.name} saved`); setEditing(null); await reload(); }
    catch (err) { toast("error", err instanceof Error ? err.message : "Could not save."); } finally { setBusy(false); }
  }
  async function remove(item: Row) {
    if (!(await confirm(`Delete ${item.name}?`, "Its stock and adjustment history will be deleted too. To keep the history, switch it off instead.", "Delete item", true))) return;
    try { await inv("DELETE", `?resource=items&id=${item.id}`); toast("ok", `${item.name} deleted`); setEditing(null); await reload(); } catch (err) { toast("error", err instanceof Error ? err.message : "Could not delete."); }
  }
  async function toggle(item: Row, value: boolean) {
    try { await inv("PATCH", "", { resource: "items", id: item.id, is_active: value }); toast("ok", value ? `${item.name} is tracked again` : `${item.name} switched off`); await reload(); } catch (err) { toast("error", err instanceof Error ? err.message : "Could not update."); }
  }

  if (setup) return <><PageHead title="Items" /><SetupNotice /></>;

  return (
    <>
      <PageHead title="Items" subtitle="Everything the kitchen keeps in stock: ingredients, packaging and supplies."
        actions={<button className="btn btn-primary" onClick={() => setEditing({ ...blank, category_id: cat !== "all" ? cat : "" })}><Plus size={16} /> Add item</button>} />
      <div className="toolbar">
        <select className="input input-sm" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category"><option value="all">All categories</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <div className="toolbar-right"><label className="search"><Search size={15} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find an item or brand" /></label></div>
      </div>

      {!loaded ? <Skeleton rows={4} /> : list.length ? (
        <section className="card" style={{ padding: 0 }}>
          <div className="table-wrap tall"><table className="table item-table">
            <thead><tr><th>Item</th><th>Category</th><th>Brand</th><th className="num">In stock</th><th className="num">Reorder at</th><th className="num">Cost</th><th>Status</th><th>Tracked</th><th /></tr></thead>
            <tbody>{list.map((i) => (
              <tr key={i.id} className={i.is_active ? "" : "row-off"}>
                <td><button className="link-strong" onClick={() => setEditing({ ...i, category_id: i.category_id || "", brand_id: i.brand_id || "" })}>{i.name}</button>{i.track_expiry && <span className="muted small"> · expiry</span>}</td>
                <td>{i.categoryName}</td>
                <td>{i.brandName || "—"}</td>
                <td className="num"><b>{fmtQty(i.qty, i.unit)}</b></td>
                <td className="num">{fmtQty(Number(i.reorder_level), i.unit)}</td>
                <td className="num">{Number(i.cost_per_unit) ? `${formatPrice(i.cost_per_unit)}/${i.unit}` : "—"}</td>
                <td><StatusTag status={i.status} /></td>
                <td><Switch checked={i.is_active} onChange={(v) => toggle(i, v)} label={`Track ${i.name}`} /></td>
                <td><button className="icon-btn" onClick={() => setEditing({ ...i, category_id: i.category_id || "", brand_id: i.brand_id || "" })} aria-label={`Edit ${i.name}`}><Pencil size={15} /></button></td>
              </tr>
            ))}</tbody>
          </table></div>
        </section>
      ) : <Empty icon={<Package size={22} />} title={items.length ? "No items match" : "No items yet"}>{items.length ? "Try another search." : "Add milk, coffee powder, buns, cups — anything you want to keep track of."}</Empty>}

      <Drawer open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? "Edit item" : "New stock item"} subtitle={editing?.id ? editing.name : "You can add opening stock now or later."}
        footer={<>
          {editing?.id && <button className="btn btn-ghost danger-text" onClick={() => remove(editing)}><Trash2 size={15} /> Delete</button>}
          <button className="btn btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
          <button type="submit" form="item-form" className="btn btn-primary" disabled={busy}>{busy ? <><Loader2 size={15} className="spin" /> Saving…</> : "Save item"}</button>
        </>}>
        {editing && <form id="item-form" className="form" onSubmit={save}>
          <label className="field"><span>Name</span><input className="input" value={editing.name} onChange={(e) => set({ name: e.target.value })} required minLength={2} placeholder="e.g. Full cream milk" autoFocus /></label>
          <div className="field-row">
            <label className="field"><span>Category</span><select className="input" value={editing.category_id} onChange={(e) => set({ category_id: e.target.value })}><option value="">No category</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
            <label className="field"><span>Brand / supplier</span><select className="input" value={editing.brand_id} onChange={(e) => set({ brand_id: e.target.value })}><option value="">None</option>{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
          </div>
          <label className="field"><span>Measured in</span><div className="chips wrap">{units.map((u) => <button type="button" key={u} className={`chip ${editing.unit === u ? "active" : ""}`} onClick={() => set({ unit: u })}>{u}</button>)}</div></label>
          <div className="field-row">
            <label className="field"><span>Warn me when below</span><div className="input-affix"><input className="input" type="number" min={0} step="any" value={editing.reorder_level} onChange={(e) => set({ reorder_level: e.target.value === "" ? "" : Number(e.target.value) })} placeholder="0" /><b className="suffix">{editing.unit}</b></div></label>
            <label className="field"><span>Cost per {editing.unit} <em>optional</em></span><div className="input-affix"><b>₹</b><input className="input" type="number" min={0} step="any" value={editing.cost_per_unit} onChange={(e) => set({ cost_per_unit: e.target.value === "" ? "" : Number(e.target.value) })} /></div></label>
          </div>
          {!editing.id && <div className="field-row">
            <label className="field"><span>Opening stock <em>optional</em></span><div className="input-affix"><input className="input" type="number" min={0} step="any" value={editing.opening_stock} onChange={(e) => set({ opening_stock: e.target.value === "" ? "" : Number(e.target.value) })} /><b className="suffix">{editing.unit}</b></div></label>
            <label className="field"><span>Its expiry date <em>optional</em></span><input className="input" type="date" min={localDay(new Date())} value={editing.opening_expiry} onChange={(e) => set({ opening_expiry: e.target.value })} /></label>
          </div>}
          <div className="toggles">
            <label className="toggle-row"><div><strong>Track expiry dates</strong><small>Ask for an expiry date when adding stock</small></div><Switch checked={editing.track_expiry} onChange={(v) => set({ track_expiry: v })} label="Track expiry" /></label>
            <label className="toggle-row"><div><strong>In use</strong><small>Switch off for items you no longer buy</small></div><Switch checked={editing.is_active} onChange={(v) => set({ is_active: v })} label="In use" /></label>
          </div>
          <label className="field"><span>Notes <em>optional</em></span><textarea className="input" rows={2} value={editing.notes || ""} onChange={(e) => set({ notes: e.target.value })} placeholder="e.g. Keep refrigerated" /></label>
        </form>}
      </Drawer>
    </>
  );
}
