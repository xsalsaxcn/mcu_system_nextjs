// WELLNESS_JAKVAS_REPORT_V1_ADMIN
import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { fail, ok } from "@/lib/server/response";
import { loadParticipantJakvasReport } from "@/lib/wellness/jakvasServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADMIN_ROLES = new Set([
  "admin",
  "super_admin",
  "supervisor",
  "doctor",
  "wellness_admin",
]);

function clean(value: any) {
  return String(value ?? "").trim();
}

export async function GET(request: NextRequest) {
  try {
    const user: any = getSessionUser(request);
    if (!user) return fail("Session Admin belum aktif.", 401);
    if (!ADMIN_ROLES.has(clean(user.role).toLowerCase())) {
      return fail("Akun ini tidak memiliki akses Portal Admin.", 403);
    }

    const participantId = Number(request.nextUrl.searchParams.get("participant_id") || 0);
    if (!(participantId > 0)) return fail("participant_id wajib diisi.", 400);

    const supabase = getSupabaseAdmin();
    const participantResult = await supabase
      .from("wellness_participants")
      .select("*")
      .eq("id", participantId)
      .maybeSingle();

    if (participantResult.error || !participantResult.data) {
      return fail("Peserta tidak ditemukan.", 404);
    }

    const report = await loadParticipantJakvasReport({
      supabase,
      participant: participantResult.data,
    });

    return ok({ jakvas: report });
  } catch (error: any) {
    return fail(error?.message || "Laporan JAKVAS Admin gagal dimuat.", 500);
  }
}
