// WELLNESS_COACH_ACTIVITY_TARGET_CALCULATOR_V126M39
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
    return result.error ? [] : result.data || [];
  } catch {
    return [];
  }
}

function latestClinicalProfile(participant: any, sources: Array<{ label: string; rows: any[] }>) {
  for (const source of sources) {
    for (const row of source.rows || []) {
      const weight = positiveNumber(row?.weight_kg, row?.weight, row?.body_weight);
      const height = positiveNumber(row?.height_cm, row?.height, participant?.height_cm);
      const bmi = positiveNumber(row?.bmi, row?.body_mass_index);
      if (weight > 0 && height > 0) {
        return {
          gender: profileGender(row, participant),
          birth_date: profileBirthDate(row, participant),
          age_years: profileAge(row, participant),
          height_cm: height,
          weight_kg: weight,
          bmi,
          measurement_source: source.label,
          measurement_date: rowDate(row),
        };
      }
    }
  }

  return {
    gender: profileGender(null, participant),
    birth_date: profileBirthDate(null, participant),
    age_years: profileAge(null, participant),
    height_cm: positiveNumber(participant?.height_cm),
    weight_kg: positiveNumber(
      participant?.current_weight_kg,
      participant?.initial_weight_kg,
      participant?.baseline_weight_kg,
    ),
    bmi: positiveNumber(participant?.bmi, participant?.baseline_bmi),
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

    const [activityResult, checkupRows, miniMcuRows, weightRows] = await Promise.all([
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
    const clinicalProfile = latestClinicalProfile(participant, [
      { label: "Pemeriksaan NAKES", rows: checkupRows },
      { label: "Mini MCU", rows: miniMcuRows },
      { label: "Log berat badan", rows: weightRows },
    ]);
    if (ageOverride >= 18 && ageOverride < 120) {
      clinicalProfile.age_years = ageOverride;
    }
    if (["male", "female", "laki-laki", "perempuan", "pria", "wanita"].includes(genderOverride)) {
      clinicalProfile.gender = genderOverride;
    }

    const nutritionResult = buildCoachNutritionTargetRecommendation(
      clinicalProfile,
      calculation,
    );
    calculation.clinical = nutritionResult.clinical;
    calculation.nutrition = nutritionResult.nutrition;
    calculation.recommendation.nutrition_calorie_target =
      nutritionResult.nutrition.nutrition_target_calories;
    calculation.recommendation.target_weight_kg =
      nutritionResult.nutrition.target_weight_kg;
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
      note:
        "Rekomendasi belum mengubah target. Nutrisi memakai BMI terbaru serta Mifflin-St Jeor bila usia, jenis kelamin, tinggi, dan berat lengkap. Coach tetap harus menekan Terapkan ke Form dan Simpan Target Peserta.",
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, message: error?.message || "Gagal menghitung rekomendasi target." },
      { status: 500 },
    );
  }
}
