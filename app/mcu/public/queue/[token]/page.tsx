"use client";

// MCU_CORPORATE_PUBLIC_OPERATOR_NOTIFICATION_LOCK_V517

import { FormEvent, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";

const WATCH_KEY_PREFIX = "mcu-public-watch-v462:";

function statusLabel(value: any) {
  const status = String(value || "").toUpperCase();
  if (status === "WAITING") return "Menunggu";
  if (status === "CALLED") return "Dipanggil";
  if (status === "IN_PROGRESS") return "Sedang diperiksa";
  if (status === "DONE") return "Selesai";
  if (status === "SKIPPED") return "Dilewati";
  if (status === "CANCELLED") return "Cancel";
  return status || "-";
}

export default function McuPublicQueuePage({ params }: { params: { token: string } }) {
  const token = String(params?.token || "");
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [alertsEnabled, setAlertsEnabled] = useState(false);
  const [preparePopup, setPreparePopup] = useState<any>(null);
  const [participantPopup, setParticipantPopup] = useState<any>(null);
  const [participantMode, setParticipantMode] = useState(false);
  const [employeeNik, setEmployeeNik] = useState("");
  const [watchData, setWatchData] = useState<any>(null);
  const [watchError, setWatchError] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const lastAlertKeyRef = useRef("");
  const lastWatchAlertKeyRef = useRef("");

  async function load() {
    if (!token) return;
    try {
      const res = await fetch(`/api/mcu/public-queue?token=${encodeURIComponent(token)}&t=${Date.now()}`, {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" },
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.message || "Gagal memuat antrian.");
      setData(json);
      setError("");
    } catch (err: any) {
      setError(err?.message || "Gagal memuat antrian.");
    }
  }

  async function loadWatch(nik: string) {
    const value = String(nik || "").trim();
    if (!value || !token) return null;
    const res = await fetch(
      `/api/mcu/public-queue?token=${encodeURIComponent(token)}&nik_karyawan=${encodeURIComponent(value)}&t=${Date.now()}`,
      { cache: "no-store", headers: { "Cache-Control": "no-cache" } },
    );
    const json = await res.json();
    if (!json.ok) throw new Error(json.message || "NIK Karyawan tidak ditemukan.");
    return json;
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    const query = new URLSearchParams(window.location.search);
    const isParticipant = query.get("mode") === "participant";
    setParticipantMode(isParticipant);

    if (isParticipant) {
      try {
        const stored = JSON.parse(window.localStorage.getItem(`${WATCH_KEY_PREFIX}${token}`) || "null");
        const nik = String(stored?.nikKaryawan || "").trim();
        if (nik) {
          setEmployeeNik(nik);
          loadWatch(nik).then((json) => {
            if (json) {
              setWatchData(json);
              setWatchError("");
            }
          }).catch((err: any) => setWatchError(err?.message || "Gagal memuat monitoring peserta."));
        }
      } catch {}
    }
  }, [token]);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 3000);
    return () => window.clearInterval(timer);
  }, [token]);

  useEffect(() => {
    if (!participantMode || !watchData?.participant?.nik_karyawan) return;
    const nik = String(watchData.participant.nik_karyawan);
    const timer = window.setInterval(() => {
      loadWatch(nik).then((json) => {
        if (json) setWatchData(json);
      }).catch(() => {});
    }, 3000);
    return () => window.clearInterval(timer);
  }, [participantMode, watchData?.participant?.nik_karyawan, token]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const participantUrl = `${window.location.origin}/mcu/public/queue/${encodeURIComponent(token)}?mode=participant`;
    QRCode.toDataURL(participantUrl, { margin: 1, width: 360 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(""));
  }, [token]);

  async function enableBrowserAlerts() {
    // V517: Public Queue monitor is display-only.
    // Browser/vibrate/personal speech alerts are allowed ONLY in ?mode=participant.
    if (!participantMode) {
      setAlertsEnabled(false);
      return;
    }
    setAlertsEnabled(true);
    try {
      if (typeof Notification !== "undefined" && Notification.permission === "default") {
        await Notification.requestPermission();
      }
    } catch {}
    try {
      if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate([120, 80, 120]);
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        const utterance = new SpeechSynthesisUtterance("Notifikasi persiapan antrian diaktifkan.");
        utterance.lang = "id-ID";
        utterance.rate = 0.95;
        window.speechSynthesis.speak(utterance);
      }
    } catch {}
  }

  function notifyPrepare(_track: "A" | "B", _queue: any, _label: string) {
    // V517 LOCK:
    // Public monitor/operator must never produce participant preparation popup,
    // Notification API, vibration, or personal preparation speech.
    return;
  }

  function notifyParticipantTrack(track: "A" | "B", trackData: any, label: string) {
    if (!participantMode || !watchData?.participant || !trackData?.queue_number) return;
    const status = String(trackData?.status || "").toUpperCase();
    const isCalled = ["CALLED", "IN_PROGRESS"].includes(status);
    const isThreeAhead = status === "WAITING" && Number(trackData?.ahead_count) === 3;
    if (!isCalled && !isThreeAhead) return;

    const kind = isCalled ? "CALLED" : "THREE_AHEAD";
    const key = `${kind}:${track}:${trackData.queue_number}:${trackData.current_queue_number || "-"}`;
    if (lastWatchAlertKeyRef.current.includes(key)) return;
    lastWatchAlertKeyRef.current = `${lastWatchAlertKeyRef.current}|${key}`.slice(-1000);

    const message = isCalled
      ? `Nomor antrian ${trackData.queue_number} sedang dipanggil. Silakan menuju lokasi pemeriksaan ${label}.`
      : `Nomor antrian Anda tersisa 3 orang di depan Anda. Silakan segera menuju lokasi pemeriksaan ${label}.`;

    setParticipantPopup({ key, track, queueNumber: trackData.queue_number, label, message, called: isCalled });

    if (!alertsEnabled) return;
    try { if ("vibrate" in navigator) navigator.vibrate(isCalled ? [700, 180, 700, 180, 1100] : [450, 140, 450, 140, 700]); } catch {}
    try {
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        new Notification(isCalled ? "Nomor antrian Anda dipanggil!" : "Antrian Anda segera dipanggil", { body: message });
      }
    } catch {}
    try {
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(message);
        utterance.lang = "id-ID";
        utterance.rate = 0.9;
        window.speechSynthesis.speak(utterance);
      }
    } catch {}
  }

  const session = data?.session || watchData?.session || {};
  const a = data?.queues?.A || {};
  const b = data?.queues?.B || {};
  const aName = session?.track_a_name || "Lab Darah";
  const bName = session?.track_b_name || "Rontgen";

  useEffect(() => {
    notifyPrepare("A", a, aName);
    notifyPrepare("B", b, bName);
  }, [alertsEnabled, participantMode, a?.current?.queue_number, a?.prepare?.queue_number, b?.current?.queue_number, b?.prepare?.queue_number, aName, bName]);

  useEffect(() => {
    notifyParticipantTrack("A", watchData?.tracks?.A, aName);
    notifyParticipantTrack("B", watchData?.tracks?.B, bName);
  }, [alertsEnabled, participantMode, watchData?.tracks?.A?.status, watchData?.tracks?.A?.ahead_count, watchData?.tracks?.A?.current_queue_number, watchData?.tracks?.B?.status, watchData?.tracks?.B?.ahead_count, watchData?.tracks?.B?.current_queue_number, aName, bName]);

  useEffect(() => {
    const popup = participantMode ? participantPopup : preparePopup;
    if (!popup?.key) return;
    const timer = window.setTimeout(() => participantMode ? setParticipantPopup(null) : setPreparePopup(null), 10000);
    return () => window.clearTimeout(timer);
  }, [participantMode, preparePopup?.key, participantPopup?.key]);

  async function submitLookup(e: FormEvent) {
    e.preventDefault();
    const nik = employeeNik.trim();
    if (!nik) {
      setWatchError("NIK Karyawan wajib diisi.");
      return;
    }
    setLookupLoading(true);
    setWatchError("");
    try {
      const json = await loadWatch(nik);
      setWatchData(json);
      try {
        window.localStorage.setItem(`${WATCH_KEY_PREFIX}${token}`, JSON.stringify({ nikKaryawan: nik, savedAt: new Date().toISOString() }));
      } catch {}
      await enableBrowserAlerts();
    } catch (err: any) {
      setWatchData(null);
      setWatchError(err?.message || "NIK Karyawan tidak ditemukan.");
    } finally {
      setLookupLoading(false);
    }
  }

  function resetParticipantWatch() {
    setWatchData(null);
    setWatchError("");
    setEmployeeNik("");
    setParticipantPopup(null);
    try { window.localStorage.removeItem(`${WATCH_KEY_PREFIX}${token}`); } catch {}
  }

  if (error && !participantMode) {
    return <main className="min-h-screen bg-slate-950 p-6 text-white"><div className="mx-auto max-w-3xl rounded-3xl border border-red-300/20 bg-red-950/30 p-6 font-bold text-red-100">{error}</div></main>;
  }

  if (participantMode) {
    return (
      <main className="min-h-screen bg-slate-950 p-4 text-white">
        {participantPopup ? <ParticipantPopup popup={participantPopup} onClose={() => setParticipantPopup(null)} /> : null}
        <div className="mx-auto w-full max-w-3xl rounded-3xl border border-white/20 bg-slate-900 p-5 shadow-2xl sm:p-7">
          <div className="text-center">
            <div className="text-xs font-black uppercase tracking-[0.25em] text-slate-400">Pantau Antrian MCU</div>
            <h1 className="mt-3 text-2xl font-black sm:text-3xl">{session?.company_name || "MCU Corporate"}</h1>
            <div className="mt-2 text-sm font-bold text-slate-300">{session?.package_name || "Paket MCU"}</div>
          </div>

          {!watchData ? (
            <form onSubmit={submitLookup} className="mt-7 rounded-3xl bg-white p-5 text-slate-950 sm:p-7">
              <div className="text-xl font-black">Masukkan NIK Karyawan</div>
              <div className="mt-1 text-sm font-semibold text-slate-500">Untuk melihat nomor antrian dan posisi Anda pada layanan A/B.</div>
              <input
                value={employeeNik}
                onChange={(e) => setEmployeeNik(e.target.value)}
                inputMode="text"
                autoComplete="off"
                placeholder="Contoh: 12345"
                className="mt-5 w-full rounded-2xl border border-slate-300 px-4 py-4 text-lg font-bold outline-none focus:border-blue-500"
              />
              {watchError ? <div className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{watchError}</div> : null}
              <button disabled={lookupLoading} className="mt-4 w-full rounded-2xl bg-blue-600 px-4 py-4 font-black text-white disabled:opacity-50">
                {lookupLoading ? "Mencari..." : "Lihat Antrian Saya"}
              </button>
            </form>
          ) : (
            <div className="mt-7">
              <div className="rounded-3xl bg-white p-5 text-slate-950 sm:p-7">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-black uppercase tracking-wider text-slate-500">Peserta</div>
                    <div className="mt-1 text-2xl font-black">{watchData?.participant?.name || "Peserta"}</div>
                    <div className="mt-1 text-sm font-bold text-slate-500">NIK Karyawan: {watchData?.participant?.nik_karyawan || "-"}</div>
                  </div>
                  <button onClick={resetParticipantWatch} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-black">Ganti NIK</button>
                </div>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <ParticipantTrackCard track="A" name={aName} data={watchData?.tracks?.A} accent="blue" />
                <ParticipantTrackCard track="B" name={bName} data={watchData?.tracks?.B} accent="violet" />
              </div>

              <button onClick={enableBrowserAlerts} className={`mt-4 w-full rounded-2xl px-4 py-3 text-sm font-black ${alertsEnabled ? "bg-emerald-500 text-white" : "bg-white text-slate-950"}`}>
                {alertsEnabled ? "🔔 Notifikasi Browser Aktif" : "Aktifkan Notifikasi Browser"}
              </button>
              <div className="mt-3 text-center text-xs font-semibold text-slate-400">Monitoring otomatis diperbarui setiap 3 detik.</div>
            </div>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 p-4 text-white">
      {/* V517: no participant preparation popup on Public Queue monitor. */}
      <div className="mx-auto w-full max-w-[1600px] rounded-3xl border border-white/20 bg-slate-900 p-6 shadow-2xl">
        <div className="grid items-center gap-5 lg:grid-cols-[1fr_220px]">
          <div className="text-center lg:pl-12">
            <div className="text-sm font-black uppercase tracking-[0.3em] text-slate-300">Antrian MCU Corporate</div>
            <h1 className="mt-4 text-3xl font-black leading-tight sm:text-4xl">{session?.package_name || "Paket MCU"}</h1>
            <div className="mt-3 text-base font-bold text-slate-200">{session?.company_name || "MCU Corporate"}</div>
            <div className="mt-4 inline-flex rounded-xl border border-slate-600 bg-slate-800 px-4 py-2 text-sm font-black text-slate-300">
              🔒 Monitor Publik · Notifikasi Peserta Nonaktif
            </div>
          </div>

          <aside className="rounded-3xl bg-white p-3 text-center text-slate-950 shadow-xl">
            {qrDataUrl ? <img src={qrDataUrl} alt="QR Pantau Antrian Peserta" className="mx-auto h-40 w-40 rounded-xl" /> : <div className="mx-auto flex h-40 w-40 items-center justify-center rounded-xl bg-slate-100 text-xs font-bold text-slate-500">Membuat QR...</div>}
            <div className="mt-2 text-xs font-black uppercase tracking-wide text-blue-700">Scan untuk Peserta</div>
            <div className="mt-1 text-[11px] font-semibold leading-snug text-slate-600">Scan lalu masukkan NIK Karyawan untuk memantau nomor antrian pribadi.</div>
          </aside>
        </div>

        <div className="mt-8 grid gap-4 lg:grid-cols-2">
          <QueueCard track="A" name={aName} data={a} accent="blue" />
          <QueueCard track="B" name={bName} data={b} accent="violet" />
        </div>

        <div className="mt-6 text-center text-sm font-semibold text-slate-300">Data sinkron otomatis setiap 3 detik · {data?.source_count ?? 0} peserta antrian terbaca.</div>
      </div>
    </main>
  );
}

function QueueCard({ track, name, data, accent }: { track: "A" | "B"; name: string; data: any; accent: "blue" | "violet" }) {
  const textClass = accent === "blue" ? "text-blue-700" : "text-violet-700";
  return (
    <section className="rounded-3xl bg-white p-7 text-slate-950 shadow-xl">
      <div className={`text-center text-sm font-black uppercase tracking-[0.2em] ${textClass}`}>{track} · {name}</div>
      <div className="mt-3 text-center text-sm font-bold uppercase tracking-wide text-slate-500">Sedang Dipanggil</div>
      <div className={`mt-3 text-center text-6xl font-black leading-none sm:text-8xl ${textClass}`}>{data?.current?.queue_number || "-"}</div>
      <div className="mt-3 min-h-7 text-center text-xl font-black text-slate-900">{data?.current?.participant_name || "-"}</div>

      <div className="mt-6 grid grid-cols-3 gap-3">
        <div className="rounded-2xl bg-slate-100 p-4 text-center"><div className="text-xs font-bold uppercase text-slate-500">Berikutnya</div><div className="mt-1 text-2xl font-black text-slate-950 sm:text-3xl">{data?.next?.queue_number || "-"}</div><div className="mt-1 truncate text-xs font-bold text-slate-600">{data?.next?.participant_name || "-"}</div></div>
        <div className="rounded-2xl bg-slate-100 p-4 text-center"><div className="text-xs font-bold uppercase text-slate-500">Menunggu</div><div className="mt-1 text-3xl font-black text-slate-950">{data?.summary?.waiting ?? 0}</div></div>
        <div className="rounded-2xl bg-emerald-50 p-4 text-center"><div className="text-xs font-bold uppercase text-emerald-700">Selesai</div><div className="mt-1 text-3xl font-black text-emerald-700">{data?.summary?.done ?? 0}</div></div>
      </div>
    </section>
  );
}

function ParticipantTrackCard({ track, name, data, accent }: { track: "A" | "B"; name: string; data: any; accent: "blue" | "violet" }) {
  const bg = accent === "blue" ? "border-blue-200 bg-blue-50" : "border-violet-200 bg-violet-50";
  const text = accent === "blue" ? "text-blue-700" : "text-violet-700";
  if (!data?.queue_number) {
    return <div className={`rounded-3xl border p-5 text-slate-950 ${bg}`}><div className={`font-black ${text}`}>{track} · {name}</div><div className="mt-5 text-sm font-bold text-slate-500">Tidak ada nomor antrian untuk layanan ini.</div></div>;
  }

  const status = String(data?.status || "").toUpperCase();
  const ahead = Number(data?.ahead_count || 0);
  let info = `${ahead} orang di depan Anda`;
  if (["CALLED", "IN_PROGRESS"].includes(status)) info = "Nomor Anda sedang dipanggil";
  if (status === "DONE") info = "Pemeriksaan selesai";
  if (status === "CANCELLED") info = "Antrian dibatalkan";
  if (status === "SKIPPED") info = "Antrian sedang dilewati";

  return (
    <div className={`rounded-3xl border p-5 text-slate-950 ${bg}`}>
      <div className={`text-sm font-black uppercase tracking-wider ${text}`}>{track} · {name}</div>
      <div className={`mt-3 text-5xl font-black ${text}`}>{data.queue_number}</div>
      <div className="mt-2 text-sm font-black text-slate-700">{statusLabel(data.status)}</div>
      <div className="mt-5 rounded-2xl bg-white/80 p-4">
        <div className="text-xs font-black uppercase text-slate-500">Posisi Anda</div>
        <div className="mt-1 text-lg font-black text-slate-950">{info}</div>
      </div>
      <div className="mt-3 text-xs font-bold text-slate-500">Sedang dipanggil: <span className="text-slate-900">{data?.current_queue_number || "-"}</span></div>
    </div>
  );
}

function PreparePopup({ popup, onClose }: { popup: any; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center overflow-hidden bg-slate-950/90 px-4">
      <div className="absolute inset-0 animate-pulse bg-[radial-gradient(circle_at_center,rgba(245,158,11,0.28),transparent_62%)]" />
      <div className="relative w-full max-w-xl rounded-[2rem] border-4 border-amber-300 bg-white p-7 text-center text-slate-950 shadow-[0_0_90px_rgba(245,158,11,0.8)]">
        <div className="text-sm font-black uppercase tracking-[0.28em] text-amber-700">🔔 Persiapan Antrian</div>
        <div className="mt-3 text-lg font-black uppercase text-slate-600">{popup.track} · {popup.label}</div>
        <div className="mt-5 text-7xl font-black leading-none text-amber-600 sm:text-8xl">{popup.queueNumber}</div>
        {popup.participantName ? <div className="mt-3 text-2xl font-black text-slate-950">{popup.participantName}</div> : null}
        <div className="mt-6 rounded-2xl bg-amber-500 px-5 py-5 text-xl font-black leading-snug text-white">Nomor Antrian Anda tersisa 3 orang di depan Anda</div>
        <div className="mt-4 text-xl font-black leading-snug text-slate-800">Silakan segera menuju lokasi pemeriksaan {popup.label}</div>
        <button type="button" onClick={onClose} className="mt-6 w-full rounded-xl border border-slate-300 bg-slate-100 px-4 py-3 font-black text-slate-800">OK · Saya Bersiap</button>
      </div>
    </div>
  );
}

function ParticipantPopup({ popup, onClose }: { popup: any; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/90 p-4">
      <div className={`w-full max-w-lg rounded-[2rem] border-4 bg-white p-7 text-center text-slate-950 shadow-2xl ${popup.called ? "border-emerald-400" : "border-amber-300"}`}>
        <div className={`text-sm font-black uppercase tracking-[0.2em] ${popup.called ? "text-emerald-700" : "text-amber-700"}`}>{popup.called ? "🔔 Nomor Anda Dipanggil" : "🔔 Persiapan Antrian"}</div>
        <div className="mt-3 text-lg font-black text-slate-600">{popup.track} · {popup.label}</div>
        <div className={`mt-5 text-7xl font-black ${popup.called ? "text-emerald-600" : "text-amber-600"}`}>{popup.queueNumber}</div>
        <div className="mt-6 text-xl font-black leading-snug">{popup.message}</div>
        <button onClick={onClose} className="mt-6 w-full rounded-xl bg-slate-100 px-4 py-3 font-black">OK</button>
      </div>
    </div>
  );
}
