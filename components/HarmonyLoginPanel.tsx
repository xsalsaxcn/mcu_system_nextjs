"use client";

import { useState } from "react";

export default function HarmonyLoginPanel({
  onLogin,
  error,
}: {
  onLogin?: (username: string, password: string) => void;
  error?: string;
}) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");

  return (
    <main className="min-h-screen bg-slate-950">
      <div className="grid min-h-screen lg:grid-cols-[1.1fr_0.9fr]">
        <section className="hidden bg-gradient-to-br from-blue-600 via-indigo-700 to-slate-950 p-10 text-white lg:flex lg:flex-col lg:justify-between">
          <div>
            <div className="text-2xl font-black">Harmony Health App</div>
            <div className="mt-2 text-sm font-semibold text-blue-100">Occupational health, MCU, and vaccination workflow.</div>
          </div>

          <div>
            <div className="max-w-xl text-5xl font-black leading-tight">
              Clinical operations dashboard yang rapi, cepat, dan terstruktur.
            </div>
            <p className="mt-5 max-w-lg text-sm leading-7 text-blue-100">
              Kelola MCU CAPASKA, MCU Corporate, vaksinasi perusahaan, antrian, dan laporan operasional dalam satu platform.
            </p>
          </div>

          <div className="text-xs font-semibold text-blue-100">© Harmony Health</div>
        </section>

        <section className="flex items-center justify-center bg-slate-50 p-6">
          <div className="w-full max-w-md rounded-[2rem] border border-slate-200 bg-white p-8 shadow-xl">
            <div>
              <div className="text-3xl font-black text-slate-900">Masuk</div>
              <div className="mt-2 text-sm font-medium text-slate-500">Login sesuai role petugas.</div>
            </div>

            {error ? (
              <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
                {error}
              </div>
            ) : null}

            <div className="mt-6 space-y-4">
              <div>
                <label className="mb-1 block text-sm font-black text-slate-700">Username</label>
                <input
                  className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm font-bold outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Username"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-black text-slate-700">Password</label>
                <input
                  className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm font-bold outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  type="password"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") onLogin?.(username, password);
                  }}
                />
              </div>

              <button
                type="button"
                onClick={() => onLogin?.(username, password)}
                className="w-full rounded-2xl bg-blue-600 px-4 py-3 text-sm font-black text-white shadow-sm transition hover:bg-blue-700"
              >
                Login
              </button>
            </div>

            <div className="mt-6 rounded-2xl bg-slate-50 p-4 text-xs leading-6 text-slate-500">
              <b className="text-slate-700">User awal</b>
              <br />
              admin / admin123
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
