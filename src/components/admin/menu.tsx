"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Coffee, Loader2, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { api, formatPrice, type Row } from "./lib";
import { Chips, Drawer, Empty, PageHead, Skeleton, Switch, useConfirm, useToast } from "./ui";

type Category = { id: string; name: string };
type Show = "all" | "available" | "unavailable";
const blank = { id: "", name: "", category_id: "", price: "" as number | "", description: "", is_veg: true, is_popular: false, is_new_arrival: false, is_available: true, stock_quantity: "" as number | "" };

export function MenuSection() {
  const toast = useToast();
  const confirm = useConfirm();
  const [products, setProducts] = useState<Row[] | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [show, setShow] = useState<Show>("all");
  const [cat, setCat] = useState("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Row | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, c] = await Promise.all([api<{ products: Row[] }>("GET", "?resource=products"), api<{ categories: Category[] }>("GET", "?resource=categories")]);
      setProducts(p.products || []); setCategories(c.categories || []);
    } catch (e) { toast("error", e instanceof Error ? e.message : "Could not load the menu."); setProducts([]); }
  }, [toast]);
  useEffect(() => { void load(); }, [load]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (products || []).filter((p) =>
      (show === "all" || (show === "available" ? p.is_available : !p.is_available)) &&
      (cat === "all" || p.category_id === cat) &&
      (!q || p.name.toLowerCase().includes(q)));
  }, [products, show, cat, query]);

  // Group the visible items by category, in menu order.
  const groups = useMemo(() => {
    const order = new Map(categories.map((c, i) => [c.id, i]));
    const map = new Map<string, Row[]>();
    for (const p of list) map.set(p.category_id, [...(map.get(p.category_id) || []), p]);
    return [...map.entries()].sort((a, b) => (order.get(a[0]) ?? 99) - (order.get(b[0]) ?? 99));
  }, [list, categories]);

  async function setAvailable(ids: string[], value: boolean) {
    const names = (products || []).filter((p) => ids.includes(p.id));
    setProducts((all) => all!.map((p) => (ids.includes(p.id) ? { ...p, is_available: value } : p)));
    try {
      await Promise.all(ids.map((id) => api("PATCH", "", { resource: "products", id, is_available: value })));
      toast("ok", ids.length === 1 ? `${names[0]?.name} is now ${value ? "available" : "not available"}` : `${ids.length} items marked ${value ? "available" : "not available"}`);
    } catch (e) { toast("error", e instanceof Error ? e.message : "Could not update."); await load(); }
  }

  async function bulk(value: boolean) {
    setBulkBusy(true);
    await setAvailable([...selected], value);
    setSelected(new Set()); setBulkBusy(false);
  }

  async function remove(p: Row) {
    if (!(await confirm(`Delete ${p.name}?`, "It will be removed from the menu for good. To hide it for now, mark it not available instead.", "Delete item", true))) return;
    try { await api("DELETE", `?resource=products&id=${encodeURIComponent(p.id)}`); toast("ok", `${p.name} deleted`); setEditing(null); await load(); }
    catch (e) { toast("error", e instanceof Error ? e.message : "Could not delete."); }
  }

  const toggleOne = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleGroup = (items: Row[]) => setSelected((s) => { const n = new Set(s); const all = items.every((p) => n.has(p.id)); items.forEach((p) => (all ? n.delete(p.id) : n.add(p.id))); return n; });
  const total = products?.length || 0;
  const off = (products || []).filter((p) => !p.is_available).length;

  return (
    <>
      <PageHead title="Menu items" subtitle="Tap boxes to select several items, or use each switch. The website updates straight away."
        actions={<button className="btn btn-primary" onClick={() => setEditing({ ...blank, category_id: cat !== "all" ? cat : categories[0]?.id || "" })}><Plus size={16} /> Add item</button>} />

      <div className="toolbar">
        <Chips value={show} onChange={(v) => { setShow(v); setSelected(new Set()); }} options={[
          { id: "all", label: "All items", count: total },
          { id: "available", label: "Available", count: total - off },
          { id: "unavailable", label: "Not available", count: off },
        ]} />
        <div className="toolbar-right">
          <select className="input input-sm" value={cat} onChange={(e) => { setCat(e.target.value); setSelected(new Set()); }} aria-label="Category">
            <option value="all">All categories</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <label className="search"><Search size={15} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find an item" /></label>
        </div>
      </div>

      {!products ? <Skeleton rows={5} /> : groups.length ? groups.map(([categoryId, items]) => {
        const name = categories.find((c) => c.id === categoryId)?.name || items[0]?.categories?.name || categoryId;
        const allPicked = items.every((p) => selected.has(p.id));
        return (
          <section key={categoryId} className="card menu-group">
            <header className="menu-group-head">
              <label className="check"><input type="checkbox" checked={allPicked} onChange={() => toggleGroup(items)} aria-label={`Select all in ${name}`} /></label>
              <h2>{name}</h2>
              <span className="muted small">{items.filter((p) => p.is_available).length} of {items.length} available</span>
            </header>
            <div className="tile-grid menu-tiles">
              {items.map((p) => (
                <div key={p.id} className={`tile ${p.is_available ? "" : "off"} ${selected.has(p.id) ? "selected" : ""}`}>
                  <button className="tile-hit" onClick={() => toggleOne(p.id)} aria-pressed={selected.has(p.id)} aria-label={`Select ${p.name}`}>
                    <span className="tile-check">{selected.has(p.id) && <Check size={12} />}</span>
                    <span className="tile-top"><i className={`diet ${p.is_veg ? "veg" : "nonveg"}`} title={p.is_veg ? "Vegetarian" : "Non-vegetarian"} /><span className="tags">{p.is_popular && <em>Popular</em>}{p.is_new_arrival && <em>New</em>}{p.stock_quantity != null && <em className={p.stock_quantity <= 5 ? "low" : ""}>{p.stock_quantity} left</em>}</span></span>
                    <span className="tile-name">{p.name}</span>
                    <span className="tile-price">{formatPrice(p.price)}</span>
                  </button>
                  <div className="tile-foot">
                    <label className="avail"><Switch checked={p.is_available} onChange={(v) => setAvailable([p.id], v)} label={`${p.name} available`} /><span>{p.is_available ? "Available" : "Not available"}</span></label>
                    <button className="icon-btn" onClick={() => setEditing({ ...p, stock_quantity: p.stock_quantity ?? "" })} aria-label={`Edit ${p.name}`}><Pencil size={14} /></button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      }) : <Empty icon={<Coffee size={22} />} title={total ? "No items match" : "Your menu is empty"}>{total ? "Try another filter or search." : "Add your first item to get started."}</Empty>}

      {selected.size > 0 && (
        <div className="save-bar">
          <span><b>{selected.size}</b> selected</span>
          <button className="btn btn-sm btn-ghost" onClick={() => bulk(false)} disabled={bulkBusy}>Mark not available</button>
          <button className="btn btn-sm btn-primary" onClick={() => bulk(true)} disabled={bulkBusy}>Mark available</button>
          <button className="icon-btn light" onClick={() => setSelected(new Set())} aria-label="Clear selection"><X size={16} /></button>
        </div>
      )}

      {editing && <ProductEditor key={editing.id || "new"} product={editing} categories={categories} onClose={() => setEditing(null)} onSaved={async (n) => { setEditing(null); toast("ok", `${n} saved`); await load(); }} onDelete={() => remove(editing)} />}
    </>
  );
}

function ProductEditor({ product, categories, onClose, onSaved, onDelete }: { product: Row; categories: Category[]; onClose: () => void; onSaved: (name: string) => void; onDelete: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState<Row>(product);
  const [saving, setSaving] = useState(false);
  const set = (patch: Row) => setForm((f) => ({ ...f, ...patch }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try { const r = await api<{ product: Row }>("POST", "", { resource: "products", ...form, price: Number(form.price) }); onSaved(r.product.name); }
    catch (err) { toast("error", err instanceof Error ? err.message : "Could not save."); setSaving(false); }
  }

  return (
    <Drawer open onClose={onClose} title={product.id ? "Edit item" : "New menu item"} subtitle={product.id ? product.name : "It appears on the website as soon as you save."}
      footer={<>
        {product.id && <button type="button" className="btn btn-ghost danger-text" onClick={onDelete}><Trash2 size={15} /> Delete</button>}
        <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button type="submit" form="product-form" className="btn btn-primary" disabled={saving}>{saving ? <><Loader2 size={15} className="spin" /> Saving…</> : "Save item"}</button>
      </>}>
      <form id="product-form" className="form" onSubmit={save}>
        <label className="field"><span>Name</span><input className="input" value={form.name} onChange={(e) => set({ name: e.target.value })} required minLength={2} maxLength={120} placeholder="e.g. Filter Coffee" autoFocus /></label>
        <div className="field-row">
          <label className="field"><span>Category</span><select className="input" value={form.category_id} onChange={(e) => set({ category_id: e.target.value })} required>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label className="field"><span>Price</span><div className="input-affix"><b>₹</b><input className="input" type="number" min="0" step="1" value={form.price} onChange={(e) => set({ price: e.target.value === "" ? "" : Number(e.target.value) })} required /></div></label>
        </div>
        <label className="field"><span>Description <em>optional</em></span><textarea className="input" rows={3} value={form.description || ""} onChange={(e) => set({ description: e.target.value })} placeholder="A short line customers will see" /></label>
        <label className="field"><span>Stock left <em>leave empty for unlimited</em></span><input className="input" type="number" min="0" value={form.stock_quantity ?? ""} onChange={(e) => set({ stock_quantity: e.target.value === "" ? "" : Number(e.target.value) })} placeholder="Unlimited" /><small>When stock reaches 0 from admin orders, the item is marked not available.</small></label>
        <div className="toggles">
          {([["is_available", "Available", "Customers can order it now"], ["is_veg", "Vegetarian", "Shows the green veg mark"], ["is_popular", "Popular", "Highlighted as a favourite"], ["is_new_arrival", "New arrival", "Shown in the New section"]] as const).map(([key, label, hint]) => (
            <label key={key} className="toggle-row"><div><strong>{label}</strong><small>{hint}</small></div><Switch checked={Boolean(form[key])} onChange={(v) => set({ [key]: v })} label={label} /></label>
          ))}
        </div>
      </form>
    </Drawer>
  );
}
