import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/supabase/auth";
import { createAdminClient } from "@/lib/supabase/admin";

// All orders (with items) created between `from` (inclusive) and `to` (exclusive), both ISO timestamps.
export async function GET(request: Request) {
  try {
    if (!(await getAdminUser())) return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
    const url = new URL(request.url);
    const from = new Date(url.searchParams.get("from") || "");
    const to = new Date(url.searchParams.get("to") || "");
    if (isNaN(+from) || isNaN(+to) || to <= from || +to - +from > 400 * 86400000) return NextResponse.json({ error: "Choose a valid period." }, { status: 400 });
    const db = createAdminClient();
    const all: any[] = [];
    for (let page = 0; page < 50; page++) {
      const { data, error } = await db.from("orders").select("id,order_number,created_at,customer_name,customer_phone,order_type,status,payment_method,payment_status,subtotal,tax_amount,delivery_charge,total_amount,order_items(product_name,quantity,unit_price)")
        .gte("created_at", from.toISOString()).lt("created_at", to.toISOString()).order("created_at", { ascending: true }).range(page * 1000, page * 1000 + 999);
      if (error) throw error;
      all.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    return NextResponse.json({ orders: all });
  } catch (error) {
    console.error("admin_report_error", error);
    return NextResponse.json({ error: "We couldn’t build this report." }, { status: 500 });
  }
}
