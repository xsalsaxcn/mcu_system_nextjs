// WELLNESS_ADMIN_STREAK_DIAGNOSTIC_V126M54_1
// Read-only Admin diagnostic. Canonical streak stays untouched, while the
// participant Portal workout display is mirrored from DB + durable Google Sheet.
// No writes, no schema changes, no Google Fit/Health Connect sync changes.

import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { fail, ok } from "@/lib/server/response";
import { fetchWellnessGoogleSheetRows } from "@/lib/wellness/googleSheetResponses";
import { safeLogDate } from "@/lib/wellness/googleSheetWebhook";
import {
  activityFitnessProvider,
  filterActivityRowsByFitnessSource,
  loadParticipantControlMap,
} from "@/lib/wellness/participantControls";
import { loadCanonicalNutritionHistories } from "@/lib/wellness/nutritionHistory";
import {
  buildEffectiveTargetTimeline,
  effectiveTargetsForDate,
  targetTimelineSummary,
} from "@/lib/wellness/effectiveDatedTargets";
import {
  buildWellnessStreakSummary,
  wellnessJakartaDate,
  wellnessStreakSteps,
  wellnessStreakWorkoutCalories,
} from "@/lib/wellness/streak";
import { filterOperationalRowsForProgram } from "@/lib/wellness/programWindow";

import { applyParticipantCanonicalHistoricalSuccessProof } from "@/lib/wellness/participantStreakServer";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const ADMIN_ROLES = new Set([
  "admin",
  "super_admin",
  "supervisor",
  "doctor",
  "wellness_admin",
]);

function clean(value: any) {
  return String(value ?? "").trim();
}

function numberValue(value: any) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function active(value: any) {
  return ![false, 0, "0", "false", "inactive", "nonaktif"].includes(
    typeof value === "string" ? value.toLowerCase() : value,
  );
}

function jakartaDate(offsetDays = 0) {
  const shifted = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(shifted);
}

// WELLNESS_ADMIN_STREAK_DIAGNOSTIC_RANGE_V126M119_48
function validDiagnosticDate(value: any) {
  return /^\d{4}-\d{2}-\d{2}$/.test(clean(value));
}

function diagnosticDateKeys(fromDate: string, toDate: string) {
  const start = Date.parse(`${fromDate}T00:00:00Z`);
  const end = Date.parse(`${toDate}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) {
    return [] as string[];
  }
  const days = Math.floor((end - start) / 86_400_000) + 1;
  if (days < 1 || days > 366) return [] as string[];
  return Array.from({ length: days }, (_, index) =>
    new Date(start + index * 86_400_000).toISOString().slice(0, 10),
  );
}

function diagnosticHistoryDays(fromDate: string, today: string) {
  const start = Date.parse(`${fromDate}T00:00:00Z`);
  const end = Date.parse(`${today}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 42;
  return Math.max(42, Math.floor((end - start) / 86_400_000) + 1);
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

function activityDiagnosticDate(row: any) {
  const raw = parseRaw(row?.raw_payload);
  return wellnessJakartaDate(
    row?.log_date ||
      row?.date ||
      row?.tanggal ||
      raw?.log_date ||
      row?.started_at ||
      row?.start_date_local ||
      raw?.start_date_local ||
      raw?.last_sync_at ||
      raw?.health_connect_last_sync_at ||
      row?.updated_at ||
      row?.created_at,
  );
}


// WELLNESS_ADMIN_STREAK_PORTAL_MIRROR_V126M54
// These helpers intentionally mirror the participant workout GET route's durable
// Google Sheet history without changing that route. Supabase remains the device/
// mirror source; Sheet rows are only added when the matching manual mirror is absent.
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

function isWorkoutSheetRow(row: any) {
  const logType = clean(row?.["Log Type"] || row?.log_type).toLowerCase();
  if (logType === "workout" || logType === "activity") return true;
  if (logType === "nutrition" || logType === "healthtalk") return false;
  return Boolean(
    clean(row?.["Jenis Workout/Aktifitas"]) ||
      clean(row?.["Kalori Aktivitas"]) ||
      clean(row?.["Melakukan Workout/Aktifitas Ringan?"]),
  );
}

function workoutSheetMatchesParticipant(row: any, participant: any) {
  const rowParticipantId = numberValue(row?.["Participant ID"] || row?.participant_id);
  const participantId = numberValue(participant?.id);
  const rowCode = clean(row?.KODE || row?.code || row?.participant_code).toLowerCase();
  const participantCode = clean(
    participant?.code || participant?.employee_code || participant?.no_karyawan,
  ).toLowerCase();

  return (
    (rowParticipantId > 0 && participantId > 0 && rowParticipantId === participantId) ||
    Boolean(rowCode && participantCode && rowCode === participantCode)
  );
}

function sheetRowToWorkout(row: any, participant: any) {
  const submissionId = clean(row?.["Submission ID"] || row?.submission_id);
  const sheetRowNumber = numberValue(row?._rowNumber || row?.row_number);
  const submissionDate = clean(row?.["Submission Date"] || row?.created_at);
  const logDate = safeLogDate(row?.["Log Date"] || row?.log_date || submissionDate);
  const activityName = clean(row?.["Jenis Workout/Aktifitas"]) || "Workout";
  const calories = numberValue(sheetWorkoutNumber(row?.["Kalori Aktivitas"]));
  const steps = numberValue(sheetWorkoutSteps(row));

  return {
    id: submissionId
      ? `sheet-workout-${submissionId}`
      : `sheet-workout-${sheetRowNumber || `${participant?.id}-${submissionDate}`}`,
    _canonical_source: "google_sheet",
    _google_sheet_row_number: sheetRowNumber || null,
    participant_id: numberValue(participant?.id),
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
    duration_minutes: numberValue(
      sheetWorkoutNumber(row?.["Berapa Menit anda melakukan nya ?"]),
    ),
    calories,
    active_calories: calories,
    steps,
    submission_id: submissionId,
    raw_payload: {
      ...row,
      submission_id: submissionId || null,
      google_sheet: {
        rowNumber: sheetRowNumber || null,
        row_number: sheetRowNumber || null,
      },
      marker: "WELLNESS_ADMIN_STREAK_PORTAL_MIRROR_V126M54",
    },
  };
}

function activitySourceText(row: any) {
  const raw = parseRaw(row?.raw_payload);
  return clean(
    row?.source || row?.provider || row?.input_source || raw?.provider || raw?.source,
  )
    .toLowerCase()
    .replace(/-/g, "_");
}

function isManualActivityRow(row: any) {
  const raw = parseRaw(row?.raw_payload);
  const source = activitySourceText(row);
  const externalId = clean(
    row?.external_activity_id || row?.provider_activity_id || raw?.external_activity_id,
  ).toLowerCase();
  return (
    source === "manual" ||
    source === "google_sheet" ||
    externalId.startsWith("manual_") ||
    Boolean(raw?.submission_id || raw?.["Submission ID"])
  );
}

function workoutCanonicalKey(item: any, index: number) {
  const raw = parseRaw(item?.raw_payload);
  const submissionId = clean(
    item?.submission_id ||
      item?.submissionId ||
      raw?.submission_id ||
      raw?.submissionId ||
      raw?.["Submission ID"],
  );
  if (submissionId) return `submission:${submissionId}`;

  const sheetRowNumber = numberValue(
    item?._google_sheet_row_number ||
      raw?.google_sheet?.rowNumber ||
      raw?.google_sheet?.row_number ||
      raw?._rowNumber,
  );
  if (sheetRowNumber > 0) return `sheet-row:${sheetRowNumber}`;

  const databaseId = numberValue(
    item?._supabase_id || (item?._canonical_source !== "google_sheet" ? item?.id : 0),
  );
  if (databaseId > 0) return `db:${databaseId}`;

  return [
    "fallback",
    activitySourceText(item),
    clean(item?.log_date),
    clean(item?.activity_name || item?.activity_type),
    clean(item?.started_at || item?.created_at),
    String(index),
  ].join(":");
}

function mergePortalManualWorkoutHistory(
  supabaseRows: any[] = [],
  sheetRows: any[] = [],
) {
  const byKey = new Map<string, any>();
  const insertionOrder: string[] = [];

  const remember = (item: any, index: number, preferExisting: boolean) => {
    const key = workoutCanonicalKey(item, index);
    if (!byKey.has(key)) {
      byKey.set(key, item);
      insertionOrder.push(key);
      return;
    }
    if (!preferExisting) byKey.set(key, item);
  };

  // Participant workout GET treats durable Sheet rows as canonical first.
  (sheetRows || []).forEach((item, index) => remember(item, index, true));
  (supabaseRows || []).forEach((item, index) =>
    remember(item, index + (sheetRows || []).length, true),
  );

  return insertionOrder.map((key) => byKey.get(key)).filter(Boolean);
}

function mergePortalActivityRows(
  selectedDbRows: any[],
  sheetRows: any[],
) {
  const manualDbRows = (selectedDbRows || []).filter(isManualActivityRow);
  const nonManualRows = (selectedDbRows || []).filter((row) => !isManualActivityRow(row));
  const canonicalManualRows = mergePortalManualWorkoutHistory(manualDbRows, sheetRows);
  return {
    rows: [...nonManualRows, ...canonicalManualRows],
    manual_db_rows: manualDbRows.length,
    manual_sheet_rows: sheetRows.length,
    manual_merged_rows: canonicalManualRows.length,
  };
}

function dayMetric(rows: any[], date: string) {
  let workoutCalories = 0;
  let steps = 0;
  let rowCount = 0;
  let manualCalories = 0;
  let sheetManualRows = 0;

  for (const row of rows || []) {
    if (activityDiagnosticDate(row) !== date) continue;
    rowCount += 1;
    const calories = wellnessStreakWorkoutCalories(row);
    workoutCalories += calories;
    steps += wellnessStreakSteps(row);
    if (isManualActivityRow(row)) manualCalories += calories;
    if (clean(row?._canonical_source) === "google_sheet") sheetManualRows += 1;
  }

  return {
    workout_calories: Math.round(workoutCalories),
    steps: Math.round(steps),
    activity_rows: rowCount,
    manual_calories: Math.round(manualCalories),
    sheet_manual_rows: sheetManualRows,
  };
}

function providerWarnings(rows: any[]) {
  const warnings = new Set<string>();

  for (const row of rows || []) {
    const provider = activityFitnessProvider(row);
    const raw = parseRaw(row?.raw_payload);

    if (provider === "google_fit") {
      const activeCalories = numberValue(
        raw?.google_fit_active_calories_exact ??
          raw?.google_fit_active_calories ??
          raw?.selected_active_calories ??
          raw?.sanitized_active_calories,
      );
      const totalCalories = numberValue(
        raw?.google_fit_total_calories ??
          raw?.google_fit_calories_expended ??
          raw?.exact_snapshot?.total_calories ??
          row?.total_calories ??
          row?.calories ??
          row?.calories_burned,
      );
      if (activeCalories <= 0 && totalCalories > 0) {
        warnings.add("GOOGLE_FIT_TOTAL_CALORIES_FALLBACK");
      }
    }

    if (provider === "health_connect") {
      const selected = numberValue(
        raw?.selected_active_calories ??
          raw?.sanitized_active_calories ??
          raw?.health_connect_active_calories,
      );
      const stored = numberValue(
        row?.activity_calories ?? row?.calories ?? row?.calories_burned,
      );
      const resolved = wellnessStreakWorkoutCalories(row);
      if (selected <= 0 && stored <= 0 && resolved > 0) {
        warnings.add("HEALTH_CONNECT_CALORIES_ESTIMATED_OR_FALLBACK");
      }
    }
  }

  return [...warnings];
}

function diagnosisLabel(params: {
  nutritionOk: boolean;
  workoutOk: boolean;
  stepsOk: boolean;
  activityZero: boolean;
}) {
  if (params.nutritionOk && params.workoutOk) {
    return { code: "PASS", label: "Target streak tercapai" };
  }
  if (!params.nutritionOk && !params.workoutOk) {
    return {
      code: "NUTRISI_DAN_WORKOUT_KURANG",
      label: "Nutrisi dan workout belum memenuhi target",
    };
  }
  if (!params.nutritionOk) {
    return {
      code: "NUTRISI_KURANG",
      label: "Input nutrisi kurang dari 3 kali",
    };
  }
  if (params.activityZero) {
    return {
      code: "DATA_ACTIVITY_NOL",
      label: "Workout/aktivitas terbaca 0 pada tanggal ini",
    };
  }
  if (params.stepsOk) {
    return {
      code: "WORKOUT_KURANG_STEPS_TERCAPAI",
      label: "Langkah tercapai, tetapi kalori workout belum mencapai target",
    };
  }
  return {
    code: "WORKOUT_KURANG",
    label: "Kalori workout belum mencapai target",
  };
}

async function selectParticipantRows(params: {
  supabase: any;
  table: string;
  participantIds: number[];
  select?: string;
  limitPerChunk?: number;
}) {
  // WELLNESS_ADMIN_STREAK_DIAGNOSTIC_PAGINATED_SOURCE_V126M54_1
  // Supabase/PostgREST can cap a single response even when `.limit()` asks for
  // more rows. The Admin diagnostic previously loaded every participant in one
  // bulk request, so later activity rows could disappear while Participant and
  // Coach (which read one participant at a time) still had the canonical data.
  // Read the same tables in deterministic pages and never silently accept a
  // truncated source. This is read-only and does not change the streak formula.
  const rows: any[] = [];
  const chunkSize = 100;
  const pageSize = 1000;
  const select = params.select || "*";
  const maxRowsPerChunk = Math.max(pageSize, params.limitPerChunk || 50000);

  for (let index = 0; index < params.participantIds.length; index += chunkSize) {
    const chunk = params.participantIds.slice(index, index + chunkSize);
    let offset = 0;
    let reachedCapWithFullPage = false;

    while (offset < maxRowsPerChunk) {
      const upper = Math.min(offset + pageSize - 1, maxRowsPerChunk - 1);
      const requested = upper - offset + 1;
      const result = await params.supabase
        .from(params.table)
        .select(select)
        .in("participant_id", chunk)
        .order("participant_id", { ascending: true })
        .order("id", { ascending: true })
        .range(offset, upper);

      if (result?.error) throw result.error;

      const pageRows = result?.data || [];
      rows.push(...pageRows);

      if (pageRows.length < requested) {
        reachedCapWithFullPage = false;
        break;
      }

      offset += pageRows.length;
      reachedCapWithFullPage = offset >= maxRowsPerChunk;
    }

    if (reachedCapWithFullPage) {
      const overflow = await params.supabase
        .from(params.table)
        .select("id")
        .in("participant_id", chunk)
        .order("participant_id", { ascending: true })
        .order("id", { ascending: true })
        .range(maxRowsPerChunk, maxRowsPerChunk);

      if (overflow?.error) throw overflow.error;
      if ((overflow?.data || []).length > 0) {
        throw new Error(
          `Diagnostic source ${params.table} melewati safety cap ${maxRowsPerChunk} rows per participant chunk; data tidak boleh ditampilkan dalam keadaan terpotong.`,
        );
      }
    }
  }

  return rows;
}

export async function GET(request: NextRequest) {
  try {
    const user: any = getSessionUser(request);
    if (!user) return fail("Session Admin belum aktif.", 401);

    const role = clean(user.role).toLowerCase();
    if (!ADMIN_ROLES.has(role)) {
      return fail("Akun ini tidak memiliki akses Diagnostik Streak.", 403);
    }

    const supabase = getSupabaseAdmin();
    const url = new URL(request.url);
    const requestedParticipantId = numberValue(
      url.searchParams.get("participant_id"),
    );
    const requestedCompanyId = numberValue(url.searchParams.get("company_id"));
    const query = clean(url.searchParams.get("q")).toLowerCase();

    const today = jakartaDate(0);
    const requestedFrom = clean(url.searchParams.get("from"));
    const requestedTo = clean(url.searchParams.get("to"));
    const fromDate = validDiagnosticDate(requestedFrom)
      ? requestedFrom
      : jakartaDate(-29);
    const toDate = validDiagnosticDate(requestedTo)
      ? requestedTo
      : today;
    const diagnosticDates = diagnosticDateKeys(fromDate, toDate);
    if (!diagnosticDates.length) {
      return fail("Range tanggal Diagnostik Streak tidak valid atau melebihi 366 hari.", 400);
    }
    if (toDate > today) {
      return fail("Tanggal akhir Diagnostik Streak tidak boleh melewati hari ini.", 400);
    }
    const diagnosticHistoryDayCount = diagnosticHistoryDays(fromDate, today);

    const [participantResult, companyResult, groupResult] = await Promise.all([
      supabase.from("wellness_participants").select("*").limit(10000),
      supabase.from("wellness_companies").select("id,name,code,is_active").limit(5000),
      supabase
        .from("wellness_group_units")
        .select("id,name,parent_id,company_id,unit_type")
        .limit(10000),
    ]);

    if (participantResult?.error) throw participantResult.error;

    const companyRows = companyResult?.error ? [] : companyResult?.data || [];
    const groupRows = groupResult?.error ? [] : groupResult?.data || [];
    const companyById = new Map<number, any>(
      companyRows.map((item: any) => [numberValue(item.id), item]),
    );
    const groupById = new Map<number, any>(
      groupRows.map((item: any) => [numberValue(item.id), item]),
    );

    let participants = (participantResult?.data || []).filter((item: any) =>
      active(item?.is_active),
    );

    if (requestedParticipantId > 0) {
      participants = participants.filter(
        (item: any) => numberValue(item.id) === requestedParticipantId,
      );
    }
    if (requestedCompanyId > 0) {
      participants = participants.filter(
        (item: any) =>
          numberValue(item.wellness_company_id || item.company_id) ===
          requestedCompanyId,
      );
    }
    if (query) {
      participants = participants.filter((item: any) =>
        [
          item?.name,
          item?.full_name,
          item?.employee_name,
          item?.code,
          item?.employee_code,
          item?.no_karyawan,
        ]
          .map(clean)
          .join(" ")
          .toLowerCase()
          .includes(query),
      );
    }

    const participantIds = participants
      .map((item: any) => numberValue(item.id))
      .filter(Boolean);

    if (!participantIds.length) {
      return ok({
        generated_at: new Date().toISOString(),
        timezone: "Asia/Jakarta",
        rule: {
          nutrition_min_submissions: 3,
          workout: "workout calories >= effective Coach target",
          steps: "informational_only",
        },
        summary: {
          participants: 0,
          participant_days: 0,
          pass_days: 0,
          issue_days: 0,
          steps_reached_but_streak_failed: 0,
        },
        participants: [],
        rows: [],
      });
    }

    const [activityRowsAll, noteRows, controlMap, nutritionBulk, workoutSheetBulk] =
      await Promise.all([
        selectParticipantRows({
          supabase,
          table: "wellness_activity_logs",
          participantIds,
          select: "*",
          limitPerChunk: 50000,
        }),
        selectParticipantRows({
          supabase,
          table: "wellness_coach_notes",
          participantIds,
          select: "*",
          limitPerChunk: 20000,
        }),
        loadParticipantControlMap(supabase, participantIds),
        loadCanonicalNutritionHistories({ supabase, participants }),
        fetchWellnessGoogleSheetRows({
          logType: "workout",
          limit: 10000,
        }).catch((error: any) => ({
          ok: false,
          rows: [],
          message: clean(error?.message || "Google Sheet workout source unavailable."),
        })),
      ]);

    const activityByParticipant = new Map<number, any[]>();
    for (const row of activityRowsAll) {
      const participantId = numberValue(row?.participant_id);
      if (!activityByParticipant.has(participantId)) {
        activityByParticipant.set(participantId, []);
      }
      activityByParticipant.get(participantId)!.push(row);
    }

    const notesByParticipant = new Map<number, any[]>();
    for (const row of noteRows) {
      const participantId = numberValue(row?.participant_id);
      if (!notesByParticipant.has(participantId)) {
        notesByParticipant.set(participantId, []);
      }
      notesByParticipant.get(participantId)!.push(row);
    }

    const workoutSheetRowsAll = (workoutSheetBulk?.rows || []).filter(isWorkoutSheetRow);

    const participantSummaries: any[] = [];
    const diagnosticRows: any[] = [];

    for (const participant of participants) {
      const participantId = numberValue(participant.id);
      const control = controlMap.get(participantId) || null;
      const selectedActivityRows = filterOperationalRowsForProgram(
        participant,
        filterActivityRowsByFitnessSource(
          activityByParticipant.get(participantId) || [],
          controlMap,
        ),
        "",
        "",
        ["log_date", "started_at", "created_at"],
      );
      const participantSheetWorkoutRows = workoutSheetRowsAll
        .filter((row: any) => workoutSheetMatchesParticipant(row, participant))
        .map((row: any) => sheetRowToWorkout(row, participant));
      const portalActivityMirror = mergePortalActivityRows(
        selectedActivityRows,
        participantSheetWorkoutRows,
      );
      const portalActivityRows = filterOperationalRowsForProgram(
        participant,
        portalActivityMirror.rows,
        "",
        "",
        ["log_date", "started_at", "created_at"],
      );
      const nutritionHistory = nutritionBulk.byParticipantId.get(participantId);
      const nutritionRows = filterOperationalRowsForProgram(
        participant,
        nutritionHistory?.logs || [],
        "",
        "",
        ["log_date", "created_at"],
      );
      const targetTimeline = buildEffectiveTargetTimeline({
        participant,
        notes: notesByParticipant.get(participantId) || [],
      });
      // WELLNESS_ADMIN_DIAGNOSTIC_CANONICAL_TRUTH_PARITY_V126M119_49A
      const streakBase = buildWellnessStreakSummary({
        nutritionRows,
        activityRows: selectedActivityRows,
        workoutTargetCalories: numberValue(targetTimeline.current?.workout) || 300,
        targetTimeline,
        historyDays: diagnosticHistoryDayCount,
      });
      const streak = applyParticipantCanonicalHistoricalSuccessProof(
        streakBase,
        participantId,
      );
      const portalDisplayStreakBase = buildWellnessStreakSummary({
        nutritionRows,
        activityRows: portalActivityRows,
        workoutTargetCalories: numberValue(targetTimeline.current?.workout) || 300,
        targetTimeline,
        historyDays: diagnosticHistoryDayCount,
      });
      const portalDisplayStreak = applyParticipantCanonicalHistoricalSuccessProof(
        portalDisplayStreakBase,
        participantId,
      );
      const portalDayByDate = new Map<string, any>(
        (portalDisplayStreak.history_days.filter((day: any) => day.date >= fromDate && day.date <= toDate) || []).map((item: any) => [item.date, item]),
      );

      const companyId = numberValue(
        participant.wellness_company_id || participant.company_id,
      );
      const groupUnit =
        groupById.get(numberValue(participant.wellness_group_unit_id)) || {};
      const kelompok =
        groupById.get(numberValue(participant.wellness_kelompok_id)) ||
        (groupUnit?.parent_id
          ? groupById.get(numberValue(groupUnit.parent_id))
          : null) ||
        {};
      const participantName =
        clean(participant.name || participant.full_name || participant.employee_name) ||
        `Peserta ${participantId}`;
      const participantCode = clean(
        participant.code || participant.employee_code || participant.no_karyawan,
      );
      const companyName =
        clean(companyById.get(companyId)?.name) ||
        clean(participant.company_name) ||
        `Perusahaan ${companyId || "-"}`;
      const groupName =
        clean(groupUnit?.name || kelompok?.name || participant.group_name) || "-";

      const activityByDate = new Map<string, any[]>();
      for (const activity of selectedActivityRows) {
        const date = activityDiagnosticDate(activity);
        if (!date) continue;
        if (!activityByDate.has(date)) activityByDate.set(date, []);
        activityByDate.get(date)!.push(activity);
      }

      let recentPass = 0;
      let recentIssue = 0;
      let recentStepsOnly = 0;

      for (const day of streak.history_days.filter((day: any) => day.date >= fromDate && day.date <= toDate) || []) {
        const targets = effectiveTargetsForDate(targetTimeline, day.date);
        const workoutTarget = Math.round(
          numberValue(day.workout_target_calories || targets.workout || 0),
        );
        const stepTarget = Math.round(numberValue(targets.steps) || 8000);
        const nutritionOk = numberValue(day.nutrition_count) >= 3;
        const workoutOk =
          workoutTarget > 0
            ? numberValue(day.workout_calories) >= workoutTarget
            : numberValue(day.workout_calories) > 0;
        const stepsOk =
          stepTarget > 0 && numberValue(day.steps) >= stepTarget;
        const dayActivities = activityByDate.get(day.date) || [];
        const diagnosis = diagnosisLabel({
          nutritionOk,
          workoutOk,
          stepsOk,
          activityZero:
            numberValue(day.workout_calories) <= 0 &&
            numberValue(day.steps) <= 0,
        });
        const targetChangedToday = targetTimeline.revisions.some(
          (item) => item.effective_from === day.date,
        );
        const portalDay = portalDayByDate.get(day.date) || null;
        const portalMetrics = dayMetric(portalActivityRows, day.date);
        const canonicalMetrics = dayMetric(selectedActivityRows, day.date);
        const mirrorMismatchReasons: string[] = [];
        if (portalMetrics.workout_calories !== canonicalMetrics.workout_calories) {
          mirrorMismatchReasons.push("PORTAL_WORKOUT_DIFFERS_FROM_STREAK_ENGINE");
        }
        if (portalMetrics.steps !== canonicalMetrics.steps) {
          mirrorMismatchReasons.push("PORTAL_STEPS_DIFFERS_FROM_STREAK_ENGINE");
        }
        const warnings = providerWarnings([
          ...dayActivities,
          ...portalActivityRows.filter((item: any) => activityDiagnosticDate(item) === day.date),
        ]);

        if (day.success) recentPass += 1;
        else recentIssue += 1;
        if (!day.success && stepsOk) recentStepsOnly += 1;

        diagnosticRows.push({
          participant_id: participantId,
          participant_code: participantCode,
          participant_name: participantName,
          company_id: companyId,
          company_name: companyName,
          group_name: groupName,
          date: day.date,
          day_label: day.label,
          nutrition_count: numberValue(day.nutrition_count),
          nutrition_min: 3,
          nutrition_ok: nutritionOk,
          nutrition_calories: numberValue(day.nutrition_calories),
          workout_calories: numberValue(day.workout_calories),
          workout_target: workoutTarget,
          workout_ok: workoutOk,
          coach_workout_calories: canonicalMetrics.workout_calories,
          portal_workout_calories: portalMetrics.workout_calories,
          portal_manual_calories: portalMetrics.manual_calories,
          portal_manual_sheet_rows: portalMetrics.sheet_manual_rows,
          steps: numberValue(day.steps),
          coach_steps: canonicalMetrics.steps,
          portal_steps: portalMetrics.steps,
          step_target: stepTarget,
          steps_ok: stepsOk,
          steps_are_streak_rule: false,
          success: Boolean(day.success),
          diagnosis_code: diagnosis.code,
          diagnosis_label: diagnosis.label,
          target_effective_from: day.target_effective_from || null,
          target_changed_today: targetChangedToday,
          fitness_source: clean(control?.fitness_source || "none"),
          source_connected: Boolean(control?.source_connected),
          activity_provider_rows: dayActivities.length,
          canonical_activity_rows: canonicalMetrics.activity_rows,
          portal_activity_rows: portalMetrics.activity_rows,
          mirror_mismatch: mirrorMismatchReasons.length > 0,
          mirror_mismatch_reasons: mirrorMismatchReasons,
          portal_preview_success: Boolean(portalDay?.success),
          activity_providers: [
            ...new Set(dayActivities.map((item) => activityFitnessProvider(item))),
          ].filter((item) => item !== "none"),
          provider_warnings: warnings,
        });
      }

      participantSummaries.push({
        participant_id: participantId,
        participant_code: participantCode,
        participant_name: participantName,
        company_id: companyId,
        company_name: companyName,
        group_name: groupName,
        current_streak: numberValue(streak.current_streak),
        longest_streak: numberValue(streak.longest_streak),
        success_dates: streak.success_dates || [],
        fitness_source: clean(control?.fitness_source || "none"),
        source_connected: Boolean(control?.source_connected),
        target_history: targetTimelineSummary(targetTimeline),
        nutrition_source: nutritionHistory?.sources || null,
        portal_workout_source: {
          google_sheet_ok: workoutSheetBulk?.ok !== false,
          google_sheet_message: clean(workoutSheetBulk?.message),
          manual_db_rows: portalActivityMirror.manual_db_rows,
          manual_sheet_rows: portalActivityMirror.manual_sheet_rows,
          manual_merged_rows: portalActivityMirror.manual_merged_rows,
        },
        recent_7d_pass: recentPass,
        recent_7d_issue: recentIssue,
        recent_7d_steps_reached_but_streak_failed: recentStepsOnly,
        period_pass: recentPass,
        period_issue: recentIssue,
        period_steps_reached_but_streak_failed: recentStepsOnly,
      });
    }

    diagnosticRows.sort((left, right) => {
      const name = clean(left.participant_name).localeCompare(
        clean(right.participant_name),
        "id",
      );
      if (name !== 0) return name;
      return clean(left.date).localeCompare(clean(right.date));
    });

    const passDays = diagnosticRows.filter((row) => row.success).length;
    const stepsOnly = diagnosticRows.filter(
      (row) => !row.success && row.steps_ok,
    ).length;

    return ok({
      generated_at: new Date().toISOString(),
      timezone: "Asia/Jakarta",
      today: jakartaDate(0),
      rule: {
        nutrition_min_submissions: 3,
        workout: "workout calories >= effective Coach target",
        steps: "informational_only",
        note: "Streak canonical tetap memakai pipeline Participant + Coach. Kolom Portal mirror hanya menunjukkan display workout yang juga membaca manual workout durable dari Google Sheet.",
      },
      period: {
        from: fromDate,
        to: toDate,
        days: diagnosticDates.length,
      },
      filters: {
        participant_id: requestedParticipantId || null,
        company_id: requestedCompanyId || null,
        q: query,
        from: fromDate,
        to: toDate,
      },
      summary: {
        participants: participantSummaries.length,
        participant_days: diagnosticRows.length,
        pass_days: passDays,
        issue_days: diagnosticRows.length - passDays,
        steps_reached_but_streak_failed: stepsOnly,
        target_change_days: diagnosticRows.filter(
          (row) => row.target_changed_today,
        ).length,
        provider_warning_days: diagnosticRows.filter(
          (row) => (row.provider_warnings || []).length > 0,
        ).length,
        portal_mirror_mismatch_days: diagnosticRows.filter(
          (row) => row.mirror_mismatch,
        ).length,
      },
      mirror_sources: {
        canonical_streak: "Participant + Coach shared DB/control/nutrition/target pipeline",
        portal_workout_display: "canonical DB activities + durable Google Sheet manual workout history",
        google_sheet_workout_ok: workoutSheetBulk?.ok !== false,
        google_sheet_workout_message: clean(workoutSheetBulk?.message),
        google_sheet_workout_rows: workoutSheetRowsAll.length,
      },
      nutrition_source: nutritionBulk.sources,
      participants: participantSummaries,
      rows: diagnosticRows,
    });
  } catch (error: any) {
    return fail(
      clean(error?.message || "Diagnostik Streak Admin gagal dijalankan."),
      500,
    );
  }
}
