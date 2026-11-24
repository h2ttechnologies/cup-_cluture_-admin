"use client";

import { useCallback, useEffect, useState } from "react";
import { Eye, EyeOff, KeyRound, Loader2, ShieldCheck, Trash2, UserPlus, Users } from "lucide-react";
import type { Row } from "./lib";
import { Drawer, Empty, PageHead, Skeleton, useConfirm, useToast } from "./ui";

async function call(method: string, body?: unknown, query = "") {
  const r = await fetch(`/api/admin/users${query}`, { method, cache: "no-store", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Something went wrong.");
  return j;
}

function PasswordInput({ value, onChange, id }: { value: string; onChange: (v: string) => void; id: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="input-affix">
      <input id={id} className="input" type={show ? "text" : "password"} autoComplete="new-password" minLength={8} required value={value} onChange={(e) => onChange(e.target.value)} />
      <button type="button" className="icon-btn" onClick={() => setShow(!show)} aria-label={show ? "Hide password" : "Show password"}>{show ? <EyeOff size={15} /> : <Eye size={15} />}</button>
    </div>
  );
}

export function TeamSection() {
  const toast = useToast();
  const confirm = useConfirm();
  const [users, setUsers] = useState<Row[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [resetFor, setResetFor] = useState<Row | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setUsers((await call("GET")).users || []); } catch (e) { toast("error", e instanceof Error ? e.message : "Could not load the team."); setUsers([]); }
  }, [toast]);
  useEffect(() => { void load(); }, [load]);

  function close() { setAdding(false); setResetFor(null); setName(""); setEmail(""); setPassword(""); }

  async function create(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    try { await call("POST", { name, email, password }); toast("ok", `${name} can now sign in`); close(); await load(); }
    catch (err) { toast("error", err instanceof Error ? err.message : "Could not create the login."); } finally { setBusy(false); }
  }

  async function reset(e: React.FormEvent) {
    e.preventDefault(); if (!resetFor) return; setBusy(true);
    try { await call("PATCH", { id: resetFor.id, password }); toast("ok", `Password changed for ${resetFor.name || resetFor.email}`); close(); }
    catch (err) { toast("error", err instanceof Error ? err.message : "Could not change the password."); } finally { setBusy(false); }
  }

  async function remove(u: Row) {
    if (!(await confirm(`Remove ${u.name || u.email}?`, "They won’t be able to sign in to the admin site any more. This can’t be undone, but you can create a new login for them later.", "Remove login", true))) return;
    try { await call("DELETE", undefined, `?id=${encodeURIComponent(u.id)}`); toast("ok", "Login removed"); await load(); }
    catch (e) { toast("error", e instanceof Error ? e.message : "Could not remove the login."); }
  }

  const fmt = (iso?: string | null) => iso ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "Never";

  return (
    <>
      <PageHead title="Team" subtitle="Only people you add here can sign in to the admin site. Nobody can sign themselves up."
        actions={<button className="btn btn-primary" onClick={() => setAdding(true)}><UserPlus size={16} /> Add a login</button>} />

      <div className="card info-card"><ShieldCheck size={18} /><p>Everyone on this list has <b>full admin access</b>: orders, menu, reports, settings and this team page. Give each person their own login, and remove it when they leave.</p></div>

      {!users ? <Skeleton rows={2} /> : users.length ? (
        <section className="card" style={{ padding: 0 }}>
          <ul className="team">
            {users.map((u) => (
              <li key={u.id}>
                <div className="avatar">{(u.name || u.email || "?").trim().charAt(0).toUpperCase()}</div>
                <div className="grow">
                  <strong>{u.name || "No name"} {u.is_me && <span className="you">You</span>}</strong>
                  <small>{u.email}</small>
                </div>
                <div className="team-meta"><span>Last sign-in</span><b>{fmt(u.last_sign_in_at)}</b></div>
                <div className="row-actions">
                  <button className="btn btn-sm btn-ghost" onClick={() => setResetFor(u)}><KeyRound size={14} /> Password</button>
                  {!u.is_me && <button className="icon-btn" onClick={() => remove(u)} aria-label={`Remove ${u.name || u.email}`} title="Remove login"><Trash2 size={15} /></button>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : <Empty icon={<Users size={22} />} title="No team logins yet" />}

      <Drawer open={adding} onClose={close} title="Add a login" subtitle="They can sign in straight away with this email and password."
        footer={<><button className="btn btn-ghost" onClick={close}>Cancel</button><button type="submit" form="add-user" className="btn btn-primary" disabled={busy}>{busy ? <><Loader2 size={15} className="spin" /> Creating…</> : "Create login"}</button></>}>
        <form id="add-user" className="form" onSubmit={create}>
          <label className="field"><span>Name</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} autoFocus /></label>
          <label className="field"><span>Email</span><input className="input" type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
          <label className="field" htmlFor="new-pass"><span>Password <em>at least 8 characters</em></span><PasswordInput id="new-pass" value={password} onChange={setPassword} /><small>Share it with them privately. They can’t change it themselves, so set a new one here if they forget it.</small></label>
        </form>
      </Drawer>

      <Drawer open={!!resetFor} onClose={close} title="Set a new password" subtitle={resetFor ? `${resetFor.name || ""} · ${resetFor.email}` : ""}
        footer={<><button className="btn btn-ghost" onClick={close}>Cancel</button><button type="submit" form="reset-pass" className="btn btn-primary" disabled={busy}>{busy ? "Saving…" : "Save password"}</button></>}>
        <form id="reset-pass" className="form" onSubmit={reset}>
          <label className="field" htmlFor="reset-pass-input"><span>New password <em>at least 8 characters</em></span><PasswordInput id="reset-pass-input" value={password} onChange={setPassword} /></label>
        </form>
      </Drawer>
    </>
  );
}
