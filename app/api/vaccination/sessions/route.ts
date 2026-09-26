import { NextRequest } from "next/server";
import { clean, fail, ok, requireUser, supabaseAdmin, toInt } from "../_utils";
import { canVaccinationAccess } from "@/lib/vaccination/access";

// VACCINATION_ROLE_GUARD_V150
export const dynamic = "force-dynamic";

type BatchMappingInput = {
  sourceBatchName: string;
  vaccineId: number | string;
  lotId: number | string;
  doseNumber?: number | string;
};

type SessionLocationGroup = {
  key: string;
  locationName: string;
  sessionDate: string;
  timeSlot: string;
  batchName: string;
  timeAreaName: string;
  participantCount: number;
  participantKeys: Set<string>;
  timeSlots: Set<string>;
};

async function attachSessionVaccines(supabase: any, sessions: any[]) {
  if (!sessions.length) return sessions;

  const sessionIds = sessions.map((session) => session.id);

  const [svResult, mappingResult] = await Promise.all([
    supabase
      .from("vaccination_session_vaccines")
      .select(
        `
        *,
        vaccine:vaccination_vaccines(id,name,brand,default_next_dose_days,reminder_days_before),
        lot:vaccination_vaccine_lots(id,lot_number,expiry_date,stock_initial,stock_used,stock_added)
      `,
      )
      .in("session_id", sessionIds)
      .eq("active", true)
      .order("id", { ascending: true }),
    supabase
      .from("vaccination_session_batch_mappings")
      .select(
        "id,session_id,source_id,source_batch_name,vaccine_id,lot_id,dose_number,active,created_at,updated_at",
      )
      .in("session_id", sessionIds)
      .eq("active", true)
      .order("id", { ascending: true }),
  ]);

  const vaccineGrouped = new Map<number, any[]>();
  if (!svResult.error) {
    for (const item of svResult.data || []) {
      const key = Number(item.session_id);
      if (!vaccineGrouped.has(key)) vaccineGrouped.set(key, []);
      vaccineGrouped.get(key)!.push(item);
    }
  }

  const mappingGrouped = new Map<number, any[]>();
  if (!mappingResult.error) {
    for (const item of mappingResult.data || []) {
      const key = Number(item.session_id);
      if (!mappingGrouped.has(key)) mappingGrouped.set(key, []);
      mappingGrouped.get(key)!.push(item);
    }
  }

  return sessions.map((session) => ({
    ...session,
    session_vaccines: vaccineGrouped.get(Number(session.id)) || [],
    batch_mappings: mappingGrouped.get(Number(session.id)) || [],
  }));
}

function sessionVaccineKey(vaccineId: any, lotId: any, doseNumber: any) {
  return `${toInt(vaccineId, 0)}|${toInt(lotId, 0)}|${Math.max(1, toInt(doseNumber, 1))}`;
}

async function syncSessionVaccines(
  supabase: any,
  sessionId: number,
  sessionVaccines: any[],
) {
  const desired = new Map<string, any>();
  for (const item of sessionVaccines || []) {
    const vaccineId = toInt(item.vaccineId, 0);
    const lotId = toInt(item.lotId, 0);
    const doseNumber = Math.max(1, toInt(item.doseNumber, 1));
    if (!vaccineId || !lotId) continue;
    desired.set(sessionVaccineKey(vaccineId, lotId, doseNumber), {
      vaccineId,
      lotId,
      doseNumber,
    });
  }

  const currentResult = await supabase
    .from("vaccination_session_vaccines")
    .select("id,session_id,vaccine_id,lot_id,dose_number,active")
    .eq("session_id", sessionId);
  if (currentResult.error) throw new Error(currentResult.error.message);

  const seen = new Set<string>();
  for (const row of currentResult.data || []) {
    const key = sessionVaccineKey(row.vaccine_id, row.lot_id, row.dose_number);
    if (desired.has(key)) {
      seen.add(key);
      if (row.active !== true) {
        const activateResult = await supabase
          .from("vaccination_session_vaccines")
          .update({ active: true, updated_at: new Date().toISOString() })
          .eq("id", row.id);
        if (activateResult.error) throw new Error(activateResult.error.message);
      }
    } else if (row.active === true) {
      const deactivateResult = await supabase
        .from("vaccination_session_vaccines")
        .update({ active: false, updated_at: new Date().toISOString() })
        .eq("id", row.id);
      if (deactivateResult.error) throw new Error(deactivateResult.error.message);
    }
  }

  const inserts = Array.from(desired.entries())
    .filter(([key]) => !seen.has(key))
    .map(([, item]) => ({
      session_id: sessionId,
      vaccine_id: item.vaccineId,
      lot_id: item.lotId,
      dose_number: item.doseNumber,
      active: true,
    }));

  if (inserts.length) {
    const insertResult = await supabase
      .from("vaccination_session_vaccines")
      .insert(inserts);
    if (insertResult.error) throw new Error(insertResult.error.message);
  }
}

async function syncSessionBatchMappings(
  supabase: any,
  sessionId: number,
  sourceId: number,
  batchMappings: BatchMappingInput[],
) {
  const desired = new Map<string, any>();
  for (const mapping of batchMappings || []) {
    const sourceBatchName = clean(mapping.sourceBatchName);
    const vaccineId = toInt(mapping.vaccineId, 0);
    const lotId = toInt(mapping.lotId, 0);
    const doseNumber = Math.max(1, toInt(mapping.doseNumber, 1));
    if (!sourceBatchName || !vaccineId || !lotId) continue;
    desired.set(sourceBatchName.toLowerCase(), {
      sourceBatchName,
      vaccineId,
      lotId,
      doseNumber,
    });
  }

  const currentResult = await supabase
    .from("vaccination_session_batch_mappings")
    .select("id,session_id,source_id,source_batch_name,vaccine_id,lot_id,dose_number,active")
    .eq("session_id", sessionId)
    .eq("active", true);
  if (currentResult.error) {
    throw new Error(
      `${currentResult.error.message}. Jalankan sql_vaccination_v64_manual_batch_mapping.sql di Supabase.`,
    );
  }

  const existingByName = new Map<string, any>();
  for (const row of currentResult.data || []) {
    existingByName.set(clean(row.source_batch_name).toLowerCase(), row);
  }

  for (const [key, row] of existingByName) {
    const next = desired.get(key);
    if (!next) {
      // Preserve an existing mapping that is outside the currently visible
      // BatchName set. V153.3 must never erase old mapping just because a new
      // product was added.
      continue;
    }

    const updateResult = await supabase
      .from("vaccination_session_batch_mappings")
      .update({
        source_id: sourceId || row.source_id || null,
        source_batch_name: next.sourceBatchName,
        vaccine_id: next.vaccineId,
        lot_id: next.lotId,
        dose_number: next.doseNumber,
        active: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    if (updateResult.error) throw new Error(updateResult.error.message);
    desired.delete(key);
  }

  const inserts = Array.from(desired.values()).map((item) => ({
    session_id: sessionId,
    source_id: sourceId || null,
    source_batch_name: item.sourceBatchName,
    vaccine_id: item.vaccineId,
    lot_id: item.lotId,
    dose_number: item.doseNumber,
    active: true,
  }));

  if (inserts.length) {
    const insertResult = await supabase
      .from("vaccination_session_batch_mappings")
      .insert(inserts);
    if (insertResult.error) {
      throw new Error(
        `${insertResult.error.message}. Jalankan sql_vaccination_v64_manual_batch_mapping.sql di Supabase.`,
      );
    }
  }
}

function normalizeKey(value: any) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function makeFallbackKey(
  sourceId: number,
  locationName: string,
  sessionDate: string,
) {
  return [
    sourceId,
    normalizeKey(locationName) || "lokasi belum ditentukan",
    sessionDate || "tanpa tanggal",
  ].join("|");
}

function participantKey(row: any) {
  return clean(row.nik) || clean(row.external_id) || clean(row.mcu_id) || clean(row.email) || `${normalizeKey(row.participant_name)}|${normalizeKey(row.location_name)}`;
}

async function getSourceLocationGroups(supabase: any, sourceId: number) {
  const result = await supabase
    .from("vaccination_import_rows")
    .select(
      "source_id,batch_name,time_area_name,time_name,location_name,session_date,time_slot,import_location_key,mcu_id,external_id,participant_name,nik,email",
    )
    .eq("source_id", sourceId)
    .order("session_date", { ascending: true })
    .order("location_name", { ascending: true })
    .order("time_slot", { ascending: true })
    .limit(10000);

  if (result.error) throw new Error(result.error.message);

  const grouped = new Map<string, SessionLocationGroup>();

  for (const row of result.data || []) {
    const locationName =
      clean(row.location_name) ||
      clean(row.time_area_name) ||
      "Lokasi belum ditentukan";
    const sessionDate = clean(row.session_date);
    const timeSlot =
      clean(row.time_slot) || clean(row.time_name) || "Belum ditentukan";
    const key = makeFallbackKey(sourceId, locationName, sessionDate);

    if (!grouped.has(key)) {
      grouped.set(key, {
        key,
        locationName,
        sessionDate,
        timeSlot: "Gabungan semua jam",
        batchName: clean(row.batch_name),
        timeAreaName: clean(row.time_area_name),
        participantCount: 0,
        participantKeys: new Set<string>(),
        timeSlots: new Set<string>(),
      });
    }

    const item = grouped.get(key)!;
    const pKey = participantKey(row);
    if (pKey) item.participantKeys.add(pKey);
    item.participantCount = item.participantKeys.size || item.participantCount + 1;
    if (timeSlot) item.timeSlots.add(timeSlot);
    if (!item.batchName && clean(row.batch_name))
      item.batchName = clean(row.batch_name);
    if (!item.timeAreaName && clean(row.time_area_name))
      item.timeAreaName = clean(row.time_area_name);
  }

  return Array.from(grouped.values());
}

function buildSessionName(
  baseName: string,
  sourceName: string,
  group: SessionLocationGroup,
  useBaseName: boolean,
) {
  if (useBaseName && clean(baseName)) return clean(baseName);
  return [sourceName, group.locationName, group.sessionDate]
    .map(clean)
    .filter(Boolean)
    .join(" - ");
}



async function insertSessionBatchMappings(
  supabase: any,
  sessions: any[],
  sourceId: number,
  batchMappings: BatchMappingInput[],
) {
  const rows: any[] = [];

  for (const session of sessions) {
    for (const mapping of batchMappings || []) {
      const batchName = clean(mapping.sourceBatchName);
      const vaccineId = toInt(mapping.vaccineId, 0);
      const lotId = toInt(mapping.lotId, 0);
      if (!batchName || !vaccineId || !lotId) continue;

      rows.push({
        session_id: session.id,
        source_id: sourceId || session.source_id || null,
        source_batch_name: batchName,
        vaccine_id: vaccineId,
        lot_id: lotId,
        dose_number: Math.max(1, toInt(mapping.doseNumber, 1)),
        active: true,
      });
    }
  }

  if (!rows.length) return;

  const result = await supabase
    .from("vaccination_session_batch_mappings")
    .insert(rows)
    .select("id");
  if (result.error) {
    throw new Error(
      `${result.error.message}. Jalankan sql_vaccination_v64_manual_batch_mapping.sql di Supabase.`,
    );
  }
}

async function insertSessionVaccines(
  supabase: any,
  sessions: any[],
  sessionVaccines: any[],
) {
  const rows: any[] = [];

  for (const session of sessions) {
    for (const item of sessionVaccines) {
      const vaccineId = toInt(item.vaccineId, 0);
      const lotId = toInt(item.lotId, 0);
      if (!vaccineId || !lotId) continue;
      rows.push({
        session_id: session.id,
        vaccine_id: vaccineId,
        lot_id: lotId,
        dose_number: Math.max(1, toInt(item.doseNumber, 1)),
        active: true,
      });
    }
  }

  if (!rows.length) return;

  const svResult = await supabase
    .from("vaccination_session_vaccines")
    .insert(rows)
    .select("*");
  if (svResult.error) throw new Error(svResult.error.message);
}

export async function GET(req: NextRequest) {
  const user = requireUser(req);
  if (!user) return fail("Unauthorized", 401);
  // VACCINATION_MEDIS_SESSION_READ_V150_4
  // Medis perlu READ session untuk dropdown Administer, tetapi POST tetap permission session.
  if (!canVaccinationAccess(user, "session") && !canVaccinationAccess(user, "administer")) {
    return fail("Akses baca session vaksinasi ditolak untuk role ini.", 403);
  }

  const supabase = supabaseAdmin();
  const result = await supabase
    .from("vaccination_sessions")
    .select("*")
    .order("session_date", { ascending: false })
    .order("id", { ascending: false });

  if (result.error) return fail(result.error.message, 500);

  const sessions = await attachSessionVaccines(supabase, result.data || []);
  return ok({ sessions });
}

export async function POST(req: NextRequest) {
  const user = requireUser(req);
  if (!user) return fail("Unauthorized", 401);
  if (!canVaccinationAccess(user, "session")) return fail("Akses modul vaksinasi ditolak untuk role ini.", 403);

  const body = await req.json().catch(() => ({}));
  const action = clean(body.action);
  const supabase = supabaseAdmin();

  // VACCINATION_SESSION_EXISTING_CONFIG_V153_3
  if (action === "sync-session-config") {
    const sessionId = toInt(body.sessionId || body.id, 0);
    if (!sessionId) return fail("ID session tidak valid.");

    const sessionVaccines = Array.isArray(body.sessionVaccines)
      ? body.sessionVaccines
      : [];
    const batchMappings: BatchMappingInput[] = Array.isArray(body.batchMappings)
      ? body.batchMappings
      : [];

    if (!sessionVaccines.length) {
      return fail("Session existing harus memiliki minimal satu vaksin/lot aktif.");
    }

    const sessionResult = await supabase
      .from("vaccination_sessions")
      .select("*")
      .eq("id", sessionId)
      .single();
    if (sessionResult.error) return fail(sessionResult.error.message, 500);

    const session = sessionResult.data;
    const sourceId = toInt(body.sourceId, 0) || toInt(session.source_id, 0);

    const validSessionKeys = new Set(
      sessionVaccines
        .filter(
          (item: any) =>
            toInt(item.vaccineId, 0) > 0 && toInt(item.lotId, 0) > 0,
        )
        .map((item: any) =>
          sessionVaccineKey(item.vaccineId, item.lotId, item.doseNumber),
        ),
    );

    const invalidMapping = batchMappings.find((mapping) => {
      const key = sessionVaccineKey(
        mapping.vaccineId,
        mapping.lotId,
        mapping.doseNumber,
      );
      return !validSessionKeys.has(key);
    });
    if (invalidMapping) {
      return fail(
        `Mapping ${clean(invalidMapping.sourceBatchName) || "BatchName"} mengarah ke vaksin/lot yang tidak aktif di session.`,
      );
    }

    try {
      await syncSessionVaccines(supabase, sessionId, sessionVaccines);
      await syncSessionBatchMappings(
        supabase,
        sessionId,
        sourceId,
        batchMappings,
      );

      const first = sessionVaccines.find(
        (item: any) => toInt(item.vaccineId, 0) && toInt(item.lotId, 0),
      );
      const defaultResult = await supabase
        .from("vaccination_sessions")
        .update({
          default_vaccine_id: toInt(first?.vaccineId, 0) || null,
          default_lot_id: toInt(first?.lotId, 0) || null,
        })
        .eq("id", sessionId)
        .select("*")
        .single();
      if (defaultResult.error) throw new Error(defaultResult.error.message);

      const attached = await attachSessionVaccines(supabase, [defaultResult.data]);
      return ok({
        message:
          "Session existing berhasil diperbarui. Vaksin/lot baru ditambahkan dan mapping lama dipertahankan.",
        session: attached[0] || defaultResult.data,
      });
    } catch (error: any) {
      return fail(
        `Gagal memperbarui konfigurasi session existing: ${error?.message || ""}`,
        500,
      );
    }
  }

  if (action === "update-session") {
    const id = toInt(body.id || body.sessionId, 0);
    if (!id) return fail("ID session tidak valid.");

    const sessionName = clean(body.sessionName);
    if (!sessionName) return fail("Nama session wajib diisi.");

    const participantCountText = clean(body.participantCountPlanned);
    const shouldSyncSessionVaccines = Array.isArray(body.sessionVaccines);
    const editSessionVaccines = shouldSyncSessionVaccines ? body.sessionVaccines : [];
    const firstEditedSessionVaccine = editSessionVaccines.find(
      (item: any) => toInt(item?.vaccineId, 0) && toInt(item?.lotId, 0),
    );

    const payload: Record<string, any> = {
      session_name: sessionName,
      company_name: clean(body.companyName) || null,
      location: clean(body.location) || null,
      session_date: clean(body.sessionDate) || null,
      time_slot: clean(body.timeSlot) || null,
      participant_count_planned: participantCountText
        ? Math.max(0, toInt(participantCountText, 0))
        : null,
    };

    if (shouldSyncSessionVaccines) {
      payload.default_vaccine_id = firstEditedSessionVaccine
        ? toInt(firstEditedSessionVaccine.vaccineId, 0) || null
        : null;
      payload.default_lot_id = firstEditedSessionVaccine
        ? toInt(firstEditedSessionVaccine.lotId, 0) || null
        : null;
    }

    const result = await supabase
      .from("vaccination_sessions")
      .update(payload)
      .eq("id", id)
      .select("*")
      .single();

    if (result.error) return fail(result.error.message, 500);

    if (shouldSyncSessionVaccines) {
      try {
        await syncSessionVaccines(supabase, id, editSessionVaccines);
      } catch (error: any) {
        return fail(
          `Informasi session tersimpan, tetapi daftar layanan/vaksin gagal diperbarui: ${error?.message || ""}`,
          500,
          { session: result.data },
        );
      }
    }

    return ok({
      message: shouldSyncSessionVaccines
        ? "Session dan daftar layanan/vaksin berhasil diperbarui."
        : "Session vaksinasi berhasil diperbarui.",
      session: result.data,
    });
  }

  if (action === "delete-session") {
    const id = toInt(body.id || body.sessionId, 0);
    if (!id) return fail("ID session tidak valid.");

    const result = await supabase
      .from("vaccination_sessions")
      .delete()
      .eq("id", id)
      .select("*")
      .single();

    if (result.error) return fail(result.error.message, 500);

    return ok({
      message: "Session vaksinasi berhasil dihapus.",
      session: result.data,
    });
  }

  const sourceId = toInt(body.sourceId, 0);
  const sessionVaccines = Array.isArray(body.sessionVaccines)
    ? body.sessionVaccines
    : [];
  const batchMappings: BatchMappingInput[] = Array.isArray(body.batchMappings)
    ? body.batchMappings
    : [];
  const firstSessionVaccine = sessionVaccines.find(
    (item: any) => toInt(item.vaccineId, 0) && toInt(item.lotId, 0),
  );
  const defaultVaccineId = toInt(
    firstSessionVaccine?.vaccineId ?? body.defaultVaccineId,
    0,
  );
  const defaultLotId = toInt(
    firstSessionVaccine?.lotId ?? body.defaultLotId,
    0,
  );
  const companyName = clean(body.companyName);
  const sourceName = clean(body.sourceName);

  if (body.autoGenerateFromLocations) {
    if (!sourceId)
      return fail(
        "Database vaksinasi wajib dipilih untuk auto-generate session.",
      );

    let groups: SessionLocationGroup[] = [];
    try {
      groups = await getSourceLocationGroups(supabase, sourceId);
    } catch (error: any) {
      return fail(
        `Gagal membaca lokasi dari database vaksinasi. Pastikan SQL v55 sudah dijalankan dan data sudah di-import ulang. ${error?.message || ""}`,
        500,
      );
    }

    const selectedLocationKey = clean(body.selectedLocationKey);
    const selectedGroups =
      selectedLocationKey && selectedLocationKey !== "__all__"
        ? groups.filter((group) => group.key === selectedLocationKey)
        : groups;

    if (!selectedGroups.length)
      return fail(
        "Tidak ada rincian lokasi dari database ini. Re-import data vaksinasi dengan SQL v55 aktif.",
      );

    const existingResult = await supabase
      .from("vaccination_sessions")
      .select("id,source_id,import_location_key")
      .eq("source_id", sourceId)
      .in(
        "import_location_key",
        selectedGroups.map((group) => group.key),
      );

    if (existingResult.error) return fail(existingResult.error.message, 500);
    const existingKeys = new Set(
      (existingResult.data || []).map((row: any) =>
        clean(row.import_location_key),
      ),
    );

    const rows = selectedGroups
      .filter((group) => !existingKeys.has(group.key))
      .map((group) => ({
        session_name: buildSessionName(
          clean(body.sessionName),
          sourceName || companyName,
          group,
          selectedGroups.length === 1,
        ),
        company_name: companyName || null,
        location: group.locationName || null,
        session_date: group.sessionDate || null,
        time_slot: null,
        import_location_key: group.key,
        import_time_area_name: group.timeAreaName || null,
        participant_count_planned: group.participantCount || 0,
        status: clean(body.status) || "OPEN",
        source_id: sourceId,
        source_name: sourceName || null,
        default_vaccine_id: defaultVaccineId || null,
        default_lot_id: defaultLotId || null,
      }));

    if (!rows.length) {
      return ok({
        message:
          "Semua lokasi dari database ini sudah pernah dibuatkan session.",
        created: 0,
        skipped: selectedGroups.length,
      });
    }

    const result = await supabase
      .from("vaccination_sessions")
      .insert(rows)
      .select("*");
    if (result.error) return fail(result.error.message, 500);

    try {
      await insertSessionVaccines(supabase, result.data || [], sessionVaccines);
      await insertSessionBatchMappings(supabase, result.data || [], sourceId, batchMappings);
    } catch (error: any) {
      return fail(
        `Session dibuat, tetapi daftar vaksin/lot atau mapping BatchName gagal ditambahkan: ${error?.message || ""}`,
        500,
        { sessions: result.data || [] },
      );
    }

    return ok({
      message: `Auto-generate session selesai. Dibuat: ${result.data?.length || 0}, dilewati karena sudah ada: ${selectedGroups.length - rows.length}.`,
      sessions: result.data || [],
      created: result.data?.length || 0,
      skipped: selectedGroups.length - rows.length,
    });
  }

  const sessionName = clean(body.sessionName);
  if (!sessionName) return fail("Nama session wajib diisi.");

  const payload: Record<string, any> = {
    session_name: sessionName,
    company_name: companyName || null,
    location: clean(body.location) || null,
    session_date: clean(body.sessionDate) || null,
    time_slot: clean(body.timeSlot) || null,
    import_location_key: clean(body.importLocationKey) || null,
    import_time_area_name: clean(body.importTimeAreaName) || null,
    participant_count_planned: toInt(body.participantCountPlanned, 0) || null,
    status: clean(body.status) || "OPEN",
    source_id: sourceId || null,
    source_name: sourceName || null,
    default_vaccine_id: defaultVaccineId || null,
    default_lot_id: defaultLotId || null,
  };

  const result = await supabase
    .from("vaccination_sessions")
    .insert(payload)
    .select("*")
    .single();
  if (result.error) return fail(result.error.message, 500);

  const session = result.data;

  try {
    await insertSessionVaccines(supabase, [session], sessionVaccines);
    await insertSessionBatchMappings(supabase, [session], sourceId, batchMappings);
  } catch (error: any) {
    return fail(
      `Session dibuat, tetapi daftar vaksin/lot atau mapping BatchName gagal ditambahkan: ${error?.message || ""}`,
      500,
      { session },
    );
  }

  return ok({ message: "Session vaksinasi berhasil dibuat.", session });
}
