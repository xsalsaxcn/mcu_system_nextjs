"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

type UserRow = {
  id: number;
  name: string;
  username: string;
  role: string;
  program_type: string;
  is_active: number | boolean;
};

const emptyForm = {
  id: 0,
  name: "",
  username: "",
  password: "",
  is_active: 1,
};

function isActive(value: any) {
  return ![false, 0, "0", "false"].includes(value);
}

export default function NakesUsersAdminPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [form, setForm] = useState<any>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    const result: any = await fetch("/api/wellness/admin/nakes-users", {
      cache: "no-store",
      credentials: "include",
    })
      .then(async (response) => ({
        ...(await response.json().catch(() => ({}))),
        http_status: response.status,
      }))
      .catch((err) => ({ ok: false, message: err?.message || "Network error" }));

    if (!result.ok) {
      setError(result.message || "Gagal memuat User NAKES.");
      if ([401, 403].includes(Number(result.http_status))) {
        window.setTimeout(() => window.location.replace("/wellness/admin"), 1200);
      }
    } else {
      setUsers(result.users || []);
      setError("");
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function edit(user: UserRow) {
    setForm({
      id: user.id,
      name: user.name || "",
      username: user.username || "",
      password: "",
      is_active: isActive(user.is_active) ? 1 : 0,
    });
    setMessage("");
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");

    const result: any = await fetch("/api/wellness/admin/nakes-users", {
      method: form.id ? "PATCH" : "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    })
      .then((response) => response.json().catch(() => ({})))
      .catch((err) => ({ ok: false, message: err?.message || "Network error" }));

    if (!result.ok) setError(result.message || "Gagal menyimpan User NAKES.");
    else {
      setMessage(result.message || "User NAKES berhasil disimpan.");
      setForm(emptyForm);
      await load();
    }
    setSaving(false);
  }

  async function remove(user: UserRow) {
    if (!window.confirm(`Hapus User NAKES ${user.name || user.username}?`)) return;
    setMessage("");
    setError("");

    const result: any = await fetch("/api/wellness/admin/nakes-users", {
      method: "DELETE",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: user.id }),
    })
      .then((response) => response.json().catch(() => ({})))
      .catch((err) => ({ ok: false, message: err?.message || "Network error" }));

    if (!result.ok) setError(result.message || "Gagal menghapus User NAKES.");
    else {
      setMessage(result.message || "User NAKES berhasil dihapus.");
      if (Number(form.id) === Number(user.id)) setForm(emptyForm);
      await load();
    }
  }

  return (
    <main className="min-h-screen bg-[#f4f8fb] px-4 py-6 text-slate-950 md:px-8">
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-xl shadow-slate-200/50">
          <div className="bg-gradient-to-r from-slate-950 via-blue-900 to-teal-600 p-5 text-white md:p-6">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl bg-white/15">
                  <Image src="/wellness-pwa/icon-192.png" alt="Harmony Health" width={56} height={56} className="h-12 w-12 object-contain" />
                </div>
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.16em] text-white/65">Harmony Health Admin</div>
                  <h1 className="mt-1 text-2xl font-black">User NAKES</h1>
                  <p className="mt-1 text-xs font-bold text-white/75">Tambah, edit, aktifkan, nonaktifkan, atau hapus akses Form NAKES.</p>
                </div>
              </div>
              <a href="/wellness/admin" className="rounded-2xl bg-white/15 px-4 py-3 text-xs font-black text-white ring-1 ring-white/20">← Portal Admin</a>
            </div>
          </div>
        </header>

        <div className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
          <form onSubmit={save} className="h-fit rounded-[2rem] border border-slate-200 bg-white p-5 shadow-lg shadow-slate-200/50 lg:sticky lg:top-5">
            <div className="text-lg font-black">{form.id ? "Edit User NAKES" : "Tambah User NAKES"}</div>
            <p className="mt-1 text-xs font-bold leading-5 text-slate-500">Login NAKES hanya menggunakan username dan password.</p>

            <div className="mt-5 space-y-4">
              <label className="grid gap-2 text-sm font-black text-slate-700">Nama Lengkap<input value={form.name} onChange={(e) => setForm((p: any) => ({ ...p, name: e.target.value }))} className="h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-100" placeholder="Nama NAKES" /></label>
              <label className="grid gap-2 text-sm font-black text-slate-700">Username<input value={form.username} onChange={(e) => setForm((p: any) => ({ ...p, username: e.target.value }))} className="h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-100" placeholder="username" autoCapitalize="none" /></label>
              <label className="grid gap-2 text-sm font-black text-slate-700">{form.id ? "Password Baru (opsional)" : "Password"}<input type="password" value={form.password} onChange={(e) => setForm((p: any) => ({ ...p, password: e.target.value }))} className="h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-100" placeholder={form.id ? "Kosongkan bila tidak diubah" : "Minimal 6 karakter"} autoComplete="new-password" /></label>
              {form.id ? <label className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm font-black"><span>Status aktif</span><input type="checkbox" checked={Boolean(form.is_active)} onChange={(e) => setForm((p: any) => ({ ...p, is_active: e.target.checked ? 1 : 0 }))} className="h-5 w-5 accent-teal-600" /></label> : null}
            </div>

            {error ? <div className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{error}</div> : null}
            {message ? <div className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">{message}</div> : null}

            <div className="mt-5 grid grid-cols-2 gap-3">
              {form.id ? <button type="button" onClick={() => setForm(emptyForm)} className="h-12 rounded-2xl bg-slate-100 text-sm font-black text-slate-700">Batal</button> : <div />}
              <button type="submit" disabled={saving} className="h-12 rounded-2xl bg-slate-950 text-sm font-black text-white disabled:opacity-60">{saving ? "Menyimpan..." : form.id ? "Simpan Perubahan" : "Tambah User"}</button>
            </div>
          </form>

          <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-lg shadow-slate-200/50">
            <div className="flex items-center justify-between gap-3">
              <div><div className="text-lg font-black">Daftar User NAKES</div><div className="mt-1 text-xs font-bold text-slate-500">{users.length} user terdaftar</div></div>
              <button type="button" onClick={load} className="rounded-2xl bg-teal-50 px-4 py-2.5 text-xs font-black text-teal-700">Refresh</button>
            </div>

            {loading ? <div className="py-12 text-center text-sm font-black text-slate-500">Memuat User NAKES...</div> : users.length ? <div className="mt-5 grid gap-3">{users.map((user) => <article key={user.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><div className="truncate text-base font-black">{user.name}</div><span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${isActive(user.is_active) ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>{isActive(user.is_active) ? "Aktif" : "Nonaktif"}</span></div><div className="mt-1 text-sm font-bold text-slate-500">@{user.username}</div></div><div className="flex shrink-0 gap-2"><button type="button" onClick={() => edit(user)} className="rounded-xl bg-blue-50 px-4 py-2.5 text-xs font-black text-blue-700">Edit</button><button type="button" onClick={() => remove(user)} className="rounded-xl bg-rose-50 px-4 py-2.5 text-xs font-black text-rose-700">Hapus</button></div></div></article>)}</div> : <div className="mt-5 rounded-2xl border border-dashed border-slate-200 px-5 py-12 text-center text-sm font-bold text-slate-500">Belum ada User NAKES. Tambahkan user pertama melalui form di sebelah kiri.</div>}
          </section>
        </div>
      </div>
    </main>
  );
}
