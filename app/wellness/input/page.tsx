"use client";

import { useEffect, useState } from "react";
import AuthGate from "@/components/AuthGate";

const MEAL_TIMES = ["Sarapan", "Makan Siang", "Makan Malam", "Cemilan"];

export default function WellnessInputPage() {
  return <AuthGate>{() => <WellnessInput />}</AuthGate>;
}

function WellnessInput() {
  const [participants, setParticipants] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState<any>({
    log_date: new Date().toISOString().slice(0, 10),
    meal_time: "Sarapan",
  });

  async function load() {
    const [participantJson, activityJson] = await Promise.all([
      fetch("/api/wellness/participants", { cache: "no-store" }).then((r) => r.json()).catch(() => ({})),
      fetch("/api/wellness/reference/activities", { cache: "no-store" }).then((r) => r.json()).catch(() => ({})),
    ]);
    const list = participantJson.participants || [];
    setParticipants(list);
    setActivities(activityJson.activities || []);
    if (list.length && !form.participant_id) setForm((previous: any) => ({ ...previous, participant_id: list[0].id }));
  }

  useEffect(() => { load(); }, []);

  function setValue(key: string, value: any) {
    setForm((previous: any) => ({ ...previous, [key]: value }));
  }

  async function submit(event: React.FormEvent) {
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
      setForm((previous: any) => ({ ...previous, meal_text: "", photo_url: "", weight_kg: "", waist_cm: "", duration_minutes: "", distance_km: "", activity_notes: "" }));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[2rem] bg-gradient-to-r from-fuchsia-600 via-rose-600 to-orange-500 shadow-sm">
        <div className="p-7 text-white">
          <div className="text-3xl font-black">Input Harian Wellness</div>
          <div className="mt-2 max-w-3xl text-sm font-medium text-rose-50">
            Input makanan, berat badan, dan aktivitas. Kalori makanan akan dihitung otomatis dari master KaloriData.
          </div>
        </div>
      </section>

      <form onSubmit={submit} className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <section className="space-y-5 rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid gap-4 md:grid-cols-3">
            <label className="grid gap-2 text-sm font-bold text-slate-700">
              Peserta
              <select className="rounded-2xl border border-slate-300 px-4 py-3" value={form.participant_id || ""} onChange={(e) => setValue("participant_id", e.target.value)} required>
                {participants.map((participant) => <option key={participant.id} value={participant.id}>{participant.name}</option>)}
              </select>
            </label>
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
            <div className="text-sm font-black text-amber-900">Makanan Harian</div>
            <div className="mt-3 grid gap-4">
              <textarea className="min-h-[140px] rounded-2xl border border-amber-200 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-amber-400 focus:ring-4 focus:ring-amber-100" placeholder="Contoh: nasi merah, dada ayam filet, telur rebus, sayur pokcay" value={form.meal_text || ""} onChange={(e) => setValue("meal_text", e.target.value)} />
              <input className="rounded-2xl border border-amber-200 bg-white px-4 py-3 text-sm font-semibold" placeholder="URL foto makanan, opsional" value={form.photo_url || ""} onChange={(e) => setValue("photo_url", e.target.value)} />
            </div>
          </div>

          <div className="rounded-3xl border border-blue-100 bg-blue-50 p-4">
            <div className="text-sm font-black text-blue-900">Berat Badan & BMI</div>
            <div className="mt-3 grid gap-4 md:grid-cols-2">
              <input className="rounded-2xl border border-blue-200 bg-white px-4 py-3 text-sm font-semibold" placeholder="BB hari ini (kg)" value={form.weight_kg || ""} onChange={(e) => setValue("weight_kg", e.target.value)} />
              <input className="rounded-2xl border border-blue-200 bg-white px-4 py-3 text-sm font-semibold" placeholder="Lingkar perut (cm), opsional" value={form.waist_cm || ""} onChange={(e) => setValue("waist_cm", e.target.value)} />
            </div>
          </div>

          <div className="rounded-3xl border border-emerald-100 bg-emerald-50 p-4">
            <div className="text-sm font-black text-emerald-900">Aktivitas / Workout</div>
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

          <button disabled={saving} className="w-full rounded-2xl bg-rose-600 px-5 py-4 text-sm font-black text-white shadow-sm transition hover:bg-rose-700 disabled:opacity-60">
            {saving ? "Menyimpan..." : "Simpan Log Harian"}
          </button>
        </section>

        <aside className="space-y-4">
          <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-lg font-black text-slate-900">Status</div>
            <div className="mt-3 rounded-2xl bg-slate-50 p-4 text-sm font-semibold leading-6 text-slate-600">{message || "Isi form lalu simpan."}</div>
          </div>
          <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-lg font-black text-slate-900">Tips</div>
            <ul className="mt-3 space-y-2 text-sm font-semibold leading-6 text-slate-600">
              <li>Gunakan teks makanan bebas seperti Google Form lama.</li>
              <li>Sinonim umum seperti nasgor, baso, telor akan dinormalisasi.</li>
              <li>Untuk iPhone/smartwatch, aktivitas dapat di-sync via Strava secara opsional.</li>
            </ul>
          </div>
        </aside>
      </form>
    </div>
  );
}
