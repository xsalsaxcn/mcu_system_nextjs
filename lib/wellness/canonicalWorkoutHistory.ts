// WELLNESS_CANONICAL_WORKOUT_READ_PATH_V126M71
// Read-only canonical workout history shared by Participant streak and Coach.
// Contract:
// - manual workout visible/counted = Google Sheet only
// - Supabase manual rows = hidden internal mirror, never part of canonical rows
// - device workout = selected Google Fit / Health Connect rows from Supabase
// No database writes, schema changes, calorie-rule changes, or sync changes.

import { fetchWellnessGoogleSheetRows } from "@/lib/wellness/googleSheetResponses";
import { safeLogDate } from "@/lib/wellness/googleSheetWebhook";
import {
  activityFitnessProvider,
  filterActivityRowsByFitnessSource,
  loadParticipantControlMap,
} from "@/lib/wellness/participantControls";

export type CanonicalWorkoutSourceSummary = {
  database_ok: boolean;
  database_message: string;
  supabase_rows: number;
  supabase_manual_hidden: number;
  device_rows_visible: number;
  google_sheet_ok: boolean;
  google_sheet_message: string;
  google_sheet_rows: number;
  unmatched_google_sheet_rows: number;
  canonical_rows: number;
  fitness_source: string;
};

export type CanonicalWorkoutParticipantHistory = {
  participant_id: number;
  logs: any[];
  sources: CanonicalWorkoutSourceSummary;
  control: any;
};

export type CanonicalWorkoutBulkHistory = {
  byParticipantId: Map<number, CanonicalWorkoutParticipantHistory>;
  sources: CanonicalWorkoutSourceSummary;
};

function clean(value: any) {
  return String(value ?? "").trim();
}

function numberValue(value: any) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function participantId(participant: any) {
  return numberValue(participant?.id || participant?.participant_id);
}

function participantCode(participant: any) {
  return clean(
    participant?.code || participant?.employee_code || participant?.no_karyawan,
  ).toLowerCase();
}

function parseRaw(value: any) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function sheetWorkoutNumber(value: any) {
  const text = clean(value).replace(/\s/g, "");
  if (!text) return null;

  let normalized = text.replace(/[^0-9,.-]/g, "");
  const hasDot = normalized.includes(".");
  const hasComma = normalized.includes(",");

  if (hasDot && hasComma) {
    if (normalized.lastIndexOf(",") > normalized.lastIndexOf(".")) {
      normalized = normalized.replace(/\./g, "").replace(",", ".");
    } else {
      normalized = normalized.replace(/,/g, "");
    }
  } else if (hasComma) {
    const thousandStyle = /^-?\d{1,3}(,\d{3})+$/.test(normalized);
    normalized = thousandStyle
      ? normalized.replace(/,/g, "")
      : normalized.replace(",", ".");
  } else if (hasDot) {
    const thousandStyle = /^-?\d{1,3}(\.\d{3})+$/.test(normalized);
    normalized = thousandStyle ? normalized.replace(/\./g, "") : normalized;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function sheetWorkoutSteps(row: any) {
  const achievement = clean(
    row?.[
      "Jelaskan pencapaian Workout/Aktifitas yang anda lakukan (Berapa Set/Berapa banyak langkah kaki)"
    ],
  );
  const match = achievement.match(/([\d.,]+)\s*(?:langkah|steps?)/i);
  return match ? sheetWorkoutNumber(match[1]) : null;
}

function sheetWorkoutDistance(row: any) {
  const achievement = clean(
    row?.[
      "Jelaskan pencapaian Workout/Aktifitas yang anda lakukan (Berapa Set/Berapa banyak langkah kaki)"
    ],
  );
  const match = achievement.match(/([\d.,]+)\s*km\b/i);
  return match ? sheetWorkoutNumber(match[1]) : null;
}

export function canonicalWorkoutIsSheetRow(row: any) {
  const logType = clean(row?.["Log Type"] || row?.log_type).toLowerCase();
  if (logType === "workout" || logType === "activity") return true;
  if (logType === "nutrition" || logType === "healthtalk") return false;
  return Boolean(
    clean(row?.["Jenis Workout/Aktifitas"]) ||
      clean(row?.["Kalori Aktivitas"]) ||
      clean(row?.["Melakukan Workout/Aktifitas Ringan?"]),
  );
}

export function canonicalWorkoutSheetMatchesParticipant(
  row: any,
  participant: any,
) {
  const rowParticipantId = numberValue(
    row?.["Participant ID"] || row?.participant_id,
  );
  const id = participantId(participant);
  const rowCode = clean(
    row?.KODE || row?.code || row?.participant_code,
  ).toLowerCase();
  const code = participantCode(participant);

  return (
    (rowParticipantId > 0 && id > 0 && rowParticipantId === id) ||
    Boolean(rowCode && code && rowCode === code)
  );
}

export function canonicalWorkoutSheetRowToActivity(
  row: any,
  participant: any,
) {
  const id = participantId(participant);
  const submissionId = clean(row?.["Submission ID"] || row?.submission_id);
  const sheetRowNumber = numberValue(row?._rowNumber || row?.row_number);
  const submissionDate = clean(row?.["Submission Date"] || row?.created_at);
  const logDate = safeLogDate(
    row?.["Log Date"] || row?.log_date || submissionDate,
  );
  const activityName = clean(row?.["Jenis Workout/Aktifitas"]) || "Workout";
  const calories = numberValue(sheetWorkoutNumber(row?.["Kalori Aktivitas"]));
  const durationMinutes = numberValue(
    sheetWorkoutNumber(row?.["Berapa Menit anda melakukan nya ?"]),
  );
  const steps = numberValue(sheetWorkoutSteps(row));
  const distanceKm = numberValue(sheetWorkoutDistance(row));

  return {
    id: submissionId
      ? `sheet-workout-${submissionId}`
      : `sheet-workout-${sheetRowNumber || `${id}-${submissionDate}`}`,
    _canonical_source: "google_sheet",
    _google_sheet_row_number: sheetRowNumber || null,
    participant_id: id,
    source: "manual",
    provider: "manual",
    input_source: "manual",
    external_activity_id: submissionId
      ? `manual_sheet_${submissionId}`
      : `manual_sheet_row_${sheetRowNumber}`,
    provider_activity_id: submissionId
      ? `manual_sheet_${submissionId}`
      : `manual_sheet_row_${sheetRowNumber}`,
    activity_type: activityName,
    activity_name: activityName,
    log_date: logDate,
    started_at: submissionDate || `${logDate}T00:00:00.000Z`,
    created_at: submissionDate || logDate,
    updated_at: submissionDate || logDate,
    duration_minutes: durationMinutes,
    calories,
    active_calories: calories,
    steps,
    distance_km: distanceKm,
    submission_id: submissionId || null,
    raw_payload: {
      ...row,
      submission_id: submissionId || null,
      google_sheet: {
        rowNumber: sheetRowNumber || null,
        row_number: sheetRowNumber || null,
      },
      marker: "WELLNESS_CANONICAL_WORKOUT_READ_PATH_V126M71",
    },
  };
}

export function canonicalWorkoutIsManualDbRow(row: any) {
  const raw = parseRaw(row?.raw_payload);
  const source = clean(
    row?.source ||
      row?.provider ||
      row?.input_source ||
      raw?.provider ||
      raw?.source,
  )
    .toLowerCase()
    .replace(/-/g, "_");
  const externalId = clean(
    row?.external_activity_id ||
      row?.provider_activity_id ||
      raw?.external_activity_id ||
      raw?.provider_activity_id,
  ).toLowerCase();

  return (
    source === "manual" ||
    source === "google_sheet" ||
    externalId.startsWith("manual_") ||
    Boolean(raw?.submission_id || raw?.["Submission ID"])
  );
}

function sheetCanonicalKey(row: any, index: number) {
  const submissionId = clean(row?.submission_id || row?.raw_payload?.["Submission ID"]);
  if (submissionId) return `submission:${submissionId}`;
  const sheetRowNumber = numberValue(
    row?._google_sheet_row_number || row?.raw_payload?._rowNumber,
  );
  if (sheetRowNumber > 0) return `sheet-row:${sheetRowNumber}`;
  return `sheet-fallback:${clean(row?.log_date)}:${clean(row?.activity_name)}:${clean(
    row?.created_at,
  )}:${index}`;
}

function dedupeSheetRows(rows: any[]) {
  const result: any[] = [];
  const seen = new Set<string>();
  (rows || []).forEach((row, index) => {
    const key = sheetCanonicalKey(row, index);
    if (seen.has(key)) return;
    seen.add(key);
    result.push(row);
  });
  return result;
}

function sortChronological(rows: any[]) {
  return [...(rows || [])].sort((left, right) =>
    clean(left?.log_date || left?.started_at || left?.created_at).localeCompare(
      clean(right?.log_date || right?.started_at || right?.created_at),
    ),
  );
}

async function loadDbRows(supabase: any, ids: number[]) {
  if (!ids.length) return { ok: true, rows: [] as any[], message: "" };
  try {
    const result = await supabase
      .from("wellness_activity_logs")
      .select("*")
      .in("participant_id", ids)
      .order("log_date", { ascending: true })
      .limit(50000);
    return {
      ok: !result?.error,
      rows: result?.error ? [] : result?.data || [],
      message: result?.error?.message || "",
    };
  } catch (error: any) {
    return {
      ok: false,
      rows: [] as any[],
      message: clean(error?.message || "Workout DB source unavailable."),
    };
  }
}

export async function loadCanonicalWorkoutHistories(params: {
  supabase: any;
  participants: any[];
  dbRows?: any[];
  controlMap?: Map<number, any>;
  sheetResult?: { ok?: boolean; rows?: any[]; message?: string };
  sheetLimit?: number;
}): Promise<CanonicalWorkoutBulkHistory> {
  const participants = (params.participants || []).filter(
    (participant) => participantId(participant) > 0,
  );
  const ids = participants.map(participantId);

  const [dbResult, controlMap, sheetResult] = await Promise.all([
    params.dbRows
      ? Promise.resolve({ ok: true, rows: params.dbRows, message: "" })
      : loadDbRows(params.supabase, ids),
    params.controlMap
      ? Promise.resolve(params.controlMap)
      : loadParticipantControlMap(params.supabase, ids),
    params.sheetResult
      ? Promise.resolve({
          ok: params.sheetResult.ok !== false,
          rows: params.sheetResult.rows || [],
          message: clean(params.sheetResult.message),
        })
      : fetchWellnessGoogleSheetRows({
          logType: "workout",
          limit: params.sheetLimit || 10000,
        }).catch((error: any) => ({
          ok: false,
          rows: [] as any[],
          message: clean(error?.message || "Google Sheet workout source unavailable."),
        })),
  ]);

  const byId = new Map<number, any>();
  const byCode = new Map<string, any>();
  for (const participant of participants) {
    const id = participantId(participant);
    const code = participantCode(participant);
    byId.set(id, participant);
    if (code) byCode.set(code, participant);
  }

  const deviceByParticipant = new Map<number, any[]>();
  const hiddenManualCount = new Map<number, number>();
  const selectedDbRows = filterActivityRowsByFitnessSource(
    dbResult.rows || [],
    controlMap,
  );

  for (const row of selectedDbRows) {
    const id = numberValue(row?.participant_id);
    if (!byId.has(id)) continue;
    if (canonicalWorkoutIsManualDbRow(row)) {
      hiddenManualCount.set(id, (hiddenManualCount.get(id) || 0) + 1);
      continue;
    }
    const provider = activityFitnessProvider(row);
    if (provider !== "google_fit" && provider !== "health_connect") continue;
    if (!deviceByParticipant.has(id)) deviceByParticipant.set(id, []);
    deviceByParticipant.get(id)!.push(row);
  }

  const sheetByParticipant = new Map<number, any[]>();
  let unmatchedSheetRows = 0;
  for (const row of (sheetResult.rows || []).filter(canonicalWorkoutIsSheetRow)) {
    const rowId = numberValue(row?.["Participant ID"] || row?.participant_id);
    const rowCode = clean(row?.KODE || row?.code || row?.participant_code).toLowerCase();
    const participant =
      (rowId > 0 ? byId.get(rowId) : null) ||
      (rowCode ? byCode.get(rowCode) : null) ||
      null;
    if (!participant || !canonicalWorkoutSheetMatchesParticipant(row, participant)) {
      unmatchedSheetRows += 1;
      continue;
    }
    const id = participantId(participant);
    if (!sheetByParticipant.has(id)) sheetByParticipant.set(id, []);
    sheetByParticipant.get(id)!.push(
      canonicalWorkoutSheetRowToActivity(row, participant),
    );
  }

  const byParticipantId = new Map<number, CanonicalWorkoutParticipantHistory>();
  let totalDeviceRows = 0;
  let totalSheetRows = 0;
  let totalHiddenManual = 0;
  let totalCanonicalRows = 0;

  for (const participant of participants) {
    const id = participantId(participant);
    const deviceRows = deviceByParticipant.get(id) || [];
    const sheetRows = dedupeSheetRows(sheetByParticipant.get(id) || []);
    const logs = sortChronological([...deviceRows, ...sheetRows]);
    const hiddenManual = hiddenManualCount.get(id) || 0;
    const control = controlMap.get(id) || participant?.wellness_control || {};

    totalDeviceRows += deviceRows.length;
    totalSheetRows += sheetRows.length;
    totalHiddenManual += hiddenManual;
    totalCanonicalRows += logs.length;

    byParticipantId.set(id, {
      participant_id: id,
      logs,
      control,
      sources: {
        database_ok: dbResult.ok !== false,
        database_message: clean(dbResult.message),
        supabase_rows: (dbResult.rows || []).filter(
          (row: any) => numberValue(row?.participant_id) === id,
        ).length,
        supabase_manual_hidden: hiddenManual,
        device_rows_visible: deviceRows.length,
        google_sheet_ok: sheetResult.ok !== false,
        google_sheet_message: clean(sheetResult.message),
        google_sheet_rows: sheetRows.length,
        unmatched_google_sheet_rows: unmatchedSheetRows,
        canonical_rows: logs.length,
        fitness_source: clean(control?.fitness_source || "none"),
      },
    });
  }

  return {
    byParticipantId,
    sources: {
      database_ok: dbResult.ok !== false,
      database_message: clean(dbResult.message),
      supabase_rows: (dbResult.rows || []).length,
      supabase_manual_hidden: totalHiddenManual,
      device_rows_visible: totalDeviceRows,
      google_sheet_ok: sheetResult.ok !== false,
      google_sheet_message: clean(sheetResult.message),
      google_sheet_rows: totalSheetRows,
      unmatched_google_sheet_rows: unmatchedSheetRows,
      canonical_rows: totalCanonicalRows,
      fitness_source: "mixed",
    },
  };
}

export async function loadCanonicalWorkoutHistory(params: {
  supabase: any;
  participant: any;
  dbRows?: any[];
  controlMap?: Map<number, any>;
  sheetResult?: { ok?: boolean; rows?: any[]; message?: string };
  sheetLimit?: number;
}): Promise<CanonicalWorkoutParticipantHistory> {
  const id = participantId(params.participant);
  const bulk = await loadCanonicalWorkoutHistories({
    supabase: params.supabase,
    participants: [params.participant],
    dbRows: params.dbRows,
    controlMap: params.controlMap,
    sheetResult: params.sheetResult,
    sheetLimit: params.sheetLimit,
  });

  return (
    bulk.byParticipantId.get(id) || {
      participant_id: id,
      logs: [],
      control: params.participant?.wellness_control || {},
      sources: {
        ...bulk.sources,
        fitness_source: clean(
          params.participant?.wellness_control?.fitness_source || "none",
        ),
      },
    }
  );
}
