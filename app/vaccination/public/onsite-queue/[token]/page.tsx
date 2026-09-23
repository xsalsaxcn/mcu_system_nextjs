"use client";

import { FormEvent, useEffect, useState } from "react";

export default function VaccinationOnsiteQueueJoinPage({ params }: { params: { token: string } }) {
  const [event, setEvent] = useState<any>(null);
  const [joinToken, setJoinToken] = useState("");
  const [name, setName] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [permissionState, setPermissionState] = useState<"checking" | "granted" | "required" | "blocked" | "unsupported">("checking");
  const [permissionMessage, setPermissionMessage] = useState("Sebelum mengisi form, izinkan notifikasi agar panggilan antrean bisa muncul di HP Anda.");
  const [permissionBusy, setPermissionBusy] = useState(false);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const slot = query.get("slot") || "";
    const sig = query.get("sig") || "";
    fetch(`/api/vaccination/onsite-queue/public?event_token=${encodeURIComponent(params.token)}&slot=${encodeURIComponent(slot)}&sig=${encodeURIComponent(sig)}&t=${Date.now()}`, { cache: "no-store" })
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
    if (typeof Notification === "undefined") {
      setPermissionState("unsupported");
      setPermissionMessage("Browser ini tidak mendukung Notification API. Gunakan browser lain agar panggilan antrean bisa muncul di notifikasi HP.");
      return;
    }
    if (Notification.permission === "granted") {
      setPermissionState("granted");
      setPermissionMessage("Notifikasi sudah diizinkan. Silakan isi form antrean.");
      return;
    }
    if (Notification.permission === "denied") {
      setPermissionState("blocked");
      setPermissionMessage("Notifikasi diblokir. Aktifkan kembali dari pengaturan browser lalu klik Cek Ulang.");
      return;
    }
    setPermissionState("required");
  }, []);

  async function requestPermission() {
    if (typeof Notification === "undefined") return;
    setPermissionBusy(true);
    setError("");
    try {
      const result = await Notification.requestPermission();
      if (result === "granted") {
        setPermissionState("granted");
        setPermissionMessage("Notifikasi sudah diizinkan. Silakan isi form antrean.");
        if (typeof navigator !== "undefined" && "vibrate" in navigator) {
          try { navigator.vibrate([100, 60, 100]); } catch {}
        }
      } else if (result === "denied") {
        setPermissionState("blocked");
        setPermissionMessage("Notifikasi diblokir. Aktifkan kembali dari pengaturan browser lalu klik Cek Ulang.");
      } else {
        setPermissionState("required");
        setPermissionMessage("Anda belum mengizinkan notifikasi. Klik tombol izinkan notifikasi untuk melanjutkan.");
      }
    } finally {
      setPermissionBusy(false);
    }
  }

  function checkPermissionAgain() {
    if (typeof Notification === "undefined") {
      setPermissionState("unsupported");
      return;
    }
    if (Notification.permission === "granted") {
      setPermissionState("granted");
      setPermissionMessage("Notifikasi sudah diizinkan. Silakan isi form antrean.");
    } else if (Notification.permission === "denied") {
      setPermissionState("blocked");
      setPermissionMessage("Notifikasi diblokir. Aktifkan kembali dari pengaturan browser lalu klik Cek Ulang.");
    } else {
      setPermissionState("required");
      setPermissionMessage("Klik izinkan notifikasi terlebih dahulu untuk membuka form antrean.");
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (permissionState !== "granted") {
      setError("Izinkan notifikasi terlebih dahulu sebelum mengisi antrean.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const json = await fetch("/api/vaccination/onsite-queue/public", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventToken: params.token, joinToken, participantName: name, employeeId, phone }),
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
          <div className="text-xs font-black uppercase tracking-[0.3em] text-violet-300">Onsite Queue</div>
          <h1 className="mt-3 text-3xl font-black">{event?.session_name || "Antrian Vaksinasi"}</h1>
          <p className="mt-2 text-sm font-semibold text-slate-300">{[event?.company_name, event?.location].filter(Boolean).join(" · ")}</p>
        </div>

        {loading ? <div className="mt-6 rounded-2xl bg-white/10 p-5 text-center font-bold">Memvalidasi QR onsite...</div> : null}
        {error ? <div className="mt-6 rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-sm font-bold text-red-200">{error}</div> : null}

        {!loading && joinToken && permissionState !== "granted" ? (
          <div className="mt-6 rounded-3xl bg-white p-5 text-slate-950">
            <div className="text-lg font-black text-slate-950">Aktifkan notifikasi terlebih dahulu</div>
            <p className="mt-2 text-sm font-semibold text-slate-600">{permissionMessage}</p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <button disabled={permissionBusy || permissionState === "unsupported"} onClick={requestPermission} className="rounded-xl bg-violet-600 px-4 py-3 font-black text-white disabled:opacity-50">
                {permissionBusy ? "Meminta izin..." : "Izinkan Notifikasi"}
              </button>
              <button onClick={checkPermissionAgain} className="rounded-xl border border-slate-300 px-4 py-3 font-black text-slate-700">Cek Ulang</button>
            </div>
            <p className="mt-3 text-xs text-slate-500">Form antrean dibuka setelah notifikasi diizinkan. Setelah submit, halaman tiket akan otomatis melanjutkan aktivasi notifikasi background.</p>
          </div>
        ) : null}

        {!loading && joinToken && permissionState === "granted" ? (
          <form onSubmit={submit} className="mt-6 space-y-4 rounded-3xl bg-white p-5 text-slate-950">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-bold text-emerald-700">Notifikasi sudah diizinkan. Silakan isi form antrean.</div>
            <div>
              <label className="text-xs font-black uppercase tracking-wide text-slate-500">Nama Lengkap</label>
              <input required value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full rounded-xl border px-3 py-3 font-semibold" placeholder="Nama lengkap" />
            </div>
            <div>
              <label className="text-xs font-black uppercase tracking-wide text-slate-500">NIK Karyawan</label>
              <input required value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="mt-1 w-full rounded-xl border px-3 py-3 font-semibold" placeholder="NIK Karyawan" />
              <div className="mt-1 text-xs text-slate-500">1 NIK Karyawan hanya mendapat 1 nomor antrean pada event ini.</div>
            </div>
            <div>
              <label className="text-xs font-black uppercase tracking-wide text-slate-500">No HP</label>
              <input required type="tel" inputMode="numeric" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 15))} className="mt-1 w-full rounded-xl border px-3 py-3 font-semibold" placeholder="08xxxxxxxxxx" />
              <div className="mt-1 text-xs text-slate-500">Nomor HP dipakai sebagai kontak peserta onsite.</div>
            </div>
            <button disabled={submitting} className="w-full rounded-xl bg-violet-600 px-4 py-3 font-black text-white disabled:opacity-50">{submitting ? "Membuat antrean..." : "Ambil Nomor Antrean"}</button>
          </form>
        ) : null}

        <p className="mt-5 text-center text-xs text-slate-400">Tidak ada scan kedua. Setelah mendapat nomor, sistem akan menyiapkan notifikasi background di halaman tiket agar panggilan tetap bisa masuk ke HP Anda.</p>
      </div>
    </main>
  );
}
