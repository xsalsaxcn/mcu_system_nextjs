"use client";

import { useEffect, useRef, useState } from "react";

function statusLabel(value: any) {
  const status = String(value || "").toUpperCase();
  if (status === "CALLED" || status === "IN_PROGRESS") return "GILIRAN ANDA";
  if (status === "SKIPPED") return "TERSKIP";
  if (status === "DONE") return "SELESAI";
  return "MENUNGGU";
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((character) => character.charCodeAt(0)));
}

export default function VaccinationOnsiteTicketPage({ params }: { params: { token: string } }) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [notificationState, setNotificationState] = useState("Belum diaktifkan");
  const [pushBusy, setPushBusy] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [calledModalOpen, setCalledModalOpen] = useState(false);
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

  function openPopupAlert(queueNumber: string) {
    setCalledModalOpen(true);
    if (typeof window !== "undefined") {
      try {
        window.focus();
      } catch {}
      try {
        window.alert(`Antrean Anda sudah dipanggil: ${queueNumber}. Silakan menuju area vaksinasi sekarang.`);
      } catch {}
    }
  }

  function fireCalledAlert(queueNumber: string) {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try { navigator.vibrate([500, 180, 500, 180, 900]); } catch {}
    }
    playAlert();
    openPopupAlert(queueNumber);

    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      try {
        new Notification("Antrean Anda Sudah Dipanggil", {
          body: `${queueNumber} dipanggil. Silakan menuju area vaksinasi sekarang.`,
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
    if (["CALLED", "IN_PROGRESS"].includes(status) && !["CALLED", "IN_PROGRESS"].includes(previous)) {
      fireCalledAlert(json?.entry?.queue_number || "Nomor Anda");
    }
    lastStatusRef.current = status;
    return json;
  }

  async function ensureBackgroundPush(promptPermission = true) {
    if (typeof window === "undefined") return false;
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || typeof Notification === "undefined") {
      setNotificationState("Browser ini tidak mendukung Web Push background");
      return false;
    }

    setPushBusy(true);
    try {
      let permission = Notification.permission;
      if (permission === "default" && promptPermission) {
        permission = await Notification.requestPermission();
      }
      if (permission !== "granted") {
        setPushEnabled(false);
        setNotificationState(permission === "denied" ? "Izin notifikasi ditolak di browser" : "Tekan tombol untuk mengizinkan notifikasi");
        return false;
      }

      const config = await fetch(`/api/vaccination/onsite-queue/push?t=${Date.now()}`, { cache: "no-store" }).then((r) => r.json());
      if (!config.ok || !config.configured || !config.publicKey) {
        setPushEnabled(false);
        setNotificationState("Web Push server belum dikonfigurasi");
        return false;
      }

      await navigator.serviceWorker.register("/vaccination-onsite-sw.js", { scope: "/" });
      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(config.publicKey),
        });
      }

      const save = await fetch("/api/vaccination/onsite-queue/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticketToken: params.token,
          subscription: subscription.toJSON(),
        }),
      }).then((r) => r.json());

      if (!save.ok) {
        setPushEnabled(false);
        setNotificationState(save.message || "Gagal menyimpan Web Push subscription");
        return false;
      }

      setPushEnabled(true);
      setNotificationState("Notifikasi background aktif — panggilan akan muncul di HP Anda");

      if (promptPermission && "vibrate" in navigator) {
        try { navigator.vibrate([120, 80, 120]); } catch {}
      }
      return true;
    } catch (pushError: any) {
      setPushEnabled(false);
      setNotificationState(pushError?.message || "Notifikasi background tidak dapat diaktifkan");
      return false;
    } finally {
      setPushBusy(false);
    }
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

  useEffect(() => {
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "granted") {
      void ensureBackgroundPush(false);
    }
  }, [params.token]);

  async function enableNotification() {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        audioRef.current = audioRef.current || new AudioCtx();
        if (audioRef.current.state === "suspended") await audioRef.current.resume();
      }
    } catch {}

    await ensureBackgroundPush(true);
  }

  const status = String(data?.entry?.queue_status || "WAITING").toUpperCase();
  const isCalled = ["CALLED", "IN_PROGRESS"].includes(status);
  const isSkipped = status === "SKIPPED";
  const isDone = status === "DONE";

  return (
    <main className={`min-h-screen px-4 py-8 ${isCalled ? "bg-emerald-50 text-emerald-950" : isSkipped ? "bg-amber-50 text-amber-950" : isDone ? "bg-slate-100 text-slate-950" : "bg-violet-50 text-slate-950"}`}>
      <div className="mx-auto max-w-xl rounded-3xl border border-slate-200 bg-white p-6 shadow-xl">
        {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 font-bold text-red-700">{error}</div> : null}
        {data ? (
          <>
            <div className="text-center">
              <div className="text-xs font-black uppercase tracking-[0.3em] text-slate-500">Antrean Anda</div>
              <div className={`mt-4 text-7xl font-black leading-none drop-shadow-sm sm:text-8xl ${isCalled ? "text-emerald-700" : isSkipped ? "text-amber-700" : isDone ? "text-slate-700" : "text-violet-700"}`}>{data.entry.queue_number}</div>
              <div className="mt-4 text-2xl font-black text-slate-900">{statusLabel(status)}</div>
              <div className="mt-2 text-sm font-semibold text-slate-600">{data.entry.participant_name}</div>
            </div>

            {isCalled ? (
              <div className="mt-6 rounded-3xl bg-emerald-600 p-6 text-center text-white shadow-xl">
                <div className="text-3xl font-black">ANTREAN ANDA SUDAH DIPANGGIL</div>
                <div className="mt-2 text-lg font-bold">Silakan menuju area vaksinasi sekarang.</div>
              </div>
            ) : null}

            {isSkipped ? (
              <div className="mt-6 rounded-3xl border border-amber-200 bg-amber-100 p-5 text-center text-amber-900">
                <div className="text-xl font-black">Nomor Anda sempat ter-skip.</div>
                <div className="mt-2 text-sm font-semibold">Datang ke petugas. Petugas dapat klik Aktifkan Kembali tanpa membuat nomor baru.</div>
              </div>
            ) : null}

            {!isCalled && !isSkipped && !isDone ? (
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-violet-100 bg-violet-50 p-4 text-center"><div className="text-xs font-bold text-slate-500">Sedang Dipanggil</div><div className="mt-1 text-3xl font-black text-violet-700">{data.event.current_queue_number || "-"}</div></div>
                <div className="rounded-2xl border border-violet-100 bg-violet-50 p-4 text-center"><div className="text-xs font-bold text-slate-500">Antrean di Depan</div><div className="mt-1 text-3xl font-black text-violet-700">{data.ahead_count ?? 0}</div></div>
              </div>
            ) : null}

            <div className="mt-6 rounded-2xl border bg-slate-50 p-4 text-sm font-semibold text-slate-700">
              <div>{data.event.session_name}</div>
              <div>{[data.event.company_name, data.event.location].filter(Boolean).join(" · ")}</div>
            </div>

            <button disabled={pushBusy} onClick={enableNotification} className="mt-4 w-full rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white disabled:opacity-50">
              {pushBusy ? "Mengaktifkan Notifikasi..." : pushEnabled ? "Notifikasi Background Aktif ✓" : "Aktifkan Notifikasi Background & Getar"}
            </button>
            <div className="mt-2 text-center text-xs font-semibold text-slate-500">{notificationState}</div>
            <p className="mt-4 text-center text-xs text-slate-500">
              Saat nomor Anda dipanggil, sistem akan mencoba menampilkan notifikasi HP, suara, getar, dan pop-up peringatan di halaman ini sesuai dukungan perangkat/browser.
            </p>
          </>
        ) : null}
      </div>

      {calledModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 text-center shadow-2xl">
            <div className="text-sm font-black uppercase tracking-[0.25em] text-emerald-600">Peringatan</div>
            <div className="mt-3 text-3xl font-black text-slate-950">Antrean Anda Sudah Dipanggil</div>
            <div className="mt-4 text-6xl font-black text-emerald-700">{data?.entry?.queue_number || "-"}</div>
            <p className="mt-4 text-sm font-semibold text-slate-600">Silakan segera menuju area vaksinasi sekarang.</p>
            <button onClick={() => setCalledModalOpen(false)} className="mt-6 w-full rounded-xl bg-emerald-600 px-4 py-3 font-black text-white">Tutup</button>
          </div>
        </div>
      ) : null}
    </main>
  );
}
