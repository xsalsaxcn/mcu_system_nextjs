"use client";

import { useEffect, useMemo, useState } from "react";
import AuthGate from "@/components/AuthGate";

export default function WellnessMasterPage() {
  return <AuthGate>{() => <WellnessMaster />}</AuthGate>;
}

function WellnessMaster() {
  const [foods, setFoods] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [foodSearch, setFoodSearch] = useState("");
  const [message, setMessage] = useState("Master Wellness memakai database internal, bukan Google Sheet.");
  const [foodForm, setFoodForm] = useState<any>({});
  const [activityForm, setActivityForm] = useState<any>({ unit: "menit" });

  async function load() {
    const [foodJson, activityJson] = await Promise.all([
      fetch("/api/wellness/reference/foods?limit=2000", { cache: "no-store" }).then((r) => r.json()).catch(() => ({})),
      fetch("/api/wellness/reference/activities", { cache: "no-store" }).then((r) => r.json()).catch(() => ({})),
    ]);
    setFoods(foodJson.foods || []);
    setActivities(activityJson.activities || []);
  }

  useEffect(() => { load(); }, []);

  async function setupDefaults() {
    setMessage("Mengisi master KaloriData dan KaloriOlahraga...");
    const json = await fetch("/api/wellness/setup", { method: "POST" }).then((r) => r.json());
    if (!json.ok) {
      setMessage(json.message || "Setup gagal.");
      return;
    }
    setMessage(`Setup berhasil: ${json.foods} makanan, ${json.activities} aktivitas.`);
    load();
  }

  async function saveFood(event: React.FormEvent) {
    event.preventDefault();
    const json = await fetch("/api/wellness/reference/foods", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(foodForm),
    }).then((r) => r.json());
    setMessage(json.ok ? "Makanan berhasil disimpan." : json.message || "Gagal simpan makanan.");
    if (json.ok) { setFoodForm({}); load(); }
  }

  async function saveActivity(event: React.FormEvent) {
    event.preventDefault();
    const json = await fetch("/api/wellness/reference/activities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(activityForm),
    }).then((r) => r.json());
    setMessage(json.ok ? "Aktivitas berhasil disimpan." : json.message || "Gagal simpan aktivitas.");
    if (json.ok) { setActivityForm({ unit: "menit" }); load(); }
  }

  const filteredFoods = useMemo(() => {
    const keyword = foodSearch.trim().toLowerCase();
    return keyword ? foods.filter((food) => [food.food_name, food.category, food.aliases].filter(Boolean).join(" ").toLowerCase().includes(keyword)) : foods;
  }, [foods, foodSearch]);

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[2rem] bg-gradient-to-r from-fuchsia-600 via-rose-600 to-orange-500 shadow-sm">
        <div className="p-7 text-white">
          <div className="text-3xl font-black">Master Wellness</div>
          <div className="mt-2 max-w-3xl text-sm font-medium text-rose-50">Kelola referensi makanan, kalori, dan aktivitas pengganti sheet KaloriData/KaloriOlahraga.</div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-black uppercase tracking-wide text-slate-400">Makanan</div>
          <div className="mt-2 text-3xl font-black text-slate-900">{foods.length}</div>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-black uppercase tracking-wide text-slate-400">Aktivitas</div>
          <div className="mt-2 text-3xl font-black text-slate-900">{activities.length}</div>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-black uppercase tracking-wide text-slate-400">Setup</div>
          <button type="button" onClick={setupDefaults} className="mt-3 w-full rounded-2xl bg-rose-600 px-4 py-3 text-sm font-black text-white">Seed dari Excel lama</button>
        </div>
      </section>

      <div className="rounded-2xl bg-slate-100 px-4 py-3 text-sm font-bold text-slate-600">{message}</div>

      <section className="grid gap-3 md:grid-cols-3">
        <a href="/wellness/settings" className="rounded-2xl bg-slate-950 px-4 py-3 text-center text-sm font-black text-white">Setting Parameter Wellness</a>
        <a href="/wellness/import" className="rounded-2xl bg-blue-600 px-4 py-3 text-center text-sm font-black text-white">Import Peserta Wellness</a>
        <a href="/wellness/signup" className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-center text-sm font-black text-blue-700">Link Signup Peserta</a>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <form onSubmit={saveFood} className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xl font-black text-slate-900">Tambah Makanan</div>
          <div className="mt-4 grid gap-3">
            <input className="rounded-2xl border border-slate-300 px-4 py-3 text-sm font-bold" placeholder="Nama makanan" value={foodForm.food_name || ""} onChange={(e) => setFoodForm({ ...foodForm, food_name: e.target.value })} />
            <input className="rounded-2xl border border-slate-300 px-4 py-3 text-sm font-bold" placeholder="Kalori" value={foodForm.calories || ""} onChange={(e) => setFoodForm({ ...foodForm, calories: e.target.value })} />
            <input className="rounded-2xl border border-slate-300 px-4 py-3 text-sm font-bold" placeholder="Kategori" value={foodForm.category || ""} onChange={(e) => setFoodForm({ ...foodForm, category: e.target.value })} />
            <input className="rounded-2xl border border-slate-300 px-4 py-3 text-sm font-bold" placeholder="Alias/sinonim, pisahkan koma" value={foodForm.aliases || ""} onChange={(e) => setFoodForm({ ...foodForm, aliases: e.target.value })} />
            <button className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-black text-white">Simpan Makanan</button>
          </div>
        </form>

        <form onSubmit={saveActivity} className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xl font-black text-slate-900">Tambah Aktivitas</div>
          <div className="mt-4 grid gap-3">
            <input className="rounded-2xl border border-slate-300 px-4 py-3 text-sm font-bold" placeholder="Nama aktivitas" value={activityForm.activity_name || ""} onChange={(e) => setActivityForm({ ...activityForm, activity_name: e.target.value })} />
            <input className="rounded-2xl border border-slate-300 px-4 py-3 text-sm font-bold" placeholder="MET" value={activityForm.met || ""} onChange={(e) => setActivityForm({ ...activityForm, met: e.target.value })} />
            <input className="rounded-2xl border border-slate-300 px-4 py-3 text-sm font-bold" placeholder="Kalori per km, opsional" value={activityForm.calories_per_km || ""} onChange={(e) => setActivityForm({ ...activityForm, calories_per_km: e.target.value })} />
            <input className="rounded-2xl border border-slate-300 px-4 py-3 text-sm font-bold" placeholder="Kategori" value={activityForm.category || ""} onChange={(e) => setActivityForm({ ...activityForm, category: e.target.value })} />
            <button className="rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-black text-white">Simpan Aktivitas</button>
          </div>
        </form>
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-xl font-black text-slate-900">KaloriData</div>
              <div className="text-sm font-semibold text-slate-500">{filteredFoods.length} dari {foods.length} makanan</div>
            </div>
            <input className="rounded-2xl border border-slate-300 px-4 py-3 text-sm font-bold" placeholder="Cari makanan" value={foodSearch} onChange={(e) => setFoodSearch(e.target.value)} />
          </div>
        </div>
        <div className="max-h-[520px] overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3 text-left">Makanan</th><th className="px-4 py-3 text-left">Kalori</th><th className="px-4 py-3 text-left">Kategori</th><th className="px-4 py-3 text-left">Alias</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{filteredFoods.map((food) => <tr key={food.id || food.food_name}><td className="px-4 py-3 font-bold text-slate-900">{food.food_name}</td><td className="px-4 py-3">{food.calories}</td><td className="px-4 py-3 text-slate-600">{food.category || "-"}</td><td className="px-4 py-3 text-slate-600">{food.aliases || "-"}</td></tr>)}</tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
