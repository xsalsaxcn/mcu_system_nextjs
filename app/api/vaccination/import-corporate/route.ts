import { NextRequest } from "next/server";
import { canVaccinationAccess } from "@/lib/vaccination/access";
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
    phone: firstNonEmpty(row.phone),
    department: firstNonEmpty(row.department),
    company_name: "",
    // V566: database BINUS yang sudah pernah di-import menyimpan
    // jenis vaksin / BatchName di exam_type.
    vaccine_batch_name: firstNonEmpty(row.exam_type),
    location_name: firstNonEmpty(row.province),
    session_date: firstNonEmpty(row.service_date, row.mcu_date),
    time_slot: "",
    time_area_name: firstNonEmpty(row.province),
    import_location_key: "",
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

// V629: BINUSIAN/external ID can be shared by siblings and parents.
// Never treat a family/company identifier, email or phone as a unique person key.
// NIK is combined with the name instead of silently merging two different names.
function makeFamilySafeParticipantKey(row: any) {
  const name = normalizedText(row.participant_name);
  if (!name) return "";
  const nik = normalizedText(row.nik);
  return `name:${name}${nik ? `|nik:${nik}` : ""}`;
}

function makeLegacyParticipantIdentityKey(row: any) {
  return firstNonEmpty(
    row.nik ? `nik:${normalizedText(row.nik)}` : "",
    row.employee_id ? `external:${normalizedText(row.employee_id)}` : "",
    row.mcu_id ? `mcu:${normalizedText(row.mcu_id)}` : "",
    row.email ? `email:${normalizedText(row.email)}` : "",
    row.phone ? `phone:${normalizedText(row.phone)}` : "",
    `name:${normalizedText(row.participant_name)}|${normalizedText(row.location_name)}|${normalizedText(row.time_slot)}`,
  );
}

function groupVaccinationImportRows(rows: any[], familySafe = false) {
  const grouped = new Map<string, any>();
  for (const row of rows) {
    const key = familySafe ? makeFamilySafeParticipantKey(row) : makeLegacyParticipantIdentityKey(row);
    if (!key) continue;
    if (!grouped.has(key)) {
      grouped.set(key, { ...row, source_vaccine_rows: [], v629_identity_conflict: false });
    }
    const item = grouped.get(key)!;
    // Different external IDs with identical name and absent NIK are ambiguous.
    // This is audit metadata; never silently rewrite an existing registration.
    const beforeExternal = normalizedText(item.employee_id);
    const nextExternal = normalizedText(row.employee_id);
    if (familySafe && beforeExternal && nextExternal && beforeExternal !== nextExternal) {
      item.v629_identity_conflict = true;
    }
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

// V564_DUPLICATE_CATALOG_BATCH_MAPPING_SOURCE_OF_TRUTH
// Session hasil Duplicate Katalog membawa jejak "from Session <id>" pada Lot clone.
// Jika mapping BatchName target belum ada, turunkan mapping dari Session sumber
// dengan Product + Lot Number yang sama. Tidak ada fuzzy/semantic guessing.
async function ensureBatchMappingsFromCatalogClone(
  supabase: any,
  session: any,
  sourceId: number,
) {
  const sessionId = toInt(session?.id, 0);
  if (!sessionId || !sourceId) return { created: 0, updated: 0, sourceSessionIds: [] as number[] };

  const sessionVaccineResult = await supabase
    .from("vaccination_session_vaccines")
    .select("vaccine_id,lot_id,active")
    .eq("session_id", sessionId)
    .eq("active", true)
    .limit(5000);
  if (sessionVaccineResult.error) throw new Error(sessionVaccineResult.error.message);

  const targetLotIds = Array.from(
    new Set<number>(
      (sessionVaccineResult.data || [])
        .map((row: any) => toInt(row.lot_id, 0))
        .filter((id: number) => id > 0),
    ),
  );
  if (!targetLotIds.length) return { created: 0, updated: 0, sourceSessionIds: [] as number[] };

  const targetLotsResult = await supabase
    .from("vaccination_vaccine_lots")
    .select("id,vaccine_id,lot_number,inventory_notes,stock_session_id,active")
    .in("id", targetLotIds)
    .eq("active", true)
    .limit(5000);
  if (targetLotsResult.error) throw new Error(targetLotsResult.error.message);

  const sourceSessionIds = Array.from(
    new Set<number>(
      (targetLotsResult.data || [])
        .map((row: any) => {
          const match = clean(row.inventory_notes).match(/from\s+Session\s+(\d+)/i);
          return match ? toInt(match[1], 0) : 0;
        })
        .filter((id: number) => id > 0 && id !== sessionId),
    ),
  );
  if (!sourceSessionIds.length) {
    return { created: 0, updated: 0, sourceSessionIds: [] as number[] };
  }

  const sourceMappingsResult = await supabase
    .from("vaccination_session_batch_mappings")
    .select("session_id,source_id,source_batch_name,vaccine_id,lot_id,dose_number,active")
    .in("session_id", sourceSessionIds)
    .eq("source_id", sourceId)
    .eq("active", true)
    .limit(5000);
  if (sourceMappingsResult.error) throw new Error(sourceMappingsResult.error.message);

  const sourceLotIds = Array.from(
    new Set<number>(
      (sourceMappingsResult.data || [])
        .map((row: any) => toInt(row.lot_id, 0))
        .filter((id: number) => id > 0),
    ),
  );
  if (!sourceLotIds.length) {
    return { created: 0, updated: 0, sourceSessionIds };
  }

  const sourceLotsResult = await supabase
    .from("vaccination_vaccine_lots")
    .select("id,vaccine_id,lot_number")
    .in("id", sourceLotIds)
    .limit(5000);
  if (sourceLotsResult.error) throw new Error(sourceLotsResult.error.message);

  const sourceLotById = new Map<number, any>(
    (sourceLotsResult.data || []).map((row: any) => [toInt(row.id, 0), row]),
  );
  const targetLotByKey = new Map<string, any>();
  for (const row of targetLotsResult.data || []) {
    const vaccineId = toInt(row.vaccine_id, 0);
    const lotNumber = normalizedText(row.lot_number);
    if (!vaccineId || !lotNumber) continue;
    targetLotByKey.set(`${vaccineId}:${lotNumber}`, row);
  }

  const desiredByBatch = new Map<string, any>();
  for (const row of sourceMappingsResult.data || []) {
    const batchName = clean(row.source_batch_name);
    const vaccineId = toInt(row.vaccine_id, 0);
    const sourceLot = sourceLotById.get(toInt(row.lot_id, 0));
    const lotNumber = normalizedText(sourceLot?.lot_number);
    if (!batchName || !vaccineId || !lotNumber) continue;

    const targetLot = targetLotByKey.get(`${vaccineId}:${lotNumber}`);
    if (!targetLot) continue;

    const batchKey = normalizedText(batchName);
    const desired = {
      source_batch_name: batchName,
      vaccine_id: vaccineId,
      lot_id: toInt(targetLot.id, 0),
      dose_number: Math.max(1, toInt(row.dose_number, 1)),
    };
    const previous = desiredByBatch.get(batchKey);
    if (
      previous &&
      (toInt(previous.vaccine_id, 0) !== desired.vaccine_id ||
        toInt(previous.lot_id, 0) !== desired.lot_id ||
        toInt(previous.dose_number, 1) !== desired.dose_number)
    ) {
      throw new Error(
        `Mapping BatchName ${batchName} konflik antar Session sumber. Safety stop tanpa menebak vaksin.`,
      );
    }
    desiredByBatch.set(batchKey, desired);
  }

  if (!desiredByBatch.size) {
    return { created: 0, updated: 0, sourceSessionIds };
  }

  const existingResult = await supabase
    .from("vaccination_session_batch_mappings")
    .select("id,source_batch_name,vaccine_id,lot_id,dose_number,active")
    .eq("session_id", sessionId)
    .eq("source_id", sourceId)
    .limit(5000);
  if (existingResult.error) throw new Error(existingResult.error.message);

  const existingByBatch = new Map<string, any>();
  for (const row of existingResult.data || []) {
    const key = normalizedText(row.source_batch_name);
    if (key) existingByBatch.set(key, row);
  }

  let created = 0;
  let updated = 0;
  for (const [batchKey, desired] of desiredByBatch.entries()) {
    const existing = existingByBatch.get(batchKey);
    if (existing) {
      const changed =
        toInt(existing.vaccine_id, 0) !== desired.vaccine_id ||
        toInt(existing.lot_id, 0) !== desired.lot_id ||
        Math.max(1, toInt(existing.dose_number, 1)) !== desired.dose_number ||
        existing.active === false;
      if (!changed) continue;

      const updateResult = await supabase
        .from("vaccination_session_batch_mappings")
        .update({
          vaccine_id: desired.vaccine_id,
          lot_id: desired.lot_id,
          dose_number: desired.dose_number,
          active: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
      if (updateResult.error) throw new Error(updateResult.error.message);
      updated += 1;
      continue;
    }

    const insertResult = await supabase
      .from("vaccination_session_batch_mappings")
      .insert({
        session_id: sessionId,
        source_id: sourceId,
        source_batch_name: desired.source_batch_name,
        vaccine_id: desired.vaccine_id,
        lot_id: desired.lot_id,
        dose_number: desired.dose_number,
        active: true,
        updated_at: new Date().toISOString(),
      });
    if (insertResult.error) throw new Error(insertResult.error.message);
    created += 1;
  }

  return { created, updated, sourceSessionIds };
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

// V630: strict allowlist of seven BINUS CHILD sessions from audited Source 49.
// NEVER use Source 49 alone: BINUS Dewasa shares this data source.
const V630_BINUS_CHILD_SESSIONS: Record<number, { area: string; date: string }> = {
  190: { area: "surabaya", date: "2026-11-05" },
  191: { area: "medan", date: "2026-11-11" },
  192: { area: "bekasi", date: "2026-11-14" },
  193: { area: "anggrek", date: "2026-11-14" },
  194: { area: "bandung", date: "2026-11-26" },
  195: { area: "malang", date: "2026-11-26" },
  196: { area: "semarang", date: "2026-11-27" },
};

function isV630BinusChildSession(session: any, sourceId: number) {
  const id = toInt(session?.id, 0);
  const expected = V630_BINUS_CHILD_SESSIONS[id];
  return Boolean(expected)
    && sourceId === 49
    && toInt(session?.source_id, 0) === 49
    && normalizedText(session?.session_name).includes("binus healthday anak")
    && normalizedText(session?.location).includes(expected.area)
    && clean(session?.session_date).slice(0, 10) === expected.date;
}

// V629.3: strict child-only guard. Source 49 is shared with BINUS sessions,
// and must NEVER independently enable import protection or family-safe dedup.

async function fetchVaccinationSourceParticipants(supabase: any, sourceId: number, session: any) {
  const errors: string[] = [];
  const locationKey = clean(session.import_location_key);

  let vaccinationImportQuery = supabase
    .from("vaccination_import_rows")
    .select("id,source_id,participant_id,mcu_id,external_id,participant_name,nik,email,phone,employee_type,batch_name,time_area_name,time_name,location_name,session_date,time_slot,import_location_key")
    .eq("source_id", sourceId);

  // V561: filter di DB lebih dulu. Sebelumnya setiap klik Muat Peserta
  // menarik sampai 10.000 row source lalu baru difilter di Node.
  if (locationKey) {
    vaccinationImportQuery = vaccinationImportQuery.eq("import_location_key", locationKey);
  } else if (clean(session?.session_date)) {
    vaccinationImportQuery = vaccinationImportQuery.eq("session_date", clean(session.session_date));
  }

  const vaccinationImportResult = await vaccinationImportQuery.limit(10000);

  if (!vaccinationImportResult.error && Array.isArray(vaccinationImportResult.data) && vaccinationImportResult.data.length) {
    const rawRows = (vaccinationImportResult.data || []).filter((row: any) => {
      if (!locationKey && !clean(session?.location) && !clean(session?.session_date)) return true;
      return clean(row.import_location_key) === locationKey || sameLocationDate(row, session);
    });
    const rows = rawRows.map(normalizeRowFromVaccinationImport).filter((row: any) => clean(row.participant_name));
    if (rows.length) return { rows: groupVaccinationImportRows(rows, isV630BinusChildSession(session, sourceId)), sourceTable: "vaccination_import_rows", errors };
    errors.push("vaccination_import_rows: no rows for this exact location/date; trying participants");
  }
  if (vaccinationImportResult.error) errors.push(`vaccination_import_rows: ${vaccinationImportResult.error.message}`);

  // V566_EXISTING_PARTICIPANT_DATABASE_SOURCE_OF_TRUTH:
  // Data peserta BINUS seluruh lokasi sudah ada di tabel participants.
  // Jangan import ulang dan jangan tarik semua source. Ambil hanya peserta
  // milik Session aktif berdasarkan lokasi + tanggal.
  let participantQuery = supabase
    .from("participants")
    .select("id,name,external_id,mcu_id,nik,source_id,exam_type,province,service_date,mcu_date,department,phone")
    .eq("source_id", sourceId);

  const participantSessionLocation = clean(session?.location);
  const participantSessionDate = clean(session?.session_date);

  if (participantSessionLocation) {
    participantQuery = participantQuery.eq("province", participantSessionLocation);
  }
  if (participantSessionDate) {
    participantQuery = participantQuery.eq("service_date", participantSessionDate);
  }

  const attempts = [
    {
      table: "participants",
      query: () => participantQuery.limit(5000),
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
      const normalizedRows = result.data
        .map(attempt.mapper)
        .filter((row: any) => clean(row.participant_name));

      // participants menyimpan exam_type per row sebagai jenis vaksin source.
      // Bungkus menjadi source_vaccine_rows supaya mekanisme mapping Session
      // yang sudah terbentuk dari Duplicate Katalog dipakai persis seperti
      // vaccination_import_rows.
      const rows = attempt.table === "participants"
        ? groupVaccinationImportRows(normalizedRows, isV630BinusChildSession(session, sourceId))
        : normalizedRows;

      return { rows, sourceTable: attempt.table, errors };
    }
    if (result.error) errors.push(`${attempt.table}: ${result.error.message}`);
  }

  return { rows: [], sourceTable: "", errors };
}

// V630 READ ONLY: audited preview for the seven explicitly verified BINUS Child Sessions.
// Neither a GET request nor this code path creates registrations, vaccines or queue numbers.
export async function GET(req: NextRequest) {
  const user = requireUser(req);
  if (!user) return fail("Unauthorized", 401);
  if (!canVaccinationAccess(user, "register")) return fail("Akses registrasi vaksinasi ditolak.", 403);
  if (req.nextUrl.searchParams.get("mode") !== "v629-preview") {
    return fail("Mode tidak dikenali.", 400);
  }
  const sessionId = toInt(req.nextUrl.searchParams.get("session_id"), 0);
  if (!V630_BINUS_CHILD_SESSIONS[sessionId]) return fail("Audit BINUS Anak tidak tersedia untuk Session ini.", 403);
  const supabase = supabaseAdmin();
  const sessionRead = await supabase.from("vaccination_sessions")
    .select("id,source_id,session_name,location,session_date,import_location_key")
    .eq("id", sessionId).single();
  if (sessionRead.error || !sessionRead.data) return fail("Session audit tidak ditemukan.", 404);
  const session = sessionRead.data;
  if (!isV630BinusChildSession(session, 49)) return fail("Audit dibatalkan: metadata Session BINUS Anak tidak cocok.", 409);

  const imported = await fetchVaccinationSourceParticipants(supabase, 49, session);
  if (!imported.rows.length) return fail("Tidak ada baris source untuk audit V629.", 409, { errors: imported.errors });
  // V629.2: BINUS production may store the imported candidates in participants
  // (V566 source of truth). Both tables are read-only here, filtered to Session.
  // Do not expand to ai_mcu_import_rows: it is not a trusted input for this audit.
  if (imported.sourceTable !== "vaccination_import_rows" && imported.sourceTable !== "participants") {
    return fail("Sumber audit Session tidak cocok. Tidak ada data yang diubah.", 409, { sourceTable: imported.sourceTable, errors: imported.errors });
  }
  const registrationResult = await supabase.from("vaccination_registrations")
    .select("id,participant_id,participant_name,nik,employee_id,mcu_id")
    .eq("session_id", sessionId).limit(1000);
  if (registrationResult.error) return fail(registrationResult.error.message, 500);
  const regs = registrationResult.data || [];
  if (regs.length >= 1000) return fail("Jumlah registrasi mencapai batas audit 1000. Hentikan dan gunakan SQL read-only.", 409);

  const mapping = await getManualBatchMappings(supabase, sessionId, 49);
  const existingItemsRead = await supabase.from("vaccination_registration_items")
    .select("id,registration_id,vaccine_id,lot_id,dose_number,status,active")
    .eq("session_id", sessionId).limit(1000);
  if (existingItemsRead.error) return fail(existingItemsRead.error.message, 500);
  const existingItems = existingItemsRead.data || [];
  if (existingItems.length >= 1000) return fail("Item registrasi mencapai batas audit 1000. Hentikan dan gunakan SQL read-only.", 409);
  const itemsByRegistration = new Map<number, any[]>();
  for (const item of existingItems) {
    const registrationId = toInt(item.registration_id, 0);
    if (!itemsByRegistration.has(registrationId)) itemsByRegistration.set(registrationId, []);
    itemsByRegistration.get(registrationId)!.push(item);
  }
  const candidates: any[] = [];
  const nameCounts = new Map<string, number>();
  const existingByName = new Map<string, any[]>();
  const existingByExternal = new Map<string, any[]>();
  const legacyByExternal = new Map<string, Set<string>>();
  for (const row of regs) {
    const key = normalizedText(row.participant_name);
    if (!existingByName.has(key)) existingByName.set(key, []);
    existingByName.get(key)!.push(row);
    const external = normalizedText(row.employee_id);
    if (external) {
      if (!existingByExternal.has(external)) existingByExternal.set(external, []);
      existingByExternal.get(external)!.push(row);
    }
  }
  for (const row of imported.rows) {
    const name = normalizedText(row.participant_name);
    nameCounts.set(name, (nameCounts.get(name) || 0) + 1);
    const external = normalizedText(row.employee_id);
    if (external) {
      if (!legacyByExternal.has(external)) legacyByExternal.set(external, new Set<string>());
      legacyByExternal.get(external)!.add(name);
    }
  }
  for (const row of imported.rows) {
    const name = normalizedText(row.participant_name);
    const matches = existingByName.get(name) || [];
    const mapped = buildItemsFromManualMappings(mapping, row.source_vaccine_rows || []);
    const nik = normalizedText(row.nik);
    const conflictingNik = matches.some((reg: any) => normalizedText(reg.nik) && nik && normalizedText(reg.nik) !== nik);
    const identityConflict = Boolean(row.v629_identity_conflict || (nameCounts.get(name) || 0) > 1 || conflictingNik);
    const observedItems = matches.length === 1 ? (itemsByRegistration.get(toInt(matches[0].id, 0)) || []).filter((x: any) => x.active !== false) : [];
    const itemKey = (x: any) => `${toInt(x.vaccine_id, 0)}:${toInt(x.lot_id, 0)}:${toInt(x.dose_number, 1)}`;
    const expectedItemKeys = new Set(mapped.items.map(itemKey));
    const observedItemKeys = new Set(observedItems.map(itemKey));
    const unmatchedObserved = observedItems.filter((item: any) => !expectedItemKeys.has(itemKey(item)));
    const missingExpected = mapped.items.filter((item: any) => !observedItemKeys.has(itemKey(item)));
    const hasProductMismatch = matches.length === 1 && (unmatchedObserved.length > 0 || missingExpected.length > 0);
    const clinicalReview = matches.length === 1 && !identityConflict ?
      (hasProductMismatch ? "MATCHED_REVIEW_PRODUCT_ATTRIBUTION" : "MATCHED_EXISTS") :
      matches.length === 0 && !identityConflict && mapped.items.length > 0 ? "POSSIBLY_MISSING_REVIEW_BEFORE_INSERT" :
      "MANUAL_IDENTITY_REVIEW";
    const otherFamilyRegistrations = (existingByExternal.get(normalizedText(row.employee_id)) || [])
      .filter((r: any) => !matches.some((m: any) => m.id === r.id))
      .map((r: any) => ({ registrationId: r.id, participantName: r.participant_name }));
    candidates.push({
      name: clean(row.participant_name),
      // V629.4: read-only identity for the same-session search box.
      // Only participants.id is a safe person ID; import row IDs are NOT person IDs.
      participantId: imported.sourceTable === "participants" ? toInt(row.participant_id, 0) || null : null,
      employeeId: clean(row.employee_id),
      nik: clean(row.nik),
      // No item is created by preview; registered benefits must be reviewed in the original flow.
      sourceTable: imported.sourceTable,
      sourceRowIds: (row.source_vaccine_rows || []).map((r: any) => r.source_row_id),
      matchedRegistrationIds: matches.map((r: any) => r.id),
      sourceBatchNames: (row.source_vaccine_rows || []).map((r: any) => clean(r.vaccine_batch_name)),
      mappedVaccineIds: mapped.items.map((v: any) => v.vaccine_id),
      expectedItems: mapped.items.map((item: any) => ({ vaccineId: item.vaccine_id, lotId: item.lot_id, doseNumber: item.dose_number })),
      observedActiveItems: observedItems.map((item: any) => ({ itemId: item.id, vaccineId: item.vaccine_id, lotId: item.lot_id, doseNumber: item.dose_number, status: item.status })),
      unmatchedObservedItemIds: unmatchedObserved.map((item: any) => item.id),
      missingExpectedVaccineIds: missingExpected.map((item: any) => item.vaccine_id),
      existingRegistrationsWithSharedFamilyId: otherFamilyRegistrations,
      unmappedBatchNames: mapped.unmapped,
      sharedExternalIdWithOtherNames: (legacyByExternal.get(normalizedText(row.employee_id))?.size || 0) > 1,
      auditStatus: clinicalReview,
    });
  }
  return ok({
    mode: "V629_READ_ONLY_PREVIEW",
    sourceTable: imported.sourceTable,
    sourceErrors: imported.errors,
    sourceNote: imported.sourceTable === "participants"
      ? "Preview memakai peserta existing dari tabel participants yang sesuai lokasi dan tanggal Session. Jumlahnya tidak boleh diasumsikan sama dengan audit vaccination_import_rows."
      : "Preview memakai vaccination_import_rows. Hasil tetap memerlukan verifikasi identitas dan produk.",
    sessionId, sourceId: 49,
    importedSourceRows: imported.rows.reduce((n: number, row: any) => n + (row.source_vaccine_rows || []).length, 0),
    personsGroupedByNameAndNik: imported.rows.length,
    existingRegistrations: regs.length,
    existingActiveItems: existingItems.filter((x: any) => x.active !== false).length,
    missingCandidateCount: candidates.filter((x: any) => x.auditStatus === "POSSIBLY_MISSING_REVIEW_BEFORE_INSERT").length,
    productAttributionReviewCount: candidates.filter((x: any) => x.auditStatus === "MATCHED_REVIEW_PRODUCT_ATTRIBUTION").length,
    manualIdentityReviewCount: candidates.filter((x: any) => x.auditStatus === "MANUAL_IDENTITY_REVIEW").length,
    sharedExternalGroupCount: Array.from(legacyByExternal.values()).filter((names) => names.size > 1).length,
    advisory: "Preview read-only. Kandidat tidak otomatis dibuatkan registrasi/nomor antrean. Identitas dan vaksin harus diverifikasi saat datang; registrasi existing tetap utuh.",
    candidates,
  });
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
  // V630: refuse automatic bulk imports ONLY on the seven exact BINUS Child sessions.
  // Adult and unrelated sources/sessions retain their original importer behavior.
  if (V630_BINUS_CHILD_SESSIONS[sessionId] && !isV630BinusChildSession(session, sourceId)) {
    return fail("V630 SAFETY STOP: Session Anak tidak cocok dengan allowlist tanggal/lokasi/Source. Tidak ada perubahan.", 409);
  }
  if (isV630BinusChildSession(session, sourceId)) {
    return fail(
      "V630 SAFETY STOP: peserta BINUS Anak sudah tersedia di database sumber. Cari melalui Registrasi Ulang; impor massal dinonaktifkan demi keamanan identitas keluarga.",
      409,
      { v629PreviewUrl: `/api/vaccination/import-corporate?session_id=${sessionId}&mode=v629-preview` },
    );
  }

  let manualMappings = new Map<string, ManualMappingItem>();
  let catalogMappingSync = { created: 0, updated: 0, sourceSessionIds: [] as number[] };
  try {
    manualMappings = await getManualBatchMappings(supabase, sessionId, sourceId);
    if (!manualMappings.size) {
      catalogMappingSync = await ensureBatchMappingsFromCatalogClone(supabase, session, sourceId);
      manualMappings = await getManualBatchMappings(supabase, sessionId, sourceId);
    }
  } catch (error: any) {
    return fail(error?.message || "Gagal menurunkan mapping BatchName dari katalog Session.", 500);
  }

  if (!manualMappings.size) {
    return fail(
      "Katalog Session sudah ada, tetapi mapping BatchName belum dapat diturunkan dari Session sumber. Duplikat ulang katalog dari Session yang sudah memiliki mapping BatchName; sistem tidak akan menebak vaksin.",
      400,
      { catalogMappingSync },
    );
  }

  const imported = await fetchVaccinationSourceParticipants(supabase, sourceId, session);
  if (imported.rows.some((row: any) => row.v629_identity_conflict)) {
    return fail("V629: source import mengandung nama sama dengan identitas eksternal berbeda. Periksa data sebelum import; tidak ada data yang ditulis.", 409);
  }
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
    message: `Import database selesai. Peserta masuk: ${insertedRegistrations.length || 0}. Item produk dibuat dari mapping katalog Session: ${itemStats.count}. Peserta dilewati karena BatchName belum mapping: ${skippedUnmapped}.`,
    catalogMappingSync,
    inserted: insertedRegistrations.length || 0,
    itemCount: itemStats.count,
    skippedUnmapped,
    unmappedBatchExamples: Array.from(unmappedBatchExamples),
    skipped: imported.rows.length - rowsToInsert.length,
    sourceTable: imported.sourceTable,
    registrations: insertedRegistrations || [],
  });
}
