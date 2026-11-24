"use client";

import { ArrowRight, CalendarDays, Clock, Coffee, IndianRupee, ShoppingBag, Sparkles, Wallet } from "lucide-react";
import type { Live } from "./admin-app";
import { ACTIVE_ORDER, formatPrice, localDay, nextOrderStep, shortTime, tableText, timeAgo, type Row } from "./lib";
import { Empty, Pill, Skeleton } from "./ui";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export function Overview({ live, adminName }: { live: Live; adminName: string }) {
  const { orders, reservations, loaded, go, updateOrder, updateReservation } = live;
  const today = localDay(new Date());
  const todays = orders.filter((o) => localDay(o.created_at) === today && o.status !== "Cancelled");
  const revenue = todays.filter((o) => o.payment_status === "paid").reduce((s, o) => s + Number(o.total_amount), 0);
  const expected = todays.reduce((s, o) => s + Number(o.total_amount), 0);
  const active = orders.filter(ACTIVE_ORDER).sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));
  const unpaid = orders.filter((o) => o.status === "Delivered" && o.payment_status !== "paid");
  const bookingsToday = reservations.filter((r) => r.reservation_date === today && ["Pending", "Confirmed"].includes(r.status));
  const pendingBookings = reservations.filter((r) => r.status === "Pending" && r.reservation_date >= today);

  const counts = new Map<string, number>();
  for (const o of todays) for (const item of o.order_items || []) counts.set(item.product_name, (counts.get(item.product_name) || 0) + Number(item.quantity));
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const bestMax = best[0]?.[1] || 1;

  const dateLine = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });

  return (
    <>
      <section className="hero-card">
        <div>
          <span className="eyebrow">{dateLine}</span>
          <h1>{greeting()}, {adminName.split(/[ @]/)[0]}.</h1>
          <p>{!loaded ? "Getting today’s numbers…" : active.length ? `You have ${active.length} order${active.length > 1 ? "s" : ""} in progress${pendingBookings.length ? ` and ${pendingBookings.length} booking request${pendingBookings.length > 1 ? "s" : ""} to answer` : ""}.` : pendingBookings.length ? `No orders waiting. ${pendingBookings.length} booking request${pendingBookings.length > 1 ? "s" : ""} to answer.` : "All caught up. New orders appear here automatically."}</p>
        </div>
        <div className="hero-actions">
          <button className="btn btn-light" onClick={() => go("orders")}>Open orders <ArrowRight size={15} /></button>
          <button className="btn btn-outline-light" onClick={() => go("menu")}>Update menu</button>
        </div>
      </section>

      <div className="kpis">
        <Kpi icon={<IndianRupee size={18} />} label="Received today" value={formatPrice(revenue)} note={expected > revenue ? `${formatPrice(expected - revenue)} still to collect` : "All payments in"} />
        <Kpi icon={<ShoppingBag size={18} />} label="Orders today" value={String(todays.length)} note={`${todays.filter((o) => o.status === "Delivered").length} completed`} />
        <Kpi icon={<Clock size={18} />} label="In progress" value={String(active.length)} note={`${orders.filter((o) => o.status === "Order Placed").length} waiting to be accepted`} tone={active.length ? "warm" : undefined} />
        <Kpi icon={<CalendarDays size={18} />} label="Bookings today" value={String(bookingsToday.length)} note={`${pendingBookings.length} request${pendingBookings.length === 1 ? "" : "s"} pending`} />
      </div>

      <div className="grid-2">
        <section className="card">
          <header className="card-head"><div><h2>Needs your attention</h2><p>Oldest first. Tap the button to move an order to its next step.</p></div><button className="link" onClick={() => go("orders")}>All orders <ArrowRight size={14} /></button></header>
          {!loaded ? <Skeleton rows={3} /> : active.length ? (
            <ul className="queue">
              {active.slice(0, 6).map((o) => <QueueItem key={o.id} order={o} onAdvance={(status) => updateOrder(o.id, { status })} />)}
            </ul>
          ) : <Empty icon={<Sparkles size={22} />} title="No orders waiting">New orders will pop up here with a sound.</Empty>}
        </section>

        <div className="stack">
          {pendingBookings.length > 0 && (
            <section className="card">
              <header className="card-head"><div><h2>Booking requests</h2><p>Guests are waiting for your answer.</p></div><button className="link" onClick={() => go("reservations")}>All <ArrowRight size={14} /></button></header>
              <ul className="mini-list">
                {pendingBookings.slice(0, 4).map((r) => (
                  <li key={r.id}>
                    <div><strong>{r.customer_name} · {r.guests} guest{r.guests > 1 ? "s" : ""}</strong><small>{new Date(r.reservation_date + "T00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })} at {shortTime(r.start_time)}</small></div>
                    <div className="row-actions"><button className="btn btn-sm btn-ghost" onClick={() => updateReservation(r.id, "Rejected")}>Decline</button><button className="btn btn-sm btn-primary" onClick={() => updateReservation(r.id, "Confirmed")}>Confirm</button></div>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section className="card">
            <header className="card-head"><div><h2>Today’s best sellers</h2><p>From today’s orders.</p></div></header>
            {best.length ? (
              <ul className="bars">
                {best.map(([name, qty]) => <li key={name}><span>{name}</span><div className="bar"><i style={{ width: `${(qty / bestMax) * 100}%` }} /></div><b>{qty}</b></li>)}
              </ul>
            ) : <Empty icon={<Coffee size={22} />} title="Nothing sold yet today" />}
          </section>
          {unpaid.length > 0 && (
            <section className="card card-warn">
              <header className="card-head"><div><h2><Wallet size={16} /> {unpaid.length} completed order{unpaid.length > 1 ? "s" : ""} not marked paid</h2><p>Mark payment received so revenue stays accurate.</p></div><button className="link" onClick={() => go("orders")}>Review <ArrowRight size={14} /></button></header>
            </section>
          )}
        </div>
      </div>
    </>
  );
}

function Kpi({ icon, label, value, note, tone }: { icon: React.ReactNode; label: string; value: string; note: string; tone?: "warm" }) {
  return <article className={`kpi ${tone ? `kpi-${tone}` : ""}`}><div className="kpi-icon">{icon}</div><span>{label}</span><strong>{value}</strong><small>{note}</small></article>;
}

function QueueItem({ order, onAdvance }: { order: Row; onAdvance: (status: string) => void }) {
  const next = nextOrderStep(order);
  const items = (order.order_items || []).map((i: Row) => `${i.quantity}× ${i.product_name}`).join(", ");
  return (
    <li className="queue-item">
      <div className="queue-main">
        <div className="queue-top"><strong>{order.order_number}</strong><Pill status={order.status} /><span className="muted">{timeAgo(order.created_at)}</span></div>
        <div className="queue-sub">{order.customer_name} · {order.order_type}{order.table_number ? ` · ${tableText(order.table_number)}` : ""} · <b>{formatPrice(order.total_amount)}</b></div>
        <div className="queue-items">{items}</div>
      </div>
      {next && <button className="btn btn-primary btn-sm" onClick={() => onAdvance(next.status)}>{next.label}</button>}
    </li>
  );
}
