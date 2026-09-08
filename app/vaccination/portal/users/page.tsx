"use client";

import { useEffect, useState } from "react";

export default function VaccinationPortalUsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [message, setMessage] = useState("Assign role dedicated vaksinasi ke user existing.");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState<number | null>(null);

  async function load() {
    setError("");
    const res = await fetch("/api/vaccination/portal/users", { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.ok) {
      setError(json.message || "Gagal mengambil user.");
      return;
    }
    setUsers(json.users || []);
    setRoles(json.roles || []);
  }

  useEffect(() => { load(); }, []);

  async function save(userId: number, role: string) {
    setSaving(userId);
    setError("");
    try {
      const res = await fetch("/api/vaccination/portal/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setError(json.message || "Gagal menyimpan role.");
        return;
      }
      setMessage(json.message || "Role berhasil disimpan.");
      await load();
    } finally {
      setSaving(null);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col gap-3 rounded-3xl bg-gradient-to-br from-blue-950 via-blue-800 to-emerald-600 p-6 text-white shadow-lg md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.16em] text-blue-100">Vaccination Portal</div>
            <h1 className="mt-1 text-2xl font-black">Role Tim Vaksinasi</h1>
            <p className="mt-1 text-sm text-blue-100">Role disimpan di user existing. Setelah perubahan, user perlu login ulang.</p>
          </div>
          <a href="/vaccination/portal" className="rounded-2xl bg-white px-4 py-3 text-sm font-black text-blue-900">Kembali ke Portal</a>
        </div>

        {error ? <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{error}</div> : null}
        {message ? <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800">{message}</div> : null}

        <section className="mt-5 overflow-hidden rounded-3xl border bg-white shadow-sm">
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-100 text-xs uppercase text-slate-600">
                <tr><th className="p-3 text-left">Nama</th><th className="p-3 text-left">Username</th><th className="p-3 text-left">Role Saat Ini</th><th className="p-3 text-left">Program</th><th className="p-3 text-left">Assign Role Vaksinasi</th></tr>
              </thead>
              <tbody className="divide-y">
                {users.map((user) => (
                  <tr key={user.id}>
                    <td className="p-3 font-bold">{user.name}</td>
                    <td className="p-3">{user.username}</td>
                    <td className="p-3">{user.role}</td>
                    <td className="p-3">{user.program_type}</td>
                    <td className="p-3">
                      <select disabled={saving === user.id} className="rounded-xl border px-3 py-2" defaultValue="" onChange={(e) => { if (e.target.value) save(user.id, e.target.value); }}>
                        <option value="">Pilih role...</option>
                        {roles.map((role) => <option key={role} value={role}>{role}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
