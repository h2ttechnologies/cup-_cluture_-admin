"use client";

import { useMemo, useState } from "react";
import { Ban, Bike, Check, ChefHat, Clock, Download, MapPin, MessageSquare, Phone, Plus, Printer, RefreshCw, Search, ShoppingBag, User, Utensils } from "lucide-react";
import { NewOrder } from "./new-order";
import { printKitchenTicket, printReceipt } from "./print";
import type { Live } from "./admin-app";
import { ACTIVE_ORDER, ORDER_STATUSES, customerNote, formatPrice, isAdminOrder, localDay, nextOrderStep, statusLabel, statusTone, tableInfo, timeAgo, type Row } from "./lib";
import { Chips, Drawer, Empty, PageHead, Pill, Skeleton, useConfirm, useToast } from "./ui";

type Filter = "active" | "new" | "done" | "cancelled" | "all";

export function Orders({ live }: { live: Live }) {
  const { orders, loaded, refresh, updateOrder } = live;
  const confirm = useConfirm();
  const [filter, setFilter] = useState<Filter>("active");
  const [query, setQuery] = useState("");
  const [day, setDay] = useState("");
  const [type, setType] = useState("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [creating, setCreating] = useState(false);
  const toast = useToast();

  const groups: Record<Filter, (o: Row) => boolean> = {
    active: ACTIVE_ORDER,
    new: (o) => o.status === "Order Placed",
    done: (o) => o.status === "Delivered",
    cancelled: (o) => o.status === "Cancelled",
    all: () => true,
  };
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orders
      .filter(groups[filter])
      .filter((o) => type === "all" || o.order_type === type)
      .filter((o) => !day || localDay(o.created_at) === day)
      .filter((o) => !q || `${o.order_number} ${o.customer_name} ${o.customer_phone}`.toLowerCase().includes(q))
      .sort((a, b) => filter === "active" ? +new Date(a.created_at) - +new Date(b.created_at) : +new Date(b.created_at) - +new Date(a.created_at));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, filter, query, day, type]);

  const open = orders.find((o) => o.id === openId) || null;

  async function cancel(order: Row) {
    if (await confirm(`Cancel ${order.order_number}?`, `${order.customer_name}’s order will be marked as cancelled${order.whatsapp_updates ? " and they’ll get a WhatsApp update" : ""}.`, "Cancel order", true)) await updateOrder(order.id, { status: "Cancelled" });
  }

  return (
    <>
      <PageHead title="Orders" subtitle="Website and counter orders in one place. Updates every 20 seconds."
        actions={<>
          <button className="btn btn-ghost" onClick={async () => { setSpinning(true); await refresh(); setSpinning(false); }}><RefreshCw size={15} className={spinning ? "spin" : ""} /> Refresh</button>
          <a className="btn btn-ghost" href="/api/admin?resource=orders&format=csv"><Download size={15} /> Export CSV</a>
          <button className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={16} /> New order</button>
        </>} />

      <div className="toolbar">
        <Chips value={filter} onChange={setFilter} options={[
          { id: "active", label: "In progress", count: orders.filter(groups.active).length },
          { id: "new", label: "New", count: orders.filter(groups.new).length },
          { id: "done", label: "Completed", count: orders.filter(groups.done).length },
          { id: "cancelled", label: "Cancelled" },
          { id: "all", label: "All" },
        ]} />
        <div className="toolbar-right">
          <label className="search"><Search size={15} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Order no., name or phone" /></label>
          <select className="input input-sm" value={type} onChange={(e) => setType(e.target.value)} aria-label="Order type"><option value="all">All types</option><option>Dine In</option><option>Takeaway</option><option>Home Delivery</option></select>
          <input className="input input-sm" type="date" value={day} onChange={(e) => setDay(e.target.value)} aria-label="Filter by day" />
          {day && <button className="link" onClick={() => setDay("")}>Clear date</button>}
        </div>
      </div>

      {!loaded ? <Skeleton rows={4} /> : list.length ? (
        <div className="ticket-grid">
          {list.map((o) => <OrderTicket key={o.id} order={o} onOpen={() => setOpenId(o.id)} onUpdate={(u) => updateOrder(o.id, u)} />)}
        </div>
      ) : <Empty icon={<ShoppingBag size={22} />} title={filter === "active" ? "No orders in progress" : "No orders here"}>{query || day || type !== "all" ? "Try clearing the search or filters." : "New orders appear automatically."}</Empty>}

      <Drawer open={!!open} onClose={() => setOpenId(null)} title={open ? `Order ${open.order_number}` : ""} subtitle={open ? new Date(open.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : ""}
        footer={open && <>
          {open.status !== "Cancelled" && open.status !== "Delivered" && <button className="btn btn-ghost danger-text" onClick={() => cancel(open)}><Ban size={15} /> Cancel order</button>}
          <button className="btn btn-ghost" onClick={() => printKitchenTicket(open)}><ChefHat size={15} /> Kitchen ticket</button>
          <button className="btn btn-ghost" onClick={() => printReceipt(open)}><Printer size={15} /> Print bill</button>
          {nextOrderStep(open) && <button className="btn btn-primary" onClick={() => updateOrder(open.id, { status: nextOrderStep(open)!.status })}>{nextOrderStep(open)!.label}</button>}
        </>}>
        {open && <OrderDetail order={open} onUpdate={(u) => updateOrder(open.id, u)} />}
      </Drawer>

      <NewOrder open={creating} onClose={() => setCreating(false)} onCreated={async (order) => {
        setCreating(false);
        toast("ok", `Order ${order.order_number} created`);
        await refresh();
        setFilter("active");
        setOpenId(order.id);
      }} />
    </>
  );
}

function OrderDetail({ order, onUpdate }: { order: Row; onUpdate: (u: Row) => void }) {
  const steps = order.order_type === "Home Delivery"
    ? ["Order Placed", "Order Confirmed", "Preparing", "Out for Delivery", "Delivered"]
    : ["Order Placed", "Order Confirmed", "Preparing", "Ready for Pickup", "Delivered"];
  const at = steps.indexOf(order.status);
  return (
    <div className="detail">
      {order.status === "Cancelled" ? <div className="banner banner-danger">This order was cancelled.</div> : (
        <ol className="steps">{steps.map((s, i) => <li key={s} className={i < at ? "done" : i === at ? "current" : ""}><i />{statusLabel(s)}</li>)}</ol>
      )}

      <section className="detail-block">
        <h3>Customer</h3>
        <p className="detail-strong">{order.customer_name}</p>
        {order.customer_phone ? <div className="contact-row">
          <a className="btn btn-sm btn-ghost" href={`tel:${order.customer_phone}`}><Phone size={14} /> {order.customer_phone}</a>
          <a className="btn btn-sm btn-ghost" href={`https://wa.me/${String(order.customer_phone).replace(/\D/g, "").replace(/^(\d{10})$/, "91$1")}`} target="_blank" rel="noreferrer"><MessageSquare size={14} /> WhatsApp</a>
        </div> : <p className="muted small">No phone number given</p>}
        {isAdminOrder(order) && <p className="muted small">Created in the admin site</p>}
        {order.customer_email && <p className="muted">{order.customer_email}</p>}
      </section>

      <section className="detail-block">
        <h3>{order.order_type}</h3>
        {order.table_number && (() => { const t = tableInfo(order.table_number)!; return <div className="table-callout"><div className="ticket-where is-table"><small>Table</small><strong>{t.number}</strong></div><div><strong>Table {t.number}</strong>{t.area && <small>{t.area}</small>}</div></div>; })()}
        {order.pickup_at && <p>Pickup at {new Date(order.pickup_at).toLocaleTimeString("en-IN", { timeStyle: "short" })}</p>}
        {order.delivery_address && <p><MapPin size={14} style={{ verticalAlign: -2 }} /> {order.delivery_address}{order.delivery_landmark ? `, near ${order.delivery_landmark}` : ""}{order.delivery_postal_code ? ` – ${order.delivery_postal_code}` : ""}</p>}
        {customerNote(order) && <div className="banner">“{customerNote(order)}”</div>}
      </section>

      <section className="detail-block">
        <h3>Items</h3>
        <ul className="line-items">
          {(order.order_items || []).map((i: Row, idx: number) => <li key={idx}><span><b>{i.quantity}×</b> {i.product_name}</span><span>{formatPrice(i.unit_price * i.quantity)}</span></li>)}
        </ul>
        <div className="totals">
          <div><span>Subtotal</span><span>{formatPrice(order.subtotal)}</span></div>
          {Number(order.tax_amount) > 0 && <div><span>Tax</span><span>{formatPrice(order.tax_amount)}</span></div>}
          {Number(order.delivery_charge) > 0 && <div><span>Delivery</span><span>{formatPrice(order.delivery_charge)}</span></div>}
          <div className="grand"><span>Total</span><span>{formatPrice(order.total_amount)}</span></div>
        </div>
      </section>

      <section className="detail-block">
        <h3>Payment · {order.payment_method}</h3>
        <div className="segmented">
          <button className={order.payment_status !== "paid" ? "active" : ""} onClick={() => order.payment_status === "paid" && onUpdate({ payment_status: "unpaid" })}>Not received</button>
          <button className={order.payment_status === "paid" ? "active ok" : ""} onClick={() => order.payment_status !== "paid" && onUpdate({ payment_status: "paid" })}>Received</button>
        </div>
      </section>

      <section className="detail-block">
        <h3>Set status manually</h3>
        <select className="input" value={order.status} onChange={(e) => onUpdate({ status: e.target.value })}>{ORDER_STATUSES.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}</select>
        {order.whatsapp_updates && <p className="muted small">The customer gets a WhatsApp message when the status changes.</p>}
      </section>
    </div>
  );
}

const TYPE_ICON: Record<string, typeof Utensils> = { "Dine In": Utensils, Takeaway: ShoppingBag, "Home Delivery": Bike };

function OrderTicket({ order: o, onOpen, onUpdate }: { order: Row; onOpen: () => void; onUpdate: (u: Row) => void }) {
  const next = nextOrderStep(o);
  const table = o.order_type === "Dine In" ? tableInfo(o.table_number) : null;
  const Icon = TYPE_ICON[o.order_type] || ShoppingBag;
  const items: Row[] = o.order_items || [];
  const note = customerNote(o);
  const count = items.reduce((s, i) => s + Number(i.quantity), 0);
  return (
    <article className={`ticket tone-${statusTone(o.status)}`}>
      <header className="ticket-head">
        <div className={`ticket-where ${table ? "is-table" : ""}`}>
          {table ? <><small>Table</small><strong>{table.number}</strong></> : <Icon size={22} />}
        </div>
        <div className="ticket-title">
          <div className="ticket-row"><strong>{o.order_number}</strong><Pill status={o.status} /></div>
          <div className="ticket-sub">
            <span><Icon size={13} /> {o.order_type === "Home Delivery" ? "Delivery" : o.order_type}</span>
            {table?.area && <span>{table.area}</span>}
            <span><Clock size={13} /> {new Date(o.created_at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })} · {timeAgo(o.created_at)}</span>
          </div>
        </div>
      </header>

      <button className="ticket-body" onClick={onOpen} aria-label={`Open ${o.order_number}`}>
        <ul className="ticket-items">
          {items.map((i, idx) => (
            <li key={idx}><b>{i.quantity}×</b><span>{i.product_name}{i.special_instructions && <small>{i.special_instructions}</small>}</span><em>{formatPrice(Number(i.unit_price) * Number(i.quantity))}</em></li>
          ))}
        </ul>
        {note && <div className="ticket-note"><MessageSquare size={13} /> {note}</div>}
        {o.order_type === "Home Delivery" && o.delivery_address && <div className="ticket-note address"><MapPin size={13} /> {o.delivery_address}</div>}
        <div className="ticket-customer">
          <span><User size={13} /> {o.customer_name}</span>
          {o.customer_phone && <span><Phone size={13} /> {o.customer_phone}</span>}
        </div>
      </button>

      <footer className="ticket-foot">
        <div className="ticket-total">
          <strong>{formatPrice(o.total_amount)}</strong>
          <span>{count} item{count === 1 ? "" : "s"} · {o.payment_method}</span>
        </div>
        <button className={`paid-chip ${o.payment_status === "paid" ? "is-paid" : ""}`} onClick={() => onUpdate({ payment_status: o.payment_status === "paid" ? "unpaid" : "paid" })} title="Tap to change">
          {o.payment_status === "paid" ? <><Check size={13} /> Paid</> : "Not paid"}
        </button>
      </footer>
      <div className="ticket-actions">
        <button className="icon-btn" onClick={() => printKitchenTicket(o)} aria-label="Print kitchen ticket" title="Kitchen ticket"><ChefHat size={16} /></button>
        <button className="icon-btn" onClick={() => printReceipt(o)} aria-label="Print bill" title="Print bill"><Printer size={16} /></button>
        <button className="btn btn-ghost btn-sm" onClick={onOpen}>Details</button>
        {next ? <button className="btn btn-primary btn-sm grow" onClick={() => onUpdate({ status: next.status })}>{next.label}</button> : <span className="grow" />}
      </div>
    </article>
  );
}
