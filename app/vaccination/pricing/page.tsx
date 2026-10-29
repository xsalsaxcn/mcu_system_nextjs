"use client";

import { useEffect, useMemo, useState } from "react";

// V507_VACCINATION_PACKAGE_NON_PACKAGE_PRICING_UI
function rupiah(value: any) {
  const n = Number(value || 0);
  return `Rp ${new Intl.NumberFormat("id-ID").format(Number.isFinite(n) ? n : 0)}`;
}

export default function VaccinationPricingPage() {
  const [vaccines, setVaccines] = useState<any[]>([]);
  const [offers, setOffers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [saleMode, setSaleMode] = useState<"PACKAGE" | "NON_PACKAGE">("NON_PACKAGE");
  const [vaccineId, setVaccineId] = useState("");
  const [packageDoseCount, setPackageDoseCount] = useState("3");
  const [price, setPrice] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/vaccination/pricing", { cache: "no-store" });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.ok) throw new Error(json.message || "Gagal membaca harga Paket/Non Paket.");
      setVaccines(json.vaccines || []);
      setOffers(json.offers || []);
      if (!vaccineId && (json.vaccines || []).length) {
        setVaccineId(String(json.vaccines[0].id));
      }
    } catch (e: any) {
      setError(e?.message || "Gagal membaca harga Paket/Non Paket.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const vaccineMap = useMemo(
    () => new Map(vaccines.map((v) => [Number(v.id), v])),
    [vaccines],
  );

  const filteredOffers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return offers.filter((offer) => {
      if (offer.active === false) return false;
      const vaccine = vaccineMap.get(Number(offer.vaccine_id));
      const haystack = [
        vaccine?.name,
        vaccine?.brand,
        offer.sale_mode,
        offer.label,
        offer.package_dose_count,
        offer.price,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return !q || haystack.includes(q);
    });
  }, [offers, search, vaccineMap]);

  async function saveOffer() {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/vaccination/pricing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save",
          vaccine_id: Number(vaccineId || 0),
          sale_mode: saleMode,
          package_dose_count: saleMode === "PACKAGE" ? Number(packageDoseCount || 0) : 1,
          price: Number(price || 0),
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.ok) throw new Error(json.message || "Gagal menyimpan harga.");
      setMessage("Harga berhasil disimpan. Stok tetap memakai produk/lot yang sama.");
      setPrice("");
      await load();
    } catch (e: any) {
      setError(e?.message || "Gagal menyimpan harga.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteOffer(id: number) {
    if (!confirm("Nonaktifkan kategori harga ini? Stok produk tidak akan berubah.")) return;
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/vaccination/pricing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.ok) throw new Error(json.message || "Gagal menonaktifkan harga.");
      setMessage("Kategori harga dinonaktifkan. Inventory produk tetap aman.");
      await load();
    } catch (e: any) {
      setError(e?.message || "Gagal menonaktifkan harga.");
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-6xl space-y-5">
        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.18em] text-emerald-600">
                Vaccination · Harga Layanan
              </div>
              <h1 className="mt-1 text-2xl font-black">Paket / Non Paket</h1>
              <p className="mt-2 max-w-3xl text-sm text-slate-600">
                Kategori harga tidak membuat stok baru. Paket dan Non Paket selalu mengambil dosis dari produk dan Lot yang sama.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <a href="/vaccination/iserve" className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-bold text-indigo-700">⇩ Export iServe</a>
              <a href="/vaccination/master" className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-bold text-blue-700">← Master Produk & Stok</a>
            </div>
          </div>

          {error ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{error}</div> : null}
          {message ? <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800">{message}</div> : null}

          <div className="mt-6 grid gap-4 rounded-2xl border bg-slate-50 p-5 md:grid-cols-2">
            <div>
              <label className="text-xs font-black uppercase text-slate-500">Kategori Penjualan</label>
              <select value={saleMode} onChange={(e) => setSaleMode(e.target.value === "PACKAGE" ? "PACKAGE" : "NON_PACKAGE")} className="mt-2 w-full rounded-xl border bg-white px-4 py-3 text-sm font-bold">
                <option value="NON_PACKAGE">Non Paket</option>
                <option value="PACKAGE">Paket</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-black uppercase text-slate-500">Produk</label>
              <select value={vaccineId} onChange={(e) => setVaccineId(e.target.value)} className="mt-2 w-full rounded-xl border bg-white px-4 py-3 text-sm font-bold">
                {vaccines.map((vaccine) => (
                  <option key={vaccine.id} value={String(vaccine.id)}>
                    {vaccine.name}{vaccine.brand ? ` · ${vaccine.brand}` : ""}
                  </option>
                ))}
              </select>
            </div>
            {saleMode === "PACKAGE" ? (
              <div>
                <label className="text-xs font-black uppercase text-slate-500">Jumlah Dosis Paket</label>
                <input type="number" min={2} step={1} value={packageDoseCount} onChange={(e) => setPackageDoseCount(e.target.value)} className="mt-2 w-full rounded-xl border bg-white px-4 py-3 text-sm font-bold" />
                <div className="mt-1 text-xs text-slate-500">Contoh Hepatitis B = 3 dosis. Stok tidak langsung dipotong 3; tetap -1 setiap kali vaksin diberikan.</div>
              </div>
            ) : (
              <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800">
                Non Paket = satu transaksi layanan untuk satu dosis aktual.
              </div>
            )}
            <div>
              <label className="text-xs font-black uppercase text-slate-500">Harga</label>
              <input type="number" min={0} step={1000} value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Contoh 500000" className="mt-2 w-full rounded-xl border bg-white px-4 py-3 text-sm font-bold" />
            </div>
            <div className="md:col-span-2">
              <button type="button" onClick={saveOffer} disabled={saving || !vaccineId} className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-black text-white disabled:opacity-50">
                {saving ? "Menyimpan..." : "Simpan Harga Paket / Non Paket"}
              </button>
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b p-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="font-black">Daftar Harga</div>
              <div className="mt-1 text-xs text-slate-500">Semua kategori tetap menunjuk ke stok produk yang sama.</div>
            </div>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari produk / kategori..." className="rounded-xl border px-4 py-2 text-sm" />
          </div>
          {loading ? (
            <div className="p-6 text-sm text-slate-500">Memuat...</div>
          ) : (
            <div className="overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-600">
                  <tr>
                    <th className="p-3 text-left">Produk</th>
                    <th className="p-3 text-left">Kategori</th>
                    <th className="p-3 text-left">Dosis Paket</th>
                    <th className="p-3 text-left">Harga</th>
                    <th className="p-3 text-left">Sumber Stok</th>
                    <th className="p-3 text-left">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredOffers.map((offer) => {
                    const vaccine = vaccineMap.get(Number(offer.vaccine_id));
                    return (
                      <tr key={offer.id}>
                        <td className="p-3 font-bold">{vaccine?.name || `Vaksin ${offer.vaccine_id}`}<div className="text-xs font-normal text-slate-500">{vaccine?.brand || "-"}</div></td>
                        <td className="p-3"><span className={`rounded-full px-2.5 py-1 text-xs font-black ${offer.sale_mode === "PACKAGE" ? "bg-violet-50 text-violet-700" : "bg-blue-50 text-blue-700"}`}>{offer.sale_mode === "PACKAGE" ? "Paket" : "Non Paket"}</span></td>
                        <td className="p-3 font-bold">{offer.sale_mode === "PACKAGE" ? `${offer.package_dose_count} dosis` : "1 dosis"}</td>
                        <td className="p-3 font-black">{rupiah(offer.price)}</td>
                        <td className="p-3 text-xs text-slate-600">Produk + Lot yang sama</td>
                        <td className="p-3"><button type="button" onClick={() => deleteOffer(Number(offer.id))} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">Nonaktifkan</button></td>
                      </tr>
                    );
                  })}
                  {!filteredOffers.length ? (
                    <tr><td colSpan={6} className="p-8 text-center text-sm text-slate-500">Belum ada harga Paket / Non Paket.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
