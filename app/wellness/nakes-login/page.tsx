"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

function safeNext(value: string | null) {
  if (!value || !value.startsWith("/wellness/nakes-input")) {
    return "/wellness/nakes-input";
  }
  return value;
}

export default function WellnessNakesLoginPage() {
  const router = useRouter();
  const [next, setNext] = useState("/wellness/nakes-input");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const resolvedNext = safeNext(
      new URLSearchParams(window.location.search).get("next"),
    );
    setNext(resolvedNext);

    fetch("/api/wellness/nakes/session", {
      cache: "no-store",
      credentials: "include",
    })
      .then((response) => response.json().catch(() => ({})))
      .then((result) => {
        if (result?.ok) router.replace(resolvedNext);
      })
      .finally(() => setChecking(false));
  }, [router]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!username.trim() || !password) {
      setMessage("Username dan password wajib diisi.");
      return;
    }

    setLoading(true);
    setMessage("");

    const result: any = await fetch("/api/wellness/nakes/session", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: username.trim(), password }),
    })
      .then(async (response) => ({
        ...(await response.json().catch(() => ({}))),
        http_status: response.status,
      }))
      .catch((error) => ({
        ok: false,
        message: error?.message || "Tidak dapat terhubung ke server.",
      }));

    if (!result.ok) {
      setMessage(result.message || "Login NAKES gagal.");
      setLoading(false);
      return;
    }

    router.replace(next);
  }

  if (checking) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f4f8fb] px-4">
        <div className="text-sm font-black text-slate-600">Memeriksa session NAKES...</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_#dff8f4,_transparent_35%),linear-gradient(180deg,#f8fbfd_0%,#eef7f6_100%)] px-4 py-10 text-slate-950">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-md items-center">
        <section className="w-full overflow-hidden rounded-[2rem] border border-white/80 bg-white shadow-2xl shadow-slate-300/50">
          <div className="bg-gradient-to-r from-teal-600 via-cyan-600 to-blue-600 px-6 py-5 text-white">
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white/75">
              Harmony Health
            </div>
            <div className="mt-1 text-xl font-black">Portal NAKES</div>
          </div>

          <div className="p-6 sm:p-8">
            <div className="flex flex-col items-center text-center">
              <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-3xl bg-teal-50 ring-1 ring-teal-100">
                <Image
                  src="/wellness-pwa/icon-192.png"
                  alt="Harmony Health"
                  width={80}
                  height={80}
                  className="h-16 w-16 object-contain"
                  priority
                />
              </div>
              <h1 className="mt-5 text-2xl font-black">Login NAKES</h1>
              <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
                Masuk menggunakan username dan password yang dibuat oleh Administrator.
              </p>
            </div>

            <form onSubmit={submit} className="mt-7 space-y-4">
              {message ? (
                <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
                  {message}
                </div>
              ) : null}

              <label className="grid gap-2 text-sm font-black text-slate-700">
                Username
                <input
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  placeholder="Masukkan username"
                  className="h-14 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none transition focus:border-teal-400 focus:ring-4 focus:ring-teal-100"
                />
              </label>

              <label className="grid gap-2 text-sm font-black text-slate-700">
                <span className="flex items-center justify-between gap-3">
                  Password
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    className="text-xs font-black text-teal-700"
                  >
                    {showPassword ? "Sembunyikan" : "Tampilkan"}
                  </button>
                </span>
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  placeholder="Masukkan password"
                  className="h-14 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none transition focus:border-teal-400 focus:ring-4 focus:ring-teal-100"
                />
              </label>

              <button
                type="submit"
                disabled={loading}
                className="h-14 w-full rounded-2xl bg-slate-950 text-sm font-black text-white shadow-lg transition hover:bg-slate-800 disabled:opacity-60"
              >
                {loading ? "Memproses..." : "Masuk ke Form NAKES"}
              </button>
            </form>

            <div className="mt-6 rounded-2xl bg-teal-50 px-4 py-3 text-xs font-bold leading-5 text-teal-800">
              Akses ini khusus tenaga kesehatan yang telah didaftarkan oleh Administrator.
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
