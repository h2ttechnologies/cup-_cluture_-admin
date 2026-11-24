"use client";

import { createClient } from "@/lib/supabase/browser";

export function SignOutButton() {
  return <button className="btn btn-primary btn-block" onClick={async () => { try { await createClient().auth.signOut(); } finally { window.location.href = "/login"; } }}>Sign in with another account</button>;
}
