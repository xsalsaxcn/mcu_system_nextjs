"use client";

import { useEffect, useMemo, useState } from "react";

// WELLNESS_COMPANY_PORTAL_PLACEHOLDER_V430
// MVP sementara.
// Nanti akses akan difilter by perusahaan dari server.

function clean(value: any) {
  return String(value ?? "").trim();
}

function fmtNumber(value: any) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0";
  return new Intl.NumberFormat("id-ID").format(n);
}

export default function WellnessCompanyPortalPage() {
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("Memuat portal perusahaan...");
  const [participants, setParticipants] = useState<any[]>([]);

  async function load() {
    setLoading(true);

    const result = await fetch("/api/wellness/dashboard", {
      cache: "no-store",
    })
      .then((response) => response.json())
      .catch((error) => ({
        ok: false,
        message: error?.message || "Network error",
      }));

    if (result.ok) {
      const rows =
        result.participants ||
        result.data?.participants ||
        result.rows ||
        result.data ||
        [];

      setParticipants(Array.isArray(rows) ? rows : []);
      setMessage(
        "Portal Perusahaan MVP aktif. Saat ini masih membaca dashboard umum; tahap berikutnya difilter by perusahaan."
      );
    } else {
      setMessage(result.message || "Gagal memuat data perusahaan.");
    }

    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const summary = useMemo(() => {
    const total = participants.length;

    const companies = new Set(
      participants
        .map((item) =>
          clean(
            item?.company_name ||
              item?.main_entity_name ||
              item?.company ||
              item?.client_name
          )
        )
        .filter(Boolean)
    );

    const groups = new Set(
      participants
        .map((item) =>
          clean(item?.group_name || item?.kelompok_name || item?.department)
        )
        .filter(Boolean)
    );

    return {
      total,
      companies: companies.size,
      groups: groups.size,
    };
  }, [participants]);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900 md:px-8">
      <section className="mx-auto max-w-6xl">
        <div className="overflow-hidden rounded-[2rem] bg-gradient-to-r from-blue-800 via-indigo-700 to-slate-900 p-6 text-white shadow-xl shadow-blue-100 md:p-8">
          <div className="text-xs font-black uppercase tracking-[0.2em] text-white/70">
            Harmony Health
          </div>

          <h1 className="mt-3 text-3xl font-black md:text-4xl">
            Portal Perusahaan
          </h1>

          <p className="mt-3 max-w-3xl text-sm font-bold leading-6 text-white/90">
            Untuk HR / PIC perusahaan memantau progress karyawan dalam program wellness.
          </p>
        </div>

        <div className="mt-5 rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
          <div
            className={`rounded-2xl px-4 py-3 text-sm font-bold leading-6 ${
              loading ? "bg-amber-50 text-amber-900" : "bg-blue-50 text-blue-900"
            }`}
          >
            {message}
          </div>
        </div>

        <section className="mt-6 grid gap-4 md:grid-cols-3">
          <StatCard label="Total Karyawan" value={fmtNumber(summary.total)} />
          <StatCard label="Perusahaan" value={fmtNumber(summary.companies)} />
          <StatCard label="Group / Divisi" value={fmtNumber(summary.groups)} />
        </section>

        <section className="mt-6 rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-black">Daftar Karyawan</h2>
              <p className="mt-1 text-xs font-bold text-slate-400">
                Preview awal. Nanti hanya menampilkan karyawan perusahaan terkait.
              </p>
            </div>

            <button
              type="button"
              onClick={load}
              className="rounded-full bg-slate-100 px-4 py-2 text-xs font-black text-slate-700"
            >
              Refresh
            </button>
          </div>

          <div className="mt-5 grid gap-3">
            {participants.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm font-bold text-slate-400">
                Belum ada data karyawan yang bisa ditampilkan.
              </div>
            ) : (
              participants.slice(0, 30).map((item, index) => (
                <div
                  key={`${item?.id || item?.participant_id || index}-${index}`}
                  className="rounded-3xl border border-slate-100 bg-slate-50 p-4"
                >
                  <div className="text-sm font-black text-slate-900">
                    {clean(item?.name || item?.participant_name || item?.full_name) ||
                      `Karyawan ${index + 1}`}
                  </div>

                  <div className="mt-1 text-xs font-bold leading-5 text-slate-500">
                    Kode: {clean(item?.code || item?.employee_code || item?.nik) || "-"} ·
                    Perusahaan:{" "}
                    {clean(
                      item?.company_name ||
                        item?.main_entity_name ||
                        item?.company ||
                        item?.client_name
                    ) || "-"}{" "}
                    · Group:{" "}
                    {clean(item?.group_name || item?.kelompok_name || item?.department) || "-"}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </section>
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-xs font-black uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className="mt-2 text-2xl font-black text-slate-950">{value}</div>
    </div>
  );
}