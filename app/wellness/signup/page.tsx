"use client";

import { useState } from "react";

export default function WellnessSignupPage() {
  const [step, setStep] = useState<"request" | "verify">("request");
  const [form, setForm] = useState({ employee_no: "", email: "", phone: "", otp: "" });
  const [message, setMessage] = useState("Masukkan No Karyawan yang sudah didaftarkan oleh admin Wellness.");
  const [debugOtp, setDebugOtp] = useState("");
  const [loading, setLoading] = useState(false);

  function update(key: string, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function requestOtp(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setDebugOtp("");
    setMessage("Mengecek data karyawan dan membuat OTP...");
    const json = await fetch("/api/wellness/signup/request-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    }).then((r) => r.json()).catch(() => ({ ok: false, message: "Gagal menghubungi server." }));
    setLoading(false);
    if (!json.ok) {
      setMessage(json.message || "Gagal membuat OTP.");
      return;
    }
    setStep("verify");
    setDebugOtp(json.debug_otp || "");
    setMessage(json.message || "OTP dibuat. Masukkan kode OTP untuk aktivasi akun Wellness.");
  }

  async function verifyOtp(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage("Memverifikasi OTP dan membuat akses peserta...");
    const json = await fetch("/api/wellness/signup/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    }).then((r) => r.json()).catch(() => ({ ok: false, message: "Gagal menghubungi server." }));
    setLoading(false);
    if (!json.ok) {
      setMessage(json.message || "OTP tidak valid.");
      return;
    }
    setMessage("Signup berhasil. Mengarahkan ke dashboard Wellness...");
    window.location.href = json.redirect || "/wellness/dashboard";
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <section className="overflow-hidden rounded-[2rem] bg-gradient-to-br from-fuchsia-600 via-rose-600 to-orange-500 shadow-sm">
          <div className="p-7 text-white">
            <div className="text-3xl font-black">Daftar Wellness</div>
            <div className="mt-2 text-sm font-semibold text-rose-50">Aktivasi akun peserta memakai No Karyawan, email, no HP, dan OTP.</div>
          </div>
        </section>

        <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 rounded-2xl bg-slate-100 px-4 py-3 text-sm font-bold leading-6 text-slate-700">{message}</div>

          {debugOtp ? (
            <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold leading-6 text-amber-800">
              Mode gratis/testing: OTP kamu <span className="text-xl font-black tracking-widest">{debugOtp}</span>. Untuk publik penuh, hubungkan email/WhatsApp gateway agar OTP tidak tampil di layar.
            </div>
          ) : null}

          {step === "request" ? (
            <form onSubmit={requestOtp} className="grid gap-4">
              <input className="rounded-2xl border border-slate-300 px-4 py-3 text-sm font-bold" placeholder="No Karyawan" value={form.employee_no} onChange={(e) => update("employee_no", e.target.value)} required />
              <input type="email" className="rounded-2xl border border-slate-300 px-4 py-3 text-sm font-bold" placeholder="Email" value={form.email} onChange={(e) => update("email", e.target.value)} required />
              <input className="rounded-2xl border border-slate-300 px-4 py-3 text-sm font-bold" placeholder="No HP / WhatsApp" value={form.phone} onChange={(e) => update("phone", e.target.value)} required />
              <button disabled={loading} className="rounded-2xl bg-rose-600 px-5 py-4 text-sm font-black text-white shadow-sm disabled:opacity-60">{loading ? "Memproses..." : "Kirim OTP"}</button>
            </form>
          ) : (
            <form onSubmit={verifyOtp} className="grid gap-4">
              <div className="grid gap-2 rounded-2xl bg-slate-50 p-4 text-sm font-bold text-slate-600">
                <div>No Karyawan: <span className="text-slate-900">{form.employee_no}</span></div>
                <div>Email: <span className="text-slate-900">{form.email}</span></div>
                <div>No HP: <span className="text-slate-900">{form.phone}</span></div>
              </div>
              <input className="rounded-2xl border border-slate-300 px-4 py-3 text-center text-xl font-black tracking-[0.35em]" placeholder="OTP" value={form.otp} onChange={(e) => update("otp", e.target.value)} required />
              <button disabled={loading} className="rounded-2xl bg-emerald-600 px-5 py-4 text-sm font-black text-white shadow-sm disabled:opacity-60">{loading ? "Memverifikasi..." : "Aktivasi Akun"}</button>
              <button type="button" onClick={() => setStep("request")} className="rounded-2xl border border-slate-300 px-5 py-3 text-sm font-black text-slate-700">Ubah Data</button>
            </form>
          )}
        </section>

        <div className="text-center text-sm font-semibold text-slate-500">
          Sudah punya akses? <a className="font-black text-blue-700" href="/login">Login</a>
        </div>
      </div>
    </main>
  );
}
