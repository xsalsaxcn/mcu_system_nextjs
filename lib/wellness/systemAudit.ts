// WELLNESS_SYSTEM_AUDIT_WORKFLOW_V126M37
// Base audit remains read-only for production health data; workflow status is stored separately.
// Read-only consistency audit for Wellness production data.
// This module never inserts, updates, deletes, retries, or corrects data.

import {
  activityFitnessProvider,
  loadParticipantControlMap,
} from "@/lib/wellness/participantControls";
import { loadCanonicalNutritionHistories } from "@/lib/wellness/nutritionHistory";
import {
  participantNutritionCalorieLimit,
  participantWorkoutCalorieTarget,
} from "@/lib/wellness/pointRules";
import {
  buildWellnessStreakSummary,
  wellnessJakartaDate,
  wellnessStreakSteps,
  wellnessStreakWorkoutCalories,
} from "@/lib/wellness/streak";

export type WellnessAuditSeverity = "critical" | "high" | "medium" | "low";
export type WellnessAuditModule =
  | "system"
  | "identity"
  | "nutrition"
  | "workout"
  | "fitness"
  | "targets"
  | "streak"
  | "nakes";

export type WellnessAuditIssue = {
  id: string;
  fingerprint: string;
  code: string;
  check_key: string;
  module: WellnessAuditModule;
  severity: WellnessAuditSeverity;
  status: "fail" | "warning";
  participant_id: number | null;
  participant_code: string;
  participant_name: string;
  date: string;
  title: string;
  finding: string;
  expected: string;
  actual: string;
  recommendation: string;
  evidence: Record<string, string | number | boolean | null>;
};

type QueryResult = {
  rows: any[];
  ok: boolean;
  message: string;
};

type AuditParams = {
  supabase: any;
  days?: number;
  participantId?: number;
  maxIssues?: number;
};

const SEVERITY_ORDER: Record<WellnessAuditSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

function clean(value: any) {
  return String(value ?? "").trim();
}

function numberValue(value: any) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const text = clean(value);
  if (!text) return 0;
  const normalized = /^-?\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(text)
    ? text.replace(/\./g, "").replace(",", ".")
    : text.replace(",", ".").replace(/[^\d.-]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function active(value: any) {
  return ![false, 0, "0", "false", "inactive", "nonaktif"].includes(
    typeof value === "string" ? value.toLowerCase() : value,
  );
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

function normalizeText(value: any) {
  return clean(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function participantId(row: any) {
  return numberValue(row?.id || row?.participant_id || row?.wellness_participant_id);
}

function participantCode(row: any) {
  return clean(row?.code || row?.employee_code || row?.no_karyawan);
}

function participantName(row: any) {
  return (
    clean(row?.name || row?.full_name || row?.employee_name) ||
    `Peserta ${participantId(row) || "-"}`
  );
}

function jakartaToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function addDays(date: string, offset: number) {
  const parsed = new Date(`${date}T12:00:00+07:00`);
  parsed.setUTCDate(parsed.getUTCDate() + offset);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(parsed);
}

function safeDate(value: any) {
  const text = clean(value);
  if (!text) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  if (/^\d{4}-\d{2}-\d{2}[T\s]/.test(text)) {
    return wellnessJakartaDate(text);
  }

  const local = text.match(/^(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})/);
  if (local) {
    const first = Number(local[1]);
    const second = Number(local[2]);
    const year = local[3];
    const month = first > 12 ? second : first;
    const day = first > 12 ? first : second;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  return wellnessJakartaDate(text);
}

function rowDate(row: any, fields: string[]) {
  const raw = parseRaw(row?.raw_payload);
  for (const field of fields) {
    const value = row?.[field] ?? raw?.[field];
    const date = safeDate(value);
    if (date) return date;
  }
  return "";
}

function hashText(text: string) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).toUpperCase();
}

async function safeRows(query: any): Promise<QueryResult> {
  try {
    const result = await query;
    if (result?.error) {
      return {
        rows: [],
        ok: false,
        message: clean(result.error?.message || "Query gagal."),
      };
    }
    return { rows: result?.data || [], ok: true, message: "" };
  } catch (error: any) {
    return {
      rows: [],
      ok: false,
      message: clean(error?.message || "Query gagal."),
    };
  }
}

function parseTargetNote(note: any) {
  const text = [note?.action_plan, note?.coach_note, note?.main_issue]
    .map(clean)
    .filter(Boolean)
    .join("\n");

  const find = (pattern: RegExp) => {
    const match = text.match(pattern);
    return match ? numberValue(match[1]) : 0;
  };

  return {
    nutrition: find(/Target\s+Nutrisi\s*:\s*([0-9.,]+)/i),
    workout: find(/Target\s+(?:Kalori\s+)?Workout\s*:\s*([0-9.,]+)/i),
    steps: find(/Target\s+Langkah\s*:\s*([0-9.,]+)/i),
  };
}

function isNutritionPoint(row: any) {
  const source = clean(row?.source_type).toLowerCase();
  const key = clean(row?.point_key).toLowerCase();
  return source === "nutrition_google_sheet" || key.startsWith("nutrition_input_");
}

function isDeviceDaily(row: any) {
  const raw = parseRaw(row?.raw_payload);
  const external = clean(
    row?.external_activity_id || row?.provider_activity_id,
  ).toLowerCase();
  const mode = clean(raw?.sync_mode).toLowerCase();
  const name = clean(row?.activity_name || row?.activity_type).toLowerCase();
  return (
    external.includes("google_fit_daily_") ||
    external.includes("health_connect_daily_") ||
    mode === "aggregate_daily" ||
    mode === "daily_aggregate" ||
    name.includes("google fit daily") ||
    name.includes("health connect daily")
  );
}

function activityExternalId(row: any) {
  return clean(row?.external_activity_id || row?.provider_activity_id);
}

function nakesHistoryDate(row: any) {
  const raw = parseRaw(row?.raw_payload);
  return safeDate(
    row?.checkup_date ||
      row?.exam_date ||
      row?.log_date ||
      raw?.checkup_date ||
      raw?.exam_date ||
      row?.created_at,
  );
}

function validNakesHistory(row: any) {
  const status = clean(row?.status).toLowerCase();
  return (
    active(row?.is_active) &&
    !["cancelled", "canceled", "deleted", "void", "batal"].includes(status)
  );
}

export async function runWellnessSystemAudit(params: AuditParams) {
  const days = Math.min(90, Math.max(7, Math.round(params.days || 14)));
  const maxIssues = Math.min(1000, Math.max(100, Math.round(params.maxIssues || 500)));
  const endDate = jakartaToday();
  const startDate = addDays(endDate, -(days - 1));
  const generatedAt = new Date().toISOString();

  const participantQuery = params.supabase
    .from("wellness_participants")
    .select("*")
    .limit(10000);

  const [
    participantResult,
    activityLogDateResult,
    activityCreatedResult,
    pointResult,
    noteResult,
    nakesResult,
  ] = await Promise.all([
    safeRows(participantQuery),
    safeRows(
      params.supabase
        .from("wellness_activity_logs")
        .select("*")
        .gte("log_date", startDate)
        .lte("log_date", endDate)
        .limit(50000),
    ),
    safeRows(
      params.supabase
        .from("wellness_activity_logs")
        .select("*")
        .gte("created_at", `${startDate}T00:00:00`)
        .limit(50000),
    ),
    safeRows(
      params.supabase
        .from("wellness_point_logs")
        .select("*")
        .gte("log_date", startDate)
        .lte("log_date", endDate)
        .limit(50000),
    ),
    safeRows(
      params.supabase
        .from("wellness_coach_notes")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(30000),
    ),
    safeRows(
      params.supabase
        .from("wellness_checkup_history")
        .select("*")
        .limit(50000),
    ),
  ]);

  const activityRowsByIdentity = new Map<string, any>();
  for (const row of [
    ...activityLogDateResult.rows,
    ...activityCreatedResult.rows,
  ]) {
    const identity = clean(row?.id)
      ? `id:${clean(row.id)}`
      : `fallback:${numberValue(row?.participant_id)}:${rowDate(row, ["log_date", "started_at", "created_at"])}:${activityExternalId(row)}:${clean(row?.activity_name || row?.activity_type)}`;
    activityRowsByIdentity.set(identity, row);
  }
  const activityResult: QueryResult = {
    rows: [...activityRowsByIdentity.values()],
    ok: activityLogDateResult.ok || activityCreatedResult.ok,
    message: [activityLogDateResult.message, activityCreatedResult.message]
      .filter(Boolean)
      .join(" | "),
  };

  let participants = participantResult.rows.filter((row: any) => active(row?.is_active));
  if (params.participantId && params.participantId > 0) {
    participants = participants.filter(
      (row: any) => participantId(row) === Number(params.participantId),
    );
  }

  const participantIds = new Set(participants.map(participantId).filter(Boolean));
  const participantById = new Map<number, any>(
    participants.map((row: any) => [participantId(row), row]),
  );
  const participantByCode = new Map<string, any>();
  for (const participant of participants) {
    const code = normalizeText(participantCode(participant));
    if (code) participantByCode.set(code, participant);
  }

  const activities = activityResult.rows.filter((row: any) =>
    participantIds.has(numberValue(row?.participant_id)),
  );
  const pointRows = pointResult.rows.filter((row: any) =>
    participantIds.has(numberValue(row?.participant_id)),
  );
  const notes = noteResult.rows.filter((row: any) =>
    participantIds.has(numberValue(row?.participant_id)),
  );
  const nakesRows = nakesResult.rows.filter((row: any) => {
    if (!validNakesHistory(row)) return false;
    const date = nakesHistoryDate(row);
    return !date || (date >= startDate && date <= endDate);
  });

  const controlMap = await loadParticipantControlMap(
    params.supabase,
    [...participantIds],
  ).catch(() => new Map<number, any>());

  const nutritionBulk = await loadCanonicalNutritionHistories({
    supabase: params.supabase,
    participants,
  }).catch((error: any) => ({
    byParticipantId: new Map<number, any>(),
    sources: {
      supabase_rows: 0,
      google_sheet_ok: false,
      google_sheet_message: clean(error?.message || "Nutrition source gagal dimuat."),
      google_sheet_rows: 0,
      unmatched_google_sheet_rows: 0,
    },
  }));

  const issues: WellnessAuditIssue[] = [];
  const evaluatedChecks = new Set<string>();
  const failedChecks = new Set<string>();

  function markCheck(checkKey: string) {
    evaluatedChecks.add(checkKey);
  }

  function addIssue(input: Omit<WellnessAuditIssue, "id" | "status" | "fingerprint">) {
    markCheck(input.check_key);
    failedChecks.add(input.check_key);
    const issue: WellnessAuditIssue = {
      ...input,
      fingerprint: `WAF-${hashText([
        input.code,
        input.check_key,
        input.participant_id || 0,
        input.date,
      ].join("|"))}`,
      id: `AUD-${hashText([
        input.code,
        input.check_key,
        input.participant_id || 0,
        input.date,
        input.actual,
      ].join("|"))}`,
      status:
        input.severity === "critical" || input.severity === "high"
          ? "fail"
          : "warning",
    };
    issues.push(issue);
  }

  function personFields(id: number | null) {
    const participant = id ? participantById.get(id) : null;
    return {
      participant_id: id || null,
      participant_code: participant ? participantCode(participant) : "",
      participant_name: participant ? participantName(participant) : "",
    };
  }

  const sourceResults = [
    { key: "participants", label: "Peserta", result: participantResult },
    { key: "activities", label: "Workout/Device", result: activityResult },
    { key: "points", label: "Point Ledger", result: pointResult },
    { key: "coach_notes", label: "Target Coach", result: noteResult },
    { key: "nakes", label: "History NAKES", result: nakesResult },
  ];

  for (const source of sourceResults) {
    const key = `system:source:${source.key}`;
    markCheck(key);
    if (!source.result.ok) {
      addIssue({
        code: "SYSTEM_SOURCE_QUERY_FAILED",
        check_key: key,
        module: "system",
        severity: "critical",
        ...personFields(null),
        date: endDate,
        title: `${source.label} gagal dibaca`,
        finding: `Audit tidak dapat membaca sumber ${source.label}.`,
        expected: "Sumber data dapat dibaca dalam mode read-only.",
        actual: source.result.message || "Query gagal.",
        recommendation: "Periksa koneksi Supabase, nama tabel/kolom, dan permission service role.",
        evidence: { source: source.key, rows: source.result.rows.length },
      });
    }
  }

  const nutritionSourceKey = "nutrition:google-sheet-source";
  markCheck(nutritionSourceKey);
  if (!nutritionBulk.sources.google_sheet_ok) {
    addIssue({
      code: "NUTRITION_GOOGLE_SHEET_UNAVAILABLE",
      check_key: nutritionSourceKey,
      module: "nutrition",
      severity: "critical",
      ...personFields(null),
      date: endDate,
      title: "Google Sheet nutrisi tidak dapat dibaca",
      finding: "Canonical nutrition history tidak tersedia untuk audit.",
      expected: "Google Sheet CSV dapat dibaca oleh server.",
      actual: clean(nutritionBulk.sources.google_sheet_message) || "Tidak tersedia.",
      recommendation: "Periksa GOOGLE_SHEET_NUTRITION_CSV_URL dan akses publik CSV.",
      evidence: { google_sheet_rows: nutritionBulk.sources.google_sheet_rows },
    });
  }

  const unmatchedNutritionKey = "nutrition:unmatched-sheet-rows";
  markCheck(unmatchedNutritionKey);
  if (numberValue(nutritionBulk.sources.unmatched_google_sheet_rows) > 0) {
    addIssue({
      code: "NUTRITION_UNMATCHED_SHEET_ROWS",
      check_key: unmatchedNutritionKey,
      module: "nutrition",
      severity: "high",
      ...personFields(null),
      date: endDate,
      title: "Row nutrisi tidak terhubung ke peserta",
      finding: "Ada row Google Sheet yang tidak dapat dipetakan ke Participant ID/kode peserta.",
      expected: "Seluruh row nutrisi memiliki identitas peserta yang dapat dipetakan.",
      actual: `${nutritionBulk.sources.unmatched_google_sheet_rows} row tidak terpetakan.`,
      recommendation: "Lengkapi Participant ID/kode dan bersihkan identitas duplikat pada Google Sheet.",
      evidence: {
        unmatched_rows: numberValue(nutritionBulk.sources.unmatched_google_sheet_rows),
        matched_rows: numberValue(nutritionBulk.sources.google_sheet_rows),
      },
    });
  }

  const names = new Map<string, any[]>();
  for (const participant of participants) {
    const key = normalizeText(participantName(participant));
    if (!key) continue;
    if (!names.has(key)) names.set(key, []);
    names.get(key)!.push(participant);
  }

  for (const [nameKey, rows] of names) {
    if (rows.length < 2) continue;
    const key = `identity:duplicate-name:${nameKey}`;
    addIssue({
      code: "IDENTITY_DUPLICATE_NAME",
      check_key: key,
      module: "identity",
      severity: "medium",
      ...personFields(null),
      date: endDate,
      title: "Nama peserta duplikat",
      finding: "Lebih dari satu Participant ID menggunakan nama yang sama.",
      expected: "Pemilihan peserta menggunakan Participant ID dan kode unik.",
      actual: rows
        .map((row: any) => `${participantName(row)} [ID ${participantId(row)} / ${participantCode(row) || "tanpa kode"}]`)
        .join("; "),
      recommendation: "Pertahankan data, tetapi wajib tampilkan Participant ID/kode pada seluruh selector.",
      evidence: { duplicate_count: rows.length },
    });
  }

  const activitiesByParticipant = new Map<number, any[]>();
  const pointsByParticipant = new Map<number, any[]>();
  const notesByParticipant = new Map<number, any[]>();
  for (const row of activities) {
    const id = numberValue(row?.participant_id);
    if (!activitiesByParticipant.has(id)) activitiesByParticipant.set(id, []);
    activitiesByParticipant.get(id)!.push(row);
  }
  for (const row of pointRows) {
    const id = numberValue(row?.participant_id);
    if (!pointsByParticipant.has(id)) pointsByParticipant.set(id, []);
    pointsByParticipant.get(id)!.push(row);
  }
  for (const row of notes) {
    const id = numberValue(row?.participant_id);
    if (!notesByParticipant.has(id)) notesByParticipant.set(id, []);
    notesByParticipant.get(id)!.push(row);
  }

  const participantDiagnostics: any[] = [];

  for (const participant of participants) {
    const id = participantId(participant);
    const person = personFields(id);
    const participantActivities = activitiesByParticipant.get(id) || [];
    const participantPoints = pointsByParticipant.get(id) || [];
    const participantNotes = notesByParticipant.get(id) || [];
    const control = controlMap.get(id) || null;
    const nutritionHistory = nutritionBulk.byParticipantId.get(id) || {
      logs: [],
      sources: nutritionBulk.sources,
    };
    const nutritionLogs = (nutritionHistory.logs || []).filter((row: any) => {
      const date = safeDate(row?.log_date || row?.created_at);
      return date >= startDate && date <= endDate;
    });

    const identityKey = `identity:code:${id}`;
    markCheck(identityKey);
    if (!participantCode(participant)) {
      addIssue({
        code: "IDENTITY_MISSING_CODE",
        check_key: identityKey,
        module: "identity",
        severity: "medium",
        ...person,
        date: endDate,
        title: "Kode peserta kosong",
        finding: "Participant ID tersedia tetapi kode peserta tidak terisi.",
        expected: "Setiap peserta memiliki kode unik untuk pemetaan lintas sumber.",
        actual: "Kode kosong.",
        recommendation: "Isi kode peserta tanpa mengubah Participant ID.",
        evidence: { participant_id: id },
      });
    }

    let latestTargetNote: any = null;
    let noteTarget = { nutrition: 0, workout: 0, steps: 0 };
    for (const note of participantNotes) {
      const parsed = parseTargetNote(note);
      if (parsed.nutrition > 0 || parsed.workout > 0 || parsed.steps > 0) {
        latestTargetNote = note;
        noteTarget = parsed;
        break;
      }
    }

    const directNutrition = participantNutritionCalorieLimit(participant);
    const directWorkout = participantWorkoutCalorieTarget(participant);
    const directSteps = numberValue(participant?.daily_step_target || participant?.step_target);
    const resolvedNutrition = directNutrition || noteTarget.nutrition || 0;
    const resolvedWorkout = directWorkout || noteTarget.workout || 300;
    const resolvedSteps = noteTarget.steps || directSteps || 8000;

    const workoutTargetKey = `targets:workout:${id}`;
    markCheck(workoutTargetKey);
    if (resolvedWorkout > 1500) {
      addIssue({
        code: "TARGET_WORKOUT_UNREALISTIC",
        check_key: workoutTargetKey,
        module: "targets",
        severity: "high",
        ...person,
        date: endDate,
        title: "Target workout sangat tinggi",
        finding: "Target workout berpotensi membuat streak tidak mungkin tercapai.",
        expected: "Target workout ditetapkan realistis dan disetujui Coach.",
        actual: `${Math.round(resolvedWorkout)} kkal/hari.`,
        recommendation: "Review target Coach sebelum mengubah aturan streak.",
        evidence: { resolved_workout_target: resolvedWorkout },
      });
    }

    const stepTargetKey = `targets:steps:${id}`;
    markCheck(stepTargetKey);
    if (resolvedSteps < 1000 || resolvedSteps > 50000) {
      addIssue({
        code: "TARGET_STEP_OUT_OF_RANGE",
        check_key: stepTargetKey,
        module: "targets",
        severity: "high",
        ...person,
        date: endDate,
        title: "Target langkah di luar rentang wajar",
        finding: "Nilai target langkah perlu diverifikasi.",
        expected: "Target langkah berada pada rentang 1.000-50.000 langkah/hari.",
        actual: `${Math.round(resolvedSteps)} langkah/hari.`,
        recommendation: "Coach perlu mengoreksi target langkah peserta.",
        evidence: { resolved_step_target: resolvedSteps },
      });
    }

    const targetParityKey = `targets:parity:${id}`;
    markCheck(targetParityKey);
    const mismatch: string[] = [];
    if (directNutrition > 0 && noteTarget.nutrition > 0 && Math.abs(directNutrition - noteTarget.nutrition) > 1) {
      mismatch.push(`nutrisi kolom ${directNutrition} vs catatan ${noteTarget.nutrition}`);
    }
    if (directWorkout > 0 && noteTarget.workout > 0 && Math.abs(directWorkout - noteTarget.workout) > 1) {
      mismatch.push(`workout kolom ${directWorkout} vs catatan ${noteTarget.workout}`);
    }
    if (directSteps > 0 && noteTarget.steps > 0 && Math.abs(directSteps - noteTarget.steps) > 1) {
      mismatch.push(`langkah kolom ${directSteps} vs catatan ${noteTarget.steps}`);
    }
    if (mismatch.length > 0) {
      addIssue({
        code: "TARGET_SOURCE_MISMATCH",
        check_key: targetParityKey,
        module: "targets",
        severity: "high",
        ...person,
        date: safeDate(latestTargetNote?.created_at) || endDate,
        title: "Target Coach berbeda antar sumber",
        finding: "Kolom peserta dan catatan target Coach tidak memiliki nilai yang sama.",
        expected: "Portal Peserta dan Coach membaca target yang sama.",
        actual: mismatch.join("; "),
        recommendation: "Sinkronkan target melalui form Coach dan verifikasi hasil read-back.",
        evidence: {
          nutrition_column: directNutrition,
          nutrition_note: noteTarget.nutrition,
          workout_column: directWorkout,
          workout_note: noteTarget.workout,
          steps_column: directSteps,
          steps_note: noteTarget.steps,
        },
      });
    }

    const fitnessKey = `fitness:control:${id}`;
    markCheck(fitnessKey);
    if (control?.has_multiple_active_providers) {
      addIssue({
        code: "FITNESS_MULTIPLE_ACTIVE_PROVIDERS",
        check_key: fitnessKey,
        module: "fitness",
        severity: "high",
        ...person,
        date: endDate,
        title: "Lebih dari satu fitness provider aktif",
        finding: "Google Fit dan Health Connect aktif bersamaan sehingga berisiko terhitung ganda.",
        expected: "Hanya satu fitness provider aktif per peserta.",
        actual: (control.active_providers || []).join(", ") || "Lebih dari satu provider.",
        recommendation: "Pilih satu sumber aktif melalui Participant Control.",
        evidence: {
          fitness_source: control.fitness_source,
          active_provider_count: (control.active_providers || []).length,
        },
      });
    } else if (
      control?.fitness_enabled &&
      control?.fitness_source !== "none" &&
      !control?.source_connected
    ) {
      addIssue({
        code: "FITNESS_SOURCE_NOT_CONNECTED",
        check_key: fitnessKey,
        module: "fitness",
        severity: "high",
        ...person,
        date: endDate,
        title: "Fitness source dipilih tetapi belum terhubung",
        finding: "Participant Control menunjuk provider yang tidak memiliki koneksi aktif.",
        expected: "Provider terpilih memiliki koneksi/token yang valid.",
        actual: clean(control?.fitness_source || "none"),
        recommendation: "Hubungkan ulang provider atau nonaktifkan fitness sync untuk peserta.",
        evidence: { fitness_source: clean(control?.fitness_source || "none") },
      });
    }

    const duplicateExternal = new Map<string, any[]>();
    const dailyDevice = new Map<string, any[]>();
    let missingActivityDate = 0;
    let emptyActivity = 0;
    let inactiveProviderRows = 0;

    for (const row of participantActivities) {
      const date = rowDate(row, ["log_date", "started_at", "start_date_local", "created_at"]);
      if (!date) missingActivityDate += 1;
      const calories = wellnessStreakWorkoutCalories(row);
      const steps = wellnessStreakSteps(row);
      if (calories <= 0 && steps <= 0) emptyActivity += 1;

      const provider = activityFitnessProvider(row);
      if (
        provider !== "none" &&
        control?.fitness_source &&
        control.fitness_source !== "none" &&
        provider !== control.fitness_source
      ) {
        inactiveProviderRows += 1;
      }

      const externalId = activityExternalId(row);
      if (externalId) {
        const key = `${provider}:${externalId}`;
        if (!duplicateExternal.has(key)) duplicateExternal.set(key, []);
        duplicateExternal.get(key)!.push(row);
      }
      if (date && provider !== "none" && isDeviceDaily(row)) {
        const key = `${date}:${provider}`;
        if (!dailyDevice.has(key)) dailyDevice.set(key, []);
        dailyDevice.get(key)!.push(row);
      }
    }

    const activityDateKey = `workout:missing-date:${id}`;
    markCheck(activityDateKey);
    if (missingActivityDate > 0) {
      addIssue({
        code: "WORKOUT_DATE_MISSING",
        check_key: activityDateKey,
        module: "workout",
        severity: "high",
        ...person,
        date: endDate,
        title: "Workout tidak memiliki tanggal valid",
        finding: "Sebagian aktivitas tidak dapat ditempatkan pada hari yang benar.",
        expected: "Setiap aktivitas memiliki log_date/start date yang valid.",
        actual: `${missingActivityDate} row tanpa tanggal valid.`,
        recommendation: "Audit mapping tanggal sebelum menghitung grafik, poin, atau streak.",
        evidence: { affected_rows: missingActivityDate },
      });
    }

    const emptyActivityKey = `workout:empty:${id}`;
    markCheck(emptyActivityKey);
    if (emptyActivity > 0) {
      addIssue({
        code: "WORKOUT_EMPTY_METRICS",
        check_key: emptyActivityKey,
        module: "workout",
        severity: "medium",
        ...person,
        date: endDate,
        title: "Workout tanpa langkah dan kalori",
        finding: "Row aktivitas tersedia tetapi tidak membawa metrik yang dapat dihitung.",
        expected: "Minimal terdapat kalori atau langkah.",
        actual: `${emptyActivity} row kosong secara metrik.`,
        recommendation: "Periksa payload device/manual dan abaikan row kosong dari agregasi.",
        evidence: { affected_rows: emptyActivity },
      });
    }

    const inactiveProviderKey = `fitness:inactive-rows:${id}`;
    markCheck(inactiveProviderKey);
    if (inactiveProviderRows > 0) {
      addIssue({
        code: "FITNESS_INACTIVE_PROVIDER_ROWS",
        check_key: inactiveProviderKey,
        module: "fitness",
        severity: "medium",
        ...person,
        date: endDate,
        title: "Ada data dari provider yang tidak dipilih",
        finding: "Periode audit masih memiliki row device dari provider selain source aktif.",
        expected: "Kalkulasi hanya menggunakan provider yang dipilih Participant Control.",
        actual: `${inactiveProviderRows} row dari provider tidak aktif.`,
        recommendation: "Pastikan dashboard memakai filter provider aktif dan tidak menjumlahkan row lama.",
        evidence: {
          affected_rows: inactiveProviderRows,
          active_source: clean(control?.fitness_source || "none"),
        },
      });
    }

    for (const [key, rows] of duplicateExternal) {
      if (rows.length < 2) continue;
      const checkKey = `workout:duplicate-external:${id}:${key}`;
      addIssue({
        code: "WORKOUT_DUPLICATE_EXTERNAL_ID",
        check_key: checkKey,
        module: "workout",
        severity: "high",
        ...person,
        date: rowDate(rows[0], ["log_date", "started_at", "created_at"]) || endDate,
        title: "External activity ID terduplikasi",
        finding: "Satu aktivitas device tersimpan lebih dari satu kali.",
        expected: "External activity ID unik per peserta/provider.",
        actual: `${rows.length} row menggunakan ${key}.`,
        recommendation: "Jangan menghapus otomatis; periksa upsert key dan deduplikasi pada read path.",
        evidence: { duplicate_rows: rows.length, external_key: key },
      });
    }

    for (const [key, rows] of dailyDevice) {
      if (rows.length < 2) continue;
      const checkKey = `workout:duplicate-daily:${id}:${key}`;
      addIssue({
        code: "WORKOUT_DUPLICATE_DAILY_SNAPSHOT",
        check_key: checkKey,
        module: "workout",
        severity: "high",
        ...person,
        date: key.split(":")[0],
        title: "Snapshot device harian lebih dari satu",
        finding: "Lebih dari satu row agregat harian dapat membuat angka Coach/Portal berbeda.",
        expected: "Satu snapshot terbaru per tanggal dan provider.",
        actual: `${rows.length} snapshot untuk ${key}.`,
        recommendation: "Gunakan snapshot terbaru pada read path dan audit upsert device.",
        evidence: { duplicate_rows: rows.length, daily_key: key },
      });
    }

    const nutritionByDate = new Map<string, any[]>();
    let invalidNutritionRows = 0;
    for (const row of nutritionLogs) {
      const date = safeDate(row?.log_date || row?.created_at);
      const name = clean(row?.food_name || row?.title || row?.name);
      if (!date || !name) invalidNutritionRows += 1;
      if (date) {
        if (!nutritionByDate.has(date)) nutritionByDate.set(date, []);
        nutritionByDate.get(date)!.push(row);
      }
    }

    const nutritionPointByDate = new Map<string, any[]>();
    for (const row of participantPoints.filter(isNutritionPoint)) {
      const date = safeDate(row?.log_date || row?.created_at);
      if (!date) continue;
      if (!nutritionPointByDate.has(date)) nutritionPointByDate.set(date, []);
      nutritionPointByDate.get(date)!.push(row);
    }

    const nutritionValidityKey = `nutrition:validity:${id}`;
    markCheck(nutritionValidityKey);
    if (invalidNutritionRows > 0) {
      addIssue({
        code: "NUTRITION_INVALID_CANONICAL_ROW",
        check_key: nutritionValidityKey,
        module: "nutrition",
        severity: "high",
        ...person,
        date: endDate,
        title: "Riwayat nutrisi tidak lengkap",
        finding: "Ada row canonical tanpa tanggal atau nama makanan.",
        expected: "Setiap row nutrisi memiliki tanggal dan nama makanan.",
        actual: `${invalidNutritionRows} row tidak lengkap.`,
        recommendation: "Perbaiki field sumber pada Google Sheet; jangan membuat row baru otomatis.",
        evidence: { affected_rows: invalidNutritionRows },
      });
    }

    for (const [date, rows] of nutritionPointByDate) {
      const historyRows = nutritionByDate.get(date) || [];
      if (rows.length > 0 && historyRows.length === 0) {
        const checkKey = `nutrition:point-without-history:${id}:${date}`;
        addIssue({
          code: "NUTRITION_POINT_WITHOUT_HISTORY",
          check_key: checkKey,
          module: "nutrition",
          severity: "high",
          ...person,
          date,
          title: "Point nutrisi ada, history tidak terbaca",
          finding: "Sistem pernah memberi point input tetapi row tidak muncul pada canonical Google Sheet history.",
          expected: "Point nutrisi dan history canonical berasal dari submission yang sama.",
          actual: `${rows.length} point, 0 history.`,
          recommendation: "Cari submission ID/row Sheet terkait dan lakukan audit sinkronisasi tanpa input ulang.",
          evidence: { point_rows: rows.length, history_rows: 0 },
        });
      }
    }

    for (const [date, rows] of nutritionByDate) {
      const pointForDate = nutritionPointByDate.get(date) || [];
      const checkKey = `nutrition:history-point-parity:${id}:${date}`;
      markCheck(checkKey);
      if (rows.length > 0 && pointForDate.length === 0) {
        addIssue({
          code: "NUTRITION_HISTORY_WITHOUT_POINT",
          check_key: checkKey,
          module: "nutrition",
          severity: "low",
          ...person,
          date,
          title: "History nutrisi ada tanpa point input",
          finding: "Data makanan tampil, tetapi point ledger tidak memiliki input nutrisi pada tanggal yang sama.",
          expected: "Submission eligible menghasilkan point idempotent.",
          actual: `${rows.length} history, 0 point.`,
          recommendation: "Periksa point writer; jangan menambahkan point otomatis dari halaman audit.",
          evidence: { history_rows: rows.length, point_rows: 0 },
        });
      }
    }

    const streakKey = `streak:canonical:${id}`;
    markCheck(streakKey);
    const streak = buildWellnessStreakSummary({
      nutritionRows: nutritionLogs,
      activityRows: participantActivities,
      workoutTargetCalories: resolvedWorkout,
      historyDays: Math.max(42, days),
    });

    participantDiagnostics.push({
      participant_id: id,
      code: participantCode(participant),
      name: participantName(participant),
      nutrition_rows: nutritionLogs.length,
      activity_rows: participantActivities.length,
      nutrition_target: resolvedNutrition,
      workout_target: resolvedWorkout,
      step_target: resolvedSteps,
      fitness_source: clean(control?.fitness_source || "none"),
      current_streak: numberValue(streak.current_streak),
      longest_streak: numberValue(streak.longest_streak),
    });
  }

  const nakesBySourceKey = new Map<string, any[]>();
  let calendarEligibleRows = 0;
  let nakesParticipantMatchedRows = 0;

  for (const row of nakesRows) {
    const raw = parseRaw(row?.raw_payload);
    let id = numberValue(row?.participant_id || raw?.participant_id);
    let participant = participantById.get(id) || null;
    if (!participant) {
      const code = normalizeText(
        row?.employee_code || row?.participant_code || raw?.participant_code || raw?.employee_code,
      );
      participant = code ? participantByCode.get(code) || null : null;
      id = participant ? participantId(participant) : 0;
    }
    const date = nakesHistoryDate(row);
    const person = personFields(id || null);

    const matchKey = `nakes:participant-match:${numberValue(row?.id)}`;
    markCheck(matchKey);
    if (!participant) {
      addIssue({
        code: "NAKES_HISTORY_UNMATCHED_PARTICIPANT",
        check_key: matchKey,
        module: "nakes",
        severity: "high",
        ...person,
        participant_code: clean(row?.employee_code || row?.participant_code),
        participant_name: clean(row?.participant_name),
        date: date || endDate,
        title: "History NAKES tidak terhubung ke peserta",
        finding: "Row history tidak dapat dipetakan melalui Participant ID maupun kode.",
        expected: "Setiap history NAKES terhubung ke peserta aktif.",
        actual: `History ID ${numberValue(row?.id) || "-"}.`,
        recommendation: "Verifikasi Participant ID/kode; jangan memindahkan atau menghapus history otomatis.",
        evidence: { history_id: numberValue(row?.id), raw_participant_id: numberValue(row?.participant_id) },
      });
    } else {
      nakesParticipantMatchedRows += 1;
    }

    const dateKey = `nakes:date:${numberValue(row?.id)}`;
    markCheck(dateKey);
    if (!date) {
      addIssue({
        code: "NAKES_HISTORY_DATE_INVALID",
        check_key: dateKey,
        module: "nakes",
        severity: "high",
        ...person,
        date: endDate,
        title: "Tanggal history NAKES tidak valid",
        finding: "History tidak dapat ditempatkan pada kalender pemeriksaan.",
        expected: "checkup_date memiliki format tanggal yang valid.",
        actual: clean(row?.checkup_date || row?.created_at) || "Kosong.",
        recommendation: "Koreksi tanggal melalui proses terkontrol setelah mendapat approval Admin.",
        evidence: { history_id: numberValue(row?.id) },
      });
    }

    if (participant && date) calendarEligibleRows += 1;

    const createdFromNakesForm =
      clean(raw?.saved_from) === "wellness_nakes_input" ||
      Boolean(clean(raw?.nakes_marker || raw?.nakes_sync_marker));
    if (createdFromNakesForm) {
      const revision = Math.max(1, numberValue(raw?.nakes_revision) || 1);
      const syncedRevision = numberValue(raw?.google_sheet_synced_revision);
      const sheetRow = numberValue(raw?.google_sheet_row_number);
      const lastError = clean(raw?.google_sheet_last_error);
      const syncKey = `nakes:sheet-sync:${numberValue(row?.id)}`;
      markCheck(syncKey);
      if (lastError && (syncedRevision < revision || sheetRow <= 0)) {
        addIssue({
          code: "NAKES_GOOGLE_SHEET_SYNC_FAILED",
          check_key: syncKey,
          module: "nakes",
          severity: "high",
          ...person,
          date: date || endDate,
          title: "Sinkronisasi Google Sheet NAKES gagal",
          finding: "History aman tersimpan, tetapi revisi terbaru belum memiliki bukti row Sheet.",
          expected: "Revisi terbaru memiliki synced revision dan row number.",
          actual: lastError,
          recommendation: "Gunakan retry Google Sheet pada history yang sama; jangan input ulang data klinis.",
          evidence: {
            history_id: numberValue(row?.id),
            revision,
            synced_revision: syncedRevision,
            sheet_row: sheetRow,
          },
        });
      } else if (syncedRevision < revision || sheetRow <= 0) {
        addIssue({
          code: "NAKES_REVISION_NOT_CONFIRMED_IN_SHEET",
          check_key: syncKey,
          module: "nakes",
          severity: "medium",
          ...person,
          date: date || endDate,
          title: "Revisi NAKES belum terkonfirmasi di Sheet",
          finding: "Tidak ada error terakhir, tetapi metadata sinkronisasi revisi belum lengkap.",
          expected: "synced revision sama dengan revision aktif dan row number tersedia.",
          actual: `revision ${revision}, synced ${syncedRevision}, row ${sheetRow || 0}.`,
          recommendation: "Verifikasi row Sheet secara manual atau jalankan retry aman.",
          evidence: {
            history_id: numberValue(row?.id),
            revision,
            synced_revision: syncedRevision,
            sheet_row: sheetRow,
          },
        });
      }
    }

    const sourceKey = clean(raw?.nakes_source_key);
    if (sourceKey) {
      if (!nakesBySourceKey.has(sourceKey)) nakesBySourceKey.set(sourceKey, []);
      nakesBySourceKey.get(sourceKey)!.push(row);
    }
  }

  for (const [sourceKey, rows] of nakesBySourceKey) {
    if (rows.length < 2) continue;
    const first = rows[0];
    const id = numberValue(first?.participant_id) || null;
    addIssue({
      code: "NAKES_DUPLICATE_SOURCE_KEY",
      check_key: `nakes:duplicate-source:${sourceKey}`,
      module: "nakes",
      severity: "high",
      ...personFields(id),
      date: nakesHistoryDate(first) || endDate,
      title: "Source key NAKES terduplikasi",
      finding: "Lebih dari satu history menggunakan source key yang seharusnya unik.",
      expected: "Satu source key mewakili satu history aktif yang direvisi non-destruktif.",
      actual: `${rows.length} history menggunakan source key yang sama.`,
      recommendation: "Audit ID history sebelum menentukan row canonical; jangan hapus otomatis.",
      evidence: { duplicate_rows: rows.length, source_key: sourceKey },
    });
  }

  const moduleCounts: Record<string, number> = {};
  const severityCounts: Record<string, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  };
  for (const issue of issues) {
    moduleCounts[issue.module] = (moduleCounts[issue.module] || 0) + 1;
    severityCounts[issue.severity] = (severityCounts[issue.severity] || 0) + 1;
  }

  const sortedIssues = [...issues].sort((left, right) => {
    const severity = SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity];
    if (severity !== 0) return severity;
    return `${right.date}|${right.id}`.localeCompare(`${left.date}|${left.id}`);
  });

  const failCount = severityCounts.critical + severityCounts.high;
  const warningCount = severityCounts.medium + severityCounts.low;
  const checksRun = evaluatedChecks.size;
  const passedChecks = Math.max(0, checksRun - failedChecks.size);
  const overallStatus =
    severityCounts.critical > 0
      ? "critical"
      : severityCounts.high > 0
        ? "failed"
        : warningCount > 0
          ? "warning"
          : "passed";

  return {
    marker: "WELLNESS_SYSTEM_AUDIT_WORKFLOW_V126M37",
    mode: "read_only",
    generated_at: generatedAt,
    period: { days, start_date: startDate, end_date: endDate },
    scope: {
      participant_id: params.participantId || null,
      participants: participants.length,
      activity_rows: activities.length,
      nutrition_rows: numberValue(nutritionBulk.sources.google_sheet_rows),
      point_rows: pointRows.length,
      nakes_rows: nakesRows.length,
    },
    summary: {
      status: overallStatus,
      checks_run: checksRun,
      passed_checks: passedChecks,
      failed_checks: failCount,
      warning_checks: warningCount,
      issue_count: issues.length,
      returned_issue_count: Math.min(sortedIssues.length, maxIssues),
      truncated_issue_count: Math.max(0, sortedIssues.length - maxIssues),
      severity_counts: severityCounts,
      module_counts: moduleCounts,
    },
    sources: {
      participants: {
        ok: participantResult.ok,
        message: participantResult.message,
        row_count: participantResult.rows.length,
      },
      activities: {
        ok: activityResult.ok,
        message: activityResult.message,
        row_count: activityResult.rows.length,
      },
      points: {
        ok: pointResult.ok,
        message: pointResult.message,
        row_count: pointResult.rows.length,
      },
      coach_notes: {
        ok: noteResult.ok,
        message: noteResult.message,
        row_count: noteResult.rows.length,
      },
      nakes: {
        ok: nakesResult.ok,
        message: nakesResult.message,
        row_count: nakesResult.rows.length,
      },
      nutrition: nutritionBulk.sources,
    },
    diagnostics: {
      nakes_calendar_eligible_rows: calendarEligibleRows,
      nakes_participant_matched_rows: nakesParticipantMatchedRows,
      participants: participantDiagnostics.slice(0, 1000),
    },
    issues: sortedIssues.slice(0, maxIssues),
  };
}
