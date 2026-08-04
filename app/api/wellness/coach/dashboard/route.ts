// WELLNESS_COMPANY_ISOLATION_V126C_FINAL
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { postSupportWebhook } from "@/lib/wellness/supportServer";
import { filterActivityRowsByFitnessSource, loadParticipantControlMap } from "@/lib/wellness/participantControls";
import { loadCanonicalNutritionHistories } from "@/lib/wellness/nutritionHistory";
import {
  buildCoachGroupUnitMap,
  canCoachAccessParticipant,
  canonicalParticipantGroupName,
  canonicalParticipantGroupUnit,
  canonicalParticipantKelompokUnit,
  dedupeCoachParticipants,
  matchingCoachAssignment,
  participantCanonicalUnitId,
  participantScopeIds,
} from "@/lib/wellness/coachGroupAccess";
import {
  filterClinicalRowsForProgram,
  filterOperationalRowsForProgram,
  isOperationalRowInProgramWindow,
  programWindowDayCount,
} from "@/lib/wellness/programWindow";

// WELLNESS_EDITABLE_STEP_TARGET_V126M34
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// WELLNESS_COACH_MONITORING_FLAGS_V53
// WELLNESS_COACH_CHAT_SUMMARY_V54
// WELLNESS_COACH_MISSING_INPUT_DAYS_V57
// WELLNESS_COACH_PARTICIPANT_PROFILE_PHOTO_V76
// WELLNESS_COACH_SINGLE_FITNESS_SOURCE_V79F
// Scope: assigned groups, 7-day compliance flags, note read status, and existing target fields.
// No schema migration and no access outside the coach assignment.

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE;

  if (!url || !key) {
    throw new Error("Supabase admin env is missing.");
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function clean(value: any) {
  return String(value || "").trim();
}

function asNumber(value: any) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function isChatNote(note: any) {
  const topic = clean(note?.topic).toLowerCase();
  const issue = clean(note?.main_issue).toLowerCase();
  const status = clean(note?.follow_up_status).toLowerCase();
  return (
    topic.includes("chat") || issue.startsWith("chat:") || status === "chat"
  );
}

function chatSender(note: any) {
  const topic = clean(note?.topic).toLowerCase();
  const issue = clean(note?.main_issue).toLowerCase();
  return issue.includes("participant") || topic.includes("peserta")
    ? "participant"
    : "coach";
}

function jakartaDate(offsetDays = 0) {
  const now = new Date(Date.now() + offsetDays * 86_400_000);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const y = parts.find((x) => x.type === "year")?.value || "";
  const m = parts.find((x) => x.type === "month")?.value || "";
  const d = parts.find((x) => x.type === "day")?.value || "";

  return y && m && d ? `${y}-${m}-${d}` : now.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string) {
  const a = new Date(`${from}T00:00:00Z`).getTime();
  const b = new Date(`${to}T00:00:00Z`).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.floor((b - a) / 86_400_000));
}

function getParticipantId(row: any) {
  return asNumber(
    row?.id || row?.participant_id || row?.wellness_participant_id,
  );
}

// WELLNESS_COACH_KELOMPOK_ACCESS_V122
// Canonical hierarchy enforcement is centralized in coachGroupAccess.
function participantName(row: any) {
  return clean(
    row?.name || row?.employee_name || row?.nama || row?.full_name || "-",
  );
}

function participantCode(row: any) {
  return clean(
    row?.code || row?.employee_code || row?.kode_karyawan || row?.nik || "-",
  );
}

function participantRisk(row: any) {
  return clean(
    row?.risk_group ||
      row?.risk_category ||
      row?.baseline_risk_group ||
      row?.category ||
      "-",
  );
}

function activityDate(row: any) {
  return clean(
    row?.log_date || row?.date || row?.started_at || row?.created_at,
  ).slice(0, 10);
}

function foodDate(row: any) {
  return clean(row?.log_date || row?.date || row?.created_at).slice(0, 10);
}

function pointLogDate(row: any) {
  return clean(row?.log_date || row?.created_at).slice(0, 10);
}

function isNutritionInputPoint(row: any) {
  const sourceType = clean(row?.source_type).toLowerCase();
  const pointKey = clean(row?.point_key).toLowerCase();
  const description = clean(row?.description).toLowerCase();

  return (
    sourceType === "nutrition_google_sheet" ||
    pointKey.startsWith("nutrition_input_") ||
    description.startsWith("input nutrisi:")
  );
}

function nutritionPointIdentity(row: any) {
  return clean(row?.source_id) || clean(row?.point_key) || clean(row?.id);
}

function activitySteps(row: any) {
  return asNumber(
    row?.steps ||
      row?.total_steps ||
      row?.raw_payload?.health_connect_steps ||
      row?.raw_payload?.google_fit_steps,
  );
}

function activityCalories(row: any) {
  return asNumber(
    row?.calories ||
      row?.total_calories ||
      row?.calories_burned ||
      row?.raw_payload?.health_connect_calories ||
      row?.raw_payload?.google_fit_calories_expended,
  );
}

function foodCalories(row: any) {
  return asNumber(
    row?.calories || row?.total_calories || row?.estimated_calories,
  );
}

function foodRowKey(row: any) {
  const raw = row?.raw_payload || {};
  return [
    clean(row?.id || raw?._rowNumber),
    clean(row?.participant_id || row?.participant_code),
    foodDate(row),
    clean(row?.log_time || row?.created_at),
    clean(row?.meal_type || row?.meal_time),
    clean(row?.food_name || row?.meal_text),
    String(foodCalories(row)),
  ].join("|");
}

function dedupeFoodRows(rows: any[] = []) {
  const unique = new Map<string, any>();
  for (const row of rows) {
    const key = foodRowKey(row);
    if (!unique.has(key)) unique.set(key, row);
  }
  return [...unique.values()];
}

function latestClinicalFor(participantId: number, clinicalRows: any[]) {
  const rows = clinicalRows
    .filter(
      (row) =>
        asNumber(row?.participant_id || row?.wellness_participant_id) ===
        participantId,
    )
    .sort((a, b) =>
      clean(b?.created_at || b?.exam_date || b?.checkup_date).localeCompare(
        clean(a?.created_at || a?.exam_date || a?.checkup_date),
      ),
    );

  return rows[0] || null;
}

function parseTargetsFromNote(note: any) {
  const text = [note?.action_plan, note?.coach_note, note?.main_issue]
    .map(clean)
    .filter(Boolean)
    .join("\n");

  const find = (pattern: RegExp) => {
    const match = text.match(pattern);
    return match ? asNumber(String(match[1]).replace(",", ".")) : 0;
  };

  return {
    nutrition_max_calories: find(/Target\s+Nutrisi\s*:\s*([0-9.,]+)/i),
    workout_min_calories: find(
      /Target\s+(?:Kalori\s+)?Workout\s*:\s*([0-9.,]+)/i,
    ),
    daily_step_target: find(
      /Target\s+Langkah\s*:\s*([0-9.,]+)/i,
    ),
    target_weight_kg: find(
      /Target\s+(?:BB|Berat(?:\s+Badan)?)\s*:\s*([0-9.,]+)/i,
    ),
  };
}

// WELLNESS_COACH_TARGET_READBACK_HOTFIX_V126M38_1
function isTargetWellnessNote(note: any) {
  const topic = clean(note?.topic).toLowerCase();
  const content = [note?.action_plan, note?.coach_note, note?.main_issue]
    .map(clean)
    .filter(Boolean)
    .join("\n");

  return (
    topic.includes("target wellness") ||
    /Target\s+(?:Nutrisi|(?:Kalori\s+)?Workout|Langkah|BB|Berat(?:\s+Badan)?)\s*:/i.test(
      content,
    )
  );
}

function noteSortValue(note: any) {
  const timestamp = Date.parse(
    clean(note?.updated_at || note?.created_at || note?.session_date),
  );
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function newestNotes(rows: any[]) {
  return [...(rows || [])].sort((a, b) => {
    const timeDifference = noteSortValue(b) - noteSortValue(a);
    if (timeDifference !== 0) return timeDifference;
    return asNumber(b?.id) - asNumber(a?.id);
  });
}

// WELLNESS_COACH_TARGET_READBACK_V126M38
// The newest individual Target Wellness note is the canonical override.
// Participant fields and defaults are fallbacks only.
function participantTargets(row: any, latestTargetNote: any) {
  const fromNote = parseTargetsFromNote(latestTargetNote);

  return {
    nutrition_max_calories:
      fromNote.nutrition_max_calories ||
      asNumber(
        row?.daily_calorie_limit || row?.target_calories || row?.calorie_limit,
      ) ||
      0,
    workout_min_calories:
      fromNote.workout_min_calories ||
      asNumber(
        row?.workout_calorie_target ||
          row?.active_calorie_target ||
          row?.daily_activity_calorie_target,
      ) ||
      0,
    daily_step_target:
      fromNote.daily_step_target ||
      asNumber(row?.daily_step_target || row?.step_target) ||
      8000,
    target_weight_kg:
      fromNote.target_weight_kg ||
      asNumber(row?.target_weight_kg || row?.weight_target_kg) ||
      0,
  };
}

function makeFlag(params: {
  today: string;
  nutritionDates: string[];
  nutritionHistoryDates?: string[];
  workoutDates: string[];
  latestNote: any;
}) {
  const nutritionDays = new Set(params.nutritionDates.filter(Boolean)).size;
  const workoutDays = new Set(params.workoutDates.filter(Boolean)).size;
  const compliancePercent = Math.round(
    ((nutritionDays + workoutDays) / 14) * 100,
  );
  const nutritionDateList = [...new Set(params.nutritionDates.filter(Boolean))].sort();
  const nutritionHistoryDateList = [
    ...new Set(
      (params.nutritionHistoryDates || params.nutritionDates).filter(Boolean),
    ),
  ].sort();
  const workoutDateList = [...new Set(params.workoutDates.filter(Boolean))].sort();
  const lastNutritionDate =
    nutritionHistoryDateList.length > 0
      ? nutritionHistoryDateList[nutritionHistoryDateList.length - 1]
      : "";
  const lastWorkoutDate =
    workoutDateList.length > 0
      ? workoutDateList[workoutDateList.length - 1]
      : "";
  const daysSinceNutrition = lastNutritionDate
    ? daysBetween(lastNutritionDate, params.today)
    : 99;
  const daysSinceWorkout = lastWorkoutDate
    ? daysBetween(lastWorkoutDate, params.today)
    : 99;
  const allDates = [...nutritionHistoryDateList, ...workoutDateList].sort();
  const lastDate = allDates.length > 0 ? allDates[allDates.length - 1] : "";
  const daysSinceLastInput = lastDate
    ? daysBetween(lastDate, params.today)
    : 99;
  const medicalReview =
    clean(params.latestNote?.follow_up_status).toLowerCase() ===
    "need medical review";

  if (medicalReview) {
    return {
      level: "red",
      label: "Red Flag",
      reason: "Perlu review medis sesuai catatan coach.",
      compliance_percent: compliancePercent,
      nutrition_days: nutritionDays,
      workout_days: workoutDays,
      last_nutrition_date: lastNutritionDate || null,
      last_workout_date: lastWorkoutDate || null,
      days_since_nutrition: daysSinceNutrition,
      days_since_workout: daysSinceWorkout,
      last_input_date: lastDate || null,
      days_since_last_input: daysSinceLastInput,
    };
  }

  if (daysSinceLastInput >= 3 || compliancePercent < 35) {
    return {
      level: "red",
      label: "Red Flag",
      reason:
        daysSinceLastInput >= 3
          ? `Tidak ada input selama ${daysSinceLastInput} hari.`
          : "Kepatuhan input 7 hari masih sangat rendah.",
      compliance_percent: compliancePercent,
      nutrition_days: nutritionDays,
      workout_days: workoutDays,
      last_nutrition_date: lastNutritionDate || null,
      last_workout_date: lastWorkoutDate || null,
      days_since_nutrition: daysSinceNutrition,
      days_since_workout: daysSinceWorkout,
      last_input_date: lastDate || null,
      days_since_last_input: daysSinceLastInput,
    };
  }

  if (daysSinceLastInput >= 2 || compliancePercent < 70) {
    return {
      level: "yellow",
      label: "Yellow Flag",
      reason:
        daysSinceLastInput >= 2
          ? "Belum ada input dalam 2 hari terakhir."
          : "Kepatuhan input 7 hari perlu ditingkatkan.",
      compliance_percent: compliancePercent,
      nutrition_days: nutritionDays,
      workout_days: workoutDays,
      last_nutrition_date: lastNutritionDate || null,
      last_workout_date: lastWorkoutDate || null,
      days_since_nutrition: daysSinceNutrition,
      days_since_workout: daysSinceWorkout,
      last_input_date: lastDate || null,
      days_since_last_input: daysSinceLastInput,
    };
  }

  return {
    level: "green",
    label: "Green Flag",
    reason: "Input nutrisi dan workout relatif konsisten.",
    compliance_percent: compliancePercent,
    nutrition_days: nutritionDays,
    workout_days: workoutDays,
    last_nutrition_date: lastNutritionDate || null,
    last_workout_date: lastWorkoutDate || null,
    days_since_nutrition: daysSinceNutrition,
    days_since_workout: daysSinceWorkout,
    last_input_date: lastDate || null,
    days_since_last_input: daysSinceLastInput,
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

  if (error || !data || !data.coach || data.coach.is_active === false)
    return null;
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

    const { data: assignments, error: assignmentError } = await supabase
      .from("wellness_coach_group_assignments")
      .select("*")
      .eq("coach_user_id", coach.id)
      .eq("is_active", true)
      .order("id", { ascending: true });

    if (assignmentError) {
      return NextResponse.json(
        { ok: false, message: assignmentError.message },
        { status: 500 },
      );
    }

    const { data: groupUnits, error: groupUnitError } = await supabase
      .from("wellness_group_units")
      .select("*")
      .limit(5000);

    if (groupUnitError) {
      return NextResponse.json(
        { ok: false, message: groupUnitError.message },
        { status: 500 },
      );
    }

    const groupUnitMap = buildCoachGroupUnitMap(groupUnits || []);

    const { data: allParticipants, error: participantError } = await supabase
      .from("wellness_participants")
      .select("*")
      .limit(2000);

    if (participantError) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Table wellness_participants belum terbaca. Cek nama table peserta wellness di Supabase.",
          detail: participantError.message,
        },
        { status: 500 },
      );
    }

    const participants = dedupeCoachParticipants(allParticipants || []).filter(
      (row: any) =>
        canCoachAccessParticipant(row, assignments || [], groupUnitMap),
    );
    const participantIds = participants.map(getParticipantId).filter(Boolean);
    const participantControlMap = await loadParticipantControlMap(
      supabase,
      participantIds,
    );
    const today = jakartaDate();
    const fromDate = jakartaDate(-6);

    let activityRows: any[] = [];
    let foodRows: any[] = [];
    let clinicalRows: any[] = [];
    let noteRows: any[] = [];
    let noteReadRows: any[] = [];
    let pointRows: any[] = [];

    if (participantIds.length > 0) {
      const [
        activityResult,
        foodResult,
        clinicalResult,
        noteResult,
        pointResult,
      ] = await Promise.all([
          supabase
            .from("wellness_activity_logs")
            .select("*")
            .in("participant_id", participantIds)
            .gte("log_date", fromDate)
            .limit(10000),
          supabase
            .from("wellness_food_logs")
            .select("*")
            .in("participant_id", participantIds)
            .order("log_date", { ascending: false })
            .limit(20000),
          supabase
            .from("wellness_clinical_history")
            .select("*")
            .in("participant_id", participantIds)
            .limit(5000),
          supabase
            .from("wellness_coach_notes")
            .select("*")
            .in("participant_id", participantIds)
            .order("created_at", { ascending: false })
            .limit(3000),
          supabase
            .from("wellness_point_logs")
            .select(
              "id,participant_id,log_date,point_key,source_type,source_id,description,status,points",
            )
            .in("participant_id", participantIds)
            .order("log_date", { ascending: false })
            .limit(20000),
        ]);

      activityRows = filterActivityRowsByFitnessSource(
        activityResult.data || [],
        participantControlMap,
      );
      foodRows = foodResult.error ? [] : foodResult.data || [];
      clinicalRows = clinicalResult.error ? [] : clinicalResult.data || [];
      noteRows = noteResult.data || [];
      pointRows = pointResult.error ? [] : pointResult.data || [];

      const noteIds = noteRows
        .map((note: any) => asNumber(note.id))
        .filter(Boolean);
      if (noteIds.length > 0) {
        const reads = await supabase
          .from("wellness_coach_note_reads")
          .select("note_id, participant_id, read_at")
          .in("note_id", noteIds)
          .limit(5000);
        if (!reads.error) noteReadRows = reads.data || [];
      }

    }

    const readMap = new Map(
      noteReadRows.map((item: any) => [
        `${asNumber(item.note_id)}:${asNumber(item.participant_id)}`,
        item.read_at,
      ]),
    );

    const profileResult = await postSupportWebhook("wellnessProfileList", {
      actorType: "participant",
      actorIds: participantIds.map(String),
    }).catch(() => ({ profiles: [] }));
    const profileMap = new Map<string, any>(
      (profileResult?.profiles || []).map((profile: any) => [
        clean(profile.actor_id),
        profile,
      ]),
    );

    const nutritionHistory = await loadCanonicalNutritionHistories({
      supabase,
      participants,
      dbRows: foodRows,
    });

    const participantCards = participants.map((row: any) => {
      const id = getParticipantId(row);
      const acts =
        filterOperationalRowsForProgram(
          row,
          activityRows.filter(
            (item) =>
              asNumber(
                item.participant_id,
              ) === id,
          ),
          fromDate,
          today,
          [
            "log_date",
            "started_at",
            "created_at",
          ],
        );
      const canonicalHistory = nutritionHistory.byParticipantId.get(id);
      const allFoods = canonicalHistory?.logs || [];
      const foods =
        filterOperationalRowsForProgram(
          row,
          allFoods,
          fromDate,
          today,
          ["log_date", "created_at"],
        );
      const nutritionPointInputs = [
        ...new Map(
          pointRows
            .filter(
              (item) =>
                asNumber(item.participant_id) === id &&
                isNutritionInputPoint(item) &&
                isOperationalRowInProgramWindow(
                  row,
                  item,
                  fromDate,
                  today,
                  [
                    "log_date",
                    "created_at",
                  ],
                ),
            )
            .map((item) => [nutritionPointIdentity(item), item]),
        ).values(),
      ];
      const nutritionPointDates = nutritionPointInputs
        .map(pointLogDate)
        .filter(Boolean);
      const recentNutritionDates = nutritionPointDates.filter(
        (date) => date >= fromDate && date <= today,
      );
      const foodDates = foods.map(foodDate).filter(Boolean);
      const allFoodDates = foods.map(foodDate).filter(Boolean);
      const nutritionDates = [
        ...new Set([...foodDates, ...recentNutritionDates]),
      ];
      const nutritionHistoryDates = [
        ...new Set([...allFoodDates, ...nutritionPointDates]),
      ];
      const participantNotes = newestNotes(
        noteRows.filter((note) => asNumber(note.participant_id) === id),
      );
      const chatNotes = participantNotes.filter(isChatNote);
      const instructionNotes = participantNotes.filter(
        (note) => !isChatNote(note),
      );
      const latestNote = instructionNotes[0] || null;
      const latestTargetNote =
        instructionNotes.find(isTargetWellnessNote) || null;
      const latestInstructionNote =
        instructionNotes.find((note) => !isTargetWellnessNote(note)) || null;
      const todayActs = acts.filter((item) => activityDate(item) === today);
      const todayFoods = foods.filter((item) => foodDate(item) === today);
      const todayNutritionPointCount = nutritionPointInputs.filter(
        (item) => pointLogDate(item) === today,
      ).length;
      const latestNoteReadAt = latestNote
        ? readMap.get(`${asNumber(latestNote.id)}:${id}`) || null
        : null;
      const latestTargetReadAt = latestTargetNote
        ? readMap.get(`${asNumber(latestTargetNote.id)}:${id}`) || null
        : null;
      const latestInstructionReadAt = latestInstructionNote
        ? readMap.get(`${asNumber(latestInstructionNote.id)}:${id}`) || null
        : null;
      const flag = makeFlag({
        today,
        nutritionDates,
        nutritionHistoryDates,
        workoutDates: acts
          .filter(
            (item) => activitySteps(item) > 0 || activityCalories(item) > 0,
          )
          .map(activityDate),
        latestNote,
      });

      const assignedGroup = matchingCoachAssignment(
        row,
        assignments || [],
        groupUnitMap,
      );
      const canonicalGroup = canonicalParticipantGroupUnit(row, groupUnitMap);
      const canonicalKelompok = canonicalParticipantKelompokUnit(
        row,
        groupUnitMap,
      );
      const accessGroupIds = participantScopeIds(row, groupUnitMap);
      const profile = profileMap.get(String(id)) || {};

      return {
        id,
        name: participantName(row),
        code: participantCode(row),
        profile_photo_url: clean(profile.photo_url),
        profile_photo_preview_url: clean(profile.photo_preview_url),
        group_name: canonicalParticipantGroupName(row, groupUnitMap),
        kelompok_name: clean(canonicalKelompok?.name) || "-",
        group_unit_id:
          clean(canonicalGroup?.id) ||
          participantCanonicalUnitId(row, groupUnitMap) ||
          null,
        kelompok_id: clean(canonicalKelompok?.id) || null,
        assigned_group_name: clean(assignedGroup?.group_name) || "",
        assigned_group_unit_id:
          clean(assignedGroup?.wellness_group_unit_id) || null,
        access_group_ids: accessGroupIds,
        risk: participantRisk(row),
        raw: row,
        today: {
          steps: todayActs.reduce((sum, item) => sum + activitySteps(item), 0),
          calories: todayActs.reduce(
            (sum, item) => sum + activityCalories(item),
            0,
          ),
          nutrition_calories: todayFoods.reduce(
            (sum, item) => sum + foodCalories(item),
            0,
          ),
          activity_count: todayActs.length,
          nutrition_count: Math.max(
            todayFoods.length,
            todayNutritionPointCount,
          ),
        },
        compliance: flag,
        flag: flag.level,
        flag_label: flag.label,
        flag_reason: flag.reason,
        nutrition_history_sources: canonicalHistory?.sources || null,
        clinical: latestClinicalFor(id, clinicalRows),
        targets: participantTargets(row, latestTargetNote),
        latest_note: latestNote
          ? {
              ...latestNote,
              is_read: Boolean(latestNoteReadAt),
              read_at: latestNoteReadAt,
            }
          : null,
        latest_target_note: latestTargetNote
          ? {
              ...latestTargetNote,
              is_read: Boolean(latestTargetReadAt),
              read_at: latestTargetReadAt,
            }
          : null,
        latest_instruction_note: latestInstructionNote
          ? {
              ...latestInstructionNote,
              is_read: Boolean(latestInstructionReadAt),
              read_at: latestInstructionReadAt,
            }
          : null,
        unread_note_count: instructionNotes.filter(
          (note) => !readMap.get(`${asNumber(note.id)}:${id}`),
        ).length,
        unread_chat_count: chatNotes.filter(
          (note) =>
            chatSender(note) === "participant" &&
            !readMap.get(`${asNumber(note.id)}:${id}`),
        ).length,
        last_chat: chatNotes[0]
          ? {
              id: chatNotes[0].id,
              sender: chatSender(chatNotes[0]),
              message: clean(
                chatNotes[0].coach_note || chatNotes[0].action_plan,
              ),
              created_at: chatNotes[0].created_at || chatNotes[0].session_date,
            }
          : null,
        status:
          flag.level === "green"
            ? "Patuh"
            : flag.level === "yellow"
              ? "Perlu dipantau"
              : "Perlu follow up",
      };
    });

    const flagSummary = {
      green: participantCards.filter((item) => item.flag === "green").length,
      yellow: participantCards.filter((item) => item.flag === "yellow").length,
      red: participantCards.filter((item) => item.flag === "red").length,
    };

    const groups = (assignments || []).map((item: any) => {
      const id = clean(item.wellness_group_unit_id);
      const name = clean(item.group_name) || `Group ${id}`;
      const members = participantCards.filter((participant) => {
        const row = participant.raw || {};
        // WELLNESS_COACH_CANONICAL_GROUP_ACCESS_V126M20_3
        return participantScopeIds(row, groupUnitMap).includes(id);
      });

      return {
        id: item.id,
        wellness_group_unit_id: item.wellness_group_unit_id,
        group_name: name,
        member_count: members.length,
        green_count: members.filter((member) => member.flag === "green").length,
        yellow_count: members.filter((member) => member.flag === "yellow")
          .length,
        red_count: members.filter((member) => member.flag === "red").length,
      };
    });

    return NextResponse.json({
      ok: true,
      coach: {
        id: coach.id,
        name: coach.name,
        email: coach.email,
        username: coach.username,
      },
      groups,
      summary: {
        total_participants: participantCards.length,
        active_today: participantCards.filter(
          (item) =>
            item.today.activity_count > 0 || item.today.nutrition_count > 0,
        ).length,
        need_follow_up: flagSummary.yellow + flagSummary.red,
        need_medical_review: participantCards.filter(
          (item) =>
            clean(item.latest_note?.follow_up_status).toLowerCase() ===
            "need medical review",
        ).length,
        unread_instructions: participantCards.reduce(
          (sum, item) => sum + asNumber(item.unread_note_count),
          0,
        ),
        unread_chat_messages: participantCards.reduce(
          (sum, item) => sum + asNumber(item.unread_chat_count),
          0,
        ),
        flags: flagSummary,
      },
      participants: participantCards,
      notes: noteRows.filter((note) => !isChatNote(note)),
      today,
      monitoring_period: { from: fromDate, to: today, days: 7 },
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, message: error?.message || "Gagal memuat dashboard coach." },
      { status: 500 },
    );
  }
}
