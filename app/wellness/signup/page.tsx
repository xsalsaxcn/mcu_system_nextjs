"use client";

import { useState } from "react";

export default function WellnessSignupPage() {
  const [step, setStep] = useState<"request" | "verify">("request");

  const [form, setForm] = useState({
    employee_no: "",
    email: "",
    phone: "",
    otp: "",
  });

  const [message, setMessage] = useState(
    "Masukkan No Karyawan yang sudah didaftarkan oleh admin Wellness."
  );

  const [loading, setLoading] = useState(false);

  function update(key: string, value: string) {
    setForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  async function requestOtp(event: React.FormEvent) {
    event.preventDefault();

    setLoading(true);
    setMessage("Mengecek data karyawan dan mengirim OTP ke email...");

    const json = await fetch("/api/wellness/signup/request-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    })
      .then((r) => r.json())
      .catch(() => ({ ok: false, message: "Gagal menghubungi server." }));

    setLoading(false);

    if (!json.ok) {
      setMessage(json.message || "Gagal membuat OTP.");
      return;
    }

    setStep("verify");
    setMessage(json.message || "OTP sudah dikirim ke email. Silakan cek inbox email Anda.");
  }

  async function verifyOtp(event: React.FormEvent) {
    event.preventDefault();

    setLoading(true);
    setMessage("Memverifikasi OTP dan membuat akses peserta...");

    const json = await fetch("/api/wellness/signup/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    })
      .then((r) => r.json())
      .catch(() => ({ ok: false, message: "Gagal menghubungi server." }));

    setLoading(false);

    if (!json.ok) {
      setMessage(json.message || "OTP tidak valid.");
      return;
    }

    // WELLNESS_SIGNUP_RETURN_LOGIN_V88_1
    setMessage(
      "Sign Up berhasil. Mengalihkan ke halaman Login...",
    );

    // Signup verification creates a participant session. Clear only that cookie
    // so the next screen is Login, without changing API or database rules.
    await fetch("/api/wellness/participant/me", {
      method: "DELETE",
    }).catch(() => null);

    setTimeout(() => {
      window.location.replace("/wellness/portal");
    }, 1800);
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#f4fbfa] px-4 py-8 text-slate-900 md:px-8 md:py-10">
      {/* WELLNESS_AUTH_UI_UX_V88 */}
      <div className="relative mx-auto max-w-xl">
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[2.5rem]">
          <div className="absolute -left-24 top-12 h-56 w-56 rounded-full bg-cyan-100/55 blur-3xl" />
          <div className="absolute -right-20 bottom-8 h-64 w-64 rounded-full bg-teal-100/60 blur-3xl" />
        </div>

        <div className="relative z-10">
          <div className="mb-6 text-center">
            <img
              src="/wellness-pwa/icon-192.png"
              alt="Harmony Health"
              className="mx-auto h-20 w-20 rounded-[1.6rem] shadow-xl shadow-blue-950/10"
            />
            <div className="mt-4 text-2xl font-black tracking-tight text-slate-950">
              Harmony Health
            </div>
            <div className="mt-1 text-xs font-black uppercase tracking-[0.2em] text-teal-600">
              Wellness Participant Portal
            </div>
          </div>

          <section className="rounded-[2.25rem] border border-white/80 bg-white/95 p-6 shadow-2xl shadow-slate-200/70 backdrop-blur md:p-8">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-50 to-teal-100 text-teal-700">
                <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3 5.5 6v5.2c0 4.1 2.7 7.9 6.5 9.1 3.8-1.2 6.5-5 6.5-9.1V6L12 3Z" />
                  <circle cx="12" cy="9.5" r="2" />
                  <path strokeLinecap="round" d="M8.8 15.8c.5-2.2 1.5-3.2 3.2-3.2s2.7 1 3.2 3.2" />
                </svg>
              </div>
              <div className="min-w-0">
                <h1 className="text-3xl font-black tracking-tight text-slate-950">
                  {step === "request" ? "Sign Up Peserta" : "Verifikasi OTP"}
                </h1>
                <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">
                  {step === "request"
                    ? "Lengkapi data untuk aktivasi akun portal peserta."
                    : "Masukkan kode OTP yang sudah dikirim ke email Anda."}
                </p>
              </div>
            </div>

            <div className="mt-5 rounded-[1.5rem] border border-teal-100 bg-gradient-to-br from-teal-50 to-cyan-50 p-4 text-teal-950">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-600 text-sm font-black text-white">
                  i
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-black">
                    {step === "request" ? "Informasi Pendaftaran" : "Status Verifikasi"}
                  </div>
                  <div className="mt-1 whitespace-pre-line text-xs font-bold leading-5 text-teal-800/80">
                    {message}
                  </div>
                </div>
              </div>
            </div>

            {step === "request" ? (
              <form onSubmit={requestOtp} className="mt-6 grid gap-5">
                <label className="grid gap-2 text-sm font-black text-slate-700">
                  Kode Karyawan
                  <div className="flex items-center rounded-2xl border border-slate-200 bg-white px-4 shadow-sm transition focus-within:border-teal-400 focus-within:ring-4 focus-within:ring-teal-100">
                    <span className="mr-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-600">
                      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                        <circle cx="12" cy="8" r="3" />
                        <path strokeLinecap="round" d="M5.5 20c.5-4 2.7-6 6.5-6s6 2 6.5 6" />
                      </svg>
                    </span>
                    <input
                      className="min-w-0 flex-1 bg-transparent py-4 text-sm font-bold text-slate-900 outline-none placeholder:text-slate-400"
                      placeholder="Contoh: 278"
                      value={form.employee_no}
                      onChange={(e) => update("employee_no", e.target.value)}
                      required
                    />
                  </div>
                </label>

                <label className="grid gap-2 text-sm font-black text-slate-700">
                  Email
                  <div className="flex items-center rounded-2xl border border-slate-200 bg-white px-4 shadow-sm transition focus-within:border-teal-400 focus-within:ring-4 focus-within:ring-teal-100">
                    <span className="mr-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-600">
                      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                        <rect x="3.5" y="5" width="17" height="14" rx="2" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="m5 7 7 5 7-5" />
                      </svg>
                    </span>
                    <input
                      type="email"
                      className="min-w-0 flex-1 bg-transparent py-4 text-sm font-bold text-slate-900 outline-none placeholder:text-slate-400"
                      placeholder="nama@email.com"
                      value={form.email}
                      onChange={(e) => update("email", e.target.value)}
                      required
                    />
                  </div>
                </label>

                <label className="grid gap-2 text-sm font-black text-slate-700">
                  Nomor HP
                  <div className="flex items-center rounded-2xl border border-slate-200 bg-white px-4 shadow-sm transition focus-within:border-teal-400 focus-within:ring-4 focus-within:ring-teal-100">
                    <span className="mr-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-600">
                      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 3.8 5.2 5.2c-.8.5-1.2 1.4-.9 2.3 1.8 6 6.2 10.4 12.2 12.2.9.3 1.8-.1 2.3-.9l1.4-2.3-4.2-2-1.2 1.8a13.2 13.2 0 0 1-7.1-7.1L9.5 8l-2-4.2Z" />
                      </svg>
                    </span>
                    <input
                      inputMode="tel"
                      className="min-w-0 flex-1 bg-transparent py-4 text-sm font-bold text-slate-900 outline-none placeholder:text-slate-400"
                      placeholder="08xxxxxxxxxx"
                      value={form.phone}
                      onChange={(e) => update("phone", e.target.value)}
                      required
                    />
                  </div>
                </label>

                <button
                  disabled={loading}
                  className="mt-1 flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-teal-600 to-cyan-700 px-5 py-4 text-sm font-black text-white shadow-xl shadow-teal-100 transition hover:-translate-y-0.5 hover:shadow-2xl active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? "Mengirim OTP..." : "Daftar & Kirim OTP"}
                  {!loading ? (
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m21 3-7.5 18-2.4-8.1L3 10.5 21 3Z" />
                    </svg>
                  ) : null}
                </button>
              </form>
            ) : (
              <form onSubmit={verifyOtp} className="mt-6 grid gap-5">
                <div className="grid gap-2 rounded-2xl border border-slate-100 bg-slate-50 p-4 text-xs font-bold text-slate-500">
                  <div className="flex justify-between gap-4">
                    <span>Kode Karyawan</span>
                    <span className="text-right font-black text-slate-900">{form.employee_no}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span>Email</span>
                    <span className="min-w-0 break-all text-right font-black text-slate-900">{form.email}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span>Nomor HP</span>
                    <span className="text-right font-black text-slate-900">{form.phone}</span>
                  </div>
                </div>

                <label className="grid gap-2 text-sm font-black text-slate-700">
                  Kode OTP
                  <div className="flex items-center rounded-2xl border border-slate-200 bg-white px-4 shadow-sm transition focus-within:border-teal-400 focus-within:ring-4 focus-within:ring-teal-100">
                    <span className="mr-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-600">
                      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                        <circle cx="8" cy="12" r="3" />
                        <path strokeLinecap="round" d="M11 12h9M17 12v3M14 12v2" />
                      </svg>
                    </span>
                    <input
                      inputMode="numeric"
                      className="min-w-0 flex-1 bg-transparent py-4 text-center text-lg font-black tracking-[0.25em] text-slate-900 outline-none placeholder:text-sm placeholder:font-bold placeholder:tracking-normal placeholder:text-slate-400"
                      placeholder="6 digit OTP"
                      value={form.otp}
                      onChange={(e) => update("otp", e.target.value)}
                      required
                    />
                  </div>
                </label>

                <button
                  disabled={loading}
                  className="mt-1 rounded-2xl bg-gradient-to-r from-teal-600 to-cyan-700 px-5 py-4 text-sm font-black text-white shadow-xl shadow-teal-100 transition hover:-translate-y-0.5 hover:shadow-2xl active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? "Memverifikasi..." : "Aktivasi Akun"}
                </button>

                <button
                  type="button"
                  onClick={() => setStep("request")}
                  className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-600 transition hover:border-teal-200 hover:bg-teal-50 hover:text-teal-700"
                >
                  Ubah Data
                </button>
              </form>
            )}

            <div className="mt-7 flex items-center gap-3">
              <span className="h-px flex-1 bg-slate-200" />
              <svg viewBox="0 0 24 24" className="h-5 w-5 text-teal-400" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3 5.5 6v5.2c0 4.1 2.7 7.9 6.5 9.1 3.8-1.2 6.5-5 6.5-9.1V6L12 3Z" />
              </svg>
              <span className="h-px flex-1 bg-slate-200" />
            </div>

            <div className="mt-5 text-center text-sm font-semibold text-slate-500">
              Sudah punya akun?
              <a
                href="/wellness/portal"
                className="ml-2 font-black text-teal-700 transition hover:text-teal-900 hover:underline"
              >
                Login
              </a>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}