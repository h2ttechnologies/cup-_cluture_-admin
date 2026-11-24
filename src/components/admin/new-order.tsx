"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Minus, Plus, Search, Trash2 } from "lucide-react";
import { api, formatPrice, type Row } from "./lib";
import { Chips, Drawer, Switch, useToast } from "./ui";

type Line = { product_id: string; name: string; price: number; quantity: number };
const TYPES = [{ id: "Takeaway", label: "Takeaway" }, { id: "Dine In", label: "Dine in" }, { id: "Home Delivery", label: "Delivery" }];
const METHODS = ["Cash", "UPI", "Card"];

export function NewOrder({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (order: Row) => void }) {
  const toast = useToast();
  const [products, setProducts] = useState<Row[]>([]);
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [taxRate, setTaxRate] = useState(0);
  const [deliveryFee, setDeliveryFee] = useState(0);
  const [cat, setCat] = useState("all");
  const [query, setQuery] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [type, setType] = useState("Takeaway");
  const [table, setTable] = useState("");
  const [tables, setTables] = useState<Row[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [note, setNote] = useState("");
  const [method, setMethod] = useState("Cash");
  const [paid, setPaid] = useState(true);
  const [discount, setDiscount] = useState<number | "">("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    Promise.all([
      api<{ products: Row[] }>("GET", "?resource=products"),
      api<{ categories: Array<{ id: string; name: string }> }>("GET", "?resource=categories"),
      api<{ settings: Row }>("GET", "?resource=settings"),
      api<{ tables: Row[] }>("GET", "?resource=tables"),
    ]).then(([p, c, s, t]) => {
      const all: Row[] = p.products || [];
      setProducts(all); setCategories(c.categories || []); setTables((t.tables || []).filter((x) => x.is_available));
      setTaxRate(Number(s.settings?.checkout?.value?.tax_rate_percent) || 0); setDeliveryFee(Number(s.settings?.checkout?.value?.delivery_fee) || 0);
    }).catch((e) => toast("error", e instanceof Error ? e.message : "Could not load the menu."));
  }, [open, toast]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => (cat === "all" || p.category_id === cat) && (!q || p.name.toLowerCase().includes(q)));
  }, [products, cat, query]);

  const qtyOf = (id: string) => lines.find((l) => l.product_id === id)?.quantity || 0;
  function add(p: Row, delta = 1) {
    setLines((list) => {
      const found = list.find((l) => l.product_id === p.id);
      if (!found) return delta > 0 ? [...list, { product_id: p.id, name: p.name, price: Number(p.price), quantity: delta }] : list;
      const quantity = found.quantity + delta;
      return quantity <= 0 ? list.filter((l) => l.product_id !== p.id) : list.map((l) => (l.product_id === p.id ? { ...l, quantity } : l));
    });
  }

  const subtotal = lines.reduce((s, l) => s + l.price * l.quantity, 0);
  const tax = Math.round(subtotal * taxRate) / 100;
  const delivery = type === "Home Delivery" ? deliveryFee : 0;
  const off = Math.min(subtotal + tax + delivery, Number(discount) || 0);
  const total = subtotal + tax + delivery - off;
  const count = lines.reduce((s, l) => s + l.quantity, 0);

  function reset() { setLines([]); setName(""); setPhone(""); setAddress(""); setNote(""); setTable(""); setDiscount(""); setPaid(true); setMethod("Cash"); setQuery(""); }

  async function submit() {
    if (!lines.length) return toast("error", "Add at least one item.");
    if (type === "Home Delivery" && (!phone.trim() || !address.trim())) return toast("error", "Delivery needs a mobile number and address.");
    setSaving(true);
    try {
      const r = await fetch("/api/admin/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: lines.map((l) => ({ product_id: l.product_id, quantity: l.quantity })), order_type: type, table_number: table, customer_name: name, customer_phone: phone, delivery_address: address, special_instructions: note, payment_method: type === "Home Delivery" && !paid ? "Cash on delivery" : method, paid, discount: Number(discount) || 0, delivery_charge: delivery, status: "Order Confirmed" }) });
      const result = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(result.error || "Could not create the order.");
      reset(); onCreated(result.order);
    } catch (e) { toast("error", e instanceof Error ? e.message : "Could not create the order."); } finally { setSaving(false); }
  }

  return (
    <Drawer open={open} onClose={onClose} wide title="New order" subtitle="For walk-in, phone and counter orders. Prices come from your menu."
      footer={<>
        <div className="foot-total"><span>{count} item{count === 1 ? "" : "s"}</span><strong>{formatPrice(total)}</strong></div>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={submit} disabled={saving || !lines.length}>{saving ? <><Loader2 size={15} className="spin" /> Creating…</> : `Create order · ${formatPrice(total)}`}</button>
      </>}>
      <div className="pos">
        <div className="pos-menu">
          <label className="search"><Search size={15} /><input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search the menu" /></label>
          <Chips value={cat} onChange={setCat} options={[{ id: "all", label: "All" }, ...categories.map((c) => ({ id: c.id, label: c.name }))]} />
          <div className="tile-grid pos-tiles">
            {shown.map((p) => {
              const q = qtyOf(p.id);
              return (
                <div key={p.id} className={`tile ${p.is_available ? "" : "off"} ${q ? "picked" : ""}`}>
                  <button className="tile-hit" onClick={() => p.is_available && add(p)} disabled={!p.is_available} aria-label={`Add ${p.name}`}>
                    <i className={`diet ${p.is_veg ? "veg" : "nonveg"}`} />
                    <span className="tile-name">{p.name}</span>
                    <span className="tile-price">{p.is_available ? formatPrice(p.price) : "Not available"}</span>
                  </button>
                  {q > 0 && <>
                    <b className="tile-qty">{q}</b>
                    <button className="tile-minus" onClick={() => add(p, -1)} aria-label={`One less ${p.name}`}><Minus size={14} /></button>
                  </>}
                </div>
              );
            })}
            {!shown.length && <p className="muted small" style={{ padding: 12 }}>No items match.</p>}
          </div>
        </div>

        <div className="pos-side">
          <section>
            <h3>Order type</h3>
            <div className="segmented full">{TYPES.map((t) => <button key={t.id} className={type === t.id ? "active" : ""} onClick={() => setType(t.id)}>{t.label}</button>)}</div>
            {type === "Dine In" && (tables.length
              ? <select className="input" value={table} onChange={(e) => setTable(e.target.value)} style={{ marginTop: 10 }}><option value="">Choose table (optional)</option>{tables.map((t) => <option key={t.id} value={t.table_number}>Table {t.table_number} · {t.capacity} seats</option>)}</select>
              : <input className="input" value={table} onChange={(e) => setTable(e.target.value)} placeholder="Table no. (optional)" style={{ marginTop: 10 }} />)}
          </section>

          <section>
            <h3>Items</h3>
            {lines.length ? (
              <ul className="cart">
                {lines.map((l) => (
                  <li key={l.product_id}>
                    <div className="stepper"><button onClick={() => add({ id: l.product_id }, -1)} aria-label="One less"><Minus size={13} /></button><b>{l.quantity}</b><button onClick={() => add({ id: l.product_id }, 1)} aria-label="One more"><Plus size={13} /></button></div>
                    <span className="grow">{l.name}</span>
                    <span>{formatPrice(l.price * l.quantity)}</span>
                    <button className="icon-btn" onClick={() => setLines((list) => list.filter((x) => x.product_id !== l.product_id))} aria-label={`Remove ${l.name}`}><Trash2 size={14} /></button>
                  </li>
                ))}
              </ul>
            ) : <p className="muted small">Tap items on the left to add them.</p>}
          </section>

          <section className="pos-grid">
            <label className="field"><span>Customer name <em>optional</em></span><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Walk-in customer" /></label>
            <label className="field"><span>Mobile {type === "Home Delivery" ? "" : <em>optional</em>}</span><input className="input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="98765 43210" /></label>
            {type === "Home Delivery" && <label className="field wide"><span>Delivery address</span><textarea className="input" rows={2} value={address} onChange={(e) => setAddress(e.target.value)} /></label>}
            <label className="field wide"><span>Note for the kitchen <em>optional</em></span><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. less sugar" /></label>
          </section>

          <section>
            <h3>Payment</h3>
            <div className="segmented full">{METHODS.map((m) => <button key={m} className={method === m ? "active" : ""} onClick={() => setMethod(m)}>{m}</button>)}</div>
            <label className="toggle-row plain"><div><strong>Paid now</strong><small>{paid ? "Counted in today’s revenue straight away" : "Mark it paid later from the order"}</small></div><Switch checked={paid} onChange={setPaid} label="Paid now" /></label>
          </section>

          <section className="totals">
            <div><span>Subtotal</span><span>{formatPrice(subtotal)}</span></div>
            {taxRate > 0 && <div><span>Tax ({taxRate}%)</span><span>{formatPrice(tax)}</span></div>}
            {delivery > 0 && <div><span>Delivery</span><span>{formatPrice(delivery)}</span></div>}
            <div className="discount-row"><span>Discount</span><div className="input-affix sm"><b>₹</b><input className="input" type="number" min={0} value={discount} onChange={(e) => setDiscount(e.target.value === "" ? "" : Math.max(0, Number(e.target.value)))} placeholder="0" /></div></div>
            <div className="grand"><span>Total</span><span>{formatPrice(total)}</span></div>
          </section>
        </div>
      </div>
    </Drawer>
  );
}
