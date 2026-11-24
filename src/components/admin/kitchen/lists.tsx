"use client";

import { useState } from "react";
import { Factory, Pencil, Phone, Plus, Tags, Trash2 } from "lucide-react";
import type { Row } from "../lib";
import { Drawer, Empty, PageHead, Skeleton, useConfirm, useToast } from "../ui";
import { SetupNotice, inv, useStock } from "./shared";

/** Kitchen stock categories and brands share one simple list screen. */
export function NamedListPage({ kind }: { kind: "categories" | "brands" }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { items, loaded, setup, reload, categories, brands } = useStock();
  const [editing, setEditing] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);
  const isBrand = kind === "brands";
  const rows = isBrand ? brands : categories;
  const title = isBrand ? "Brands" : "Categories";
  const Icon = isBrand ? Factory : Tags;
  const countFor = (id: string) => items.filter((i) => (isBrand ? i.brand_id : i.category_id) === id).length;
  const set = (patch: Row) => setEditing((e) => ({ ...e!, ...patch }));

  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    try { await inv("POST", "", { resource: kind, ...editing }); toast("ok", `${editing!.name} saved`); setEditing(null); await reload(); }
    catch (err) { toast("error", err instanceof Error ? err.message : "Could not save."); } finally { setBusy(false); }
  }
  async function remove(r: Row) {
    const n = countFor(r.id);
    if (!(await confirm(`Delete ${r.name}?`, n ? `${n} item${n > 1 ? "s use" : " uses"} it. They’ll stay, just without a ${isBrand ? "brand" : "category"}.` : "Nothing uses it.", "Delete", true))) return;
    try { await inv("DELETE", `?resource=${kind}&id=${r.id}`); toast("ok", `${r.name} deleted`); setEditing(null); await reload(); } catch (err) { toast("error", err instanceof Error ? err.message : "Could not delete."); }
  }

  if (setup) return <><PageHead title={title} /><SetupNotice /></>;

  return (
    <>
      <PageHead title={title} subtitle={isBrand ? "Brands and suppliers you buy kitchen stock from." : "Groups for your kitchen stock, like Dairy or Packaging."}
        actions={<button className="btn btn-primary" onClick={() => setEditing({ name: "", contact_name: "", phone: "", notes: "" })}><Plus size={16} /> Add {isBrand ? "brand" : "category"}</button>} />

      {!loaded ? <Skeleton rows={3} /> : rows.length ? (
        <div className="tile-grid name-tiles">
          {rows.map((r) => (
            <div key={r.id} className="tile name-tile">
              <button className="tile-hit" onClick={() => setEditing({ ...r, contact_name: r.contact_name || "", phone: r.phone || "", notes: r.notes || "" })}>
                <div className="kpi-icon"><Icon size={17} /></div>
                <span className="tile-name">{r.name}</span>
                {isBrand && (r.contact_name || r.phone) && <small className="muted">{r.contact_name}{r.contact_name && r.phone ? " · " : ""}{r.phone}</small>}
                <span className="muted small">{countFor(r.id)} item{countFor(r.id) === 1 ? "" : "s"}</span>
              </button>
              <div className="tile-foot">
                {isBrand && r.phone ? <a className="link" href={`tel:${r.phone}`}><Phone size={13} /> Call</a> : <span />}
                <div><button className="icon-btn" onClick={() => setEditing({ ...r, contact_name: r.contact_name || "", phone: r.phone || "", notes: r.notes || "" })} aria-label={`Edit ${r.name}`}><Pencil size={14} /></button><button className="icon-btn" onClick={() => remove(r)} aria-label={`Delete ${r.name}`}><Trash2 size={14} /></button></div>
              </div>
            </div>
          ))}
        </div>
      ) : <Empty icon={<Icon size={22} />} title={`No ${title.toLowerCase()} yet`} />}

      <Drawer open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? `Edit ${isBrand ? "brand" : "category"}` : `New ${isBrand ? "brand" : "category"}`}
        footer={<><button className="btn btn-ghost" onClick={() => setEditing(null)}>Cancel</button><button type="submit" form="named-form" className="btn btn-primary" disabled={busy}>{busy ? "Saving…" : "Save"}</button></>}>
        {editing && <form id="named-form" className="form" onSubmit={save}>
          <label className="field"><span>Name</span><input className="input" value={editing.name} onChange={(e) => set({ name: e.target.value })} required minLength={2} autoFocus placeholder={isBrand ? "e.g. Aavin" : "e.g. Dairy"} /></label>
          {isBrand && <>
            <div className="field-row">
              <label className="field"><span>Contact person <em>optional</em></span><input className="input" value={editing.contact_name} onChange={(e) => set({ contact_name: e.target.value })} /></label>
              <label className="field"><span>Phone <em>optional</em></span><input className="input" type="tel" value={editing.phone} onChange={(e) => set({ phone: e.target.value })} /></label>
            </div>
            <label className="field"><span>Notes <em>optional</em></span><textarea className="input" rows={2} value={editing.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="e.g. Delivers Mon & Thu" /></label>
          </>}
        </form>}
      </Drawer>
    </>
  );
}
