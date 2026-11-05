"use client";

// V153_13_REMINDER_LAST_SENT_INFO_SAFE
// Based exactly on V153.12 LKG Reminder UI.
// Scope: show Last reminder timestamp in Keterangan without changing send/cancel behavior.
// Sticker V153.7 LKG, CAPASKA, MCU, Wellness, and non-Reminder modules are untouched.
const REMINDER_INTERACTION_VERSION = "V153.13";

// V153_11_REMINDER_INTERACTION_SAFE
// V153_10_REMINDER_DASHBOARD_SAFE UI marker
// VACCINATION_REMINDER_MANUAL_SEND_V152_1

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

const STATUS_STYLE: Record<string, string> = {
  SENT: "bg-emerald-50 text-emerald-700 border-emerald-200",
  PENDING: "bg-blue-50 text-blue-700 border-blue-200",
  SENDING: "bg-cyan-50 text-cyan-700 border-cyan-200",
  FAILED: "bg-rose-50 text-rose-700 border-rose-200",
  SKIPPED: "bg-amber-50 text-amber-800 border-amber-200",
  CANCELLED: "bg-slate-100 text-slate-600 border-slate-300",
  NOT_APPLICABLE: "bg-slate-50 text-slate-500 border-slate-200",
  MANUAL: "bg-violet-50 text-violet-700 border-violet-200",
  NO_PHONE: "bg-amber-50 text-amber-800 border-amber-200",
};

type ViewKey = "INCOMING" | "SENT" | "FAILED" | "DUE_TODAY";

const VIEW_META: Record<ViewKey, { title: string; note: string }> = {
  INCOMING: {
    title: "Jadwal yang Akan Datang",
    note: "Pantau peserta yang sudah divaksin dan jadwal pengingat berikutnya.",
  },
  SENT: {
    title: "Sudah Diproses",
    note: "Pengiriman sudah diterima layanan Email atau Notiva; status sampai ke penerima dapat berbeda.",
  },
  FAILED: {
    title: "Perlu Diperiksa",
    note: "Cari alasan gagal atau dilewati sebelum memutuskan tindakan.",
  },
  DUE_TODAY: {
    title: "Pengingat Hari Ini",
    note: "Jadwal yang perlu dipantau hari ini; tidak semua perlu dikirim manual.",
  },
};

function clean(value: any) {
  return String(value ?? "").trim();
}

function fmtDate(value: any) {
  const text = clean(value);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return text || "-";
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function fmtDateTime(value: any) {
  const text = clean(value);
  if (!text) return "-";
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text;
  const formatted = new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Jakarta",
  }).format(date);
  return `${formatted.replace(/\./g, ":")} WIB`;
}


function channelDeliveryLabel(value: any, channel: "EMAIL" | "WHATSAPP") {
  const status = clean(value).toUpperCase();
  if (status === "SENT") return channel === "WHATSAPP" ? "Diterima Notiva*" : "Diterima SMTP*";
  if (status === "FAILED") return "Gagal";
  if (status === "SENDING") return "Sedang diproses";
  if (status === "CANCELLED") return "Dibatalkan";
  if (status === "SKIPPED") return "Dilewati";
  if (status === "PENDING") return "Menunggu";
  if (status === "NOT_APPLICABLE") return channel === "WHATSAPP" ? "Manual / belum dikirim" : "Tidak berlaku";
  return "Belum dikirim";
}

function operatorStatus(value: any, channel: "EMAIL" | "WHATSAPP") {
  const status = clean(value).toUpperCase();
  if (status === "SENT") return "Diproses penyedia";
  if (status === "PENDING") return "Menunggu jadwal";
  if (status === "FAILED") return "Gagal — perlu dicek";
  if (status === "SKIPPED") return "Dilewati";
  if (status === "SENDING") return "Sedang diproses";
  if (status === "CANCELLED" || status === "SUPERSEDED") return "Tidak aktif";
  if (status === "NOT_APPLICABLE") return channel === "WHATSAPP" ? "Tidak otomatis" : "Tidak digunakan";
  return "Belum ada status";
}

function operatorAdvice(row: any) {
  const email = clean(row?.status).toUpperCase();
  const wa = clean(row?.wa_status).toUpperCase();
  if (["CANCELLED", "SUPERSEDED"].includes(email)) return "Tidak perlu tindakan: jadwal ini tidak aktif.";
  if (email === "SENDING" || wa === "SENDING") return "Sedang diproses. Jangan kirim ulang.";
  if (email === "SENT" || wa === "SENT") return "Ada pengiriman tercatat. Cek hasil penyedia sebelum mengirim ulang.";
  if (email === "FAILED" || wa === "FAILED") return "Perlu pemeriksaan: baca alasan gagal dan verifikasi penerima. Jangan langsung kirim ulang.";
  if (email === "SKIPPED" || wa === "SKIPPED") return "Sebagian kanal dilewati. Periksa aturan kanal dan informasi penerima.";
  return "Pantau jadwal otomatis. Pastikan vaksin yang sama belum diberikan kembali sebelum kirim manual.";
}

function stageLabel(value: any) {
  const stage = clean(value).toUpperCase();
  if (stage === "H7") return "H-7";
  if (stage === "H3") return "H-3";
  if (stage === "H1") return "H-1";
  if (stage === "H0") return "Hari H";
  return stage || "-";
}

function StatCard({
  label,
  value,
  note,
  tone,
  active,
  onClick,
}: {
  label: string;
  value: number | string;
  note: string;
  tone: "green" | "red" | "blue" | "purple";
  active: boolean;
  onClick: () => void;
}) {
  const tones = {
    green: "bg-emerald-50 border-emerald-100 text-emerald-700 hover:bg-emerald-100/70",
    red: "bg-rose-50 border-rose-100 text-rose-700 hover:bg-rose-100/70",
    blue: "bg-sky-50 border-sky-100 text-sky-700 hover:bg-sky-100/70",
    purple: "bg-violet-50 border-violet-100 text-violet-700 hover:bg-violet-100/70",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-2xl border p-5 text-left transition ${tones[tone]} ${
        active ? "ring-2 ring-slate-900/70 ring-offset-2" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="text-xs font-black tracking-wide">{label}</div>
        <span className="text-xs font-black opacity-60">Lihat data →</span>
      </div>
      <div className="mt-2 text-3xl font-black text-slate-950">{value}</div>
      <div className="mt-1 text-xs font-medium text-slate-500">{note}</div>
    </button>
  );
}

export default function VaccinationReminderPage() {
  void REMINDER_INTERACTION_VERSION;
  const [data, setData] = useState<any>(null);
  const [selectedView, setSelectedView] = useState<ViewKey>("INCOMING");
  const [incomingGroup, setIncomingGroup] = useState<"DONE" | "SCHEDULED">("DONE");
  const [error, setError] = useState("");
  // V583_REMINDER_DASHBOARD_FRESHNESS: show when displayed metrics are a snapshot.
  const [lastSuccessfulLoadAt, setLastSuccessfulLoadAt] = useState("");
  const [loading, setLoading] = useState(true);
  const [manualSending, setManualSending] = useState(false);
  const [scheduleSyncing, setScheduleSyncing] = useState(false);
  const [manualMessage, setManualMessage] = useState("");
  const [eventData, setEventData] = useState<any>(null);
  const [eventLoading, setEventLoading] = useState(false);
  const [eventError, setEventError] = useState("");
  const [eventSessionId, setEventSessionId] = useState<number | null>(null);
  const [eventParticipantId, setEventParticipantId] = useState("");
  const [eventParticipantSearch, setEventParticipantSearch] = useState("");
  const eventRequestId = useRef(0);
  const [rowActionId, setRowActionId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const summaryRequestSeq = useRef(0);
  const [listDisplay, setListDisplay] = useState<"SIMPLE" | "TABLE">("SIMPLE");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  async function load(view: ViewKey = selectedView, query: string = searchQuery) {
    const requestSeq = ++summaryRequestSeq.current;
    setLoading(true);
    setError("");
    try {
      const cacheBuster = Date.now();
      const response = await fetch(
        `/api/vaccination/reminder/summary?view=${encodeURIComponent(view)}&q=${encodeURIComponent(query.trim())}&cb=${cacheBuster}`,
        {
          cache: "no-store",
          headers: {
            "Cache-Control": "no-cache",
          },
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.message || `HTTP ${response.status}`);
      }
      if (requestSeq !== summaryRequestSeq.current) return;
      setData(payload);
      setLastSuccessfulLoadAt(
        new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }) + " WIB",
      );
    } catch (e: any) {
      if (requestSeq === summaryRequestSeq.current) {
        setError(String(e?.message || e || "Gagal memuat reminder."));
      }
    } finally {
      if (requestSeq === summaryRequestSeq.current) setLoading(false);
    }
  }

  function changeView(view: ViewKey) {
    setSelectedView(view);
    if (view === "INCOMING") setIncomingGroup("DONE");
    window.requestAnimationFrame(() => document.getElementById("vaccination-reminder-list")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  async function postReminderMode(mode: "sync" | "email" | "wa") {
    const response = await fetch("/api/vaccination/reminder/cron", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode }),
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.ok === false) {
      throw new Error(payload?.message || `HTTP ${response.status}`);
    }
    return payload;
  }

  async function syncSchedules() {
    if (scheduleSyncing || manualSending) return;
    setScheduleSyncing(true);
    setManualMessage("");
    setError("");
    try {
      const result = await postReminderMode("sync");
      setManualMessage(`Jadwal disinkronkan: ${Number(result?.sync?.schedules || 0)} baris aktif. Tidak ada reminder dikirim oleh tindakan ini.`);
      await load(selectedView);
      await loadCurrentEvent(eventSessionId);
    } catch (e: any) {
      setError(`Gagal sinkron jadwal: ${String(e?.message || e)}`);
    } finally {
      setScheduleSyncing(false);
    }
  }

  async function sendManualReminder() {
    if (manualSending || scheduleSyncing) return;
    if (!window.confirm("Proses batch reminder yang sudah jatuh tempo sekarang? Setiap kanal memproses maksimal 3 reminder per request. Pengiriman berikutnya dilakukan scheduler di belakang layar atau dengan batch manual berikutnya.")) return;
    setManualSending(true);
    setManualMessage("");
    setError("");
    try {
      // Independent calls prevent a slow SMTP provider from blocking WhatsApp (and vice versa).
      const outcome = await Promise.allSettled([postReminderMode("email"), postReminderMode("wa")]);
      const email = outcome[0].status === "fulfilled" ? outcome[0].value?.delivery : null;
      const wa = outcome[1].status === "fulfilled" ? outcome[1].value?.whatsappDelivery : null;
      const sendCount = Number(email?.sent || 0) + Number(wa?.sent || 0);
      const channelErrors = [
        outcome[0].status === "rejected" ? `Email: ${String(outcome[0].reason?.message || outcome[0].reason)}` : "",
        outcome[1].status === "rejected" ? `WhatsApp: ${String(outcome[1].reason?.message || outcome[1].reason)}` : "",
      ].filter(Boolean);
      const errorDetails = [
        ...(email?.results || []).filter((row: any) => row.error).slice(0, 2).map((row: any) => `Email #${row.id}: ${row.error}`),
        ...(wa?.results || []).filter((row: any) => row.error).slice(0, 2).map((row: any) => `WA #${row.id}: ${row.error}`),
      ];
      setManualMessage(
        `Batch selesai · Email: ${Number(email?.sent || 0)} sent, ${Number(email?.failed || 0)} gagal, ${Number(email?.skipped || 0)} dilewati · WhatsApp: ${Number(wa?.sent || 0)} sent, ${Number(wa?.failed || 0)} gagal, ${Number(wa?.skipped || 0)} dilewati. Status ini bukan berarti semua antrean telah selesai.`,
      );
      if (channelErrors.length || errorDetails.length) setError([...channelErrors, ...errorDetails].join(" · "));
      if (!sendCount && !channelErrors.length && !errorDetails.length) {
        setManualMessage("Tidak ada pengiriman berhasil pada batch ini. Periksa apakah ada jadwal yang sudah due atau kanal yang masih menunggu pengaturan.");
      }
      await load(selectedView);
    } catch (e: any) {
      setError(String(e?.message || e || "Gagal menjalankan reminder manual."));
    } finally {
      setManualSending(false);
    }
  }

  async function loadCurrentEvent(sessionId: number | null = eventSessionId) {
    const requestId = ++eventRequestId.current;
    setEventLoading(true);
    setEventError("");
    try {
      const fetchEventPage = async (pageNo: number) => {
        const params = new URLSearchParams({ page: String(pageNo), cb: String(Date.now()) });
        if (sessionId) params.set("session_id", String(sessionId));
        const response = await fetch(`/api/vaccination/reminder/current-event?${params}`, { cache: "no-store" });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload?.ok === false) throw new Error(payload?.message || `HTTP ${response.status}`);
        return payload;
      };
      const first = await fetchEventPage(1);
      const fullList: any[] = [...(first.items || [])];
      const total = Number(first.total || 0);
      const pageSize = Number(first.pageSize || 25);
      // Each request retains the existing read-only endpoint limit (25 rows).
      // Keep this bounded to avoid an expensive unlimited production query.
      const pages = Math.min(20, Math.ceil(total / Math.max(1, pageSize)));
      for (let number = 2; number <= pages; number += 1) {
        if (eventRequestId.current !== requestId) return;
        const next = await fetchEventPage(number);
        fullList.push(...(next.items || []));
      }
      if (eventRequestId.current !== requestId) return;
      setEventData({ ...first, items: fullList, partiallyLoaded: total > fullList.length });
      setEventParticipantId((previous) => fullList.some((item) => String(item.id) === previous) ? previous : "");
      if (sessionId == null && first.sessionId) setEventSessionId(Number(first.sessionId));
    } catch (e: any) {
      if (eventRequestId.current === requestId) setEventError(String(e?.message || e || "Gagal membaca peserta Done di Current Event."));
    } finally {
      if (eventRequestId.current === requestId) setEventLoading(false);
    }
  }

  async function runRowAction(row: any, action: "send" | "cancel") {
    const id = Number(row?.id || 0);
    if (!id || rowActionId) return;

    const participant = clean(row?.participant_name) || "Peserta";
    const service = clean(row?.vaccine_name) || "Vaksinasi";
    const stage = stageLabel(row?.reminder_stage);
    const date = fmtDate(row?.reminder_date);

    const confirmed = window.confirm(
      action === "send"
        ? `Kirim reminder sekarang melalui Email + WhatsApp?\n\nPeserta: ${participant}\nLayanan: ${service}\nReminder: ${stage} · ${date}`
        : `Batalkan reminder ini?\n\nPeserta: ${participant}\nLayanan: ${service}\nReminder: ${stage} · ${date}\n\nReminder yang dibatalkan tidak akan ikut pengiriman otomatis.`,
    );
    if (!confirmed) return;

    setRowActionId(id);
    setManualMessage("");
    setError("");
    try {
      const response = await fetch("/api/vaccination/reminder/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.message || `HTTP ${response.status}`);
      }
      const emailSent = Boolean(payload?.email?.sent);
      const waSent = Boolean(payload?.whatsapp?.sent);
      const emailText = emailSent ? "diterima layanan SMTP (delivery belum diverifikasi)" : payload?.email?.error ? "Gagal" : "Tidak terkirim";
      const waMessageId = clean(payload?.whatsapp?.meta_message_id);
      const waText = waSent
        ? `diterima Notiva (delivery belum diverifikasi${waMessageId ? `; Meta ID: ${waMessageId}` : "; Meta ID tidak tersedia"})`
        : payload?.whatsapp?.error ? "Gagal" : "Tidak terkirim";
      setManualMessage(
        action === "send"
          ? `Reminder ${participant} selesai diproses · Via Email = ${emailText} · WhatsApp = ${waText}.`
          : `Reminder ${participant} berhasil dibatalkan.`,
      );
      await load(selectedView);
    } catch (e: any) {
      setError(String(e?.message || e || "Aksi reminder gagal."));
    } finally {
      setRowActionId(null);
    }
  }

  useEffect(() => {
    loadCurrentEvent(eventSessionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventSessionId]);

  useEffect(() => {
    // Debounce server-side search; refreshing must retain the active search.
    const delay = window.setTimeout(() => load(selectedView, searchQuery), searchQuery ? 350 : 0);
    const timer = window.setInterval(() => load(selectedView, searchQuery), 60_000);
    return () => {
      window.clearTimeout(delay);
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedView, searchQuery]);

  const rows = useMemo(() => data?.items || [], [data]);
  const filteredRows = useMemo(() => {
    const query = clean(searchQuery).toLowerCase();
    if (!query) return rows;

    return rows.filter((row: any) => {
      const haystack = [
        row?.participant_name,
        row?.company_name,
        row?.vaccine_name,
        row?.recipient_name,
        row?.recipient_email,
        row?.recipient_phone,
        row?.reminder_stage,
        stageLabel(row?.reminder_stage),
        row?.source_type,
        row?.status,
        row?.wa_status,
      ]
        .map((value) => clean(value).toLowerCase())
        .join(" ");

      return haystack.includes(query);
    });
  }, [rows, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, currentPage]);

  useEffect(() => {
    setPage(1);
  }, [selectedView, searchQuery]);

  const viewMeta = VIEW_META[selectedView];
  const eventItems: any[] = eventData?.items || [];
  const filteredEventItems = eventItems.filter((item: any) =>
    [item.participant_name, item.employee_id, item.vaccine_name, item.registration_id]
      .map((value) => clean(value).toLowerCase()).join(" ")
      .includes(clean(eventParticipantSearch).toLowerCase()),
  );
  const selectedEventItem = eventItems.find((item: any) => String(item.id) === eventParticipantId);
  const eventWithoutNextDose = eventItems.filter((item: any) => !item.next_due_date).length;
  const eventWithNextDose = eventItems.filter((item: any) => Boolean(item.next_due_date)).length;

  return (
    <main className="min-h-screen bg-[#f4f8fb] p-4 text-slate-900 md:p-6">
      <div className="mx-auto max-w-[1500px] space-y-5">
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-xs font-black tracking-[0.12em] text-emerald-700">PUSAT PEMANTAUAN VAKSINASI</div>
              <h1 className="mt-1 text-2xl font-black tracking-tight md:text-3xl">Pengingat Vaksinasi</h1>
              <p className="mt-2 max-w-3xl text-sm text-slate-600">
                Cek jadwal, lihat siapa yang perlu dibantu, dan pantau pengiriman. Klik ringkasan di bawah untuk melihat detail. Memilih peserta <strong>tidak mengirim pesan</strong>.
              </p>
            </div>
            <div className="flex flex-wrap items-start gap-2">
              <button
                onClick={() => { load(selectedView); loadCurrentEvent(eventSessionId); }}
                disabled={loading || manualSending || Boolean(rowActionId)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold shadow-sm hover:bg-slate-50 disabled:opacity-40"
              >
                Perbarui Tampilan
              </button>
              <Link
                href="/vaccination"
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold shadow-sm hover:bg-slate-50"
              >
                ☰ Menu Vaksinasi
              </Link>
              <details className="group rounded-xl border border-slate-200 bg-slate-50 p-2 text-sm">
                <summary className="cursor-pointer px-2 py-1 font-bold text-slate-700">Aksi lanjutan (opsional)</summary>
                <p className="mt-2 max-w-sm px-2 text-xs text-slate-600">Sinkronkan hanya memperbarui jadwal. Kirim manual benar-benar mengirim pengingat hingga 3 per kanal.</p>
                <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={syncSchedules}
                disabled={manualSending || scheduleSyncing || Boolean(rowActionId)}
                className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm font-black text-sky-800 disabled:opacity-40"
                title="Membaca sumber terbaru dan membuat jadwal, tanpa mengirim Email atau WhatsApp"
              >
                {scheduleSyncing ? "Menyinkronkan..." : "Sinkronkan Jadwal"}
              </button>
              <button
                onClick={sendManualReminder}
                disabled={manualSending || scheduleSyncing || Boolean(rowActionId)}
                className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-black text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {manualSending ? "Mengirim Reminder..." : "Kirim Reminder Manual"}
              </button>
                </div>
              </details>
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-sky-100 bg-sky-50 p-4">
            <div className="text-sm font-black text-sky-950">Cara pakai untuk operator</div>
            <div className="mt-2 grid gap-2 text-sm text-sky-900 sm:grid-cols-3">
              <span><strong>1.</strong> Buka Pengingat Hari Ini untuk memantau antrean.</span>
              <span><strong>2.</strong> Pilih nama peserta dan cek vaksin, tanggal, serta penerima.</span>
              <span><strong>3.</strong> Biarkan sistem otomatis bekerja. Gunakan kirim manual hanya setelah verifikasi.</span>
            </div>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="SUDAH DIPROSES"
              value={data?.summary ? data.summary.sent : "—"}
              note={`Email ${data?.summary?.sent ?? 0} · WhatsApp ${data?.summary?.waSent ?? 0} (status gateway)`}
              tone="green"
              active={selectedView === "SENT"}
              onClick={() => changeView("SENT")}
            />
            <StatCard
              label="PERLU DIPERIKSA"
              value={data?.summary ? (data.summary.failed ?? 0) + (data.summary.skipped ?? 0) : "—"}
              note={`Email ${(data?.summary?.failed ?? 0) + (data?.summary?.skipped ?? 0)} · WhatsApp ${(data?.summary?.waFailed ?? 0) + (data?.summary?.waSkipped ?? 0)}`}
              tone="red"
              active={selectedView === "FAILED"}
              onClick={() => changeView("FAILED")}
            />
            <StatCard
              label="AKAN DATANG (60 HARI)"
              value={data?.summary ? data.summary.incoming : "—"}
              note={`Jadwal 60 hari; peserta yang sudah vaksin dipantau terpisah`}
              tone="blue"
              active={selectedView === "INCOMING"}
              onClick={() => changeView("INCOMING")}
            />
            <StatCard
              label="PENGINGAT HARI INI"
              value={data?.summary ? data.summary.dueToday : "—"}
              note="Jadwal hari ini yang belum selesai; tidak semuanya perlu kirim manual"
              tone="purple"
              active={selectedView === "DUE_TODAY"}
              onClick={() => changeView("DUE_TODAY")}
            />
          </div>

          <details className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
            <summary className="cursor-pointer text-sm font-black text-slate-800">Informasi teknis pengiriman otomatis (opsional)</summary>
            <p className="mt-2 text-xs text-slate-600">Tulisan “Siap” hanya menunjukkan konfigurasi tersedia, bukan bukti semua pesan sudah sampai. Bukti pengiriman otomatis diperiksa melalui GitHub Actions.</p>
          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-bold text-slate-500">EMAIL AUTOMATION</div>
              <div className="mt-1 text-sm font-black">H-7 · H-3 · H-1 · Hari H</div>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <div className="text-xs font-bold text-emerald-700">WHATSAPP AUTOMATION</div>
              <div className="mt-1 text-sm font-black text-emerald-900">H-3 · H-1</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-bold text-slate-500">SCHEDULER</div>
              <div className="mt-1 flex items-center gap-2 text-sm font-black">
                <span className={`h-2.5 w-2.5 rounded-full ${data?.automation?.cronConfigured ? "bg-emerald-500" : "bg-rose-500"}`} />
                {data?.automation?.cronConfigured
                  ? "GitHub dijadwalkan 07.00–20.55 WIB (hasil eksekusi perlu dicek)"
                  : "Cron belum dikonfigurasi / status belum termuat"}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-bold text-slate-500">CHANNEL STATUS</div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm font-black">
                <span className={data?.automation?.smtpConfigured ? "text-emerald-700" : "text-rose-700"}>Email {data?.automation?.smtpConfigured ? "Siap" : "Nonaktif"}</span>
                <span className={data?.automation?.whatsappConfigured ? "text-emerald-700" : "text-rose-700"}>WhatsApp {data?.automation?.whatsappConfigured ? "Siap" : "Nonaktif"}</span>
              </div>
            </div>
          </div>
          </details>

          {manualMessage ? (
            <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
              {manualMessage}
            </div>
          ) : null}
          <p className="mt-3 text-xs leading-5 text-slate-500">* Status Email/WhatsApp selesai diproses berarti layanan pengiriman menerima permintaan, bukan bukti pesan sudah delivered/read. Periksa penerima dan ID pesan sebelum mencoba kirim ulang.</p>

          {error ? (
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
              <div>{error}</div>
              <div className="mt-1 text-xs font-semibold">
                {data && lastSuccessfulLoadAt
                  ? `Dashboard belum berhasil diperbarui. Angka yang tampil adalah data terakhir berhasil dimuat (${lastSuccessfulLoadAt}), bukan status terkini.`
                  : "Dashboard belum berhasil memuat data. Tanda — berarti angka belum dapat diverifikasi."}
              </div>
            </div>
          ) : null}
        </section>

        <section id="vaccination-reminder-list" className="scroll-mt-6 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          {selectedView === "INCOMING" ? (
            <div className="border-b border-slate-100 bg-sky-50/50 px-5 py-4">
              <h2 className="text-lg font-black text-slate-900">Pemantauan Peserta & Jadwal</h2>
              <p className="mt-1 text-sm text-slate-600">
                Peserta Done tetap terpantau meski dosis berikutnya masih jauh. Hanya jadwal yang berada dalam rentang 60 hari yang dihitung sebagai incoming terjadwal.
              </p>
              <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Kelompok incoming reminder">
                <button type="button" onClick={() => setIncomingGroup("DONE")}
                  aria-pressed={incomingGroup === "DONE"}
                  className={`rounded-xl border px-4 py-2.5 text-sm font-bold ${incomingGroup === "DONE" ? "border-sky-700 bg-sky-700 text-white" : "border-slate-200 bg-white text-slate-700"}`}>
                  Sudah Divaksin · {Number(eventData?.total || 0)} tindakan
                </button>
                <button type="button" onClick={() => setIncomingGroup("SCHEDULED")}
                  aria-pressed={incomingGroup === "SCHEDULED"}
                  className={`rounded-xl border px-4 py-2.5 text-sm font-bold ${incomingGroup === "SCHEDULED" ? "border-sky-700 bg-sky-700 text-white" : "border-slate-200 bg-white text-slate-700"}`}>
                  Pengingat dalam 60 hari · {Number(data?.summary?.incoming || 0)} jadwal
                </button>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Angka tindakan, peserta, dan baris reminder bukan satuan yang sama. Tidak ada jadwal yang dibuat atau pesan yang dikirim saat berpindah pilihan.
              </p>
            </div>
          ) : null}
          {selectedView === "INCOMING" && incomingGroup === "DONE" ? (
            <div className="p-4 sm:p-5">
            <div className="overflow-hidden rounded-2xl border border-sky-100 bg-white">
              <div className="flex flex-col gap-4 border-b border-slate-200 p-5 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-lg font-black">Peserta yang Sudah Divaksin</h2>
                  <p className="mt-1 text-sm text-slate-600">Semua tindakan Done pada Session terpilih masuk pemantauan Incoming, termasuk yang jadwal berikutnya di luar 60 hari. Memilih peserta tidak mengirim pesan.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <select
                    aria-label="Pilih event untuk peserta Done"
                    value={eventSessionId || ""}
                    onChange={(event) => {
                      setEventSessionId(Number(event.target.value) || null);
                      setEventParticipantId("");
                      setEventParticipantSearch("");
                    }}
                    className="w-full max-w-[470px] rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold lg:w-[380px]"
                  >
                    {!(eventData?.sessions || []).length ? <option value="">Belum ada Session</option> : null}
                    {(eventData?.sessions || []).map((session: any) => (
                      <option key={session.id} value={session.id}>
                        {session.session_name || `Session ${session.id}`} · {session.location || ""} · {session.session_date || ""}
                      </option>
                    ))}
                  </select>
                  <button type="button" disabled={eventLoading} onClick={() => loadCurrentEvent(eventSessionId)}
                    className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-black hover:bg-slate-50 disabled:opacity-40">Refresh Data</button>
                </div>
              </div>
              {eventError ? <div className="border-b border-rose-100 bg-rose-50 px-5 py-3 text-sm font-semibold text-rose-700">{eventError}</div> : null}
              <div className="p-5">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-xs font-bold text-slate-500">Tindakan vaksin Done</div>
                    <div className="mt-1 text-2xl font-black">{eventLoading ? "…" : Number(eventData?.total || 0)}</div>
                    <div className="text-xs text-slate-500">Jumlah tindakan, bukan peserta unik</div>
                  </div>
                  <div className="rounded-2xl border border-sky-100 bg-sky-50 p-4">
                    <div className="text-xs font-bold text-sky-800">Memiliki next dose</div>
                    <div className="mt-1 text-2xl font-black">{eventLoading ? "…" : eventWithNextDose}</div>
                    <div className="text-xs text-sky-700">Berdasarkan tanggal yang tercatat</div>
                  </div>
                  <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
                    <div className="text-xs font-bold text-amber-900">Belum ada tanggal lanjutan</div>
                    <div className="mt-1 text-2xl font-black">{eventLoading ? "…" : eventWithoutNextDose}</div>
                    <div className="text-xs text-amber-800">Tidak otomatis berarti data salah</div>
                  </div>
                </div>
                {eventData?.partiallyLoaded ? (
                  <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs font-semibold text-amber-800">
                    Daftar dibatasi ke 500 tindakan untuk menjaga performa; {eventItems.length} dari {Number(eventData.total || 0)} tindakan sudah dimuat. Tidak ada data yang diubah.
                  </p>
                ) : null}
                <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                  <label className="block text-sm font-black text-slate-700">
                    Cari peserta Done
                    <input type="search" value={eventParticipantSearch} onChange={(event) => { setEventParticipantSearch(event.target.value); setEventParticipantId(""); }}
                      placeholder="Ketik nama, BINUSIAN ID atau vaksin..."
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100" />
                  </label>
                  <label className="block text-sm font-black text-slate-700">
                    Pilih peserta untuk melihat detail
                    <select value={eventParticipantId} onChange={(event) => setEventParticipantId(event.target.value)}
                      disabled={eventLoading || !filteredEventItems.length}
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold disabled:opacity-50">
                      <option value="">{eventLoading ? "Memuat data..." : filteredEventItems.length ? `Pilih dari ${filteredEventItems.length} tindakan` : "Tidak ada peserta sesuai pencarian"}</option>
                      {filteredEventItems.map((item: any) => (
                        <option key={item.id} value={String(item.id)}>
                          {item.participant_name || "Tanpa nama"} · {item.vaccine_name || "Vaksinasi"} · Dosis {item.dose_number} · {item.employee_id || `Reg ${item.registration_id}`}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {selectedEventItem ? (
                  <div className="mt-5 rounded-2xl border border-sky-100 bg-sky-50/40 p-4 sm:p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-lg font-black text-slate-900">{selectedEventItem.participant_name || "Peserta"}</div>
                        <div className="mt-1 text-sm text-slate-600">{selectedEventItem.employee_id || `Registrasi ${selectedEventItem.registration_id}`} · {selectedEventItem.vaccine_name || "Vaksinasi"} · Dosis {selectedEventItem.dose_number}</div>
                        <div className="mt-1 text-xs text-slate-500">Vaksin diberikan: {fmtDateTime(selectedEventItem.administered_at)}</div>
                      </div>
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">Selesai divaksin</span>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      <div className="rounded-xl border border-white bg-white p-3">
                        <div className="text-xs font-bold text-slate-500">Jenis dosis</div>
                        <div className="mt-1 text-sm font-black">{selectedEventItem.series_type === "SERIES" ? "Series" : selectedEventItem.series_type === "NON_SERIES" ? "Non-series" : "Belum diklasifikasikan"}</div>
                      </div>
                      <div className="rounded-xl border border-white bg-white p-3">
                        <div className="text-xs font-bold text-slate-500">Tanggal dosis berikutnya</div>
                        <div className="mt-1 text-sm font-black">{selectedEventItem.next_due_date ? fmtDate(selectedEventItem.next_due_date) : "Belum ada jadwal"}</div>
                      </div>
                      <div className="rounded-xl border border-white bg-white p-3">
                        <div className="text-xs font-bold text-slate-500">Reminder berikutnya</div>
                        <div className="mt-1 text-sm font-black">{selectedEventItem.next_reminder_date ? fmtDate(selectedEventItem.next_reminder_date) : "Belum terjadwal"}</div>
                      </div>
                    </div>
                    <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-950">
                        <strong>Petunjuk operator:</strong> peserta ini sudah menerima vaksin yang ditampilkan. Jika muncul pengingat lama untuk vaksin yang sama dari History, <strong>periksa dahulu sebelum mengirim</strong>. Panel ini tidak otomatis membatalkan jadwal lama.
                      </div>
                      <div className="mt-4 rounded-xl border border-white bg-white p-4">
                      <div className="text-sm font-black">Jadwal pengingat untuk dosis berikutnya</div>
                      {selectedEventItem.reminder_schedule?.length ? (
                        <div className="mt-3 space-y-2">
                          {selectedEventItem.reminder_schedule.map((reminder: any) => (
                            <div key={reminder.stage} className="flex flex-col gap-1 border-b border-slate-100 pb-2 last:border-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between">
                              <div className="text-sm font-semibold">{stageLabel(reminder.stage)} · {fmtDate(reminder.reminder_date)}</div>
                              <div className="text-xs leading-5 text-slate-600 sm:text-right">
                                {!reminder.persisted ? "Belum disinkronkan — belum masuk antrean kirim" : (
                                  <>Email: {channelDeliveryLabel(reminder.email_status, "EMAIL")} · WhatsApp: {channelDeliveryLabel(reminder.wa_status, "WHATSAPP")}</>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-2 text-sm text-amber-800">{selectedEventItem.schedule_note || "Belum ada jadwal reminder karena tanggal dosis berikutnya belum tercatat."}</p>
                      )}
                    </div>
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                      <p className="max-w-3xl text-xs leading-5 text-slate-600">
                        {selectedEventItem.next_due_date
                          ? "Untuk jadwal yang belum tersinkron, gunakan 'Sinkronkan Jadwal' di bagian atas. Pantau pengiriman melalui daftar reminder di bawah."
                          : "Belum ada tanggal next dose di data sumber. Panel ini tidak membuat jadwal baru atau mengirim pesan."}
                      </p>
                      <button type="button" onClick={() => {
                          setSearchQuery(clean(selectedEventItem.participant_name));
                          setIncomingGroup("SCHEDULED");
                          setPage(1);
                        }}
                        className="rounded-xl border border-sky-200 bg-white px-4 py-2 text-xs font-black text-sky-800 hover:bg-sky-50">
                        Cari jadwal peserta ini
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
                    Pilih salah satu peserta di dropdown untuk melihat riwayat tindakan, dosis berikutnya, dan kapan reminder dijadwalkan. Tidak ada pengiriman otomatis dari pilihan ini.
                  </div>
                )}
              </div>
            </div>
            </div>
          ) : null}
          {(selectedView !== "INCOMING" || incomingGroup === "SCHEDULED") ? (
            <>

              <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-lg font-black">{viewMeta.title}</h2>
                  <p className="text-sm text-slate-500">{viewMeta.note}</p>
                  {selectedView === "INCOMING" ? (
                    <p className="mt-1 text-xs text-slate-500">Pencarian mencakup seluruh jadwal di database untuk 60 hari ke depan, bukan hanya 1.000 jadwal yang dimuat pertama.</p>
                  ) : null}
                </div>
                <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center lg:w-auto">
                  <div className="relative min-w-0 sm:w-[360px]">
                    <input
                      type="search"
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      placeholder="Cari seluruh jadwal: nama, perusahaan, vaksin, email, no HP..."
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 pr-10 text-sm font-semibold outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                    />
                    {searchQuery ? (
                      <button
                        type="button"
                        onClick={() => setSearchQuery("")}
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-xs font-black text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                        aria-label="Hapus pencarian"
                      >
                        ×
                      </button>
                    ) : null}
                  </div>
                  <div className="whitespace-nowrap text-xs font-bold text-slate-400">
                    {loading
                      ? "Memuat..."
                      : searchQuery
                        ? `${filteredRows.length} hasil pencarian database (maks. 1.000)`
                        : `${rows.length} jadwal terbaru ditampilkan`}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-white px-5 py-3">
                <p className="text-xs text-slate-600">Tampilan sederhana tidak mengirim pesan otomatis. Klik “Periksa detail” bila memerlukan tindakan.</p>
                <div className="flex rounded-xl border border-slate-200 p-1" role="group" aria-label="Pilih tampilan daftar reminder">
                  <button type="button" aria-pressed={listDisplay === "SIMPLE"} onClick={() => setListDisplay("SIMPLE")}
                    className={`rounded-lg px-3 py-2 text-xs font-bold ${listDisplay === "SIMPLE" ? "bg-sky-700 text-white" : "text-slate-600"}`}>
                    Kartu mudah dibaca
                  </button>
                  <button type="button" aria-pressed={listDisplay === "TABLE"} onClick={() => setListDisplay("TABLE")}
                    className={`rounded-lg px-3 py-2 text-xs font-bold ${listDisplay === "TABLE" ? "bg-sky-700 text-white" : "text-slate-600"}`}>
                    Tabel lengkap
                  </button>
                </div>
              </div>
              {listDisplay === "SIMPLE" ? (
                <div className="grid gap-3 bg-slate-50/60 p-4 lg:grid-cols-2">
                  {pagedRows.map((row: any) => {
                    const status = clean(row.status).toUpperCase();
                    const waStatus = clean(row.wa_status).toUpperCase() || "NOT_APPLICABLE";
                    const busy = rowActionId === Number(row.id);
                    const sendDisabled = busy || ["CANCELLED", "SUPERSEDED", "SENDING", "SENT"].includes(status) || ["SENDING", "SENT"].includes(waStatus);
                    const cancelDisabled = busy || ["CANCELLED", "SUPERSEDED", "SENT"].includes(status) || waStatus === "SENT";
                    return (
                      <article key={row.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <h3 className="text-base font-black text-slate-900">{row.participant_name || "Peserta"}</h3>
                            <p className="mt-1 text-xs text-slate-500">{row.company_name || "Perusahaan belum tersedia"}</p>
                          </div>
                          <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-black text-sky-800">{stageLabel(row.reminder_stage)}</span>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                          <div className="col-span-2 rounded-xl bg-slate-50 p-3">
                            <div className="text-xs text-slate-500">Vaksin / layanan</div>
                            <div className="mt-0.5 font-bold">{row.vaccine_name || "-"}</div>
                            <div className="mt-1 text-xs text-slate-500">{row.source_type === "HISTORY_SERVICE" ? "Berdasarkan riwayat layanan" : "Berdasarkan tindakan saat ini"}</div>
                          </div>
                          <div className="rounded-xl bg-slate-50 p-3"><div className="text-xs text-slate-500">Tanggal pengingat</div><div className="font-bold">{fmtDate(row.reminder_date)}</div></div>
                          <div className="rounded-xl bg-slate-50 p-3"><div className="text-xs text-slate-500">Dosis berikutnya</div><div className="font-bold">{fmtDate(row.next_due_date)}</div></div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs">
                          <span className={`rounded-full border px-3 py-1 font-bold ${STATUS_STYLE[status] || STATUS_STYLE.PENDING}`}>Email: {operatorStatus(status, "EMAIL")}</span>
                          <span className={`rounded-full border px-3 py-1 font-bold ${STATUS_STYLE[waStatus] || STATUS_STYLE.NOT_APPLICABLE}`}>WhatsApp: {operatorStatus(waStatus, "WHATSAPP")}</span>
                        </div>
                        <div className="mt-3 rounded-xl border border-amber-100 bg-amber-50 p-3 text-xs leading-5 text-amber-950">
                          <strong>Yang perlu dilakukan:</strong> {operatorAdvice(row)}
                        </div>
                        <details className="mt-3 rounded-xl border border-slate-200 p-3">
                          <summary className="cursor-pointer text-sm font-bold text-sky-800">Periksa detail & tindakan</summary>
                          <div className="mt-3 space-y-2 text-xs text-slate-700">
                            <p><strong>Penerima:</strong> {row.recipient_name || row.participant_name || "-"}{row.recipient_type === "PARENT" ? " (Orang tua / wali)" : ""}</p>
                            <p><strong>Email:</strong> {row.recipient_email || "Belum tersedia"}</p>
                            <p><strong>Nomor WA:</strong> {row.recipient_phone || "Belum tersedia"}</p>
                            {row.last_reminder_at ? <p><strong>Terakhir diproses:</strong> {fmtDateTime(row.last_reminder_at)}</p> : null}
                            {row.error_message ? <p className="text-rose-700"><strong>Alasan gagal Email:</strong> {row.error_message}</p> : null}
                            {row.wa_error_message ? <p className="text-rose-700"><strong>Alasan gagal WA:</strong> {row.wa_error_message}</p> : null}
                            <p className="rounded-lg bg-rose-50 p-2 text-rose-900">Pastikan jadwal masih relevan. Peserta yang sudah menerima vaksin yang sama mungkin masih memiliki reminder dari History.</p>
                            <div className="flex flex-wrap gap-2 pt-2">
                              <button type="button" onClick={() => runRowAction(row, "send")} disabled={sendDisabled}
                                className="rounded-lg bg-emerald-700 px-3 py-2 font-bold text-white disabled:opacity-40">
                                {busy ? "Memproses..." : "Kirim manual (setelah cek)"}
                              </button>
                              <button type="button" onClick={() => runRowAction(row, "cancel")} disabled={cancelDisabled}
                                className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 font-bold text-rose-800 disabled:opacity-40">
                                Batalkan jadwal
                              </button>
                            </div>
                          </div>
                        </details>
                      </article>
                    );
                  })}
                  {!loading && !filteredRows.length ? (
                    <div className="col-span-full rounded-xl bg-white p-8 text-center text-sm text-slate-500">{searchQuery ? `Tidak ada jadwal 60 hari yang cocok untuk “${searchQuery}”. Pencarian sudah mencakup database, bukan hanya 1.000 baris pertama. Jika peserta sudah vaksin, lihat “Sudah Divaksin” untuk jadwal di luar 60 hari atau yang belum tersinkron.` : "Belum ada jadwal pada pilihan ini."}</div>
                  ) : null}
                </div>
              ) : (
              <div className="overflow-x-auto">
                <table className="min-w-[1100px] w-full table-fixed text-left text-sm">
                  <thead className="bg-slate-50 text-[11px] font-black uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="w-[14%] px-3 py-3">Peserta</th>
                      <th className="w-[11%] px-3 py-3">Perusahaan</th>
                      <th className="w-[12%] px-3 py-3">Layanan</th>
                      <th className="w-[8%] px-3 py-3">Next Dose</th>
                      <th className="w-[8%] px-3 py-3">Reminder</th>
                      <th className="w-[15%] px-3 py-3">Penerima</th>
                      <th className="w-[7%] px-3 py-3">Email Status</th>
                      <th className="w-[7%] px-3 py-3">WhatsApp</th>
                      <th className="w-[10%] px-3 py-3">Keterangan</th>
                      <th className="w-[8%] px-3 py-3">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pagedRows.map((row: any) => {
                      const status = clean(row.status).toUpperCase();
                      const rowWaStatus = clean(row.wa_status).toUpperCase() || "NOT_APPLICABLE";
                      const hasRecipientPhone = Boolean(clean(row.recipient_phone));
                      const waDisplayStatus =
                        rowWaStatus === "NOT_APPLICABLE"
                          ? hasRecipientPhone
                            ? "MANUAL"
                            : "NO_PHONE"
                          : rowWaStatus;
                      const busy = rowActionId === Number(row.id);
                      const sendDisabled = busy || ["CANCELLED", "SUPERSEDED", "SENDING", "SENT"].includes(status) || ["SENDING", "SENT"].includes(rowWaStatus);
                      const cancelDisabled = busy || ["CANCELLED", "SUPERSEDED", "SENT"].includes(status) || rowWaStatus === "SENT";
                      return (
                        <tr key={row.id} className="align-top hover:bg-slate-50/70">
                          <td className="break-words px-3 py-3 font-bold">{row.participant_name || "-"}</td>
                          <td className="break-words px-3 py-3 text-slate-600">{row.company_name || "-"}</td>
                          <td className="break-words px-3 py-3">
                            <div className="font-bold">{row.vaccine_name || "-"}</div>
                            <div className="mt-1 text-[11px] font-semibold text-slate-400">
                              {row.source_type === "HISTORY_SERVICE" ? "Riwayat Layanan" : "Layanan Saat Ini"}
                            </div>
                          </td>
                          <td className="px-4 py-3 font-semibold">{fmtDate(row.next_due_date)}</td>
                          <td className="break-words px-3 py-3">
                            <div className="font-black text-[#042E66]">{stageLabel(row.reminder_stage)}</div>
                            <div className="text-xs text-slate-500">{fmtDate(row.reminder_date)}</div>
                          </td>
                          <td className="break-words px-3 py-3">
                            <div className="font-semibold">{row.recipient_name || row.participant_name || "-"}</div>
                            <div className="max-w-[240px] truncate text-xs text-slate-500">{row.recipient_email || "Email -"}</div>
                            <div className="mt-0.5 text-xs font-semibold text-emerald-700">{row.recipient_phone || "No HP -"}</div>
                            {row.recipient_type === "PARENT" ? (
                              <div className="mt-1 text-[10px] font-black uppercase tracking-wide text-violet-600">Via Parent</div>
                            ) : null}
                          </td>
                          <td className="break-words px-3 py-3">
                            <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-black ${STATUS_STYLE[status] || "border-slate-200 bg-slate-50 text-slate-600"}`}>
                              {operatorStatus(status, "EMAIL")}
                            </span>
                          </td>
                          <td className="break-words px-3 py-3">
                            {(() => {
                              return (
                                <div>
                                  <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-black ${STATUS_STYLE[waDisplayStatus] || "border-slate-200 bg-slate-50 text-slate-600"}`}>
                                    {waDisplayStatus === "MANUAL"
                                      ? "Perlu kirim manual"
                                      : waDisplayStatus === "NO_PHONE"
                                        ? "No. HP belum ada"
                                        : operatorStatus(waDisplayStatus, "WHATSAPP")}
                                  </span>
                                  {row.wa_sent_at ? <div className="mt-1 text-[11px] font-semibold text-emerald-700">{fmtDateTime(row.wa_sent_at)}</div> : null}
                                </div>
                              );
                            })()}
                          </td>
                          <td className="break-words px-3 py-3 text-xs text-slate-500">
                            {row.last_reminder_at ? (
                              <div className="font-semibold text-slate-700">
                                Terakhir diproses {fmtDateTime(row.last_reminder_at)}
                              </div>
                            ) : (
                              <div className="font-semibold text-slate-400">Belum ada reminder terkirim</div>
                            )}
                            <div className="mt-1 font-semibold text-slate-700">
                              Via Email = <span className={status === "SENT" ? "text-emerald-700" : status === "FAILED" ? "text-rose-700" : "text-slate-500"}>{channelDeliveryLabel(status, "EMAIL")}</span>
                            </div>
                            <div className="mt-0.5 font-semibold text-slate-700">
                              WhatsApp = <span className={rowWaStatus === "SENT" ? "text-emerald-700" : rowWaStatus === "FAILED" ? "text-rose-700" : "text-slate-500"}>{channelDeliveryLabel(rowWaStatus, "WHATSAPP")}</span>
                            </div>
                            {row.error_message && status !== "SENT" ? (
                              <div className="mt-1 text-rose-600">Email: {row.error_message}</div>
                            ) : null}
                            {row.wa_error_message && rowWaStatus !== "SENT" ? (
                              <div className="mt-1 text-rose-600">WA: {row.wa_error_message}</div>
                            ) : null}
                          </td>
                          <td className="break-words px-3 py-3">
                            <div className="flex flex-col items-stretch gap-2">
                              <button
                                type="button"
                                onClick={() => runRowAction(row, "send")}
                                disabled={sendDisabled}
                                className="w-full whitespace-nowrap rounded-lg bg-emerald-600 px-2 py-2 text-[11px] font-black text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                                title={status === "CANCELLED" ? "Reminder sudah dibatalkan" : "Kirim reminder ini sekarang"}
                              >
                                {busy ? "Memproses..." : "Kirim Reminder"}
                              </button>
                              <button
                                type="button"
                                onClick={() => runRowAction(row, "cancel")}
                                disabled={cancelDisabled}
                                className="w-full whitespace-nowrap rounded-lg border border-rose-200 bg-rose-50 px-2 py-2 text-[11px] font-black text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-40"
                                title={status === "SENT" ? "Reminder yang sudah terkirim tidak dapat dibatalkan" : "Batalkan reminder ini"}
                              >
                                Batalkan Jadwal
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {!loading && !filteredRows.length ? (
                      <tr>
                        <td colSpan={10} className="px-5 py-10 text-center text-sm font-semibold text-slate-400">
                          {searchQuery ? `Tidak ada jadwal pada kategori ini untuk "${searchQuery}". Periksa juga peserta Done bila jadwalnya di luar rentang atau belum tersinkron.` : "Tidak ada data pada kategori ini."}
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
              )}

              <div className="flex flex-col gap-3 border-t border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-xs font-bold text-slate-500">
                  {filteredRows.length
                    ? `Menampilkan ${(currentPage - 1) * pageSize + 1}-${Math.min(currentPage * pageSize, filteredRows.length)} dari ${filteredRows.length} data`
                    : "0 data"}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPage((value) => Math.max(1, value - 1))}
                    disabled={currentPage <= 1}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    ← Previous
                  </button>
                  <div className="min-w-[110px] text-center text-xs font-black text-slate-600">
                    Page {currentPage} / {totalPages}
                  </div>
                  <button
                    type="button"
                    onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
                    disabled={currentPage >= totalPages}
                    className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Next →
                  </button>
                </div>
              </div>
            </>
          ) : null}
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-black">Bagaimana pengingat berjalan?</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            {[
              ["1", "Baca jadwal dosis berikutnya", "Data layanan saat ini dan riwayat diperiksa setiap hari."],
              ["2", "Buat Jadwal", "Email mengikuti H-7, H-3, H-1, Hari H. WhatsApp otomatis khusus H-3 dan H-1."],
              ["3", "Kirim Otomatis", "Email dan WhatsApp berjalan independen; kegagalan salah satu channel tidak memblokir channel lain."],
              ["4", "Audit Status", "Status Email dan WhatsApp, waktu kirim, message ID, serta alasan gagal dicatat terpisah."],
            ].map(([number, title, desc]) => (
              <div key={number} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#042E66] text-xs font-black text-white">{number}</div>
                <div className="mt-3 font-black">{title}</div>
                <div className="mt-1 text-xs leading-5 text-slate-500">{desc}</div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
