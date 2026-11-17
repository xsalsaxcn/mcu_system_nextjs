import { NextRequest } from "next/server";
import { fail, ok, requireUser, supabaseAdmin } from "../../_utils";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(req: NextRequest) {
  const user = requireUser(req);
  if (!user) return fail("Unauthorized", 401);
  if (!["admin", "vaccination_admin", "vaccination_supervisor"].includes(String((user as any)?.role || "").toLowerCase())) {
    return fail("Hanya admin/supervisor Vaccination yang boleh membatalkan reminder massal.", 403);
  }
  try {
    const body: any = await req.json().catch(() => ({}));
    if (body.action !== "cancel") return fail("Aksi hanya mendukung batalkan jadwal yang dipilih.", 400);
    const ids = body?.ids;
    if (!Array.isArray(ids) || !ids.length || ids.length > 1000 || ids.some((v: any) => !Number.isSafeInteger(Number(v)) || Number(v) < 1)) {
      return fail("Pilih 1 sampai 1000 jadwal yang valid.", 400);
    }
    const uniqueIds = [...new Set(ids.map(Number))];
    const supabase = supabaseAdmin();
    const result = await supabase.rpc("vaccination_reminder_cancel_bulk_v6345", { p_ids: uniqueIds });
    if (result.error) throw new Error(result.error.message);
    return ok({ counts: result.data, requested: uniqueIds.length });
  } catch (e: any) { return fail(String(e?.message || e), 500); }
}
