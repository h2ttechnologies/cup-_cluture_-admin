"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BarChart3, CalendarDays, Coffee, ExternalLink, LayoutDashboard, LogOut, Menu as MenuIcon, Settings2, ShoppingBag, Armchair, X, Bell, BellOff, Printer, UserCog, Boxes, History, CalendarClock, Package, Tags, Factory } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { ACTIVE_ORDER, api, formatPrice, isAdminOrder, tableText, type Row } from "./lib";
import { audioReady, chime, startAlarm, stopAlarm, unlockAudio } from "./alarm";
import { ConfirmProvider, ToastProvider, useToast } from "./ui";
import { printReceipt } from "./print";
import { Overview } from "./overview";
import { Orders } from "./orders";
import { MenuSection } from "./menu";
import { Reservations } from "./reservations";
import { TablesSection } from "./tables";
import { SettingsSection } from "./settings";
import { Reports } from "./reports";
import { TeamSection } from "./team";
import { StockPage } from "./kitchen/stock";
import { AdjustmentsPage } from "./kitchen/adjustments";
import { ExpiryPage } from "./kitchen/expiry";
import { ItemsPage } from "./kitchen/items";
import { NamedListPage } from "./kitchen/lists";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://cupculture.in";

export type Section = "overview" | "orders" | "menu" | "reservations" | "tables" | "settings" | "reports" | "team" | "stock" | "adjustments" | "expiry" | "items" | "inv-categories" | "brands";
const NAV: Array<{ id: Section; label: string; icon: typeof LayoutDashboard; group: string }> = [
  { id: "overview", label: "Overview", icon: LayoutDashboard, group: "Today" },
  { id: "orders", label: "Orders", icon: ShoppingBag, group: "Today" },
  { id: "reservations", label: "Reservations", icon: CalendarDays, group: "Today" },
  { id: "menu", label: "Menu items", icon: Coffee, group: "Manage" },
  { id: "tables", label: "Tables & hours", icon: Armchair, group: "Manage" },
  { id: "reports", label: "Reports", icon: BarChart3, group: "Manage" },
  { id: "settings", label: "Café settings", icon: Settings2, group: "Manage" },
  { id: "team", label: "Team logins", icon: UserCog, group: "Manage" },
  { id: "stock", label: "Stock", icon: Boxes, group: "Kitchen stock" },
  { id: "adjustments", label: "Stock adjustments", icon: History, group: "Kitchen stock" },
  { id: "expiry", label: "Expiry alerts", icon: CalendarClock, group: "Kitchen stock" },
  { id: "items", label: "Items", icon: Package, group: "Kitchen stock" },
  { id: "inv-categories", label: "Categories", icon: Tags, group: "Kitchen stock" },
  { id: "brands", label: "Brands", icon: Factory, group: "Kitchen stock" },
];

export type Live = {
  orders: Row[];
  reservations: Row[];
  loaded: boolean;
  refresh: () => Promise<void>;
  updateOrder: (id: string, updates: Row) => Promise<void>;
  updateReservation: (id: string, status: string) => Promise<void>;
  go: (section: Section) => void;
};

function Shell({ adminName, email }: { adminName: string; email: string }) {
  const toast = useToast();
  const [section, setSection] = useState<Section>("overview");
  const [navOpen, setNavOpen] = useState(false);
  const [orders, setOrders] = useState<Row[]>([]);
  const [reservations, setReservations] = useState<Row[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [sound, setSound] = useState(true);
  const seen = useRef<Set<string> | null>(null);
  const soundRef = useRef(sound);
  soundRef.current = sound;
  // New-order alarm: ids of orders being announced, whether the ring is playing, and whether sound is unlocked.
  const [alarm, setAlarm] = useState<string[] | null>(null);
  const [ringing, setRinging] = useState(false);
  const [soundReady, setSoundReady] = useState(false);
  useEffect(() => {
    const unlock = () => { if (unlockAudio()) setSoundReady(true); else window.setTimeout(() => setSoundReady(audioReady()), 200); };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => { window.removeEventListener("pointerdown", unlock); window.removeEventListener("keydown", unlock); stopAlarm(); };
  }, []);
  const silence = useCallback(() => { stopAlarm(); setRinging(false); }, []);
  const dismissAlarm = useCallback(() => { stopAlarm(); setRinging(false); setAlarm(null); }, []);
  // Print the bill when an order is completed. Saved per device, since printers belong to a device.
  const [autoPrint, setAutoPrint] = useState(true);
  const autoPrintRef = useRef(autoPrint);
  autoPrintRef.current = autoPrint;
  useEffect(() => { try { setAutoPrint(localStorage.getItem("cc-admin-autoprint") !== "off"); } catch {} }, []);
  function toggleAutoPrint() { const next = !autoPrint; setAutoPrint(next); try { localStorage.setItem("cc-admin-autoprint", next ? "on" : "off"); } catch {} toast("info", next ? "Bills will print when an order is completed" : "Bills won’t print automatically"); }

  // Section lives in the URL hash so refresh and the back button keep your place.
  useEffect(() => {
    const read = () => { const h = window.location.hash.slice(1) as Section; if (NAV.some((n) => n.id === h)) setSection(h); };
    read(); window.addEventListener("hashchange", read);
    try { setSound(localStorage.getItem("cc-admin-sound") !== "off"); } catch {}
    return () => window.removeEventListener("hashchange", read);
  }, []);
  const go = useCallback((next: Section) => { setSection(next); setNavOpen(false); window.history.pushState(null, "", `#${next}`); window.scrollTo({ top: 0 }); }, []);

  const refresh = useCallback(async () => {
    try {
      const [o, r] = await Promise.all([api<{ orders: Row[] }>("GET", "?resource=orders"), api<{ reservations: Row[] }>("GET", "?resource=reservations")]);
      const list = o.orders || [];
      if (seen.current) {
        const fresh = list.filter((x) => !seen.current!.has(x.id) && !isAdminOrder(x));
        if (fresh.length) {
          // New website order: big alert on screen and a loud ring for 1 minute (until someone stops it).
          setAlarm((current) => [...(current || []), ...fresh.map((x) => x.id)]);
          if (soundRef.current) { startAlarm(60, () => setRinging(false)); setRinging(true); }
        }
      }
      seen.current = new Set(list.map((x) => x.id));
      setOrders(list); setReservations(r.reservations || []); setLoaded(true);
    } catch (e) { if (!seen.current) toast("error", e instanceof Error ? e.message : "Could not load café data."); setLoaded(true); }
  }, [toast]);

  useEffect(() => {
    void refresh();
    // Check every 10 seconds, even when the tab is in the background, so the alarm can ring.
    const timer = window.setInterval(() => void refresh(), 10000);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", onFocus); };
  }, [refresh]);

  const updateOrder = useCallback(async (id: string, updates: Row) => {
    const before = orders;
    const current = orders.find((o) => o.id === id);
    // Completing an order prints its bill once the change is saved.
    const printing = Boolean(autoPrintRef.current && updates.status === "Delivered" && current && current.status !== "Delivered");
    setOrders((list) => list.map((o) => (o.id === id ? { ...o, ...updates } : o)));
    try {
      await api("PATCH", "", { resource: "orders", id, ...updates });
      toast("ok", updates.status ? `Order moved to “${updates.status === "Delivered" ? "Completed" : updates.status}”${printing ? " · printing bill" : ""}` : updates.payment_status === "paid" ? "Payment marked as received" : "Payment marked as not received");
      if (printing && current) printReceipt({ ...current, ...updates });
    }
    catch (e) { setOrders(before); toast("error", e instanceof Error ? e.message : "Could not update the order."); }
  }, [orders, toast]);

  const updateReservation = useCallback(async (id: string, status: string) => {
    const before = reservations;
    setReservations((list) => list.map((r) => (r.id === id ? { ...r, status } : r)));
    try { await api("PATCH", "", { resource: "reservations", id, status }); toast("ok", `Booking ${status.toLowerCase()}`); }
    catch (e) { setReservations(before); toast("error", e instanceof Error ? e.message : "Could not update the booking."); }
  }, [reservations, toast]);

  const newOrders = orders.filter((o) => o.status === "Order Placed").length;
  const activeOrders = orders.filter(ACTIVE_ORDER).length;
  const pendingBookings = reservations.filter((r) => r.status === "Pending").length;

  useEffect(() => { document.title = newOrders ? `(${newOrders}) New orders · Cup Culture Admin` : "Cup Culture Admin"; }, [newOrders]);

  const [kitchen, setKitchen] = useState<{ low: number; expiring: number }>({ low: 0, expiring: 0 });
  useEffect(() => {
    const check = () => fetch("/api/admin/inventory?resource=summary", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j) => j && setKitchen({ low: j.low || 0, expiring: j.expiring || 0 })).catch(() => {});
    check(); const t = window.setInterval(check, 60000); return () => window.clearInterval(t);
  }, [section]);
  const badges: Partial<Record<Section, number>> = { orders: activeOrders, reservations: pendingBookings, stock: kitchen.low, expiry: kitchen.expiring };
  const live: Live = { orders, reservations, loaded, refresh, updateOrder, updateReservation, go };

  async function signOut() { try { await createClient().auth.signOut(); } finally { window.location.href = "/login"; } }
  function toggleSound() { const next = !sound; setSound(next); try { localStorage.setItem("cc-admin-sound", next ? "on" : "off"); } catch {} if (next) { unlockAudio(); chime(); } else silence(); }

  // Orders being announced. Once none of them is still waiting ("Order Placed"), the alarm stops by itself.
  const alarmOrders = (alarm || []).map((id) => orders.find((o) => o.id === id)).filter((o): o is Row => !!o && o.status === "Order Placed");
  useEffect(() => { if (alarm && loaded && alarmOrders.length === 0) dismissAlarm(); }, [alarm, alarmOrders.length, loaded, dismissAlarm]);
  async function acceptAll() { silence(); for (const o of alarmOrders) await updateOrder(o.id, { status: "Order Confirmed" }); setAlarm(null); }

  const groups = [...new Set(NAV.map((n) => n.group))];
  const current = NAV.find((n) => n.id === section)!;

  return (
    <div className="app">
      <aside className={`sidebar ${navOpen ? "open" : ""}`}>
        <div className="sidebar-brand">
          <div className="mark">CC</div>
          <div><strong>Cup Culture</strong><small>Café admin</small></div>
          <button className="icon-btn sidebar-close" onClick={() => setNavOpen(false)} aria-label="Close menu"><X size={18} /></button>
        </div>
        <nav className="sidebar-nav" aria-label="Admin sections">
          {groups.map((group) => (
            <div key={group} className="nav-group">
              <span className="nav-label">{group}</span>
              {NAV.filter((n) => n.group === group).map(({ id, label, icon: Icon }) => (
                <a key={id} href={`#${id}`} className={`nav-item ${section === id ? "active" : ""}`} onClick={(e) => { e.preventDefault(); go(id); }}>
                  <Icon size={18} /><span>{label}</span>
                  {!!badges[id] && <b className={(id === "orders" && newOrders) || id === "expiry" ? "hot" : ""}>{badges[id]}</b>}
                </a>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-foot">
          <a className="nav-item" href={siteUrl} target="_blank" rel="noreferrer"><ExternalLink size={17} /><span>View live site</span></a>
          <div className="me">
            <div className="avatar">{(adminName || "A").trim().charAt(0).toUpperCase()}</div>
            <div className="me-text"><strong>{adminName}</strong><small>{email}</small></div>
            <button className="icon-btn" onClick={signOut} aria-label="Sign out" title="Sign out"><LogOut size={16} /></button>
          </div>
        </div>
      </aside>
      {navOpen && <div className="sidebar-scrim" onClick={() => setNavOpen(false)} />}

      <div className="main">
        <header className="topbar">
          <button className="icon-btn menu-btn" onClick={() => setNavOpen(true)} aria-label="Open menu"><MenuIcon size={20} /></button>
          <span className="topbar-title">{current.label}</span>
          <div className="topbar-right">
            <span className="live-dot" title="Orders refresh automatically every 20 seconds"><i />Live</span>
            <button className={`print-toggle ${autoPrint ? "on" : ""}`} onClick={toggleAutoPrint} aria-pressed={autoPrint} title={autoPrint ? "Bills print when an order is completed. Click to turn off." : "Bills don’t print automatically. Click to turn on."}><Printer size={15} /><span>Auto-print bill</span><i>{autoPrint ? "On" : "Off"}</i></button>
            <button className="icon-btn" onClick={toggleSound} aria-label={sound ? "Mute new-order sound" : "Turn on new-order sound"} title={sound ? "New-order sound on" : "New-order sound off"}>{sound ? <Bell size={17} /> : <BellOff size={17} />}</button>
          </div>
        </header>
        <main className="content">
          {section === "overview" && <Overview live={live} adminName={adminName} />}
          {section === "orders" && <Orders live={live} />}
          {section === "reservations" && <Reservations live={live} />}
          {section === "menu" && <MenuSection />}
          {section === "tables" && <TablesSection />}
          {section === "reports" && <Reports />}
          {section === "team" && <TeamSection />}
          {section === "stock" && <StockPage goItems={() => go("items")} />}
          {section === "adjustments" && <AdjustmentsPage />}
          {section === "expiry" && <ExpiryPage />}
          {section === "items" && <ItemsPage />}
          {section === "inv-categories" && <NamedListPage kind="categories" />}
          {section === "brands" && <NamedListPage kind="brands" />}
          {section === "settings" && <SettingsSection />}
        </main>
      </div>

      {sound && !soundReady && (
        <button className="sound-unlock" onClick={() => { unlockAudio(); chime(); setSoundReady(true); }}>
          <Bell size={16} /> Tap here to turn on new-order sound
        </button>
      )}

      {alarmOrders.length > 0 && (
        <div className="alarm-backdrop" role="alertdialog" aria-modal="true" aria-label="New order">
          <div className={`alarm-card ${ringing ? "is-ringing" : ""}`}>
            <div className="alarm-bell"><Bell size={34} /></div>
            <span className="alarm-kicker">{ringing ? "Ringing · new order" : "New order waiting"}</span>
            <h2>{alarmOrders.length === 1 ? `Order ${alarmOrders[0].order_number}` : `${alarmOrders.length} new orders`}</h2>
            <ul className="alarm-list">
              {alarmOrders.slice(0, 4).map((o) => (
                <li key={o.id}>
                  <div><strong>{o.order_number}</strong> · {o.customer_name}<small>{o.order_type === "Home Delivery" ? "Delivery" : o.order_type}{o.table_number ? ` · ${tableText(o.table_number)}` : ""} · {(o.order_items || []).map((i: Row) => `${i.quantity}× ${i.product_name}`).join(", ")}</small></div>
                  <b>{formatPrice(o.total_amount)}</b>
                </li>
              ))}
            </ul>
            <div className="alarm-actions">
              {ringing && <button className="btn btn-ghost" onClick={silence}><BellOff size={16} /> Stop sound</button>}
              <button className="btn btn-ghost" onClick={() => { dismissAlarm(); go("orders"); }}>View orders</button>
              <button className="btn btn-primary" onClick={acceptAll}>{alarmOrders.length === 1 ? "Accept order" : "Accept all"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function AdminApp(props: { adminName: string; email: string }) {
  return <ToastProvider><ConfirmProvider><Shell {...props} /></ConfirmProvider></ToastProvider>;
}
