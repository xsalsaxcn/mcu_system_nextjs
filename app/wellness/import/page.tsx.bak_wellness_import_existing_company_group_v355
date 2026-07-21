"use client";

import { useEffect, useMemo, useState } from "react";
import AuthGate from "@/components/AuthGate";

export default function WellnessImportPage() {
  return <AuthGate>{() => <WellnessImport />}</AuthGate>;
}

function WellnessImport() {
  const [file, setFile] = useState<File | null>(null);
  // WELLNESS_IMPORT_COMPANY_GROUP_TYPE_FIX_V349: keep company state inside Wellness import component scope.
  // WELLNESS_SETTINGS_PARAMETER_V350_IMPORT: import now can use Wellness settings without touching other modules.

  const [wellnessCompanyNameV348, setWellnessCompanyNameV348] = useState("");
  const [groupName, setGroupName] = useState("Wellness Default");
  const [sheetName, setSheetName] = useState("");
  const [message, setMessage] = useState("Upload Excel peserta. No Karyawan akan menjadi kunci signup peserta.");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [settingsReady, setSettingsReady] = useState(false);
  const [companies, setCompanies] = useState<any[]>([]);
  const [groupUnits, setGroupUnits] = useState<any[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [selectedKelompokId, setSelectedKelompokId] = useState("");
  const [selectedGroupUnitId, setSelectedGroupUnitId] = useState("");

  async function loadSettings() {
    try {
      const json = await fetch("/api/wellness/settings", { cache: "no-store" }).then((r) => r.json());
      if (!json.ok) return;
      const loadedCompanies = json.companies || [];
      const loadedGroups = json.groupUnits || [];
      setCompanies(loadedCompanies);
      setGroupUnits(loadedGroups);
      setSettingsReady(true);
      if (!selectedCompanyId && loadedCompanies[0]?.id) {
        setSelectedCompanyId(String(loadedCompanies[0].id));
        setWellnessCompanyNameV348(loadedCompanies[0].name || "");
      }
    } catch {
      setSettingsReady(false);
    }
  }

  useEffect(() => { loadSettings(); }, []);

  const selectedCompany = useMemo(() => companies.find((item) => String(item.id) === String(selectedCompanyId)), [companies, selectedCompanyId]);
  const kelompokList = useMemo(() => groupUnits.filter((item) => String(item.company_id) === String(selectedCompanyId) && item.unit_type === "kelompok"), [groupUnits, selectedCompanyId]);
  const childGroupList = useMemo(() => groupUnits.filter((item) => String(item.company_id) === String(selectedCompanyId) && item.unit_type === "group" && (!selectedKelompokId || String(item.parent_id) === String(selectedKelompokId))), [groupUnits, selectedCompanyId, selectedKelompokId]);

  function handleCompanyChange(value: string) {
    setSelectedCompanyId(value);
    setSelectedKelompokId("");
    setSelectedGroupUnitId("");
    const company = companies.find((item) => String(item.id) === String(value));
    setWellnessCompanyNameV348(company?.name || "");
  }

  function handleKelompokChange(value: string) {
    setSelectedKelompokId(value);
    setSelectedGroupUnitId("");
    const kelompok = groupUnits.find((item) => String(item.id) === String(value));
    if (kelompok?.name) setGroupName(kelompok.name);
  }

  function handleGroupUnitChange(value: string) {
    setSelectedGroupUnitId(value);
    const groupUnit = groupUnits.find((item) => String(item.id) === String(value));
    if (groupUnit?.name) setGroupName(groupUnit.name);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!file) {
      setMessage("Pilih file Excel terlebih dahulu.");
      return;
    }

    setLoading(true);
    setResult(null);
    setMessage("Mengimport peserta Wellness + baseline MCU...");
    const form = new FormData();
    // WELLNESS_IMPORT_COMPANY_GROUP_TYPE_FIX_V349_PAYLOAD
    const companyNameV348Payload = wellnessCompanyNameV348.trim() || selectedCompany?.name || "";
    form.append("companyName", companyNameV348Payload);
    form.append("wellnessCompanyName", companyNameV348Payload);
    form.append("entityCompanyName", companyNameV348Payload);
    if (selectedCompanyId) form.append("company_id", selectedCompanyId);
    if (selectedKelompokId) form.append("kelompok_id", selectedKelompokId);
    if (selectedGroupUnitId) form.append("group_unit_id", selectedGroupUnitId);
    form.set("file", file);
    form.set("group_name", groupName);
    if (sheetName.trim()) form.set("sheet_name", sheetName.trim());

    const json = await fetch("/api/wellness/import/participants", {
      method: "POST",
      body: form,
    }).then((r) => r.json()).catch(() => ({ ok: false, message: "Gagal menghubungi server." }));

    setLoading(false);
    if (!json.ok) {
      setMessage(json.message || "Import gagal.");
      return;
    }
    setResult(json);
    const warning = json.extendedPayloadWarning ? ` Catatan: ${json.extendedPayloadWarning}` : "";
    setMessage(`Import selesai. Peserta bisa signup melalui /wellness/signup memakai No Karyawan yang sudah diimport.${warning}`);
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[2rem] bg-gradient-to-r from-fuchsia-600 via-rose-600 to-orange-500 shadow-sm">
        <div className="p-7 text-white">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-3xl font-black">Import Peserta Wellness</div>
              <div className="mt-2 max-w-3xl text-sm font-medium text-rose-50">Import identitas peserta + baseline MCU sebagai dasar treatment dan before-after program.</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <a href="/wellness/settings" className="rounded-2xl bg-white px-4 py-3 text-center text-sm font-black text-rose-700 shadow-sm">Setting Parameter</a>
              <a href="/wellness/history-import" className="rounded-2xl bg-white/15 px-4 py-3 text-center text-sm font-black text-white ring-1 ring-white/25">Import History MCU</a>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_420px]">
        <form onSubmit={submit} className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="grid gap-4">
            <label className="grid gap-2 text-sm font-black text-slate-700">
              File Excel peserta
              <input type="file" accept=".xlsx,.xls,.csv" className="rounded-2xl border border-slate-300 px-4 py-3 text-sm font-bold" onChange={(e) => setFile(e.target.files?.[0] || null)} required />
            </label>

            {settingsReady ? (
              <div className="rounded-3xl border border-blue-100 bg-blue-50 p-4">
                <div className="text-sm font-black text-blue-950">Ambil dari Setting Wellness</div>
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  <label className="grid gap-2 text-xs font-black text-blue-900">
                    Main Entity
                    <select className="rounded-2xl border border-blue-200 bg-white px-4 py-3 text-sm font-bold text-slate-900" value={selectedCompanyId} onChange={(e) => handleCompanyChange(e.target.value)}>
                      <option value="">Pilih perusahaan</option>
                      {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
                    </select>
                  </label>
                  <label className="grid gap-2 text-xs font-black text-blue-900">
                    Kelompok
                    <select className="rounded-2xl border border-blue-200 bg-white px-4 py-3 text-sm font-bold text-slate-900" value={selectedKelompokId} onChange={(e) => handleKelompokChange(e.target.value)}>
                      <option value="">Pilih kelompok</option>
                      {kelompokList.map((item) => <option key={item.id} value={item.id}>{item.name} {item.coach_name ? `- Coach ${item.coach_name}` : ""}</option>)}
                    </select>
                  </label>
                  <label className="grid gap-2 text-xs font-black text-blue-900">
                    Group
                    <select className="rounded-2xl border border-blue-200 bg-white px-4 py-3 text-sm font-bold text-slate-900" value={selectedGroupUnitId} onChange={(e) => handleGroupUnitChange(e.target.value)}>
                      <option value="">Pilih group</option>
                      {childGroupList.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                    </select>
                  </label>
                </div>
                <div className="mt-3 text-xs font-bold text-blue-700">Kosongkan Kelompok/Group bila ingin memakai kolom Kelompok/Divisi dari Excel. Untuk history pemeriksaan lama, gunakan Import History MCU.</div>
              </div>
            ) : null}

            <label className="grid gap-2 text-sm font-black text-slate-700">
              {/* WELLNESS_IMPORT_COMPANY_GROUP_V348 */}
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Company Name (Entitas Perusahaan)</label>
                <input
                  value={wellnessCompanyNameV348}
                  onChange={(e) => setWellnessCompanyNameV348(e.target.value)}
                  placeholder="Contoh: PT Harmony Wellness"
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100"
                />
                <p className="text-xs text-slate-500">Dipakai sebagai entitas perusahaan khusus peserta Wellness yang di-import.</p>
              </div>

              Add Group - Input Group Name
              <input className="rounded-2xl border border-slate-300 px-4 py-3 text-sm font-bold" value={groupName} onChange={(e) => setGroupName(e.target.value)} />
            </label>
            <label className="grid gap-2 text-sm font-black text-slate-700">
              Nama Sheet, opsional
              <input className="rounded-2xl border border-slate-300 px-4 py-3 text-sm font-bold" placeholder="Kosongkan untuk sheet pertama" value={sheetName} onChange={(e) => setSheetName(e.target.value)} />
            </label>
            <button disabled={loading} className="rounded-2xl bg-rose-600 px-5 py-4 text-sm font-black text-white shadow-sm disabled:opacity-60">{loading ? "Importing..." : "Import Peserta"}</button>
          </div>
        </form>

        <aside className="space-y-4">
          <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-lg font-black text-slate-900">Format Kolom yang Didukung</div>
            <div className="mt-3 text-sm font-semibold leading-6 text-slate-600">
              Minimal: <b>No Karyawan</b> dan <b>Nama</b>. Opsional identitas: Email, No HP, Jenis Kelamin, Tanggal Lahir, Kelompok/Divisi.
              <br /><br />
              Baseline MCU: <b>TB</b>, <b>BB Awal</b>, <b>BMI</b>, <b>Lingkar Perut</b>, <b>HbA1c</b>, <b>Gula Darah</b>, <b>Sistol</b>, <b>Diastol</b>, <b>Tekanan Darah</b>, <b>Tanggal MCU</b>, <b>Catatan MCU</b>, <b>Risk Cluster</b>.
            </div>
          </div>
          <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-lg font-black text-slate-900">Alur Wellness</div>
            <div className="mt-3 space-y-2 text-sm font-bold text-slate-600">
              <div>1. Setting entity, kelompok, group, parameter.</div>
              <div>2. Import peserta + baseline MCU.</div>
              <div>3. Monitoring harian/berkala.</div>
              <div>4. Mini MCU untuk before-after.</div>
            </div>
          </div>
          <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-lg font-black text-slate-900">Link Signup Peserta</div>
            <a href="/wellness/signup" className="mt-3 block rounded-2xl bg-blue-600 px-4 py-3 text-center text-sm font-black text-white">Buka /wellness/signup</a>
          </div>
        </aside>
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="rounded-2xl bg-slate-100 px-4 py-3 text-sm font-bold leading-6 text-slate-700">{message}</div>
        {result ? (
          <div className="mt-4 grid gap-3 md:grid-cols-5">
            <div className="rounded-2xl bg-emerald-50 p-4"><div className="text-xs font-black uppercase text-emerald-600">Inserted</div><div className="mt-1 text-3xl font-black text-emerald-900">{result.inserted}</div></div>
            <div className="rounded-2xl bg-blue-50 p-4"><div className="text-xs font-black uppercase text-blue-600">Updated</div><div className="mt-1 text-3xl font-black text-blue-900">{result.updated}</div></div>
            <div className="rounded-2xl bg-slate-50 p-4"><div className="text-xs font-black uppercase text-slate-500">Skipped</div><div className="mt-1 text-3xl font-black text-slate-900">{result.skipped}</div></div>
            <div className="rounded-2xl bg-purple-50 p-4"><div className="text-xs font-black uppercase text-purple-600">Baseline</div><div className="mt-1 text-3xl font-black text-purple-900">{result.baselineRows || 0}</div></div>
            <div className="rounded-2xl bg-amber-50 p-4"><div className="text-xs font-black uppercase text-amber-600">Errors</div><div className="mt-1 text-3xl font-black text-amber-900">{result.errors?.length || 0}</div></div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
