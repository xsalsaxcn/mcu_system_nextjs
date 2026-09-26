// WELLNESS_JAKVAS_REPORT_V1_SERVER
// Read-only loader for canonical participant/clinical data + isolated JAKVAS
// self-report profile. No streak/point/fitness/target rules are changed.

import { fetchWellnessGoogleSheetRows } from "@/lib/wellness/googleSheetResponses";
import {
  latestCanonicalClinicalRow,
  resolveCanonicalClinicalHistory,
} from "@/lib/wellness/canonicalClinicalHistory";
import { filterClinicalRowsForProgram } from "@/lib/wellness/programWindow";
import {
  calculateJakvas,
  type JakvasActivityCategory,
  type JakvasSmokingStatus,
} from "@/lib/wellness/jakvas";

function clean(value: any) {
  return String(value ?? "").trim();
}

function numberOrNull(value: any): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).replace(",", ".").replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function participantCode(participant: any) {
  return clean(
    participant?.code ||
      participant?.employee_code ||
      participant?.participant_code ||
      participant?.no_karyawan ||
      participant?.kode_karyawan,
  );
}

function parseDate(value: any): Date | null {
  const text = clean(value);
  if (!text) return null;
  const date = new Date(text.length === 10 ? `${text}T00:00:00+07:00` : text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function ageFromBirthDate(value: any): number | null {
  const dob = parseDate(value);
  if (!dob) return null;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const month = now.getMonth() - dob.getMonth();
  if (month < 0 || (month === 0 && now.getDate() < dob.getDate())) age -= 1;
  return age >= 0 && age <= 130 ? age : null;
}

async function safeSelect(supabase: any, table: string, participantId: number, orderField?: string) {
  try {
    let query = supabase.from(table).select("*").eq("participant_id", participantId);
    if (orderField) query = query.order(orderField, { ascending: true });
    const result = await query.limit(1000);
    return result?.error ? [] : result?.data || [];
  } catch {
    return [];
  }
}

function latestRowWith(rows: any[], predicate: (row: any) => boolean) {
  const filtered = (rows || []).filter(predicate);
  return latestCanonicalClinicalRow(filtered);
}

function clinicalDate(row: any) {
  return clean(row?.checkup_date || row?.exam_date || row?.log_date || row?.measurement_date || row?.created_at).slice(0, 10);
}

function normalizeBoolean(value: any): boolean | null {
  if (value === true || value === false) return value;
  const text = clean(value).toLowerCase();
  if (["true", "1", "yes", "ya", "y"].includes(text)) return true;
  if (["false", "0", "no", "tidak", "n"].includes(text)) return false;
  return null;
}

function emptyProfile() {
  return {
    participant_id: null,
    smoking_status: null as JakvasSmokingStatus | null,
    diabetes_status: null as boolean | null,
    prior_cvd: null as boolean | null,
    physical_activity_category: null as JakvasActivityCategory | null,
    updated_at: null,
    updated_by_role: null,
  };
}

export async function loadJakvasProfile(supabase: any, participantId: number) {
  try {
    const result = await supabase
      .from("wellness_jakvas_profiles")
      .select("participant_id,smoking_status,diabetes_status,prior_cvd,physical_activity_category,updated_at,updated_by_role")
      .eq("participant_id", participantId)
      .maybeSingle();

    if (result?.error) {
      const message = clean(result.error?.message).toLowerCase();
      if (message.includes("wellness_jakvas_profiles") || message.includes("does not exist")) {
        return { profile: emptyProfile(), storage_ready: false };
      }
      throw result.error;
    }

    const row = result?.data || {};
    return {
      profile: {
        participant_id: Number(row?.participant_id || participantId),
        smoking_status: ["never", "former", "current"].includes(clean(row?.smoking_status))
          ? (clean(row?.smoking_status) as JakvasSmokingStatus)
          : null,
        diabetes_status: normalizeBoolean(row?.diabetes_status),
        prior_cvd: normalizeBoolean(row?.prior_cvd),
        physical_activity_category: ["heavy", "moderate", "light", "none"].includes(clean(row?.physical_activity_category))
          ? (clean(row?.physical_activity_category) as JakvasActivityCategory)
          : null,
        updated_at: row?.updated_at || null,
        updated_by_role: row?.updated_by_role || null,
      },
      storage_ready: true,
    };
  } catch (error) {
    throw error;
  }
}

export async function loadParticipantJakvasReport(args: {
  supabase: any;
  participant: any;
}) {
  const { supabase, participant } = args;
  const participantId = Number(participant?.id || participant?.participant_id || 0);
  if (!(participantId > 0)) throw new Error("Participant JAKVAS tidak valid.");

  const [checkupRows, clinicalRows, miniMcuRows, sheetResult, profileResult] = await Promise.all([
    safeSelect(supabase, "wellness_checkup_history", participantId, "checkup_date"),
    safeSelect(supabase, "wellness_clinical_history", participantId),
    safeSelect(supabase, "wellness_mini_mcu_logs", participantId, "exam_date"),
    fetchWellnessGoogleSheetRows({
      participantId,
      code: participantCode(participant),
      limit: 1000,
    }).catch(() => ({ ok: false, rows: [] as any[] })),
    loadJakvasProfile(supabase, participantId),
  ]);

  const canonicalClinical = filterClinicalRowsForProgram(
    participant,
    resolveCanonicalClinicalHistory({
      participant,
      databaseRows: [...checkupRows, ...clinicalRows, ...miniMcuRows],
      sheetRows: sheetResult?.rows || [],
    }),
    "",
    "",
  );

  const latestClinical = latestCanonicalClinicalRow(canonicalClinical);
  const latestBpRow = latestRowWith(
    canonicalClinical,
    (row) => numberOrNull(row?.systolic) !== null && numberOrNull(row?.diastolic) !== null,
  );
  const latestBmiRow = latestRowWith(
    canonicalClinical,
    (row) => numberOrNull(row?.bmi) !== null,
  );

  const ageYears =
    ageFromBirthDate(
      participant?.birth_date ||
        participant?.date_of_birth ||
        participant?.dob ||
        participant?.tanggal_lahir,
    ) ??
    numberOrNull(latestClinical?.age_years) ??
    numberOrNull(participant?.age_years) ??
    numberOrNull(participant?.age);

  const gender =
    participant?.gender ||
    participant?.sex ||
    participant?.jenis_kelamin ||
    latestClinical?.gender ||
    latestClinical?.sex ||
    latestClinical?.jenis_kelamin ||
    null;

  const report = calculateJakvas({
    gender,
    age_years: ageYears,
    systolic: latestBpRow?.systolic,
    diastolic: latestBpRow?.diastolic,
    bmi: latestBmiRow?.bmi,
    smoking_status: profileResult.profile.smoking_status,
    diabetes_status: profileResult.profile.diabetes_status,
    prior_cvd: profileResult.profile.prior_cvd,
    physical_activity_category: profileResult.profile.physical_activity_category,
  });

  return {
    ...report,
    participant: {
      id: participantId,
      code: participantCode(participant),
      name: clean(participant?.name || participant?.employee_name || participant?.full_name),
    },
    profile: profileResult.profile,
    profile_storage_ready: profileResult.storage_ready,
    sources: {
      clinical_engine: "canonicalClinicalHistory",
      clinical_rows: canonicalClinical.length,
      latest_clinical_date: clinicalDate(latestClinical),
      blood_pressure_date: clinicalDate(latestBpRow),
      bmi_date: clinicalDate(latestBmiRow),
      google_sheet_ok: Boolean(sheetResult?.ok),
      self_report_updated_at: profileResult.profile.updated_at || null,
    },
  };
}

export async function saveParticipantJakvasProfile(args: {
  supabase: any;
  participantId: number;
  input: any;
  updatedByRole: string;
  updatedById?: any;
}) {
  const { supabase, participantId, input, updatedByRole, updatedById } = args;

  const smoking = clean(input?.smoking_status);
  const activity = clean(input?.physical_activity_category);
  const diabetes = normalizeBoolean(input?.diabetes_status);
  const priorCvd = normalizeBoolean(input?.prior_cvd);

  if (!["never", "former", "current"].includes(smoking)) {
    throw new Error("Status merokok JAKVAS belum valid.");
  }
  if (!["heavy", "moderate", "light", "none"].includes(activity)) {
    throw new Error("Kategori aktivitas fisik JAKVAS belum valid.");
  }
  if (diabetes === null) throw new Error("Status diabetes JAKVAS wajib dipilih.");
  if (priorCvd === null) throw new Error("Riwayat penyakit kardiovaskular wajib dipilih.");

  const payload = {
    participant_id: participantId,
    smoking_status: smoking,
    diabetes_status: diabetes,
    prior_cvd: priorCvd,
    physical_activity_category: activity,
    updated_by_role: clean(updatedByRole) || "participant",
    updated_by_id: updatedById === null || updatedById === undefined ? null : clean(updatedById),
    updated_at: new Date().toISOString(),
  };

  const result = await supabase
    .from("wellness_jakvas_profiles")
    .upsert(payload, { onConflict: "participant_id" })
    .select("*")
    .single();

  if (result.error) throw result.error;
  return result.data;
}
