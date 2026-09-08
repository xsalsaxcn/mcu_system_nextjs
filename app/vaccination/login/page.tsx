"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function VaccinationLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function checkSession() {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        const role = String(data?.user?.role || "").trim().toLowerCase();

        if (
          active &&
          data?.ok &&
          data?.user &&
          (role === "admin" || role.startsWith("vaccination_"))
        ) {
          // VACCINATION_MEDIS_WORKSPACE_V150_3
          router.replace(role === "vaccination_medis" ? "/vaccination/medis" : "/vaccination/portal");
          return;
        }
      } catch {
        // Login form remains available.
      } finally {
        if (active) setChecking(false);
      }
    }

    checkSession();
    return () => {
      active = false;
    };
  }, [router]);

  async function login(event: React.FormEvent) {
    event.preventDefault();

    if (!username.trim()) {
      setError("Username wajib diisi.");
      return;
    }
    if (!password.trim()) {
      setError("Password wajib diisi.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/vaccination/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.message || "Login gagal. Pastikan akun Anda adalah user Portal Vaksinasi.");
        return;
      }

      router.replace(data.redirect || "/vaccination/portal");
      router.refresh();
    } catch {
      setError("Tidak dapat terhubung ke server. Coba lagi.");
    } finally {
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 p-6">
        <div className="rounded-3xl bg-white px-6 py-5 text-sm font-bold text-slate-600 shadow-xl">
          Memeriksa sesi Portal Vaksinasi...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950">
      <div className="grid min-h-screen lg:grid-cols-[1.08fr_0.92fr]">
        <section className="relative hidden overflow-hidden bg-gradient-to-br from-blue-950 via-blue-800 to-emerald-600 p-10 text-white lg:flex lg:flex-col lg:justify-between">
          <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
          <div className="absolute -bottom-28 left-20 h-80 w-80 rounded-full bg-emerald-300/10 blur-3xl" />

          <div className="relative">
            <div className="inline-flex rounded-2xl bg-white/15 px-4 py-2 text-sm font-black backdrop-blur">
              inHARMONY · Vaccination Portal
            </div>
            <div className="mt-3 text-sm font-semibold text-blue-100">
              Dedicated Vaccination Operations
            </div>
          </div>

          <div className="relative max-w-2xl">
            <div className="text-5xl font-black leading-tight tracking-tight">
              Portal kerja khusus Tim Vaksinasi.
            </div>
            <p className="mt-5 max-w-xl text-base font-medium leading-8 text-blue-100">
              Akses ditampilkan sesuai role: Frontdesk, Medis, Tim Validasi,
              Inventory, Reporting, Supervisor, atau Admin Vaksinasi.
            </p>
            <div className="mt-8 grid max-w-xl gap-3 sm:grid-cols-3">
              <div className="rounded-2xl bg-white/10 p-4 backdrop-blur">
                <div className="text-2xl font-black">01</div>
                <div className="mt-1 text-xs font-semibold text-blue-100">Session & Queue</div>
              </div>
              <div className="rounded-2xl bg-white/10 p-4 backdrop-blur">
                <div className="text-2xl font-black">02</div>
                <div className="mt-1 text-xs font-semibold text-blue-100">Medis & Validasi</div>
              </div>
              <div className="rounded-2xl bg-white/10 p-4 backdrop-blur">
                <div className="text-2xl font-black">03</div>
                <div className="mt-1 text-xs font-semibold text-blue-100">Inventory & Report</div>
              </div>
            </div>
          </div>

          <div className="relative text-xs font-semibold text-blue-100">
            Harmony Health · Corporate Vaccination
          </div>
        </section>

        <section className="flex items-center justify-center bg-slate-50 p-6">
          <div className="w-full max-w-md">
            <div className="mb-6 lg:hidden">
              <div className="text-3xl font-black text-slate-900">Portal Vaksinasi</div>
              <div className="mt-1 text-sm font-medium text-slate-500">inHARMONY Corporate Vaccination</div>
            </div>

            <div className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-xl">
              <div>
                <div className="text-[11px] font-black uppercase tracking-[0.16em] text-blue-600">Vaccination Team Login</div>
                <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Masuk Portal Vaksinasi</h1>
                <p className="mt-2 text-sm font-medium leading-6 text-slate-500">
                  Gunakan username dan password yang dibuat oleh Admin Vaksinasi.
                </p>
              </div>

              {error ? (
                <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div>
              ) : null}

              <form autoComplete="off" onSubmit={login} className="mt-6 space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-black text-slate-700">Username</label>
                  <input
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    autoComplete="username"
                    placeholder="Masukkan username vaksinasi"
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  />
                </div>

                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <label className="text-sm font-black text-slate-700">Password</label>
                    <button type="button" onClick={() => setShowPassword((value) => !value)} className="text-xs font-black text-blue-600 hover:text-blue-700">
                      {showPassword ? "Sembunyikan" : "Tampilkan"}
                    </button>
                  </div>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="current-password"
                    placeholder="Masukkan password"
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  />
                </div>

                <button type="submit" disabled={loading} className="w-full rounded-2xl bg-blue-700 px-4 py-3 text-sm font-black text-white shadow-sm transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60">
                  {loading ? "Memproses..." : "Login Portal Vaksinasi"}
                </button>
              </form>

              <div className="mt-5 rounded-2xl bg-emerald-50 px-4 py-3 text-xs font-semibold leading-5 text-emerald-800">
                Hanya akun dengan role vaksinasi aktif yang dapat masuk melalui halaman ini. Admin sistem tetap dapat mengakses untuk pengelolaan.
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
