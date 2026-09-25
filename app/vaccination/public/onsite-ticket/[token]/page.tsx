"use client";

// V153.35_SAFE_WHATSAPP_PRIMARY_TICKET

import { useEffect, useRef, useState } from "react";

function statusLabel(value: any) {
  const status = String(value || "").toUpperCase();
  if (status === "CALLED" || status === "IN_PROGRESS") return "GILIRAN ANDA";
  if (status === "SKIPPED") return "TERSKIP";
  if (status === "DONE") return "SELESAI";
  return "MENUNGGU";
}

export default function VaccinationOnsiteTicketPage({
  params,
}: {
  params: { token: string };
}) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [calledModalOpen, setCalledModalOpen] = useState(false);
  const lastStatusRef = useRef("");

  async function load() {
    try {
      const json = await fetch(
        `/api/vaccination/onsite-queue/public?ticket_token=${encodeURIComponent(
          params.token
        )}&t=${Date.now()}`,
        { cache: "no-store" }
      ).then((r) => r.json());

      if (!json.ok) {
        setError(json.message || "Tiket antrean tidak ditemukan.");
        return null;
      }

      setData(json);
      setError("");

      const status = String(json?.entry?.queue_status || "").toUpperCase();
      const previous = lastStatusRef.current;

      if (
        ["CALLED", "IN_PROGRESS"].includes(status) &&
        !["CALLED", "IN_PROGRESS"].includes(previous)
      ) {
        if (typeof navigator !== "undefined" && "vibrate" in navigator) {
          try {
            navigator.vibrate([350, 150, 350]);
          } catch {}
        }
        setCalledModalOpen(true);
      }

      lastStatusRef.current = status;
      return json;
    } catch {
      setError("Gagal memperbarui posisi antrean.");
      return null;
    }
  }

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    const schedule = async () => {
      if (cancelled) return;
      const latest = await load();
      if (cancelled) return;

      const ahead = Number(latest?.ahead_count ?? 99);
      const status = String(
        latest?.entry?.queue_status || "WAITING"
      ).toUpperCase();

      const delay = ["CALLED", "IN_PROGRESS"].includes(status)
        ? 2500
        : ahead <= 5
          ? 3000
          : ahead <= 30
            ? 7000
            : 12000;

      timer = window.setTimeout(schedule, delay);
    };

    void schedule();

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [params.token]);

  const status = String(data?.entry?.queue_status || "WAITING").toUpperCase();
  const isCalled = ["CALLED", "IN_PROGRESS"].includes(status);
  const isSkipped = status === "SKIPPED";
  const isDone = status === "DONE";
  const aheadCount = Number(data?.ahead_count ?? 0);

  return (
    <main
      className={`min-h-screen px-4 py-8 ${
        isCalled
          ? "bg-emerald-50 text-emerald-950"
          : isSkipped
            ? "bg-amber-50 text-amber-950"
            : isDone
              ? "bg-slate-100 text-slate-950"
              : "bg-violet-50 text-slate-950"
      }`}
    >
      <div className="mx-auto max-w-xl rounded-3xl border border-slate-200 bg-white p-6 shadow-xl">
        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 font-bold text-red-700">
            {error}
          </div>
        ) : null}

        {data ? (
          <>
            <div className="text-center">
              <div className="text-xs font-black uppercase tracking-[0.3em] text-slate-500">
                Antrean Anda
              </div>
              <div
                className={`mt-4 text-7xl font-black leading-none drop-shadow-sm sm:text-8xl ${
                  isCalled
                    ? "text-emerald-700"
                    : isSkipped
                      ? "text-amber-700"
                      : isDone
                        ? "text-slate-700"
                        : "text-violet-700"
                }`}
              >
                {data.entry.queue_number}
              </div>
              <div className="mt-4 text-2xl font-black text-slate-900">
                {statusLabel(status)}
              </div>
              <div className="mt-2 text-sm font-semibold text-slate-600">
                {data.entry.participant_name}
              </div>
            </div>

            {isCalled ? (
              <div className="mt-6 rounded-3xl bg-emerald-600 p-6 text-center text-white shadow-xl">
                <div className="text-3xl font-black">
                  ANTREAN ANDA SUDAH DIPANGGIL
                </div>
                <div className="mt-2 text-lg font-bold">
                  Silakan menuju area vaksinasi sekarang.
                </div>
              </div>
            ) : null}

            {isSkipped ? (
              <div className="mt-6 rounded-3xl border border-amber-200 bg-amber-100 p-5 text-center text-amber-900">
                <div className="text-xl font-black">
                  Nomor Anda sempat ter-skip.
                </div>
                <div className="mt-2 text-sm font-semibold">
                  Datang ke petugas. Petugas dapat mengaktifkan kembali nomor lama Anda.
                </div>
              </div>
            ) : null}

            {!isCalled && !isSkipped && !isDone ? (
              <>
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-violet-100 bg-violet-50 p-4 text-center">
                    <div className="text-xs font-bold text-slate-500">
                      Sedang Dipanggil
                    </div>
                    <div className="mt-1 text-3xl font-black text-violet-700">
                      {data.event.current_queue_number || "-"}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-violet-100 bg-violet-50 p-4 text-center">
                    <div className="text-xs font-bold text-slate-500">
                      Antrean di Depan
                    </div>
                    <div className="mt-1 text-3xl font-black text-violet-700">
                      {aheadCount}
                    </div>
                  </div>
                </div>

                <div
                  className={`mt-4 rounded-2xl border p-4 ${
                    aheadCount === 1
                      ? "border-amber-300 bg-amber-50"
                      : "border-emerald-200 bg-emerald-50"
                  }`}
                >
                  <div
                    className={`text-sm font-black ${
                      aheadCount === 1 ? "text-amber-900" : "text-emerald-800"
                    }`}
                  >
                    {aheadCount === 1
                      ? "Tinggal 1 antrean lagi — mohon bersiap"
                      : "Pengingat WhatsApp otomatis"}
                  </div>
                  <p
                    className={`mt-1 text-xs font-semibold leading-relaxed ${
                      aheadCount === 1 ? "text-amber-800" : "text-emerald-700"
                    }`}
                  >
                    {aheadCount === 1
                      ? "Sistem mengirim pengingat WhatsApp ke nomor yang Anda daftarkan. Silakan mulai menuju area vaksinasi."
                      : "WhatsApp akan dikirim otomatis saat tinggal 1 antrean lagi sebelum giliran Anda."}
                  </p>
                </div>
              </>
            ) : null}

            <div className="mt-6 rounded-2xl border bg-slate-50 p-4 text-sm font-semibold text-slate-700">
              <div>{data.event.session_name}</div>
              <div>
                {[data.event.company_name, data.event.location]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            </div>

            <p className="mt-4 text-center text-xs text-slate-500">
              Tidak perlu mengaktifkan izin notifikasi browser. Halaman ini tetap dapat
              digunakan untuk memantau posisi antrean saat dibuka.
            </p>
          </>
        ) : null}
      </div>

      {calledModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 text-center shadow-2xl">
            <div className="text-sm font-black uppercase tracking-[0.25em] text-emerald-600">
              Peringatan
            </div>
            <div className="mt-3 text-3xl font-black text-slate-950">
              Antrean Anda Sudah Dipanggil
            </div>
            <div className="mt-4 text-6xl font-black text-emerald-700">
              {data?.entry?.queue_number || "-"}
            </div>
            <p className="mt-4 text-sm font-semibold text-slate-600">
              Silakan segera menuju area vaksinasi sekarang.
            </p>
            <button
              onClick={() => setCalledModalOpen(false)}
              className="mt-6 w-full rounded-xl bg-emerald-600 px-4 py-3 font-black text-white"
            >
              Tutup
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}
