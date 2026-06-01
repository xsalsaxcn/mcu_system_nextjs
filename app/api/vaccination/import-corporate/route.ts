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

function normalizedText(value: any) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function sameLocationDate(row: any, session: any) {
  const sessionLocation = normalizedText(session?.location);
  const rowLocation = normalizedText(row?.location_name || row?.time_area_name);
  const sessionDate = clean(session?.session_date);
  const rowDate = clean(row?.session_date);
  const locationOk = !sessionLocation || rowLocation === sessionLocation || rowLocation.includes(sessionLocation) || sessionLocation.includes(rowLocation);
  const dateOk = !sessionDate || rowDate === sessionDate;
  return locationOk && dateOk;
}

function normalizeRowFromVaccinationImport(row: any) {
  return {
    source_row_id: row.id,
    participant_id: row.participant_id || row.id,
    participant_name: firstNonEmpty(row.participant_name),
    employee_id: firstNonEmpty(row.external_id),
    nik: firstNonEmpty(row.nik),
    mcu_id: firstNonEmpty(row.mcu_id, row.external_id),
    email: firstNonEmpty(row.email),
    phone: firstNonEmpty(row.phone),
    department: firstNonEmpty(row.employee_type),
    company_name: "",
    vaccine_batch_name: firstNonEmpty(row.batch_name),
    location_name: firstNonEmpty(row.location_name),
    session_date: firstNonEmpty(row.session_date),
    time_slot: firstNonEmpty(row.time_slot, row.time_name),
    time_area_name: firstNonEmpty(row.time_area_name),
    import_location_key: firstNonEmpty(row.import_location_key),
  };
}

function normalizeRowFromParticipant(row: any) {
  return {
    source_row_id: row.id,
    participant_id: row.id,
    participant_name: firstNonEmpty(row.name, row.participant_name, row.nama, row.full_name),
    employee_id: firstNonEmpty(row.external_id),
    nik: firstNonEmpty(row.nik),
    mcu_id: firstNonEmpty(row.mcu_id, row.external_id),
    email: "",
    phone: "",
    department: firstNonEmpty(row.exam_type),
    company_name: "",
    vaccine_batch_name: firstNonEmpty(row.exam_type),
  };
}

function normalizeRowFromImport(row: any) {
  const data = row.row_data || {};
  return {
    source_row_id: row.id,
    participant_id: row.participant_id || row.id,
    participant_name: firstNonEmpty(data.NAMA, data.Nama, data["Nama Peserta"], data.name, row.participant_name),
    employee_id: firstNonEmpty(data.NRP, data.ID, data.employee_id, data.external_id, data.BinusianID),
    nik: firstNonEmpty(row.nik, data.NIK, data.nik, data.KTP),
    mcu_id: firstNonEmpty(row.mcu_id, data.NOMCU, data["NO MCU"], data["NO.MCU"], data.MCU_ID, data.NO),
    email: firstNonEmpty(data.EMAIL, data.Email, data.email),
    phone: firstNonEmpty(data.HP, data.Phone, data.phone, data["No HP"]),
    department: firstNonEmpty(data.DEPARTEMEN, data.DEPARTMENT, data.DEPT, data["Dept/Bagian"], data.TypeEmployee),
    company_name: firstNonEmpty(data["Nama PT"], data.Perusahaan, data.company_name),
    vaccine_batch_name: firstNonEmpty(data.BatchName, data["Nama Vaksin"], data.Vaksin, data["Produk Vaksin"]),
  };
}

function makeParticipantIdentityKey(row: any) {
  return firstNonEmpty(
    row.nik ? `nik:${normalizedText(row.nik)}` : "",
    row.employee_id ? `external:${normalizedText(row.employee_id)}` : "",
    row.mcu_id ? `mcu:${normalizedText(row.mcu_id)}` : "",
    row.email ? `email:${normalizedText(row.email)}` : "",
    row.phone ? `phone:${normalizedText(row.phone)}` : "",
    `name:${normalizedText(row.participant_name)}|${normalizedText(row.location_name)}|${normalizedText(row.time_slot)}`,
  );
}

function groupVaccinationImportRows(rows: any[]) {
  const grouped = new Map<string, any>();
  for (const row of rows) {
    const key = makeParticipantIdentityKey(row);
    if (!key) continue;
    if (!grouped.has(key)) {
      grouped.set(key, { ...row, source_vaccine_rows: [] });
    }
    const item = grouped.get(key)!;
    item.source_vaccine_rows.push(row);
    item.nik = item.nik || row.nik;
    item.email = item.email || row.email;
    item.phone = item.phone || row.phone;
    item.department = item.department || row.department;
  }
  return Array.from(grouped.values());
}

type ManualMappingItem = {
  source_batch_name: string;
  vaccine_id: number;
  lot_id: number | null;
  dose_number: number;
  price_category: string | null;
  price: number | null;
  vaccine?: any;
};

async function getManualBatchMappings(supabase: any, sessionId: number, sourceId: number) {
  const result = await supabase
    .from("vaccination_session_batch_mappings")
    .select("source_batch_name,vaccine_id,lot_id,dose_number,vaccine:vaccination_vaccines(id,name,brand,price,price_category)")
    .eq("session_id", sessionId)
    .eq("source_id", sourceId)
    .eq("active", true);

  if (result.error) {
    throw new Error(`${result.error.message}. Jalankan sql_vaccination_v64_manual_batch_mapping.sql di Supabase.`);
  }

  const map = new Map<string, ManualMappingItem>();
  for (const row of result.data || []) {
    const batchName = clean(row.source_batch_name);
    const vaccineId = toInt(row.vaccine_id, 0);
    if (!batchName || !vaccineId) continue;
    map.set(normalizedText(batchName), {
      source_batch_name: batchName,
      vaccine_id: vaccineId,
      lot_id: toInt(row.lot_id, 0) || null,
      dose_number: Math.max(1, toInt(row.dose_number, 1)),
      price_category: clean((row as any).vaccine?.price_category) || null,
      price: (row as any).vaccine?.price ?? null,
      vaccine: (row as any).vaccine || null,
    });
  }
  return map;
}

function buildItemsFromManualMappings(mapping: Map<string, ManualMappingItem>, sourceRows: any[]) {
  const rows = sourceRows || [];
  const items: any[] = [];
  const seen = new Set<string>();
  const unmapped = new Set<string>();

  for (const sourceRow of rows) {
    const batchName = clean(sourceRow.vaccine_batch_name || sourceRow.batch_name);
    if (!batchName) {
      unmapped.add("BatchName kosong");
      continue;
    }

    const mapped = mapping.get(normalizedText(batchName));
    if (!mapped) {
      unmapped.add(batchName);
      continue;
    }

    const key = `${mapped.vaccine_id}:${mapped.lot_id || ""}:${mapped.dose_number}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({
      vaccine_id: mapped.vaccine_id,
      lot_id: mapped.lot_id || null,
      dose_number: mapped.dose_number || 1,
      price_category: mapped.price_category || null,
      price: mapped.price ?? null,
      item_note: `Manual mapping BatchName: ${batchName}`,
      source_batch_name: batchName,
    });
  }

  return { items, unmapped: Array.from(unmapped.values()) };
}

async function insertInChunks(supabase: any, tableName: string, rows: any[], chunkSize = 500, selectRows = false) {
  const inserted: any[] = [];
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    let query = supabase.from(tableName).insert(chunk);
    if (selectRows) query = query.select("*");
    const result = await query;
    if (result.error) throw new Error(result.error.message);
    if (selectRows && Array.isArray(result.data)) inserted.push(...result.data);
  }
  return inserted;
}

async function createItemsForImportedRegistrations(supabase: any, registrations: any[], user: any, mappedItemsByKey: Map<string, any[]>) {
  if (!registrations.length) return { count: 0 };

  const createdBy = (user as any).email || (user as any).name || (user as any).id || "system";
  const rows: any[] = [];

  for (const registration of registrations) {
    const key = makeKey(registration);
    const items = mappedItemsByKey.get(key) || [];

    for (const item of items) {
      rows.push({
        registration_id: registration.id,
        session_id: registration.session_id,
        vaccine_id: item.vaccine_id,
        lot_id: item.lot_id || null,
        dose_number: item.dose_number || 1,
        price_category: item.price_category || null,
        price: item.price ?? null,
        payment_method: null,
        payment_note: null,
        item_note: item.item_note || null,
        item_source: "manual_batch_mapping",
        status: "WAITING",
        active: true,
        created_by: createdBy,
      });
    }
  }

  if (!rows.length) return { count: 0 };

  await insertInChunks(supabase, "vaccination_registration_items", rows, 500, false);
  return { count: rows.length };
}

function makeKey(row: any) {
  return [
    clean(row.participant_id),
    clean(row.mcu_id).toLowerCase(),
    clean(row.nik).toLowerCase(),
    clean(row.participant_name).toLowerCase(),
  ].filter(Boolean).join("|");
}

async function fetchVaccinationSourceParticipants(supabase: any, sourceId: number, session: any) {
  const errors: string[] = [];
  const locationKey = clean(session.import_location_key);

  const vaccinationImportResult = await supabase
    .from("vaccination_import_rows")
    .select("id,source_id,participant_id,mcu_id,external_id,participant_name,nik,email,phone,employee_type,batch_name,time_area_name,time_name,location_name,session_date,time_slot,import_location_key")
    .eq("source_id", sourceId)
    .limit(10000);

  if (!vaccinationImportResult.error && Array.isArray(vaccinationImportResult.data) && vaccinationImportResult.data.length) {
    const rawRows = (vaccinationImportResult.data || []).filter((row: any) => {
      if (!locationKey && !clean(session?.location) && !clean(session?.session_date)) return true;
      return clean(row.import_location_key) === locationKey || sameLocationDate(row, session);
    });
    const rows = rawRows.map(normalizeRowFromVaccinationImport).filter((row: any) => clean(row.participant_name));
    return { rows: groupVaccinationImportRows(rows), sourceTable: "vaccination_import_rows", errors };
  }
  if (vaccinationImportResult.error) errors.push(`vaccination_import_rows: ${vaccinationImportResult.error.message}`);

  const attempts = [
    {
      table: "participants",
      query: () => supabase.from("participants").select("id,name,external_id,mcu_id,nik,source_id,exam_type").eq("source_id", sourceId).limit(5000),
      mapper: normalizeRowFromParticipant,
    },
    {
      table: "ai_mcu_import_rows",
      query: () => supabase.from("ai_mcu_import_rows").select("id,source_id,participant_id,participant_name,mcu_id,nik,row_data").eq("source_id", sourceId).limit(5000),
      mapper: normalizeRowFromImport,
    },
  ];

  for (const attempt of attempts) {
    const result = await attempt.query();
    if (!result.error && Array.isArray(result.data) && result.data.length) {
      const rows = result.data.map(attempt.mapper).filter((row: any) => clean(row.participant_name));
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
  if (!sourceId) return fail("Database corporate/vaksinasi wajib dipilih.");

  let manualMappings = new Map<string, ManualMappingItem>();
  try {
    manualMappings = await getManualBatchMappings(supabase, sessionId, sourceId);
  } catch (error: any) {
    return fail(error?.message || "Gagal membaca mapping manual vaksin.", 500);
  }

  if (!manualMappings.size) {
    return fail(
      "Mapping manual vaksin belum dibuat di Session Setup. Map setiap BatchName dari database ke vaksin/lot session sebelum import peserta.",
      400,
    );
  }

  const imported = await fetchVaccinationSourceParticipants(supabase, sourceId, session);
  if (!imported.rows.length) {
    return fail("Tidak menemukan peserta dari database corporate/vaksinasi yang dipilih untuk session/lokasi ini.", 404, {
      sourceId,
      locationKey: session.import_location_key || null,
      checkedSources: ["vaccination_import_rows", "participants", "ai_mcu_import_rows"],
      errors: imported.errors,
    });
  }

  const existingResult = await supabase.from("vaccination_registrations").select("id,participant_id,mcu_id,nik,participant_name").eq("session_id", sessionId);
  if (existingResult.error) return fail(existingResult.error.message, 500);

  const existingKeys = new Set((existingResult.data || []).map(makeKey));
  const rowsToInsert: any[] = [];
  const mappedItemsByKey = new Map<string, any[]>();
  const unmappedBatchExamples = new Set<string>();
  let skippedUnmapped = 0;

  for (const participant of imported.rows) {
    const key = makeKey(participant);
    if (key && existingKeys.has(key)) continue;

    const sourceRows = participant.source_vaccine_rows || [];
    const mapped = buildItemsFromManualMappings(manualMappings, sourceRows);
    mapped.unmapped.slice(0, 10).forEach((name) => unmappedBatchExamples.add(name));

    if (!mapped.items.length) {
      skippedUnmapped += 1;
      continue;
    }

    rowsToInsert.push({
      session_id: sessionId,
      source_id: sourceId,
      participant_id: toInt(participant.participant_id, 0) || null,
      vaccine_id: mapped.items[0]?.vaccine_id || null,
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
      registered_by: (user as any).email || (user as any).name || (user as any).id || "system",
    });

    if (key) {
      existingKeys.add(key);
      mappedItemsByKey.set(key, mapped.items);
    }
  }

  if (!rowsToInsert.length) {
    if (skippedUnmapped) {
      return fail(
        `Tidak ada peserta yang bisa diimport karena BatchName belum termapping. Contoh belum mapping: ${Array.from(unmappedBatchExamples).join(", ") || "-"}.`,
        400,
        { skippedUnmapped, unmappedBatchExamples: Array.from(unmappedBatchExamples) },
      );
    }

    return ok({
      message: "Semua peserta dari database corporate/vaksinasi sudah pernah diimport ke session ini.",
      inserted: 0,
      skipped: imported.rows.length,
      sourceTable: imported.sourceTable,
    });
  }

  let insertedRegistrations: any[] = [];
  try {
    insertedRegistrations = await insertInChunks(supabase, "vaccination_registrations", rowsToInsert, 500, true);
  } catch (error: any) {
    return fail(error?.message || "Gagal import peserta vaksinasi.", 500);
  }

  let itemStats = { count: 0 };
  try {
    itemStats = await createItemsForImportedRegistrations(supabase, insertedRegistrations || [], user, mappedItemsByKey);
  } catch (error: any) {
    return fail(`Peserta berhasil diimport, tapi gagal membuat item produk: ${error?.message || error}`, 500);
  }

  return ok({
    message: `Import database selesai. Peserta masuk: ${insertedRegistrations.length || 0}. Item produk dibuat dari mapping manual: ${itemStats.count}. Peserta dilewati karena BatchName belum mapping: ${skippedUnmapped}.`,
    inserted: insertedRegistrations.length || 0,
    itemCount: itemStats.count,
    skippedUnmapped,
    unmappedBatchExamples: Array.from(unmappedBatchExamples),
    skipped: imported.rows.length - rowsToInsert.length,
    sourceTable: imported.sourceTable,
    registrations: insertedRegistrations || [],
  });
}
