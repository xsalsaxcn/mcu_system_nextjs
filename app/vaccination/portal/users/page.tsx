"use client";

import { useEffect, useState } from "react";

// VACCINATION_DEDICATED_USER_ADMIN_UI_V150_1

export default function VaccinationPortalUsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [message, setMessage] = useState("Hanya user khusus program vaksinasi yang ditampilkan di halaman ini.");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState<number | string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ name: "", username: "", password: "", role: "vaccination_medis" });
  const [passwordTarget, setPasswordTarget] = useState<any>(null);
  const [newPassword, setNewPassword] = useState("");

  async function load() {
    setError("");
    const res = await fetch("/api/vaccination/portal/users", { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.ok) {
      setError(json.message || "Gagal mengambil user vaksinasi.");
      return;
    }
    setUsers(json.users || []);
    setRoles(json.roles || []);
  }

  useEffect(() => { load(); }, []);

  async function callApi(method: string, body: any) {
    const res = await fetch("/api/vaccination/portal/users", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.ok) throw new Error(json.message || "Operasi user vaksinasi gagal.");
    return json;
  }

  async function createUser() {
    setSaving("create");
    setError("");
    try {
      const json = await callApi("POST", { action: "CREATE_USER", ...addForm });
      setMessage(json.message || "User vaksinasi berhasil ditambahkan.");
      setAddForm({ name: "", username: "", password: "", role: "vaccination_medis" });
      setShowAdd(false);
      await load();
    } catch (err: any) {
      setError(err?.message || "Gagal menambahkan user vaksinasi.");
    } finally {
      setSaving(null);
    }
  }

  async function saveRole(userId: number, role: string) {
    setSaving(userId);
    setError("");
    try {
      const json = await callApi("POST", { action: "SET_ROLE", userId, role });
      setMessage(json.message || "Role berhasil disimpan.");
      await load();
    } catch (err: any) {
      setError(err?.message || "Gagal menyimpan role.");
    } finally {
      setSaving(null);
    }
  }

  async function savePassword() {
    if (!passwordTarget) return;
    setSaving(`password-${passwordTarget.id}`);
    setError("");
    try {
      const json = await callApi("POST", { action: "SET_PASSWORD", userId: passwordTarget.id, password: newPassword });
      setMessage(json.message || "Password berhasil diubah.");
      setPasswordTarget(null);
      setNewPassword("");
    } catch (err: any) {
      setError(err?.message || "Gagal mengubah password.");
    } finally {
      setSaving(null);
    }
  }

  async function removeUser(user: any) {
    if (!window.confirm(`Hapus user vaksinasi ${user.name || user.username}? Jika masih terkait histori, akun akan dinonaktifkan.`)) return;
    setSaving(`remove-${user.id}`);
    setError("");
    try {
      const json = await callApi("DELETE", { userId: user.id });
      setMessage(json.message || "User vaksinasi berhasil dihapus.");
      await load();
    } catch (err: any) {
      setError(err?.message || "Gagal menghapus user vaksinasi.");
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
            <h1 className="mt-1 text-2xl font-black">User & Role Tim Vaksinasi</h1>
            <p className="mt-1 text-sm text-blue-100">Dedicated user vaksinasi saja. Add, remove, role, dan setup password hanya tersedia untuk Admin Vaksinasi.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setShowAdd((value) => !value)} className="rounded-2xl bg-emerald-400 px-4 py-3 text-sm font-black text-emerald-950">+ Add User</button>
            <a href="/vaccination/portal" className="rounded-2xl bg-white px-4 py-3 text-sm font-black text-blue-900">Kembali ke Portal</a>
          </div>
        </div>

        {error ? <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{error}</div> : null}
        {message ? <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800">{message}</div> : null}

        {showAdd ? (
          <section className="mt-5 rounded-3xl border bg-white p-5 shadow-sm">
            <div className="text-lg font-black text-slate-900">Tambah User Vaksinasi</div>
            <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              <label className="grid gap-1 text-xs font-black uppercase text-slate-500">Nama<input className="rounded-xl border px-3 py-2.5 text-sm font-semibold normal-case text-slate-900" value={addForm.name} onChange={(e) => setAddForm((prev) => ({ ...prev, name: e.target.value }))} /></label>
              <label className="grid gap-1 text-xs font-black uppercase text-slate-500">Username<input className="rounded-xl border px-3 py-2.5 text-sm font-semibold normal-case text-slate-900" value={addForm.username} onChange={(e) => setAddForm((prev) => ({ ...prev, username: e.target.value }))} /></label>
              <label className="grid gap-1 text-xs font-black uppercase text-slate-500">Password<input type="password" className="rounded-xl border px-3 py-2.5 text-sm font-semibold normal-case text-slate-900" placeholder="Minimal 6 karakter" value={addForm.password} onChange={(e) => setAddForm((prev) => ({ ...prev, password: e.target.value }))} /></label>
              <label className="grid gap-1 text-xs font-black uppercase text-slate-500">Role<select className="rounded-xl border px-3 py-2.5 text-sm font-semibold normal-case text-slate-900" value={addForm.role} onChange={(e) => setAddForm((prev) => ({ ...prev, role: e.target.value }))}>{roles.map((role) => <option key={role} value={role}>{role}</option>)}</select></label>
            </div>
            <div className="mt-4 flex gap-2">
              <button type="button" disabled={saving === "create"} onClick={createUser} className="rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50">{saving === "create" ? "Menyimpan..." : "Simpan User"}</button>
              <button type="button" onClick={() => setShowAdd(false)} className="rounded-xl border px-4 py-2.5 text-sm font-black">Batal</button>
            </div>
          </section>
        ) : null}

        <section className="mt-5 overflow-hidden rounded-3xl border bg-white shadow-sm">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div><div className="font-black text-slate-900">Dedicated Vaccination Users</div><div className="text-xs text-slate-500">{users.length} user aktif</div></div>
            <button type="button" onClick={load} className="rounded-xl border px-3 py-2 text-xs font-black">Refresh</button>
          </div>
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-100 text-xs uppercase text-slate-600">
                <tr><th className="p-3 text-left">Nama</th><th className="p-3 text-left">Username</th><th className="p-3 text-left">Role Vaksinasi</th><th className="p-3 text-left">Program</th><th className="p-3 text-left">Aksi Admin</th></tr>
              </thead>
              <tbody className="divide-y">
                {users.map((user) => (
                  <tr key={user.id}>
                    <td className="p-3 font-bold">{user.name}</td>
                    <td className="p-3">{user.username}</td>
                    <td className="p-3">
                      <select disabled={saving === user.id} className="min-w-[190px] rounded-xl border px-3 py-2" value={user.role || ""} onChange={(e) => saveRole(user.id, e.target.value)}>
                        {roles.map((role) => <option key={role} value={role}>{role}</option>)}
                      </select>
                    </td>
                    <td className="p-3">vaccination</td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => { setPasswordTarget(user); setNewPassword(""); }} className="rounded-xl bg-blue-50 px-3 py-2 text-xs font-black text-blue-700">Setup Password</button>
                        <button type="button" disabled={saving === `remove-${user.id}`} onClick={() => removeUser(user)} className="rounded-xl bg-red-50 px-3 py-2 text-xs font-black text-red-700 disabled:opacity-50">Remove</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!users.length ? <tr><td colSpan={5} className="p-8 text-center text-slate-500">Belum ada dedicated user vaksinasi. Klik + Add User.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {passwordTarget ? (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setPasswordTarget(null); }}>
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <div className="text-lg font-black">Setup Password</div>
            <div className="mt-1 text-sm text-slate-500">{passwordTarget.name} · {passwordTarget.username}</div>
            <label className="mt-4 grid gap-1 text-xs font-black uppercase text-slate-500">Password Baru<input type="password" autoFocus className="rounded-xl border px-3 py-3 text-sm font-semibold normal-case text-slate-900" placeholder="Minimal 6 karakter" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} /></label>
            <div className="mt-4 flex gap-2">
              <button type="button" disabled={saving === `password-${passwordTarget.id}`} onClick={savePassword} className="rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50">Simpan Password</button>
              <button type="button" onClick={() => setPasswordTarget(null)} className="rounded-xl border px-4 py-2.5 text-sm font-black">Batal</button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
