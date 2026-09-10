"use client";

import { useEffect, useMemo, useState } from "react";

function number(value: unknown) {
  return Number(value || 0).toLocaleString("id-ID");
}

function date(value: unknown) {
  if (!value) return "-";
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

function maskId(value: unknown) {
  const text = String(value || "").trim();
  if (!text) return "-";
  if (text.length <= 5) return text;
  return `${text.slice(0, 3)}•••${text.slice(-3)}`;
}

function serviceLabel(row: any) {
  const service = String(row?.service_name || "").trim();
  const brand = String(row?.product_brand || "").trim();
  if (service && brand && !service.toLowerCase().includes(brand.toLowerCase())) return `${service} · ${brand}`;
  return service || brand || "Layanan";
}

export default function VaccinationCompanyHistoryPage() {
  const [companies, setCompanies] = useState<any[]>([]);
  const [globalSummary, setGlobalSummary] = useState<any>({ companies: 0, persons: 0, dependents: 0, history_services: 0 });
  const [companyId, setCompanyId] = useState("");
  const [companyData, setCompanyData] = useState<any>(null);
  const [detail, setDetail] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [type, setType] = useState("ALL");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function fetchJson(url: string) {
    const response = await fetch(url, { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error || "Request gagal.");
    return payload?.data ?? payload;
  }

  async function loadCompanies() {
    setLoading(true);
    setError("");
    try {
      const data = await fetchJson("/api/vaccination/history/company-service");
      setCompanies(data.companies || []);
      setGlobalSummary(data.summary || {});
      if (!companyId && data.companies?.length) setCompanyId(String(data.companies[0].id));
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  async function loadCompany(targetPage = page, targetSearch = search, targetType = type) {
    if (!companyId) {
      setCompanyData(null);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        company_id: companyId,
        page: String(targetPage),
        page_size: "50",
      });
      if (targetSearch.trim()) params.set("q", targetSearch.trim());
      if (targetType !== "ALL") params.set("type", targetType);
      const data = await fetchJson(`/api/vaccination/history/company-service?${params.toString()}`);
      setCompanyData(data);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  async function loadDetail(personId: number) {
    if (!companyId || !personId) return;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ company_id: companyId, person_id: String(personId) });
      setDetail(await fetchJson(`/api/vaccination/history/company-service?${params.toString()}`));
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadCompanies(); }, []);
  useEffect(() => {
    if (!companyId) return;
    setPage(1);
    setDetail(null);
    void loadCompany(1, "", "ALL");
    setSearch("");
    setType("ALL");
  }, [companyId]);

  const selectedCompany = useMemo(() => companies.find((row) => String(row.id) === companyId) || null, [companies, companyId]);
  const pagination = companyData?.pagination || { page: 1, pages: 1, total: 0 };

  function applyFilter() {
    setPage(1);
    void loadCompany(1, search, type);
  }

  function changePage(next: number) {
    const safe = Math.min(Math.max(1, next), Number(pagination.pages || 1));
    setPage(safe);
    void loadCompany(safe, search, type);
  }

  return (
    <main className="min-h-screen bg-slate-50 p-4 md:p-6">
      <div className="mx-auto max-w-[1500px] space-y-5">
        <section className="rounded-3xl border bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-xs font-black uppercase tracking-wide text-emerald-700">Vaccination History V151</div>
              <h1 className="mt-1 text-3xl font-black text-slate-900">History Company Service</h1>
              <p className="mt-2 max-w-4xl text-sm font-semibold leading-6 text-slate-500">
                Database read-only per perusahaan untuk melihat peserta, anak/tanggungan, serta benefit atau layanan yang sudah diambil. History import dan record vaksinasi sistem saat ini ditampilkan bersama tanpa mengubah transaksi aslinya.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <a href="/vaccination/history" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-black text-emerald-800 hover:bg-emerald-100">Import History</a>
              <a href="/vaccination" className="rounded-xl border bg-white px-4 py-2 text-sm font-black hover:bg-slate-50">☰ Menu Vaksinasi</a>
            </div>
          </div>
          {error ? <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{error}</div> : null}
        </section>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Perusahaan", globalSummary.companies],
            ["Master Peserta", globalSummary.persons],
            ["Anak / Tanggungan", globalSummary.dependents],
            ["History Benefit", globalSummary.history_services],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-2xl border bg-white p-5 shadow-sm">
              <div className="text-xs font-black uppercase text-slate-500">{label}</div>
              <div className="mt-2 text-3xl font-black text-slate-900">{number(value)}</div>
            </div>
          ))}
        </section>

        <section className="rounded-3xl border bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-black text-slate-900">Database Perusahaan</h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">Pilih perusahaan untuk membuka database peserta dan benefit yang sudah diambil.</p>
            </div>
            <button type="button" onClick={() => void loadCompanies()} disabled={loading} className="rounded-xl border bg-white px-4 py-2 text-sm font-black hover:bg-slate-50 disabled:opacity-50">Refresh</button>
          </div>

          <div className="mt-5 overflow-auto rounded-2xl border">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-100 text-xs uppercase text-slate-600">
                <tr>
                  <th className="p-3 text-left">Perusahaan</th>
                  <th className="p-3 text-right">Peserta</th>
                  <th className="p-3 text-right">Karyawan</th>
                  <th className="p-3 text-right">Anak</th>
                  <th className="p-3 text-right">Benefit History</th>
                  <th className="p-3 text-left">Layanan Terakhir</th>
                  <th className="p-3 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {companies.map((company) => {
                  const active = String(company.id) === companyId;
                  return (
                    <tr key={company.id} className={active ? "bg-emerald-50" : "hover:bg-slate-50"}>
                      <td className="p-3 font-black text-slate-900">{company.company_name}</td>
                      <td className="p-3 text-right font-bold">{number(company.persons)}</td>
                      <td className="p-3 text-right">{number(company.employees)}</td>
                      <td className="p-3 text-right">{number(company.dependents)}</td>
                      <td className="p-3 text-right font-bold text-emerald-700">{number(company.history_services)}</td>
                      <td className="p-3">{date(company.latest_service_date)}</td>
                      <td className="p-3 text-center">
                        <button type="button" onClick={() => setCompanyId(String(company.id))} className={`rounded-xl px-3 py-2 text-xs font-black ${active ? "bg-emerald-600 text-white" : "border bg-white hover:bg-slate-50"}`}>{active ? "Terpilih" : "Lihat Peserta"}</button>
                      </td>
                    </tr>
                  );
                })}
                {!companies.length ? <tr><td colSpan={7} className="p-6 text-center font-semibold text-slate-500">Belum ada perusahaan di database History.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>

        {selectedCompany ? (
          <section className="rounded-3xl border bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <div className="text-xs font-black uppercase text-emerald-700">Perusahaan Terpilih</div>
                <h2 className="mt-1 text-2xl font-black text-slate-900">{selectedCompany.company_name}</h2>
              </div>
              <div className="grid flex-1 gap-2 md:grid-cols-[1fr_180px_auto] xl:max-w-3xl">
                <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") applyFilter(); }} className="rounded-xl border px-3 py-2.5 text-sm" placeholder="Cari nama / NIP / NIK / email" />
                <select value={type} onChange={(e) => setType(e.target.value)} className="rounded-xl border bg-white px-3 py-2.5 text-sm font-bold">
                  <option value="ALL">Semua Peserta</option>
                  <option value="EMPLOYEE">Karyawan</option>
                  <option value="DEPENDENT">Anak / Tanggungan</option>
                </select>
                <button type="button" onClick={applyFilter} className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-black text-white hover:bg-blue-700">Terapkan</button>
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ["Peserta", companyData?.summary?.persons],
                ["Anak / Tanggungan", companyData?.summary?.dependents],
                ["History Import", companyData?.summary?.history_services],
                ["Record Sistem", companyData?.summary?.system_records],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-2xl border bg-slate-50 p-4">
                  <div className="text-xs font-black uppercase text-slate-500">{label}</div>
                  <div className="mt-1 text-2xl font-black">{number(value)}</div>
                </div>
              ))}
            </div>

            <div className="mt-5 overflow-auto rounded-2xl border">
              <table className="min-w-[1150px] w-full text-sm">
                <thead className="bg-slate-100 text-xs uppercase text-slate-600">
                  <tr>
                    <th className="p-3 text-left">Nama Peserta</th>
                    <th className="p-3 text-left">NIP / NIK</th>
                    <th className="p-3 text-left">Email</th>
                    <th className="p-3 text-left">Tipe</th>
                    <th className="p-3 text-left">Parent</th>
                    <th className="p-3 text-left">Benefit / Layanan Diambil</th>
                    <th className="p-3 text-right">Total</th>
                    <th className="p-3 text-left">Terakhir</th>
                    <th className="p-3 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(companyData?.rows || []).map((row: any) => (
                    <tr key={row.id} className="align-top hover:bg-slate-50">
                      <td className="p-3 font-black text-slate-900">{row.participant_name}</td>
                      <td className="p-3">
                        <div className="font-bold">{row.employee_id || "-"}</div>
                        {row.nik ? <div className="mt-1 text-xs text-slate-500">NIK {maskId(row.nik)}</div> : null}
                      </td>
                      <td className="p-3">{row.email || "-"}</td>
                      <td className="p-3"><span className={`rounded-full px-2 py-1 text-xs font-black ${row.participant_type === "DEPENDENT" ? "bg-violet-100 text-violet-800" : "bg-emerald-100 text-emerald-800"}`}>{row.participant_type === "DEPENDENT" ? "ANAK" : "KARYAWAN"}</span></td>
                      <td className="p-3">{row.parent?.participant_name || "-"}</td>
                      <td className="p-3">
                        <div className="flex max-w-xl flex-wrap gap-1.5">
                          {(row.benefit_names || []).slice(0, 4).map((benefit: string) => <span key={benefit} className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-800">{benefit}</span>)}
                          {(row.benefit_names || []).length > 4 ? <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">+{row.benefit_names.length - 4}</span> : null}
                          {!row.benefit_names?.length ? <span className="text-xs font-semibold text-slate-400">Belum ada layanan</span> : null}
                        </div>
                        {row.system_count ? <div className="mt-2 text-xs font-bold text-emerald-700">Termasuk {row.system_count} record sistem</div> : null}
                      </td>
                      <td className="p-3 text-right text-lg font-black">{number(row.service_count)}</td>
                      <td className="p-3"><div className="font-bold">{date(row.last_service_date)}</div><div className="mt-1 max-w-[220px] text-xs text-slate-500">{row.last_service_name || "-"}</div></td>
                      <td className="p-3 text-center"><button type="button" onClick={() => void loadDetail(Number(row.id))} className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-black text-blue-800 hover:bg-blue-100">Detail History</button></td>
                    </tr>
                  ))}
                  {!companyData?.rows?.length ? <tr><td colSpan={9} className="p-8 text-center font-semibold text-slate-500">Tidak ada peserta untuk filter ini.</td></tr> : null}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm font-semibold text-slate-500">Menampilkan halaman {pagination.page} dari {pagination.pages} · total {number(pagination.total)} peserta</div>
              <div className="flex gap-2">
                <button type="button" disabled={pagination.page <= 1 || loading} onClick={() => changePage(Number(pagination.page) - 1)} className="rounded-xl border bg-white px-4 py-2 text-sm font-black disabled:opacity-40">Sebelumnya</button>
                <button type="button" disabled={pagination.page >= pagination.pages || loading} onClick={() => changePage(Number(pagination.page) + 1)} className="rounded-xl border bg-white px-4 py-2 text-sm font-black disabled:opacity-40">Berikutnya</button>
              </div>
            </div>
          </section>
        ) : null}
      </div>

      {detail ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setDetail(null); }}>
          <section className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-3xl border bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b bg-white p-5">
              <div>
                <div className="text-xs font-black uppercase text-emerald-700">History Company Service</div>
                <h3 className="mt-1 text-2xl font-black text-slate-900">{detail.person?.participant_name}</h3>
                <div className="mt-1 text-sm font-semibold text-slate-500">{detail.company?.company_name} · {detail.person?.participant_type === "DEPENDENT" ? "Anak / Tanggungan" : "Karyawan"}</div>
              </div>
              <button type="button" onClick={() => setDetail(null)} className="rounded-xl border bg-white px-4 py-2 text-sm font-black">Tutup</button>
            </div>

            <div className="space-y-5 p-5">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  ["Total Benefit", detail.summary?.total],
                  ["History Import", detail.summary?.history],
                  ["Record Sistem", detail.summary?.system],
                  ["Jenis Benefit", detail.summary?.unique_benefits],
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-2xl border bg-slate-50 p-4"><div className="text-xs font-black uppercase text-slate-500">{label}</div><div className="mt-1 text-2xl font-black">{number(value)}</div></div>
                ))}
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl border p-4 text-sm">
                  <div className="text-xs font-black uppercase text-slate-500">Identitas Peserta</div>
                  <div className="mt-3 space-y-1.5">
                    <div><b>NIP / Employee ID:</b> {detail.person?.employee_id || "-"}</div>
                    <div><b>NIK:</b> {detail.person?.nik ? maskId(detail.person.nik) : "-"}</div>
                    <div><b>Email:</b> {detail.person?.email || "-"}</div>
                    <div><b>Tanggal Lahir:</b> {date(detail.person?.birth_date)}</div>
                  </div>
                </div>
                <div className="rounded-2xl border p-4 text-sm">
                  <div className="text-xs font-black uppercase text-slate-500">Relasi Keluarga</div>
                  {detail.parent ? <div className="mt-3"><b>Parent:</b> {detail.parent.participant_name}<div className="mt-1 text-xs text-slate-500">{detail.parent.employee_id || detail.parent.email || ""}</div></div> : null}
                  {detail.dependents?.length ? <div className="mt-3"><b>Anak / Tanggungan:</b><div className="mt-2 flex flex-wrap gap-2">{detail.dependents.map((child: any) => <span key={child.id} className="rounded-full bg-violet-100 px-3 py-1 text-xs font-black text-violet-800">{child.participant_name}</span>)}</div></div> : null}
                  {!detail.parent && !detail.dependents?.length ? <div className="mt-3 text-slate-400">Tidak ada relasi parent-anak yang tercatat.</div> : null}
                </div>
              </div>

              <div>
                <h4 className="text-lg font-black text-slate-900">Benefit / Layanan yang Sudah Diambil</h4>
                <div className="mt-3 space-y-3">
                  {(detail.services || []).map((service: any) => (
                    <div key={`${service.source}-${service.id}`} className="rounded-2xl border p-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase ${service.source === "SYSTEM" ? "bg-emerald-100 text-emerald-800" : "bg-blue-100 text-blue-800"}`}>{service.source_label}</span>
                          <div className="mt-2 text-lg font-black text-slate-900">{serviceLabel(service)}</div>
                          <div className="mt-1 text-sm font-semibold text-slate-500">{date(service.service_date)}{service.location ? ` · ${service.location}` : ""}</div>
                        </div>
                        {service.next_due_date ? <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-800">Next: {date(service.next_due_date)}</span> : null}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs font-semibold text-slate-500">
                        {service.dose_number ? <span>Dose {service.dose_number}</span> : null}
                        {service.lot_number ? <span>Lot {service.lot_number}</span> : null}
                        {service.administered_by ? <span>Petugas: {service.administered_by}</span> : null}
                        {service.source_filename ? <span>Sumber: {service.source_filename}</span> : null}
                      </div>
                      {service.notes ? <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">{service.notes}</div> : null}
                    </div>
                  ))}
                  {!detail.services?.length ? <div className="rounded-2xl border border-dashed p-8 text-center font-semibold text-slate-500">Belum ada benefit / layanan yang tercatat.</div> : null}
                </div>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
