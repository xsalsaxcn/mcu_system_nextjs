// WELLNESS_COMPANY_ISOLATION_V126C_FINAL
import { NextRequest, NextResponse } from "next/server";

// WELLNESS_EDITABLE_STEP_TARGET_V126M34
import { createClient } from "@supabase/supabase-js";
import {
  buildCoachGroupUnitMap,
  canCoachAccessParticipant,
  canonicalParticipantGroupName,
  dedupeCoachParticipants,
  matchingCoachAssignment,
  participantBelongsToGroupUnit,
  participantCanonicalUnitId,
} from "@/lib/wellness/coachGroupAccess";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// WELLNESS_COACH_INSTRUCTIONS_TARGETS_V53
// WELLNESS_COACH_GROUP_TARGET_PERSISTENCE_V126M22
// WELLNESS_COACH_CHAT_API_V54
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

// WELLNESS_COACH_TARGET_READBACK_V126M38
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
  return clean(
    row?.name || row?.full_name || row?.employee_name || row?.nama,
  ) || "Peserta";
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
    daily_step_target: find(/Target\s+Langkah\s*:\s*([0-9.,]+)/i),
    target_weight_kg: find(
      /Target\s+(?:BB|Berat(?:\s+Badan)?)\s*:\s*([0-9.,]+)/i,
    ),
  };
}

function effectiveParticipantTargets(row: any, targetNote: any) {
  const fromNote = parseTargetsFromNote(targetNote);
  return {
    nutrition_max_calories:
      fromNote.nutrition_max_calories ||
      asNumber(row?.daily_calorie_limit || row?.target_calories || row?.calorie_limit),
    workout_min_calories:
      fromNote.workout_min_calories ||
      asNumber(
        row?.workout_calorie_target ||
          row?.active_calorie_target ||
          row?.daily_activity_calorie_target,
      ),
    daily_step_target:
      fromNote.daily_step_target ||
      asNumber(row?.daily_step_target || row?.step_target) ||
      8000,
    target_weight_kg:
      fromNote.target_weight_kg ||
      asNumber(row?.target_weight_kg || row?.weight_target_kg),
  };
}

function sameTarget(actual: any, expected: any) {
  const a = asNumber(actual);
  const e = asNumber(expected);
  return e <= 0 || Math.abs(a - e) < 0.01;
}

function isChatNote(note: any) {
  const topic = clean(note?.topic).toLowerCase();
  const issue = clean(note?.main_issue).toLowerCase();
  const status = clean(note?.follow_up_status).toLowerCase();
  return topic.includes("chat") || issue.startsWith("chat:") || status === "chat";
}

function chatSender(note: any) {
  const topic = clean(note?.topic).toLowerCase();
  const issue = clean(note?.main_issue).toLowerCase();
  return issue.includes("participant") || topic.includes("peserta")
    ? "participant"
    : "coach";
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
  const [{ data: assignments, error: assignmentError }, groupUnitResult] =
    await Promise.all([
      supabase
        .from("wellness_coach_group_assignments")
        .select("*")
        .eq("coach_user_id", coachId)
        .eq("is_active", true),
      supabase.from("wellness_group_units").select("*").limit(5000),
    ]);

  if (assignmentError) throw assignmentError;
  if (groupUnitResult.error) throw groupUnitResult.error;

  const groupUnitMap = buildCoachGroupUnitMap(groupUnitResult.data || []);

  const { data: allParticipants, error: participantError } = await supabase
    .from("wellness_participants")
    .select("*")
    .limit(2000);

  if (participantError) throw participantError;

  const participants = dedupeCoachParticipants(allParticipants || []).filter(
    (row: any) =>
      canCoachAccessParticipant(row, assignments || [], groupUnitMap),
  );

  return { assignments: assignments || [], participants, groupUnitMap };
}

function findGroupParticipants(
  participants: any[],
  groupId: any,
  groupName: any,
  groupUnitMap: ReturnType<typeof buildCoachGroupUnitMap>,
) {
  return (participants || []).filter((row) =>
    participantBelongsToGroupUnit(row, groupId, groupName, groupUnitMap),
  );
}

async function updateExistingTargetFields(
  supabase: any,
  participantId: number,
  targets: {
    nutrition_max_calories: number;
    workout_min_calories: number;
    daily_step_target: number;
    target_weight_kg: number;
  },
) {
  const fields: Array<[string, number]> = [];
  if (targets.nutrition_max_calories > 0) {
    fields.push(["daily_calorie_limit", targets.nutrition_max_calories]);
  }
  if (targets.workout_min_calories > 0) {
    fields.push(["workout_calorie_target", targets.workout_min_calories]);
  }
  if (targets.target_weight_kg > 0) {
    fields.push(["target_weight_kg", targets.target_weight_kg]);
  }

  if (fields.length === 0) {
    return {
      synced: true,
      partial: false,
      mode: "target_note_only",
      applied_fields: [] as string[],
      warnings: [] as string[],
    };
  }

  const updatedAt = new Date().toISOString();
  const payload: any = { updated_at: updatedAt };
  for (const [field, value] of fields) payload[field] = value;

  const full = await supabase
    .from("wellness_participants")
    .update(payload)
    .eq("id", participantId);

  if (!full.error) {
    return {
      synced: true,
      partial: false,
      mode: "all_provided_fields",
      applied_fields: fields.map(([field]) => field),
      warnings: [] as string[],
    };
  }

  const appliedFields: string[] = [];
  const warnings: string[] = [full.error.message];
  for (const [field, value] of fields) {
    const result = await supabase
      .from("wellness_participants")
      .update({ [field]: value, updated_at: updatedAt })
      .eq("id", participantId);
    if (result.error) warnings.push(`${field}: ${result.error.message}`);
    else appliedFields.push(field);
  }

  return {
    synced: appliedFields.length === fields.length,
    partial: appliedFields.length > 0 && appliedFields.length < fields.length,
    mode:
      appliedFields.length === fields.length
        ? "individual_fields"
        : appliedFields.length > 0
          ? "partial_fields"
          : "target_note_only",
    applied_fields: appliedFields,
    warnings,
  };
}

async function updateStepTargetField(
  supabase: any,
  participantId: number,
  dailyStepTarget: number,
) {
  if (dailyStepTarget <= 0) {
    return { synced: true, mode: "default_8000", field: "", warning: "" };
  }

  const warnings: string[] = [];
  for (const field of ["daily_step_target", "step_target"]) {
    const result = await supabase
      .from("wellness_participants")
      .update({
        [field]: dailyStepTarget,
        updated_at: new Date().toISOString(),
      })
      .eq("id", participantId);

    if (!result.error) {
      return { synced: true, mode: "participant_field", field, warning: "" };
    }
    warnings.push(`${field}: ${result.error.message}`);
  }

  return {
    synced: false,
    mode: "coach_note",
    field: "",
    warning: warnings.join(" | "),
  };
}

async function updateProvidedGroupTargetFields(
  supabase: any,
  participantId: number,
  targets: {
    nutrition_max_calories: number;
    workout_min_calories: number;
    target_weight_kg: number;
  },
) {
  const fields: Array<[string, number]> = [];

  if (targets.nutrition_max_calories > 0) {
    fields.push(["daily_calorie_limit", targets.nutrition_max_calories]);
  }
  if (targets.workout_min_calories > 0) {
    fields.push(["workout_calorie_target", targets.workout_min_calories]);
  }
  if (targets.target_weight_kg > 0) {
    fields.push(["target_weight_kg", targets.target_weight_kg]);
  }

  if (fields.length === 0) {
    return {
      synced: true,
      partial: false,
      mode: "no_target_change",
      applied_fields: [] as string[],
      warnings: [] as string[],
    };
  }

  const updatedAt = new Date().toISOString();
  const fullPayload: any = { updated_at: updatedAt };
  for (const [field, value] of fields) fullPayload[field] = value;

  const full = await supabase
    .from("wellness_participants")
    .update(fullPayload)
    .eq("id", participantId);

  if (!full.error) {
    return {
      synced: true,
      partial: false,
      mode: "all_provided_fields",
      applied_fields: fields.map(([field]) => field),
      warnings: [] as string[],
    };
  }

  const appliedFields: string[] = [];
  const warnings: string[] = [full.error.message];

  for (const [field, value] of fields) {
    const result = await supabase
      .from("wellness_participants")
      .update({ [field]: value, updated_at: updatedAt })
      .eq("id", participantId);

    if (result.error) warnings.push(`${field}: ${result.error.message}`);
    else appliedFields.push(field);
  }

  return {
    synced: appliedFields.length === fields.length,
    partial: appliedFields.length > 0 && appliedFields.length < fields.length,
    mode:
      appliedFields.length === fields.length
        ? "individual_fields"
        : appliedFields.length > 0
          ? "partial_fields"
          : "note_only",
    applied_fields: appliedFields,
    warnings,
  };
}

export async function GET(request: NextRequest) {
  try {
    const supabase = adminClient();
    const coach = await getCoach(request, supabase);

    if (!coach) {
      return NextResponse.json(
        { ok: false, message: "Session coach belum aktif." },
        { status: 401 }
      );
    }

    const participantId = asNumber(request.nextUrl.searchParams.get("participant_id"));
    const mode = clean(request.nextUrl.searchParams.get("mode")).toLowerCase();

    if (!participantId || mode !== "chat") {
      return NextResponse.json(
        { ok: false, message: "participant_id dan mode=chat wajib diisi." },
        { status: 400 }
      );
    }

    const { participants } = await assignedScope(supabase, asNumber(coach.id));
    const participant = participants.find(
      (item: any) => asNumber(item.id) === participantId
    );

    if (!participant) {
      return NextResponse.json(
        { ok: false, message: "Peserta tidak berada dalam assignment coach." },
        { status: 403 }
      );
    }

    const { data: notes, error: notesError } = await supabase
      .from("wellness_coach_notes")
      .select("*")
      .eq("participant_id", participantId)
      .order("created_at", { ascending: true })
      .limit(100);

    if (notesError) throw notesError;

    const chatNotes = (notes || []).filter(isChatNote);
    const noteIds = chatNotes.map((note: any) => asNumber(note.id)).filter(Boolean);
    let readMap = new Map<number, string>();

    if (noteIds.length > 0) {
      const { data: reads, error: readsError } = await supabase
        .from("wellness_coach_note_reads")
        .select("note_id, read_at")
        .eq("participant_id", participantId)
        .in("note_id", noteIds);

      if (!readsError) {
        readMap = new Map(
          (reads || []).map((item: any) => [asNumber(item.note_id), item.read_at])
        );
      }
    }

    const messages = chatNotes.map((note: any) => ({
      ...note,
      sender: chatSender(note),
      message: clean(note.coach_note || note.action_plan),
      is_read: Boolean(readMap.get(asNumber(note.id))),
      read_at: readMap.get(asNumber(note.id)) || null,
    }));

    return NextResponse.json({
      ok: true,
      participant_id: participantId,
      messages,
      unread_member_messages: messages.filter(
        (item: any) => item.sender === "participant" && !item.is_read
      ).length,
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, message: error?.message || "Gagal memuat chat member." },
      { status: 500 }
    );
  }
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
    const requestedParticipantCode = clean(body.participant_code);
    const groupId = body.wellness_group_unit_id || body.group_unit_id || null;
    const groupName = clean(body.group_name);
    const { assignments, participants, groupUnitMap } = await assignedScope(
      supabase,
      asNumber(coach.id)
    );

    if (action === "send_chat") {
      const participant = participants.find(
        (item: any) => asNumber(item.id) === participantId
      );
      const message = clean(body.message);

      if (!participant) {
        return NextResponse.json(
          { ok: false, message: "Peserta tidak berada dalam assignment coach." },
          { status: 403 }
        );
      }

      if (!message) {
        return NextResponse.json(
          { ok: false, message: "Pesan chat wajib diisi." },
          { status: 400 }
        );
      }

      const assignedGroup = matchingCoachAssignment(participant, assignments, groupUnitMap);
      const now = new Date().toISOString();
      const payload = {
        coach_user_id: coach.id,
        participant_id: participantId,
        wellness_group_unit_id:
          participantCanonicalUnitId(participant, groupUnitMap) ||
          assignedGroup?.wellness_group_unit_id ||
          null,
        group_name:
          clean(assignedGroup?.group_name) || canonicalParticipantGroupName(participant, groupUnitMap),
        session_date: now.slice(0, 10),
        topic: "Chat Coach",
        main_issue: "chat:coach",
        coach_note: message,
        action_plan: "",
        follow_up_status: "Open",
        next_follow_up_date: null,
        updated_at: now,
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
        message: "Pesan sudah dikirim kepada member.",
        chat: data,
      });
    }

    if (action === "mark_chat_read") {
      const noteIds = (Array.isArray(body.note_ids) ? body.note_ids : [body.note_id])
        .map(asNumber)
        .filter(Boolean);

      if (!participantId || noteIds.length === 0) {
        return NextResponse.json(
          { ok: false, message: "participant_id dan note_id chat wajib diisi." },
          { status: 400 }
        );
      }

      const participant = participants.find(
        (item: any) => asNumber(item.id) === participantId
      );
      if (!participant) {
        return NextResponse.json(
          { ok: false, message: "Peserta tidak berada dalam assignment coach." },
          { status: 403 }
        );
      }

      const { data: notes, error: notesError } = await supabase
        .from("wellness_coach_notes")
        .select("*")
        .eq("participant_id", participantId)
        .in("id", noteIds);

      if (notesError) throw notesError;

      const allowedIds = (notes || [])
        .filter((note: any) => isChatNote(note) && chatSender(note) === "participant")
        .map((note: any) => asNumber(note.id));

      const readRows = allowedIds.map((noteId: number) => ({
        note_id: noteId,
        participant_id: participantId,
        read_at: new Date().toISOString(),
      }));

      if (readRows.length > 0) {
        const { error } = await supabase
          .from("wellness_coach_note_reads")
          .upsert(readRows, { onConflict: "note_id,participant_id" });
        if (error) throw error;
      }

      return NextResponse.json({
        ok: true,
        message: "Chat member sudah ditandai dibaca.",
      });
    }

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

      const actualParticipantCode = participantCode(participant);
      if (
        requestedParticipantCode &&
        actualParticipantCode &&
        requestedParticipantCode !== actualParticipantCode
      ) {
        return NextResponse.json(
          {
            ok: false,
            message: `Identitas peserta berubah. Dipilih kode ${requestedParticipantCode}, tetapi Participant ID ${participantId} terhubung ke kode ${actualParticipantCode}. Refresh peserta lalu pilih ulang.`,
          },
          { status: 409 },
        );
      }

      const targets = {
        nutrition_max_calories: asNumber(body.nutrition_max_calories),
        workout_min_calories: asNumber(body.workout_min_calories),
        daily_step_target: asNumber(body.daily_step_target) || 8000,
        target_weight_kg: asNumber(body.target_weight_kg),
      };

      if (
        targets.nutrition_max_calories <= 0 &&
        targets.workout_min_calories <= 0 &&
        targets.daily_step_target <= 0 &&
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
        targets.daily_step_target > 0
          ? `Target Langkah: ${targets.daily_step_target} langkah/hari`
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
      const stepSync = await updateStepTargetField(
        supabase,
        participantId,
        targets.daily_step_target,
      );

      const assignedGroup = matchingCoachAssignment(participant, assignments, groupUnitMap);
      const payload = {
        coach_user_id: coach.id,
        participant_id: participantId,
        wellness_group_unit_id:
          participantCanonicalUnitId(participant, groupUnitMap) ||
          assignedGroup?.wellness_group_unit_id ||
          null,
        group_name:
          clean(assignedGroup?.group_name) || canonicalParticipantGroupName(participant, groupUnitMap),
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

      const [participantReadBack, noteReadBack] = await Promise.all([
        supabase
          .from("wellness_participants")
          .select("*")
          .eq("id", participantId)
          .maybeSingle(),
        supabase
          .from("wellness_coach_notes")
          .select("*")
          .eq("id", data.id)
          .maybeSingle(),
      ]);

      const readBackParticipant = participantReadBack.data || participant;
      const readBackNote = noteReadBack.data || data;
      const readBackTargets = effectiveParticipantTargets(
        readBackParticipant,
        readBackNote,
      );
      const verifiedFields = {
        nutrition_max_calories: sameTarget(
          readBackTargets.nutrition_max_calories,
          targets.nutrition_max_calories,
        ),
        workout_min_calories: sameTarget(
          readBackTargets.workout_min_calories,
          targets.workout_min_calories,
        ),
        daily_step_target: sameTarget(
          readBackTargets.daily_step_target,
          targets.daily_step_target,
        ),
        target_weight_kg: sameTarget(
          readBackTargets.target_weight_kg,
          targets.target_weight_kg,
        ),
      };
      const verified = Object.values(verifiedFields).every(Boolean);

      return NextResponse.json({
        ok: true,
        verified,
        message: verified
          ? "Target peserta berhasil disimpan dan pembacaan ulang terverifikasi."
          : "Target tersimpan, tetapi pembacaan ulang belum sepenuhnya sesuai.",
        participant: {
          id: participantId,
          code: actualParticipantCode,
          name: participantName(participant),
        },
        saved_targets: targets,
        read_back: {
          targets: readBackTargets,
          verified_fields: verifiedFields,
          participant_error: participantReadBack.error?.message || "",
          note_error: noteReadBack.error?.message || "",
        },
        note: data,
        target_sync: { ...sync, step_target: stepSync },
      });
    }

    let targets: any[] = [];

    if (scope === "group") {
      targets = findGroupParticipants(
        participants,
        groupId,
        groupName,
        groupUnitMap,
      );
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
    const requestedTargets = {
      nutrition_max_calories: asNumber(body.nutrition_max_calories),
      workout_min_calories: asNumber(body.workout_min_calories),
      target_weight_kg: asNumber(body.target_weight_kg),
    };
    const requestedTargetLines = [
      requestedTargets.nutrition_max_calories > 0
        ? `Target Nutrisi: ${requestedTargets.nutrition_max_calories} kkal/hari`
        : "",
      requestedTargets.workout_min_calories > 0
        ? `Target Workout: ${requestedTargets.workout_min_calories} kkal/hari`
        : "",
      requestedTargets.target_weight_kg > 0
        ? `Target BB: ${requestedTargets.target_weight_kg} kg`
        : "",
    ].filter(Boolean);
    const actionPlan = clean(body.action_plan) || requestedTargetLines.join("\n");
    const hasRequestedTargets = requestedTargetLines.length > 0;

    if (!coachNote && !actionPlan) {
      return NextResponse.json(
        { ok: false, message: "Catatan coach atau action plan wajib diisi." },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    const rows = targets.map((participant: any) => {
      const assignedGroup = matchingCoachAssignment(participant, assignments, groupUnitMap);
      return {
        coach_user_id: coach.id,
        participant_id: asNumber(participant.id),
        wellness_group_unit_id:
          participantCanonicalUnitId(participant, groupUnitMap) ||
          assignedGroup?.wellness_group_unit_id ||
          groupId ||
          null,
        group_name:
          clean(groupName) ||
          clean(assignedGroup?.group_name) ||
          canonicalParticipantGroupName(participant, groupUnitMap),
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

    const targetSyncResults: any[] = [];

    if (hasRequestedTargets) {
      for (const participant of targets) {
        const sync = await updateProvidedGroupTargetFields(
          supabase,
          asNumber(participant.id),
          requestedTargets,
        );
        targetSyncResults.push({
          participant_id: asNumber(participant.id),
          ...sync,
        });
      }
    }

    const fullySyncedTargets = targetSyncResults.filter(
      (item: any) => item.synced,
    ).length;
    const partiallySyncedTargets = targetSyncResults.filter(
      (item: any) => item.partial,
    ).length;

    return NextResponse.json({
      ok: true,
      message:
        scope === "group" && hasRequestedTargets
          ? fullySyncedTargets === rows.length
            ? `Instruksi dan target tersimpan untuk ${rows.length} anggota kelompok.`
            : `Instruksi terkirim kepada ${rows.length} anggota. Target tersinkron penuh pada ${fullySyncedTargets} peserta dan sebagian pada ${partiallySyncedTargets} peserta.`
          : scope === "group"
            ? `Instruksi dikirim kepada ${rows.length} anggota kelompok.`
            : hasRequestedTargets && fullySyncedTargets === 1
              ? "Instruksi dan target peserta berhasil disimpan."
              : "Instruksi peserta berhasil disimpan.",
      notes: data || [],
      recipient_count: rows.length,
      target_sync: {
        requested: hasRequestedTargets,
        fully_synced: fullySyncedTargets,
        partially_synced: partiallySyncedTargets,
        failed: Math.max(
          0,
          targetSyncResults.length - fullySyncedTargets - partiallySyncedTargets,
        ),
        results: targetSyncResults,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, message: error?.message || "Gagal menyimpan instruksi coach." },
      { status: 500 }
    );
  }
}
