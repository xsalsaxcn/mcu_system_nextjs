import { NextRequest } from "next/server";
import { clean, fail, ok, requireUser, supabaseAdmin, toInt } from "../_utils";

export const dynamic = "force-dynamic";

function firstNonEmpty(...values: any[]) {
  for (const value of values) {
    const text = clean(value);
    if (text) return text;
  }
  return "";
}

function normalizeRowFromParticipant(row: any) {
  return {
    source_row_id: row.id,
    participant_id: row.id,
    participant_name: firstNonEmpty(row.name, row.participant_name, row.nama, row.full_name),
    employee_id: firstNonEmpty(row.employee_id, row.external_id, row.employee_nik, row.nrp),
    nik: firstNonEmpty(row.nik, row.employee_nik, row.ktp),
    mcu_id: firstNonEmpty(row.mcu_id, row.nomcu, row.no_mcu, row.external_id),
    email: firstNonEmpty(row.email, row.email_address),
    phone: firstNonEmpty(row.phone, row.phone_number, row.mobile),
    department: firstNonEmpty(row.department, row.department_name, row.dept, row.unit),
    company_name: firstNonEmpty(row.company_name, row.institution_name),
  };
}

function normalizeRowFromImport(row: any) {
  const data = row.row_data || {};
  return {
    source_row_id: row.id,
    participant_id: row.participant_id || row.id,
    participant_name: firstNonEmpty(row.participant_name, data.NAMA, data.Nama, data["Nama Peserta"], data.name),
    employee_id: firstNonEmpty(data.NRP, data.ID, data.employee_id, data.external_id),
    nik: firstNonEmpty(row.nik, data.NIK, data.nik, data.KTP),
    mcu_id: firstNonEmpty(row.mcu_id, data.NOMCU, data["NO MCU"], data["NO.MCU"], data.MCU_ID, data.NO),
    email: firstNonEmpty(data.EMAIL, data.Email, data.email),
    phone: firstNonEmpty(data.HP, data.Phone, data.phone, data["No HP"]),
    department: firstNonEmpty(data.DEPARTEMEN, data.DEPARTMENT, data.DEPT, data["Dept/Bagian"]),
    company_name: firstNonEmpty(data["Nama PT"], data.Perusahaan, data.company_name),
  };
}

function makeKey(row: any) {
  return [
    clean(row.participant_id),
    clean(row.mcu_id).toLowerCase(),
    clean(row.nik).toLowerCase(),
    clean(row.participant_name).toLowerCase(),
  ].filter(Boolean).join("|");
}

async function fetchCorporateParticipants(supabase: any, sourceId: number) {
  const attempts = [
    {
      table: "participants",
      query: () => supabase
        .from("participants")
        .select("id,name,participant_name,full_name,external_id,mcu_id,nik,employee_nik,employee_id,email,phone,phone_number,mobile,department,department_name,dept,unit,source_id,company_name,institution_name")
        .eq("source_id", sourceId)
        .limit(5000),
      mapper: normalizeRowFromParticipant,
    },
    {
      table: "ai_mcu_import_rows",
      query: () => supabase
        .from("ai_mcu_import_rows")
        .select("id,source_id,participant_id,participant_name,mcu_id,nik,row_data")
        .eq("source_id", sourceId)
        .limit(5000),
      mapper: normalizeRowFromImport,
    },
  ];

  const errors: string[] = [];

  for (const attempt of attempts) {
    const result = await attempt.query();

    if (!result.error && Array.isArray(result.data) && result.data.length) {
      const rows = result.data
        .map(attempt.mapper)
        .filter((row: any) => clean(row.participant_name));

      return { rows, sourceTable: attempt.table, errors };
    }

    if (result.error) errors.push(`${attempt.table}: ${result.error.message}`);
  }

  return { rows: [], sourceTable: "", errors };
}

export async function POST(req: NextRequest) {
  const user = requireUser(req);
  if (!user) return fail("Unauthorized", 401);

  const body = await req.json().catch(() => ({}));
  const sessionId = toInt(body.sessionId || body.session_id, 0);
  const sourceIdInput = toInt(body.sourceId || body.source_id, 0);

  if (!sessionId) return fail("Session wajib dipilih.");

  const supabase = supabaseAdmin();

  const sessionResult = await supabase.from("vaccination_sessions").select("*").eq("id", sessionId).single();
  if (sessionResult.error) return fail(sessionResult.error.message, 500);

  const session = sessionResult.data || {};
  const sourceId = sourceIdInput || toInt(session.source_id, 0);
  if (!sourceId) return fail("Database corporate/source wajib dipilih.");

  const imported = await fetchCorporateParticipants(supabase, sourceId);
  if (!imported.rows.length) {
    return fail("Tidak menemukan peserta dari database corporate yang dipilih.", 404, {
      sourceId,
      checkedSources: ["participants", "ai_mcu_import_rows"],
      errors: imported.errors,
    });
  }

  const existingResult = await supabase
    .from("vaccination_registrations")
    .select("id,participant_id,mcu_id,nik,participant_name")
    .eq("session_id", sessionId);

  if (existingResult.error) return fail(existingResult.error.message, 500);

  const existingKeys = new Set((existingResult.data || []).map(makeKey));
  const defaultVaccineId = toInt(session.default_vaccine_id, 0) || null;

  const rowsToInsert: any[] = [];

  for (const participant of imported.rows) {
    const key = makeKey(participant);
    if (key && existingKeys.has(key)) continue;

    rowsToInsert.push({
      session_id: sessionId,
      source_id: sourceId,
      participant_id: toInt(participant.participant_id, 0) || null,
      vaccine_id: defaultVaccineId,
      participant_name: participant.participant_name,
      employee_id: clean(participant.employee_id) || null,
      nik: clean(participant.nik) || null,
      mcu_id: clean(participant.mcu_id) || null,
      email: clean(participant.email) || null,
      phone: clean(participant.phone) || null,
      company_name: clean(participant.company_name) || clean(session.company_name) || clean(session.source_name) || null,
      department: clean(participant.department) || null,
      queue_number: null,
      queue_status: "IMPORTED",
      registered_by: ((user as any).email || (user as any).name || (user as any).id || "system"),
    });

    if (key) existingKeys.add(key);
  }

  if (!rowsToInsert.length) {
    return ok({
      message: "Semua peserta dari database corporate sudah pernah diimport ke session ini.",
      inserted: 0,
      skipped: imported.rows.length,
      sourceTable: imported.sourceTable,
    });
  }

  const insertResult = await supabase
    .from("vaccination_registrations")
    .insert(rowsToInsert)
    .select("*");

  if (insertResult.error) return fail(insertResult.error.message, 500);

  return ok({
    message: `Import corporate selesai. Peserta masuk: ${insertResult.data?.length || 0}. Nomor antrian belum dirilis sampai registrasi ulang/kedatangan.`,
    inserted: insertResult.data?.length || 0,
    skipped: imported.rows.length - rowsToInsert.length,
    sourceTable: imported.sourceTable,
    registrations: insertResult.data || [],
  });
}
