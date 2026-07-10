import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

export async function GET(request: NextRequest) {
  try {
    const supabase = adminClient();
    const participantId = asNumber(request.nextUrl.searchParams.get("participant_id"));

    if (!participantId) {
      return NextResponse.json(
        { ok: false, message: "participant_id wajib diisi." },
        { status: 400 }
      );
    }

    const { data: notes, error: notesError } = await supabase
      .from("wellness_coach_notes")
      .select("*")
      .eq("participant_id", participantId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (notesError) {
      return NextResponse.json(
        { ok: false, message: notesError.message },
        { status: 500 }
      );
    }

    const noteIds = (notes || []).map((note: any) => note.id).filter(Boolean);

    let readMap = new Map<number, string>();

    if (noteIds.length > 0) {
      const { data: reads, error: readsError } = await supabase
        .from("wellness_coach_note_reads")
        .select("note_id, read_at")
        .eq("participant_id", participantId)
        .in("note_id", noteIds);

      if (!readsError) {
        readMap = new Map(
          (reads || []).map((item: any) => [Number(item.note_id), item.read_at])
        );
      }
    }

    const result = (notes || []).map((note: any) => {
      const readAt = readMap.get(Number(note.id)) || null;

      return {
        ...note,
        is_read: Boolean(readAt),
        read_at: readAt,
        priority: notePriority(note),
      };
    });

    const unreadCount = result.filter((note: any) => !note.is_read).length;
    const highPriorityUnread = result.filter(
      (note: any) => !note.is_read && note.priority === "high"
    ).length;

    return NextResponse.json({
      ok: true,
      participant_id: participantId,
      unread_count: unreadCount,
      high_priority_unread: highPriorityUnread,
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

    const participantId = asNumber(body.participant_id);
    const noteId = asNumber(body.note_id);
    const markAll = Boolean(body.mark_all);

    if (!participantId) {
      return NextResponse.json(
        { ok: false, message: "participant_id wajib diisi." },
        { status: 400 }
      );
    }

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
        .select("id")
        .eq("participant_id", participantId)
        .order("created_at", { ascending: false })
        .limit(50);

      if (notesError) {
        return NextResponse.json(
          { ok: false, message: notesError.message },
          { status: 500 }
        );
      }

      payload = (notes || []).map((note: any) => ({
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
        .upsert(payload, {
          onConflict: "note_id,participant_id",
        });

      if (error) {
        return NextResponse.json(
          { ok: false, message: error.message },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      ok: true,
      message: markAll
        ? "Semua catatan coach sudah ditandai dibaca."
        : "Catatan coach sudah ditandai dibaca.",
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, message: error?.message || "Gagal menandai catatan." },
      { status: 500 }
    );
  }
}
