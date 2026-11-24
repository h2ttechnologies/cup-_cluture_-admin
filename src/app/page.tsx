import { redirect } from "next/navigation";
import { LockKeyhole } from "lucide-react";
import { isSupabaseConfigured, createClient } from "@/lib/supabase/server";
import { AdminApp } from "@/components/admin/admin-app";
import { SignOutButton } from "@/components/admin/sign-out";

export const dynamic = "force-dynamic";

function Locked({ title, children, signedIn }: { title: string; children: React.ReactNode; signedIn?: boolean }) {
  return <main className="login-wrap"><div className="login-card"><div className="lock-icon"><LockKeyhole size={22} /></div><h1>{title}</h1>{children}{signedIn && <SignOutButton />}</div></main>;
}

export default async function AdminHome() {
  if (!isSupabaseConfigured) return <Locked title="Connect the café dashboard"><p>Add the Supabase URL, public key and server-only secret key to <code>.env.local</code> — the same project the Cup Culture site uses.</p></Locked>;
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await client.from("profiles").select("role,full_name").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin") return <Locked title="This area is for café admins" signedIn><p>You’re signed in as {user.email}, but this account doesn’t have the admin role.</p></Locked>;
  return <AdminApp adminName={profile.full_name || user.email || "Admin"} email={user.email || ""} />;
}
