import { NextRequest } from "next/server";
import { fail, ok } from "@/lib/server/response";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { canManageWellness, isWellnessParticipant } from "@/lib/wellness/auth";
import { calculateBmi, interpretBmi, toNumber } from "@/lib/wellness/bmi";
import { getAllowedWellnessParticipants } from "@/app/api/wellness/_utils";

export async function GET(req: NextRequest) {
  const user = getSessionUser(req);
  if (!user) return fail("Unauthorized", 401);

  try {
    const supabase = getSupabaseAdmin();
    const participants = await getAllowedWellnessParticipants(supabase, user);
    return ok({ participants });
  } catch (error: any) {
    return fail(error?.message || "Gagal memuat peserta Wellness.", 500);
  }
}

export async function POST(req: NextRequest) {
  const user = getSessionUser(req);
  if (!user) return fail("Unauthorized", 401);
  if (!canManageWellness(user) && !isWellnessParticipant(user)) return fail("Akses ditolak.", 403);

  const body = await req.json().catch(() => ({}));
  const participantId = Number(body.id || body.participant_id || 0);
  const name = String(body.name || "").trim();

  if (!name) return fail("Nama peserta wajib diisi.");

  try {
    const supabase = getSupabaseAdmin();
    const height = toNumber(body.height_cm);
    const initialWeight = toNumber(body.initial_weight_kg);
    const payload: any = {
      name,
      code: String(body.code || "").trim() || null,
      gender: String(body.gender || "").trim() || null,
      phone: String(body.phone || "").trim() || null,
      email: String(body.email || "").trim() || null,
      height_cm: height,
      initial_weight_kg: initialWeight,
      target_weight_kg: toNumber(body.target_weight_kg),
      program_start_date: body.program_start_date || null,
      group_id: body.group_id ? Number(body.group_id) : null,
      coach_id: body.coach_id ? Number(body.coach_id) : null,
      updated_at: new Date().toISOString(),
    };

    if (isWellnessParticipant(user)) payload.user_id = user.id;
    else if (body.user_id) payload.user_id = Number(body.user_id);

    let result;
    if (participantId) {
      result = await supabase.from("wellness_participants").update(payload).eq("id", participantId).select("*").single();
    } else {
      result = await supabase.from("wellness_participants").insert({ ...payload, is_active: 1 }).select("*").single();
    }

    if (result.error) throw result.error;

    if (!participantId && initialWeight && height) {
      const bmi = calculateBmi(initialWeight, height);
      await supabase.from("wellness_weight_logs").insert({
        participant_id: result.data.id,
        log_date: new Date().toISOString().slice(0, 10),
        weight_kg: initialWeight,
        bmi,
        bmi_status: interpretBmi(bmi),
        notes: "Berat awal program",
        created_by: user.id,
      });
    }

    return ok({ participant: result.data });
  } catch (error: any) {
    return fail(error?.message || "Gagal menyimpan peserta Wellness.", 500);
  }
}
