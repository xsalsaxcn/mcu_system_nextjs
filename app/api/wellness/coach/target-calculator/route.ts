// WELLNESS_COACH_SPARSE_BASELINE_FALLBACK_V126M48
// WELLNESS_CANONICAL_CLINICAL_PARITY_V126M42_7
// WELLNESS_COACH_ACTIVITY_TARGET_CALCULATOR_V126M39
// WELLNESS_COACH_GOAL_WEIGHT_NUTRITION_V126M40_3
// WELLNESS_COACH_FLEXIBLE_GOAL_WEIGHT_V126M40_4
// WELLNESS_COACH_FOUR_MONTH_WEIGHT_PHASE_PLANNER_V126M41
// WELLNESS_COACH_MONTHLY_NUTRITION_BUTTONS_V126M41_1
// WELLNESS_NAKES_SHEET_COACH_RECONCILIATION_V126M42_3
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  buildCoachGroupUnitMap,
  canCoachAccessParticipant,
} from "@/lib/wellness/coachGroupAccess";
import {
  filterActivityRowsByFitnessSource,
  loadParticipantControlMap,
} from "@/lib/wellness/participantControls";
import { filterOperationalRowsForProgram } from "@/lib/wellness/programWindow";
import { fetchWellnessGoogleSheetRows } from "@/lib/wellness/googleSheetResponses";
import { resolveCanonicalClinicalHistory } from "@/lib/wellness/canonicalClinicalHistory";
import {
  buildCoachActivityTargetRecommendation,
  buildCoachNutritionTargetRecommendation,
} from "@/lib/wellness/coachTargetCalculator";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !key) throw new Error("Supabase admin env is missing.");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function clean(value: any) {
  return String(value ?? "").trim();
}

function asNumber(value: any) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function participantCode(row: any) {
  return clean(
    row?.code ||
      row?.employee_code ||
      row?.participant_code ||
      row?.kode_karyawan ||
      row?.nik ||
      row?.employee_id,
  );
}

function participantName(row: any) {
  return clean(row?.name || row?.full_name || row?.employee_name || row?.nama) || "Peserta";
}


function positiveNumber(...values: any[]) {
  for (const value of values) {
    const parsed = asNumber(value);
    if (parsed > 0) return parsed;
  }
  return 0;
}

function rowDate(row: any) {
  return clean(row?.checkup_date || row?.exam_date || row?.log_date || row?.created_at);
}

function rowPayload(row: any) {
  if (!row?.raw_payload) return {};
  if (typeof row.raw_payload === "object") return row.raw_payload;
  try {
    const parsed = JSON.parse(String(row.raw_payload));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function sortableClinicalNumber(value: any) {
  const parsed = Number(value);
  if (Number.isFinite(parsed)) {
    return String(Math.max(0, Math.trunc(parsed))).padStart(20, "0");
  }
  return String(value || "");
}

function clinicalRecencyKey(row: any, dateColumn = "checkup_date") {
  const raw = rowPayload(row);
  return [
    clean(row?.[dateColumn] || rowDate(row)),
    clean(row?.updated_at || raw?.saved_at || row?.created_at),
    sortableClinicalNumber(raw?.nakes_revision || row?.revision || 0),
    sortableClinicalNumber(row?.id || 0),
  ].join("|");
}

function sortClinicalRows(rows: any[], dateColumn: string) {
  return [...(rows || [])].sort((a: any, b: any) =>
    clinicalRecencyKey(b, dateColumn).localeCompare(
      clinicalRecencyKey(a, dateColumn),
    ),
  );
}

function firstText(...values: any[]) {
  for (const value of values) {
    const text = clean(value);
    if (text) return text;
  }
  return "";
}

function profileAge(row: any, participant: any) {
  const raw = rowPayload(row);
  return positiveNumber(
    row?.age_years,
    row?.age,
    row?.usia,
    raw?.age_years,
    raw?.age,
    raw?.usia,
    raw?.["Usia"],
    participant?.age_years,
    participant?.age,
    participant?.usia,
  );
}

function profileBirthDate(row: any, participant: any) {
  const raw = rowPayload(row);
  return firstText(
    row?.birth_date,
    row?.date_of_birth,
    row?.birthdate,
    row?.dob,
    row?.tanggal_lahir,
    raw?.birth_date,
    raw?.date_of_birth,
    raw?.birthdate,
    raw?.dob,
    raw?.tanggal_lahir,
    raw?.["Tanggal Lahir"],
    raw?.participant_snapshot?.birth_date,
    participant?.birth_date,
    participant?.date_of_birth,
    participant?.birthdate,
    participant?.dob,
    participant?.tanggal_lahir,
  );
}

function profileGender(row: any, participant: any) {
  const raw = rowPayload(row);
  return firstText(
    row?.gender,
    row?.sex,
    row?.jenis_kelamin,
    raw?.gender,
    raw?.sex,
    raw?.jenis_kelamin,
    raw?.["Jenis Kelamin"],
    participant?.gender,
    participant?.sex,
    participant?.jenis_kelamin,
  );
}

async function safeClinicalRows(
  supabase: any,
  table: string,
  participantId: number,
  dateColumn: string,
) {
  try {
    const result = await supabase
      .from(table)
      .select("*")
      .eq("participant_id", participantId)
      .order(dateColumn, { ascending: false })
      .limit(20);
    return result.error ? [] : sortClinicalRows(result.data || [], dateColumn);
  } catch {
    return [];
  }
}

function sheetField(row: any, ...keys: string[]) {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== null && value !== undefined && clean(value) !== "") return value;
  }
  return null;
}

function normalizedDateKey(value: any) {
  const text = clean(value);
  if (!text) return "";

  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    return `${iso[1]}-${String(iso[2]).padStart(2, "0")}-${String(iso[3]).padStart(2, "0")}`;
  }

  const local = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
  if (local) {
    return `${local[3]}-${String(local[2]).padStart(2, "0")}-${String(local[1]).padStart(2, "0")}`;
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

function sheetTimestampKey(row: any) {
  const value = sheetField(row, "Submission Date", "Updated At", "Created At");
  const parsed = value ? new Date(String(value)) : null;
  return parsed && !Number.isNaN(parsed.getTime())
    ? String(parsed.getTime()).padStart(16, "0")
    : clean(value);
}

function isNakesSheetRow(row: any) {
  const logType = clean(sheetField(row, "Log Type", "log_type")).toLowerCase();
  const marker = clean(sheetField(row, "NAKES Sync Marker", "Marker")).toLowerCase();
  return (
    logType === "nakes_checkup" ||
    marker.includes("nakes") ||
    Boolean(
      sheetField(
        row,
        "Tinggi Badan NAKES (cm)",
        "Berat Badan NAKES (kg)",
        "Usia NAKES (tahun)",
        "NAKES History ID",
      ),
    )
  );
}

function latestNakesSheetProfile(
  rows: any[],
  participant: any,
  participantId: number,
  code: string,
) {
  const normalizedCode = clean(code).toLowerCase();
  const candidates = (rows || [])
    .filter((row: any) => {
      if (!isNakesSheetRow(row)) return false;
      const rowParticipantId = asNumber(sheetField(row, "Participant ID", "participant_id"));
      const rowCode = clean(sheetField(row, "KODE", "Kode", "participant_code")).toLowerCase();
      return rowParticipantId === participantId || Boolean(normalizedCode && rowCode === normalizedCode);
    })
    .sort((a: any, b: any) => {
      const keyA = [
        normalizedDateKey(sheetField(a, "Log Date", "Tanggal Pemeriksaan NAKES", "Submission Date")),
        sheetTimestampKey(a),
        sortableClinicalNumber(sheetField(a, "NAKES Revision", "Revision") || 0),
        sortableClinicalNumber(a?._rowNumber || 0),
      ].join("|");
      const keyB = [
        normalizedDateKey(sheetField(b, "Log Date", "Tanggal Pemeriksaan NAKES", "Submission Date")),
        sheetTimestampKey(b),
        sortableClinicalNumber(sheetField(b, "NAKES Revision", "Revision") || 0),
        sortableClinicalNumber(b?._rowNumber || 0),
      ].join("|");
      return keyB.localeCompare(keyA);
    });

  for (const row of candidates) {
    const weight = positiveNumber(
      sheetField(row, "Berat Badan NAKES (kg)", "BB Monitoring terbaru", "BB anda per hari ini (diisi sekali saja perminggu)"),
    );
    const height = positiveNumber(sheetField(row, "Tinggi Badan NAKES (cm)"));
    const age = positiveNumber(sheetField(row, "Usia NAKES (tahun)", "Usia"));
    const bmi = positiveNumber(sheetField(row, "BMI"));
    if (!(weight > 0 || height > 0 || age > 0)) continue;

    return {
      gender: firstText(
        sheetField(row, "Jenis Kelamin", "Gender", "Sex"),
        profileGender(null, participant),
      ),
      birth_date: profileBirthDate(null, participant),
      age_years: age || profileAge(null, participant),
      height_cm: height,
      weight_kg: weight,
      bmi,
      measurement_source: "Google Sheet NAKES",
      measurement_date: normalizedDateKey(
        sheetField(row, "Log Date", "Tanggal Pemeriksaan NAKES", "Submission Date"),
      ),
      measurement_updated_at: clean(sheetField(row, "Submission Date", "Updated At")),
      measurement_revision: positiveNumber(sheetField(row, "NAKES Revision", "Revision")),
      measurement_row_number: asNumber(row?._rowNumber),
    };
  }

  return null;
}

function reconcileClinicalProfile(databaseProfile: any, sheetProfile: any) {
  if (!sheetProfile) return databaseProfile;

  const databaseDate = normalizedDateKey(databaseProfile?.measurement_date);
  const sheetDate = normalizedDateKey(sheetProfile?.measurement_date);
  const sheetIsSameOrNewer = !databaseDate || Boolean(sheetDate && sheetDate >= databaseDate);

  if (!sheetIsSameOrNewer) {
    return {
      ...databaseProfile,
      age_years: databaseProfile?.age_years || sheetProfile?.age_years || 0,
      gender: databaseProfile?.gender || sheetProfile?.gender || "",
      birth_date: databaseProfile?.birth_date || sheetProfile?.birth_date || "",
    };
  }

  const weight = sheetProfile?.weight_kg || databaseProfile?.weight_kg || 0;
  const height = sheetProfile?.height_cm || databaseProfile?.height_cm || 0;
  const calculatedBmi = weight > 0 && height > 0
    ? Number((weight / Math.pow(height / 100, 2)).toFixed(1))
    : 0;

  return {
    ...databaseProfile,
    ...sheetProfile,
    gender: sheetProfile?.gender || databaseProfile?.gender || "",
    birth_date: sheetProfile?.birth_date || databaseProfile?.birth_date || "",
    age_years: sheetProfile?.age_years || databaseProfile?.age_years || 0,
    height_cm: height,
    weight_kg: weight,
    bmi: sheetProfile?.bmi || calculatedBmi || databaseProfile?.bmi || 0,
    measurement_source: "Google Sheet NAKES (sinkron terbaru)",
  };
}

function validClinicalWeight(value: any) {
  const parsed = positiveNumber(value);
  return parsed >= 25 && parsed <= 350 ? parsed : 0;
}

function validClinicalHeight(value: any) {
  const parsed = positiveNumber(value);
  return parsed >= 120 && parsed <= 230 ? parsed : 0;
}

function validClinicalBmi(value: any) {
  const parsed = positiveNumber(value);
  return parsed >= 10 && parsed <= 80 ? parsed : 0;
}

function latestClinicalProfile(participant: any, sources: Array<{ label: string; rows: any[] }>) {
  for (const source of sources) {
    const dateColumn =
      source.label === "Pemeriksaan NAKES"
        ? "checkup_date"
        : source.label === "Mini MCU"
          ? "exam_date"
          : "log_date";
    const orderedRows = sortClinicalRows(source.rows || [], dateColumn);
    const demographicRow = orderedRows.find((candidate: any) =>
      Boolean(
        profileAge(candidate, participant) ||
          profileBirthDate(candidate, participant) ||
          profileGender(candidate, participant),
      ),
    );

    const weightRow = orderedRows.find((candidate: any) =>
      Boolean(
        validClinicalWeight(
          candidate?.weight_kg || candidate?.weight || candidate?.body_weight,
        ),
      ),
    );
    const heightRow = orderedRows.find((candidate: any) =>
      Boolean(validClinicalHeight(candidate?.height_cm || candidate?.height)),
    );
    const participantHeight = validClinicalHeight(participant?.height_cm);
    const weight = validClinicalWeight(
      weightRow?.weight_kg || weightRow?.weight || weightRow?.body_weight,
    );
    const height =
      validClinicalHeight(weightRow?.height_cm || weightRow?.height) ||
      validClinicalHeight(heightRow?.height_cm || heightRow?.height) ||
      participantHeight;

    if (weight > 0 && height > 0) {
      const sourceRow = weightRow || heightRow || demographicRow;
      const storedBmi = validClinicalBmi(
        weightRow?.bmi || weightRow?.body_mass_index,
      );
      const calculatedBmi = Number(
        (weight / Math.pow(height / 100, 2)).toFixed(1),
      );
      return {
        gender:
          profileGender(sourceRow, participant) ||
          profileGender(demographicRow, participant),
        birth_date:
          profileBirthDate(sourceRow, participant) ||
          profileBirthDate(demographicRow, participant),
        age_years:
          profileAge(sourceRow, participant) ||
          profileAge(demographicRow, participant),
        height_cm: height,
        weight_kg: weight,
        bmi: storedBmi || calculatedBmi,
        measurement_source:
          heightRow && heightRow !== weightRow
            ? `${source.label} (tinggi valid dari history)`
            : source.label,
        measurement_date: rowDate(sourceRow),
      };
    }
  }

  return {
    gender: profileGender(null, participant),
    birth_date: profileBirthDate(null, participant),
    age_years: profileAge(null, participant),
    height_cm: validClinicalHeight(participant?.height_cm),
    weight_kg: validClinicalWeight(
      participant?.current_weight_kg ||
        participant?.initial_weight_kg ||
        participant?.baseline_weight_kg,
    ),
    bmi: validClinicalBmi(participant?.bmi || participant?.baseline_bmi),
    measurement_source: "Baseline peserta",
    measurement_date: participant?.updated_at || participant?.created_at,
  };
}

async function getCoach(request: NextRequest, supabase: any) {
  const token = request.cookies.get("wellness_coach_session")?.value || "";
  if (!token) return null;
  const { data, error } = await supabase
    .from("wellness_coach_auth_sessions")
    .select("*, coach:wellness_coach_users(*)")
    .eq("session_token", token)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (error || !data?.coach || data.coach.is_active === false) return null;
  return data.coach;
}

export async function GET(request: NextRequest) {
  try {
    const supabase = adminClient();
    const coach = await getCoach(request, supabase);
    if (!coach) {
      return NextResponse.json(
        { ok: false, message: "Session coach belum aktif." },
        { status: 401 },
      );
    }

    const participantId = asNumber(request.nextUrl.searchParams.get("participant_id"));
    const requestedCode = clean(request.nextUrl.searchParams.get("participant_code"));
    const ageOverride = Math.round(
      positiveNumber(request.nextUrl.searchParams.get("age_years")),
    );
    const genderOverride = clean(
      request.nextUrl.searchParams.get("gender"),
    ).toLowerCase();
    const goalWeightMode =
      clean(request.nextUrl.searchParams.get("goal_weight_mode")).toLowerCase() === "coach"
        ? "coach"
        : "bmi";
    const goalWeightOverride =
      goalWeightMode === "coach"
        ? positiveNumber(request.nextUrl.searchParams.get("goal_weight_kg"))
        : 0;
    const periodDays = Math.min(
      30,
      Math.max(7, asNumber(request.nextUrl.searchParams.get("days")) || 14),
    );
    if (!participantId) {
      return NextResponse.json(
        { ok: false, message: "participant_id wajib diisi." },
        { status: 400 },
      );
    }

    const [assignmentResult, groupUnitResult, participantResult] = await Promise.all([
      supabase
        .from("wellness_coach_group_assignments")
        .select("*")
        .eq("coach_user_id", asNumber(coach.id))
        .eq("is_active", true),
      supabase.from("wellness_group_units").select("*").limit(5000),
      supabase.from("wellness_participants").select("*").eq("id", participantId).maybeSingle(),
    ]);

    if (assignmentResult.error) throw assignmentResult.error;
    if (groupUnitResult.error) throw groupUnitResult.error;
    if (participantResult.error || !participantResult.data) {
      return NextResponse.json(
        { ok: false, message: "Peserta tidak ditemukan." },
        { status: 404 },
      );
    }

    const participant = participantResult.data;
    const groupUnitMap = buildCoachGroupUnitMap(groupUnitResult.data || []);
    if (
      !canCoachAccessParticipant(
        participant,
        assignmentResult.data || [],
        groupUnitMap,
      )
    ) {
      return NextResponse.json(
        { ok: false, message: "Peserta tidak termasuk assignment coach." },
        { status: 403 },
      );
    }

    const actualCode = participantCode(participant);
    if (requestedCode && actualCode && requestedCode !== actualCode) {
      return NextResponse.json(
        {
          ok: false,
          message: `Identitas peserta berubah. Participant ID ${participantId} terhubung ke kode ${actualCode}, bukan ${requestedCode}.`,
        },
        { status: 409 },
      );
    }

    const [
      activityResult,
      checkupRows,
      miniMcuRows,
      weightRows,
      sheetNakesResult,
    ] = await Promise.all([
      supabase
        .from("wellness_activity_logs")
        .select("*")
        .eq("participant_id", participantId)
        .order("log_date", { ascending: true })
        .limit(3000),
      safeClinicalRows(
        supabase,
        "wellness_checkup_history",
        participantId,
        "checkup_date",
      ),
      safeClinicalRows(
        supabase,
        "wellness_mini_mcu_logs",
        participantId,
        "exam_date",
      ),
      safeClinicalRows(
        supabase,
        "wellness_weight_logs",
        participantId,
        "log_date",
      ),
      fetchWellnessGoogleSheetRows({
        code: actualCode,
        participantId,
        limit: 500,
      }).catch((error: any) => ({
        ok: false,
        rows: [],
        message: error?.message || "Gagal membaca Google Sheet NAKES.",
      })),
    ]);
    if (activityResult.error) throw activityResult.error;

    const controlMap = await loadParticipantControlMap(supabase, [participantId]);
    const activityRows = filterOperationalRowsForProgram(
      participant,
      filterActivityRowsByFitnessSource(activityResult.data || [], controlMap),
      "",
      "",
      ["log_date", "started_at", "created_at"],
    );

    const calculation = buildCoachActivityTargetRecommendation(activityRows, {
      periodDays,
    });
    // WELLNESS_CANONICAL_CLINICAL_PARITY_V126M42_7
    // Kalkulator dan grafik Coach membaca history klinis canonical yang sama.
    const canonicalCheckupRows = resolveCanonicalClinicalHistory({
      participant,
      databaseRows: checkupRows,
      sheetRows: sheetNakesResult?.rows || [],
    });
    const databaseClinicalProfile = latestClinicalProfile(participant, [
      { label: "Pemeriksaan NAKES", rows: canonicalCheckupRows },
      { label: "Mini MCU", rows: miniMcuRows },
      { label: "Log berat badan", rows: weightRows },
    ]);
    const sheetClinicalProfile = latestNakesSheetProfile(
      sheetNakesResult?.rows || [],
      participant,
      participantId,
      actualCode,
    );
    const clinicalProfile = databaseClinicalProfile;
    if (ageOverride >= 18 && ageOverride < 120) {
      clinicalProfile.age_years = ageOverride;
    }
    if (["male", "female", "laki-laki", "perempuan", "pria", "wanita"].includes(genderOverride)) {
      clinicalProfile.gender = genderOverride;
    }

    const nutritionResult = buildCoachNutritionTargetRecommendation(
      {
        ...clinicalProfile,
        goal_weight_kg: goalWeightOverride,
        goal_weight_mode: goalWeightMode,
      },
      calculation,
    );
    calculation.clinical = nutritionResult.clinical;
    calculation.nutrition = nutritionResult.nutrition;
    calculation.recommendation.nutrition_calorie_target =
      nutritionResult.nutrition.nutrition_target_calories;
    calculation.recommendation.target_weight_kg =
      nutritionResult.nutrition.target_weight_kg;
    calculation.recommendation.phase_target_weight_kg =
      nutritionResult.nutrition.phase_target_weight_kg;
    calculation.recommendation.phase_duration_days =
      nutritionResult.nutrition.phase_duration_days;
    calculation.recommendation.phase_duration_months =
      nutritionResult.nutrition.phase_duration_months;
    calculation.recommendation.phase_mode =
      nutritionResult.nutrition.phase_mode;
    calculation.recommendation.phase_weekly_change_percent =
      nutritionResult.nutrition.phase_weekly_change_percent;
    calculation.recommendation.phase_total_change_kg =
      nutritionResult.nutrition.phase_total_change_kg;
    calculation.recommendation.phase_monthly_milestones_kg =
      nutritionResult.nutrition.phase_monthly_milestones_kg;
    calculation.recommendation.phase_monthly_nutrition_targets =
      nutritionResult.nutrition.phase_monthly_nutrition_targets;
    calculation.recommendation.ready_to_apply =
      calculation.recommendation.ready_to_apply ||
      nutritionResult.nutrition.ready_to_apply;
    calculation.quality.warnings.push(...nutritionResult.nutrition.warnings);

    return NextResponse.json({
      ok: true,
      mode: "read_only_recommendation",
      participant: {
        id: participantId,
        code: actualCode,
        name: participantName(participant),
      },
      calculation,
      source_reconciliation: {
        database: {
          source: databaseClinicalProfile?.measurement_source || "",
          date: databaseClinicalProfile?.measurement_date || "",
          weight_kg: databaseClinicalProfile?.weight_kg || 0,
          height_cm: databaseClinicalProfile?.height_cm || 0,
          age_years: databaseClinicalProfile?.age_years || 0,
        },
        google_sheet: {
          ok: sheetNakesResult?.ok === true,
          message: sheetNakesResult?.message || "",
          source: sheetClinicalProfile?.measurement_source || "",
          date: sheetClinicalProfile?.measurement_date || "",
          row_number: sheetClinicalProfile?.measurement_row_number || 0,
          revision: sheetClinicalProfile?.measurement_revision || 0,
          weight_kg: sheetClinicalProfile?.weight_kg || 0,
          height_cm: sheetClinicalProfile?.height_cm || 0,
          age_years: sheetClinicalProfile?.age_years || 0,
        },
        selected: {
          source: clinicalProfile?.measurement_source || "",
          date: clinicalProfile?.measurement_date || "",
          weight_kg: clinicalProfile?.weight_kg || 0,
          height_cm: clinicalProfile?.height_cm || 0,
          age_years: clinicalProfile?.age_years || 0,
        },
      },
      note:
        goalWeightMode === "coach"
          ? "Rekomendasi memakai Target BB Coach yang sedang terisi. Target belum berubah sampai Coach menekan Terapkan ke Form dan Simpan Target Peserta."
          : "Kolom Target BB Coach kosong, sehingga rekomendasi memakai logic BMI otomatis. Target belum berubah sampai Coach menekan Terapkan ke Form dan Simpan Target Peserta.",
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, message: error?.message || "Gagal menghitung rekomendasi target." },
      { status: 500 },
    );
  }
}
