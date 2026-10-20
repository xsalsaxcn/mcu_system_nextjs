import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { fail, ok } from "@/lib/server/response";
import { getMcuCorporateSession } from "@/lib/server/mcuCorporateSession";
import { ensureMcuQueueEntry, ensureMcuQueueSession } from "@/lib/server/mcuQueue";

// MCU_DUAL_QUEUE_AUTO_ENQUEUE_V434
// MCU_REG_ONSPOT_SESSION_V440

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

async function tryEnqueueMcuCorporateParticipant(req: NextRequest, supabase: any, participant: any) {
  try {
    if (String(participant?.program_type || "").toLowerCase() !== "corporate") return;

    const selected = getMcuCorporateSession(req);
    if (!selected) return;

    const companyId = Number(participant?.company_id || 0);
    const packageId = Number(participant?.package_id || 0);
    if (!companyId || !packageId) return;
    if (companyId !== Number(selected.company_id) || packageId !== Number(selected.package_id)) return;

    const queueSession = await ensureMcuQueueSession(supabase, {
      companyId,
      packageId,
    });

    await ensureMcuQueueEntry(supabase, {
      queueSessionId: Number(queueSession.id),
      participantId: Number(participant.id),
    });
  } catch {
    // Antrian MCU bersifat tambahan. Jangan pernah menggagalkan Registrasi Ulang
    // bila SQL queue belum dipasang atau sinkronisasi antrian sedang bermasalah.
  }
}

export async function POST(req: NextRequest) {
  const user = getSessionUser(req);
  if (!user || user.role !== "admin") return fail("Unauthorized", 401);

  const body = await req.json();
  const id = Number(body.id || 0);
  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const programType = String(body.program_type || "corporate").toLowerCase();

  const commonPayload: any = {
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

  if (!commonPayload.name) return fail("Nama Lengkap wajib diisi.", 400);

  if (body.photo_data_url) {
    commonPayload.photo_data_url = body.photo_data_url;
    commonPayload.photo_updated_at = now;
  }

  if (id) {
    const { data, error } = await supabase
      .from("participants")
      .update(commonPayload)
      .eq("id", id)
      .select()
      .single();

    if (error) return fail(error.message, 500);

    await tryMarkRegistrationStage(supabase, id, programType || data?.program_type || "capaska", user);
    await tryEnqueueMcuCorporateParticipant(req, supabase, data);

    return ok({ participant: data, message: "Registrasi ulang berhasil disimpan." });
  }

  if (programType !== "corporate") return fail("Registrasi On The Spot saat ini khusus MCU Corporate.", 400);

  const activeSession = getMcuCorporateSession(req);
  const companyId = Number(body.company_id || activeSession?.company_id || 0);
  const packageId = Number(body.package_id || activeSession?.package_id || 0);
  if (!companyId || !packageId) return fail("Pilih Session MCU perusahaan + paket untuk Registrasi On The Spot.", 400);

  const [companyRes, packageRes] = await Promise.all([
    supabase.from("companies").select("id,name").eq("id", companyId).maybeSingle(),
    supabase.from("packages").select("id,name,company_id,program_type,is_active").eq("id", packageId).maybeSingle()
  ]);

  if (companyRes.error) return fail(companyRes.error.message, 500);
  if (packageRes.error) return fail(packageRes.error.message, 500);
  if (!companyRes.data) return fail("Perusahaan Session MCU tidak ditemukan.", 404);
  if (!packageRes.data || String(packageRes.data.program_type || "") !== "corporate" || Number(packageRes.data.is_active ?? 1) !== 1) {
    return fail("Paket MCU Corporate tidak ditemukan / tidak aktif.", 404);
  }

  let linked = Number(packageRes.data.company_id || 0) === companyId;
  if (!linked) {
    const { data: participantLink, error: participantLinkError } = await supabase
      .from("participants")
      .select("id")
      .eq("program_type", "corporate")
      .eq("company_id", companyId)
      .eq("package_id", packageId)
      .limit(1)
      .maybeSingle();
    if (participantLinkError) return fail(participantLinkError.message, 500);
    linked = Boolean(participantLink);
  }
  if (!linked) return fail("Paket belum terhubung ke perusahaan Session MCU yang dipilih.", 400);

  if (commonPayload.nik) {
    const { data: duplicate, error: duplicateError } = await supabase
      .from("participants")
      .select("id,name,mcu_id")
      .eq("program_type", "corporate")
      .eq("company_id", companyId)
      .eq("nik", commonPayload.nik)
      .limit(1)
      .maybeSingle();
    if (duplicateError) return fail(duplicateError.message, 500);
    if (duplicate) return fail(`NIK ini sudah terdaftar sebagai ${duplicate.name || "peserta"}${duplicate.mcu_id ? ` (${duplicate.mcu_id})` : ""}.`, 409);
  }

  const insertPayload: any = {
    ...commonPayload,
    program_type: "corporate",
    company_id: companyId,
    package_id: packageId,
    source_id: body.source_id || null,
    barcode_value: body.mcu_id || null
  };

  const { data: inserted, error: insertError } = await supabase
    .from("participants")
    .insert(insertPayload)
    .select()
    .single();
  if (insertError) return fail(insertError.message, 500);

  let finalParticipant = inserted;
  if (!inserted.mcu_id) {
    const generatedMcuId = `MCU-${String(inserted.id).padStart(6, "0")}`;
    const { data: patched, error: patchError } = await supabase
      .from("participants")
      .update({ mcu_id: generatedMcuId, barcode_value: generatedMcuId })
      .eq("id", inserted.id)
      .select()
      .single();
    if (patchError) return fail(patchError.message, 500);
    finalParticipant = patched;
  }

  await tryMarkRegistrationStage(supabase, Number(finalParticipant.id), "corporate", user);
  await tryEnqueueMcuCorporateParticipant(req, supabase, finalParticipant);

  return ok({
    participant: {
      ...finalParticipant,
      company_name: String(companyRes.data.name || ""),
      package_name: String(packageRes.data.name || ""),
      source_name: `Session MCU · ${String(companyRes.data.name || "")}`
    },
    created_on_spot: true,
    message: "Registrasi On The Spot berhasil disimpan."
  });
}
