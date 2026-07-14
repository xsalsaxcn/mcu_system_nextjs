import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// WELLNESS_PARTICIPANT_COACH_CHAT_API_V54
// Reuses wellness_coach_notes and wellness_coach_note_reads. No schema changes.

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

function asNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function clean(value: unknown) {
  return String(value || "").trim();
}

function notePriority(note: any) {
  const status = clean(note.follow_up_status).toLowerCase();
  if (status.includes("medical")) return "high";
  if (status.includes("progress")) return "medium";
  if (status.includes("open")) return "medium";
  return "normal";
}

function isChatNote(note: any) {
  const topic = clean(note?.topic).toLowerCase();
  const issue = clean(note?.main_issue).toLowerCase();
  const status = clean(note?.follow_up_status).toLowerCase();
  return topic.includes("chat") || issue.startsWith("chat:") || status === "chat";
}

function chatSender(note: any) {
  const issue = clean(note?.main_issue).toLowerCase();
  const topic = clean(note?.topic).toLowerCase();
  return issue.includes("participant") || topic.includes("peserta")
    ? "participant"
    : "coach";
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

function matchingAssignment(participant: any, assignments: any[]) {
  const ids = participantGroupIds(participant);
  const names = participantGroupNames(participant);
  return (
    assignments.find((item: any) => {
      const id = clean(item?.wellness_group_unit_id);
      const name = clean(item?.group_name).toLowerCase();
      return (id && ids.includes(id)) || (name && names.includes(name));
    }) || null
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

async function readMapForNotes(
  supabase: any,
  participantId: number,
  noteIds: number[]
) {
  if (noteIds.length === 0) return new Map<number, string>();

  const { data, error } = await supabase
    .from("wellness_coach_note_reads")
    .select("note_id, read_at")
    .eq("participant_id", participantId)
    .in("note_id", noteIds);

  if (error) return new Map<number, string>();
  return new Map(
    (data || []).map((item: any) => [Number(item.note_id), item.read_at])
  );
}

export async function GET(request: NextRequest) {
  try {
    const supabase = adminClient();
    const participantId = asNumber(request.nextUrl.searchParams.get("participant_id"));
    const mode = clean(request.nextUrl.searchParams.get("mode")).toLowerCase();

    if (!participantId) {
      return NextResponse.json(
        { ok: false, message: "participant_id wajib diisi." },
        { status: 400 }
      );
    }

    const { data: allNotes, error: notesError } = await supabase
      .from("wellness_coach_notes")
      .select("*")
      .eq("participant_id", participantId)
      .order("created_at", { ascending: true })
      .limit(mode === "chat" ? 100 : 50);

    if (notesError) {
      return NextResponse.json(
        { ok: false, message: notesError.message },
        { status: 500 }
      );
    }

    const selectedNotes = (allNotes || []).filter((note: any) =>
      mode === "chat" ? isChatNote(note) : !isChatNote(note)
    );
    const noteIds = selectedNotes.map((note: any) => Number(note.id)).filter(Boolean);
    const readMap = await readMapForNotes(supabase, participantId, noteIds);

    if (mode === "chat") {
      const messages = selectedNotes.map((note: any) => {
        const readAt = readMap.get(Number(note.id)) || null;
        return {
          ...note,
          sender: chatSender(note),
          message: clean(note.coach_note || note.action_plan),
          is_read: Boolean(readAt),
          read_at: readAt,
        };
      });

      return NextResponse.json({
        ok: true,
        participant_id: participantId,
        messages,
        unread_coach_messages: messages.filter(
          (item: any) => item.sender === "coach" && !item.is_read
        ).length,
      });
    }

    const result = selectedNotes
      .slice()
      .sort((a: any, b: any) =>
        clean(b?.created_at || b?.session_date).localeCompare(
          clean(a?.created_at || a?.session_date)
        )
      )
      .slice(0, 20)
      .map((note: any) => {
        const readAt = readMap.get(Number(note.id)) || null;
        return {
          ...note,
          is_read: Boolean(readAt),
          read_at: readAt,
          priority: notePriority(note),
        };
      });

    return NextResponse.json({
      ok: true,
      participant_id: participantId,
      unread_count: result.filter((note: any) => !note.is_read).length,
      high_priority_unread: result.filter(
        (note: any) => !note.is_read && note.priority === "high"
      ).length,
      notes: result,
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, message: error?.message || "Gagal memuat catatan coach." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = adminClient();
    const body = await request.json().catch(() => ({}));
    const action = clean(body.action).toLowerCase();
    const participantId = asNumber(body.participant_id);

    if (!participantId) {
      return NextResponse.json(
        { ok: false, message: "participant_id wajib diisi." },
        { status: 400 }
      );
    }

    if (action === "send_chat") {
      const message = clean(body.message);
      if (!message) {
        return NextResponse.json(
          { ok: false, message: "Pesan chat wajib diisi." },
          { status: 400 }
        );
      }

      const { data: participant, error: participantError } = await supabase
        .from("wellness_participants")
        .select("*")
        .eq("id", participantId)
        .maybeSingle();

      if (participantError || !participant) {
        return NextResponse.json(
          { ok: false, message: "Peserta tidak ditemukan." },
          { status: 404 }
        );
      }

      const { data: assignments, error: assignmentError } = await supabase
        .from("wellness_coach_group_assignments")
        .select("*")
        .eq("is_active", true)
        .limit(1000);

      if (assignmentError) {
        return NextResponse.json(
          { ok: false, message: assignmentError.message },
          { status: 500 }
        );
      }

      const assignment = matchingAssignment(participant, assignments || []);
      if (!assignment?.coach_user_id) {
        return NextResponse.json(
          { ok: false, message: "Coach untuk kelompok peserta belum di-assign." },
          { status: 400 }
        );
      }

      const now = new Date().toISOString();
      const payload = {
        coach_user_id: assignment.coach_user_id,
        participant_id: participantId,
        wellness_group_unit_id:
          assignment.wellness_group_unit_id ||
          participant.wellness_group_unit_id ||
          participant.group_unit_id ||
          null,
        group_name: clean(assignment.group_name) || participantGroupName(participant),
        session_date: now.slice(0, 10),
        topic: "Chat Peserta",
        main_issue: "chat:participant",
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
        message: "Pesan sudah dikirim kepada coach.",
        chat: data,
      });
    }

    if (action === "mark_chat_read") {
      const noteIds = (Array.isArray(body.note_ids) ? body.note_ids : [body.note_id])
        .map(asNumber)
        .filter(Boolean);

      if (noteIds.length === 0) {
        return NextResponse.json(
          { ok: false, message: "note_id chat wajib diisi." },
          { status: 400 }
        );
      }

      const { data: notes, error: notesError } = await supabase
        .from("wellness_coach_notes")
        .select("*")
        .eq("participant_id", participantId)
        .in("id", noteIds);

      if (notesError) throw notesError;

      const allowedIds = (notes || [])
        .filter((note: any) => isChatNote(note) && chatSender(note) === "coach")
        .map((note: any) => Number(note.id));

      const payload = allowedIds.map((noteId: number) => ({
        note_id: noteId,
        participant_id: participantId,
        read_at: new Date().toISOString(),
      }));

      if (payload.length > 0) {
        const { error } = await supabase
          .from("wellness_coach_note_reads")
          .upsert(payload, { onConflict: "note_id,participant_id" });
        if (error) throw error;
      }

      return NextResponse.json({ ok: true, message: "Chat sudah ditandai dibaca." });
    }

    const noteId = asNumber(body.note_id);
    const markAll = Boolean(body.mark_all);

    if (!markAll && !noteId) {
      return NextResponse.json(
        { ok: false, message: "note_id wajib diisi." },
        { status: 400 }
      );
    }

    let payload: Array<{ note_id: number; participant_id: number; read_at: string }> = [];

    if (markAll) {
      const { data: notes, error: notesError } = await supabase
        .from("wellness_coach_notes")
        .select("*")
        .eq("participant_id", participantId)
        .order("created_at", { ascending: false })
        .limit(50);

      if (notesError) throw notesError;

      payload = (notes || [])
        .filter((note: any) => !isChatNote(note))
        .map((note: any) => ({
          note_id: Number(note.id),
          participant_id: participantId,
          read_at: new Date().toISOString(),
        }));
    } else {
      payload = [
        {
          note_id: noteId,
          participant_id: participantId,
          read_at: new Date().toISOString(),
        },
      ];
    }

    if (payload.length > 0) {
      const { error } = await supabase
        .from("wellness_coach_note_reads")
        .upsert(payload, { onConflict: "note_id,participant_id" });
      if (error) throw error;
    }

    return NextResponse.json({
      ok: true,
      message: markAll
        ? "Semua catatan coach sudah ditandai dibaca."
        : "Catatan coach sudah ditandai dibaca.",
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, message: error?.message || "Gagal memproses catatan." },
      { status: 500 }
    );
  }
}
