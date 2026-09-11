"use client";

import { useEffect, useMemo, useRef, useState } from "react";

// V151_12_PROFESSIONAL_PORTAL_UI

const NAVY = "#042E66";
const GREEN = "#8DC63F";
const EMERALD = "#0AA870";

function displayDate(value: unknown) {
  if (!value) return "-";
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

function serviceLabel(service: any) {
  const name = String(service?.service_name || "").trim();
  const brand = String(service?.product_brand || "").trim();
  if (name && brand && !name.toLowerCase().includes(brand.toLowerCase())) return `${name} · ${brand}`;
  return name || brand || "Layanan";
}

function maskEmail(value: string) {
  const email = String(value || "").trim();
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  if (local.length <= 2) return `${local.slice(0, 1)}***@${domain}`;
  return `${local.slice(0, 2)}***@${domain}`;
}

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className={`relative inline-flex shrink-0 items-center justify-center ${compact ? "h-8 w-8" : "h-10 w-10"}`} aria-hidden="true">
        <svg viewBox="0 0 48 48" className="h-full w-full" fill="none">
          <path d="M24.1 24.2C25.8 13.7 33.8 6 44 5.2c.1 10.6-6.8 19-17.4 20.8-1 .2-1.9-.7-1.7-1.8Z" fill={GREEN} />
          <path d="M21.3 23.6C11.9 22.9 4.7 16.8 3.1 8c9.7-.7 17.4 4.4 20.2 13.2.4 1.2-.7 2.5-2 2.4Z" fill="#63C4C9" />
          <path d="M23.3 25.5c-2.3 6.1-2.7 12.2-1.5 18.2" stroke={NAVY} strokeWidth="3.1" strokeLinecap="round" />
        </svg>
      </span>
      <div className="leading-none">
        <div className={`${compact ? "text-[15px]" : "text-lg"} font-black tracking-[-0.02em] text-[#042E66]`}>inHARMONY</div>
        {!compact ? <div className="mt-1 text-[9px] font-semibold tracking-wide text-slate-400">Sehat · Peduli · Berkelanjutan</div> : null}
      </div>
    </div>
  );
}

function UserIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M12 12a4.2 4.2 0 1 0 0-8.4 4.2 4.2 0 0 0 0 8.4ZM4.2 21c.7-4 3.7-6.2 7.8-6.2s7.1 2.2 7.8 6.2" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

function ChildIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="12" cy="7.2" r="3" stroke="currentColor" strokeWidth="1.8" />
      <path d="M7.5 14.1c1.2-1.8 2.7-2.7 4.5-2.7s3.3.9 4.5 2.7M9 14.8v5.7M15 14.8v5.7M6.7 17.2h10.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function BuildingIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M5 21V5.5L12 2l7 3.5V21M3 21h18M8 8h2M14 8h2M8 12h2M14 12h2M8 16h2M14 16h2M11 21v-4h2v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MailIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="3" stroke="currentColor" strokeWidth="1.8" />
      <path d="m5 8 7 5 7-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LockIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect x="5" y="10" width="14" height="11" rx="3" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8.5 10V7.5a3.5 3.5 0 0 1 7 0V10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function CalendarIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect x="3.5" y="5" width="17" height="15.5" rx="3" stroke="currentColor" strokeWidth="1.7" />
      <path d="M7.5 3.5V7M16.5 3.5V7M3.5 9h17" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function ArrowRightIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M5 12h13M14 7l5 5-5 5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronRightIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="m9 5 7 7-7 7" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ShieldMailIllustration() {
  return (
    <div className="mx-auto flex h-28 w-28 items-center justify-center rounded-full bg-emerald-50">
      <svg viewBox="0 0 120 120" className="h-24 w-24" fill="none" aria-hidden="true">
        <rect x="23" y="35" width="69" height="49" rx="8" fill="white" stroke={NAVY} strokeWidth="5" />
        <path d="m29 42 28.5 21L86 42" stroke={NAVY} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="28" y="67" width="53" height="23" rx="5" fill={NAVY} />
        <text x="54.5" y="84" textAnchor="middle" fill="white" fontSize="20" fontWeight="900">***</text>
        <path d="M87 60c10 4 16 5 20 5v16c0 13-8 21-20 26-12-5-20-13-20-26V65c4 0 10-1 20-5Z" fill={GREEN} stroke="white" strokeWidth="3" />
        <path d="m78.5 82.5 6 6 11-13" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function PageWave({ text }: { text: string }) {
  return (
    <div className="relative mt-8 h-20 overflow-hidden rounded-b-[2.2rem]">
      <svg className="absolute inset-x-0 bottom-0 h-20 w-full" viewBox="0 0 500 100" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0,55 C110,10 150,90 260,58 C355,31 410,29 500,55 L500,100 L0,100 Z" fill="#E7F8F2" />
        <path d="M0,78 C90,49 160,103 275,76 C372,53 433,56 500,72 L500,100 L0,100 Z" fill="#F4FBF7" />
      </svg>
      <div className="relative z-10 flex h-full items-end justify-center pb-4 text-center text-[10px] font-bold leading-4 text-slate-500">
        <span>{text}</span>
      </div>
    </div>
  );
}

function StatusMessage({ type, children }: { type: "info" | "error" | "warning"; children: any }) {
  const cls = type === "error"
    ? "border-red-200 bg-red-50 text-red-700"
    : type === "warning"
      ? "border-amber-200 bg-amber-50 text-amber-800"
      : "border-blue-200 bg-blue-50 text-blue-800";
  return <div className={`rounded-2xl border px-4 py-3 text-sm font-bold leading-5 ${cls}`}>{children}</div>;
}

function CompanyBadge({ name }: { name?: string }) {
  if (!name) return null;
  return (
    <div className="inline-flex max-w-full items-center gap-3 rounded-2xl bg-[#E9F8F1] px-4 py-3 text-[#042E66]">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/80 text-[#0A7D73]"><BuildingIcon /></span>
      <span className="truncate text-sm font-black tracking-[0.01em]">{name}</span>
    </div>
  );
}

function PortalCard({ children }: { children: any }) {
  return (
    <section className="relative overflow-hidden rounded-[2.2rem] border border-slate-200/80 bg-white shadow-[0_18px_60px_rgba(4,46,102,0.08)]">
      {children}
    </section>
  );
}

export default function VaccinationHistoryPortalPage() {
  const [nip, setNip] = useState("");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"LOGIN" | "OTP" | "HISTORY">("LOGIN");
  const [data, setData] = useState<any>(null);
  const [activeId, setActiveId] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [companyToken, setCompanyToken] = useState("");
  const [companyMeta, setCompanyMeta] = useState<any>(null);
  const [portalReady, setPortalReady] = useState(false);
  const otpInputRef = useRef<HTMLInputElement | null>(null);

  async function jsonRequest(url: string, options?: RequestInit) {
    const response = await fetch(url, { cache: "no-store", ...options });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.ok === false) throw new Error(payload?.message || payload?.error || "Request gagal.");
    return payload;
  }

  async function loadMe(silent = false, tokenOverride = "") {
    if (!silent) setLoading(true);
    setError("");
    const token = tokenOverride || companyToken;
    if (!token) {
      if (!silent) setLoading(false);
      return false;
    }
    try {
      const payload = await jsonRequest(`/api/vaccination/history/portal/me?company=${encodeURIComponent(token)}`);
      setData(payload);
      setActiveId((current) => current || String(payload?.profiles?.[0]?.person?.id || ""));
      setStep("HISTORY");
      return true;
    } catch (e: any) {
      if (!silent) setError(String(e?.message || e));
      return false;
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("company")?.trim() || "";
    setCompanyToken(token);
    setPortalReady(true);
    if (!token) return;

    void jsonRequest(`/api/vaccination/history/portal/company?token=${encodeURIComponent(token)}`)
      .then((payload) => {
        setCompanyMeta(payload.company || null);
        return loadMe(true, token);
      })
      .catch((e: any) => setError(String(e?.message || e)));
  }, []);

  useEffect(() => {
    if (step === "OTP") {
      const timer = window.setTimeout(() => otpInputRef.current?.focus(), 100);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [step]);

  async function requestOtp() {
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const payload = await jsonRequest("/api/vaccination/history/portal/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nip, email, company_token: companyToken }),
      });
      setMessage(payload.message || "OTP telah dikirim ke email perusahaan Anda.");
      setOtp("");
      setStep("OTP");
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp() {
    setLoading(true);
    setError("");
    try {
      await jsonRequest("/api/vaccination/history/portal/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nip, email, otp, company_token: companyToken }),
      });
      await loadMe(true);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    setLoading(true);
    try {
      await fetch("/api/vaccination/history/portal/logout", { method: "POST" });
    } finally {
      setData(null);
      setActiveId("");
      setOtp("");
      setStep("LOGIN");
      setMessage("");
      setError("");
      setLoading(false);
    }
  }


  const active = useMemo(
    () => (data?.profiles || []).find((row: any) => String(row?.person?.id) === activeId) || data?.profiles?.[0] || null,
    [data, activeId],
  );

  const companyName = data?.company?.company_name || companyMeta?.company_name || "";

  if (step === "LOGIN") {
    return (
      <main className="min-h-screen overflow-x-hidden bg-[#F8FAFC] px-4 py-5 text-slate-900 sm:py-8">
        <style jsx global>{`
          #hha-validation-menu-link-v129,
          #hha-validation-menu-link-v128,
          [id^="hha-validation-menu-link-"] { display: none !important; }
        `}</style>

        <div className="mx-auto w-full max-w-[470px]">
          <PortalCard>
            <div className="px-6 pb-0 pt-6 sm:px-8 sm:pt-8">
              <div className="flex items-start justify-between gap-4">
                <BrandMark compact />
                <div className="max-w-[115px] text-right text-[10px] font-bold leading-4 text-slate-400">Solusi Kesehatan<br />untuk Kita Semua</div>
              </div>

              <div className="mt-9">
                <h1 className="max-w-[340px] text-[38px] font-black leading-[0.98] tracking-[-0.045em] text-[#042E66] sm:text-[42px]">Riwayat<br />Layanan Saya</h1>
                <p className="mt-4 max-w-[360px] text-[14px] font-medium leading-6 text-slate-600">
                  Akses riwayat layanan vaksinasi dan layanan kesehatan Anda secara online dengan NIP dan email perusahaan.
                </p>
              </div>

              <div className="mt-5">
                <CompanyBadge name={companyName} />
              </div>

              <div className="mt-4 flex gap-3 rounded-2xl bg-[#F0F7FF] p-4 text-[#18456F]">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-[#1189A7]"><UserIcon /></span>
                <p className="text-[13px] font-semibold leading-5">
                  Orang tua / karyawan juga dapat melihat riwayat anak / tanggungan yang terhubung dengan akun Anda.
                </p>
              </div>

              {!portalReady ? <div className="mt-4"><StatusMessage type="info">Memuat QR Portal Peserta...</StatusMessage></div> : null}
              {portalReady && !companyToken ? (
                <div className="mt-4"><StatusMessage type="warning">Akses Portal Riwayat harus melalui QR Portal Peserta perusahaan. Silakan scan QR yang diberikan oleh perusahaan / inHARMONY.</StatusMessage></div>
              ) : null}
              {error ? <div className="mt-4"><StatusMessage type="error">{error}</StatusMessage></div> : null}

              <div className="mt-7 space-y-5">
                <label className="block">
                  <span className="text-[12px] font-black uppercase tracking-[0.01em] text-[#50627B]">NIP / Employee ID</span>
                  <div className="mt-2 flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 shadow-[0_3px_14px_rgba(15,23,42,0.03)] transition focus-within:border-[#0AA870] focus-within:ring-4 focus-within:ring-emerald-50">
                    <span className="text-[#315D91]"><UserIcon /></span>
                    <input
                      value={nip}
                      onChange={(e) => setNip(e.target.value)}
                      disabled={!companyToken}
                      autoComplete="username"
                      className="min-w-0 flex-1 bg-transparent py-4 text-[15px] font-semibold text-slate-900 outline-none placeholder:font-medium placeholder:text-slate-400 disabled:cursor-not-allowed"
                      placeholder="Masukkan NIP / Employee ID"
                    />
                  </div>
                </label>

                <label className="block">
                  <span className="text-[12px] font-black uppercase tracking-[0.01em] text-[#50627B]">Email Perusahaan</span>
                  <div className="mt-2 flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 shadow-[0_3px_14px_rgba(15,23,42,0.03)] transition focus-within:border-[#0AA870] focus-within:ring-4 focus-within:ring-emerald-50">
                    <span className="text-[#315D91]"><MailIcon /></span>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={!companyToken}
                      autoComplete="email"
                      className="min-w-0 flex-1 bg-transparent py-4 text-[15px] font-semibold text-slate-900 outline-none placeholder:font-medium placeholder:text-slate-400 disabled:cursor-not-allowed"
                      placeholder="Masukkan email perusahaan"
                    />
                  </div>
                </label>
              </div>

              <button
                type="button"
                onClick={() => void requestOtp()}
                disabled={loading || !companyToken || !nip.trim() || !email.trim()}
                className="mt-7 flex w-full items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-[#14B978] to-[#059865] px-5 py-4 text-[15px] font-black text-white shadow-[0_10px_30px_rgba(10,168,112,0.22)] transition hover:-translate-y-0.5 hover:shadow-[0_14px_35px_rgba(10,168,112,0.28)] disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none"
              >
                <span>{loading ? "Memproses..." : "Kirim OTP ke Email"}</span>
                {!loading ? <ArrowRightIcon className="h-4 w-4" /> : null}
              </button>
            </div>

            <PageWave text="Kesehatan Hari Ini · Untuk Langkah Lebih Jauh" />
          </PortalCard>
        </div>
      </main>
    );
  }

  if (step === "OTP") {
    return (
      <main className="min-h-screen overflow-x-hidden bg-[#F8FAFC] px-4 py-5 text-slate-900 sm:py-8">
        <style jsx global>{`
          #hha-validation-menu-link-v129,
          #hha-validation-menu-link-v128,
          [id^="hha-validation-menu-link-"] { display: none !important; }
        `}</style>

        <div className="mx-auto w-full max-w-[470px]">
          <PortalCard>
            <div className="px-6 pb-0 pt-6 sm:px-8 sm:pt-8">
              <div className="flex items-start justify-between gap-4">
                <BrandMark compact />
                <div className="max-w-[115px] text-right text-[10px] font-bold leading-4 text-slate-400">Keamanan Data<br />Prioritas Kami</div>
              </div>

              <button
                type="button"
                onClick={() => { setStep("LOGIN"); setOtp(""); setMessage(""); setError(""); }}
                className="mt-7 flex h-10 w-10 items-center justify-center rounded-full text-[#042E66] transition hover:bg-slate-100"
                aria-label="Kembali"
              >
                <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true"><path d="M15 5 8 12l7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>

              <div className="mt-1 text-center">
                <ShieldMailIllustration />
                <h1 className="mt-4 text-[30px] font-black tracking-[-0.035em] text-[#042E66]">Verifikasi OTP</h1>
                <p className="mx-auto mt-3 max-w-[340px] text-[14px] font-medium leading-6 text-slate-600">
                  Masukkan 6 digit kode OTP yang telah dikirimkan ke email perusahaan Anda.
                </p>
                {email ? <p className="mt-1 text-xs font-bold text-slate-400">{maskEmail(email)}</p> : null}
              </div>

              <div className="relative mt-7">
                <input
                  ref={otpInputRef}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  onKeyDown={(e) => { if (e.key === "Enter" && otp.length === 6 && !loading) void verifyOtp(); }}
                  className="absolute inset-0 z-10 h-full w-full cursor-text opacity-0"
                  aria-label="Kode OTP 6 digit"
                />
                <div className="pointer-events-none grid grid-cols-6 gap-2" aria-hidden="true">
                  {Array.from({ length: 6 }).map((_, index) => (
                    <div key={index} className={`flex h-14 items-center justify-center rounded-xl border bg-white text-xl font-black text-[#042E66] transition ${index === otp.length && otp.length < 6 ? "border-[#0AA870] ring-4 ring-emerald-50" : "border-slate-200"}`}>
                      {otp[index] || ""}
                    </div>
                  ))}
                </div>
              </div>

              {message ? <div className="mt-5"><StatusMessage type="info">{message}</StatusMessage></div> : null}
              {error ? <div className="mt-5"><StatusMessage type="error">{error}</StatusMessage></div> : null}

              <button
                type="button"
                onClick={() => void requestOtp()}
                disabled={loading}
                className="mx-auto mt-5 block text-sm font-black text-blue-600 transition hover:text-blue-700 disabled:opacity-50"
              >
                Kirim ulang OTP
              </button>

              <button
                type="button"
                onClick={() => void verifyOtp()}
                disabled={loading || otp.length !== 6}
                className="mt-5 flex w-full items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-[#14B978] to-[#059865] px-5 py-4 text-[15px] font-black text-white shadow-[0_10px_30px_rgba(10,168,112,0.22)] transition hover:-translate-y-0.5 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none"
              >
                <span>{loading ? "Memverifikasi..." : "Verifikasi & Lanjut"}</span>
                {!loading ? <ArrowRightIcon className="h-4 w-4" /> : null}
              </button>

              <div className="mt-6 flex gap-3 rounded-2xl bg-[#F0F7FF] p-4 text-[#18456F]">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#1189A7]"><LockIcon /></span>
                <div>
                  <div className="text-[13px] font-black">Akses aman & terbatas</div>
                  <p className="mt-1 text-[12px] font-semibold leading-5 text-slate-600">Portal ini bersifat read-only untuk melihat riwayat layanan. Perubahan data dilakukan melalui Admin inHARMONY.</p>
                </div>
              </div>
            </div>

            <PageWave text="Bersama Menjaga Kesehatan Keluarga" />
          </PortalCard>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#F8FAFC] px-4 py-5 text-slate-900 sm:py-8">
      <style jsx global>{`
        #hha-validation-menu-link-v129,
        #hha-validation-menu-link-v128,
        [id^="hha-validation-menu-link-"] { display: none !important; }
      `}</style>

      <div className="mx-auto w-full max-w-[500px] space-y-4">
        <PortalCard>
          <div className="px-5 pb-6 pt-6 sm:px-7 sm:pt-7">
            <div className="flex items-center justify-between gap-4">
              <BrandMark compact />
              <div className="flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#EEF4FA] text-[#042E66]" title={data?.account?.participant_name || "Peserta"}><UserIcon /></div>
                <details className="relative">
                  <summary className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-full text-[#042E66] transition hover:bg-slate-100 [&::-webkit-details-marker]:hidden" aria-label="Menu">
                    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true"><path d="M5 7h14M5 12h14M5 17h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                  </summary>
                  <div className="absolute right-0 top-12 z-20 w-56 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
                    <div className="px-3 py-2 text-xs font-bold leading-5 text-slate-500">{data?.account?.participant_name}<br /><span className="font-semibold">{companyName}</span></div>
                    <button type="button" onClick={() => void logout()} disabled={loading} className="mt-1 w-full rounded-xl px-3 py-2.5 text-left text-sm font-black text-red-600 transition hover:bg-red-50 disabled:opacity-50">Keluar Portal</button>
                  </div>
                </details>
              </div>
            </div>

            <div className="mt-7">
              <h1 className="text-[28px] font-black tracking-[-0.035em] text-[#042E66]">Pilih Riwayat</h1>
              <p className="mt-1 text-[13px] font-medium text-slate-500">Pilih profil untuk melihat riwayat layanan.</p>
            </div>

            <div className="mt-5 space-y-3">
              {(data?.profiles || []).map((row: any) => {
                const selected = String(row.person.id) === String(active?.person?.id);
                const child = row.person.participant_type === "DEPENDENT";
                return (
                  <button
                    key={row.person.id}
                    type="button"
                    onClick={() => setActiveId(String(row.person.id))}
                    className={`flex w-full items-center gap-3 rounded-2xl border p-3.5 text-left transition ${selected ? "border-[#6ED28B] bg-[#F0FBF3] shadow-[0_6px_18px_rgba(10,168,112,0.08)]" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"}`}
                  >
                    <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${selected ? "bg-white text-[#60BF37]" : "bg-[#EEF4FA] text-[#0D4F91]"}`}>
                      {child ? <ChildIcon /> : <UserIcon />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block text-[11px] font-bold ${selected ? "text-[#13855B]" : "text-slate-500"}`}>{child ? "Anak / Tanggungan" : "Riwayat Saya"}</span>
                      <span className={`mt-0.5 block truncate text-[15px] font-black ${selected ? "text-[#087952]" : "text-[#042E66]"}`}>{row.person.participant_name}</span>
                    </span>
                    <span className={selected ? "text-[#13855B]" : "text-[#164A80]"}><ChevronRightIcon /></span>
                  </button>
                );
              })}
            </div>

            {error ? <div className="mt-4"><StatusMessage type="error">{error}</StatusMessage></div> : null}

            {active ? (
              <div className="mt-7 border-t border-slate-200 pt-6">
                <div className="flex items-end justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-[12px] font-black uppercase tracking-[0.01em] text-[#0B7B66]">{active.person.participant_type === "DEPENDENT" ? "Riwayat Anak / Tanggungan" : "Riwayat Peserta"}</div>
                    <h2 className="mt-1 truncate text-[28px] font-black tracking-[-0.04em] text-[#042E66]">{active.person.participant_name}</h2>
                    {active.person.birth_date ? <p className="mt-1 text-xs font-semibold text-slate-400">Tanggal lahir {displayDate(active.person.birth_date)}</p> : null}
                  </div>
                  <div className="shrink-0 rounded-full bg-[#EAF3FF] px-3 py-1.5 text-xs font-black text-blue-700">{active.summary?.total || 0} layanan</div>
                </div>

                <div className="mt-5 space-y-3">
                  {(active.services || []).map((service: any) => (
                    <article key={`${service.source}-${service.id}`} className="rounded-[1.4rem] border border-slate-200 bg-white p-4 shadow-[0_6px_18px_rgba(15,23,42,0.035)]">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.02em] ${service.source === "SYSTEM" ? "bg-emerald-100 text-emerald-800" : "bg-blue-100 text-blue-800"}`}>{service.source_label || (service.source === "SYSTEM" ? "Sistem" : "History")}</span>
                        {service.dose_number ? <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[9px] font-black uppercase text-slate-500">Dose {service.dose_number}</span> : null}
                      </div>

                      <h3 className="mt-3 text-[17px] font-black leading-6 tracking-[-0.02em] text-[#042E66]">{serviceLabel(service)}</h3>

                      <div className="mt-3 flex items-start gap-2.5 text-[13px] font-semibold leading-5 text-slate-500">
                        <span className="mt-0.5 text-[#315D91]"><CalendarIcon className="h-4 w-4" /></span>
                        <span>{displayDate(service.service_date)}{service.location ? ` · ${service.location}` : ""}</span>
                      </div>

                      {service.lot_number ? (
                        <div className="mt-2 text-[12px] font-semibold text-slate-400">Lot {service.lot_number}</div>
                      ) : null}

                      <div className="mt-4 flex items-center gap-3 rounded-xl bg-[#F6F9FC] px-3.5 py-3">
                        <span className="text-[#315D91]"><CalendarIcon className="h-4 w-4" /></span>
                        <div className="min-w-0 flex-1">
                          <div className="text-[10px] font-bold uppercase tracking-[0.04em] text-slate-400">Next Schedule</div>
                          <div className="mt-0.5 text-[13px] font-black text-[#315D91]">{displayDate(service.next_due_date)}</div>
                        </div>
                      </div>

                      {service.notes ? <div className="mt-3 rounded-xl bg-amber-50 px-3.5 py-3 text-[12px] font-medium leading-5 text-amber-900">{service.notes}</div> : null}
                    </article>
                  ))}

                  {!active.services?.length ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center text-sm font-semibold leading-6 text-slate-500">Belum ada riwayat layanan yang tercatat.</div>
                  ) : null}
                </div>

                <div className="mt-5 flex gap-3 rounded-2xl bg-[#F0F7FF] p-4 text-[#18456F]">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-cyan-200 bg-white text-cyan-700">
                    <span className="text-sm font-black">i</span>
                  </span>
                  <p className="text-[11px] font-semibold leading-5 text-slate-600">Data pada portal ini bersifat read-only. Perbaikan data dilakukan melalui Admin inHARMONY.</p>
                </div>
              </div>
            ) : (
              <div className="mt-7 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center text-sm font-semibold text-slate-500">Belum ada profil riwayat yang dapat ditampilkan.</div>
            )}
          </div>
        </PortalCard>

        <div className="pb-3 text-center text-[10px] font-semibold text-slate-400">inHARMONY · Portal Riwayat Layanan Peserta</div>
      </div>
    </main>
  );
}
