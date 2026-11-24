"use client";

import { useEffect, useState } from "react";
import { LockKeyhole, UserPlus } from "lucide-react";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/browser";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // True while the database has no admin yet: the page then offers to create the first one.
  const [setupOpen, setSetupOpen] = useState(false);

  useEffect(() => {
    fetch("/api/setup", { cache: "no-store" }).then((r) => r.json()).then((r) => setSetupOpen(Boolean(r.setupOpen))).catch(() => {});
  }, []);

  async function signIn() {
    const supabase = createClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) throw new Error("That email and password don’t match a café account.");
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", data.user.id).maybeSingle();
    if (profile?.role !== "admin") {
      await supabase.auth.signOut();
      throw new Error("This account doesn’t have the administrator role.");
    }
    window.location.href = "/";
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (setupOpen) {
        const response = await fetch("/api/setup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, fullName }) });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || "Could not create the admin account.");
      }
      await signIn();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not sign in.");
      setBusy(false);
    }
  }

  return (
    <main className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="mark mark-lg" aria-hidden="true">CC</div>
        {setupOpen ? <>
          <h1>Create the admin account</h1>
          <p>No café admin exists yet. Choose the email and password you’ll use to manage Cup Culture. This option disappears once the first admin is created.</p>
        </> : <>
          <h1>Café team sign in</h1>
          <p>Only accounts with the admin role can open the dashboard.</p>
        </>}
        {!isSupabaseConfigured && <p className="form-error" role="alert">Supabase isn’t configured. Add the keys to <code>.env.local</code>.</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
        {setupOpen && <label className="field" htmlFor="name"><span>Your name</span><input className="input" id="name" autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} required minLength={2} /></label>}
        <label className="field" htmlFor="email"><span>Email</span><input className="input" id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label className="field" htmlFor="password"><span>Password{setupOpen ? " · at least 8 characters" : ""}</span><input className="input" id="password" type="password" autoComplete={setupOpen ? "new-password" : "current-password"} minLength={setupOpen ? 8 : undefined} value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
        <button className="btn btn-primary" disabled={busy || !isSupabaseConfigured}>
          {setupOpen ? <UserPlus size={14} /> : <LockKeyhole size={14} />} {busy ? "One moment…" : setupOpen ? "Create admin account" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
