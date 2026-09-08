import { NextRequest } from "next/server";
import { canVaccinationAccess } from "@/lib/vaccination/access";
import { fail, ok, requireUser, supabaseAdmin } from "../_utils";

export const dynamic = "force-dynamic";

function relationMissing(error: any) {
  const code = String(error?.code || "");
  const message = String(error?.message || "").toLowerCase();
  return code === "42P01" || message.includes("vaccination_session_stock_allocations") && message.includes("does not exist");
}

export async function GET(req: NextRequest) {
  const user = requireUser(req);
  if (!user) return fail("Unauthorized", 401);
  if (!canVaccinationAccess(user, "portal")) return fail("Akses vaksinasi ditolak.", 403);

  const supabase = supabaseAdmin();
  const allocationResult = await supabase
    .from("vaccination_session_stock_allocations")
    .select("*,session:vaccination_sessions(id,session_name,company_name,location,session_date,status),vaccine:vaccination_vaccines(id,name,brand),lot:vaccination_vaccine_lots(id,lot_number,expiry_date,stock_initial,stock_added,stock_used)")
    .eq("active", true)
    .order("updated_at", { ascending: false })
    .limit(10000);

  if (allocationResult.error) {
    if (relationMissing(allocationResult.error)) return ok({ alerts: [], count: 0, migration_required: true });
    return fail(allocationResult.error.message, 500);
  }

  const allocations = allocationResult.data || [];
  const sessionIds = Array.from(new Set(allocations.map((row: any) => Number(row.session_id)).filter(Boolean)));
  const lotIds = Array.from(new Set(allocations.map((row: any) => Number(row.lot_id)).filter(Boolean)));
  const usedMap = new Map<string, number>();

  if (sessionIds.length && lotIds.length) {
    const recordsResult = await supabase
      .from("vaccination_records")
      .select("session_id,lot_id,status")
      .in("session_id", sessionIds)
      .in("lot_id", lotIds)
      .limit(20000);
    if (!recordsResult.error) {
      for (const row of recordsResult.data || []) {
        if (["CANCELLED", "CANCELED", "VOID", "BATAL"].includes(String(row.status || "").toUpperCase())) continue;
        const key = `${Number(row.session_id)}:${Number(row.lot_id)}`;
        usedMap.set(key, (usedMap.get(key) || 0) + 1);
      }
    }
  }

  const alerts = allocations
    .map((row: any) => {
      const used = usedMap.get(`${Number(row.session_id)}:${Number(row.lot_id)}`) || 0;
      const remaining = Math.max(0, Number(row.allocated_qty || 0) - used);
      const threshold = Math.max(0, Number(row.low_stock_threshold || 0));
      return {
        id: row.id,
        session_id: row.session_id,
        session_name: row.session?.session_name || `Session ${row.session_id}`,
        company_name: row.session?.company_name || "-",
        location: row.session?.location || "-",
        session_date: row.session?.session_date || null,
        vaccine_name: row.vaccine?.name || "Vaksin",
        brand: row.vaccine?.brand || "",
        lot_number: row.lot?.lot_number || "-",
        allocated_qty: Number(row.allocated_qty || 0),
        used_qty: used,
        remaining_qty: remaining,
        low_stock_threshold: threshold,
        dedicated: row.dedicated !== false,
        severity: remaining <= 0 ? "critical" : remaining <= threshold ? "low" : "ok",
      };
    })
    .filter((row: any) => row.remaining_qty <= row.low_stock_threshold)
    .sort((a: any, b: any) => a.remaining_qty - b.remaining_qty);

  return ok({ alerts, count: alerts.length });
}
