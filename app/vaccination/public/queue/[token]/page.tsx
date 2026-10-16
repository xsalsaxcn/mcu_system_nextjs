"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";

function queueNumberValue(value: any) {
  const text = String(value || "");
  const match = text.match(/(\d+)$/);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function watchStorageKey(token: string) {
  return `vaccination_existing_queue_watch_v1_${token}`;
}

function notifiedStorageKey(token: string, track: string, queueNumber: string) {
  return `vaccination_existing_queue_one_ahead_v1_${token}_${track}_${queueNumber}`;
}

function calledStorageKey(token: string, track: string, queueNumber: string) {
  return `vaccination_existing_queue_called_v1_${token}_${track}_${queueNumber}`;
}

function calledAlertKey(track: "A" | "B", queueNumber: string) {
  return `${track}:${queueNumber}`;
}

function trackLabel(track: "A" | "B") {
  return track === "A" ? "Healthday" : "Bazar";
}

function queueTrackCard(track: "A" | "B", trackData: any) {
  if (!trackData) return null;
  const status = String(trackData.status || "").toUpperCase();
  const isDone = ["DONE", "FINISHED", "ADMINISTERED"].includes(status);
  const isCalled = ["CALLED", "IN_PROGRESS"].includes(status);
  const isSkipped = status === "SKIPPED";
  const aheadCount = Number(trackData.aheadCount ?? 0);
  return {
    status,
    isDone,
    isCalled,
    isSkipped,
    aheadCount,
    oneAhead: !isDone && !isCalled && !isSkipped && aheadCount === 1,
  };
}

export default function PublicVaccinationQueuePage({ params }: { params: { token: string } }) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [modeReady, setModeReady] = useState(false);
  const [notifyMode, setNotifyMode] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [previewWatch, setPreviewWatch] = useState<any>(null);
  const [watchData, setWatchData] = useState<any>(null);
  const [deviceLocked, setDeviceLocked] = useState(false);
  const [notificationState, setNotificationState] = useState<"idle" | "granted" | "denied" | "unsupported">("idle");
  const [watchError, setWatchError] = useState("");
  const [oneAheadMessage, setOneAheadMessage] = useState("");
  const [calledAlert, setCalledAlert] = useState<any>(null);
  const [dismissedCalledKey, setDismissedCalledKey] = useState("");

  async function load() {
    const json = await fetch(`/api/vaccination/public-queue?token=${params.token}`, { cache: "no-store" }).then((r) => r.json());
    if (!json.ok) { setError(json.message || "Antrian tidak ditemukan."); return; }
    setError("");
    setData(json);
  }

  async function loadWatch(id: string) {
    const normalized = String(id || "").trim();
    if (!normalized) return null;
    const json = await fetch(
      `/api/vaccination/public-queue?token=${encodeURIComponent(params.token)}&employee_id=${encodeURIComponent(normalized)}&t=${Date.now()}`,
      { cache: "no-store" },
    ).then((r) => r.json());
    if (!json.ok) throw new Error(json.message || "Antrean tidak ditemukan.");
    return json;
  }

  async function enableBrowserNotification() {
    if (typeof window === "undefined" || !("Notification" in window) || !("serviceWorker" in navigator)) {
      setNotificationState("unsupported");
      return "unsupported" as const;
    }
    try {
      await navigator.serviceWorker.register("/vaccination-onsite-sw.js", { scope: "/" });
      const permission = Notification.permission === "default"
        ? await Notification.requestPermission()
        : Notification.permission;
      if (permission === "granted") {
        setNotificationState("granted");
        return "granted" as const;
      }
      setNotificationState("denied");
      return "denied" as const;
    } catch {
      setNotificationState("unsupported");
      return "unsupported" as const;
    }
  }

  function ensureParticipantAlertAudio() {
    if (typeof window === "undefined") return null;
    const w = window as any;
    const AudioCtor = w.AudioContext || w.webkitAudioContext;
    if (!AudioCtor) return null;
    if (!w.__vaccinationParticipantAlertAudio) {
      w.__vaccinationParticipantAlertAudio = new AudioCtor();
    }
    return w.__vaccinationParticipantAlertAudio;
  }

  function primeParticipantAlertAudio() {
    try {
      const ctx = ensureParticipantAlertAudio();
      if (ctx?.state === "suspended") void ctx.resume();
      if (!ctx) return;
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0.00001;
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start();
      oscillator.stop(ctx.currentTime + 0.02);
    } catch {
      // Notification flow must continue even if audio is blocked.
    }
  }

  function playParticipantCalledTone() {
    return new Promise<void>((resolve) => {
      try {
        const ctx = ensureParticipantAlertAudio();
        if (!ctx) {
          resolve();
          return;
        }
        if (ctx.state === "suspended") void ctx.resume();

        const start = ctx.currentTime;
        const tones = [
          { hz: 880, at: 0.00, duration: 0.20 },
          { hz: 1174.66, at: 0.27, duration: 0.24 },
          { hz: 1567.98, at: 0.58, duration: 0.38 },
        ];

        tones.forEach((tone) => {
          const oscillator = ctx.createOscillator();
          const gain = ctx.createGain();
          oscillator.type = "sine";
          oscillator.frequency.setValueAtTime(tone.hz, start + tone.at);
          gain.gain.setValueAtTime(0.0001, start + tone.at);
          gain.gain.exponentialRampToValueAtTime(0.24, start + tone.at + 0.025);
          gain.gain.exponentialRampToValueAtTime(
            0.0001,
            start + tone.at + tone.duration,
          );
          oscillator.connect(gain);
          gain.connect(ctx.destination);
          oscillator.start(start + tone.at);
          oscillator.stop(start + tone.at + tone.duration + 0.03);
        });

        window.setTimeout(resolve, 1150);
      } catch {
        resolve();
      }
    });
  }

  function clearCalledNotificationKey(track: "A" | "B", trackData: any) {
    const queueNumber = String(trackData?.queueNumber || "").trim();
    if (!queueNumber) return;
    try {
      window.localStorage.removeItem(calledStorageKey(params.token, track, queueNumber));
    } catch {}
  }

  async function sendCalledNotification(track: "A" | "B", trackData: any) {
    const queueNumber = String(trackData?.queueNumber || "").trim();
    if (!queueNumber) return;

    const alertKey = calledAlertKey(track, queueNumber);
    const storageKey = calledStorageKey(params.token, track, queueNumber);
    let alreadyNotified = false;
    try {
      alreadyNotified = window.localStorage.getItem(storageKey) === "1";
      if (!alreadyNotified) window.localStorage.setItem(storageKey, "1");
    } catch {}

    setCalledAlert({
      key: alertKey,
      track,
      queueNumber,
      label: trackLabel(track),
    });
    if (dismissedCalledKey !== alertKey) setDismissedCalledKey("");

    if (alreadyNotified) return;

    if ("vibrate" in navigator) {
      try {
        navigator.vibrate([700, 180, 700, 180, 1100]);
      } catch {}
    }

    void playParticipantCalledTone();

    if (
      typeof window === "undefined" ||
      !("Notification" in window) ||
      Notification.permission !== "granted"
    ) {
      return;
    }

    const body = `${queueNumber} ${trackLabel(track)} sedang dipanggil. Silakan menuju tim pemanggil.`;

    try {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification("Nomor antrean Anda dipanggil!", {
        body,
        tag: `vaccination-existing-called-${params.token}-${track}-${queueNumber}`,
        requireInteraction: true,
        renotify: true,
        vibrate: [700, 180, 700, 180, 1100],
        data: {
          url: window.location.href,
          queueNumber,
          track,
          status: "CALLED",
        },
      } as any);
    } catch {}
  }

  async function sendOneAheadNotification(track: "A" | "B", trackData: any) {
    const queueNumber = String(trackData?.queueNumber || "").trim();
    if (!queueNumber) return;
    const key = notifiedStorageKey(params.token, track, queueNumber);
    try {
      if (window.localStorage.getItem(key) === "1") return;
      window.localStorage.setItem(key, "1");
    } catch {}

    const text = `Tinggal 1 peserta lagi sebelum ${queueNumber}. Mohon bersiap untuk ${trackLabel(track)}.`;
    setOneAheadMessage(text);
    if ("vibrate" in navigator) {
      try { navigator.vibrate([300, 120, 300]); } catch {}
    }

    if (typeof window === "undefined" || !("Notification" in window) || Notification.permission !== "granted") return;
    try {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification("Antrean hampir dipanggil", {
        body: text,
        tag: `vaccination-existing-one-ahead-${params.token}-${track}-${queueNumber}`,
        requireInteraction: true,
        data: { url: window.location.href, queueNumber, status: "ONE_AHEAD" },
      } as any);
    } catch {}
  }

  async function submitLookup(e: FormEvent) {
    e.preventDefault();
    const value = employeeId.trim();
    if (!value) {
      setWatchError("BINUSIAN ID wajib diisi.");
      return;
    }
    setLookupLoading(true);
    setWatchError("");
    try {
      const json = await loadWatch(value);
      setPreviewWatch(json);
    } catch (err: any) {
      setPreviewWatch(null);
      setWatchError(err?.message || "BINUSIAN ID tidak ditemukan.");
    } finally {
      setLookupLoading(false);
    }
  }

  async function confirmParticipant() {
    if (!previewWatch?.participant) return;
    primeParticipantAlertAudio();
    const value = employeeId.trim();
    try {
      window.localStorage.setItem(
        watchStorageKey(params.token),
        JSON.stringify({
          employeeId: value,
          registrationId: previewWatch.participant.id,
          participantName: previewWatch.participant.participantName,
          lockedAt: new Date().toISOString(),
        }),
      );
    } catch {}
    setDeviceLocked(true);
    setWatchData(previewWatch);
    setPreviewWatch(null);
    await enableBrowserNotification();
  }

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const nextNotifyMode = query.get("notify") === "1";
    setNotifyMode(nextNotifyMode);
    setModeReady(true);

    if (nextNotifyMode) {
      try {
        const storedRaw = window.localStorage.getItem(watchStorageKey(params.token));
        if (storedRaw) {
          const stored = JSON.parse(storedRaw);
          if (stored?.employeeId) {
            setEmployeeId(String(stored.employeeId));
            setDeviceLocked(true);
          }
        }
      } catch {}
    }
  }, [params.token]);

  useEffect(() => {
    if (!modeReady || notifyMode) return;
    void load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [modeReady, notifyMode, params.token]);

  useEffect(() => {
    if (!modeReady || notifyMode) return;
    const url = `${window.location.origin}/vaccination/public/queue/${encodeURIComponent(params.token)}?notify=1`;
    QRCode.toDataURL(url, { width: 280, margin: 1, errorCorrectionLevel: "M" })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(""));
  }, [modeReady, notifyMode, params.token]);

  useEffect(() => {
    if (!notifyMode || !deviceLocked || !employeeId.trim()) return;
    let cancelled = false;
    let timer: number | undefined;

    const schedule = async () => {
      if (cancelled) return;
      try {
        const json = await loadWatch(employeeId);
        if (!cancelled) {
          setWatchData(json);
          setWatchError("");
        }
      } catch (err: any) {
        if (!cancelled) setWatchError(err?.message || "Gagal memperbarui antrean.");
      }
      if (!cancelled) timer = window.setTimeout(schedule, 4000);
    };

    void schedule();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [notifyMode, deviceLocked, employeeId, params.token]);

  useEffect(() => {
    if (!watchData?.tracks) return;
    const a = queueTrackCard("A", watchData.tracks.A);
    const b = queueTrackCard("B", watchData.tracks.B);

    if (a?.oneAhead) void sendOneAheadNotification("A", watchData.tracks.A);
    if (b?.oneAhead) void sendOneAheadNotification("B", watchData.tracks.B);

    if (a?.isCalled) {
      void sendCalledNotification("A", watchData.tracks.A);
    } else if (watchData.tracks.A) {
      clearCalledNotificationKey("A", watchData.tracks.A);
    }

    if (b?.isCalled) {
      void sendCalledNotification("B", watchData.tracks.B);
    } else if (watchData.tracks.B) {
      clearCalledNotificationKey("B", watchData.tracks.B);
    }

    if (!a?.isCalled && !b?.isCalled) {
      setCalledAlert(null);
      setDismissedCalledKey("");
    }
  }, [watchData]);

  const waitingList = useMemo(() => {
    const rows = data?.registrations || [];
    return rows
      .filter((r: any) => ["WAITING", "WAITING_WITH_NOTE", "REGISTERED"].includes(String(r.queue_status || "").toUpperCase()))
      .sort((a: any, b: any) => queueNumberValue(a.queue_number) - queueNumberValue(b.queue_number) || String(a.queue_number || "").localeCompare(String(b.queue_number || "")));
  }, [data]);

  const nextWaiting = waitingList[0];

  if (!modeReady) {
    return <main className="min-h-screen bg-slate-950 p-6 text-white">Memuat antrean...</main>;
  }

  if (notifyMode) {
    const a = watchData?.tracks?.A || null;
    const b = watchData?.tracks?.B || null;
    const aState = queueTrackCard("A", a);
    const bState = queueTrackCard("B", b);
    return (
      <main className="min-h-screen bg-slate-950 px-4 py-8 text-white">
        <div className="mx-auto max-w-xl rounded-3xl border border-white/15 bg-slate-900 p-6 shadow-2xl">
          <div className="text-center">
            <div className="text-xs font-black uppercase tracking-[0.28em] text-violet-300">Notifikasi Antrean</div>
            <h1 className="mt-3 text-3xl font-black">{watchData?.session?.session_name || "Antrean Vaksinasi"}</h1>
            <p className="mt-2 text-sm font-semibold text-slate-300">
              Masukkan BINUSIAN ID yang sudah terdaftar untuk menghubungkan perangkat ini ke antrean Anda.
            </p>
          </div>

          {watchError ? (
            <div className="mt-5 rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-sm font-bold text-red-200">{watchError}</div>
          ) : null}

          {!deviceLocked ? (
            <form onSubmit={submitLookup} className="mt-6 rounded-3xl bg-white p-5 text-slate-950">
              <label className="text-xs font-black uppercase tracking-wide text-slate-500">BINUSIAN ID</label>
              <input
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value.replace(/\s+/g, ""))}
                className="mt-2 w-full rounded-xl border px-4 py-3 text-lg font-bold"
                placeholder="Masukkan BINUSIAN ID"
                autoComplete="off"
              />
              <button disabled={lookupLoading} className="mt-4 w-full rounded-xl bg-violet-600 px-4 py-3 font-black text-white disabled:opacity-50">
                {lookupLoading ? "Mencari antrean..." : "Cek Antrean Saya"}
              </button>
            </form>
          ) : (
            <div className="mt-6 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-4 text-sm font-bold text-emerald-100">
              Perangkat ini sudah terhubung ke antrean <b>{watchData?.participant?.participantName || employeeId}</b>. Biarkan halaman ini tetap terbuka atau di background agar notifikasi -1 peserta dapat dipicu.
            </div>
          )}

          {watchData?.participant ? (
            <div className="mt-5 space-y-4">
              <div className="rounded-3xl bg-white p-5 text-slate-950">
                <div className="text-xs font-black uppercase tracking-wide text-slate-500">Nama Lengkap</div>
                <div className="mt-1 text-2xl font-black">{watchData.participant.participantName}</div>
                <div className="mt-1 text-sm font-bold text-slate-500">BINUSIAN ID: {watchData.participant.employeeId || employeeId}</div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {a ? (
                  <div className={`rounded-3xl p-5 text-slate-950 transition-all ${
                    aState?.isCalled
                      ? "animate-pulse bg-emerald-100 ring-4 ring-emerald-400 shadow-[0_0_38px_rgba(52,211,153,0.75)]"
                      : aState?.oneAhead
                        ? "bg-amber-100 ring-2 ring-amber-400"
                        : "bg-white"
                  }`}>
                    <div className="text-xs font-black uppercase tracking-wide text-blue-700">Healthday</div>
                    <div className="mt-2 text-4xl font-black text-blue-700">{a.queueNumber}</div>
                    <div className="mt-3 text-sm font-bold text-slate-600">Antrean di depan: <span className="text-xl text-slate-950">{a.aheadCount}</span></div>
                    {aState?.oneAhead ? <div className="mt-2 text-sm font-black text-amber-800">Tinggal 1 peserta lagi — mohon bersiap.</div> : null}
                    {aState?.isCalled ? <div className="mt-3 rounded-xl bg-emerald-600 px-3 py-2 text-center text-sm font-black text-white">🔔 GILIRAN ANDA DIPANGGIL</div> : null}
                    {aState?.isDone ? <div className="mt-2 text-sm font-black text-slate-700">Selesai.</div> : null}
                  </div>
                ) : null}
                {b ? (
                  <div className={`rounded-3xl p-5 text-slate-950 transition-all ${
                    bState?.isCalled
                      ? "animate-pulse bg-violet-100 ring-4 ring-violet-400 shadow-[0_0_38px_rgba(167,139,250,0.75)]"
                      : bState?.oneAhead
                        ? "bg-amber-100 ring-2 ring-amber-400"
                        : "bg-white"
                  }`}>
                    <div className="text-xs font-black uppercase tracking-wide text-violet-700">Bazar</div>
                    <div className="mt-2 text-4xl font-black text-violet-700">{b.queueNumber}</div>
                    <div className="mt-3 text-sm font-bold text-slate-600">Antrean di depan: <span className="text-xl text-slate-950">{b.aheadCount}</span></div>
                    {bState?.oneAhead ? <div className="mt-2 text-sm font-black text-amber-800">Tinggal 1 peserta lagi — mohon bersiap.</div> : null}
                    {bState?.isCalled ? <div className="mt-3 rounded-xl bg-violet-600 px-3 py-2 text-center text-sm font-black text-white">🔔 GILIRAN ANDA DIPANGGIL</div> : null}
                    {bState?.isDone ? <div className="mt-2 text-sm font-black text-slate-700">Selesai.</div> : null}
                  </div>
                ) : null}
              </div>

              <div className="rounded-2xl border border-white/15 bg-white/10 p-4 text-sm font-semibold text-slate-200">
                {notificationState === "granted"
                  ? "Notifikasi browser aktif. Sistem memberi peringatan saat -1 peserta dan alert utama saat nomor Anda dipanggil."
                  : notificationState === "denied"
                    ? "Izin notifikasi browser tidak diberikan. Posisi antrean tetap dapat dipantau dari halaman ini."
                    : notificationState === "unsupported"
                      ? "Browser ini tidak mendukung notifikasi lokal. Posisi antrean tetap dapat dipantau dari halaman ini."
                      : "Setelah konfirmasi, sistem akan meminta izin notifikasi browser."}
              </div>

              {oneAheadMessage ? (
                <div className="rounded-2xl border border-amber-300 bg-amber-100 p-4 text-center font-black text-amber-900">{oneAheadMessage}</div>
              ) : null}
            </div>
          ) : null}
        </div>

        {calledAlert && dismissedCalledKey !== calledAlert.key ? (
          <div className="fixed inset-0 z-[80] flex items-center justify-center overflow-hidden bg-slate-950/95 px-4">
            <div className="absolute inset-0 animate-pulse bg-[radial-gradient(circle_at_center,rgba(16,185,129,0.25),transparent_60%)]" />
            <div className="relative w-full max-w-lg animate-pulse rounded-[2rem] border-4 border-emerald-300 bg-white p-7 text-center text-slate-950 shadow-[0_0_80px_rgba(52,211,153,0.8)]">
              <div className="text-sm font-black uppercase tracking-[0.28em] text-emerald-700">
                🔔 Giliran Anda
              </div>
              <div className="mt-3 text-2xl font-black text-slate-900">
                NOMOR ANTREAN DIPANGGIL
              </div>
              <div className="mt-6 text-7xl font-black leading-none text-emerald-600 sm:text-8xl">
                {calledAlert.queueNumber}
              </div>
              <div className="mt-4 text-xl font-black text-slate-700">
                {calledAlert.label}
              </div>
              <div className="mt-6 rounded-2xl bg-emerald-600 px-4 py-4 text-lg font-black text-white">
                Silakan menuju tim pemanggil
              </div>
              <div className="mt-4 text-sm font-semibold text-slate-500">
                Perangkat akan tetap menampilkan status dipanggil sampai operator melanjutkan antrean.
              </div>
              <button
                type="button"
                onClick={() => setDismissedCalledKey(calledAlert.key)}
                className="mt-6 w-full rounded-xl border border-slate-300 bg-slate-100 px-4 py-3 font-black text-slate-800"
              >
                OK · Saya Menuju Tim Pemanggil
              </button>
            </div>
          </div>
        ) : null}

        {previewWatch?.participant ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4">
            <div className="w-full max-w-md rounded-3xl bg-white p-6 text-center text-slate-950 shadow-2xl">
              <div className="text-xs font-black uppercase tracking-[0.2em] text-violet-600">Konfirmasi Antrean</div>
              <div className="mt-4 text-sm font-bold text-slate-500">Nama Lengkap</div>
              <div className="mt-1 text-2xl font-black">{previewWatch.participant.participantName}</div>
              <div className="mt-5 text-sm font-bold text-slate-500">No Antrean</div>
              <div className="mt-2 flex flex-wrap justify-center gap-2">
                {previewWatch?.tracks?.A?.queueNumber ? <span className="rounded-full bg-blue-100 px-4 py-2 text-xl font-black text-blue-700">{previewWatch.tracks.A.queueNumber}</span> : null}
                {previewWatch?.tracks?.B?.queueNumber ? <span className="rounded-full bg-violet-100 px-4 py-2 text-xl font-black text-violet-700">{previewWatch.tracks.B.queueNumber}</span> : null}
              </div>
              <p className="mt-5 text-sm font-semibold text-slate-600">Pastikan nama dan nomor antrean sudah benar. Setelah klik OK, perangkat ini akan dikunci ke antrean tersebut.</p>
              <div className="mt-6 grid grid-cols-2 gap-3">
                <button onClick={() => setPreviewWatch(null)} className="rounded-xl border px-4 py-3 font-black text-slate-700">Kembali</button>
                <button onClick={confirmParticipant} className="rounded-xl bg-violet-600 px-4 py-3 font-black text-white">OK</button>
              </div>
            </div>
          </div>
        ) : null}
      </main>
    );
  }

  if (error) return <main className="p-6 text-red-700">{error}</main>;

  if (data?.dualQueue) {
    const a = data?.queues?.A || {};
    const b = data?.queues?.B || {};
    return (
      <main className="min-h-screen bg-slate-950 p-4 text-white">
        <div className="w-full rounded-3xl border border-white/15 bg-slate-900/95 p-6 shadow-2xl backdrop-blur lg:ml-auto lg:mr-4 lg:w-[94%] xl:mr-8 xl:max-w-[1500px]">
          <div className="grid items-center gap-6 lg:grid-cols-[minmax(0,1fr)_220px]">
            <div className="text-center lg:pl-10">
              <div className="text-sm font-bold uppercase tracking-[0.35em] text-slate-200">Antrian Healthday + Bazar</div>
              <h1 className="mt-4 text-3xl font-black leading-tight text-white drop-shadow sm:text-4xl">{data?.session?.session_name || "Loading..."}</h1>
              <p className="mt-3 text-base font-semibold text-slate-100">{data?.session?.company_name || ""}{data?.session?.location ? ` · ${data.session.location}` : ""}</p>
            </div>

            <aside className="rounded-3xl bg-white p-3 text-center text-slate-950 shadow-xl">
              {qrDataUrl ? <img src={qrDataUrl} alt="QR notifikasi antrean" className="mx-auto h-40 w-40 rounded-xl" /> : <div className="mx-auto flex h-40 w-40 items-center justify-center rounded-xl bg-slate-100 text-xs font-bold text-slate-500">Membuat QR...</div>}
              <div className="mt-2 text-xs font-black uppercase tracking-wide text-violet-700">Scan Notifikasi</div>
              <div className="mt-1 text-[11px] font-semibold leading-snug text-slate-600">Scan lalu masukkan BINUSIAN ID untuk pantau antrean & notifikasi -1 peserta.</div>
            </aside>
          </div>

          <div className="mt-8 grid gap-4 lg:grid-cols-2">
            <section className="rounded-3xl bg-white p-7 text-slate-950 shadow-xl">
              <div className="text-center text-sm font-black uppercase tracking-[0.2em] text-blue-700">A · Healthday</div>
              <div className="mt-3 text-center text-sm font-bold uppercase tracking-wide text-slate-500">Sedang Dipanggil</div>
              <div className="mt-3 text-center text-7xl font-black leading-none text-blue-700 sm:text-8xl">{a?.current?.queue_number || "-"}</div>
              <div className="mt-3 min-h-7 text-center text-xl font-black text-slate-900">{a?.current?.participant_name || "-"}</div>
              <div className="mt-6 grid grid-cols-3 gap-3">
                <div className="rounded-2xl bg-slate-100 p-4 text-center"><div className="text-xs font-bold uppercase text-slate-500">Berikutnya</div><div className="mt-1 text-3xl font-black text-slate-950">{a?.next?.queue_number || "-"}</div><div className="mt-1 truncate text-xs font-bold text-slate-600">{a?.next?.participant_name || "-"}</div></div>
                <div className="rounded-2xl bg-slate-100 p-4 text-center"><div className="text-xs font-bold uppercase text-slate-500">Menunggu</div><div className="mt-1 text-3xl font-black text-slate-950">{a?.summary?.waiting ?? 0}</div></div>
                <div className="rounded-2xl bg-emerald-50 p-4 text-center"><div className="text-xs font-bold uppercase text-emerald-700">Selesai</div><div className="mt-1 text-3xl font-black text-emerald-700">{a?.summary?.done ?? 0}</div></div>
              </div>
            </section>

            <section className="rounded-3xl bg-white p-7 text-slate-950 shadow-xl">
              <div className="text-center text-sm font-black uppercase tracking-[0.2em] text-violet-700">B · Bazar</div>
              <div className="mt-3 text-center text-sm font-bold uppercase tracking-wide text-slate-500">Sedang Dipanggil</div>
              <div className="mt-3 text-center text-7xl font-black leading-none text-violet-700 sm:text-8xl">{b?.current?.bazar_queue_number || "-"}</div>
              <div className="mt-3 min-h-7 text-center text-xl font-black text-slate-900">{b?.current?.participant_name || "-"}</div>
              <div className="mt-6 grid grid-cols-3 gap-3">
                <div className="rounded-2xl bg-slate-100 p-4 text-center"><div className="text-xs font-bold uppercase text-slate-500">Berikutnya</div><div className="mt-1 text-3xl font-black text-slate-950">{b?.next?.bazar_queue_number || "-"}</div><div className="mt-1 truncate text-xs font-bold text-slate-600">{b?.next?.participant_name || "-"}</div></div>
                <div className="rounded-2xl bg-slate-100 p-4 text-center"><div className="text-xs font-bold uppercase text-slate-500">Menunggu</div><div className="mt-1 text-3xl font-black text-slate-950">{b?.summary?.waiting ?? 0}</div></div>
                <div className="rounded-2xl bg-emerald-50 p-4 text-center"><div className="text-xs font-bold uppercase text-emerald-700">Selesai</div><div className="mt-1 text-3xl font-black text-emerald-700">{b?.summary?.done ?? 0}</div></div>
              </div>
            </section>
          </div>
          <p className="mt-6 text-center text-sm text-slate-300">Halaman ini update otomatis setiap beberapa detik.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 p-4 text-white">
      <div className="mx-auto max-w-3xl rounded-3xl border border-white/15 bg-slate-900/95 p-6 shadow-2xl backdrop-blur">
        <div className="text-center">
          <div className="text-sm font-bold uppercase tracking-[0.35em] text-slate-200">Antrian Vaksinasi</div>
          <h1 className="mt-4 text-3xl font-black leading-tight text-white drop-shadow sm:text-4xl">{data?.session?.session_name || "Loading..."}</h1>
          <p className="mt-3 text-base font-semibold text-slate-100">{data?.session?.company_name || ""}{data?.session?.location ? ` · ${data.session.location}` : ""}</p>
        </div>
        <section className="mt-8 rounded-3xl bg-white p-8 text-center text-slate-950 shadow-xl">
          <div className="text-base font-black uppercase tracking-wide text-slate-600">Sedang Dipanggil</div>
          <div className="mt-4 text-8xl font-black leading-none text-blue-700 sm:text-9xl">{data?.session?.current_queue_number || "-"}</div>
        </section>
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <div className="rounded-2xl bg-white/15 p-4 text-center ring-1 ring-white/10"><div className="text-sm font-semibold text-slate-200">Total</div><div className="mt-1 text-4xl font-black text-white">{data?.summary?.total ?? "-"}</div></div>
          <div className="rounded-2xl bg-white/15 p-4 text-center ring-1 ring-white/10"><div className="text-sm font-semibold text-slate-200">Menunggu</div><div className="mt-1 text-4xl font-black text-white">{data?.summary?.waiting ?? "-"}</div></div>
          <div className="rounded-2xl bg-white/15 p-4 text-center ring-1 ring-white/10"><div className="text-sm font-semibold text-slate-200">Berikutnya</div><div className="mt-1 text-4xl font-black text-white">{nextWaiting?.queue_number || "-"}</div></div>
          <div className="rounded-2xl bg-emerald-500/20 p-4 text-center ring-1 ring-emerald-300/20"><div className="text-sm font-semibold text-emerald-100">Selesai</div><div className="mt-1 text-4xl font-black text-white">{data?.summary?.done ?? "-"}</div></div>
        </div>
        <p className="mt-6 text-center text-sm text-slate-300">Halaman ini update otomatis setiap beberapa detik.</p>
      </div>
    </main>
  );
}
