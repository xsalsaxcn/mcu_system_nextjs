"use client";

import { useEffect, useRef, useState } from "react";

function statusLabel(value: any) {
  const status = String(value || "").toUpperCase();
  if (status === "CALLED") return "GILIRAN ANDA";
  if (status === "IN_PROGRESS") return "SEDANG DIPROSES";
  if (status === "SKIPPED") return "TERSKIP";
  if (status === "DONE") return "SELESAI";
  return "MENUNGGU";
}

export default function VaccinationOnsiteTicketPage({ params }: { params: { token: string } }) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [notificationState, setNotificationState] = useState("Belum diaktifkan");
  const lastStatusRef = useRef("");
  const audioRef = useRef<AudioContext | null>(null);

  function playAlert() {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = audioRef.current || new AudioCtx();
      audioRef.current = ctx;
      if (ctx.state === "suspended") void ctx.resume();
      [0, 0.45, 0.9].forEach((offset) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = 880;
        gain.gain.value = 0.08;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + offset);
        osc.stop(ctx.currentTime + offset + 0.22);
      });
    } catch {}
  }

  function fireCalledAlert(queueNumber: string) {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try { navigator.vibrate([500, 180, 500, 180, 900]); } catch {}
    }
    playAlert();
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      try {
        new Notification("Giliran Anda!", {
          body: `${queueNumber} dipanggil. Silakan menuju area vaksinasi.`,
          tag: `vaccination-onsite-${queueNumber}`,
          requireInteraction: true,
        });
      } catch {}
    }
  }

  async function load() {
    const json = await fetch(`/api/vaccination/onsite-queue/public?ticket_token=${encodeURIComponent(params.token)}&t=${Date.now()}`, { cache: "no-store" }).then((r) => r.json());
    if (!json.ok) {
      setError(json.message || "Tiket antrean tidak ditemukan.");
      return null;
    }
    setData(json);
    const status = String(json?.entry?.queue_status || "").toUpperCase();
    const previous = lastStatusRef.current;
    if (status === "CALLED" && previous !== "CALLED") fireCalledAlert(json?.entry?.queue_number || "Nomor Anda");
    lastStatusRef.current = status;
    return json;
  }

  useEffect(() => {
    void load();
    let cancelled = false;
    let timer: number | undefined;

    const schedule = async () => {
      if (cancelled) return;
      const latest = await load();
      if (cancelled) return;
      const ahead = Number(latest?.ahead_count ?? 99);
      const status = String(latest?.entry?.queue_status || "WAITING").toUpperCase();
      const delay = ["CALLED", "IN_PROGRESS"].includes(status) ? 2500 : ahead <= 5 ? 3000 : ahead <= 30 ? 7000 : 12000;
      timer = window.setTimeout(schedule, delay);
    };

    timer = window.setTimeout(schedule, 3000);
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [params.token]);

  async function enableNotification() {
    try {
      if (typeof Notification !== "undefined") {
        const permission = await Notification.requestPermission();
        setNotificationState(permission === "granted" ? "Notifikasi aktif" : "Notifikasi browser tidak diizinkan");
      } else {
        setNotificationState("Browser tidak mendukung Notification API");
      }
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        audioRef.current = audioRef.current || new AudioCtx();
        if (audioRef.current.state === "suspended") await audioRef.current.resume();
      }
      if ("vibrate" in navigator) navigator.vibrate(120);
    } catch {
      setNotificationState("Notifikasi tidak dapat diaktifkan");
    }
  }

  const status = String(data?.entry?.queue_status || "WAITING").toUpperCase();
  const isCalled = status === "CALLED";
  const isSkipped = status === "SKIPPED";
  const isDone = status === "DONE";

  return (
    <main className={`min-h-screen px-4 py-8 text-white ${isCalled ? "bg-emerald-600" : isSkipped ? "bg-amber-700" : isDone ? "bg-slate-700" : "bg-slate-950"}`}>
      <div className="mx-auto max-w-xl rounded-3xl border border-white/20 bg-black/20 p-6 shadow-2xl backdrop-blur">
        {error ? <div className="rounded-2xl border border-red-300 bg-red-950/40 p-4 font-bold text-red-100">{error}</div> : null}
        {data ? (
          <>
            <div className="text-center">
              <div className="text-xs font-black uppercase tracking-[0.3em] text-white/70">Antrean Anda</div>
              <div className="mt-4 text-7xl font-black leading-none sm:text-8xl">{data.entry.queue_number}</div>
              <div className="mt-4 text-2xl font-black">{statusLabel(status)}</div>
              <div className="mt-2 text-sm font-semibold text-white/80">{data.entry.participant_name}</div>
            </div>

            {isCalled ? (
              <div className="mt-6 rounded-3xl bg-white p-6 text-center text-emerald-800 shadow-xl">
                <div className="text-3xl font-black">IT IS YOUR TURN!</div>
                <div className="mt-2 text-lg font-bold">Silakan menuju area vaksinasi sekarang.</div>
              </div>
            ) : null}

            {isSkipped ? (
              <div className="mt-6 rounded-3xl bg-white p-5 text-center text-amber-800">
                <div className="text-xl font-black">Nomor Anda sempat ter-skip.</div>
                <div className="mt-2 text-sm font-semibold">Datang ke petugas. Petugas dapat klik Aktifkan Kembali tanpa membuat nomor baru.</div>
              </div>
            ) : null}

            {!isCalled && !isSkipped && !isDone ? (
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl bg-white/10 p-4 text-center"><div className="text-xs font-bold text-white/60">Sedang Dipanggil</div><div className="mt-1 text-3xl font-black">{data.event.current_queue_number || "-"}</div></div>
                <div className="rounded-2xl bg-white/10 p-4 text-center"><div className="text-xs font-bold text-white/60">Antrean di Depan</div><div className="mt-1 text-3xl font-black">{data.ahead_count ?? 0}</div></div>
              </div>
            ) : null}

            <div className="mt-6 rounded-2xl bg-white/10 p-4 text-sm font-semibold text-white/80">
              <div>{data.event.session_name}</div>
              <div>{[data.event.company_name, data.event.location].filter(Boolean).join(" · ")}</div>
            </div>

            <button onClick={enableNotification} className="mt-4 w-full rounded-xl bg-white px-4 py-3 text-sm font-black text-slate-950">Aktifkan Notifikasi & Getar</button>
            <div className="mt-2 text-center text-xs font-semibold text-white/70">{notificationState}</div>
            <p className="mt-4 text-center text-xs text-white/60">Biarkan halaman ini tetap terbuka. Saat dipanggil, sistem akan mencoba getar, bunyi, browser notification, dan alert visual sesuai dukungan perangkat.</p>
          </>
        ) : null}
      </div>
    </main>
  );
}
