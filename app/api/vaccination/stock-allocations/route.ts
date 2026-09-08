import { NextRequest } from "next/server";
import { canVaccinationAccess } from "@/lib/vaccination/access";
import { clean, fail, ok, requireUser, supabaseAdmin, toInt } from "../_utils";

export const dynamic = "force-dynamic";

function relationMissing(error: any) {
  const code = String(error?.code || "");
  const message = String(error?.message || "").toLowerCase();
  return code === "42P01" || message.includes("vaccination_session_stock_allocations") && message.includes("does not exist");
}

async function loadUsedMap(supabase: any, allocations: any[]) {
  const sessionIds = Array.from(new Set(allocations.map((row: any) => Number(row.session_id)).filter(Boolean)));
  const lotIds = Array.from(new Set(allocations.map((row: any) => Number(row.lot_id)).filter(Boolean)));
  const map = new Map<string, number>();
  if (!sessionIds.length || !lotIds.length) return map;

  const result = await supabase
    .from("vaccination_records")
    .select("session_id,lot_id,status")
    .in("session_id", sessionIds)
    .in("lot_id", lotIds)
    .limit(20000);
  if (result.error) return map;

  for (const row of result.data || []) {
    if (["CANCELLED", "CANCELED", "VOID", "BATAL"].includes(String(row.status || "").toUpperCase())) continue;
    const key = `${Number(row.session_id)}:${Number(row.lot_id)}`;
    map.set(key, (map.get(key) || 0) + 1);
  }
  return map;
}

export async function GET(req: NextRequest) {
  const user = requireUser(req);
  if (!user) return fail("Unauthorized", 401);
  if (!canVaccinationAccess(user, "inventory") && !canVaccinationAccess(user, "session")) {
    return fail("Akses alokasi stock ditolak untuk role ini.", 403);
  }

  const supabase = supabaseAdmin();
  const [sessionsResult, vaccinesResult, lotsResult, allocationsResult] = await Promise.all([
    supabase.from("vaccination_sessions").select("id,session_name,company_name,location,session_date,status").order("session_date", { ascending: false }).order("id", { ascending: false }).limit(3000),
    supabase.from("vaccination_vaccines").select("id,name,brand,active").order("name", { ascending: true }).limit(5000),
    supabase.from("vaccination_vaccine_lots").select("id,vaccine_id,lot_number,expiry_date,stock_initial,stock_added,stock_used,active").order("id", { ascending: false }).limit(10000),
    supabase.from("vaccination_session_stock_allocations").select("*").order("updated_at", { ascending: false }).limit(10000),
  ]);

  if (sessionsResult.error) return fail(sessionsResult.error.message, 500);
  if (vaccinesResult.error) return fail(vaccinesResult.error.message, 500);
  if (lotsResult.error) return fail(lotsResult.error.message, 500);
  if (allocationsResult.error) {
    if (relationMissing(allocationsResult.error)) {
      return fail("Tabel alokasi stock V150 belum ada. Jalankan sql/vaccination_portal_stock_v150.sql di Supabase.", 503, {
        migration_required: true,
        sessions: sessionsResult.data || [],
        vaccines: vaccinesResult.data || [],
        lots: lotsResult.data || [],
      });
    }
    return fail(allocationsResult.error.message, 500);
  }

  const allocations = allocationsResult.data || [];
  const usedMap = await loadUsedMap(supabase, allocations);
  const sessionMap = new Map((sessionsResult.data || []).map((row: any) => [Number(row.id), row]));
  const vaccineMap = new Map((vaccinesResult.data || []).map((row: any) => [Number(row.id), row]));
  const lotMap = new Map((lotsResult.data || []).map((row: any) => [Number(row.id), row]));

  const rows = allocations.map((row: any) => {
    const used = usedMap.get(`${Number(row.session_id)}:${Number(row.lot_id)}`) || 0;
    return {
      ...row,
      used_qty: used,
      remaining_qty: Math.max(0, Number(row.allocated_qty || 0) - used),
      session: sessionMap.get(Number(row.session_id)) || null,
      vaccine: vaccineMap.get(Number(row.vaccine_id)) || null,
      lot: lotMap.get(Number(row.lot_id)) || null,
    };
  });

  return ok({
    rows,
    sessions: sessionsResult.data || [],
    vaccines: vaccinesResult.data || [],
    lots: lotsResult.data || [],
  });
}

export async function POST(req: NextRequest) {
  const user = requireUser(req);
  if (!user) return fail("Unauthorized", 401);
  if (!canVaccinationAccess(user, "inventory") && !canVaccinationAccess(user, "session")) {
    return fail("Akses pengaturan stock ditolak untuk role ini.", 403);
  }

  const body = await req.json().catch(() => ({}));
  const action = clean(body.action || "upsert").toLowerCase();
  const supabase = supabaseAdmin();

  if (action === "delete" || action === "disable") {
    const id = toInt(body.id, 0);
    if (!id) return fail("ID alokasi wajib diisi.");
    const result = await supabase
      .from("vaccination_session_stock_allocations")
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .single();
    if (result.error) return fail(result.error.message, 500);
    return ok({ message: "Alokasi stock dinonaktifkan.", allocation: result.data });
  }

  const sessionId = toInt(body.sessionId || body.session_id, 0);
  const lotId = toInt(body.lotId || body.lot_id, 0);
  const allocatedQty = Math.max(0, toInt(body.allocatedQty ?? body.allocated_qty, 0));
  const threshold = Math.max(0, toInt(body.lowStockThreshold ?? body.low_stock_threshold, 5));
  const dedicated = body.dedicated !== false && String(body.dedicated) !== "false";
  if (!sessionId) return fail("Session wajib dipilih.");
  if (!lotId) return fail("Lot wajib dipilih.");
  if (!allocatedQty) return fail("Jumlah alokasi harus lebih dari 0.");

  const lotResult = await supabase.from("vaccination_vaccine_lots").select("id,vaccine_id,lot_number,stock_initial,stock_added,stock_used").eq("id", lotId).single();
  if (lotResult.error) return fail(lotResult.error.message, 500);
  const lot = lotResult.data;
  const globalRemaining = Number(lot.stock_initial || 0) + Number(lot.stock_added || 0) - Number(lot.stock_used || 0);
  if (allocatedQty > globalRemaining) {
    return fail(`Alokasi ${allocatedQty} melebihi sisa stock global ${globalRemaining} untuk Lot ${lot.lot_number}.`, 409);
  }

  if (dedicated) {
    const otherResult = await supabase
      .from("vaccination_session_stock_allocations")
      .select("id,session_id,allocated_qty,active,dedicated")
      .eq("lot_id", lotId)
      .eq("active", true)
      .eq("dedicated", true)
      .neq("session_id", sessionId);
    if (otherResult.error && !relationMissing(otherResult.error)) return fail(otherResult.error.message, 500);
    const allocatedElsewhere = (otherResult.data || []).reduce((sum: number, row: any) => sum + Number(row.allocated_qty || 0), 0);
    if (allocatedQty + allocatedElsewhere > globalRemaining) {
      return fail(`Total alokasi dedicated melebihi sisa stock global ${globalRemaining}.`, 409);
    }
  }

  const payload = {
    session_id: sessionId,
    vaccine_id: Number(lot.vaccine_id),
    lot_id: lotId,
    allocated_qty: allocatedQty,
    low_stock_threshold: threshold,
    dedicated,
    active: true,
    notes: clean(body.notes) || null,
    created_by: String((user as any).name || (user as any).username || user.id),
    updated_at: new Date().toISOString(),
  };

  const result = await supabase
    .from("vaccination_session_stock_allocations")
    .upsert(payload, { onConflict: "session_id,lot_id" })
    .select("*")
    .single();
  if (result.error) {
    if (relationMissing(result.error)) return fail("Jalankan sql/vaccination_portal_stock_v150.sql di Supabase terlebih dahulu.", 503, { migration_required: true });
    return fail(result.error.message, 500);
  }

  return ok({ message: "Alokasi stock session berhasil disimpan.", allocation: result.data });
}
