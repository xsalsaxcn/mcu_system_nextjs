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

    setMessage(
  "✅ Sign Up berhasil.\n\nMengalihkan ke halaman Login...",
);

setTimeout(() => {
  window.location.replace("/wellness/portal");
}, 1800);
  }

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8 flex justify-center items-start">
      <div className="w-full max-w-lg space-y-6">

        {/* Hero / Informasi */}
        <section className="overflow-hidden rounded-2xl bg-gradient-to-br from-purple-600 via-pink-600 to-orange-500 p-8 text-white shadow-md">
          <h1 className="text-3xl font-extrabold">Daftar Wellness</h1>
          <p className="mt-2 text-sm font-semibold text-rose-100">
            Aktivasi akun peserta menggunakan No Karyawan, email, nomor HP, dan OTP melalui email.
          </p>
        </section>

        {/* Form Card */}
        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-md">
          {/* Status Message */}
          <div className="mb-5 rounded-xl bg-gray-100 px-4 py-3 text-sm font-bold text-gray-700">
            {message}
          </div>

          {/* Form Request OTP */}
          {step === "request" ? (
            <form onSubmit={requestOtp} className="grid gap-4">
              <input
                className="rounded-xl border border-gray-300 px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-blue-500 focus:outline-none"
                placeholder="No Karyawan"
                value={form.employee_no}
                onChange={(e) => update("employee_no", e.target.value)}
                required
              />
              <input
                type="email"
                className="rounded-xl border border-gray-300 px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-blue-500 focus:outline-none"
                placeholder="Email"
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
                required
              />
              <input
                className="rounded-xl border border-gray-300 px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-blue-500 focus:outline-none"
                placeholder="No HP"
                value={form.phone}
                onChange={(e) => update("phone", e.target.value)}
                required
              />

              <button
                disabled={loading}
                className="rounded-xl bg-rose-600 px-5 py-3 text-sm font-bold text-white shadow hover:bg-rose-700 disabled:opacity-60"
              >
                {loading ? "Mengirim..." : "Kirim OTP"}
              </button>

              {/* Sign Up Link */}
              <div className="mt-4 text-center text-sm text-gray-500">
                Belum punya akun?
                <a
                  href="/wellness/signup"
                  className="ml-2 font-bold text-blue-600 hover:underline"
                >
                  Sign Up
                </a>
              </div>
            </form>
          ) : (
            /* Form Verify OTP */
            <form onSubmit={verifyOtp} className="grid gap-4">
              <div className="grid gap-2 rounded-xl bg-gray-50 p-4 text-sm font-bold text-gray-600">
                <div>No Karyawan: <span className="text-gray-900">{form.employee_no}</span></div>
                <div>Email: <span className="text-gray-900">{form.email}</span></div>
                <div>No HP: <span className="text-gray-900">{form.phone}</span></div>
              </div>

              <input
                className="rounded-xl border border-gray-300 px-4 py-3 text-center text-xl font-black tracking-wide focus:ring-2 focus:ring-blue-500 focus:outline-none"
                placeholder="OTP"
                value={form.otp}
                onChange={(e) => update("otp", e.target.value)}
                required
              />

              <button
                disabled={loading}
                className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white shadow hover:bg-emerald-700 disabled:opacity-60"
              >
                {loading ? "Memverifikasi..." : "Aktivasi Akun"}
              </button>

              <button
                type="button"
                onClick={() => setStep("request")}
                className="rounded-xl border border-gray-300 px-5 py-3 text-sm font-bold text-gray-700 hover:bg-gray-50"
              >
                Ubah Data
              </button>
            </form>
          )}
        </section>

        {/* Login Redirect */}
        <div className="text-center text-sm font-semibold text-gray-500">
          Sudah punya akun?
          <a className="ml-1 font-bold text-blue-700 hover:underline" href="/wellness/portal">
            Login
          </a>
        </div>
      </div>
    </main>
  );
}