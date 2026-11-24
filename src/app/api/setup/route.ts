import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// One-time setup: creates the first café admin account.
// Works only while the database has no admin at all; after that it refuses every request.
async function adminExists() {
  const db = createAdminClient();
  const { count, error } = await db.from("profiles").select("id", { count: "exact", head: true }).eq("role", "admin");
  if (error) throw error;
  return (count || 0) > 0;
}

export async function GET() {
  try { return NextResponse.json({ setupOpen: !(await adminExists()) }); }
  catch (error) { console.error("setup_check_error", error); return NextResponse.json({ setupOpen: false }); }
}

export async function POST(request: Request) {
  try {
    if (await adminExists()) return NextResponse.json({ error: "An admin account already exists. Sign in instead." }, { status: 403 });
    const body = await request.json().catch(() => ({}));
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const fullName = String(body.fullName || "").trim().slice(0, 120);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    if (password.length < 8) return NextResponse.json({ error: "Use a password of at least 8 characters." }, { status: 400 });

    const db = createAdminClient();
    const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: fullName } });
    if (error || !data.user) return NextResponse.json({ error: error?.message || "Could not create the account." }, { status: 400 });
    const { error: roleError } = await db.from("profiles").upsert({ id: data.user.id, full_name: fullName, role: "admin", updated_at: new Date().toISOString() }, { onConflict: "id" });
    if (roleError) throw roleError;
    return NextResponse.json({ created: true });
  } catch (error) {
    console.error("setup_error", error);
    return NextResponse.json({ error: "We couldn't create the admin account." }, { status: 500 });
  }
}
