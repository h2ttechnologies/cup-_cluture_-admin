import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/supabase/auth";
import { createAdminClient } from "@/lib/supabase/admin";

// Kitchen stock: items, batches (with expiry), adjustments, categories and brands.
// Tables come from supabase/migrations/202611230004_kitchen_inventory.sql in the main site.

const REASONS = ["Purchase", "Usage", "Wastage", "Expired", "Correction", "Return"];
const UNITS = ["kg", "g", "L", "ml", "pcs", "pack", "box", "dozen", "bottle", "tin"];

function fail(error: unknown, fallback: string) {
  const e = error as { code?: string; message?: string };
  // 42P01 = table missing, PGRST205/PGRST202 = table/function not in schema cache → setup not run yet.
  if (e?.code === "42P01" || e?.code === "PGRST205" || e?.code === "PGRST202" || /does not exist|schema cache/i.test(e?.message || "")) {
    return NextResponse.json({ error: "Kitchen stock isn’t set up in the database yet.", setup: true }, { status: 503 });
  }
  console.error("inventory_error", error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}
const bad = (error: string) => NextResponse.json({ error }, { status: 400 });
const num = (v: unknown) => (v === "" || v === null || v === undefined ? NaN : Number(v));

export async function GET(request: Request) {
  try {
    if (!(await getAdminUser())) return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
    const url = new URL(request.url);
    const resource = url.searchParams.get("resource") || "stock";
    const db = createAdminClient();

    if (resource === "stock") {
      const [items, batches, categories, brands] = await Promise.all([
        db.from("inventory_items").select("*").order("name"),
        db.from("inventory_batches").select("id,item_id,quantity,expiry_date,cost_per_unit,received_at").gt("quantity", 0).order("expiry_date", { nullsFirst: false }),
        db.from("inventory_categories").select("id,name").order("name"),
        db.from("inventory_brands").select("*").order("name"),
      ]);
      for (const r of [items, batches, categories, brands]) if (r.error) throw r.error;
      return NextResponse.json({ items: items.data, batches: batches.data, categories: categories.data, brands: brands.data, units: UNITS, reasons: REASONS });
    }
    if (resource === "adjustments") {
      const from = url.searchParams.get("from"); const to = url.searchParams.get("to"); const item = url.searchParams.get("item");
      let q = db.from("inventory_adjustments").select("*,inventory_items(name,unit)").order("created_at", { ascending: false }).limit(1000);
      if (from) q = q.gte("created_at", from);
      if (to) q = q.lt("created_at", to);
      if (item) q = q.eq("item_id", item);
      const { data, error } = await q;
      if (error) throw error;
      return NextResponse.json({ adjustments: data });
    }
    if (resource === "summary") {
      const [items, batches] = await Promise.all([db.from("inventory_items").select("id,reorder_level,is_active"), db.from("inventory_batches").select("item_id,quantity,expiry_date").gt("quantity", 0)]);
      if (items.error) throw items.error; if (batches.error) throw batches.error;
      const stock = new Map<string, number>();
      for (const b of batches.data || []) stock.set(b.item_id, (stock.get(b.item_id) || 0) + Number(b.quantity));
      const low = (items.data || []).filter((i: any) => i.is_active && (stock.get(i.id) || 0) <= Number(i.reorder_level)).length;
      const soon = new Date(); soon.setDate(soon.getDate() + 3);
      const limit = `${soon.getFullYear()}-${String(soon.getMonth() + 1).padStart(2, "0")}-${String(soon.getDate()).padStart(2, "0")}`;
      const expiring = (batches.data || []).filter((b: any) => b.expiry_date && b.expiry_date <= limit).length;
      return NextResponse.json({ low, expiring });
    }
    return bad("Unknown kitchen stock section.");
  } catch (error) { return fail(error, "We couldn’t load kitchen stock."); }
}

export async function POST(request: Request) {
  try {
    const admin = await getAdminUser();
    if (!admin) return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
    const body = await request.json().catch(() => ({}));
    const db = createAdminClient();
    const now = new Date().toISOString();

    if (body.action === "adjust") {
      const change = num(body.change);
      if (!body.item_id || !Number.isFinite(change) || change === 0) return bad("Enter how much stock to add or remove.");
      if (!REASONS.includes(body.reason)) return bad("Choose a reason.");
      if (body.expiry_date && !/^\d{4}-\d{2}-\d{2}$/.test(body.expiry_date)) return bad("Check the expiry date.");
      const { data: profile } = await db.from("profiles").select("full_name").eq("id", admin.id).maybeSingle();
      const { data, error } = await db.rpc("inventory_adjust", {
        p_item: body.item_id, p_change: change, p_reason: body.reason, p_note: String(body.note || "").slice(0, 300),
        p_expiry: change > 0 && body.expiry_date ? body.expiry_date : null, p_batch: body.batch_id || null,
        p_cost: change > 0 && Number.isFinite(num(body.cost_per_unit)) ? num(body.cost_per_unit) : null,
        p_user: admin.id, p_user_name: profile?.full_name || admin.email || "",
      });
      if (error) {
        const m = error.message || "";
        const only = m.match(/Only ([\d.]+) in stock/);
        if (only) return bad(`Only ${Number(only[1])} in stock.`);
        if (/Not enough stock/.test(m)) return bad("Not enough stock in that batch.");
        throw error;
      }
      const row: any = Array.isArray(data) ? data[0] : data;
      return NextResponse.json({ quantity_after: Number(row?.quantity_after ?? 0) });
    }

    if (body.resource === "items") {
      const name = String(body.name || "").trim();
      if (name.length < 2) return bad("Enter the item name.");
      if (!UNITS.includes(body.unit)) return bad("Choose a unit.");
      const reorder = Math.max(0, num(body.reorder_level) || 0);
      const cost = Math.max(0, num(body.cost_per_unit) || 0);
      const record = { name: name.slice(0, 120), category_id: body.category_id || null, brand_id: body.brand_id || null, unit: body.unit, reorder_level: reorder, cost_per_unit: cost, track_expiry: body.track_expiry !== false, is_active: body.is_active !== false, notes: String(body.notes || "").slice(0, 500), updated_at: now };
      const q = body.id ? db.from("inventory_items").update(record).eq("id", body.id) : db.from("inventory_items").insert(record);
      const { data, error } = await q.select().single();
      if (error) { if (error.code === "23505") return bad("An item with that name already exists."); throw error; }
      // Optional opening stock when creating a new item.
      const opening = num(body.opening_stock);
      if (!body.id && Number.isFinite(opening) && opening > 0) {
        const { data: profile } = await db.from("profiles").select("full_name").eq("id", admin.id).maybeSingle();
        const { error: adjErr } = await db.rpc("inventory_adjust", { p_item: data.id, p_change: opening, p_reason: "Correction", p_note: "Opening stock", p_expiry: body.opening_expiry || null, p_batch: null, p_cost: cost || null, p_user: admin.id, p_user_name: profile?.full_name || admin.email || "" });
        if (adjErr) throw adjErr;
      }
      return NextResponse.json({ item: data });
    }

    if (body.resource === "categories" || body.resource === "brands") {
      const table = body.resource === "categories" ? "inventory_categories" : "inventory_brands";
      const name = String(body.name || "").trim();
      if (name.length < 2) return bad("Enter a name.");
      const record: Record<string, unknown> = { name: name.slice(0, 80) };
      if (body.resource === "brands") Object.assign(record, { contact_name: String(body.contact_name || "").slice(0, 80) || null, phone: String(body.phone || "").slice(0, 20) || null, notes: String(body.notes || "").slice(0, 300) });
      const q = body.id ? db.from(table).update(record).eq("id", body.id) : db.from(table).insert(record);
      const { data, error } = await q.select().single();
      if (error) { if (error.code === "23505") return bad("That name is already in the list."); throw error; }
      return NextResponse.json({ record: data });
    }

    return bad("Unknown action.");
  } catch (error) { return fail(error, "We couldn’t save this."); }
}

export async function PATCH(request: Request) {
  try {
    if (!(await getAdminUser())) return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
    const body = await request.json().catch(() => ({}));
    const db = createAdminClient();
    if (body.resource === "items" && typeof body.is_active === "boolean") {
      const { error } = await db.from("inventory_items").update({ is_active: body.is_active, updated_at: new Date().toISOString() }).eq("id", body.id);
      if (error) throw error; return NextResponse.json({ updated: true });
    }
    return bad("Unknown update.");
  } catch (error) { return fail(error, "We couldn’t update this."); }
}

export async function DELETE(request: Request) {
  try {
    if (!(await getAdminUser())) return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
    const url = new URL(request.url);
    const table = ({ items: "inventory_items", categories: "inventory_categories", brands: "inventory_brands" } as Record<string, string>)[url.searchParams.get("resource") || ""];
    const id = url.searchParams.get("id");
    if (!table || !id) return bad("Choose something to delete.");
    const { error } = await createAdminClient().from(table).delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ deleted: true });
  } catch (error) { return fail(error, "We couldn’t delete this."); }
}
