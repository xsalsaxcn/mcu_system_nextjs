"use client";

// V153.32_SAFE_FULL_APPROVAL_BEFORE_FORM

import { FormEvent, useEffect, useState } from "react";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((character) => character.charCodeAt(0)));
}

export default function VaccinationOnsiteQueueJoinPage({ params }: { params: { token: string } }) {
  const [event, setEvent] = useState<any>(null);
  const [joinToken, setJoinToken] = useState("");
  const [name, setName] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [approvalState, setApprovalState] = useState<
    "checking" | "required" | "activating" | "ready" | "blocked" | "unsupported" | "server-error"
  >("checking");
  const [approvalMessage, setApprovalMessage] = useState(
    "Aktifkan seluruh izin notifikasi terlebih dahulu sebelum mengisi form antrean."
  );
  const [preparedSubscription, setPreparedSubscription] = useState<any>(null);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const slot = query.get("slot") || "";
    const sig = query.get("sig") || "";

    fetch(
      `/api/vaccination/onsite-queue/public?event_token=${encodeURIComponent(params.token)}&slot=${encodeURIComponent(slot)}&sig=${encodeURIComponent(sig)}&t=${Date.now()}`,
      { cache: "no-store" }
    )
      .then((r) => r.json())
      .then((json) => {
        if (!json.ok) {
          setError(json.message || "QR tidak valid.");
          return;
        }
        setEvent(json.event);
        setJoinToken(json.join_token || "");
      })
      .finally(() => setLoading(false));
  }, [params.token]);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof Notification === "undefined" ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window)
    ) {
      setApprovalState("unsupported");
      setApprovalMessage(
        "Browser ini belum mendukung notifikasi background yang dibutuhkan sistem antrean. Gunakan browser modern yang mendukung Web Push."
      );
      return;
    }

    if (Notification.permission === "denied") {
      setApprovalState("blocked");
      setApprovalMessage(
        "Notifikasi sedang diblokir. Aktifkan izin notifikasi untuk situs ini dari pengaturan browser, lalu klik Cek Ulang."
      );
      return;
    }

    setApprovalState("required");
  }, []);

  async function playApprovalTone() {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      if (ctx.state === "suspended") await ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.value = 0.08;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.18);
      window.setTimeout(() => {
        try { void ctx.close(); } catch {}
      }, 350);
    } catch {}
  }

  async function activateFullApproval() {
    if (
      typeof window === "undefined" ||
      typeof Notification === "undefined" ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window)
    ) {
      setApprovalState("unsupported");
      return;
    }

    setApprovalState("activating");
    setError("");
    setApprovalMessage("Menyiapkan izin notifikasi, service worker, dan background push...");

    try {
      const config = await fetch(`/api/vaccination/onsite-queue/push?t=${Date.now()}`, {
        cache: "no-store",
      }).then((r) => r.json());

      if (!config.ok || !config.configured || !config.publicKey) {
        setApprovalState("server-error");
        setApprovalMessage(
          config.message ||
            "Background Web Push server belum dikonfigurasi. Hubungi petugas."
        );
        return;
      }

      let permission = Notification.permission;
      if (permission !== "granted") {
        permission = await Notification.requestPermission();
      }

      if (permission !== "granted") {
        if (permission === "denied") {
          setApprovalState("blocked");
          setApprovalMessage(
            "Notifikasi diblokir. Aktifkan izin notifikasi untuk situs ini dari pengaturan browser lalu klik Cek Ulang."
          );
        } else {
          setApprovalState("required");
          setApprovalMessage(
            "Notifikasi belum diizinkan. Klik Aktifkan Notifikasi untuk mencoba lagi."
          );
        }
        return;
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

      const subscriptionJson = subscription.toJSON();
      if (
        !subscriptionJson?.endpoint ||
        !subscriptionJson?.keys?.p256dh ||
        !subscriptionJson?.keys?.auth
      ) {
        throw new Error("Push subscription tidak lengkap.");
      }

      setPreparedSubscription(subscriptionJson);

      // Preflight notification: confirms permission + service worker before form opens.
      try {
        await registration.showNotification(
          "Notifikasi Antrean Aktif",
          {
            body: "Notifikasi berhasil diaktifkan. Anda boleh melanjutkan pengisian antrean.",
            tag: "vaccination-onsite-preflight",
            requireInteraction: false,
            silent: false,
            vibrate: [180, 80, 180],
          } as any
        );
      } catch {}

      if ("vibrate" in navigator) {
        try { navigator.vibrate([120, 70, 120]); } catch {}
      }
      await playApprovalTone();

      setApprovalState("ready");
      setApprovalMessage(
        "Semua izin sudah aktif: notifikasi, service worker, dan background push siap. Silakan isi form."
      );
    } catch (approvalError: any) {
      setApprovalState("server-error");
      setApprovalMessage(
        approvalError?.message || "Gagal menyiapkan notifikasi background."
      );
    }
  }

  function checkAgain() {
    if (
      typeof Notification === "undefined" ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window)
    ) {
      setApprovalState("unsupported");
      return;
    }

    if (Notification.permission === "denied") {
      setApprovalState("blocked");
      setApprovalMessage(
        "Notifikasi masih diblokir. Aktifkan dari pengaturan browser terlebih dahulu."
      );
      return;
    }

    setApprovalState("required");
    setApprovalMessage(
      "Klik Aktifkan Notifikasi untuk menyiapkan seluruh approval sebelum form dibuka."
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();

    if (approvalState !== "ready" || !preparedSubscription) {
      setError("Aktifkan seluruh approval notifikasi terlebih dahulu.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const json = await fetch("/api/vaccination/onsite-queue/public", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventToken: params.token,
          joinToken,
          participantName: name,
          employeeId,
          phone,
          pushSubscription: preparedSubscription,
        }),
      }).then((r) => r.json());

      if (!json.ok) {
        setError(json.message || "Gagal membuat antrean.");
        return;
      }

      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        try { navigator.vibrate(120); } catch {}
      }

      const ticketToken = json?.entry?.public_token;
      if (!ticketToken) {
        setError("Tiket antrean tidak tersedia.");
        return;
      }

      window.location.href = `/vaccination/public/onsite-ticket/${encodeURIComponent(ticketToken)}`;
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-white">
      <div className="mx-auto max-w-lg rounded-3xl border border-white/15 bg-slate-900 p-6 shadow-2xl">
        <div className="text-center">
          <div className="text-xs font-black uppercase tracking-[0.3em] text-violet-300">
            Onsite Queue
          </div>
          <h1 className="mt-3 text-3xl font-black">
            {event?.session_name || "Antrian Vaksinasi"}
          </h1>
          <p className="mt-2 text-sm font-semibold text-slate-300">
            {[event?.company_name, event?.location].filter(Boolean).join(" · ")}
          </p>
        </div>

        {loading ? (
          <div className="mt-6 rounded-2xl bg-white/10 p-5 text-center font-bold">
            Memvalidasi QR onsite...
          </div>
        ) : null}

        {error ? (
          <div className="mt-6 rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-sm font-bold text-red-200">
            {error}
          </div>
        ) : null}

        {!loading && joinToken && approvalState !== "ready" ? (
          <div className="mt-6 rounded-3xl bg-white p-5 text-slate-950">
            <div className="text-lg font-black">Aktifkan Notifikasi Sebelum Registrasi</div>
            <p className="mt-2 text-sm font-semibold text-slate-600">
              {approvalMessage}
            </p>

            <div className="mt-4 space-y-2 rounded-2xl bg-slate-50 p-4 text-xs font-bold text-slate-700">
              <div>✓ Izin Notification browser</div>
              <div>✓ Service Worker background</div>
              <div>✓ Push subscription device</div>
              <div>✓ Test notifikasi + getar/suara sesuai dukungan perangkat</div>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <button
                disabled={approvalState === "activating" || approvalState === "unsupported"}
                onClick={activateFullApproval}
                className="rounded-xl bg-violet-600 px-4 py-3 font-black text-white disabled:opacity-50"
              >
                {approvalState === "activating"
                  ? "Mengaktifkan..."
                  : "Aktifkan Notifikasi"}
              </button>

              <button
                onClick={checkAgain}
                className="rounded-xl border border-slate-300 px-4 py-3 font-black text-slate-700"
              >
                Cek Ulang
              </button>
            </div>

            <p className="mt-3 text-xs text-slate-500">
              Form baru akan dibuka setelah seluruh approval di atas berhasil.
            </p>
          </div>
        ) : null}

        {!loading && joinToken && approvalState === "ready" ? (
          <form
            onSubmit={submit}
            className="mt-6 space-y-4 rounded-3xl bg-white p-5 text-slate-950"
          >
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-bold text-emerald-700">
              Notifikasi background sudah siap. Silakan isi form antrean.
            </div>

            <div>
              <label className="text-xs font-black uppercase tracking-wide text-slate-500">
                Nama Lengkap
              </label>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded-xl border px-3 py-3 font-semibold"
                placeholder="Nama lengkap"
              />
            </div>

            <div>
              <label className="text-xs font-black uppercase tracking-wide text-slate-500">
                NIK Karyawan
              </label>
              <input
                required
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                className="mt-1 w-full rounded-xl border px-3 py-3 font-semibold"
                placeholder="NIK Karyawan"
              />
              <div className="mt-1 text-xs text-slate-500">
                1 NIK Karyawan hanya mendapat 1 nomor antrean pada event ini.
              </div>
            </div>

            <div>
              <label className="text-xs font-black uppercase tracking-wide text-slate-500">
                No HP
              </label>
              <input
                required
                type="tel"
                inputMode="numeric"
                value={phone}
                onChange={(e) =>
                  setPhone(e.target.value.replace(/\D/g, "").slice(0, 15))
                }
                className="mt-1 w-full rounded-xl border px-3 py-3 font-semibold"
                placeholder="08xxxxxxxxxx"
              />
            </div>

            <button
              disabled={submitting}
              className="w-full rounded-xl bg-violet-600 px-4 py-3 font-black text-white disabled:opacity-50"
            >
              {submitting ? "Membuat antrean..." : "Ambil Nomor Antrean"}
            </button>
          </form>
        ) : null}

        <p className="mt-5 text-center text-xs text-slate-400">
          Notifikasi background disiapkan sebelum form dibuka. Setelah mendapat nomor,
          peserta tidak perlu mengaktifkan approval dari awal lagi.
        </p>
      </div>
    </main>
  );
}
