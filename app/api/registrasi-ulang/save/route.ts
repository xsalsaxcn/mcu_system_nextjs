import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { fail, ok } from "@/lib/server/response";

async function tryMarkRegistrationStage(supabase: any, participantId: number, programType: string, user: any) {
  try {
    const { data: post } = await supabase
      .from("posts")
      .select("id")
      .eq("program_type", programType || "capaska")
      .eq("name", "Registrasi Ulang")
      .maybeSingle();

    if (!post?.id) return;

    const { data: parameter } = await supabase
      .from("parameters")
      .select("id")
      .eq("post_id", post.id)
      .eq("name", "Status Registrasi Ulang")
      .maybeSingle();

    if (!parameter?.id) return;

    await supabase
      .from("examination_results")
      .delete()
      .eq("participant_id", participantId)
      .eq("parameter_id", parameter.id);

    const actor = user?.username || user?.name || "admin";
    const now = new Date().toISOString();

    const payloads = [
      { participant_id: participantId, parameter_id: parameter.id, value: "Done", updated_by: actor, updated_at: now },
      { participant_id: participantId, parameter_id: parameter.id, value: "Done" },
      { participant_id: participantId, parameter_id: parameter.id, result_value: "Done" }
    ];

    for (const payload of payloads) {
      const { error } = await supabase.from("examination_results").insert(payload);
      if (!error) return;
    }
  } catch {
    // Jangan gagalkan save identitas hanya karena progress marker gagal.
  }
}

export async function POST(req: NextRequest) {
  const user = getSessionUser(req);
  if (!user || user.role !== "admin") return fail("Unauthorized", 401);

  const body = await req.json();
  const id = Number(body.id || 0);
  if (!id) return fail("ID peserta tidak valid.", 400);

  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();

  const updatePayload: any = {
    name: String(body.name || "").trim(),
    mcu_id: body.mcu_id || null,
    external_id: body.external_id || null,
    nik: body.nik || null,
    employee_nik: body.employee_nik || null,
    gender: body.gender || null,
    birth_date: body.birth_date || null,
    date_of_birth: body.date_of_birth || body.birth_date || null,
    age: body.age ?? null,
    examination_date: body.examination_date || null,
    exam_date: body.exam_date || body.examination_date || null,
    department: body.department || null,
    province: body.province || null,
    phone: body.phone || null,
    registrasi_ulang_done: 1,
    registrasi_ulang_at: now
  };

  if (body.photo_data_url) {
    updatePayload.photo_data_url = body.photo_data_url;
    updatePayload.photo_updated_at = now;
  }

  const { data, error } = await supabase
    .from("participants")
    .update(updatePayload)
    .eq("id", id)
    .select()
    .single();

  if (error) return fail(error.message, 500);

  await tryMarkRegistrationStage(supabase, id, body.program_type || data?.program_type || "capaska", user);

  return ok({
    participant: data,
    message: "Registrasi ulang berhasil disimpan."
  });
}
