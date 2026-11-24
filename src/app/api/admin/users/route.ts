import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/supabase/auth";
import { createAdminClient } from "@/lib/supabase/admin";

// Team logins for the admin site. Only a signed-in admin can list, create, reset or remove them.
// Every account created here gets the admin role, which is what lets it sign in to this site.

const validEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

export async function GET() {
  try {
    const me = await getAdminUser();
    if (!me) return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
    const db = createAdminClient();
    const { data: profiles, error } = await db.from("profiles").select("id,full_name,role,created_at").eq("role", "admin");
    if (error) throw error;
    const { data: list, error: listError } = await db.auth.admin.listUsers({ perPage: 1000 });
    if (listError) throw listError;
    const users = (profiles || []).map((p: any) => {
      const u = list.users.find((x) => x.id === p.id);
      return { id: p.id, name: p.full_name || "", email: u?.email || "", created_at: u?.created_at || p.created_at, last_sign_in_at: u?.last_sign_in_at || null, is_me: p.id === me.id };
    }).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    return NextResponse.json({ users });
  } catch (error) {
    console.error("admin_users_list_error", error);
    return NextResponse.json({ error: "We couldn’t load the team." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    if (!(await getAdminUser())) return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
    const body = await request.json().catch(() => ({}));
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const name = String(body.name || "").trim().slice(0, 100);
    if (name.length < 2) return NextResponse.json({ error: "Enter the person’s name." }, { status: 400 });
    if (!validEmail(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    if (password.length < 8) return NextResponse.json({ error: "The password needs at least 8 characters." }, { status: 400 });
    const db = createAdminClient();
    const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: name } });
    if (error || !data.user) {
      const taken = /already|registered|exists/i.test(error?.message || "");
      return NextResponse.json({ error: taken ? "An account with that email already exists." : error?.message || "Could not create the login." }, { status: 400 });
    }
    const { error: roleError } = await db.from("profiles").upsert({ id: data.user.id, full_name: name, role: "admin", updated_at: new Date().toISOString() }, { onConflict: "id" });
    if (roleError) { await db.auth.admin.deleteUser(data.user.id); throw roleError; }
    return NextResponse.json({ created: true });
  } catch (error) {
    console.error("admin_users_create_error", error);
    return NextResponse.json({ error: "We couldn’t create this login." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    if (!(await getAdminUser())) return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
    const body = await request.json().catch(() => ({}));
    const id = String(body.id || "");
    const password = String(body.password || "");
    if (!id || password.length < 8) return NextResponse.json({ error: "The new password needs at least 8 characters." }, { status: 400 });
    const db = createAdminClient();
    const { data: profile } = await db.from("profiles").select("role").eq("id", id).maybeSingle();
    if (profile?.role !== "admin") return NextResponse.json({ error: "That login isn’t part of the team." }, { status: 404 });
    const { error } = await db.auth.admin.updateUserById(id, { password });
    if (error) throw error;
    return NextResponse.json({ updated: true });
  } catch (error) {
    console.error("admin_users_password_error", error);
    return NextResponse.json({ error: "We couldn’t change the password." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const me = await getAdminUser();
    if (!me) return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
    const id = new URL(request.url).searchParams.get("id") || "";
    if (!id) return NextResponse.json({ error: "Choose a login to remove." }, { status: 400 });
    if (id === me.id) return NextResponse.json({ error: "You can’t remove your own login." }, { status: 400 });
    const db = createAdminClient();
    const { data: profile } = await db.from("profiles").select("role").eq("id", id).maybeSingle();
    if (profile?.role !== "admin") return NextResponse.json({ error: "That login isn’t part of the team." }, { status: 404 });
    // Take away admin access first, then delete the login itself.
    const { error: roleError } = await db.from("profiles").update({ role: "customer", updated_at: new Date().toISOString() }).eq("id", id);
    if (roleError) throw roleError;
    const { error } = await db.auth.admin.deleteUser(id);
    if (error) throw error;
    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error("admin_users_delete_error", error);
    return NextResponse.json({ error: "We couldn’t remove this login." }, { status: 500 });
  }
}
