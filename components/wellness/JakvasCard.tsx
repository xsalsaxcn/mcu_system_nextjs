"use client";

import { useEffect, useMemo, useState } from "react";

// WELLNESS_JAKVAS_REPORT_V1_UI
// New isolated report card. It does not write or recalculate Wellness streak,
// point, target, Google Fit, Health Connect, or participant-control data.

type PortalMode = "participant" | "coach" | "admin";

type JakvasCardProps = {
  portal: PortalMode;
  participantId?: number | string | null;
  editable?: boolean;
};

function clean(value: any) {
  return String(value ?? "").trim();
}

function endpointFor(portal: PortalMode, participantId?: number | string | null) {
  if (portal === "participant") return "/api/wellness/participant/jakvas";
  const id = Number(participantId || 0);
  if (!(id > 0)) return "";
  return `/api/wellness/${portal}/jakvas?participant_id=${encodeURIComponent(String(id))}`;
}

function pointsLabel(value: any) {
  if (value === null || value === undefined || value === "") return "-";
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  return number > 0 ? `+${number}` : String(number);
}

function missingLabel(key: string) {
  const labels: Record<string, string> = {
    gender: "Jenis kelamin",
    age: "Umur",
    blood_pressure: "Tekanan darah",
    bmi: "BMI / IMT",
    smoking: "Status merokok",
    diabetes: "Status diabetes",
    physical_activity: "Aktivitas fisik",
    prior_cvd: "Riwayat penyakit kardiovaskular",
  };
  return labels[key] || key;
}

function riskTone(category: string | null) {
  if (category === "low") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (category === "moderate") return "border-amber-200 bg-amber-50 text-amber-900";
  if (category === "high") return "border-rose-200 bg-rose-50 text-rose-800";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function sourceDate(value: any) {
  const text = clean(value);
  if (!text) return "-";
  const iso = text.slice(0, 10);
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : text;
}

export default function JakvasCard({ portal, participantId, editable = false }: JakvasCardProps) {
  const endpoint = useMemo(() => endpointFor(portal, participantId), [portal, participantId]);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState({
    smoking_status: "",
    diabetes_status: "",
    prior_cvd: "",
    physical_activity_category: "",
  });

  async function load() {
    if (!endpoint) return;
    setLoading(true);
    setError("");
    const result = await fetch(endpoint, {
      cache: "no-store",
      credentials: "include",
    })
      .then(async (response) => ({
        ...(await response.json().catch(() => ({}))),
        http_status: response.status,
      }))
      .catch((fetchError) => ({
        ok: false,
        message: fetchError?.message || "Network error",
      }));

    if (result?.ok && result?.jakvas) {
      setData(result.jakvas);
      const profile = result.jakvas.profile || {};
      setForm({
        smoking_status: clean(profile.smoking_status),
        diabetes_status:
          profile.diabetes_status === true
            ? "yes"
            : profile.diabetes_status === false
              ? "no"
              : "",
        prior_cvd:
          profile.prior_cvd === true
            ? "yes"
            : profile.prior_cvd === false
              ? "no"
              : "",
        physical_activity_category: clean(profile.physical_activity_category),
      });
    } else {
      setError(result?.message || "Laporan JAKVAS belum dapat dimuat.");
    }
    setLoading(false);
  }

  useEffect(() => {
    setData(null);
    setError("");
    setNotice("");
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint]);

  async function saveProfile() {
    if (portal !== "participant" || !editable) return;
    if (!form.smoking_status || !form.diabetes_status || !form.prior_cvd || !form.physical_activity_category) {
      setNotice("Lengkapi seluruh pertanyaan JAKVAS terlebih dahulu.");
      return;
    }

    setSaving(true);
    setNotice("");
    const result = await fetch("/api/wellness/participant/jakvas", {
      method: "PUT",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        smoking_status: form.smoking_status,
        diabetes_status: form.diabetes_status === "yes",
        prior_cvd: form.prior_cvd === "yes",
        physical_activity_category: form.physical_activity_category,
      }),
    })
      .then(async (response) => ({
        ...(await response.json().catch(() => ({}))),
        http_status: response.status,
      }))
      .catch((saveError) => ({ ok: false, message: saveError?.message || "Network error" }));

    if (result?.ok && result?.jakvas) {
      setData(result.jakvas);
      setNotice(result?.message || "Data JAKVAS berhasil disimpan.");
      setFormOpen(false);
    } else {
      setNotice(result?.message || "Data JAKVAS gagal disimpan.");
    }
    setSaving(false);
  }

  if (!endpoint) return null;

  return (
    <section className="rounded-[1.8rem] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.14em] text-rose-600">
            Laporan Risiko Kardiovaskular
          </div>
          <h3 className="mt-1 text-lg font-black text-slate-950">
            JAKVAS — Jakarta Cardiovascular Score
          </h3>
          <p className="mt-1 max-w-2xl text-xs font-bold leading-5 text-slate-500">
            Estimasi risiko kardiovaskular 10 tahun untuk usia 25–64 tahun yang belum pernah menderita penyakit kardiovaskular.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="self-start rounded-full border border-slate-200 bg-white px-3 py-2 text-[10px] font-black text-slate-600 disabled:opacity-50"
        >
          {loading ? "Memuat..." : "Refresh JAKVAS"}
        </button>
      </div>

      {loading && !data ? (
        <div className="mt-4 rounded-2xl bg-slate-50 p-5 text-center text-xs font-bold text-slate-400">
          Mengambil data JAKVAS...
        </div>
      ) : error ? (
        <div className="mt-4 rounded-2xl bg-rose-50 p-4 text-xs font-bold leading-5 text-rose-700">
          {error}
        </div>
      ) : data ? (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1.25fr]">
            <div className={`rounded-2xl border p-4 ${riskTone(data.risk_category)}`}>
              <div className="text-[9px] font-black uppercase tracking-[0.12em] opacity-70">Total Skor</div>
              <div className="mt-1 text-3xl font-black">
                {data.total_score === null || data.total_score === undefined ? "-" : data.total_score}
              </div>
              <div className="mt-2 text-sm font-black">{data.risk_label || "Belum dapat dihitung"}</div>
              <div className="mt-1 text-xs font-bold opacity-80">
                Risiko 10 tahun: {data.risk_10y_label || "-"}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">Interpretasi</div>
              <div className="mt-2 text-sm font-black leading-6 text-slate-800">
                {data.recommendation || "-"}
              </div>
              {Array.isArray(data.missing_fields) && data.missing_fields.length ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {data.missing_fields.map((key: string) => (
                    <span key={key} className="rounded-full bg-white px-2.5 py-1 text-[9px] font-black text-slate-500 ring-1 ring-slate-200">
                      Belum ada: {missingLabel(key)}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
            <div className="grid grid-cols-[1.25fr_1.4fr_.45fr] bg-slate-50 px-3 py-2 text-[9px] font-black uppercase tracking-wide text-slate-400">
              <div>Komponen</div>
              <div>Nilai</div>
              <div className="text-right">Poin</div>
            </div>
            {(data.components || []).map((item: any) => (
              <div key={item.key} className="grid grid-cols-[1.25fr_1.4fr_.45fr] border-t border-slate-100 px-3 py-3 text-xs">
                <div className="font-black text-slate-700">{item.label}</div>
                <div className="pr-2 font-bold text-slate-500">
                  {item.value || "Belum tersedia"}
                  {item.note ? <div className="mt-1 text-[9px] font-semibold leading-4 text-slate-400">{item.note}</div> : null}
                </div>
                <div className="text-right font-black text-slate-900">{pointsLabel(item.points)}</div>
              </div>
            ))}
          </div>

          <div className="mt-3 grid gap-2 text-[10px] font-bold text-slate-500 sm:grid-cols-3">
            <div className="rounded-xl bg-slate-50 px-3 py-2">TD terakhir: {sourceDate(data?.sources?.blood_pressure_date)}</div>
            <div className="rounded-xl bg-slate-50 px-3 py-2">BMI terakhir: {sourceDate(data?.sources?.bmi_date)}</div>
            <div className="rounded-xl bg-slate-50 px-3 py-2">Self-report: {sourceDate(data?.sources?.self_report_updated_at)}</div>
          </div>

          {!data.profile_storage_ready ? (
            <div className="mt-3 rounded-2xl bg-amber-50 p-3 text-xs font-bold leading-5 text-amber-800">
              Tabel profil JAKVAS belum aktif. Jalankan SQL JAKVAS satu kali di Supabase sebelum menyimpan self-report.
            </div>
          ) : null}

          {portal === "participant" && editable ? (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-black text-slate-900">Data Pendukung JAKVAS</div>
                  <div className="mt-1 text-[10px] font-bold leading-5 text-slate-500">
                    Jawab berdasarkan kondisi Anda. Untuk diabetes dan riwayat kardiovaskular, pilih Ya bila pernah didiagnosis tenaga medis.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setFormOpen((value) => !value)}
                  className="shrink-0 rounded-full bg-slate-900 px-3 py-2 text-[10px] font-black text-white"
                >
                  {formOpen ? "Tutup" : "Lengkapi / Ubah"}
                </button>
              </div>

              {formOpen ? (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1.5 text-xs font-black text-slate-700">
                    Kebiasaan merokok
                    <select
                      value={form.smoking_status}
                      onChange={(event) => setForm((previous) => ({ ...previous, smoking_status: event.target.value }))}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold outline-none focus:border-teal-400"
                    >
                      <option value="">Pilih</option>
                      <option value="never">Tidak merokok</option>
                      <option value="former">Bekas perokok</option>
                      <option value="current">Perokok aktif</option>
                    </select>
                  </label>

                  <label className="grid gap-1.5 text-xs font-black text-slate-700">
                    Pernah didiagnosis Diabetes Melitus?
                    <select
                      value={form.diabetes_status}
                      onChange={(event) => setForm((previous) => ({ ...previous, diabetes_status: event.target.value }))}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold outline-none focus:border-teal-400"
                    >
                      <option value="">Pilih</option>
                      <option value="no">Tidak</option>
                      <option value="yes">Ya</option>
                    </select>
                  </label>

                  <label className="grid gap-1.5 text-xs font-black text-slate-700">
                    Pernah didiagnosis penyakit kardiovaskular?
                    <select
                      value={form.prior_cvd}
                      onChange={(event) => setForm((previous) => ({ ...previous, prior_cvd: event.target.value }))}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold outline-none focus:border-teal-400"
                    >
                      <option value="">Pilih</option>
                      <option value="no">Tidak</option>
                      <option value="yes">Ya</option>
                    </select>
                  </label>

                  <label className="grid gap-1.5 text-xs font-black text-slate-700">
                    Aktivitas fisik ≥30 menit/hari
                    <select
                      value={form.physical_activity_category}
                      onChange={(event) => setForm((previous) => ({ ...previous, physical_activity_category: event.target.value }))}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold outline-none focus:border-teal-400"
                    >
                      <option value="">Pilih</option>
                      <option value="heavy">Berat — &gt;3 kali/minggu</option>
                      <option value="moderate">Sedang — 2–3 kali/minggu</option>
                      <option value="light">Ringan — 1 kali/minggu</option>
                      <option value="none">Tidak ada</option>
                    </select>
                  </label>

                  <div className="sm:col-span-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-[10px] font-bold text-slate-500">
                      Data ini hanya untuk kalkulasi JAKVAS dan tidak mengubah streak, point, atau data Google Fit/Health Connect.
                    </div>
                    <button
                      type="button"
                      onClick={() => void saveProfile()}
                      disabled={saving || !data.profile_storage_ready}
                      className="rounded-xl bg-teal-700 px-4 py-3 text-xs font-black text-white disabled:bg-slate-300"
                    >
                      {saving ? "Menyimpan..." : "Simpan Data JAKVAS"}
                    </button>
                  </div>
                </div>
              ) : null}

              {notice ? (
                <div className="mt-3 rounded-xl bg-white px-3 py-2 text-xs font-bold text-slate-600 ring-1 ring-slate-200">
                  {notice}
                </div>
              ) : null}
            </div>
          ) : null}

          <p className="mt-3 text-[9px] font-semibold leading-4 text-slate-400">
            JAKVAS merupakan alat estimasi risiko, bukan diagnosis. Nilai klinis dibaca dari canonical clinical history Wellness; status merokok, diabetes, riwayat kardiovaskular, dan aktivitas fisik berasal dari self-report JAKVAS.
          </p>
        </>
      ) : null}
    </section>
  );
}
