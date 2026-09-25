"use client";

// V153.35_SAFE_WHATSAPP_PRIMARY_JOIN

import { FormEvent, useEffect, useState } from "react";

export default function VaccinationOnsiteQueueJoinPage({
  params,
}: {
  params: { token: string };
}) {
  const [event, setEvent] = useState<any>(null);
  const [joinToken, setJoinToken] = useState("");
  const [name, setName] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const slot = query.get("slot") || "";
    const sig = query.get("sig") || "";

    fetch(
      `/api/vaccination/onsite-queue/public?event_token=${encodeURIComponent(
        params.token
      )}&slot=${encodeURIComponent(slot)}&sig=${encodeURIComponent(sig)}&t=${Date.now()}`,
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
      .catch(() => setError("Gagal memvalidasi QR onsite."))
      .finally(() => setLoading(false));
  }, [params.token]);

  async function submit(e: FormEvent) {
    e.preventDefault();
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
        }),
      }).then((r) => r.json());

      if (!json.ok) {
        setError(json.message || "Gagal membuat antrean.");
        return;
      }

      const ticketToken = json?.entry?.public_token;
      if (!ticketToken) {
        setError("Tiket antrean tidak tersedia.");
        return;
      }

      window.location.href = `/vaccination/public/onsite-ticket/${encodeURIComponent(
        ticketToken
      )}`;
    } catch {
      setError("Gagal menghubungi server antrean.");
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

        {!loading && joinToken ? (
          <form
            onSubmit={submit}
            className="mt-6 space-y-4 rounded-3xl bg-white p-5 text-slate-950"
          >
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <div className="text-sm font-black text-emerald-800">
                Pengingat antrean via WhatsApp
              </div>
              <p className="mt-1 text-xs font-semibold leading-relaxed text-emerald-700">
                Tidak perlu mengaktifkan notifikasi browser. Sistem akan mengirim
                WhatsApp otomatis saat tinggal 1 antrean lagi sebelum giliran Anda.
              </p>
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
                No HP / WhatsApp
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
              <div className="mt-1 text-xs text-slate-500">
                Pastikan nomor ini aktif di WhatsApp agar pengingat antrean dapat diterima.
              </div>
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
          Simpan halaman tiket setelah registrasi untuk melihat posisi antrean secara live.
        </p>
      </div>
    </main>
  );
}
