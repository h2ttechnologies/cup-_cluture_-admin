"use client";

import { useCallback, useEffect, useState } from "react";
import { Armchair, Clock, Plus, Trash2 } from "lucide-react";
import { DAY_NAMES, api, shortTime, type Row } from "./lib";
import { Empty, PageHead, Skeleton, Switch, useConfirm, useToast } from "./ui";

const WEEK = [1, 2, 3, 4, 5, 6, 0];

export function TablesSection() {
  const toast = useToast();
  const confirm = useConfirm();
  const [tables, setTables] = useState<Row[] | null>(null);
  const [slots, setSlots] = useState<Row[] | null>(null);
  const [tableNumber, setTableNumber] = useState("");
  const [seats, setSeats] = useState(2);
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [start, setStart] = useState("12:00");
  const [end, setEnd] = useState("13:30");
  const [capacity, setCapacity] = useState(12);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [t, s] = await Promise.all([api<{ tables: Row[] }>("GET", "?resource=tables"), api<{ slots: Row[] }>("GET", "?resource=slots")]);
      setTables(t.tables || []); setSlots(s.slots || []);
    } catch (e) { toast("error", e instanceof Error ? e.message : "Could not load tables."); setTables([]); setSlots([]); }
  }, [toast]);
  useEffect(() => { void load(); }, [load]);

  async function patch(resource: "tables" | "slots", id: string, updates: Row, done: string) {
    const setter = resource === "tables" ? setTables : setSlots;
    setter((list) => list!.map((x) => (x.id === id ? { ...x, ...updates } : x)));
    try { await api("PATCH", "", { resource, id, ...updates }); toast("ok", done); } catch (e) { toast("error", e instanceof Error ? e.message : "Could not save."); await load(); }
  }

  async function remove(resource: "tables" | "slots", row: Row, label: string) {
    if (!(await confirm(`Remove ${label}?`, resource === "tables" ? "Guests won’t be able to choose it any more." : "Guests won’t be able to book this time any more.", "Remove", true))) return;
    try { await api("DELETE", `?resource=${resource}&id=${encodeURIComponent(row.id)}`); toast("ok", `${label} removed`); await load(); } catch (e) { toast("error", e instanceof Error ? e.message : "Could not remove."); }
  }

  async function addTable(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    try { await api("POST", "", { resource: "tables", table_number: tableNumber.trim(), capacity: seats }); toast("ok", `Table ${tableNumber} saved`); setTableNumber(""); await load(); }
    catch (err) { toast("error", err instanceof Error ? err.message : "Could not save table."); } finally { setBusy(false); }
  }

  async function addSlots(e: React.FormEvent) {
    e.preventDefault();
    if (!days.length) return toast("error", "Pick at least one day.");
    if (end <= start) return toast("error", "The end time must be after the start time.");
    setBusy(true);
    try {
      for (const weekday of days) await api("POST", "", { resource: "slots", weekday, start_time: start, end_time: end, capacity });
      toast("ok", `Time added to ${days.length} day${days.length > 1 ? "s" : ""}`); await load();
    } catch (err) { toast("error", err instanceof Error ? err.message : "Could not save time."); } finally { setBusy(false); }
  }

  return (
    <>
      <PageHead title="Tables & hours" subtitle="Set up your tables and the times guests can book." />
      <div className="grid-2 grid-wide-right">
        <section className="card">
          <header className="card-head"><div><h2><Armchair size={17} /> Tables</h2><p>Used for dine-in orders and bookings.</p></div></header>
          <form className="inline-form" onSubmit={addTable}>
            <label className="field"><span>Table name or no.</span><input className="input" value={tableNumber} onChange={(e) => setTableNumber(e.target.value)} placeholder="e.g. 4 or Window" required /></label>
            <label className="field narrow"><span>Seats</span><input className="input" type="number" min={1} value={seats} onChange={(e) => setSeats(Number(e.target.value))} /></label>
            <button className="btn btn-primary" disabled={busy}><Plus size={15} /> Add</button>
          </form>
          {!tables ? <Skeleton rows={3} /> : tables.length ? (
            <ul className="settings-list">
              {tables.map((t) => (
                <li key={t.id}>
                  <div className="table-badge">{t.table_number}</div>
                  <div className="grow"><strong>Table {t.table_number}</strong><small>{t.capacity} seats</small></div>
                  <label className="switch-label small"><Switch checked={t.is_available} onChange={(v) => patch("tables", t.id, { is_available: v }, v ? `Table ${t.table_number} open` : `Table ${t.table_number} closed`)} label={`Table ${t.table_number} available`} />{t.is_available ? "Open" : "Closed"}</label>
                  <button className="icon-btn" onClick={() => remove("tables", t, `Table ${t.table_number}`)} aria-label={`Remove table ${t.table_number}`}><Trash2 size={15} /></button>
                </li>
              ))}
            </ul>
          ) : <Empty icon={<Armchair size={22} />} title="No tables yet">Add your first table above.</Empty>}
        </section>

        <section className="card">
          <header className="card-head"><div><h2><Clock size={17} /> Booking times</h2><p>Seats = total guests you can take in that time.</p></div></header>
          <form className="slot-form" onSubmit={addSlots}>
            <div className="day-picker" role="group" aria-label="Days">
              {WEEK.map((d) => <button type="button" key={d} className={days.includes(d) ? "on" : ""} aria-pressed={days.includes(d)} onClick={() => setDays((list) => list.includes(d) ? list.filter((x) => x !== d) : [...list, d])}>{DAY_NAMES[d].slice(0, 3)}</button>)}
              <button type="button" className="link" onClick={() => setDays(days.length === 7 ? [] : [...WEEK])}>{days.length === 7 ? "None" : "Every day"}</button>
            </div>
            <div className="inline-form">
              <label className="field"><span>From</span><input className="input" type="time" value={start} onChange={(e) => setStart(e.target.value)} /></label>
              <label className="field"><span>To</span><input className="input" type="time" value={end} onChange={(e) => setEnd(e.target.value)} /></label>
              <label className="field narrow"><span>Seats</span><input className="input" type="number" min={0} value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} /></label>
              <button className="btn btn-primary" disabled={busy}><Plus size={15} /> Add time</button>
            </div>
          </form>
          {!slots ? <Skeleton rows={4} /> : slots.length ? (
            <div className="week">
              {WEEK.map((d) => {
                const list = slots.filter((s) => s.weekday === d);
                return (
                  <div key={d} className="week-day">
                    <span className="week-name">{DAY_NAMES[d].slice(0, 3)}</span>
                    <div className="week-slots">
                      {list.length ? list.map((s) => (
                        <div key={s.id} className={`slot ${s.is_open ? "" : "closed"}`}>
                          <button className="slot-toggle" onClick={() => patch("slots", s.id, { is_open: !s.is_open }, s.is_open ? "Time closed" : "Time opened")} title={s.is_open ? "Click to close this time" : "Click to open this time"}>
                            {shortTime(s.start_time)}–{shortTime(s.end_time)}<small>{s.is_open ? `${s.capacity} seats` : "Closed"}</small>
                          </button>
                          <button className="slot-x" onClick={() => remove("slots", s, `${DAY_NAMES[d]} ${shortTime(s.start_time)}`)} aria-label="Remove time"><Trash2 size={12} /></button>
                        </div>
                      )) : <span className="muted small">No booking times</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : <Empty icon={<Clock size={22} />} title="No booking times yet">Pick days and a time above.</Empty>}
        </section>
      </div>
    </>
  );
}
