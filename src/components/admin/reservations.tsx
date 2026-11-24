"use client";

import { useMemo, useState } from "react";
import { CalendarDays, MessageSquare, Phone, Search, Users } from "lucide-react";
import type { Live } from "./admin-app";
import { RESERVATION_STATUSES, localDay, shortTime, type Row } from "./lib";
import { Chips, Empty, PageHead, Pill, Skeleton } from "./ui";

type Filter = "requests" | "today" | "upcoming" | "past" | "all";

export function Reservations({ live }: { live: Live }) {
  const { reservations, loaded, updateReservation, go } = live;
  const today = localDay(new Date());
  const [filter, setFilter] = useState<Filter>("requests");
  const [query, setQuery] = useState("");

  const tests: Record<Filter, (r: Row) => boolean> = {
    requests: (r) => r.status === "Pending" && r.reservation_date >= today,
    today: (r) => r.reservation_date === today && !["Rejected", "Cancelled"].includes(r.status),
    upcoming: (r) => r.reservation_date >= today && ["Pending", "Confirmed"].includes(r.status),
    past: (r) => r.reservation_date < today || ["Completed", "Rejected", "Cancelled"].includes(r.status),
    all: () => true,
  };

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = reservations.filter(tests[filter]).filter((r) => !q || `${r.reservation_number} ${r.customer_name} ${r.customer_phone}`.toLowerCase().includes(q));
    list.sort((a, b) => (filter === "past" ? -1 : 1) * (`${a.reservation_date} ${a.start_time}`.localeCompare(`${b.reservation_date} ${b.start_time}`)));
    const map = new Map<string, Row[]>();
    for (const r of list) map.set(r.reservation_date, [...(map.get(r.reservation_date) || []), r]);
    return [...map.entries()];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reservations, filter, query, today]);

  const dayLabel = (d: string) => {
    if (d === today) return "Today";
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    if (d === localDay(tomorrow)) return "Tomorrow";
    return new Date(d + "T00:00").toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });
  };

  return (
    <>
      <PageHead title="Reservations" subtitle="Confirm or decline table requests. Guests see the update in their account."
        actions={<button className="btn btn-ghost" onClick={() => go("tables")}>Tables & opening hours</button>} />
      <div className="toolbar">
        <Chips value={filter} onChange={setFilter} options={[
          { id: "requests", label: "Requests", count: reservations.filter(tests.requests).length },
          { id: "today", label: "Today", count: reservations.filter(tests.today).length },
          { id: "upcoming", label: "Upcoming", count: reservations.filter(tests.upcoming).length },
          { id: "past", label: "Past" },
          { id: "all", label: "All" },
        ]} />
        <div className="toolbar-right"><label className="search"><Search size={15} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Booking no., name or phone" /></label></div>
      </div>

      {!loaded ? <Skeleton rows={3} /> : groups.length ? groups.map(([date, list]) => (
        <section key={date} className="day-group">
          <h2 className="day-title">{dayLabel(date)}<span>{list.reduce((s, r) => s + Number(r.guests), 0)} guests</span></h2>
          <div className="booking-list">
            {list.map((r) => (
              <article key={r.id} className={`booking ${r.status === "Pending" ? "is-new" : ""}`}>
                <div className="booking-time"><strong>{shortTime(r.start_time)}</strong><span><Users size={13} /> {r.guests}</span></div>
                <div className="booking-main">
                  <div className="booking-top"><strong>{r.customer_name}</strong><Pill status={r.status} /></div>
                  <div className="muted small">{r.reservation_number}</div>
                  {r.special_requests && <div className="booking-note">“{r.special_requests}”</div>}
                  <div className="contact-row">
                    <a className="link" href={`tel:${r.customer_phone}`}><Phone size={13} /> {r.customer_phone}</a>
                    <a className="link" href={`https://wa.me/${String(r.customer_phone).replace(/\D/g, "").replace(/^(\d{10})$/, "91$1")}`} target="_blank" rel="noreferrer"><MessageSquare size={13} /> WhatsApp</a>
                  </div>
                </div>
                <div className="booking-actions">
                  {r.status === "Pending" ? <>
                    <button className="btn btn-sm btn-ghost" onClick={() => updateReservation(r.id, "Rejected")}>Decline</button>
                    <button className="btn btn-sm btn-primary" onClick={() => updateReservation(r.id, "Confirmed")}>Confirm</button>
                  </> : r.status === "Confirmed" ? <>
                    <button className="btn btn-sm btn-ghost" onClick={() => updateReservation(r.id, "Cancelled")}>Cancel</button>
                    <button className="btn btn-sm btn-primary" onClick={() => updateReservation(r.id, "Completed")}>Guests arrived</button>
                  </> : (
                    <select className="input input-sm" value={r.status} onChange={(e) => updateReservation(r.id, e.target.value)} aria-label="Change status">{RESERVATION_STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      )) : <Empty icon={<CalendarDays size={22} />} title={filter === "requests" ? "No booking requests" : "No bookings here"}>{filter === "requests" ? "You’re all caught up." : "Try another tab."}</Empty>}
    </>
  );
}
