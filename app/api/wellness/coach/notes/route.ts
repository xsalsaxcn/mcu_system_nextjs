// WELLNESS_COMPANY_ISOLATION_V126C_FINAL
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// WELLNESS_COACH_INSTRUCTIONS_TARGETS_V53
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

function participantGroupIds(row: any) {
  return [
    row?.wellness_group_unit_id,
    row?.wellness_kelompok_id,
    row?.group_unit_id,
    row?.group_id,
    row?.wellness_group_id,
  ]
    .map(clean)
    .filter(Boolean);
}

function canAccessParticipant(
  row: any,
  assignments: any[],
) {
  if (!(assignments || []).length) {
    return false;
  }

  const allowedIds = new Set(
    (assignments || [])
      .map((item) =>
        clean(
          item.wellness_group_unit_id,
        ),
      )
      .filter(Boolean),
  );

  return participantGroupIds(row).some(
    (id) => allowedIds.has(id),
  );
}

function assignedGroupFor(
  row: any,
  assignments: any[],
) {
  const ids = participantGroupIds(row);

  return (
    (assignments || []).find(
      (item) => {
        const id = clean(
          item.wellness_group_unit_id,
        );

        return Boolean(
          id &&
          ids.includes(id),
        );
      },
    ) || null
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
  _groupName: any,
) {
  const id = clean(groupId);

  if (!id) {
    return [];
  }

  return (participants || []).filter(
    (row) =>
      participantGroupIds(row)
        .includes(id),
  );
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
    const groupId = body.wellness_group_unit_id || body.group_unit_id || null;
    const groupName = clean(body.group_name);
    const { assignments, participants } = await assignedScope(
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

      const assignedGroup = assignedGroupFor(participant, assignments);
      const now = new Date().toISOString();
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
