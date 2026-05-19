"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("admin123");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();

    setLoading(false);

    if (!data.ok) {
      setError(data.message || "Login gagal.");
      return;
    }

    router.replace("/dashboard");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 via-white to-slate-100 p-4">
      <div className="card w-full max-w-md p-6">
        <div className="mb-6">
          <div className="text-2xl font-black text-slate-900">MCU System</div>
          <div className="mt-1 text-sm text-slate-500">Login sesuai role petugas</div>
        </div>

        <form onSubmit={login} className="space-y-4">
          <div>
            <label className="label">Username</label>
            <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} />
          </div>

          <div>
            <label className="label">Password</label>
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>

          {error && <div className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>}

          <button className="btn-primary w-full" disabled={loading}>
            {loading ? "Memproses..." : "Login"}
          </button>
        </form>

        <div className="mt-5 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
          <div className="font-bold text-slate-700">User awal</div>
          <div>admin / admin123</div>
          <div className="mt-2 font-bold text-slate-700">Operator CAPASKA</div>
          <div>capaska_mata / mata123, capaska_tht / tht123, capaska_radiologi / radiologi123</div>
        </div>
      </div>
    </div>
  );
}
