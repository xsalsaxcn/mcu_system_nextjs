"use client";

// V153.31_SAFE_NOTIFICATION_MODAL_DONE_SPLIT

import { useEffect, useMemo, useState } from "react";
import QRCodeImage from "@/components/QRCodeImage";

function sessionLabel(session: any) {
  return [session?.session_name || "Session", session?.location, session?.session_date]
    .filter(Boolean)
    .join(" · ");
}

function statusBadge(status: any) {
  const value = String(status || "").toUpperCase();
  if (value === "CALLED" || value === "IN_PROGRESS") return "bg-blue-100 text-blue-700";
  if (value === "SKIPPED") return "bg-amber-100 text-amber-800";
  if (value === "DONE") return "bg-emerald-100 text-emerald-700";
  if (value === "CANCELLED") return "bg-red-100 text-red-700";
  return "bg-red-100 text-red-700";
}

function csvCell(value: any) {
  const text = String(value ?? "").replace(/"/g, '""');
  return `"${text}"`;
}

export default function VaccinationOnsiteQueuePage() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [data, setData] = useState<any>(null);
  const [message, setMessage] = useState("Pilih session lalu aktifkan Mode Onsite Rolling QR 60 detik.");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [origin, setOrigin] = useState("");
  const [tvOnly, setTvOnly] = useState(false);

  useEffect(() => {
    const requestedSessionId =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("session_id") || ""
        : "";
    const requestedTvMode =
      typeof window !== "undefined"
        ? ["1", "true", "yes"].includes(
            (new URLSearchParams(window.location.search).get("tv") || "").toLowerCase()
          )
        : false;

    if (typeof window !== "undefined") setOrigin(window.location.origin);
    setTvOnly(requestedTvMode);

    // TV mode is intentionally PUBLIC + READ ONLY.
    // It must work on a client TV/browser without login cookies or device-specific access.
    if (requestedTvMode) {
      if (requestedSessionId) {
        setSessionId(requestedSessionId);
      } else {
        setError("Link TV tidak memiliki session_id.");
      }
      return;
    }

    fetch("/api/vaccination/sessions", { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => {
        if (json.ok) {
          const nextSessions = Array.isArray(json.sessions) ? json.sessions : [];
          setSessions(nextSessions);

          const requestedExists =
            requestedSessionId &&
            nextSessions.some((session: any) => String(session.id) === requestedSessionId);

          if (requestedExists) {
            setSessionId(requestedSessionId);
          } else if (nextSessions?.[0]?.id) {
            setSessionId(String(nextSessions[0].id));
          }
        }
      });
  }, []);

  async function load(id = sessionId, publicTv = tvOnly) {
    if (!id) return;
    const endpoint = publicTv
      ? `/api/vaccination/onsite-queue/tv?session_id=${encodeURIComponent(id)}&t=${Date.now()}`
      : `/api/vaccination/onsite-queue?session_id=${encodeURIComponent(id)}&t=${Date.now()}`;
    const json = await fetch(endpoint, { cache: "no-store" }).then((r) => r.json());
    if (!json.ok) {
      setError(json.message || "Gagal mengambil onsite queue.");
      return;
    }
    setData(json);
    setError("");
  }

  useEffect(() => {
    if (!sessionId) return;
    void load(sessionId, tvOnly);
    const timer = window.setInterval(() => void load(sessionId, tvOnly), 2500);
    return () => window.clearInterval(timer);
  }, [sessionId, tvOnly]);

  useEffect(() => {
    if (!tvOnly || typeof document === "undefined") return;

    const hideValidationShortcut = () => {
      const link = document.getElementById("hha-validation-menu-link-v129") as HTMLElement | null;
      if (link) {
        link.dataset.hhaOnsiteTvHidden = "1";
        link.style.display = "none";
      }
    };

    hideValidationShortcut();
    const observer = new MutationObserver(hideValidationShortcut);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      const link = document.getElementById("hha-validation-menu-link-v129") as HTMLElement | null;
      if (link?.dataset.hhaOnsiteTvHidden === "1") {
        link.style.display = "";
        delete link.dataset.hhaOnsiteTvHidden;
      }
    };
  }, [tvOnly]);

  function setSessionSpecificOperatorUrl(id: string) {
    if (typeof window === "undefined" || !id) return;
    const url = new URL(window.location.href);
    url.pathname = "/vaccination/queue/onsite";
    url.search = "";
    url.searchParams.set("session_id", id);
    window.history.replaceState({}, "", `${url.pathname}${url.search}`);
  }

  async function post(payload: any) {
    setBusy(true);
    setError("");
    try {
      const json = await fetch("/api/vaccination/onsite-queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).then((r) => r.json());
      if (!json.ok) {
        setError(json.message || "Action gagal.");
        return null;
      }

      if (payload?.action === "ensure-event") {
        const activatedSessionId = String(
          payload?.sessionId || payload?.session_id || sessionId || ""
        );
        setSessionSpecificOperatorUrl(activatedSessionId);
      }

      setMessage(json.message || "Berhasil.");
      await load();
      return json;
    } finally {
      setBusy(false);
    }
  }

  const entries = Array.isArray(data?.entries) ? data.entries : [];
  const waiting = useMemo(() => entries.filter((x: any) => x.queue_status === "WAITING"), [entries]);
  const active = useMemo(() => entries.filter((x: any) => ["CALLED", "IN_PROGRESS"].includes(x.queue_status)), [entries]);
  const skipped = useMemo(() => entries.filter((x: any) => x.queue_status === "SKIPPED"), [entries]);
  const done = useMemo(() => entries.filter((x: any) => x.queue_status === "DONE"), [entries]);
  const cancelled = useMemo(() => entries.filter((x: any) => x.queue_status === "CANCELLED"), [entries]);

  function cancelQueue(entry: any) {
    const confirmed = window.confirm(
      `Cancel antrean ${entry?.queue_number || ""} - ${entry?.participant_name || "peserta"}?\n\nSetelah status menjadi Cancel, peserta diperbolehkan mengambil antrean baru di session/lokasi lain.`
    );
    if (!confirmed) return;
    void post({ action: "cancel", eventId: data.event.id, entryId: entry.id });
  }

  function recallQueue(entry: any) {
    const confirmed = window.confirm(
      `Recall ${entry?.queue_number || ""} - ${entry?.participant_name || "peserta"}?\n\nPeserta akan kembali ke Waiting dengan nomor antrean yang sama.`
    );
    if (!confirmed) return;
    void post({ action: "recall", eventId: data.event.id, entryId: entry.id });
  }

  const scanUrl = data?.rolling?.scan_path && origin ? `${origin}${data.rolling.scan_path}` : "";
  const operatorSessionUrl =
    origin && sessionId
      ? `${origin}/vaccination/queue/onsite?session_id=${encodeURIComponent(sessionId)}`
      : "";
  const tvSessionUrl = operatorSessionUrl ? `${operatorSessionUrl}&tv=1` : "";
  const canCallNext = waiting.length > 0 && active.length === 0;
  const nextButtonLabel = !waiting.length
    ? "Tidak Ada Antrean Menunggu"
    : active.length
      ? "Selesaikan Antrean Aktif Dulu"
      : "Panggil Nomor Berikutnya";


  const queueDisplayPanel = data?.event ? (
    <section className={tvOnly ? "grid gap-6 xl:grid-cols-[560px_1fr]" : "mt-6 grid gap-5 xl:grid-cols-[380px_1fr]"}>
      <div className={tvOnly ? "rounded-3xl border border-violet-200 bg-violet-50 p-6" : "rounded-3xl border border-violet-200 bg-violet-50 p-5"}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.2em] text-violet-600">QR Onsite Dinamis</div>
            <div className="mt-1 text-lg font-black text-slate-950">Scan sekali → langsung dapat antrean</div>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-black ${data.event.status === "OPEN" ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-700"}`}>{data.event.status}</span>
        </div>
        <div className="mt-5 flex justify-center rounded-3xl bg-white p-5 shadow-sm">
          {scanUrl ? <QRCodeImage value={scanUrl} size={tvOnly ? 460 : 300} /> : <div className={tvOnly ? "flex h-[460px] w-[460px] items-center justify-center text-sm text-slate-400" : "flex h-[300px] w-[300px] items-center justify-center text-sm text-slate-400"}>QR tidak aktif</div>}
        </div>
        <div className={tvOnly ? "mt-4 text-center text-xl font-black text-violet-800" : "mt-4 text-center text-sm font-black text-violet-800"}>QR berganti dalam ± {data?.rolling?.expires_in ?? "-"} detik</div>
        <div className={tvOnly ? "mt-2 text-center text-sm font-semibold text-slate-500" : "mt-1 text-center text-xs font-semibold text-slate-500"}>Satu QR aktif dapat dipakai banyak peserta selama window 60 detik. Peserta yang sudah berhasil membuka form mendapat waktu 10 menit untuk submit.</div>
        {!tvOnly ? (
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button disabled={busy || data.event.status === "OPEN"} onClick={() => post({ action: "set-event-status", eventId: data.event.id, status: "OPEN" })} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white disabled:opacity-40">Buka Queue</button>
            <button disabled={busy || data.event.status === "CLOSED"} onClick={() => post({ action: "set-event-status", eventId: data.event.id, status: "CLOSED" })} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-black text-slate-700 disabled:opacity-40">Tutup Queue</button>
          </div>
        ) : null}
      </div>

      <div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-2xl border bg-white p-4"><div className="text-xs font-bold text-slate-500">Dipanggil</div><div className="mt-2 text-4xl font-black text-blue-700">{data.event.current_queue_number || "-"}</div></div>
          <div className="rounded-2xl border bg-white p-4"><div className="text-xs font-bold text-slate-500">Waiting</div><div className="mt-2 text-4xl font-black text-red-700">{waiting.length}</div></div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4"><div className="text-xs font-bold text-amber-700">Skipped</div><div className="mt-2 text-4xl font-black text-amber-700">{skipped.length}</div></div>
          <div className="rounded-2xl border bg-white p-4"><div className="text-xs font-bold text-slate-500">Done</div><div className="mt-2 text-4xl font-black text-emerald-700">{done.length}</div></div>
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4"><div className="text-xs font-bold text-red-700">Cancel</div><div className="mt-2 text-4xl font-black text-red-700">{cancelled.length}</div></div>
        </div>
        {!tvOnly ? (
          <>
            <button disabled={busy || !canCallNext} onClick={() => post({ action: "call-next", eventId: data.event.id })} className="mt-4 w-full rounded-2xl bg-blue-600 px-5 py-4 text-base font-black text-white disabled:opacity-40">{nextButtonLabel}</button>
            {active.length ? <p className="mt-2 text-xs font-semibold text-slate-500">Masih ada antrean aktif. Selesaikan dulu dengan tombol <span className="font-black">Done</span> di card antrean aktif, baru panggil nomor berikutnya.</p> : null}
          </>
        ) : null}

        <div
          className={`mt-3 rounded-2xl border p-4 ${
            !data?.whatsapp_prepare?.enabled_for_session
              ? "border-slate-200 bg-slate-100"
              : data?.whatsapp_prepare?.configured
                ? "border-emerald-200 bg-emerald-50"
                : "border-amber-200 bg-amber-50"
          }`}
        >
          <div
            className={`text-sm font-black ${
              !data?.whatsapp_prepare?.enabled_for_session
                ? "text-slate-700"
                : data?.whatsapp_prepare?.configured
                  ? "text-emerald-800"
                  : "text-amber-800"
            }`}
          >
            WhatsApp Prepare:{" "}
            {!data?.whatsapp_prepare?.enabled_for_session
              ? "NONAKTIF DI SESSION"
              : data?.whatsapp_prepare?.configured
                ? "AKTIF"
                : "BELUM DIKONFIGURASI"}
          </div>
          <p
            className={`mt-1 text-xs font-semibold ${
              !data?.whatsapp_prepare?.enabled_for_session
                ? "text-slate-600"
                : data?.whatsapp_prepare?.configured
                  ? "text-emerald-700"
                  : "text-amber-700"
            }`}
          >
            {!data?.whatsapp_prepare?.enabled_for_session
              ? "Tambahkan field WhatsApp pada Form Ambil Nomor Antrean di Edit Session untuk mengaktifkan reminder WA."
              : "Otomatis dikirim ke peserta WAITING paling depan saat ada tepat 1 antrean aktif di depannya. Tidak ada WhatsApp kedua saat nomor dipanggil."}
          </p>
        </div>

        <section className="mt-4 rounded-2xl border bg-white p-4">
          <h2 className="font-black text-slate-950">Antrean Aktif</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {active.map((entry: any) => (
              <div key={entry.id} className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-3xl font-black text-blue-700">{entry.queue_number}</div>
                    <div className="font-bold text-slate-950">{entry.participant_name}</div>
                    <div className="text-xs text-slate-500">{entry.employee_id}{entry.phone ? ` · ${entry.phone}` : ""}</div>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-black ${statusBadge(entry.queue_status)}`}>DIPANGGIL</span>
                </div>
                {!tvOnly ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button onClick={() => post({ action: "skip", eventId: data.event.id, entryId: entry.id })} className="rounded-lg bg-amber-600 px-3 py-2 text-xs font-black text-white">Skip</button>
                    <button onClick={() => post({ action: "done", eventId: data.event.id, entryId: entry.id })} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-black text-white">Done</button>
                    <button disabled={busy} onClick={() => cancelQueue(entry)} className="rounded-lg bg-red-600 px-3 py-2 text-xs font-black text-white disabled:opacity-40">Cancel</button>
                  </div>
                ) : null}
              </div>
            ))}
            {!active.length ? <div className="text-sm text-slate-500">Belum ada nomor aktif.</div> : null}
          </div>
          <p className="mt-3 text-xs font-semibold text-slate-500">Status selesai antrean aktif sekarang dikontrol dari card aktif. Tombol <span className="font-black">Panggil Nomor Berikutnya</span> hanya dipakai untuk memanggil waiting berikutnya.</p>
        </section>
      </div>
    </section>
  ) : null;

  function exportWaiting() {
    if (!waiting.length) return;
    const header = ["No Antrean", "Nama Lengkap", "NIK Karyawan", "No HP", "Status"];
    const rows = waiting.map((entry: any) => [
      entry.queue_number,
      entry.participant_name,
      entry.employee_id,
      entry.phone || "",
      entry.queue_status,
    ]);
    const csv = "\uFEFF" + [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const safeSession = String(data?.session?.session_name || "onsite-queue").replace(/[^a-z0-9_-]+/gi, "_");
    link.href = url;
    link.download = `waiting_${safeSession}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function exportDone() {
    if (!done.length) return;
    const header = ["No Antrean", "Nama Lengkap", "NIK Karyawan", "No HP", "Status", "Selesai"];
    const rows = done.map((entry: any) => [
      entry.queue_number,
      entry.participant_name,
      entry.employee_id,
      entry.phone || "",
      entry.queue_status,
      entry.finished_at
        ? new Date(entry.finished_at).toLocaleString("id-ID", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          })
        : "",
    ]);
    const csv = "\uFEFF" + [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const safeSession = String(data?.session?.session_name || "onsite-queue").replace(/[^a-z0-9_-]+/gi, "_");
    link.href = url;
    link.download = `done_${safeSession}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <main className={tvOnly ? "min-h-screen bg-white p-3 md:p-5" : "min-h-screen bg-slate-50 p-4 md:p-6"}>
      <div className={tvOnly ? "mx-auto max-w-[1500px]" : "mx-auto max-w-7xl rounded-3xl border bg-white p-5 shadow-sm md:p-6"}>
        {!tvOnly ? (
          <>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h1 className="text-2xl font-black text-slate-950">Antrian Vaksin — Onsite Rolling QR</h1>
                <p className="mt-2 max-w-3xl text-sm text-slate-600">Mode walk-in onsite. QR aktif 60 detik dan dapat dipakai banyak peserta selama window yang sama. Field form peserta mengikuti setting pada Session. Jika field WhatsApp dipasang, reminder WhatsApp aktif untuk session tersebut; jika field WhatsApp tidak dipakai, reminder WhatsApp nonaktif.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <a href="/vaccination/queue" className="rounded-xl border px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50">Mode Existing</a>
                  <span className="rounded-xl bg-violet-600 px-3 py-2 text-xs font-black text-white">Mode Onsite Rolling QR</span>
                </div>
              </div>
              <a href="/vaccination" className="rounded-xl border px-4 py-2 text-sm font-bold hover:bg-slate-50">☰ Menu Vaksinasi</a>
            </div>

            {error ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{error}</div> : null}
            {message ? <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800">{message}</div> : null}

            <section className="mt-6 rounded-2xl border bg-slate-50 p-5">
              <div className="grid gap-3 lg:grid-cols-[1fr_170px_auto] lg:items-end">
                <label className="block">
                  <div className="mb-1 text-xs font-black uppercase tracking-wide text-slate-500">Session / Event</div>
                  <select value={sessionId} onChange={(e) => setSessionId(e.target.value)} className="w-full rounded-xl border bg-white px-3 py-3 text-sm font-bold">
                    <option value="">Pilih session</option>
                    {sessions.map((session) => <option key={session.id} value={session.id}>{sessionLabel(session)}</option>)}
                  </select>
                </label>
                <div>
                  <div className="mb-1 text-xs font-black uppercase tracking-wide text-slate-500">Rolling QR</div>
                  <div className="rounded-xl border bg-white px-3 py-3 text-sm font-black text-violet-700">60 detik</div>
                </div>
                <button disabled={!sessionId || busy} onClick={() => post({ action: "ensure-event", sessionId: Number(sessionId), intervalSeconds: 60, queuePrefix: "Q" })} className="rounded-xl bg-violet-600 px-5 py-3 text-sm font-black text-white disabled:opacity-50">Aktifkan Mode Onsite</button>
              </div>
            </section>
          </>
        ) : (
          <div className="mb-4 rounded-2xl border bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700">
            Tampilan TV Session Onsite{data?.session ? ` · ${sessionLabel(data.session)}` : ""}
          </div>
        )}

        {tvOnly && error ? <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{error}</div> : null}

        {data?.event ? (
          <>
            {!tvOnly ? (
              <section className="mt-4 rounded-2xl border border-violet-200 bg-violet-50 p-4">
                <div className="text-xs font-black uppercase tracking-wide text-violet-700">
                  Link Khusus Session Onsite
                </div>
                <div className="mt-3 grid gap-3 lg:grid-cols-2">
                  <div>
                    <div className="mb-1 text-[11px] font-black uppercase tracking-wide text-violet-700">Link Operator Session</div>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <input
                        readOnly
                        value={operatorSessionUrl}
                        className="min-w-0 flex-1 rounded-xl border bg-white px-3 py-2.5 text-sm font-semibold text-slate-700"
                      />
                      <button
                        type="button"
                        disabled={!operatorSessionUrl}
                        onClick={async () => {
                          if (!operatorSessionUrl) return;
                          try {
                            await navigator.clipboard.writeText(operatorSessionUrl);
                            setMessage("Link operator session onsite berhasil disalin.");
                          } catch {
                            setMessage("Link operator session onsite sudah tampil dan dapat disalin manual.");
                          }
                        }}
                        className="rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-black text-white disabled:opacity-40"
                      >
                        Salin Link Operator
                      </button>
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 text-[11px] font-black uppercase tracking-wide text-violet-700">Link Tampilan TV Session</div>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <input
                        readOnly
                        value={tvSessionUrl}
                        className="min-w-0 flex-1 rounded-xl border bg-white px-3 py-2.5 text-sm font-semibold text-slate-700"
                      />
                      <button
                        type="button"
                        disabled={!tvSessionUrl}
                        onClick={async () => {
                          if (!tvSessionUrl) return;
                          try {
                            await navigator.clipboard.writeText(tvSessionUrl);
                            setMessage("Link tampilan TV onsite berhasil disalin.");
                          } catch {
                            setMessage("Link tampilan TV onsite sudah tampil dan dapat disalin manual.");
                          }
                        }}
                        className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-black text-white disabled:opacity-40"
                      >
                        Salin Link TV
                      </button>
                    </div>
                  </div>
                </div>
                <div className="mt-2 text-xs font-semibold text-violet-700">
                  Link operator dipakai untuk kontrol onsite. Link TV menampilkan hanya panel QR + status antrean agar aman dipajang di layar besar.
                </div>
              </section>
            ) : null}

            {queueDisplayPanel}

            {!tvOnly ? (
              <>
                <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-black text-amber-900">Skipped</h2>
                  <p className="text-xs font-semibold text-amber-700">Nomor skipped tidak ikut Call Next. Jika orangnya datang, klik Aktifkan Kembali. Nomor lama dipertahankan dan kembali ke Waiting.</p>
                </div>
                <div className="rounded-full bg-amber-200 px-3 py-1 text-sm font-black text-amber-900">{skipped.length}</div>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {skipped.map((entry: any) => (
                  <div key={entry.id} className="rounded-xl border border-amber-200 bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3"><div><div className="text-2xl font-black text-amber-800">{entry.queue_number}</div><div className="font-bold text-slate-950">{entry.participant_name}</div><div className="text-xs text-slate-500">{entry.employee_id}{entry.phone ? ` · ${entry.phone}` : ""}</div></div><span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-800">SKIPPED</span></div>
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <button disabled={busy} onClick={() => post({ action: "reactivate", eventId: data.event.id, entryId: entry.id })} className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-black text-white disabled:opacity-40">Aktifkan Kembali</button>
                      <button disabled={busy} onClick={() => cancelQueue(entry)} className="rounded-xl bg-red-600 px-4 py-2 text-sm font-black text-white disabled:opacity-40">Cancel</button>
                    </div>
                  </div>
                ))}
                {!skipped.length ? <div className="text-sm font-semibold text-amber-700">Belum ada antrean skipped.</div> : null}
              </div>
            </section>

            <section className="mt-6 overflow-hidden rounded-2xl border bg-white">
              <div className="flex flex-col gap-3 border-b bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="font-black">Waiting Queue <span className="text-slate-500">({waiting.length})</span></div>
                <button disabled={!waiting.length} onClick={exportWaiting} className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-black text-white disabled:opacity-40">Export Waiting</button>
              </div>
              <div className="max-h-[520px] overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="sticky top-0 bg-slate-100 text-xs uppercase text-slate-600"><tr><th className="p-3 text-left">No</th><th className="p-3 text-left">Nama</th><th className="p-3 text-left">NIK Karyawan</th><th className="p-3 text-left">No HP</th><th className="p-3 text-left">WA Reminder</th><th className="p-3 text-left">Aksi</th></tr></thead>
                  <tbody className="divide-y">{waiting.map((entry: any, index: number) => <tr key={entry.id}><td className="p-3 text-xl font-black">{entry.queue_number}</td><td className="p-3 font-bold">{entry.participant_name}</td><td className="p-3">{entry.employee_id}</td><td className="p-3 text-xs">{entry.phone || "-"}</td><td className="p-3 text-xs font-bold">{!data?.whatsapp_prepare?.enabled_for_session ? <span className="text-slate-400">Nonaktif</span> : entry.wa_prepare_sent_at ? <span className="text-emerald-700">Terkirim ✓</span> : entry.wa_prepare_last_error ? <span title={entry.wa_prepare_last_error} className="text-red-700">Gagal ⚠</span> : active.length && index === 0 ? <span className="text-violet-700">Target berikutnya</span> : <span className="text-slate-400">Menunggu</span>}</td><td className="p-3"><div className="flex flex-wrap gap-2"><button onClick={() => post({ action: "skip", eventId: data.event.id, entryId: entry.id })} className="rounded-lg border px-3 py-1 text-xs font-bold text-amber-700">Skip</button><button disabled={busy} onClick={() => cancelQueue(entry)} className="rounded-lg border border-red-200 bg-red-50 px-3 py-1 text-xs font-bold text-red-700 disabled:opacity-40">Cancel</button></div></td></tr>)}</tbody>
                </table>
              </div>
            </section>

            <section className="mt-6 overflow-hidden rounded-2xl border border-red-200 bg-white">
              <div className="flex items-center justify-between gap-3 border-b bg-red-50 px-4 py-3">
                <div>
                  <div className="font-black text-red-900">Peserta Cancel <span className="text-red-700">({cancelled.length})</span></div>
                  <div className="mt-1 text-xs font-semibold text-red-700">Status Cancel melepas blokir lintas session. Peserta boleh mengambil antrean baru di hari/lokasi berikutnya.</div>
                </div>
              </div>
              <details>
                <summary className="cursor-pointer border-b px-4 py-3 text-sm font-black text-slate-700 hover:bg-slate-50">Buka / tutup tabel peserta Cancel</summary>
                <div className="max-h-[420px] overflow-auto">
                  <table className="min-w-full text-sm">
                    <thead className="sticky top-0 bg-slate-100 text-xs uppercase text-slate-600"><tr><th className="p-3 text-left">No</th><th className="p-3 text-left">Nama</th><th className="p-3 text-left">NIK Karyawan</th><th className="p-3 text-left">No HP</th><th className="p-3 text-left">Cancel</th></tr></thead>
                    <tbody className="divide-y">{cancelled.map((entry: any) => <tr key={entry.id}><td className="p-3 text-xl font-black text-red-700">{entry.queue_number}</td><td className="p-3 font-bold">{entry.participant_name}</td><td className="p-3">{entry.employee_id}</td><td className="p-3 text-xs">{entry.phone || "-"}</td><td className="p-3 text-xs">{entry.cancelled_at ? new Date(entry.cancelled_at).toLocaleString("id-ID") : "-"}</td></tr>)}</tbody>
                  </table>
                  {!cancelled.length ? <div className="p-4 text-sm text-slate-500">Belum ada peserta Cancel.</div> : null}
                </div>
              </details>
            </section>

            <section className="mt-6 overflow-hidden rounded-2xl border bg-white">
              <div className="flex flex-col gap-3 border-b bg-emerald-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="font-black text-emerald-900">Peserta Selesai / Done <span className="text-emerald-700">({done.length})</span></div>
                <button disabled={!done.length} onClick={exportDone} className="rounded-xl bg-emerald-700 px-4 py-2 text-xs font-black text-white disabled:opacity-40">Export Done</button>
              </div>
              <details>
                <summary className="cursor-pointer border-b px-4 py-3 text-sm font-black text-slate-700 hover:bg-slate-50">Buka / tutup tabel peserta Done</summary>
                <div className="max-h-[520px] overflow-auto">
                  <table className="min-w-full text-sm">
                    <thead className="sticky top-0 bg-slate-100 text-xs uppercase text-slate-600"><tr><th className="p-3 text-left">No</th><th className="p-3 text-left">Nama</th><th className="p-3 text-left">NIK Karyawan</th><th className="p-3 text-left">No HP</th><th className="p-3 text-left">Selesai</th><th className="p-3 text-left">Aksi</th></tr></thead>
                    <tbody className="divide-y">{done.map((entry: any) => <tr key={entry.id}><td className="p-3 text-xl font-black text-emerald-700">{entry.queue_number}</td><td className="p-3 font-bold">{entry.participant_name}</td><td className="p-3">{entry.employee_id}</td><td className="p-3 text-xs">{entry.phone || "-"}</td><td className="p-3 text-xs">{entry.finished_at ? new Date(entry.finished_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "-"}</td><td className="p-3"><button disabled={busy} onClick={() => recallQueue(entry)} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-black text-blue-700 hover:bg-blue-100 disabled:opacity-40">Recall</button></td></tr>)}</tbody>
                  </table>
                  {!done.length ? <div className="p-4 text-sm text-slate-500">Belum ada peserta selesai.</div> : null}
                </div>
              </details>
            </section>
              </>
            ) : null}
          </>
        ) : null}
      </div>
    </main>
  );
}
