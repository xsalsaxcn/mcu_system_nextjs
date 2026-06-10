"use client";

import { useEffect, useState } from "react";
import AuthGate from "@/components/AuthGate";

export default function WellnessProfilePage() {
  return <AuthGate>{() => <WellnessProfile />}</AuthGate>;
}

function WellnessProfile() {
  const [participants, setParticipants] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [form, setForm] = useState<any>({});
  const [message, setMessage] = useState("Profil peserta Wellness hanya dipakai untuk layanan Wellness.");

  async function load() {
    const json = await fetch("/api/wellness/participants", { cache: "no-store" }).then((r) => r.json()).catch(() => ({}));
    const list = json.participants || [];
    setParticipants(list);
    if (list.length) {
      setSelectedId(String(list[0].id));
      setForm(list[0]);
    }
  }

  useEffect(() => { load(); }, []);

  function choose(id: string) {
    setSelectedId(id);
    setForm(participants.find((p) => String(p.id) === id) || {});
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setMessage("Menyimpan profil...");
    const json = await fetch("/api/wellness/participants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    }).then((r) => r.json());
    if (!json.ok) {
      setMessage(json.message || "Gagal menyimpan profil.");
      return;
    }
    setMessage("Profil Wellness berhasil disimpan.");
    load();
  }

  async function syncStrava() {
    setMessage("Sinkronisasi Strava...");
    const json = await fetch("/api/wellness/strava/sync", { method: "POST" }).then((r) => r.json());
    setMessage(json.ok ? `Strava tersinkron: ${json.synced} aktivitas.` : json.message || "Gagal sync Strava.");
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[2rem] bg-gradient-to-r from-fuchsia-600 via-rose-600 to-orange-500 shadow-sm">
        <div className="p-7 text-white">
          <div className="text-3xl font-black">Profil Wellness</div>
          <div className="mt-2 max-w-3xl text-sm font-medium text-rose-50">Peserta dapat melihat dan mengelola profil Wellness miliknya sendiri. Admin/coach dapat memilih peserta.</div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <form onSubmit={submit} className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid gap-4 md:grid-cols-2">
            {participants.length > 1 ? (
              <label className="grid gap-2 text-sm font-bold text-slate-700 md:col-span-2">
                Pilih Peserta
                <select className="rounded-2xl border border-slate-300 px-4 py-3" value={selectedId} onChange={(e) => choose(e.target.value)}>
                  {participants.map((participant) => <option key={participant.id} value={participant.id}>{participant.name}</option>)}
                </select>
              </label>
            ) : null}
            <input className="rounded-2xl border border-slate-300 px-4 py-3 text-sm font-bold" placeholder="Nama" value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <input className="rounded-2xl border border-slate-300 px-4 py-3 text-sm font-bold" placeholder="Kode/NIK/Employee ID" value={form.code || ""} onChange={(e) => setForm({ ...form, code: e.target.value })} />
            <select className="rounded-2xl border border-slate-300 px-4 py-3 text-sm font-bold" value={form.gender || ""} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
              <option value="">Jenis Kelamin</option>
              <option value="Laki-laki">Laki-laki</option>
              <option value="Perempuan">Perempuan</option>
            </select>
            <input className="rounded-2xl border border-slate-300 px-4 py-3 text-sm font-bold" placeholder="No HP" value={form.phone || ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <input className="rounded-2xl border border-slate-300 px-4 py-3 text-sm font-bold" placeholder="Email" value={form.email || ""} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <input type="date" className="rounded-2xl border border-slate-300 px-4 py-3 text-sm font-bold" value={form.program_start_date || ""} onChange={(e) => setForm({ ...form, program_start_date: e.target.value })} />
            <input className="rounded-2xl border border-slate-300 px-4 py-3 text-sm font-bold" placeholder="Tinggi Badan (cm)" value={form.height_cm || ""} onChange={(e) => setForm({ ...form, height_cm: e.target.value })} />
            <input className="rounded-2xl border border-slate-300 px-4 py-3 text-sm font-bold" placeholder="Berat Awal (kg)" value={form.initial_weight_kg || ""} onChange={(e) => setForm({ ...form, initial_weight_kg: e.target.value })} />
            <input className="rounded-2xl border border-slate-300 px-4 py-3 text-sm font-bold" placeholder="Target Berat (kg)" value={form.target_weight_kg || ""} onChange={(e) => setForm({ ...form, target_weight_kg: e.target.value })} />
          </div>
          <button className="mt-5 w-full rounded-2xl bg-rose-600 px-5 py-4 text-sm font-black text-white shadow-sm hover:bg-rose-700">Simpan Profil</button>
        </form>

        <aside className="space-y-4">
          <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-lg font-black text-slate-900">Status</div>
            <div className="mt-3 rounded-2xl bg-slate-50 p-4 text-sm font-semibold leading-6 text-slate-600">{message}</div>
          </div>
          <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-lg font-black text-slate-900">Strava / Smartwatch</div>
            <div className="mt-2 text-sm font-semibold leading-6 text-slate-500">Opsional dan gratis untuk tahap awal. Smartwatch sync ke Strava, lalu Wellness mengambil aktivitas lewat API Strava jika env sudah diset.</div>
            <div className="mt-4 grid gap-2">
              <a href="/api/wellness/strava/connect" className="rounded-2xl bg-orange-500 px-4 py-3 text-center text-sm font-black text-white">Connect Strava</a>
              <button type="button" onClick={syncStrava} className="rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm font-black text-orange-700">Sync Strava</button>
            </div>
          </div>
        </aside>
      </section>
    </div>
  );
}
