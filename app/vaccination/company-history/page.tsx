"use client";

import { useEffect, useMemo, useState } from "react";
import QRCodeImage from "@/components/QRCodeImage";
import VaccinationParticipantHistoryModal from "@/components/VaccinationParticipantHistoryModal";

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
  const [familyManager, setFamilyManager] = useState<any>(null);
  const [familyQuery, setFamilyQuery] = useState("");
  const [familyCandidates, setFamilyCandidates] = useState<any[]>([]);
  const [familySelected, setFamilySelected] = useState<any>(null);
  const [familyConfirmed, setFamilyConfirmed] = useState(false);
  const [familyExtraParent, setFamilyExtraParent] = useState(false);
  const [familyRelationMode, setFamilyRelationMode] = useState<"PARENT_CHILD" | "CHILD_PARENT" | "SPOUSE">("PARENT_CHILD");
  const [familySchemaReady, setFamilySchemaReady] = useState(false);
  const [familyBusy, setFamilyBusy] = useState(false);
  const [familyMessage, setFamilyMessage] = useState("");
  const [registrationHistory, setRegistrationHistory] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [type, setType] = useState("ALL");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [serviceEditor, setServiceEditor] = useState<any>(null);
  const [savingService, setSavingService] = useState(false);
  const [portalCard, setPortalCard] = useState<any>(null);
  const [participantEditor, setParticipantEditor] = useState<any>(null);
  const [participantForm, setParticipantForm] = useState<any>({});
  const [participantFile, setParticipantFile] = useState<File | null>(null);
  const [savingParticipant, setSavingParticipant] = useState(false);
  const [participantMessage, setParticipantMessage] = useState("");

  async function fetchJson(url: string, options?: RequestInit) {
    const response = await fetch(url, { cache: "no-store", ...options });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error || payload?.message || "Request gagal.");
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

  function openFamilyManager() {
    if (!detail?.person?.id || !detail?.company?.id) return;
    setFamilyManager({ companyId: Number(detail.company.id),
      currentId: Number(detail.person.id), currentName: String(detail.person.participant_name),
      currentType: detail.person.participant_type });
    setFamilyQuery(""); setFamilyCandidates([]); setFamilySelected(null);
    setFamilyRelationMode(detail.person.participant_type === "DEPENDENT" ? "CHILD_PARENT" : "PARENT_CHILD");
    setFamilyConfirmed(false); setFamilyExtraParent(false); setFamilyMessage("");
    // The spouse link uses its own table: never encode spouse as a fake Parent/Child pair.
    void fetchJson(`/api/vaccination/history/family-spouse?company_id=${Number(detail.company.id)}&person_id=${Number(detail.person.id)}`)
      .then((data) => setFamilySchemaReady(data?.schema_ready === true))
      .catch(() => setFamilySchemaReady(false));
  }

  async function searchFamilyCandidates() {
    if (!familyManager || familyQuery.trim().length < 2) return;
    setFamilyBusy(true); setFamilyMessage(""); setFamilySelected(null);
    try {
      const params = new URLSearchParams({ company_id: String(familyManager.companyId), q: familyQuery.trim() });
      const data = await fetchJson(`/api/vaccination/history/family-lookup?${params.toString()}`);
      setFamilyCandidates((data.candidates || []).filter((c: any) => !(c.source === "HISTORY" && Number(c.id) === familyManager.currentId)));
    } catch (e: any) { setFamilyCandidates([]); setFamilyMessage(String(e?.message || e)); }
    finally { setFamilyBusy(false); }
  }

  async function saveFamilyLink() {
    if (!familyManager || !familySelected || !familyConfirmed || !detail?.company?.company_key) return;
    setFamilyBusy(true); setFamilyMessage("");
    const subject = { historyPersonId: familyManager.currentId, name: familyManager.currentName };
    const chosen = familySelected.source === "REGISTRATION"
      ? { registrationId: familySelected.registration_id, name: familySelected.participant_name }
      : { historyPersonId: familySelected.id, name: familySelected.participant_name };
    try {
      const isSpouse = familyRelationMode === "SPOUSE";
      if (isSpouse && (familySelected.source !== "HISTORY" || !familySchemaReady)) {
        throw new Error("Pasangan harus dipilih dari dua profil History yang sudah diverifikasi. Skema Spouse harus tersedia sebelum disimpan.");
      }
      const parent = familyRelationMode === "CHILD_PARENT" ? chosen : subject;
      const dependent = familyRelationMode === "CHILD_PARENT" ? subject : chosen;
      const data = await fetchJson(isSpouse ? "/api/vaccination/history/family-spouse" : "/api/vaccination/family-bind", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isSpouse
          ? { companyId: Number(familyManager.companyId), firstHistoryPersonId: Number(subject.historyPersonId),
              secondHistoryPersonId: Number(chosen.historyPersonId),
              firstName: subject.name, secondName: chosen.name, confirmRelationship: true }
          : { companyKey: detail.company.company_key, parent, dependent, allowAdditionalParent: familyExtraParent }),
      });
      setFamilyMessage(data?.message || "Hubungan berhasil disimpan.");
      setFamilyConfirmed(false);
      await loadDetail(familyManager.currentId);
      await loadCompany(page, search, type);
      setFamilyCandidates([]); setFamilySelected(null); setFamilyQuery("");
      if (isSpouse) await loadDetail(familyManager.currentId);
    } catch (e: any) { setFamilyMessage(String(e?.message || e)); }
    finally { setFamilyBusy(false); }
  }

  function openCompanyPortalQr(company: any) {
    const token = String(company?.public_token || "").trim();
    if (!token) {
      setError("Public token perusahaan belum tersedia. Refresh Database Perusahaan lalu coba lagi.");
      return;
    }
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    setPortalCard({
      company_id: company.id,
      company_name: company.company_name,
      public_token: token,
      url: `${origin}/vaccination/history-portal?company=${encodeURIComponent(token)}`,
    });
  }

  function printCompanyPortalQr() {
    if (!portalCard) return;
    window.print();
  }

  function emptyParticipantForm() {
    return {
      participant_type: "EMPLOYEE",
      participant_name: "",
      employee_id: "",
      nik: "",
      email: "",
      phone: "",
      birth_date: "",
      gender: "",
      parent_employee_id: "",
      parent_nik: "",
      parent_email: "",
      service_name: "",
      product_brand: "",
      service_date: "",
      next_due_date: "",
      location: "",
      dose_number: "",
      lot_number: "",
      notes: "",
    };
  }

  function openParticipantEditor(company: any) {
    setParticipantEditor({ company_id: Number(company.id), company_name: company.company_name, tab: "MANUAL" });
    setParticipantForm(emptyParticipantForm());
    setParticipantFile(null);
    setParticipantMessage("");
    setError("");
  }

  function setParticipantValue(key: string, value: string) {
    setParticipantForm((previous: any) => ({ ...previous, [key]: value }));
  }

  async function refreshAfterParticipantChange() {
    await loadCompanies();
    await loadCompany(1, "", "ALL");
    setPage(1);
    setSearch("");
    setType("ALL");
  }

  async function saveManualParticipant() {
    if (!participantEditor?.company_id) return;
    if (!String(participantForm.participant_name || "").trim()) {
      setParticipantMessage("Nama Lengkap wajib diisi.");
      return;
    }
    const dependent = participantForm.participant_type === "DEPENDENT";
    if (!dependent && (!String(participantForm.employee_id || "").trim() || !String(participantForm.email || "").trim())) {
      setParticipantMessage("Karyawan wajib memiliki NIP / Employee ID dan Email Perusahaan.");
      return;
    }
    if (dependent && ((!String(participantForm.parent_employee_id || "").trim() && !String(participantForm.parent_nik || "").trim()) || !String(participantForm.parent_email || "").trim())) {
      setParticipantMessage("Anak / tanggungan wajib memiliki Parent NIP/NIK dan Parent Email Perusahaan.");
      return;
    }

    setSavingParticipant(true);
    setParticipantMessage("Menyimpan peserta...");
    try {
      const data = await fetchJson("/api/vaccination/history/manual-participants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...participantForm, company_id: participantEditor.company_id }),
      });
      setParticipantMessage(data.message || "Peserta berhasil disimpan.");
      setParticipantForm(emptyParticipantForm());
      await refreshAfterParticipantChange();
    } catch (e: any) {
      setParticipantMessage(String(e?.message || e));
    } finally {
      setSavingParticipant(false);
    }
  }

  async function importManualParticipants() {
    if (!participantEditor?.company_id || !participantFile) {
      setParticipantMessage("Pilih file Excel template terlebih dahulu.");
      return;
    }
    setSavingParticipant(true);
    setParticipantMessage("Mengimport peserta dan history layanan...");
    try {
      const formData = new FormData();
      formData.set("company_id", String(participantEditor.company_id));
      formData.set("file", participantFile);
      const data = await fetchJson("/api/vaccination/history/manual-participants", { method: "POST", body: formData });
      const review = Number(data.skipped || 0) > 0 ? ` ${data.skipped} baris perlu review.` : "";
      setParticipantMessage(`${data.message || "Import selesai."}${review}`);
      setParticipantFile(null);
      await refreshAfterParticipantChange();
    } catch (e: any) {
      setParticipantMessage(String(e?.message || e));
    } finally {
      setSavingParticipant(false);
    }
  }

  function openAddService() {
    if (!detail?.person?.id || !detail?.company?.id) return;
    setServiceEditor({
      mode: "ADD",
      service_id: null,
      service_name: "",
      product_brand: "",
      service_date: "",
      next_due_date: "",
      location: "",
      dose_number: "",
      lot_number: "",
      notes: "",
    });
  }

  function openEditService(service: any) {
    if (!service || service.source === "SYSTEM") return;
    setServiceEditor({
      mode: "EDIT",
      service_id: service.id,
      service_name: service.service_name || "",
      product_brand: service.product_brand || "",
      service_date: service.service_date || "",
      next_due_date: service.next_due_date || "",
      location: service.location || "",
      dose_number: service.dose_number || "",
      lot_number: service.lot_number || "",
      notes: service.notes || "",
    });
  }

  async function saveService() {
    if (!serviceEditor || !detail?.person?.id || !detail?.company?.id) return;
    if (!String(serviceEditor.service_name || "").trim()) {
      setError("Nama layanan wajib diisi.");
      return;
    }
    setSavingService(true);
    setError("");
    try {
      const method = serviceEditor.mode === "EDIT" ? "PATCH" : "POST";
      await fetchJson("/api/vaccination/history/admin-service", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...serviceEditor,
          company_id: detail.company.id,
          person_id: detail.person.id,
        }),
      });
      setServiceEditor(null);
      await loadDetail(Number(detail.person.id));
      await loadCompany(page, search, type);
      await loadCompanies();
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setSavingService(false);
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
            ["History Import", globalSummary.history_services],
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
                        <div className="flex flex-wrap items-center justify-center gap-2">
                          <button type="button" onClick={() => setCompanyId(String(company.id))} className={`rounded-xl px-3 py-2 text-xs font-black ${active ? "bg-emerald-600 text-white" : "border bg-white hover:bg-slate-50"}`}>{active ? "Terpilih" : "Lihat Peserta"}</button>
                          {active ? <button type="button" onClick={() => openCompanyPortalQr(company)} className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-black text-blue-800 hover:bg-blue-100">QR Portal Peserta</button> : null}
                          {active ? <button type="button" onClick={() => openParticipantEditor(company)} className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-black text-violet-800 hover:bg-violet-100">+ Tambah Peserta Manual</button> : null}
                        </div>
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
              <div className="grid flex-1 gap-2 md:grid-cols-[1fr_180px_auto_auto] xl:max-w-4xl">
                <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") applyFilter(); }} className="rounded-xl border px-3 py-2.5 text-sm" placeholder="Cari nama / NIP / NIK / email" />
                <select value={type} onChange={(e) => setType(e.target.value)} className="rounded-xl border bg-white px-3 py-2.5 text-sm font-bold">
                  <option value="ALL">Semua Peserta</option>
                  <option value="EMPLOYEE">Karyawan</option>
                  <option value="DEPENDENT">Anak / Tanggungan</option>
                </select>
                <button type="button" onClick={applyFilter} className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-black text-white hover:bg-blue-700">Terapkan</button>
                <a
                  href={`/api/vaccination/history/company-service/export?company_id=${encodeURIComponent(companyId)}`}
                  className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-center text-sm font-black text-emerald-800 hover:bg-emerald-100"
                >
                  Export Excel
                </a>
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {[
                ["Peserta", companyData?.summary?.persons],
                ["Anak / Tanggungan", companyData?.summary?.dependents],
                ["History Import", companyData?.summary?.history_services],
                ["Record Sistem", companyData?.summary?.system_records],
                ["Benefit Registrasi", companyData?.summary?.system_benefits],
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
                      <td className="p-3"><span className={`rounded-full px-2 py-1 text-xs font-black ${row.participant_type === "DEPENDENT" ? "bg-violet-100 text-violet-800" : "bg-emerald-100 text-emerald-800"}`}>{row.participant_type === "DEPENDENT" ? "DEPENDENT (History)" : "EMPLOYEE (History)"}</span></td>
                      <td className="p-3">{row.parent?.participant_name || "-"}</td>
                      <td className="p-3">
                        <div className="flex max-w-xl flex-wrap gap-1.5">
                          {(row.benefit_names || []).slice(0, 4).map((benefit: string) => <span key={benefit} className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-800">{benefit}</span>)}
                          {(row.benefit_names || []).length > 4 ? <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">+{row.benefit_names.length - 4}</span> : null}
                          {!row.benefit_names?.length ? <span className="text-xs font-semibold text-slate-400">Belum ada layanan</span> : null}
                        </div>
                        {row.system_count ? <div className="mt-2 text-xs font-bold text-emerald-700">Termasuk {row.system_count} record sistem</div> : null}
                        {row.validation?.validation_done_registrations ? <div className="mt-1 text-xs font-bold text-blue-700">Validasi selesai: {number(row.validation.validation_done_registrations)} registrasi</div> : null}
                        {row.validation?.done_without_current_record ? <div className="mt-1 text-xs font-bold text-amber-700">Perlu cek: {number(row.validation.done_without_current_record)} registrasi DONE belum memiliki record ADMINISTERED yang ditemukan</div> : null}
                        {row.validation?.completed_with_missing_linked_record ? <div className="mt-1 text-xs font-bold text-amber-700">Perlu pemeriksaan: {number(row.validation.completed_with_missing_linked_record)} item tidak menemukan record klinis terkait</div> : null}
                      </td>
                      <td className="p-3 text-right text-lg font-black">{number(row.service_count)}</td>
                      <td className="p-3"><div className="font-bold">{date(row.last_service_date)}</div><div className="mt-1 max-w-[220px] text-xs text-slate-500">{row.last_service_name || "-"}</div></td>
                      <td className="p-3 text-center"><button type="button" onClick={() => void loadDetail(Number(row.id))} className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-black text-blue-800 hover:bg-blue-100">Detail History</button></td>
                    </tr>
                  ))}
                  {(companyData?.operational_matches || []).map((r: any) => (
                    <tr key={`registration-${r.registration_id}`} className="align-top bg-amber-50/60 hover:bg-amber-50">
                      <td className="p-3 font-black">{r.participant_name}<div className="mt-1 text-xs font-semibold text-amber-800">Registrasi · belum terhubung ke Master History</div></td>
                      <td className="p-3"><div>{r.employee_id || "-"}</div>{r.nik ? <div className="text-xs text-slate-500">NIK {maskId(r.nik)}</div> : null}</td>
                      <td className="p-3">{r.email || "-"}</td>
                      <td className="p-3 text-xs font-bold text-amber-900">Profil Registrasi</td>
                      <td className="p-3 text-xs text-slate-500">Belum diverifikasi</td>
                      <td className="p-3"><div className="flex flex-wrap gap-1">{(r.benefit_names || []).map((v: string) => <span key={v} className="rounded bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-800">{v}</span>)}</div>
                        <div className="mt-2 text-xs">Validasi DONE: <b>{number(r.validation_done_count)}</b> · Item selesai: <b>{number(r.completed_item_count)}</b> · Record ADMINISTERED: <b>{number(r.administered_record_count)}</b></div>
                        {r.validation_warnings?.length ? <div className="mt-1 text-xs font-bold text-amber-800">Perlu audit record: {number(r.validation_warnings.length)} registrasi</div> : null}
                      </td>
                      <td className="p-3 text-right font-black">{number(r.benefit_count)}</td>
                      <td className="p-3 text-xs">{date(r.last_date)}</td>
                      <td className="p-3 text-center"><button type="button" onClick={() => setRegistrationHistory({ id: r.registration_id, participant_name: r.participant_name, employee_id: r.employee_id, nik: r.nik, email: r.email })} className="rounded-xl border bg-white px-3 py-2 text-xs font-black">Riwayat Registrasi</button></td>
                    </tr>
                  ))}
                  {!companyData?.rows?.length && !companyData?.operational_matches?.length ? <tr><td colSpan={9} className="p-8 text-center font-semibold text-slate-500">Peserta tidak ditemukan pada filter ini.</td></tr> : null}
                </tbody>
              </table>
            </div>

            {companyData?.operational_matches?.length ? (
              <p className="mt-3 text-xs font-semibold text-amber-900">Baris berwarna kuning adalah data Registrasi yang ditampilkan bersama hasil History agar mudah diperiksa. Baris ini <b>belum terhubung</b> ke profil Master History; tidak ada pembuatan profil atau penggabungan ID keluarga secara otomatis.</p>
            ) : null}

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

      {participantEditor ? (
        <div className="fixed inset-0 z-[135] flex items-center justify-center bg-slate-950/60 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget && !savingParticipant) setParticipantEditor(null); }}>
          <section className="max-h-[94vh] w-full max-w-5xl overflow-auto rounded-3xl border bg-white shadow-2xl">
            <div className="sticky top-0 z-20 border-b bg-white p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="text-xs font-black uppercase text-violet-700">Tambah Peserta History</div>
                  <h3 className="mt-1 text-2xl font-black text-slate-900">{participantEditor.company_name}</h3>
                  <p className="mt-1 text-sm font-semibold text-slate-500">Tambahkan peserta yang belum ada melalui isi field atau import Excel template. Peserta karyawan dengan NIP + Email Perusahaan otomatis dapat memakai QR Portal Peserta dan OTP.</p>
                </div>
                <button type="button" onClick={() => setParticipantEditor(null)} disabled={savingParticipant} className="rounded-xl border px-4 py-2 text-sm font-black disabled:opacity-50">Tutup</button>
              </div>
              <div className="mt-4 flex gap-2">
                <button type="button" onClick={() => { setParticipantEditor((v: any) => ({ ...v, tab: "MANUAL" })); setParticipantMessage(""); }} className={`rounded-xl px-4 py-2 text-sm font-black ${participantEditor.tab === "MANUAL" ? "bg-violet-600 text-white" : "border bg-white"}`}>Isi Field</button>
                <button type="button" onClick={() => { setParticipantEditor((v: any) => ({ ...v, tab: "IMPORT" })); setParticipantMessage(""); }} className={`rounded-xl px-4 py-2 text-sm font-black ${participantEditor.tab === "IMPORT" ? "bg-violet-600 text-white" : "border bg-white"}`}>Import Excel</button>
              </div>
            </div>

            {participantMessage ? <div className="mx-5 mt-5 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm font-bold text-blue-800">{participantMessage}</div> : null}

            {participantEditor.tab === "MANUAL" ? (
              <div className="space-y-5 p-5">
                <div className="rounded-2xl border p-4">
                  <div className="text-sm font-black text-slate-900">Identitas Peserta</div>
                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <label>
                      <span className="text-xs font-black uppercase text-slate-500">Tipe Peserta *</span>
                      <select value={participantForm.participant_type || "EMPLOYEE"} onChange={(e) => setParticipantValue("participant_type", e.target.value)} className="mt-2 w-full rounded-xl border bg-white px-3 py-2.5">
                        <option value="EMPLOYEE">Karyawan / Dewasa</option>
                        <option value="DEPENDENT">Anak / Tanggungan</option>
                      </select>
                    </label>
                    <label>
                      <span className="text-xs font-black uppercase text-slate-500">Nama Lengkap *</span>
                      <input value={participantForm.participant_name || ""} onChange={(e) => setParticipantValue("participant_name", e.target.value)} className="mt-2 w-full rounded-xl border px-3 py-2.5" />
                    </label>
                    {participantForm.participant_type !== "DEPENDENT" ? (
                      <>
                        <label><span className="text-xs font-black uppercase text-slate-500">NIP / Employee ID *</span><input value={participantForm.employee_id || ""} onChange={(e) => setParticipantValue("employee_id", e.target.value)} className="mt-2 w-full rounded-xl border px-3 py-2.5" /></label>
                        <label><span className="text-xs font-black uppercase text-slate-500">Email Perusahaan *</span><input type="email" value={participantForm.email || ""} onChange={(e) => setParticipantValue("email", e.target.value)} className="mt-2 w-full rounded-xl border px-3 py-2.5" /></label>
                      </>
                    ) : (
                      <>
                        <label><span className="text-xs font-black uppercase text-slate-500">Parent NIP / Employee ID *</span><input value={participantForm.parent_employee_id || ""} onChange={(e) => setParticipantValue("parent_employee_id", e.target.value)} className="mt-2 w-full rounded-xl border px-3 py-2.5" /></label>
                        <label><span className="text-xs font-black uppercase text-slate-500">Parent Email Perusahaan *</span><input type="email" value={participantForm.parent_email || ""} onChange={(e) => setParticipantValue("parent_email", e.target.value)} className="mt-2 w-full rounded-xl border px-3 py-2.5" /></label>
                        <label><span className="text-xs font-black uppercase text-slate-500">Parent NIK</span><input value={participantForm.parent_nik || ""} onChange={(e) => setParticipantValue("parent_nik", e.target.value)} className="mt-2 w-full rounded-xl border px-3 py-2.5" /></label>
                      </>
                    )}
                    <label><span className="text-xs font-black uppercase text-slate-500">NIK Peserta</span><input value={participantForm.nik || ""} onChange={(e) => setParticipantValue("nik", e.target.value)} className="mt-2 w-full rounded-xl border px-3 py-2.5" /></label>
                    <label><span className="text-xs font-black uppercase text-slate-500">No. HP</span><input value={participantForm.phone || ""} onChange={(e) => setParticipantValue("phone", e.target.value)} className="mt-2 w-full rounded-xl border px-3 py-2.5" /></label>
                    <label><span className="text-xs font-black uppercase text-slate-500">Tanggal Lahir</span><input type="date" value={participantForm.birth_date || ""} onChange={(e) => setParticipantValue("birth_date", e.target.value)} className="mt-2 w-full rounded-xl border px-3 py-2.5" /></label>
                    <label><span className="text-xs font-black uppercase text-slate-500">Gender</span><select value={participantForm.gender || ""} onChange={(e) => setParticipantValue("gender", e.target.value)} className="mt-2 w-full rounded-xl border bg-white px-3 py-2.5"><option value="">-</option><option value="Laki-laki">Laki-laki</option><option value="Perempuan">Perempuan</option></select></label>
                  </div>
                </div>

                <div className="rounded-2xl border p-4">
                  <div className="text-sm font-black text-slate-900">History Layanan <span className="font-semibold text-slate-400">(opsional jika hanya mendaftarkan identitas)</span></div>
                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <label><span className="text-xs font-black uppercase text-slate-500">Nama Layanan</span><input value={participantForm.service_name || ""} onChange={(e) => setParticipantValue("service_name", e.target.value)} className="mt-2 w-full rounded-xl border px-3 py-2.5" placeholder="Contoh: Vaksin Influenza" /></label>
                    <label><span className="text-xs font-black uppercase text-slate-500">Merk / Brand</span><input value={participantForm.product_brand || ""} onChange={(e) => setParticipantValue("product_brand", e.target.value)} className="mt-2 w-full rounded-xl border px-3 py-2.5" placeholder="Contoh: Influvac Tetra" /></label>
                    <label><span className="text-xs font-black uppercase text-slate-500">Tanggal Layanan</span><input type="date" value={participantForm.service_date || ""} onChange={(e) => setParticipantValue("service_date", e.target.value)} className="mt-2 w-full rounded-xl border px-3 py-2.5" /></label>
                    <label><span className="text-xs font-black uppercase text-slate-500">Next Schedule</span><input type="date" value={participantForm.next_due_date || ""} onChange={(e) => setParticipantValue("next_due_date", e.target.value)} className="mt-2 w-full rounded-xl border px-3 py-2.5" /></label>
                    <label><span className="text-xs font-black uppercase text-slate-500">Lokasi</span><input value={participantForm.location || ""} onChange={(e) => setParticipantValue("location", e.target.value)} className="mt-2 w-full rounded-xl border px-3 py-2.5" /></label>
                    <label><span className="text-xs font-black uppercase text-slate-500">Dose</span><input type="number" min="1" value={participantForm.dose_number || ""} onChange={(e) => setParticipantValue("dose_number", e.target.value)} className="mt-2 w-full rounded-xl border px-3 py-2.5" /></label>
                    <label><span className="text-xs font-black uppercase text-slate-500">Lot Number</span><input value={participantForm.lot_number || ""} onChange={(e) => setParticipantValue("lot_number", e.target.value)} className="mt-2 w-full rounded-xl border px-3 py-2.5" /></label>
                    <label className="md:col-span-2"><span className="text-xs font-black uppercase text-slate-500">Catatan</span><textarea value={participantForm.notes || ""} onChange={(e) => setParticipantValue("notes", e.target.value)} className="mt-2 min-h-20 w-full rounded-xl border px-3 py-2.5" /></label>
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setParticipantEditor(null)} disabled={savingParticipant} className="rounded-xl border px-4 py-2.5 text-sm font-black disabled:opacity-50">Batal</button>
                  <button type="button" onClick={() => void saveManualParticipant()} disabled={savingParticipant} className="rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-black text-white disabled:opacity-50">{savingParticipant ? "Menyimpan..." : "Simpan Peserta"}</button>
                </div>
              </div>
            ) : (
              <div className="space-y-5 p-5">
                <div className="rounded-2xl border border-violet-100 bg-violet-50 p-5">
                  <h4 className="text-lg font-black text-violet-950">Import Peserta via Excel</h4>
                  <p className="mt-2 text-sm font-semibold leading-6 text-violet-900/70">Gunakan template resmi agar NIP, Email Perusahaan, parent-anak, dan history layanan masuk ke field yang benar. Satu baris dapat berisi identitas peserta + satu history layanan.</p>
                  <a href={`/api/vaccination/history/manual-participants/template?company_id=${encodeURIComponent(String(participantEditor.company_id))}`} className="mt-4 inline-flex rounded-xl bg-white px-4 py-2.5 text-sm font-black text-violet-800 shadow-sm ring-1 ring-violet-200">Download Template Excel</a>
                </div>
                <label className="block rounded-2xl border p-5">
                  <span className="text-xs font-black uppercase text-slate-500">File Excel Template</span>
                  <input type="file" accept=".xlsx,.xls" onChange={(e) => setParticipantFile(e.target.files?.[0] || null)} className="mt-3 block w-full rounded-xl border p-3" />
                  <div className="mt-3 text-xs font-semibold leading-5 text-slate-500">Karyawan: NIP + Email Perusahaan wajib. Anak: Parent NIP/NIK + Parent Email wajib. Parent dapat berada di baris mana pun pada file yang sama karena karyawan diproses terlebih dahulu.</div>
                </label>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setParticipantEditor(null)} disabled={savingParticipant} className="rounded-xl border px-4 py-2.5 text-sm font-black disabled:opacity-50">Batal</button>
                  <button type="button" onClick={() => void importManualParticipants()} disabled={savingParticipant || !participantFile} className="rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-black text-white disabled:opacity-50">{savingParticipant ? "Mengimport..." : "Import Peserta"}</button>
                </div>
              </div>
            )}
          </section>
        </div>
      ) : null}

      {portalCard ? (
        <>
          <style jsx global>{`
            @media print {
              body * { visibility: hidden !important; }
              #vaccination-history-portal-print, #vaccination-history-portal-print * { visibility: visible !important; }
              #vaccination-history-portal-print { position: absolute !important; inset: 0 !important; margin: 0 auto !important; width: 100% !important; min-height: 100vh !important; display: flex !important; align-items: center !important; justify-content: center !important; background: #fff !important; }
              .vaccination-history-no-print { display: none !important; }
            }
          `}</style>
          <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/60 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setPortalCard(null); }}>
            <section className="w-full max-w-xl overflow-hidden rounded-3xl border bg-white shadow-2xl">
              <div id="vaccination-history-portal-print" className="bg-white p-7 text-center">
                <div className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">inHARMONY Vaccination</div>
                <h3 className="mt-2 text-2xl font-black text-slate-900">Portal Riwayat Layanan</h3>
                <div className="mt-2 text-lg font-black text-slate-700">{portalCard.company_name}</div>
                <div className="mx-auto mt-6 w-fit rounded-3xl border bg-white p-4 shadow-sm">
                  <QRCodeImage value={portalCard.url} size={260} />
                </div>
                <p className="mx-auto mt-5 max-w-md text-sm font-semibold leading-6 text-slate-600">Scan QR, masukkan NIP / Employee ID dan Email Perusahaan, lalu verifikasi OTP yang dikirim ke email terdaftar.</p>
                <div className="mt-4 break-all rounded-2xl bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-500">{portalCard.url}</div>
              </div>
              <div className="vaccination-history-no-print grid gap-2 border-t p-5 sm:grid-cols-3">
                <button type="button" onClick={() => setPortalCard(null)} className="rounded-xl border px-4 py-2.5 text-sm font-black">Tutup</button>
                <a href={portalCard.url} target="_blank" rel="noreferrer" className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-center text-sm font-black text-blue-800">Buka Portal</a>
                <button type="button" onClick={printCompanyPortalQr} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-black text-white">Print QR Portal</button>
              </div>
            </section>
          </div>
        </>
      ) : null}

      {registrationHistory ? <VaccinationParticipantHistoryModal registration={registrationHistory} onClose={() => setRegistrationHistory(null)} /> : null}
      {detail ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setDetail(null); }}>
          <section className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-3xl border bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b bg-white p-5">
              <div>
                <div className="text-xs font-black uppercase text-emerald-700">History Company Service</div>
                <h3 className="mt-1 text-2xl font-black text-slate-900">{detail.person?.participant_name}</h3>
                <div className="mt-1 text-sm font-semibold text-slate-500">{detail.company?.company_name} · {detail.person?.participant_type === "DEPENDENT" ? "Anak / Tanggungan" : "Karyawan"}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={openFamilyManager} className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-black text-violet-800">Atur Hubungan Keluarga</button>
                <button type="button" onClick={openAddService} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-black text-white hover:bg-emerald-700">+ Tambah Layanan</button>
                <button type="button" onClick={() => setDetail(null)} className="rounded-xl border bg-white px-4 py-2 text-sm font-black">Tutup</button>
              </div>
            </div>

            <div className="space-y-5 p-5">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {[
                  ["Total Entri Riwayat", detail.summary?.total],
                  ["History Import", detail.summary?.history],
                  ["Record Sistem", detail.summary?.system],
                  ["Benefit Registrasi", detail.summary?.system_benefits],
                  ["Jenis Benefit", detail.summary?.unique_benefits],
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-2xl border bg-slate-50 p-4"><div className="text-xs font-black uppercase text-slate-500">{label}</div><div className="mt-1 text-2xl font-black">{number(value)}</div></div>
                ))}
              </div>

              <section className="rounded-2xl border border-blue-100 bg-blue-50/40 p-4">
                <div className="text-xs font-black uppercase text-blue-800">Status Tim Validasi &amp; Riwayat (read-only)</div>
                <div className="mt-2 flex flex-wrap gap-4 text-sm font-bold text-slate-800">
                  <span>Registrasi terkait: {number(detail.validation?.registration_count)}</span>
                  <span>Validasi DONE: {number(detail.validation?.validation_done_registrations)}</span>
                  <span>Item berstatus selesai: {number(detail.validation?.completed_items)}</span>
                  <span>Record klinis ADMINISTERED: {number(detail.validation?.administered_records)}</span>
                </div>
                {detail.validation?.done_without_current_record ? <p className="mt-2 text-sm font-bold text-amber-800">Ada {number(detail.validation.done_without_current_record)} registrasi berstatus selesai tetapi belum ditemukan record klinis ADMINISTERED dalam data yang terbaca. Periksa Tim Validasi sebelum menyimpulkan tindakan sudah diberikan.</p> : null}
                {detail.validation?.completed_with_missing_linked_record ? <p className="mt-2 text-sm font-bold text-amber-800">Ada {number(detail.validation.completed_with_missing_linked_record)} item selesai dengan tautan record klinis yang tidak ditemukan. Perlu audit, tidak mengubah status otomatis.</p> : null}
                <p className="mt-2 text-xs font-semibold text-slate-600">Master History adalah profil peserta, bukan status vaksin. Validasi DONE tidak otomatis membuktikan pemberian vaksin; record klinis tetap menjadi bukti tindakan.</p>
              </section>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl border p-4 text-sm">
                  <div className="text-xs font-black uppercase text-slate-500">Identitas Peserta</div>
                  <div className="mt-3 space-y-1.5">
                    <div><b>NIP / Employee ID (History):</b> {detail.person?.employee_id || "-"}</div>
                    <div className="text-xs text-amber-700">BINUSIAN ID keluarga dapat berbeda dari NIP. Keduanya tidak otomatis disamakan atau ditimpa.</div>
                    <div><b>NIK:</b> {detail.person?.nik ? maskId(detail.person.nik) : "-"}</div>
                    <div><b>Email:</b> {detail.person?.email || "-"}</div>
                    <div><b>No. HP:</b> {detail.person?.phone || "-"}</div>
                    <div><b>Tanggal Lahir:</b> {date(detail.person?.birth_date)}</div>
                  </div>
                </div>
                <div className="rounded-2xl border p-4 text-sm">
                  <div className="text-xs font-black uppercase text-slate-500">Relasi Keluarga</div>
                  {(detail.parents || []).length ? <div className="mt-3"><b>Orang Tua / Wali Tertaut:</b><div className="mt-2 space-y-2">{detail.parents.map((p: any) => <div key={p.relation_id} className="rounded-lg bg-slate-50 px-3 py-2"><b>{p.participant_name}</b> <span className="text-xs text-slate-500">({p.relationship_type === "GUARDIAN" ? "Parent tambahan" : "Parent utama"})</span><div className="text-xs text-slate-500">{p.employee_id || p.email || ""}</div></div>)}</div></div> : detail.parent ? <div className="mt-3"><b>Parent:</b> {detail.parent.participant_name}</div> : null}
                  {detail.dependents?.length ? <div className="mt-3"><b>Anak / Tanggungan:</b><div className="mt-2 flex flex-wrap gap-2">{detail.dependents.map((child: any) => <span key={child.id} className="rounded-full bg-violet-100 px-3 py-1 text-xs font-black text-violet-800">{child.participant_name}</span>)}</div></div> : null}
                  {!detail.parent && !detail.dependents?.length && !detail.spouses?.length ? <div className="mt-3 text-slate-400">Tidak ada relasi keluarga yang tercatat.</div> : null}
                  {detail.spouses?.length ? <div className="mt-3"><b>Suami/Istri terkonfirmasi:</b> {detail.spouses.map((spouse: any) => <span key={spouse.id} className="ml-2 rounded-lg bg-pink-50 px-2 py-1 font-semibold text-pink-900">{spouse.participant_name}</span>)}</div> : null}
                </div>
              </div>

              <div>
                <h4 className="text-lg font-black text-slate-900">Riwayat Benefit dan Status Layanan</h4>
                <div className="mt-3 space-y-3">
                  {(detail.services || []).map((service: any) => (
                    <div key={`${service.source}-${service.id}`} className="rounded-2xl border p-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase ${service.source === "SYSTEM" ? "bg-emerald-100 text-emerald-800" : service.source === "SYSTEM_BENEFIT" ? "bg-violet-100 text-violet-800" : "bg-blue-100 text-blue-800"}`}>{service.source_label}</span>
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
                        {service.source === "SYSTEM" && service.record_status ? <span>Status klinis: {service.record_status}</span> : null}
                        {service.source === "SYSTEM_BENEFIT" && service.validation_status ? <span>Validasi: {service.validation_status}</span> : null}
                        {service.source === "SYSTEM_BENEFIT" && service.item_status ? <span>Item: {service.item_status}</span> : null}
                        {service.source === "SYSTEM_BENEFIT" ? <>
                          <span>Layanan: {service.service_mode === "BAZAR" ? "Bazar" : "Healthday"}</span>
                          <span>Status item: {service.item_status || "Belum ada"}</span>
                          <span>Status antrean: {service.registration_status || "Belum ada"}</span>
                          {service.service_mode === "BAZAR" && service.payment_method ? <span>Metode payment: {service.payment_method}</span> : null}
                          {service.service_mode === "BAZAR" && Number(service.payment_amount || 0) > 0 ? <span>Nominal item: Rp {number(service.payment_amount)}</span> : null}
                        </> : null}
                        {service.source === "SYSTEM" && service.record_status ? <span>Status klinis: {service.record_status}</span> : null}
                      </div>
                      {service.notes ? <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">{service.notes}</div> : null}
                      <div className="mt-3">
                        {service.source === "HISTORY_IMPORT" ? (
                          <button type="button" onClick={() => openEditService(service)} className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-black text-blue-800 hover:bg-blue-100">Edit Layanan</button>
                        ) : (
                          <span className="text-xs font-semibold text-slate-500">{service.source === "SYSTEM_BENEFIT" ? "Benefit registrasi bukan bukti vaksin telah diberikan. Data read-only, status mengikuti registrasi." : "Record klinis read-only; transaksi dan stok tidak diubah."}</span>
                        )}
                      </div>
                    </div>
                  ))}
                  {!detail.services?.length ? <div className="rounded-2xl border border-dashed p-8 text-center font-semibold text-slate-500">Belum ada benefit / layanan yang tercatat.</div> : null}
                </div>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {familyManager ? (
        <div className="fixed inset-0 z-[160] flex items-center justify-center bg-slate-950/60 p-4">
          <section className="max-h-[92vh] w-full max-w-2xl overflow-auto rounded-3xl bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div><div className="text-xs font-black uppercase text-violet-700">History Company Service · Family</div>
              <h3 className="mt-1 text-xl font-black">Atur Hubungan Keluarga</h3>
              <p className="mt-1 text-sm text-slate-600">Profil dipilih satu per satu. BINUSIAN ID sama bukan bukti satu orang.</p></div>
              <button type="button" onClick={() => setFamilyManager(null)} className="rounded-xl border px-3 py-2 text-sm font-bold">Tutup</button>
            </div>
            <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm">
              <b>{familyManager.currentName}</b> · Profil History {familyManager.currentType}<br />
              <span className="text-slate-600">Tipe EMPLOYEE/DEPENDENT adalah kategori import, bukan bukti siapa ibu, ayah, suami atau istri. Hubungan dipilih eksplisit.</span>
            </div>
            <fieldset className="mt-4 grid gap-2 sm:grid-cols-3">
              {([['PARENT_CHILD','Peserta → Anak'],['CHILD_PARENT','Anak → Peserta'],['SPOUSE','Suami / Istri']] as const).map(([mode,label]) =>
                <label key={mode} className={`flex cursor-pointer items-center gap-2 rounded-xl border p-3 text-xs font-bold ${familyRelationMode === mode ? 'border-violet-500 bg-violet-50' : 'bg-white'}`}>
                  <input type="radio" name="family-relation-mode" checked={familyRelationMode === mode} onChange={() => {setFamilyRelationMode(mode);setFamilySelected(null);setFamilyConfirmed(false);setFamilyExtraParent(false);}} />{label}
                </label>
              )}
            </fieldset>
            {familyRelationMode === "SPOUSE" && !familySchemaReady ? <p className="mt-2 rounded-xl bg-amber-50 p-3 text-xs font-bold text-amber-800">Penyimpanan Suami/Istri belum aktif sampai migrasi tabel Family Spouse V6341 diverifikasi di staging dan dipasang oleh admin. Tidak akan membuat relasi Parent/Child palsu.</p> : null}
            <div className="mt-4 flex gap-2">
              <input value={familyQuery} onChange={e => setFamilyQuery(e.target.value)} onKeyDown={e => { if (e.key === "Enter") void searchFamilyCandidates(); }} placeholder="Cari nama lengkap atau NIP / NIK" className="min-w-0 flex-1 rounded-xl border px-3 py-2" />
              <button type="button" disabled={familyBusy || familyQuery.trim().length < 2} onClick={() => void searchFamilyCandidates()} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Cari</button>
            </div>
            <p className="mt-2 text-xs text-slate-500">Kandidat berasal dari Master History atau Registrasi di perusahaan yang sama. Pilih berdasarkan nama dan bukti identitas; BINUSIAN ID keluarga saja tidak cukup. Untuk kandidat Registrasi, profil History baru hanya dapat dibuat setelah konfirmasi dan validasi server.</p>
            <div className="mt-3 max-h-52 space-y-2 overflow-y-auto">
              {familyCandidates.map((c: any) => (
                <button key={`${c.source || "HISTORY"}-${c.id}`} type="button" onClick={() => { setFamilySelected(c); setFamilyConfirmed(false); setFamilyExtraParent(false); }} className={`block w-full rounded-xl border p-3 text-left text-sm ${familySelected?.id === c.id && familySelected?.source === c.source ? "border-violet-600 bg-violet-50" : "bg-white"}`}>
                  <b>{c.participant_name}</b> · {c.source === "REGISTRATION" ? `Registrasi #${c.registration_id} (belum tentu ada di Master History)` : `History #${c.id}`}<div className="text-xs text-slate-500">{c.employee_id || c.nik || c.email || "Identitas sekunder tidak tersedia"}</div>
                  {c.parents?.length ? <div className="mt-1 text-xs text-amber-700">Parent tercatat: {c.parents.map((p: any) => p.name).join(", ")}</div> : null}
                </button>
              ))}
            </div>
            {familySelected ? <div className="mt-4 rounded-xl border p-4 text-sm">
              <b>Konfirmasi relasi:</b> {familyRelationMode === "SPOUSE" ? `${familyManager.currentName} ↔ ${familySelected.participant_name}` : familyRelationMode === "CHILD_PARENT" ? `${familySelected.participant_name} (orang tua) → ${familyManager.currentName} (anak)` : `${familyManager.currentName} (orang tua) → ${familySelected.participant_name} (anak)`}
              {familyRelationMode !== "SPOUSE" && ((familyRelationMode === "CHILD_PARENT" ? detail?.parents?.length : familySelected.parents?.length) || 0) > 0 ?
                <label className="mt-3 flex items-start gap-2"><input type="checkbox" checked={familyExtraParent} onChange={e => setFamilyExtraParent(e.target.checked)} className="mt-1" />
                  <span>Tambahkan sebagai Parent kedua tanpa mengganti Parent utama. Maksimal 2 Parent aktif. Periksa dulu bahwa keduanya benar orang tua/wali dari anak ini.</span></label> : null}
              {familySelected.source === "REGISTRATION" ? <p className="mt-2 text-xs font-bold text-amber-800">Kandidat Registrasi belum tentu berada di Master History. Alur Parent/Child lama dapat membuat profil History baru hanya setelah tombol Simpan dan verifikasi server. Hubungan Suami/Istri dan Parent kedua mensyaratkan dua profil History yang sudah ada.</p> : null}
              <label className="mt-3 flex items-start gap-2"><input type="checkbox" checked={familyConfirmed} onChange={e => setFamilyConfirmed(e.target.checked)} className="mt-1" />
                <span>Saya sudah memeriksa nama dan identitas kedua peserta serta mengonfirmasi hubungan keluarga ini.</span></label>
            </div> : null}
            {familyMessage ? <div className="mt-3 rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-900">{familyMessage}</div> : null}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setFamilyManager(null)} className="rounded-xl border px-4 py-2 text-sm font-bold">Batal</button>
              <button type="button" onClick={() => void saveFamilyLink()} disabled={!familySelected || !familyConfirmed || familyBusy || ((familyExtraParent || familyRelationMode === "SPOUSE") && familySelected.source === "REGISTRATION") || (familyRelationMode === "SPOUSE" && !familySchemaReady)} className="rounded-xl bg-violet-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{familyBusy ? "Memeriksa..." : "Simpan Hubungan"}</button>
            </div>
          </section>
        </div>
      ) : null}

      {serviceEditor && detail ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/60 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget && !savingService) setServiceEditor(null); }}>
          <section className="max-h-[92vh] w-full max-w-2xl overflow-auto rounded-3xl border bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b bg-white p-5">
              <div>
                <div className="text-xs font-black uppercase text-emerald-700">{serviceEditor.mode === "EDIT" ? "Edit History" : "Tambah Layanan"}</div>
                <h3 className="mt-1 text-xl font-black text-slate-900">{detail.person?.participant_name}</h3>
                <p className="mt-1 text-xs font-semibold text-slate-500">Perubahan tersimpan ke History dan langsung terbaca di Portal Peserta.</p>
              </div>
              <button type="button" onClick={() => setServiceEditor(null)} disabled={savingService} className="rounded-xl border px-3 py-2 text-sm font-black disabled:opacity-50">Tutup</button>
            </div>

            <div className="grid gap-4 p-5 md:grid-cols-2">
              <label className="md:col-span-2">
                <span className="text-xs font-black uppercase text-slate-500">Nama Layanan *</span>
                <input value={serviceEditor.service_name} onChange={(e) => setServiceEditor((v: any) => ({ ...v, service_name: e.target.value }))} className="mt-2 w-full rounded-xl border px-3 py-2.5" placeholder="Contoh: Vaksin Flu" />
              </label>
              <label>
                <span className="text-xs font-black uppercase text-slate-500">Merk / Brand</span>
                <input value={serviceEditor.product_brand} onChange={(e) => setServiceEditor((v: any) => ({ ...v, product_brand: e.target.value }))} className="mt-2 w-full rounded-xl border px-3 py-2.5" placeholder="Contoh: Influvac Tetra" />
              </label>
              <label>
                <span className="text-xs font-black uppercase text-slate-500">Lokasi</span>
                <input value={serviceEditor.location} onChange={(e) => setServiceEditor((v: any) => ({ ...v, location: e.target.value }))} className="mt-2 w-full rounded-xl border px-3 py-2.5" />
              </label>
              <label>
                <span className="text-xs font-black uppercase text-slate-500">Tanggal Layanan</span>
                <input type="date" value={serviceEditor.service_date} onChange={(e) => setServiceEditor((v: any) => ({ ...v, service_date: e.target.value }))} className="mt-2 w-full rounded-xl border px-3 py-2.5" />
              </label>
              <label>
                <span className="text-xs font-black uppercase text-slate-500">Next Schedule</span>
                <input type="date" value={serviceEditor.next_due_date} onChange={(e) => setServiceEditor((v: any) => ({ ...v, next_due_date: e.target.value }))} className="mt-2 w-full rounded-xl border px-3 py-2.5" />
              </label>
              <label>
                <span className="text-xs font-black uppercase text-slate-500">Dose</span>
                <input type="number" min="1" value={serviceEditor.dose_number} onChange={(e) => setServiceEditor((v: any) => ({ ...v, dose_number: e.target.value }))} className="mt-2 w-full rounded-xl border px-3 py-2.5" />
              </label>
              <label>
                <span className="text-xs font-black uppercase text-slate-500">Lot Number</span>
                <input value={serviceEditor.lot_number} onChange={(e) => setServiceEditor((v: any) => ({ ...v, lot_number: e.target.value }))} className="mt-2 w-full rounded-xl border px-3 py-2.5" />
              </label>
              <label className="md:col-span-2">
                <span className="text-xs font-black uppercase text-slate-500">Catatan</span>
                <textarea value={serviceEditor.notes} onChange={(e) => setServiceEditor((v: any) => ({ ...v, notes: e.target.value }))} className="mt-2 min-h-24 w-full rounded-xl border px-3 py-2.5" />
              </label>
            </div>

            <div className="flex flex-col gap-2 border-t p-5 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setServiceEditor(null)} disabled={savingService} className="rounded-xl border px-4 py-2.5 text-sm font-black disabled:opacity-50">Batal</button>
              <button type="button" onClick={() => void saveService()} disabled={savingService || !String(serviceEditor.service_name || "").trim()} className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-black text-white disabled:opacity-50">{savingService ? "Menyimpan..." : "Simpan History"}</button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
