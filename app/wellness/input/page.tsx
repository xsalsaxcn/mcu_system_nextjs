"use client";

import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import AuthGate from "@/components/AuthGate";

// WELLNESS_DAILY_INPUT_PRO_V360
// WELLNESS_GOOGLE_SHEET_RESPONSE_V362
// WELLNESS_EVIDENCE_GALLERY_PROGRESS_V364_INPUT_COPY

type TabKey = "nutrition" | "weight" | "activity" | "healthtalk";

const MEAL_TIMES = ["Sarapan", "Makan Siang", "Makan Malam", "Cemilan"];
const HEALTH_TALK_TYPES = ["Online", "Offline"];

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

function inputClass(extra = "") {
  return `w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-800 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100 ${extra}`;
}

function isPreviewableImageUrl(value: any) {
  const url = clean(value);
  if (!url) return false;
  if (url.startsWith("data:image/")) return true;
  return /\.(png|jpe?g|gif|webp|bmp|svg)(\?|#|$)/i.test(url);
}

function EvidenceUploadField({
  label,
  value,
  placeholder,
  helper,
  onChange,
}: {
  label: string;
  fieldKey: string;
  value: string;
  placeholder: string;
  helper?: string;
  uploading?: boolean;
  onChange: (value: string) => void;
  onUpload?: (file: File) => void;
}) {
  const hasValue = Boolean(clean(value));
  return (
    <div className="grid gap-2 text-sm font-bold text-slate-700">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <span>{label}</span>
        {hasValue ? (
          <a href={value} target="_blank" rel="noreferrer" className="rounded-2xl bg-white px-4 py-2 text-xs font-black text-blue-700 ring-1 ring-blue-100">
            Buka bukti
          </a>
        ) : null}
      </div>
      <input
        className={inputClass()}
        placeholder={placeholder}
        value={value || ""}
        onChange={(event) => onChange(event.target.value)}
      />
      <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs font-bold leading-5 text-blue-800">
        Upload foto/bukti dilakukan di Google Drive/Jotform/WhatsApp media, lalu tempel link di sini. Aplikasi hanya menyimpan URL dan mengirim baris response ke Google Sheet, bukan menyimpan file gambar di Supabase Storage.
      </div>
      {helper ? <div className="text-xs font-bold text-slate-500">{helper}</div> : null}
      {hasValue ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-3">
          <div className="mb-2 text-[10px] font-black uppercase tracking-wide text-slate-400">Preview bukti</div>
          {isPreviewableImageUrl(value) ? (
            <img src={value} alt="Preview bukti Wellness" className="max-h-64 w-full rounded-2xl object-contain ring-1 ring-slate-100" />
          ) : (
            <div className="rounded-2xl bg-slate-50 px-4 py-3 text-xs font-bold text-slate-600">
              Link bukti sudah tersimpan. Untuk Google Drive, pastikan akses link minimal “Anyone with the link can view”. Preview gambar langsung hanya muncul untuk URL gambar publik.
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
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

function TabButton({ active, label, helper, onClick }: { active: boolean; label: string; helper: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-3xl border p-4 text-left transition ${active ? "border-blue-200 bg-blue-600 text-white shadow-lg shadow-blue-100" : "border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:bg-blue-50"}`}
    >
      <div className="text-sm font-black">{label}</div>
      <div className={`mt-1 text-xs font-bold ${active ? "text-blue-50" : "text-slate-500"}`}>{helper}</div>
    </button>
  );
}

export default function WellnessInputPage() {
  return <AuthGate>{() => <WellnessInput />}</AuthGate>;
}

function WellnessInput() {
  // WELLNESS_GOOGLE_SHEET_RESPONSE_V362
// WELLNESS_EVIDENCE_GALLERY_PROGRESS_V364_INPUT_COPY_UI
  const [participants, setParticipants] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("Isi form lalu simpan. Point akan dihitung otomatis bila tabel point sudah tersedia.");
  const [lastResult, setLastResult] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("nutrition");
  const [search, setSearch] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [kelompokFilter, setKelompokFilter] = useState("");
  const [groupFilter, setGroupFilter] = useState("");
  const [form, setForm] = useState<any>({
    log_date: new Date().toISOString().slice(0, 10),
    meal_time: "Sarapan",
    healthtalk_type: "Online",
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


  function payloadForActiveTab() {
    const base: any = {
      participant_id: form.participant_id,
      log_date: form.log_date,
      log_type: activeTab,
    };
    if (activeTab === "nutrition") {
      return {
        ...base,
        meal_time: form.meal_time,
        meal_text: form.meal_text,
        photo_url: form.photo_url,
        food_notes: form.food_notes,
      };
    }
    if (activeTab === "weight") {
      return {
        ...base,
        weight_kg: form.weight_kg,
        waist_cm: form.waist_cm,
        weight_notes: form.weight_notes,
      };
    }
    if (activeTab === "activity") {
      return {
        ...base,
        activity_type: form.activity_type,
        duration_minutes: form.duration_minutes,
        distance_km: form.distance_km,
        activity_calories: form.activity_calories,
        activity_notes: form.activity_notes,
        activity_evidence_url: form.activity_evidence_url,
      };
    }
    return {
      ...base,
      healthtalk_title: form.healthtalk_title,
      healthtalk_type: form.healthtalk_type,
      healthtalk_date: form.healthtalk_date || form.log_date,
      healthtalk_evidence_url: form.healthtalk_evidence_url,
      healthtalk_notes: form.healthtalk_notes,
    };
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setLastResult(null);
    setMessage("Menyimpan log Wellness...");
    try {
      const json = await fetch("/api/wellness/daily-log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadForActiveTab()),
      }).then((r) => r.json());

      if (!json.ok) {
        setMessage(json.message || "Gagal menyimpan log Wellness.");
        setLastResult(json);
        return;
      }

      const points = Number(json.points_total || 0);
      const detected = json.saved?.calorie_result?.detectedFoods?.join(", ");
      const calories = json.saved?.calorie_result?.totalCalories;
      const parts = ["Berhasil disimpan"];
      if (calories) parts.push(`${calories} kalori`);
      if (detected) parts.push(`Terdeteksi: ${detected}`);
      if (points) parts.push(`Point +${points}`);
      if (json.warnings?.length) parts.push(`Catatan: ${json.warnings.join("; ")}`);
      setMessage(parts.join(" · "));
      setLastResult(json);

      if (activeTab === "nutrition") setForm((previous: any) => ({ ...previous, meal_text: "", photo_url: "", food_notes: "" }));
      if (activeTab === "weight") setForm((previous: any) => ({ ...previous, weight_kg: "", waist_cm: "", weight_notes: "" }));
      if (activeTab === "activity") setForm((previous: any) => ({ ...previous, duration_minutes: "", distance_km: "", activity_notes: "", activity_calories: "", activity_evidence_url: "" }));
      if (activeTab === "healthtalk") setForm((previous: any) => ({ ...previous, healthtalk_title: "", healthtalk_evidence_url: "", healthtalk_notes: "" }));
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
              Input dibuat bertahap seperti form monitoring: nutrisi, berat badan, aktivitas, dan healthtalk. Hasil input tersimpan untuk dashboard dan dapat dikirim sebagai baris response ke Google Sheet.
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-black">
            <a href="/wellness/dashboard" className="rounded-full bg-white px-5 py-3 text-rose-700 shadow-sm">Dashboard</a>
            <a href="/wellness/import" className="rounded-full bg-white/20 px-5 py-3 text-white ring-1 ring-white/30">Import Peserta</a>
          </div>
        </div>
      </section>

      <div className="grid gap-3 md:grid-cols-4">
        <TabButton active={activeTab === "nutrition"} label="Nutrisi" helper="Makanan, foto/link bukti, kalori" onClick={() => setActiveTab("nutrition")} />
        <TabButton active={activeTab === "weight"} label="BB & Lingkar Perut" helper="Input berkala mingguan" onClick={() => setActiveTab("weight")} />
        <TabButton active={activeTab === "activity"} label="Aktivitas" helper="Workout manual atau bukti smartwatch" onClick={() => setActiveTab("activity")} />
        <TabButton active={activeTab === "healthtalk"} label="Healthtalk" helper="Seminar online/offline dan bukti" onClick={() => setActiveTab("healthtalk")} />
      </div>

      <form onSubmit={submit} className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <section className="space-y-5 rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="rounded-3xl border border-blue-100 bg-blue-50 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="text-lg font-black text-slate-950">1. Pilih Peserta</div>
                <div className="mt-1 text-xs font-bold text-slate-500">
                  Filter dulu agar tidak salah pilih peserta. Pilihan peserta menampilkan KODE, nama, risk cluster, dan scope program.
                </div>
              </div>
              <button type="button" onClick={load} className="rounded-2xl bg-white px-4 py-2 text-xs font-black text-blue-700 shadow-sm ring-1 ring-blue-100">
                Refresh Peserta
              </button>
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-4">
              <input className={`${inputClass()} lg:col-span-4`} placeholder="Cari nama, KODE, risk cluster, kelompok..." value={search} onChange={(e) => setSearch(e.target.value)} />
              <select className={inputClass()} value={companyFilter} onChange={(e) => { setCompanyFilter(e.target.value); setKelompokFilter(""); setGroupFilter(""); }}>
                <option value="">Semua perusahaan</option>
                {companyOptions.map((option) => <option key={option}>{option}</option>)}
              </select>
              <select className={inputClass()} value={kelompokFilter} onChange={(e) => { setKelompokFilter(e.target.value); setGroupFilter(""); }}>
                <option value="">Semua kelompok</option>
                {kelompokOptions.map((option) => <option key={option}>{option}</option>)}
              </select>
              <select className={inputClass()} value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)}>
                <option value="">Semua group</option>
                {groupOptions.map((option) => <option key={option}>{option}</option>)}
              </select>
              <select className={`${inputClass()} lg:col-span-4`} value={form.participant_id || ""} onChange={(e) => setValue("participant_id", e.target.value)} required>
                {!filteredParticipants.length ? <option value="">Tidak ada peserta sesuai filter</option> : null}
                {filteredParticipants.map((participant) => <option key={participant.id} value={participant.id}>{participantLabel(participant)}</option>)}
              </select>
            </div>

            {selectedParticipant ? (
              <div className="mt-4 space-y-3">
                {selectedParticipant.name_warning ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold text-amber-800">
                    {selectedParticipant.name_warning}
                  </div>
                ) : null}
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <InfoPill label="Peserta" value={`${clean(selectedParticipant.code) ? `${selectedParticipant.code} - ` : ""}${participantName(selectedParticipant)}`} tone="blue" />
                  <InfoPill label="Risk Cluster" value={selectedParticipant.risk_cluster || selectedParticipant.baseline_risk_group} tone="amber" />
                  <InfoPill label="Kelompok" value={selectedParticipant.kelompok_name || selectedParticipant.old_group_name} tone="purple" />
                  <InfoPill label="Group Upload" value={selectedParticipant.group_unit_name} tone="emerald" />
                </div>
              </div>
            ) : null}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm font-bold text-slate-700">
              Tanggal log
              <input type="date" className={inputClass()} value={form.log_date || ""} onChange={(e) => setValue("log_date", e.target.value)} required />
            </label>
            <label className="grid gap-2 text-sm font-bold text-slate-700">
              Tipe input aktif
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-black text-slate-800">
                {activeTab === "nutrition" ? "Nutrisi" : activeTab === "weight" ? "BB & Lingkar Perut" : activeTab === "activity" ? "Aktivitas" : "Healthtalk / Seminar"}
              </div>
            </label>
          </div>

          {activeTab === "nutrition" ? (
            <div className="rounded-3xl border border-amber-100 bg-amber-50 p-4">
              <div className="text-sm font-black text-amber-900">2. Nutrisi Harian</div>
              <div className="mt-3 grid gap-4">
                <label className="grid gap-2 text-sm font-bold text-slate-700">
                  Waktu makan
                  <select className={inputClass()} value={form.meal_time || ""} onChange={(e) => setValue("meal_time", e.target.value)}>
                    {MEAL_TIMES.map((time) => <option key={time}>{time}</option>)}
                  </select>
                </label>
                <label className="grid gap-2 text-sm font-bold text-slate-700">
                  Deskripsi makanan
                  <textarea className={`${inputClass()} min-h-[120px]`} placeholder="Contoh: nasi merah, ayam panggang, telur rebus, sayur pokcay" value={form.meal_text || ""} onChange={(e) => setValue("meal_text", e.target.value)} />
                </label>
                <EvidenceUploadField
                  label="Foto makanan / bukti upload, opsional"
                  fieldKey="photo_url"
                  value={form.photo_url || ""}
                  placeholder="Tempel link Google Drive, Jotform, WhatsApp media, Strava, atau URL gambar"
                  helper="Aplikasi tidak menyimpan gambar di Supabase. Tempel link bukti; preview akan muncul di dashboard bila link gambar dapat dibaca."
                  onChange={(value) => setValue("photo_url", value)}
                />
                <label className="grid gap-2 text-sm font-bold text-slate-700">
                  Catatan nutrisi, opsional
                  <input className={inputClass()} placeholder="Contoh: porsi kecil, tanpa gula, makan terlambat" value={form.food_notes || ""} onChange={(e) => setValue("food_notes", e.target.value)} />
                </label>
              </div>
            </div>
          ) : null}

          {activeTab === "weight" ? (
            <div className="rounded-3xl border border-blue-100 bg-blue-50 p-4">
              <div className="text-sm font-black text-blue-900">2. BB & Lingkar Perut</div>
              <div className="mt-3 grid gap-4 md:grid-cols-2">
                <label className="grid gap-2 text-sm font-bold text-slate-700">
                  Berat badan sekarang (kg)
                  <input className={inputClass()} type="number" step="0.1" placeholder="Contoh: 82.5" value={form.weight_kg || ""} onChange={(e) => setValue("weight_kg", e.target.value)} />
                </label>
                <label className="grid gap-2 text-sm font-bold text-slate-700">
                  Lingkar perut (cm), opsional
                  <input className={inputClass()} type="number" step="0.1" placeholder="Contoh: 96" value={form.waist_cm || ""} onChange={(e) => setValue("waist_cm", e.target.value)} />
                </label>
                <label className="grid gap-2 text-sm font-bold text-slate-700 md:col-span-2">
                  Catatan BB / lingkar perut
                  <input className={inputClass()} placeholder="Contoh: timbang pagi sebelum sarapan" value={form.weight_notes || ""} onChange={(e) => setValue("weight_notes", e.target.value)} />
                </label>
              </div>
            </div>
          ) : null}

          {activeTab === "activity" ? (
            <div className="rounded-3xl border border-emerald-100 bg-emerald-50 p-4">
              <div className="text-sm font-black text-emerald-900">2. Aktivitas / Workout</div>
              <div className="mt-3 grid gap-4 md:grid-cols-2">
                <label className="grid gap-2 text-sm font-bold text-slate-700">
                  Jenis aktivitas
                  <select className={inputClass()} value={form.activity_type || ""} onChange={(e) => setValue("activity_type", e.target.value)}>
                    <option value="">Pilih aktivitas</option>
                    {activities.map((activity: any) => <option key={activity.id || activity.activity_name}>{activity.activity_name}</option>)}
                    <option>Jalan kaki</option>
                    <option>Senam</option>
                    <option>Gym</option>
                    <option>Aktivitas lain</option>
                  </select>
                </label>
                <label className="grid gap-2 text-sm font-bold text-slate-700">
                  Durasi menit
                  <input className={inputClass()} type="number" step="1" placeholder="Contoh: 30" value={form.duration_minutes || ""} onChange={(e) => setValue("duration_minutes", e.target.value)} />
                </label>
                <label className="grid gap-2 text-sm font-bold text-slate-700">
                  Jarak km, opsional
                  <input className={inputClass()} type="number" step="0.1" placeholder="Contoh: 2.5" value={form.distance_km || ""} onChange={(e) => setValue("distance_km", e.target.value)} />
                </label>
                <label className="grid gap-2 text-sm font-bold text-slate-700">
                  Kalori manual, opsional
                  <input className={inputClass()} type="number" step="1" placeholder="Isi bila ada dari smartwatch" value={form.activity_calories || ""} onChange={(e) => setValue("activity_calories", e.target.value)} />
                </label>
                <div className="md:col-span-2">
                  <EvidenceUploadField
                    label="Bukti aktivitas, opsional"
                    fieldKey="activity_evidence_url"
                    value={form.activity_evidence_url || ""}
                    placeholder="Tempel link screenshot Strava/smartwatch atau URL bukti"
                    helper="Bukti aktivitas cukup berupa URL Google Drive/Strava/smartwatch. File tetap di luar Supabase."
                    onChange={(value) => setValue("activity_evidence_url", value)}
                  />
                </div>
                <label className="grid gap-2 text-sm font-bold text-slate-700 md:col-span-2">
                  Catatan aktivitas
                  <input className={inputClass()} placeholder="Contoh: jalan pagi sebelum kerja" value={form.activity_notes || ""} onChange={(e) => setValue("activity_notes", e.target.value)} />
                </label>
              </div>
            </div>
          ) : null}

          {activeTab === "healthtalk" ? (
            <div className="rounded-3xl border border-purple-100 bg-purple-50 p-4">
              <div className="text-sm font-black text-purple-900">2. Healthtalk / Seminar Kesehatan</div>
              <div className="mt-3 grid gap-4 md:grid-cols-2">
                <label className="grid gap-2 text-sm font-bold text-slate-700 md:col-span-2">
                  Judul healthtalk / seminar
                  <input className={inputClass()} placeholder="Contoh: Sindrom Metabolik dan Pencegahannya" value={form.healthtalk_title || ""} onChange={(e) => setValue("healthtalk_title", e.target.value)} />
                </label>
                <label className="grid gap-2 text-sm font-bold text-slate-700">
                  Jenis kehadiran
                  <select className={inputClass()} value={form.healthtalk_type || "Online"} onChange={(e) => setValue("healthtalk_type", e.target.value)}>
                    {HEALTH_TALK_TYPES.map((item) => <option key={item}>{item}</option>)}
                  </select>
                </label>
                <label className="grid gap-2 text-sm font-bold text-slate-700">
                  Tanggal healthtalk
                  <input type="date" className={inputClass()} value={form.healthtalk_date || form.log_date || ""} onChange={(e) => setValue("healthtalk_date", e.target.value)} />
                </label>
                <div className="md:col-span-2">
                  <EvidenceUploadField
                    label="Bukti kehadiran, opsional"
                    fieldKey="healthtalk_evidence_url"
                    value={form.healthtalk_evidence_url || ""}
                    placeholder="Tempel link screenshot Zoom/foto absensi atau URL bukti"
                    helper="Bukti healthtalk hanya disimpan sebagai URL dan tetap masuk status validasi pending."
                    onChange={(value) => setValue("healthtalk_evidence_url", value)}
                  />
                </div>
                <label className="grid gap-2 text-sm font-bold text-slate-700 md:col-span-2">
                  Catatan healthtalk
                  <input className={inputClass()} placeholder="Contoh: hadir sampai selesai" value={form.healthtalk_notes || ""} onChange={(e) => setValue("healthtalk_notes", e.target.value)} />
                </label>
              </div>
            </div>
          ) : null}

          <button disabled={saving || loading || !form.participant_id} className="w-full rounded-3xl bg-rose-600 px-6 py-4 text-sm font-black text-white shadow-lg shadow-rose-100 transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:bg-slate-300">
            {saving ? "Menyimpan..." : "Simpan Log Harian"}
          </button>
        </section>

        <aside className="space-y-4">
          <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-lg font-black text-slate-950">Status</div>
            <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-4 text-sm font-bold text-slate-700">{message}</div>
            {lastResult?.points_total ? (
              <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-700">
                Point tersimpan: +{lastResult.points_total}
              </div>
            ) : null}
          </div>

          <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-lg font-black text-slate-950">Panduan Point</div>
            <div className="mt-4 space-y-3 text-sm font-bold text-slate-600">
              <div className="flex justify-between gap-3"><span>Nutrisi lengkap</span><b>+5</b></div>
              <div className="flex justify-between gap-3"><span>BB / lingkar perut</span><b>+5</b></div>
              <div className="flex justify-between gap-3"><span>Aktivitas &ge; 30 menit</span><b>+10</b></div>
              <div className="flex justify-between gap-3"><span>Bukti aktivitas</span><b>+5</b></div>
              <div className="flex justify-between gap-3"><span>Healthtalk online</span><b>+10</b></div>
              <div className="flex justify-between gap-3"><span>Healthtalk offline</span><b>+15</b></div>
            </div>
          </div>

          <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-lg font-black text-slate-950">Catatan</div>
            <div className="mt-4 space-y-3 text-sm font-medium leading-6 text-slate-600">
              <p>File gambar tidak disimpan di Supabase Storage. Tempel link bukti dari Google Drive, WhatsApp media, Strava, atau folder perusahaan.</p>
              <p>Jika webhook Google Sheet sudah diatur, setiap submit akan menambah baris response di Google Sheet seperti form response.</p>
            </div>
          </div>
        </aside>
      </form>
    </div>
  );
}
