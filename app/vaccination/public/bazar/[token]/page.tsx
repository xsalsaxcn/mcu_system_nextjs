"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

type SessionInfo = {
  id: number;
  sessionName: string;
  companyName: string;
  location: string;
  sessionDate: string | null;
  bazarQueueMode: "INTERNAL" | "VENDOR";
};

type SalesOption = {
  id: number;
  saleMode: "PACKAGE" | "NON_PACKAGE";
  packageDoseCount: number;
  price: number;
  label: string;
};

type Product = {
  vaccineId: number;
  lotId: number;
  vaccineName: string;
  brand: string;
  lotNumber: string;
  expiryDate: string | null;
  stockRemaining: number | null;
  masterPrice: number | null;
  salesOptions: SalesOption[];
};

type Person = {
  sourceType?: string;
  participantId?: number | null;
  historyPersonId?: number | null;
  name: string;
  employeeId: string;
  nik?: string;
  email?: string;
  phone?: string;
  department?: string;
  gender?: string;
  birthDate?: string | null;
  companyName?: string;
};

function clean(value: any) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function rupiah(value: any) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(value || 0));
}

function dateLabel(value: any) {
  const text = clean(value);
  if (!text) return "-";
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text;
  return date.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

function BrandMark() {
  return (
    <div className="inline-flex items-center gap-2">
      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-blue-600 text-lg font-black text-white">H</div>
      <div>
        <div className="text-[13px] font-black tracking-tight text-[#06376D]">inHARMONY</div>
        <div className="text-[9px] font-bold uppercase tracking-[0.13em] text-slate-400">Health Portal</div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11px] font-black uppercase tracking-wide text-slate-500">{label}</span>
      <div className="mt-2">{children}</div>
    </label>
  );
}

export default function BazarPublicRegistrationPage() {
  const params = useParams<{ token: string }>();
  const token = decodeURIComponent(String(params?.token || ""));
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [person, setPerson] = useState<Person | null>(null);
  const [step, setStep] = useState<"LOOKUP" | "FORM" | "PRODUCTS" | "SUCCESS">("LOOKUP");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [productFilter, setProductFilter] = useState("ALL");
  const [selected, setSelected] = useState<Record<string, "PACKAGE" | "NON_PACKAGE">>({});
  const [result, setResult] = useState<any>(null);
  const [form, setForm] = useState({ name: "", nik: "", employeeId: "", email: "", phone: "", gender: "", birthDate: "" });

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    fetch(`/api/vaccination/public-bazar?token=${encodeURIComponent(token)}`, { cache: "no-store" })
      .then(async (res) => ({ res, json: await res.json().catch(() => ({})) }))
      .then(({ res, json }) => {
        if (!res.ok || !json.ok) throw new Error(json.message || "Portal Bazar tidak dapat dibuka.");
        setSession(json.session || null);
        setProducts(Array.isArray(json.products) ? json.products : []);
      })
      .catch((err) => setError(err?.message || "Portal Bazar tidak dapat dibuka."))
      .finally(() => setLoading(false));
  }, [token]);

  const visibleProducts = useMemo(() => {
    const q = search.toLowerCase().trim();
    return products.filter((product) => {
      const haystack = `${product.vaccineName} ${product.brand} ${product.lotNumber}`.toLowerCase();
      if (q && !haystack.includes(q)) return false;
      const hasPackage = product.salesOptions.some((offer) => offer.saleMode === "PACKAGE");
      const hasNonPackage = product.salesOptions.some((offer) => offer.saleMode === "NON_PACKAGE");
      const isVitamin = /vitamin|multivitamin|injeksi/i.test(`${product.vaccineName} ${product.brand}`);
      if (productFilter === "VITAMIN" && !isVitamin) return false;
      if (productFilter === "VAKSIN" && isVitamin) return false;
      if (productFilter === "PACKAGE" && !hasPackage) return false;
      if (productFilter === "NON_PACKAGE" && !hasNonPackage) return false;
      return true;
    });
  }, [productFilter, products, search]);

  const selectedItems = useMemo(() => Object.entries(selected).map(([key, saleMode]) => {
    const [vaccineIdText, lotIdText] = key.split(":");
    const vaccineId = Number(vaccineIdText);
    const lotId = Number(lotIdText);
    const product = products.find((item) => item.vaccineId === vaccineId && item.lotId === lotId);
    const offer = product?.salesOptions.find((item) => item.saleMode === saleMode) || null;
    return { vaccineId, lotId, saleMode, product, offer };
  }).filter((item) => item.product && item.offer), [products, selected]);

  const total = selectedItems.reduce((sum, item) => sum + Number(item.offer?.price || 0), 0);

  async function post(body: any) {
    const res = await fetch("/api/vaccination/public-bazar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ token, ...body }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.ok) throw new Error(json.message || "Permintaan tidak dapat diproses.");
    return json;
  }

  async function lookup() {
    const id = clean(employeeId);
    if (!id) { setError("Masukkan NIP / Employee ID / Binusian ID."); return; }
    setLoading(true); setError(""); setMessage("");
    try {
      const json = await post({ action: "lookup", employeeId: id });
      if (json.found && json.person) {
        setPerson(json.person);
        setStep("PRODUCTS");
        setMessage("Data ditemukan. Silakan pilih produk Bazar.");
      } else {
        setForm((prev) => ({ ...prev, employeeId: id }));
        setStep("FORM");
        setMessage("Data belum ditemukan. Lengkapi data peserta untuk melanjutkan.");
      }
    } catch (err: any) {
      setError(err?.message || "Gagal mengecek data peserta.");
    } finally { setLoading(false); }
  }

  async function savePerson() {
    setLoading(true); setError("");
    try {
      const json = await post({ action: "save-participant", ...form });
      setPerson(json.person || null);
      setEmployeeId(json.person?.employeeId || form.employeeId);
      setStep("PRODUCTS");
      setMessage("Data peserta berhasil disimpan. Silakan pilih produk Bazar.");
    } catch (err: any) {
      setError(err?.message || "Gagal menyimpan data peserta.");
    } finally { setLoading(false); }
  }

  function toggleProduct(product: Product) {
    const key = `${product.vaccineId}:${product.lotId}`;
    setSelected((prev) => {
      const next = { ...prev };
      if (next[key]) delete next[key];
      else {
        const defaultMode = product.salesOptions.some((offer) => offer.saleMode === "NON_PACKAGE") ? "NON_PACKAGE" : "PACKAGE";
        next[key] = defaultMode;
      }
      return next;
    });
  }

  async function register() {
    if (!person) { setError("Data peserta belum tersedia."); return; }
    if (!selectedItems.length) { setError("Pilih minimal satu produk Bazar."); return; }
    setLoading(true); setError("");
    try {
      const json = await post({
        action: "register",
        employeeId: person.employeeId,
        person,
        items: selectedItems.map((item) => ({ vaccineId: item.vaccineId, lotId: item.lotId, saleMode: item.saleMode })),
      });
      setResult(json.booking || {});
      setStep("SUCCESS");
      setMessage(json.message || "Pendaftaran Bazar berhasil dikirim.");
    } catch (err: any) {
      setError(err?.message || "Pendaftaran Bazar gagal.");
    } finally { setLoading(false); }
  }

  if (loading && !session) {
    return <main className="min-h-screen bg-[#F6F9FC] p-6"><div className="mx-auto mt-20 max-w-md rounded-3xl border bg-white p-8 text-center font-black text-slate-600 shadow-sm">Memuat Portal Bazar...</div></main>;
  }

  if (error && !session) {
    return <main className="min-h-screen bg-[#F6F9FC] p-6"><div className="mx-auto mt-20 max-w-md rounded-3xl border border-rose-200 bg-white p-8 text-center shadow-sm"><div className="text-xl font-black text-rose-700">Portal Bazar tidak tersedia</div><div className="mt-3 text-sm font-semibold text-slate-600">{error}</div></div></main>;
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#F6F9FC] px-4 py-5 text-slate-900 sm:py-8">
      <div className="mx-auto w-full max-w-[560px] overflow-hidden rounded-[34px] border border-slate-200 bg-white shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
        <div className="px-6 pb-8 pt-6 sm:px-8 sm:pt-8">
          <div className="flex items-start justify-between gap-4">
            <BrandMark />
            <div className="max-w-[120px] text-right text-[10px] font-bold leading-4 text-slate-400">Solusi Kesehatan<br />untuk Kita Semua</div>
          </div>

          <div className="mt-8">
            <div className="text-[11px] font-black uppercase tracking-[0.12em] text-emerald-600">Portal khusus Bazar</div>
            <h1 className="mt-2 text-[38px] font-black leading-[0.98] tracking-[-0.045em] text-[#042E66]">Pendaftaran<br />Bazar Mandiri</h1>
            <p className="mt-4 text-sm font-medium leading-6 text-slate-600">Daftar layanan Bazar sesuai Session yang tersedia. Tidak memerlukan OTP.</p>
          </div>

          {session ? (
            <div className="mt-5 space-y-3">
              <div className="rounded-2xl bg-emerald-50 px-4 py-4">
                <div className="text-[10px] font-black uppercase tracking-wide text-emerald-700">Perusahaan</div>
                <div className="mt-1 text-sm font-black text-[#06376D]">{session.companyName || "-"}</div>
              </div>
              <div className="rounded-2xl border border-blue-100 bg-blue-50/70 px-4 py-4">
                <div className="text-[10px] font-black uppercase tracking-wide text-blue-600">Session Bazar</div>
                <div className="mt-1 text-sm font-black text-slate-800">{session.sessionName}</div>
                <div className="mt-1 text-xs font-semibold text-slate-500">{session.location || "-"} · {dateLabel(session.sessionDate)}</div>
              </div>
            </div>
          ) : null}

          {message ? <div className="mt-4 rounded-2xl bg-blue-50 px-4 py-3 text-sm font-bold text-blue-700">{message}</div> : null}
          {error ? <div className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{error}</div> : null}

          {step === "LOOKUP" ? (
            <div className="mt-7 space-y-5">
              <Field label="NIP / Employee ID / Binusian ID">
                <input value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void lookup(); }} className="w-full rounded-2xl border border-slate-200 px-4 py-4 text-[15px] font-bold outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-50" placeholder="Masukkan NIP / Employee ID" />
              </Field>
              <div className="rounded-2xl bg-[#F0F7FF] px-4 py-3 text-xs font-semibold leading-5 text-[#18456F]">Jika data ditemukan, Anda dapat langsung memilih produk Bazar. Jika belum ada, lengkapi data standar terlebih dahulu.</div>
              <button type="button" onClick={() => void lookup()} disabled={loading} className="w-full rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-4 text-sm font-black text-white shadow-sm disabled:opacity-50">{loading ? "Memeriksa..." : "Lanjut →"}</button>
            </div>
          ) : null}

          {step === "FORM" ? (
            <div className="mt-7 space-y-4">
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">Data belum ditemukan. Lengkapi data peserta sesuai standar pendaftaran.</div>
              <Field label="Nama Lengkap"><input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} className="w-full rounded-2xl border px-4 py-3 font-semibold" placeholder="Masukkan nama lengkap" /></Field>
              <Field label="NIK KTP"><input value={form.nik} onChange={(e) => setForm((p) => ({ ...p, nik: e.target.value }))} className="w-full rounded-2xl border px-4 py-3 font-semibold" placeholder="Masukkan NIK KTP" /></Field>
              <Field label="NIP / Employee ID"><input value={form.employeeId} onChange={(e) => setForm((p) => ({ ...p, employeeId: e.target.value }))} className="w-full rounded-2xl border px-4 py-3 font-semibold" placeholder="Masukkan NIP / Employee ID" /></Field>
              <Field label="Email"><input type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} className="w-full rounded-2xl border px-4 py-3 font-semibold" placeholder="Masukkan email perusahaan" /></Field>
              <Field label="No. HP"><input value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} className="w-full rounded-2xl border px-4 py-3 font-semibold" placeholder="Masukkan nomor HP aktif" /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Jenis Kelamin"><select value={form.gender} onChange={(e) => setForm((p) => ({ ...p, gender: e.target.value }))} className="w-full rounded-2xl border px-3 py-3 font-semibold"><option value="">Pilih</option><option value="Laki-laki">Laki-laki</option><option value="Perempuan">Perempuan</option></select></Field>
                <Field label="Tanggal Lahir"><input type="date" value={form.birthDate} onChange={(e) => setForm((p) => ({ ...p, birthDate: e.target.value }))} className="w-full rounded-2xl border px-3 py-3 font-semibold" /></Field>
              </div>
              <button type="button" onClick={() => void savePerson()} disabled={loading} className="w-full rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-4 text-sm font-black text-white disabled:opacity-50">{loading ? "Menyimpan..." : "Simpan Data & Lanjut"}</button>
              <button type="button" onClick={() => { setStep("LOOKUP"); setError(""); }} className="w-full rounded-2xl border px-4 py-3 text-sm font-black text-slate-600">Kembali</button>
            </div>
          ) : null}

          {step === "PRODUCTS" && person ? (
            <div className="mt-7">
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-4">
                <div className="text-xs font-black text-emerald-700">Data peserta</div>
                <div className="mt-1 text-lg font-black text-slate-900">{person.name}</div>
                <div className="mt-1 text-xs font-semibold text-slate-600">{person.employeeId} · {session?.companyName || person.companyName || "-"}</div>
              </div>

              <div className="mt-5 grid gap-2 sm:grid-cols-[1fr_auto]">
                <input value={search} onChange={(e) => setSearch(e.target.value)} className="rounded-2xl border px-4 py-3 text-sm font-semibold" placeholder="Cari produk Bazar" />
                <div className="flex flex-wrap gap-1.5">
                  {[['ALL','Semua'],['VAKSIN','Vaksin'],['VITAMIN','Vitamin'],['PACKAGE','Paket'],['NON_PACKAGE','Non Paket']].map(([value,label]) => <button key={value} type="button" onClick={() => setProductFilter(value)} className={`rounded-full px-3 py-2 text-[11px] font-black ${productFilter === value ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600"}`}>{label}</button>)}
                </div>
              </div>

              <div className="mt-4 max-h-[470px] space-y-3 overflow-y-auto pr-1">
                {visibleProducts.map((product) => {
                  const key = `${product.vaccineId}:${product.lotId}`;
                  const checked = Boolean(selected[key]);
                  const mode = selected[key] || (product.salesOptions.some((offer) => offer.saleMode === "NON_PACKAGE") ? "NON_PACKAGE" : "PACKAGE");
                  const offer = product.salesOptions.find((item) => item.saleMode === mode) || product.salesOptions[0];
                  return (
                    <div key={key} className={`rounded-2xl border p-4 transition ${checked ? "border-emerald-300 bg-emerald-50/50" : "border-slate-200 bg-white"}`}>
                      <div className="flex items-start gap-3">
                        <button type="button" onClick={() => toggleProduct(product)} className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border text-xs font-black ${checked ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300 bg-white text-transparent"}`}>✓</button>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-black text-slate-900">{product.vaccineName}{product.brand ? ` · ${product.brand}` : ""}</div>
                          <div className="mt-1 text-xs font-semibold text-slate-500">Lot {product.lotNumber}{product.stockRemaining != null ? ` · Sisa ${product.stockRemaining}` : ""}</div>
                          {checked && product.salesOptions.length > 1 ? (
                            <select value={mode} onChange={(e) => setSelected((prev) => ({ ...prev, [key]: e.target.value as "PACKAGE" | "NON_PACKAGE" }))} className="mt-3 rounded-xl border bg-white px-3 py-2 text-xs font-black">
                              {product.salesOptions.map((item) => <option key={`${key}-${item.saleMode}`} value={item.saleMode}>{item.saleMode === "PACKAGE" ? `Paket · ${item.packageDoseCount} dosis` : "Non Paket"}</option>)}
                            </select>
                          ) : null}
                        </div>
                        <div className="shrink-0 text-right">
                          <div className={`rounded-full px-2 py-1 text-[10px] font-black ${mode === "PACKAGE" ? "bg-amber-50 text-amber-700" : "bg-blue-50 text-blue-700"}`}>{mode === "PACKAGE" ? "Paket" : "Non Paket"}</div>
                          <div className="mt-2 text-sm font-black text-[#06376D]">{rupiah(offer?.price || 0)}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {!visibleProducts.length ? <div className="rounded-2xl bg-slate-50 p-6 text-center text-sm font-bold text-slate-500">Tidak ada produk Bazar sesuai filter.</div> : null}
              </div>

              <div className="mt-5 rounded-2xl bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">Estimasi layanan</div>
                    <div className="mt-1 text-xs font-semibold text-slate-500">Metode pembayaran akan dikonfirmasi oleh tim registrasi.</div>
                  </div>
                  <div className="rounded-xl bg-white px-4 py-3 text-right"><div className="text-[10px] font-black uppercase text-slate-400">Total</div><div className="text-lg font-black text-slate-900">{rupiah(total)}</div></div>
                </div>
              </div>

              <button type="button" onClick={() => void register()} disabled={loading || !selectedItems.length} className="mt-4 w-full rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-4 text-sm font-black text-white disabled:opacity-50">{loading ? "Mengirim..." : "Kirim Pendaftaran"}</button>
            </div>
          ) : null}

          {step === "SUCCESS" ? (
            <div className="mt-7 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-3xl font-black text-emerald-600">✓</div>
              <h2 className="mt-4 text-2xl font-black text-[#042E66]">Pendaftaran Terkirim</h2>
              <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">Pilihan Bazar Anda sudah masuk ke penampungan Self Booking. Tim registrasi akan memeriksa data dan memvalidasi pembayaran sebelum pendaftaran diproses.</p>
              <div className="mt-5 rounded-3xl bg-blue-50 p-5">
                <div className="text-xs font-black uppercase tracking-wide text-blue-600">Nomor Self Booking</div>
                <div className="mt-2 text-3xl font-black text-blue-700">SB-{String(result?.id || "-").padStart(4, "0")}</div>
                <div className="mt-2 text-xs font-semibold text-slate-500">Estimasi {rupiah(result?.estimatedTotal || total)}</div>
              </div>
              <button type="button" onClick={() => { setStep("LOOKUP"); setEmployeeId(""); setPerson(null); setSelected({}); setResult(null); setMessage(""); setError(""); }} className="mt-5 w-full rounded-2xl border px-4 py-3 text-sm font-black text-slate-700">Daftarkan Peserta Lain</button>
            </div>
          ) : null}
        </div>
        <div className="bg-gradient-to-r from-emerald-50 via-cyan-50 to-blue-50 px-6 py-4 text-center text-[10px] font-bold text-slate-500">Kesehatan Hari Ini · Untuk Langkah Lebih Jauh</div>
      </div>
    </main>
  );
}
