$ErrorActionPreference = "Stop"

$project = "C:\Users\Lenovo\Documents\mcu_system_nextjs"
$pagePath = Join-Path $project "app\wellness\portal\page.tsx"
$apiDir = Join-Path $project "app\api\wellness\portal\coach-notes"
$apiPath = Join-Path $apiDir "route.ts"

if (!(Test-Path $pagePath)) {
    throw "page.tsx tidak ditemukan"
}

Write-Host "ADD PARTICIPANT COACH NOTICE V17"

New-Item -ItemType Directory -Force -Path $apiDir | Out-Null

# =========================
# 1. API coach notes untuk participant portal
# =========================

$api = @'
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
'@

Set-Content -Path $apiPath -Value $api -Encoding UTF8
Write-Host "OK - API route created"

# =========================
# 2. Patch UI page.tsx
# =========================

$text = Get-Content $pagePath -Raw -Encoding UTF8

if ($text.Contains("function CoachNoticeCenter(")) {
    Write-Host "SKIP - CoachNoticeCenter sudah ada"
} else {
    $insertBefore = $text.IndexOf("function NutritionTab(")

    if ($insertBefore -lt 0) {
        throw "function NutritionTab tidak ditemukan untuk insert CoachNoticeCenter"
    }

    $component = @'
function CoachNoticeCenter({ participant }: { participant: any }) {
  const participantId = Number(
    participant?.id ||
      participant?.participant_id ||
      participant?.wellness_participant_id ||
      0
  );

  const [notes, setNotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [noticeMessage, setNoticeMessage] = useState("");
  const [notificationPermission, setNotificationPermission] = useState("");

  const unreadNotes = notes.filter((note) => !note.is_read);
  const latestNote = notes.length > 0 ? notes[0] : null;
  const hasAlarm = unreadNotes.length > 0;
  const hasHighPriority = unreadNotes.some((note) => note.priority === "high");

  async function loadCoachNotes() {
    if (!participantId) return;

    setLoading(true);

    const result = await fetch(
      `/api/wellness/portal/coach-notes?participant_id=${participantId}`,
      { cache: "no-store" }
    )
      .then((response) => response.json())
      .catch((error) => ({
        ok: false,
        message: error?.message || "Network error",
      }));

    if (result.ok) {
      setNotes(result.notes || []);

      if ((result.unread_count || 0) > 0) {
        setNoticeMessage(
          `${result.unread_count} catatan coach belum dibaca.`
        );
      } else {
        setNoticeMessage("");
      }
    } else {
      setNoticeMessage(result.message || "Gagal memuat catatan coach.");
    }

    setLoading(false);
  }

  async function markNoteRead(noteId: any) {
    if (!participantId || !noteId) return;

    const result = await fetch("/api/wellness/portal/coach-notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        participant_id: participantId,
        note_id: noteId,
      }),
    })
      .then((response) => response.json())
      .catch((error) => ({
        ok: false,
        message: error?.message || "Network error",
      }));

    if (result.ok) {
      await loadCoachNotes();
    } else {
      setNoticeMessage(result.message || "Gagal menandai catatan.");
    }
  }

  async function markAllRead() {
    if (!participantId) return;

    const result = await fetch("/api/wellness/portal/coach-notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        participant_id: participantId,
        mark_all: true,
      }),
    })
      .then((response) => response.json())
      .catch((error) => ({
        ok: false,
        message: error?.message || "Network error",
      }));

    if (result.ok) {
      await loadCoachNotes();
    } else {
      setNoticeMessage(result.message || "Gagal menandai semua catatan.");
    }
  }

  async function enableBrowserNotification() {
    if (typeof window === "undefined") return;

    if (!("Notification" in window)) {
      setNotificationPermission("Browser tidak mendukung notifikasi.");
      return;
    }

    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);

    if (permission === "granted") {
      const body =
        unreadNotes.length > 0
          ? `${unreadNotes.length} catatan coach belum dibaca.`
          : "Notifikasi coach sudah aktif.";

      new Notification("Harmony Health - Catatan Coach", {
        body,
      });
    }
  }

  useEffect(() => {
    loadCoachNotes();
  }, [participantId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!hasAlarm) return;

    const permission =
      "Notification" in window ? Notification.permission : "unsupported";

    setNotificationPermission(permission);

    if (permission === "granted") {
      const firstUnread = unreadNotes[0];

      try {
        new Notification("Catatan Coach Baru", {
          body:
            firstUnread?.action_plan ||
            firstUnread?.coach_note ||
            "Ada catatan baru dari coach.",
        });
      } catch {
        // ignore notification runtime issues
      }
    }
  }, [hasAlarm, unreadNotes.length]);

  if (!participantId) {
    return null;
  }

  return (
    <section
      className={`overflow-hidden rounded-[2.3rem] border shadow-xl shadow-slate-200/60 ${
        hasAlarm
          ? hasHighPriority
            ? "border-rose-200 bg-rose-50"
            : "border-amber-200 bg-amber-50"
          : "border-white bg-white"
      }`}
    >
      <div className="relative p-5 md:p-6">
        {hasAlarm ? (
          <div className="absolute right-5 top-5 flex items-center gap-2 rounded-full bg-white px-3 py-2 text-xs font-black text-rose-700 shadow-sm">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-rose-500" />
            NEW
          </div>
        ) : null}

        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.22em] text-teal-700/70">
              Catatan Coach
            </div>

            <h2 className="mt-2 text-2xl font-black text-slate-950">
              Notice dari Coach
            </h2>

            <p className="mt-2 max-w-2xl text-sm font-bold leading-6 text-slate-600">
              Catatan, arahan, dan action plan dari coach akan muncul di sini.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={loadCoachNotes}
              className="rounded-full bg-white px-4 py-2 text-xs font-black text-slate-700 shadow-sm"
            >
              Refresh
            </button>

            <button
              type="button"
              onClick={enableBrowserNotification}
              className="rounded-full bg-slate-950 px-4 py-2 text-xs font-black text-white shadow-sm"
            >
              Aktifkan Notifikasi
            </button>
          </div>
        </div>

        {noticeMessage ? (
          <div
            className={`mt-4 rounded-[1.5rem] px-4 py-3 text-sm font-black ${
              hasAlarm
                ? "bg-white text-rose-700"
                : "bg-slate-50 text-slate-600"
            }`}
          >
            {noticeMessage}
          </div>
        ) : null}

        {notificationPermission ? (
          <div className="mt-2 text-xs font-bold text-slate-500">
            Status notifikasi browser: {notificationPermission}
          </div>
        ) : null}

        {loading ? (
          <div className="mt-5 rounded-[2rem] border border-dashed border-slate-200 bg-white/70 p-6 text-center text-sm font-bold text-slate-400">
            Memuat catatan coach...
          </div>
        ) : notes.length === 0 ? (
          <div className="mt-5 rounded-[2rem] border border-dashed border-slate-200 bg-white/70 p-6 text-center">
            <div className="text-base font-black text-slate-900">
              Belum ada catatan dari coach.
            </div>

            <p className="mt-2 text-sm font-bold leading-6 text-slate-500">
              Jika coach membuat catatan atau action plan, peserta akan melihatnya di bagian ini.
            </p>
          </div>
        ) : (
          <div className="mt-5 grid gap-3">
            {latestNote ? (
              <CoachNoticeCard
                note={latestNote}
                featured
                onRead={() => markNoteRead(latestNote.id)}
              />
            ) : null}

            {notes.slice(1, 4).map((note) => (
              <CoachNoticeCard
                key={note.id}
                note={note}
                onRead={() => markNoteRead(note.id)}
              />
            ))}

            {unreadNotes.length > 1 ? (
              <button
                type="button"
                onClick={markAllRead}
                className="rounded-[1.5rem] bg-teal-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-teal-100"
              >
                Tandai Semua Dibaca
              </button>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}

function CoachNoticeCard({
  note,
  featured = false,
  onRead,
}: {
  note: any;
  featured?: boolean;
  onRead: () => void;
}) {
  const isHigh = note.priority === "high";
  const isUnread = !note.is_read;

  return (
    <div
      className={`rounded-[1.8rem] border p-4 ${
        isUnread
          ? isHigh
            ? "border-rose-200 bg-white"
            : "border-amber-200 bg-white"
          : "border-slate-100 bg-white/70"
      }`}
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {isUnread ? (
              <span className="rounded-full bg-rose-50 px-3 py-1 text-[11px] font-black text-rose-700">
                BELUM DIBACA
              </span>
            ) : (
              <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-black text-slate-500">
                SUDAH DIBACA
              </span>
            )}

            {isHigh ? (
              <span className="rounded-full bg-rose-600 px-3 py-1 text-[11px] font-black text-white">
                MEDICAL REVIEW
              </span>
            ) : null}

            {featured ? (
              <span className="rounded-full bg-teal-50 px-3 py-1 text-[11px] font-black text-teal-700">
                TERBARU
              </span>
            ) : null}
          </div>

          <div className="mt-3 text-sm font-black text-slate-950">
            {note.topic || "Catatan Coaching"}
          </div>

          <div className="mt-1 text-xs font-bold text-slate-400">
            {formatCoachDate(note.created_at || note.session_date)} - Status:{" "}
            {note.follow_up_status || "Open"}
          </div>

          {note.main_issue ? (
            <div className="mt-3 rounded-2xl bg-slate-50 p-3">
              <div className="text-[11px] font-black uppercase tracking-wide text-slate-400">
                Masalah Utama
              </div>
              <div className="mt-1 text-sm font-bold leading-6 text-slate-700">
                {note.main_issue}
              </div>
            </div>
          ) : null}

          {note.coach_note ? (
            <div className="mt-3 rounded-2xl bg-teal-50 p-3">
              <div className="text-[11px] font-black uppercase tracking-wide text-teal-700/70">
                Catatan Coach
              </div>
              <div className="mt-1 text-sm font-bold leading-6 text-teal-950">
                {note.coach_note}
              </div>
            </div>
          ) : null}

          {note.action_plan ? (
            <div className="mt-3 rounded-2xl bg-sky-50 p-3">
              <div className="text-[11px] font-black uppercase tracking-wide text-sky-700/70">
                Action Plan
              </div>
              <div className="mt-1 text-sm font-bold leading-6 text-sky-950">
                {note.action_plan}
              </div>
            </div>
          ) : null}

          {note.next_follow_up_date ? (
            <div className="mt-3 text-xs font-black text-slate-500">
              Follow up berikutnya: {formatCoachDate(note.next_follow_up_date)}
            </div>
          ) : null}
        </div>

        {isUnread ? (
          <button
            type="button"
            onClick={onRead}
            className="shrink-0 rounded-full bg-slate-950 px-4 py-2 text-xs font-black text-white"
          >
            Tandai Dibaca
          </button>
        ) : null}
      </div>
    </div>
  );
}

function formatCoachDate(value: any) {
  const raw = clean(value);
  if (!raw) return "-";

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw.slice(0, 10);

  return date.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

'@

    $text = $text.Substring(0, $insertBefore) + $component + $text.Substring($insertBefore)
    Write-Host "OK - CoachNoticeCenter component inserted"
}

# Insert widget di HomeTab setelah section pembuka
if ($text.Contains("<CoachNoticeCenter participant={participant} />")) {
    Write-Host "SKIP - CoachNoticeCenter sudah dipasang di HomeTab"
} else {
    $homeStart = $text.IndexOf("function HomeTab(")
    if ($homeStart -lt 0) {
        throw "function HomeTab tidak ditemukan"
    }

    $homeEnd = $text.IndexOf("function CoachNoticeCenter(", $homeStart)
    if ($homeEnd -lt 0) {
        $homeEnd = $text.IndexOf("function NutritionTab(", $homeStart)
    }

    if ($homeEnd -lt 0) {
        throw "Akhir HomeTab tidak ditemukan"
    }

    $needle = '<section className="space-y-5">'
    $pos = $text.IndexOf($needle, $homeStart)

    if ($pos -lt 0 -or $pos -gt $homeEnd) {
        throw "section utama HomeTab tidak ditemukan"
    }

    $replace = $needle + "`r`n      <CoachNoticeCenter participant={participant} />"
    $text = $text.Substring(0, $pos) + $replace + $text.Substring($pos + $needle.Length)

    Write-Host "OK - CoachNoticeCenter dipasang di HomeTab"
}

Set-Content -Path $pagePath -Value $text -Encoding UTF8

Write-Host "DONE - PARTICIPANT COACH NOTICE V17"