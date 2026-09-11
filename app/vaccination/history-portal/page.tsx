"use client";

import { useEffect, useMemo, useState } from "react";

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
    if (!token) { if (!silent) setLoading(false); return false; }
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
      .then((payload) => { setCompanyMeta(payload.company || null); return loadMe(true, token); })
      .catch((e: any) => setError(String(e?.message || e)));
  }, []);

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
      setMessage(payload.message || "OTP diproses.");
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

  if (step !== "HISTORY") {
    return (
      <main className="min-h-screen bg-slate-50 p-4 md:p-8">
        <div className="mx-auto max-w-xl">
          <section className="overflow-hidden rounded-[2rem] border bg-white shadow-xl">
            <div className="bg-gradient-to-br from-emerald-600 via-teal-600 to-slate-900 p-7 text-white">
              <div className="text-xs font-black uppercase tracking-[0.18em] text-emerald-100">inHARMONY Vaccination</div>
              <h1 className="mt-2 text-3xl font-black">Riwayat Layanan Saya</h1>
              <p className="mt-3 text-sm font-semibold leading-6 text-emerald-50">Akses read-only menggunakan NIP dan email perusahaan. OTP akan dikirim ke email yang terdaftar.</p>
              {companyMeta?.company_name ? <div className="mt-4 inline-flex rounded-full border border-white/25 bg-white/10 px-4 py-2 text-sm font-black">{companyMeta.company_name}</div> : null}
            </div>

            <div className="space-y-5 p-6">
              {!portalReady ? <div className="rounded-2xl border bg-slate-50 p-4 text-sm font-bold text-slate-600">Memuat QR Portal Peserta...</div> : null}
              {portalReady && !companyToken ? <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">Akses Portal Riwayat harus melalui QR Portal Peserta perusahaan. Silakan scan QR yang diberikan oleh perusahaan / inHARMONY.</div> : null}
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">
                Orang tua/karyawan yang terverifikasi juga dapat melihat riwayat anak atau tanggungan yang sudah terhubung ke akun parent.
              </div>

              <label className="block">
                <span className="text-xs font-black uppercase text-slate-500">NIP / Employee ID</span>
                <input value={nip} onChange={(e) => setNip(e.target.value)} disabled={step === "OTP" || !companyToken} className="mt-2 w-full rounded-2xl border px-4 py-3 font-semibold outline-none focus:border-emerald-500" placeholder="Masukkan NIP" />
              </label>

              <label className="block">
                <span className="text-xs font-black uppercase text-slate-500">Email Perusahaan</span>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={step === "OTP" || !companyToken} className="mt-2 w-full rounded-2xl border px-4 py-3 font-semibold outline-none focus:border-emerald-500" placeholder="nama@perusahaan.com" />
              </label>

              {step === "OTP" ? (
                <label className="block">
                  <span className="text-xs font-black uppercase text-slate-500">Kode OTP</span>
                  <input inputMode="numeric" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))} className="mt-2 w-full rounded-2xl border px-4 py-3 text-center text-2xl font-black tracking-[0.35em] outline-none focus:border-emerald-500" placeholder="000000" />
                </label>
              ) : null}

              {message ? <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm font-bold text-blue-800">{message}</div> : null}
              {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{error}</div> : null}

              {step === "LOGIN" ? (
                <button type="button" onClick={() => void requestOtp()} disabled={loading || !companyToken || !nip.trim() || !email.trim()} className="w-full rounded-2xl bg-emerald-600 px-5 py-3.5 font-black text-white disabled:opacity-50">{loading ? "Memproses..." : "Kirim OTP ke Email"}</button>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  <button type="button" onClick={() => { setStep("LOGIN"); setOtp(""); setMessage(""); }} className="rounded-2xl border px-5 py-3 font-black">Ubah NIP / Email</button>
                  <button type="button" onClick={() => void verifyOtp()} disabled={loading || otp.length !== 6} className="rounded-2xl bg-emerald-600 px-5 py-3 font-black text-white disabled:opacity-50">{loading ? "Memverifikasi..." : "Verifikasi OTP"}</button>
                </div>
              )}
            </div>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 p-4 md:p-6">
      <div className="mx-auto max-w-6xl space-y-5">
        <section className="rounded-[2rem] border bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">inHARMONY Vaccination · Read Only</div>
              <h1 className="mt-1 text-3xl font-black text-slate-900">Riwayat Layanan Saya</h1>
              <p className="mt-2 text-sm font-semibold text-slate-500">{data?.account?.participant_name} · {data?.company?.company_name || companyMeta?.company_name}</p>
            </div>
            <button type="button" onClick={() => void logout()} disabled={loading} className="rounded-xl border bg-white px-4 py-2 text-sm font-black">Keluar</button>
          </div>
        </section>

        <section className="rounded-3xl border bg-white p-4 shadow-sm">
          <div className="text-xs font-black uppercase text-slate-500">Pilih Riwayat</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {(data?.profiles || []).map((row: any) => {
              const selected = String(row.person.id) === String(active?.person?.id);
              const child = row.person.participant_type === "DEPENDENT";
              return (
                <button key={row.person.id} type="button" onClick={() => setActiveId(String(row.person.id))} className={`rounded-2xl border px-4 py-3 text-left ${selected ? "border-emerald-600 bg-emerald-600 text-white" : "bg-white hover:bg-slate-50"}`}>
                  <div className="text-xs font-black uppercase opacity-75">{child ? "Anak / Tanggungan" : "Riwayat Saya"}</div>
                  <div className="mt-1 font-black">{row.person.participant_name}</div>
                </button>
              );
            })}
          </div>
        </section>

        {active ? (
          <section className="rounded-[2rem] border bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="text-xs font-black uppercase text-emerald-700">{active.person.participant_type === "DEPENDENT" ? "Riwayat Anak / Tanggungan" : "Riwayat Peserta"}</div>
                <h2 className="mt-1 text-2xl font-black text-slate-900">{active.person.participant_name}</h2>
                {active.person.birth_date ? <div className="mt-1 text-sm font-semibold text-slate-500">Tanggal lahir {displayDate(active.person.birth_date)}</div> : null}
              </div>
              <div className="rounded-2xl bg-slate-100 px-4 py-3 text-sm font-black text-slate-700">{active.summary?.total || 0} layanan</div>
            </div>

            <div className="mt-5 space-y-3">
              {(active.services || []).map((service: any) => (
                <article key={`${service.source}-${service.id}`} className="rounded-2xl border p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${service.source === "SYSTEM" ? "bg-emerald-100 text-emerald-800" : "bg-blue-100 text-blue-800"}`}>{service.source_label}</span>
                      <h3 className="mt-2 text-lg font-black text-slate-900">{serviceLabel(service)}</h3>
                      <p className="mt-1 text-sm font-semibold text-slate-500">{displayDate(service.service_date)}{service.location ? ` · ${service.location}` : ""}</p>
                    </div>
                    {service.next_due_date ? <span className="rounded-full bg-amber-100 px-3 py-1.5 text-xs font-black text-amber-800">Next: {displayDate(service.next_due_date)}</span> : null}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs font-semibold text-slate-500">
                    {service.dose_number ? <span>Dose {service.dose_number}</span> : null}
                    {service.lot_number ? <span>Lot {service.lot_number}</span> : null}
                  </div>
                  {service.notes ? <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">{service.notes}</div> : null}
                </article>
              ))}
              {!active.services?.length ? <div className="rounded-2xl border border-dashed p-8 text-center font-semibold text-slate-500">Belum ada riwayat layanan yang tercatat.</div> : null}
            </div>
          </section>
        ) : null}

        <div className="text-center text-xs font-semibold text-slate-400">Data pada portal ini bersifat read-only. Perbaikan data dilakukan melalui Admin inHARMONY.</div>
      </div>
    </main>
  );
}
