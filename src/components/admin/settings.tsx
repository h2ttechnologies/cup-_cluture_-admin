"use client";

import { useEffect, useState } from "react";
import { Loader2, Save, Store, Receipt, CalendarDays } from "lucide-react";
import { api, type Row } from "./lib";
import { PageHead, Skeleton, useToast } from "./ui";

type Field = { key: string; label: string; hint?: string; type?: "text" | "number" | "textarea" | "list" | "url" | "tel" | "email"; prefix?: string; suffix?: string; wide?: boolean };

const SECTIONS: Array<{ key: "business" | "checkout" | "reservation"; title: string; desc: string; icon: typeof Store; fields: Field[] }> = [
  { key: "business", title: "Café details", desc: "Shown on the website, footer and contact page.", icon: Store, fields: [
    { key: "name", label: "Café name" },
    { key: "tagline", label: "Tagline" },
    { key: "phone", label: "Phone", type: "tel" },
    { key: "whatsapp_number", label: "WhatsApp number", type: "tel", hint: "With country code, e.g. 919876543210" },
    { key: "email", label: "Email", type: "email" },
    { key: "instagram", label: "Instagram", hint: "e.g. @cupcultureindia" },
    { key: "address", label: "Address", type: "textarea", wide: true },
    { key: "opening_hours", label: "Opening hours", hint: "e.g. Mon–Sun · 7 am – 11 pm", wide: true },
    { key: "map_url", label: "Google Maps link", type: "url", wide: true },
  ] },
  { key: "checkout", title: "Checkout & delivery", desc: "Used to calculate totals when customers order online.", icon: Receipt, fields: [
    { key: "tax_rate_percent", label: "Tax", type: "number", suffix: "%" },
    { key: "delivery_fee", label: "Delivery fee", type: "number", prefix: "₹" },
    { key: "delivery_minimum", label: "Minimum order for delivery", type: "number", prefix: "₹" },
    { key: "service_area_postcodes", label: "Delivery PIN codes", type: "list", hint: "Separate with commas. Leave empty to deliver anywhere.", wide: true },
  ] },
  { key: "reservation", title: "Table bookings", desc: "Rules for online reservations.", icon: CalendarDays, fields: [
    { key: "duration_minutes", label: "Each booking lasts", type: "number", suffix: "minutes" },
    { key: "max_guests", label: "Most guests per booking", type: "number", suffix: "guests" },
  ] },
];

export function SettingsSection() {
  const toast = useToast();
  const [values, setValues] = useState<Record<string, Row> | null>(null);
  const [publicFlags, setPublicFlags] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    api<{ settings: Record<string, { value: Row; is_public: boolean }> }>("GET", "?resource=settings")
      .then((r) => {
        const v: Record<string, Row> = {}; const p: Record<string, boolean> = {};
        for (const s of SECTIONS) { v[s.key] = { ...(r.settings?.[s.key]?.value || {}) }; p[s.key] = r.settings?.[s.key]?.is_public ?? true; }
        setValues(v); setPublicFlags(p);
      })
      .catch((e) => { toast("error", e instanceof Error ? e.message : "Could not load settings."); setValues({ business: {}, checkout: {}, reservation: {} }); });
  }, [toast]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const set = (section: string, key: string, value: unknown) => { setValues((v) => ({ ...v!, [section]: { ...v![section], [key]: value } })); setDirty(true); };

  async function save(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);
    try {
      const settings = Object.fromEntries(SECTIONS.map((s) => [s.key, { value: values![s.key], is_public: publicFlags[s.key] ?? true }]));
      await api("POST", "", { action: "saveSettings", settings });
      toast("ok", "Settings saved. The website now uses them."); setDirty(false);
    } catch (err) { toast("error", err instanceof Error ? err.message : "Could not save settings."); } finally { setSaving(false); }
  }

  if (!values) return <><PageHead title="Café settings" /><Skeleton rows={4} /></>;

  return (
    <form onSubmit={save}>
      <PageHead title="Café settings" subtitle="The details customers see, and how online orders are priced."
        actions={<button className="btn btn-primary" disabled={saving || !dirty}>{saving ? <><Loader2 size={15} className="spin" /> Saving…</> : <><Save size={15} /> {dirty ? "Save changes" : "Saved"}</>}</button>} />
      <div className="settings-stack">
        {SECTIONS.map(({ key, title, desc, icon: Icon, fields }) => (
          <section key={key} className="card settings-card">
            <header className="settings-head"><div className="kpi-icon"><Icon size={18} /></div><div><h2>{title}</h2><p>{desc}</p></div></header>
            <div className="settings-fields">
              {fields.map((f) => {
                const raw = values[key][f.key];
                const value = f.type === "list" ? (Array.isArray(raw) ? raw.join(", ") : raw ?? "") : raw ?? "";
                const onChange = (text: string) => set(key, f.key, f.type === "number" ? (text === "" ? 0 : Number(text)) : f.type === "list" ? text.split(",").map((x) => x.trim()).filter(Boolean) : text);
                return (
                  <label key={f.key} className={`field ${f.wide ? "wide" : ""}`}>
                    <span>{f.label}</span>
                    {f.type === "textarea"
                      ? <textarea className="input" rows={2} value={value} onChange={(e) => onChange(e.target.value)} />
                      : f.type === "list"
                        ? <input className="input" defaultValue={value} onBlur={(e) => onChange(e.target.value)} onChange={() => setDirty(true)} placeholder="641035, 641006" />
                        : (f.prefix || f.suffix)
                          ? <div className="input-affix">{f.prefix && <b>{f.prefix}</b>}<input className="input" type={f.type || "text"} min={f.type === "number" ? 0 : undefined} step="any" value={value} onChange={(e) => onChange(e.target.value)} />{f.suffix && <b className="suffix">{f.suffix}</b>}</div>
                          : <input className="input" type={f.type || "text"} value={value} onChange={(e) => onChange(e.target.value)} />}
                    {f.hint && <small>{f.hint}</small>}
                  </label>
                );
              })}
            </div>
          </section>
        ))}
        <p className="muted small">Payment keys and passwords never go here. They stay in the server’s environment settings.</p>
      </div>
      {dirty && <div className="save-bar"><span>You have unsaved changes</span><button className="btn btn-primary" disabled={saving}>{saving ? "Saving…" : "Save changes"}</button></div>}
    </form>
  );
}
