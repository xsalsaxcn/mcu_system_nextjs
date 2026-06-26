"use client";

import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import AuthGate from "@/components/AuthGate";

// WELLNESS_INPUT_PRO_SELECTOR_V359

const MEAL_TIMES = ["Sarapan", "Makan Siang", "Makan Malam", "Cemilan"];

function clean(value: any) {
  return String(value ?? "").trim();
}

function uniqueOptions(items: any[], key: string) {
  const map = new Map<string, string>();
  for (const item of items || []) {
    const value = clean(item?.[key]);
    if (value && value !== "-") map.set(value, value);
  }
  return Array.from(map.values()).sort((a, b) => a.localeCompare(b));
}

function participantName(participant: any) {
  return clean(participant?.participant_display_name) || clean(participant?.name) || `Peserta #${participant?.id || "-"}`;
}

function participantLabel(participant: any) {
  const code = clean(participant?.code);
  const name = participantName(participant);
  const risk = clean(participant?.risk_cluster || participant?.baseline_risk_group);
  const scope = clean(participant?.scope_text);
  const parts = [`${code ? `${code} - ` : ""}${name}`];
  if (risk) parts.push(risk);
  if (scope) parts.push(scope);
  return parts.join(" | ");
}

function matchesSearch(participant: any, query: string) {
  const q = clean(query).toLowerCase();
  if (!q) return true;
  const haystack = [
    participant?.code,
    participant?.name,
    participant?.participant_display_name,
    participant?.risk_cluster,
    participant?.baseline_risk_group,
    participant?.company_name,
    participant?.kelompok_name,
    participant?.group_unit_name,
    participant?.old_group_name,
    participant?.scope_text,
  ].map(clean).join(" ").toLowerCase();
  return haystack.includes(q);
}

function InfoPill({ label, value, tone = "slate" }: { label: string; value: any; tone?: "slate" | "blue" | "emerald" | "amber" | "rose" | "purple" }) {
  const toneClass = {
    slate: "border-slate-200 bg-slate-50 text-slate-700",
    blue: "border-blue-100 bg-blue-50 text-blue-700",
    emerald: "border-emerald-100 bg-emerald-50 text-emerald-700",
    amber: "border-amber-100 bg-amber-50 text-amber-800",
    rose: "border-rose-100 bg-rose-50 text-rose-700",
    purple: "border-purple-100 bg-purple-50 text-purple-700",
  }[tone];
  return (
    <div className={`rounded-2xl border px-4 py-3 ${toneClass}`}>
      <div className="text-[10px] font-black uppercase tracking-wide opacity-60">{label}</div>
      <div className="mt-1 truncate text-sm font-black">{clean(value) || "-"}</div>
    </div>
  );
}

export default function WellnessInputPage() {
  return <AuthGate>{() => <WellnessInput />}</AuthGate>;
}

function WellnessInput() {
  const [participants, setParticipants] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [kelompokFilter, setKelompokFilter] = useState("");
  const [groupFilter, setGroupFilter] = useState("");
  const [form, setForm] = useState<any>({
    log_date: new Date().toISOString().slice(0, 10),
    meal_time: "Sarapan",
  });

  async function load() {
    setLoading(true);
    const [participantJson, activityJson] = await Promise.all([
      fetch("/api/wellness/participants", { cache: "no-store" }).then((r) => r.json()).catch(() => ({})),
      fetch("/api/wellness/reference/activities", { cache: "no-store" }).then((r) => r.json()).catch(() => ({})),
    ]);
    const list = participantJson.participants || [];
    setParticipants(list);
    setActivities(activityJson.activities || []);
    setForm((previous: any) => previous.participant_id || !list.length ? previous : { ...previous, participant_id: list[0].id });
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const companyOptions = useMemo(() => uniqueOptions(participants, "company_name"), [participants]);
  const kelompokOptions = useMemo(() => uniqueOptions(participants.filter((p) => !companyFilter || clean(p.company_name) === companyFilter), "kelompok_name"), [participants, companyFilter]);
  const groupOptions = useMemo(() => uniqueOptions(participants.filter((p) => (!companyFilter || clean(p.company_name) === companyFilter) && (!kelompokFilter || clean(p.kelompok_name) === kelompokFilter)), "group_unit_name"), [participants, companyFilter, kelompokFilter]);

  const filteredParticipants = useMemo(() => {
    return participants.filter((participant) => {
      if (companyFilter && clean(participant.company_name) !== companyFilter) return false;
      if (kelompokFilter && clean(participant.kelompok_name) !== kelompokFilter) return false;
      if (groupFilter && clean(participant.group_unit_name) !== groupFilter) return false;
      return matchesSearch(participant, search);
    });
  }, [participants, companyFilter, kelompokFilter, groupFilter, search]);

  const selectedParticipant = useMemo(() => {
    return participants.find((participant) => String(participant.id) === String(form.participant_id)) || null;
  }, [participants, form.participant_id]);

  useEffect(() => {
    if (!filteredParticipants.length) return;
    const stillAvailable = filteredParticipants.some((participant) => String(participant.id) === String(form.participant_id));
    if (!stillAvailable) setForm((previous: any) => ({ ...previous, participant_id: filteredParticipants[0].id }));
  }, [filteredParticipants, form.participant_id]);

  function setValue(key: string, value: any) {
    setForm((previous: any) => ({ ...previous, [key]: value }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("Menyimpan log Wellness...");
    try {
      const json = await fetch("/api/wellness/daily-log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      }).then((r) => r.json());

      if (!json.ok) {
        setMessage(json.message || "Gagal menyimpan log Wellness.");
        return;
      }

      const detected = json.saved?.calorie_result?.detectedFoods?.join(", ");
      const calories = json.saved?.calorie_result?.totalCalories;
      setMessage(`Berhasil disimpan${calories ? ` · ${calories} kalori` : ""}${detected ? ` · Terdeteksi: ${detected}` : ""}`);
      setForm((previous: any) => ({ ...previous, meal_text: "", photo_url: "", weight_kg: "", waist_cm: "", duration_minutes: "", distance_km: "", activity_notes: "", activity_calories: "" }));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[2rem] bg-gradient-to-r from-fuchsia-600 via-rose-600 to-orange-500 shadow-sm">
        <div className="flex flex-col gap-4 p-7 text-white lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-3xl font-black">Input Harian Wellness</div>
            <div className="mt-2 max-w-3xl text-sm font-medium text-rose-50">
              Pilih peserta dengan nama, kode, perusahaan, kelompok, dan risk cluster yang jelas. Input makanan, berat badan, dan aktivitas harian.
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-black">
            <a href="/wellness/dashboard" className="rounded-full bg-white px-5 py-3 text-rose-700 shadow-sm">Dashboard</a>
            <a href="/wellness/import" className="rounded-full bg-white/20 px-5 py-3 text-white ring-1 ring-white/30">Import Peserta</a>
          </div>
        </div>
      </section>

      <form onSubmit={submit} className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <section className="space-y-5 rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="rounded-3xl border border-blue-100 bg-blue-50 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="text-lg font-black text-slate-950">1. Pilih Peserta</div>
                <div className="mt-1 text-xs font-bold text-slate-500">
                  Gunakan filter agar tidak salah pilih peserta. Dropdown sekarang menampilkan KODE, nama, risk cluster, dan scope program.
                </div>
              </div>
              <button type="button" onClick={load} className="rounded-2xl bg-white px-4 py-2 text-xs font-black text-blue-700 shadow-sm ring-1 ring-blue-100">
                Refresh Peserta
              </button>
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-4">
              <input className="rounded-2xl border border-blue-100 bg-white px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100 lg:col-span-4" placeholder="Cari nama, KODE, risk cluster, kelompok..." value={search} onChange={(e) => setSearch(e.target.value)} />
              <select className="rounded-2xl border border-blue-100 bg-white px-4 py-3 text-sm font-bold text-slate-800" value={companyFilter} onChange={(e) => { setCompanyFilter(e.target.value); setKelompokFilter(""); setGroupFilter(""); }}>
                <option value="">Semua perusahaan</option>
                {companyOptions.map((option) => <option key={option}>{option}</option>)}
              </select>
              <select className="rounded-2xl border border-blue-100 bg-white px-4 py-3 text-sm font-bold text-slate-800" value={kelompokFilter} onChange={(e) => { setKelompokFilter(e.target.value); setGroupFilter(""); }}>
                <option value="">Semua kelompok</option>
                {kelompokOptions.map((option) => <option key={option}>{option}</option>)}
              </select>
              <select className="rounded-2xl border border-blue-100 bg-white px-4 py-3 text-sm font-bold text-slate-800" value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)}>
                <option value="">Semua group</option>
                {groupOptions.map((option) => <option key={option}>{option}</option>)}
              </select>
              <div className="rounded-2xl bg-white px-4 py-3 text-sm font-black text-slate-600 ring-1 ring-blue-100">
                {loading ? "Memuat..." : `${filteredParticipants.length} peserta tampil`}
              </div>
            </div>

            <label className="mt-4 grid gap-2 text-sm font-bold text-slate-700">
              Peserta
              <select className="w-full rounded-2xl border border-blue-200 bg-white px-4 py-3 text-sm font-black text-slate-900 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" value={form.participant_id || ""} onChange={(e) => setValue("participant_id", e.target.value)} required>
                {!filteredParticipants.length ? <option value="">Tidak ada peserta sesuai filter</option> : null}
                {filteredParticipants.map((participant) => <option key={participant.id} value={participant.id}>{participantLabel(participant)}</option>)}
              </select>
            </label>

            {selectedParticipant ? (
              <div className="mt-4 rounded-3xl border border-blue-100 bg-white p-4 shadow-sm">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="text-xs font-black uppercase tracking-wide text-slate-400">Peserta terpilih</div>
                    <div className="mt-1 text-2xl font-black text-slate-950">{participantName(selectedParticipant)}</div>
                    <div className="mt-1 text-sm font-bold text-slate-500">KODE: {clean(selectedParticipant.code) || "-"}</div>
                  </div>
                  <div className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-black text-rose-700 ring-1 ring-rose-100">
                    {clean(selectedParticipant.risk_cluster || selectedParticipant.baseline_risk_group) || "Risk cluster belum ada"}
                  </div>
                </div>
                {selectedParticipant.name_warning ? (
                  <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold leading-5 text-amber-800">
                    {selectedParticipant.name_warning} Data lama seperti ini sebaiknya dibersihkan lalu diimport ulang dengan mapping terbaru.
                  </div>
                ) : null}
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <InfoPill label="Perusahaan" value={selectedParticipant.company_name} tone="blue" />
                  <InfoPill label="Kelompok" value={selectedParticipant.kelompok_name || selectedParticipant.old_group_name} tone="purple" />
                  <InfoPill label="Group Upload" value={selectedParticipant.group_unit_name} tone="emerald" />
                </div>
              </div>
            ) : null}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm font-bold text-slate-700">
              Tanggal
              <input type="date" className="rounded-2xl border border-slate-300 px-4 py-3" value={form.log_date || ""} onChange={(e) => setValue("log_date", e.target.value)} required />
            </label>
            <label className="grid gap-2 text-sm font-bold text-slate-700">
              Waktu Makan
              <select className="rounded-2xl border border-slate-300 px-4 py-3" value={form.meal_time || ""} onChange={(e) => setValue("meal_time", e.target.value)}>
                {MEAL_TIMES.map((time) => <option key={time}>{time}</option>)}
              </select>
            </label>
          </div>

          <div className="rounded-3xl border border-amber-100 bg-amber-50 p-4">
            <div className="text-sm font-black text-amber-900">2. Makanan Harian</div>
            <div className="mt-3 grid gap-4">
              <textarea className="min-h-[140px] rounded-2xl border border-amber-200 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-amber-400 focus:ring-4 focus:ring-amber-100" placeholder="Contoh: nasi merah, dada ayam filet, telur rebus, sayur pokcay" value={form.meal_text || ""} onChange={(e) => setValue("meal_text", e.target.value)} />
              <input className="rounded-2xl border border-amber-200 bg-white px-4 py-3 text-sm font-semibold" placeholder="URL foto makanan, opsional" value={form.photo_url || ""} onChange={(e) => setValue("photo_url", e.target.value)} />
            </div>
          </div>

          <div className="rounded-3xl border border-blue-100 bg-blue-50 p-4">
            <div className="text-sm font-black text-blue-900">3. Berat Badan & Lingkar Perut</div>
            <div className="mt-3 grid gap-4 md:grid-cols-2">
              <input className="rounded-2xl border border-blue-200 bg-white px-4 py-3 text-sm font-semibold" placeholder="BB hari ini (kg)" value={form.weight_kg || ""} onChange={(e) => setValue("weight_kg", e.target.value)} />
              <input className="rounded-2xl border border-blue-200 bg-white px-4 py-3 text-sm font-semibold" placeholder="Lingkar perut (cm), opsional" value={form.waist_cm || ""} onChange={(e) => setValue("waist_cm", e.target.value)} />
            </div>
          </div>

          <div className="rounded-3xl border border-emerald-100 bg-emerald-50 p-4">
            <div className="text-sm font-black text-emerald-900">4. Aktivitas / Workout</div>
            <div className="mt-3 grid gap-4 md:grid-cols-2">
              <select className="rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm font-semibold" value={form.activity_type || ""} onChange={(e) => setValue("activity_type", e.target.value)}>
                <option value="">Pilih aktivitas</option>
                {activities.map((activity) => <option key={activity.id || activity.activity_name} value={activity.activity_name}>{activity.activity_name}</option>)}
              </select>
              <input className="rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm font-semibold" placeholder="Durasi menit" value={form.duration_minutes || ""} onChange={(e) => setValue("duration_minutes", e.target.value)} />
              <input className="rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm font-semibold" placeholder="Jarak km, opsional" value={form.distance_km || ""} onChange={(e) => setValue("distance_km", e.target.value)} />
              <input className="rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm font-semibold" placeholder="Kalori aktivitas manual, opsional" value={form.activity_calories || ""} onChange={(e) => setValue("activity_calories", e.target.value)} />
            </div>
          </div>

          <button disabled={saving || !form.participant_id} className="w-full rounded-2xl bg-rose-600 px-5 py-4 text-sm font-black text-white shadow-sm transition hover:bg-rose-700 disabled:opacity-60">
            {saving ? "Menyimpan..." : "Simpan Log Harian"}
          </button>
        </section>

        <aside className="space-y-4">
          <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-lg font-black text-slate-900">Status</div>
            <div className="mt-3 rounded-2xl bg-slate-50 p-4 text-sm font-semibold leading-6 text-slate-600">{message || "Pilih peserta, isi form, lalu simpan."}</div>
          </div>
          <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-lg font-black text-slate-900">Tips Operasional</div>
            <ul className="mt-3 space-y-2 text-sm font-semibold leading-6 text-slate-600">
              <li>Peserta yang namanya muncul sebagai risk cluster berarti data lama pernah salah import.</li>
              <li>Gunakan filter Company, Kelompok, dan Group agar input tidak masuk peserta yang salah.</li>
              <li>Untuk data MCU lama, gunakan menu Import History MCU, bukan Input Harian.</li>
            </ul>
          </div>
        </aside>
      </form>
    </div>
  );
}
