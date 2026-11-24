"use client";

import { useMemo, useState } from "react";
import { Boxes, Minus, Plus, Search } from "lucide-react";
import { formatPrice } from "../lib";
import { Chips, Empty, PageHead, Skeleton } from "../ui";
import { AdjustDrawer, SetupNotice, StatusTag, expiryText, daysUntil, fmtQty, useStock, type StockItem } from "./shared";

type Show = "all" | "low" | "out";

export function StockPage({ goItems }: { goItems: () => void }) {
  const { items, loaded, setup, reload, categories } = useStock();
  const [show, setShow] = useState<Show>("all");
  const [cat, setCat] = useState("all");
  const [query, setQuery] = useState("");
  const [adjust, setAdjust] = useState<{ item: StockItem | null; mode: "add" | "remove" | "count" } | null>(null);

  const active = items.filter((i) => i.is_active);
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return active.filter((i) => (show === "all" || i.status === show || (show === "low" && i.status === "out")) && (cat === "all" || i.category_id === cat) && (!q || `${i.name} ${i.brandName}`.toLowerCase().includes(q)))
      .sort((a, b) => ({ out: 0, low: 1, ok: 2 }[a.status] - { out: 0, low: 1, ok: 2 }[b.status]) || a.name.localeCompare(b.name));
  }, [active, show, cat, query]);

  const value = active.reduce((s, i) => s + i.value, 0);
  const low = active.filter((i) => i.status !== "ok").length;
  const out = active.filter((i) => i.status === "out").length;
  const expiring = active.filter((i) => i.nextExpiry && daysUntil(i.nextExpiry) <= 3).length;

  if (setup) return <><PageHead title="Stock" /><SetupNotice /></>;

  return (
    <>
      <PageHead title="Stock" subtitle="What’s in the kitchen right now. Add deliveries, record usage and count the shelves."
        actions={<>
          <button className="btn btn-ghost" onClick={() => setAdjust({ item: null, mode: "remove" })}><Minus size={15} /> Use / remove</button>
          <button className="btn btn-primary" onClick={() => setAdjust({ item: null, mode: "add" })}><Plus size={16} /> Add stock</button>
        </>} />

      <div className="kpis">
        <article className="kpi"><span>Items tracked</span><strong>{active.length}</strong><small>{categories.length} categories</small></article>
        <article className={`kpi ${low ? "kpi-warm" : ""}`}><span>Low or out</span><strong>{low}</strong><small>{out} out of stock</small></article>
        <article className={`kpi ${expiring ? "kpi-warm" : ""}`}><span>Expiring in 3 days</span><strong>{expiring}</strong><small>Items with a batch close to expiry</small></article>
        <article className="kpi"><span>Stock value</span><strong>{formatPrice(value)}</strong><small>At cost price</small></article>
      </div>

      <div className="toolbar">
        <Chips value={show} onChange={setShow} options={[{ id: "all", label: "All", count: active.length }, { id: "low", label: "Low stock", count: low }, { id: "out", label: "Out of stock", count: out }]} />
        <div className="toolbar-right">
          <select className="input input-sm" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category"><option value="all">All categories</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <label className="search"><Search size={15} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find an item or brand" /></label>
        </div>
      </div>

      {!loaded ? <Skeleton rows={4} /> : list.length ? (
        <div className="tile-grid stock-tiles">
          {list.map((i) => (
            <div key={i.id} className={`tile stock-tile st-${i.status}`}>
              <div className="stock-top"><StatusTag status={i.status} /></div>
              <div className="stock-name"><strong>{i.name}</strong><small>{i.categoryName}{i.brandName ? ` · ${i.brandName}` : ""}</small></div>
              <div className="stock-qty"><strong>{Number(i.qty.toFixed(3)).toLocaleString("en-IN")}</strong><span>{i.unit}</span></div>
              <div className="stock-meta">
                <span>Reorder at {fmtQty(Number(i.reorder_level), i.unit)}</span>
                {i.nextExpiry && <span className={daysUntil(i.nextExpiry) <= 3 ? "warn" : ""}>{expiryText(i.nextExpiry)}</span>}
              </div>
              <div className="tile-foot">
                <button className="btn btn-sm btn-ghost" onClick={() => setAdjust({ item: i, mode: "remove" })} aria-label={`Remove ${i.name}`}><Minus size={14} /></button>
                <button className="link" onClick={() => setAdjust({ item: i, mode: "count" })}>Count</button>
                <button className="btn btn-sm btn-primary" onClick={() => setAdjust({ item: i, mode: "add" })} aria-label={`Add ${i.name}`}><Plus size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      ) : <Empty icon={<Boxes size={22} />} title={active.length ? "Nothing matches" : "No stock items yet"}>{active.length ? "Try another filter." : <>Add the things your kitchen keeps, like milk, coffee powder and cups. <button className="link" onClick={goItems}>Add items →</button></>}</Empty>}

      <AdjustDrawer open={!!adjust} item={adjust?.item} items={items} mode={adjust?.mode} onClose={() => setAdjust(null)} onDone={reload} />
    </>
  );
}
