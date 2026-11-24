"use client";

import { useMemo, useState } from "react";
import { CalendarClock, CheckCircle2 } from "lucide-react";
import type { Row } from "../lib";
import { Chips, Empty, PageHead, Skeleton } from "../ui";
import { AdjustDrawer, SetupNotice, daysUntil, expiryText, fmtQty, useStock, type StockItem } from "./shared";

type Window = "3" | "7" | "30";

export function ExpiryPage() {
  const { items, loaded, setup, reload } = useStock();
  const [win, setWin] = useState<Window>("7");
  const [discard, setDiscard] = useState<{ item: StockItem; batch: Row } | null>(null);

  const batches = useMemo(() => items.flatMap((i) => i.batches.filter((b) => b.expiry_date).map((b) => ({ item: i, batch: b, days: daysUntil(b.expiry_date) }))).sort((a, b) => a.days - b.days), [items]);
  const expired = batches.filter((b) => b.days < 0);
  const soon = batches.filter((b) => b.days >= 0 && b.days <= Number(win));
  const untracked = items.filter((i) => i.is_active && i.track_expiry && i.qty > 0 && i.batches.some((b) => !b.expiry_date));

  if (setup) return <><PageHead title="Expiry alerts" /><SetupNotice /></>;

  const Card = ({ x }: { x: (typeof batches)[number] }) => (
    <article className={`expiry ${x.days < 0 ? "is-expired" : x.days <= 1 ? "is-urgent" : x.days <= 3 ? "is-soon" : ""}`}>
      <div className="expiry-days"><strong>{x.days < 0 ? "!" : x.days}</strong><span>{x.days < 0 ? "expired" : x.days === 1 ? "day" : "days"}</span></div>
      <div className="grow">
        <strong>{x.item.name}</strong>
        <small>{fmtQty(Number(x.batch.quantity), x.item.unit)} · {expiryText(x.batch.expiry_date)} ({new Date(x.batch.expiry_date + "T00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" })})</small>
        <small>Received {new Date(x.batch.received_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}{x.item.brandName ? ` · ${x.item.brandName}` : ""}</small>
      </div>
      <button className={`btn btn-sm ${x.days < 0 ? "btn-danger" : "btn-ghost"}`} onClick={() => setDiscard({ item: x.item, batch: x.batch })}>Remove</button>
    </article>
  );

  return (
    <>
      <PageHead title="Expiry alerts" subtitle="Use these first, or remove them from stock once thrown away." />
      <div className="toolbar"><Chips value={win} onChange={setWin} options={[{ id: "3", label: "Next 3 days" }, { id: "7", label: "Next 7 days" }, { id: "30", label: "Next 30 days" }]} /></div>

      {!loaded ? <Skeleton rows={3} /> : <>
        {expired.length > 0 && <section className="card"><header className="card-head"><div><h2 className="danger-text">Expired · {expired.length}</h2><p>Throw these away and remove them so stock stays correct.</p></div></header><div className="expiry-list">{expired.map((x) => <Card key={x.batch.id} x={x} />)}</div></section>}
        <section className="card">
          <header className="card-head"><div><h2>Expiring in the next {win} days · {soon.length}</h2><p>Oldest first. Use these before newer stock.</p></div></header>
          {soon.length ? <div className="expiry-list">{soon.map((x) => <Card key={x.batch.id} x={x} />)}</div> : <Empty icon={<CheckCircle2 size={22} />} title="Nothing expiring soon" />}
        </section>
        {untracked.length > 0 && <section className="card card-warn compact"><CalendarClock size={16} /> {untracked.length} item{untracked.length > 1 ? "s have" : " has"} stock with no expiry date: {untracked.slice(0, 5).map((i) => i.name).join(", ")}{untracked.length > 5 ? "…" : ""}. Add the expiry date when you next add stock.</section>}
      </>}

      <AdjustDrawer open={!!discard} item={discard?.item} batch={discard?.batch} items={items} mode="remove" onClose={() => setDiscard(null)} onDone={reload} />
    </>
  );
}
