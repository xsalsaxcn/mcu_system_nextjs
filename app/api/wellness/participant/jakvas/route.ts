// WELLNESS_JAKVAS_REPORT_V1_PARTICIPANT
import { NextRequest } from "next/server";
import { fail, ok } from "@/lib/server/response";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { getParticipantFromPortalSession } from "@/lib/wellness/portalAuth";
import {
  loadParticipantJakvasReport,
  saveParticipantJakvasProfile,
} from "@/lib/wellness/jakvasServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const participant = await getParticipantFromPortalSession(supabase, request);
    if (!participant) return fail("OTP/session peserta belum aktif.", 401);

    const report = await loadParticipantJakvasReport({ supabase, participant });
    return ok({ jakvas: report });
  } catch (error: any) {
    return fail(error?.message || "Laporan JAKVAS gagal dimuat.", 500);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const participant = await getParticipantFromPortalSession(supabase, request);
    if (!participant) return fail("OTP/session peserta belum aktif.", 401);

    const body = await request.json().catch(() => ({}));
    await saveParticipantJakvasProfile({
      supabase,
      participantId: Number(participant.id),
      input: body,
      updatedByRole: "participant",
      updatedById: participant.id,
    });

    const report = await loadParticipantJakvasReport({ supabase, participant });
    return ok({ jakvas: report, message: "Data JAKVAS berhasil diperbarui." });
  } catch (error: any) {
    return fail(error?.message || "Data JAKVAS gagal disimpan.", 500);
  }
}
