"use client";

import { useEffect, useState } from "react";
import AuthGate from "@/components/AuthGate";

export default function MasterPage() {
  return (
    <AuthGate>
      {(user) => <MasterUsers user={user} />}
    </AuthGate>
  );
}

function MasterUsers({ user }: { user: any }) {
  const [users, setUsers] = useState<any[]>([]);
  const [message, setMessage] = useState("");

  async function load() {
    const res = await fetch("/api/master/users");
    const json = await res.json();
    setUsers(json.users || []);
  }

  async function seed() {
    setMessage("Memproses seed defaults...");
    const res = await fetch("/api/setup/seed-defaults", { method: "POST" });
    const json = await res.json();
    setMessage(json.ok ? "Default operator/post/parameter berhasil dibuat." : json.message || "Gagal seed defaults.");
    await load();
  }

  useEffect(() => {
    load();
  }, []);

  if (user.role !== "admin") return <div className="card p-5 text-red-700">Hanya admin.</div>;

  return (
    <div className="space-y-5">
      <section className="card p-5">
        <div className="text-2xl font-black">Master Users</div>
        <div className="mt-1 text-sm text-slate-500">Pastikan operator CAPASKA lengkap dan masing-masing terhubung ke post yang benar.</div>
        <button className="btn-primary mt-4" onClick={seed}>Seed / Refresh Default CAPASKA</button>
        {message && <div className="mt-3 rounded-xl bg-blue-50 p-3 text-sm font-semibold text-blue-700">{message}</div>}
      </section>

      <section className="mobile-table">
        <table>
          <thead>
            <tr>
              <th>Nama</th>
              <th>Username</th>
              <th>Role</th>
              <th>Post</th>
              <th>Program</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td className="font-bold">{u.name}</td>
                <td>{u.username}</td>
                <td>{u.role}</td>
                <td>{u.post_name}</td>
                <td>{u.program_type}</td>
                <td>{u.is_active ? "Aktif" : "Nonaktif"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
