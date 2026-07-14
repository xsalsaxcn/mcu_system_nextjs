import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// WELLNESS_COACH_INSTRUCTIONS_TARGETS_V53
// Reuses existing wellness_coach_notes and wellness_participants fields.
// No table creation or schema migration.

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
  return String(value || "").trim();
}

function asNumber(value: any) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function participantGroupIds(row: any) {
  return [
    row?.wellness_group_unit_id,
    row?.group_unit_id,
    row?.group_id,
    row?.wellness_group_id,
  ]
    .map(clean)
    .filter(Boolean);
}

function participantGroupNames(row: any) {
  return [
    row?.group_name,
    row?.group_unit_name,
    row?.risk_group,
    row?.risk_category,
    row?.category,
    row?.group,
  ]
    .map((value) => clean(value).toLowerCase())
    .filter(Boolean);
}

function canAccessParticipant(row: any, assignments: any[]) {
  const allowedIds = new Set(
    assignments.map((item) => clean(item.wellness_group_unit_id)).filter(Boolean)
  );
  const allowedNames = new Set(
    assignments.map((item) => clean(item.group_name).toLowerCase()).filter(Boolean)
  );

  return (
    participantGroupIds(row).some((id) => allowedIds.has(id)) ||
    participantGroupNames(row).some((name) => allowedNames.has(name))
  );
}

function assignedGroupFor(row: any, assignments: any[]) {
  const ids = participantGroupIds(row);
  const names = participantGroupNames(row);

  return (
    assignments.find((item) => {
      const id = clean(item.wellness_group_unit_id);
      const name = clean(item.group_name).toLowerCase();
      return (id && ids.includes(id)) || (name && names.includes(name));
    }) || null
  );
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

async function assignedScope(supabase: any, coachId: number) {
  const { data: assignments, error: assignmentError } = await supabase
    .from("wellness_coach_group_assignments")
    .select("*")
    .eq("coach_user_id", coachId)
    .eq("is_active", true);

  if (assignmentError) throw assignmentError;

  const { data: allParticipants, error: participantError } = await supabase
    .from("wellness_participants")
    .select("*")
    .limit(2000);

  if (participantError) throw participantError;

  const participants = (allParticipants || []).filter((row: any) =>
    canAccessParticipant(row, assignments || [])
  );

  return { assignments: assignments || [], participants };
}

function findGroupParticipants(
  participants: any[],
  groupId: any,
  groupName: any
) {
  const id = clean(groupId);
  const name = clean(groupName).toLowerCase();

  return participants.filter((row) => {
    if (id && participantGroupIds(row).includes(id)) return true;
    if (name && participantGroupNames(row).includes(name)) return true;
    return false;
  });
}

function participantGroupName(row: any) {
  return (
    clean(
      row?.group_unit_name ||
        row?.group_name ||
        row?.risk_group ||
        row?.risk_category ||
        row?.category
    ) || "-"
  );
}

async function updateExistingTargetFields(
  supabase: any,
  participantId: number,
  targets: {
    nutrition_max_calories: number;
    workout_min_calories: number;
    target_weight_kg: number;
  }
) {
  const fullPayload: any = {
    target_weight_kg: targets.target_weight_kg || null,
    daily_calorie_limit: targets.nutrition_max_calories || null,
    workout_calorie_target: targets.workout_min_calories || null,
    updated_at: new Date().toISOString(),
  };

  const full = await supabase
    .from("wellness_participants")
    .update(fullPayload)
    .eq("id", participantId);

  if (!full.error) {
    return { synced: true, mode: "all_existing_fields", warning: "" };
  }

  const fallback = await supabase
    .from("wellness_participants")
    .update({
      target_weight_kg: targets.target_weight_kg || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", participantId);

  return {
    synced: !fallback.error,
    mode: fallback.error ? "note_only" : "weight_field_and_note",
    warning: full.error.message || fallback.error?.message || "",
  };
}

export async function POST(request: NextRequest) {
  try {
    const supabase = adminClient();
    const coach = await getCoach(request, supabase);

    if (!coach) {
      return NextResponse.json(
        { ok: false, message: "Session coach belum aktif." },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const action = clean(body.action) || "save_instruction";
    const scope = clean(body.scope) || "participant";
    const participantId = asNumber(body.participant_id);
    const groupId = body.wellness_group_unit_id || body.group_unit_id || null;
    const groupName = clean(body.group_name);
    const { assignments, participants } = await assignedScope(
      supabase,
      asNumber(coach.id)
    );

    if (action === "save_targets") {
      const participant = participants.find(
        (item: any) => asNumber(item.id) === participantId
      );

      if (!participant) {
        return NextResponse.json(
          { ok: false, message: "Peserta tidak berada dalam assignment coach." },
          { status: 403 }
        );
      }

      const targets = {
        nutrition_max_calories: asNumber(body.nutrition_max_calories),
        workout_min_calories: asNumber(body.workout_min_calories),
        target_weight_kg: asNumber(body.target_weight_kg),
      };

      if (
        targets.nutrition_max_calories <= 0 &&
        targets.workout_min_calories <= 0 &&
        targets.target_weight_kg <= 0
      ) {
        return NextResponse.json(
          { ok: false, message: "Isi minimal satu target peserta." },
          { status: 400 }
        );
      }

      const actionPlan = [
        targets.nutrition_max_calories > 0
          ? `Target Nutrisi: ${targets.nutrition_max_calories} kkal/hari`
          : "",
        targets.workout_min_calories > 0
          ? `Target Workout: ${targets.workout_min_calories} kkal/hari`
          : "",
        targets.target_weight_kg > 0
          ? `Target BB: ${targets.target_weight_kg} kg`
          : "",
      ]
        .filter(Boolean)
        .join("\n");

      const sync = await updateExistingTargetFields(
        supabase,
        participantId,
        targets
      );

      const assignedGroup = assignedGroupFor(participant, assignments);
      const payload = {
        coach_user_id: coach.id,
        participant_id: participantId,
        wellness_group_unit_id:
          assignedGroup?.wellness_group_unit_id ||
          participant.wellness_group_unit_id ||
          participant.group_unit_id ||
          null,
        group_name:
          clean(assignedGroup?.group_name) || participantGroupName(participant),
        session_date: clean(body.session_date) || new Date().toISOString().slice(0, 10),
        topic: "Target Wellness",
        main_issue: clean(body.main_issue) || "Penetapan target individual peserta.",
        coach_note:
          clean(body.coach_note) ||
          "Target ditetapkan oleh coach berdasarkan kondisi dan progres peserta.",
        action_plan: actionPlan,
        follow_up_status: clean(body.follow_up_status) || "In Progress",
        next_follow_up_date: clean(body.next_follow_up_date) || null,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from("wellness_coach_notes")
        .insert(payload)
        .select("*")
        .single();

      if (error) {
        return NextResponse.json(
          { ok: false, message: error.message },
          { status: 500 }
        );
      }

      return NextResponse.json({
        ok: true,
        message:
          sync.mode === "all_existing_fields"
            ? "Target peserta berhasil disimpan dan tersinkron ke grafik."
            : "Target peserta berhasil disimpan sebagai instruksi coach.",
        note: data,
        target_sync: sync,
      });
    }

    let targets: any[] = [];

    if (scope === "group") {
      targets = findGroupParticipants(participants, groupId, groupName);
      if (targets.length === 0) {
        return NextResponse.json(
          { ok: false, message: "Tidak ada peserta pada group assignment tersebut." },
          { status: 400 }
        );
      }
    } else {
      const participant = participants.find(
        (item: any) => asNumber(item.id) === participantId
      );
      if (!participant) {
        return NextResponse.json(
          { ok: false, message: "Peserta tidak berada dalam assignment coach." },
          { status: 403 }
        );
      }
      targets = [participant];
    }

    const coachNote = clean(body.coach_note);
    const actionPlan = clean(body.action_plan);

    if (!coachNote && !actionPlan) {
      return NextResponse.json(
        { ok: false, message: "Catatan coach atau action plan wajib diisi." },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    const rows = targets.map((participant: any) => {
      const assignedGroup = assignedGroupFor(participant, assignments);
      return {
        coach_user_id: coach.id,
        participant_id: asNumber(participant.id),
        wellness_group_unit_id:
          assignedGroup?.wellness_group_unit_id ||
          participant.wellness_group_unit_id ||
          participant.group_unit_id ||
          groupId ||
          null,
        group_name:
          clean(groupName) ||
          clean(assignedGroup?.group_name) ||
          participantGroupName(participant),
        session_date: clean(body.session_date) || now.slice(0, 10),
        topic:
          clean(body.topic) ||
          (scope === "group" ? "Instruksi Kelompok" : "Instruksi Individual"),
        main_issue: clean(body.main_issue),
        coach_note: coachNote,
        action_plan: actionPlan,
        follow_up_status: clean(body.follow_up_status) || "Open",
        next_follow_up_date: clean(body.next_follow_up_date) || null,
        updated_at: now,
      };
    });

    const { data, error } = await supabase
      .from("wellness_coach_notes")
      .insert(rows)
      .select("*");

    if (error) {
      return NextResponse.json(
        { ok: false, message: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      message:
        scope === "group"
          ? `Instruksi dikirim kepada ${rows.length} anggota kelompok.`
          : "Instruksi peserta berhasil disimpan.",
      notes: data || [],
      recipient_count: rows.length,
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, message: error?.message || "Gagal menyimpan instruksi coach." },
      { status: 500 }
    );
  }
}
