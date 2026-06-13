import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { fail, ok } from "@/lib/server/response";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const user = getSessionUser(req);
  if (!user) return fail("Unauthorized", 401);

  const body = await req.json().catch(() => ({}));
  const participantId = Number(body.participant_id || 0);
  const postId = Number(body.post_id || user.post_id || 0);

  if (!participantId || !postId) return fail("participant_id dan post_id wajib.");

  if (String(user.role || "").toLowerCase() === "operator" && Number(user.post_id) !== postId) {
    return fail("Operator hanya boleh reset hasil post sendiri.", 403);
  }

  const supabase = getSupabaseAdmin();

  const { data: participant, error: participantError } = await supabase
    .from("participants")
    .select("id,package_id")
    .eq("id", participantId)
    .maybeSingle();

  if (participantError) return fail(participantError.message, 500);
  if (!participant) return fail("Peserta tidak ditemukan.", 404);
  if (!participant.package_id) return fail("Package peserta tidak ditemukan.");

  const { data: mappings, error: mappingError } = await supabase
    .from("package_parameters")
    .select("parameter_id")
    .eq("package_id", participant.package_id);

  if (mappingError) return fail(mappingError.message, 500);

  const mappedIds = (mappings || []).map((m: any) => Number(m.parameter_id)).filter(Boolean);
  if (!mappedIds.length) return ok({ deleted_results: 0, deleted_staff_assignments: 0 });

  const { data: parameters, error: parameterError } = await supabase
    .from("parameters")
    .select("id")
    .in("id", mappedIds)
    .eq("post_id", postId)
    .eq("is_active", 1);

  if (parameterError) return fail(parameterError.message, 500);

  const parameterIds = (parameters || []).map((p: any) => Number(p.id)).filter(Boolean);
  if (!parameterIds.length) return ok({ deleted_results: 0, deleted_staff_assignments: 0 });

  const { data: deletedResults, error: deleteResultsError } = await supabase
    .from("examination_results")
    .delete()
    .eq("participant_id", participantId)
    .in("parameter_id", parameterIds)
    .select("id");

  if (deleteResultsError) return fail(deleteResultsError.message, 500);

  let deletedStaffCount = 0;
  try {
    const { data: deletedStaff, error: staffError } = await supabase
      .from("mcu_stage_staff_assignments")
      .delete()
      .eq("participant_id", participantId)
      .eq("post_id", postId)
      .select("id");

    if (!staffError) deletedStaffCount = deletedStaff?.length || 0;
  } catch {
    // Jika tabel assignment belum ada di environment lama, reset hasil pemeriksaan tetap berhasil.
  }

  return ok({
    deleted_results: deletedResults?.length || 0,
    deleted_staff_assignments: deletedStaffCount,
  });
}
