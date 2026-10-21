"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";

export default function McuPublicQueuePage({ params }: { params: { token: string } }) {
  const token = String(params?.token || "");
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [alertsEnabled, setAlertsEnabled] = useState(false);
  const [preparePopup, setPreparePopup] = useState<any>(null);
  const lastAlertKeyRef = useRef("");
  // MCU_PUBLIC_QUEUE_PREPARE_POPOUT_V460

  async function load() {
    if (!token) return;
    try {
      const res = await fetch(`/api/mcu/public-queue?token=${encodeURIComponent(token)}`, { cache: "no-store" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.message || "Gagal memuat antrian.");
      setData(json);
      setError("");
    } catch (err: any) {
      setError(err?.message || "Gagal memuat antrian.");
    }
  }

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 4000);
    return () => window.clearInterval(timer);
  }, [token]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    QRCode.toDataURL(window.location.href, { margin: 1, width: 360 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(""));
  }, [token]);

  async function enableBrowserAlerts() {
    setAlertsEnabled(true);
    try {
      if (typeof Notification !== "undefined" && Notification.permission === "default") {
        await Notification.requestPermission();
      }
    } catch {
      // Permission optional.
    }
    try {
      if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate([120, 80, 120]);
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        const utterance = new SpeechSynthesisUtterance("Notifikasi persiapan antrian diaktifkan.");
        utterance.lang = "id-ID";
        utterance.rate = 0.95;
        window.speechSynthesis.speak(utterance);
      }
    } catch {
      // Browser may block vibration/audio.
    }
  }

  function notifyPrepare(track: "A" | "B", queue: any, label: string) {
    const prepare = queue?.prepare;
    const current = queue?.current;
    if (!prepare?.queue_number || !current?.queue_number) return;

    const key = `${track}:${current.queue_number}:${prepare.queue_number}`;
    if (lastAlertKeyRef.current.includes(key)) return;
    lastAlertKeyRef.current = `${lastAlertKeyRef.current}|${key}`.slice(-600);

    const queueNumber = String(prepare.queue_number || "");
    const participantName = String(prepare.participant_name || "");
    const serviceLabel = String(label || (track === "A" ? "Layanan A" : "Layanan B"));
    const body = `Nomor antrian Anda tersisa 3 orang di depan Anda. Silakan segera menuju lokasi pemeriksaan ${serviceLabel}.`;

    // Popout visual selalu muncul di layar Public Queue, tidak bergantung izin browser.
    setPreparePopup({
      key,
      track,
      queueNumber,
      participantName,
      label: serviceLabel,
      message: body,
    });

    // Audio/getar/notifikasi OS membutuhkan interaksi awal user pada browser.
    if (!alertsEnabled) return;

    try {
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        navigator.vibrate([450, 140, 450, 140, 700]);
      }
    } catch {}
    try {
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        new Notification(`Persiapan antrian ${queueNumber}`, {
          body: `${track} · ${serviceLabel} — ${body}`,
          tag: `mcu-prepare-${token}-${track}-${queueNumber}`,
          requireInteraction: true,
        } as any);
      }
    } catch {}
    try {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(
          `Nomor antrian ${queueNumber}. Tersisa 3 orang di depan Anda. Silakan segera menuju lokasi pemeriksaan ${serviceLabel}.`,
        );
        utterance.lang = "id-ID";
        utterance.rate = 0.9;
        utterance.volume = 1;
        window.speechSynthesis.speak(utterance);
      }
    } catch {}
  }

  const session = data?.session || {};
  const a = data?.queues?.A || {};
  const b = data?.queues?.B || {};
  const aName = session?.track_a_name || "Lab Darah";
  const bName = session?.track_b_name || "Rontgen";

  useEffect(() => {
    notifyPrepare("A", a, aName);
    notifyPrepare("B", b, bName);
  }, [alertsEnabled, a?.current?.queue_number, a?.prepare?.queue_number, b?.current?.queue_number, b?.prepare?.queue_number, aName, bName]);

  useEffect(() => {
    if (!preparePopup?.key) return;
    const timer = window.setTimeout(() => setPreparePopup(null), 10000);
    return () => window.clearTimeout(timer);
  }, [preparePopup?.key]);

  if (error) {
    return <main className="min-h-screen bg-slate-950 p-6 text-white"><div className="mx-auto max-w-3xl rounded-3xl border border-red-300/20 bg-red-950/30 p-6 font-bold text-red-100">{error}</div></main>;
  }

  return (
    <main className="min-h-screen bg-slate-950 p-4 text-white">
      {preparePopup ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center overflow-hidden bg-slate-950/90 px-4">
          <div className="absolute inset-0 animate-pulse bg-[radial-gradient(circle_at_center,rgba(245,158,11,0.28),transparent_62%)]" />
          <div className="relative w-full max-w-xl rounded-[2rem] border-4 border-amber-300 bg-white p-7 text-center text-slate-950 shadow-[0_0_90px_rgba(245,158,11,0.8)]">
            <div className="text-sm font-black uppercase tracking-[0.28em] text-amber-700">🔔 Persiapan Antrian</div>
            <div className="mt-3 text-lg font-black uppercase text-slate-600">{preparePopup.track} · {preparePopup.label}</div>
            <div className="mt-5 text-7xl font-black leading-none text-amber-600 sm:text-8xl">{preparePopup.queueNumber}</div>
            {preparePopup.participantName ? (
              <div className="mt-3 text-2xl font-black text-slate-950">{preparePopup.participantName}</div>
            ) : null}
            <div className="mt-6 rounded-2xl bg-amber-500 px-5 py-5 text-xl font-black leading-snug text-white">
              Nomor Antrian Anda tersisa 3 orang di depan Anda
            </div>
            <div className="mt-4 text-xl font-black leading-snug text-slate-800">
              Silakan segera menuju lokasi pemeriksaan {preparePopup.label}
            </div>
            <div className="mt-3 text-sm font-bold text-slate-500">Kode layanan {preparePopup.track}</div>
            <button
              type="button"
              onClick={() => setPreparePopup(null)}
              className="mt-6 w-full rounded-xl border border-slate-300 bg-slate-100 px-4 py-3 font-black text-slate-800"
            >
              OK · Saya Bersiap
            </button>
          </div>
        </div>
      ) : null}

      <div className="mx-auto w-full max-w-[1600px] rounded-3xl border border-white/20 bg-slate-900 p-6 shadow-2xl">
        <div className="grid items-center gap-5 lg:grid-cols-[1fr_220px]">
          <div className="text-center lg:pl-12">
            <div className="text-sm font-black uppercase tracking-[0.3em] text-slate-300">Antrian MCU Corporate</div>
            <h1 className="mt-4 text-3xl font-black leading-tight sm:text-4xl">{session?.package_name || "Paket MCU"}</h1>
            <div className="mt-3 text-base font-bold text-slate-200">{session?.company_name || "MCU Corporate"}</div>
            <button onClick={enableBrowserAlerts} className={`mt-4 rounded-xl px-4 py-2 text-sm font-black ${alertsEnabled ? "bg-emerald-500 text-white" : "bg-white text-slate-900"}`}>
              {alertsEnabled ? "🔔 Notifikasi Browser Aktif" : "Aktifkan Notifikasi Browser"}
            </button>
          </div>

          <aside className="rounded-3xl bg-white p-3 text-center text-slate-950 shadow-xl">
            {qrDataUrl ? <img src={qrDataUrl} alt="QR Public Queue MCU" className="mx-auto h-40 w-40 rounded-xl" /> : <div className="mx-auto flex h-40 w-40 items-center justify-center rounded-xl bg-slate-100 text-xs font-bold text-slate-500">Membuat QR...</div>}
            <div className="mt-2 text-xs font-black uppercase tracking-wide text-blue-700">Scan Monitor</div>
            <div className="mt-1 text-[11px] font-semibold leading-snug text-slate-600">Buka tampilan antrian MCU ini di perangkat lain.</div>
          </aside>
        </div>

        <div className="mt-8 grid gap-4 lg:grid-cols-2">
          <QueueCard track="A" name={aName} data={a} accent="blue" />
          <QueueCard track="B" name={bName} data={b} accent="violet" />
        </div>

        <div className="mt-6 text-center text-sm font-semibold text-slate-300">Halaman diperbarui otomatis setiap beberapa detik.</div>
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
      <div className={`mt-3 text-center text-7xl font-black leading-none sm:text-8xl ${textClass}`}>{data?.current?.queue_number || "-"}</div>
      <div className="mt-3 min-h-7 text-center text-xl font-black text-slate-900">{data?.current?.participant_name || "-"}</div>

      <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-center">
        <div className="text-xs font-black uppercase tracking-wide text-amber-700">Bersiap · 3 nomor lagi</div>
        <div className="mt-1 text-3xl font-black text-amber-900">{data?.prepare?.queue_number || "-"}</div>
        <div className="mt-1 truncate text-sm font-bold text-amber-800">{data?.prepare?.participant_name || "-"}</div>
      </div>

      <div className="mt-6 grid grid-cols-3 gap-3">
        <div className="rounded-2xl bg-slate-100 p-4 text-center"><div className="text-xs font-bold uppercase text-slate-500">Berikutnya</div><div className="mt-1 text-3xl font-black text-slate-950">{data?.next?.queue_number || "-"}</div><div className="mt-1 truncate text-xs font-bold text-slate-600">{data?.next?.participant_name || "-"}</div></div>
        <div className="rounded-2xl bg-slate-100 p-4 text-center"><div className="text-xs font-bold uppercase text-slate-500">Menunggu</div><div className="mt-1 text-3xl font-black text-slate-950">{data?.summary?.waiting ?? 0}</div></div>
        <div className="rounded-2xl bg-emerald-50 p-4 text-center"><div className="text-xs font-bold uppercase text-emerald-700">Selesai</div><div className="mt-1 text-3xl font-black text-emerald-700">{data?.summary?.done ?? 0}</div></div>
      </div>
    </section>
  );
}
