import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { getAdminUser } from "@/lib/supabase/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const ORDER_TYPES = ["Dine In", "Takeaway", "Home Delivery"];
const PAYMENT_METHODS = ["Cash", "UPI", "Card", "Pay at counter", "Cash on delivery"];

// Creates an order from the admin site (walk-in, phone or counter orders).
// Prices always come from the database, never from the browser.
export async function POST(request: Request) {
  try {
    const admin = await getAdminUser();
    if (!admin) return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
    const input = await request.json();

    const type = String(input.order_type || "");
    if (!ORDER_TYPES.includes(type)) return NextResponse.json({ error: "Choose Dine in, Takeaway or Delivery." }, { status: 400 });
    const method = String(input.payment_method || "");
    if (!PAYMENT_METHODS.includes(method)) return NextResponse.json({ error: "Choose how the customer is paying." }, { status: 400 });
    const name = String(input.customer_name || "").trim().slice(0, 100) || (type === "Dine In" ? "Dine-in guest" : "Walk-in customer");
    const phone = String(input.customer_phone || "").trim().slice(0, 20);
    if (phone && !/^\+?[0-9 ()-]{10,16}$/.test(phone)) return NextResponse.json({ error: "That mobile number doesn’t look right." }, { status: 400 });
    if (type === "Home Delivery" && (!phone || !String(input.delivery_address || "").trim())) return NextResponse.json({ error: "Delivery orders need a mobile number and an address." }, { status: 400 });

    const lines: Array<{ product_id: string; quantity: number; note?: string }> = Array.isArray(input.items) ? input.items : [];
    if (!lines.length || lines.length > 60) return NextResponse.json({ error: "Add at least one item." }, { status: 400 });
    if (lines.some((l) => !Number.isInteger(Number(l.quantity)) || Number(l.quantity) < 1 || Number(l.quantity) > 99)) return NextResponse.json({ error: "Check the item quantities." }, { status: 400 });

    const db = createAdminClient();
    const ids = [...new Set(lines.map((l) => String(l.product_id)))];
    const { data: catalog, error: catalogError } = await db.from("products").select("id,name,price,is_available,stock_quantity").in("id", ids);
    if (catalogError) throw catalogError;
    const byId = new Map((catalog || []).map((p: any) => [p.id, p]));
    let subtotal = 0;
    const rows: any[] = [];
    for (const l of lines) {
      const qty = Number(l.quantity);
      const note = String(l.note || "").slice(0, 300);
      const p: any = byId.get(String(l.product_id));
      if (!p) return NextResponse.json({ error: "One of the items is no longer on the menu." }, { status: 409 });
      subtotal += Number(p.price) * qty;
      rows.push({ product_id: p.id, product_name: p.name, unit_price: Number(p.price), quantity: qty, special_instructions: note });
    }

    const { data: settings } = await db.from("restaurant_settings").select("value").eq("key", "checkout").maybeSingle();
    const config: any = settings?.value || {};
    const taxRate = Math.max(0, Number(config.tax_rate_percent) || 0);
    const tax = Math.round(subtotal * taxRate) / 100;
    const deliveryFee = type === "Home Delivery" ? Math.max(0, Number(input.delivery_charge ?? config.delivery_fee) || 0) : 0;
    const discount = Math.min(subtotal + tax + deliveryFee, Math.max(0, Number(input.discount) || 0));
    const total = Number((subtotal + tax + deliveryFee - discount).toFixed(2));

    // Same daily numbering as website orders (CC-0001 … each day).
    let orderNumber = `CC-${Date.now().toString(36).toUpperCase()}-${randomBytes(2).toString("hex").toUpperCase()}`;
    let orderDate: string | null = null;
    const { data: seq, error: seqError } = await db.rpc("next_order_number");
    const seqRow: any = Array.isArray(seq) ? seq[0] : seq;
    if (!seqError && seqRow?.next_number) { orderNumber = String(seqRow.next_number); orderDate = String(seqRow.next_date); }

    const notes = [String(input.special_instructions || "").trim(), discount ? `Discount ₹${discount}` : "", "Created in admin"].filter(Boolean).join(" · ").slice(0, 500);
    const { data: order, error: orderError } = await db.from("orders").insert({
      order_number: orderNumber, ...(orderDate ? { order_date: orderDate } : {}),
      customer_name: name, customer_phone: phone, order_type: type,
      table_number: type === "Dine In" ? String(input.table_number || "").slice(0, 30) || null : null,
      delivery_address: type === "Home Delivery" ? String(input.delivery_address).slice(0, 500) : null,
      special_instructions: notes, payment_method: method,
      payment_status: input.paid === true ? "paid" : "unpaid",
      status: input.status === "Order Confirmed" ? "Order Confirmed" : "Order Placed",
      subtotal, tax_amount: tax, delivery_charge: deliveryFee, total_amount: total,
    }).select("*").single();
    if (orderError) throw orderError;

    const { error: itemsError } = await db.from("order_items").insert(rows.map((r) => ({ ...r, order_id: order.id })));
    if (itemsError) { await db.from("orders").delete().eq("id", order.id); throw itemsError; }

    // Count down tracked stock; an item that reaches 0 is switched to not available.
    for (const r of rows) {
      const p: any = r.product_id ? byId.get(r.product_id) : null;
      if (p && p.stock_quantity !== null && p.stock_quantity !== undefined) {
        const left = Math.max(0, Number(p.stock_quantity) - r.quantity);
        await db.from("products").update({ stock_quantity: left, ...(left === 0 ? { is_available: false } : {}), updated_at: new Date().toISOString() }).eq("id", p.id);
      }
    }
    return NextResponse.json({ order: { ...order, order_items: rows } });
  } catch (error) {
    console.error("admin_order_create_error", error);
    return NextResponse.json({ error: "We couldn’t create this order." }, { status: 500 });
  }
}
