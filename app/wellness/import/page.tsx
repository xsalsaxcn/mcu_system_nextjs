"use client";

import WellnessQuickNav from "@/components/wellness/WellnessQuickNav";

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
  const [settingsMessage, setSettingsMessage] = useState("Memuat perusahaan dari Setting Wellness...");
  const [companies, setCompanies] = useState<any[]>([]);
  const [groupUnits, setGroupUnits] = useState<any[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [selectedKelompokId, setSelectedKelompokId] = useState("");
  const [selectedGroupUnitId, setSelectedGroupUnitId] = useState("");

  async function loadSettings() {
    try {
      const json = await fetch("/api/wellness/settings", { cache: "no-store" }).then((r) => r.json());
      if (!json.ok) {
        setSettingsReady(false);
        setSettingsMessage(json.message || "Setting Wellness belum siap. Jalankan SQL setting Wellness atau tambah perusahaan di /wellness/settings.");
        return;
      }
      const loadedCompanies = json.companies || [];
      const loadedGroups = json.groupUnits || [];
      setCompanies(loadedCompanies);
      setGroupUnits(loadedGroups);
      setSettingsReady(true);
      setSettingsMessage(loadedCompanies.length ? "Pilih perusahaan/kelompok/group yang sudah ada agar upload peserta masuk ke scope yang tepat." : "Belum ada perusahaan di Setting Wellness. Tambahkan dulu di /wellness/settings atau input nama perusahaan baru manual.");
      if (!selectedCompanyId && loadedCompanies[0]?.id) {
        setSelectedCompanyId(String(loadedCompanies[0].id));
        setWellnessCompanyNameV348(loadedCompanies[0].name || "");
      }
    } catch {
      setSettingsReady(false);
      setSettingsMessage("Gagal memuat daftar perusahaan. Kamu masih bisa input nama perusahaan manual, tetapi pilihan kelompok/group dari setting tidak akan muncul.");
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
    setGroupName("Wellness Default");
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
      {/* WELLNESS_QUICK_NAV_V374 */}
      <WellnessQuickNav />

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

      <section className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
        <form onSubmit={submit} className="min-w-0 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="grid gap-4">
            <label className="grid gap-2 text-sm font-black text-slate-700">
              File Excel peserta
              <input type="file" accept=".xlsx,.xls,.csv" className="rounded-2xl border border-slate-300 px-4 py-3 text-sm font-bold" onChange={(e) => setFile(e.target.files?.[0] || null)} required />
            </label>

            <div className="rounded-3xl border border-blue-100 bg-blue-50 p-4">
              {/* WELLNESS_IMPORT_EXISTING_COMPANY_V355 */}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="text-sm font-black text-blue-950">Target Upload Peserta per Grup</div>
                  <div className="mt-1 break-words text-xs font-bold leading-5 text-blue-700">{settingsMessage}</div>
                </div>
                <a href="/wellness/settings" className="shrink-0 rounded-2xl bg-white px-3 py-2 text-center text-xs font-black text-blue-700 ring-1 ring-blue-100">Kelola Setting</a>
              </div>
              {/* WELLNESS_IMPORT_LAYOUT_FIX_V356: responsive fields to prevent dropdown overlap on 1366px screens. */}
              <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-2">
                <label className="grid min-w-0 gap-2 text-xs font-black text-blue-900 xl:col-span-2">
                  Pilih Perusahaan yang Sudah Ada
                  <select className="w-full min-w-0 truncate rounded-2xl border border-blue-200 bg-white px-4 py-3 pr-10 text-sm font-bold text-slate-900" value={selectedCompanyId} onChange={(e) => handleCompanyChange(e.target.value)}>
                    <option value="">Input perusahaan baru / manual</option>
                    {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
                  </select>
                </label>
                <label className="grid min-w-0 gap-2 text-xs font-black text-blue-900">
                  Pilih Kelompok
                  <select className="w-full min-w-0 truncate rounded-2xl border border-blue-200 bg-white px-4 py-3 pr-10 text-sm font-bold text-slate-900 disabled:bg-slate-100 disabled:text-slate-400" value={selectedKelompokId} onChange={(e) => handleKelompokChange(e.target.value)} disabled={!selectedCompanyId || !kelompokList.length}>
                    <option value="">{selectedCompanyId ? "Pilih kelompok" : "Pilih perusahaan dulu"}</option>
                    {kelompokList.map((item) => <option key={item.id} value={item.id}>{item.name} {item.coach_name ? `- Coach ${item.coach_name}` : ""}</option>)}
                  </select>
                </label>
                <label className="grid min-w-0 gap-2 text-xs font-black text-blue-900">
                  Pilih Group Upload
                  <select className="w-full min-w-0 truncate rounded-2xl border border-blue-200 bg-white px-4 py-3 pr-10 text-sm font-bold text-slate-900 disabled:bg-slate-100 disabled:text-slate-400" value={selectedGroupUnitId} onChange={(e) => handleGroupUnitChange(e.target.value)} disabled={!selectedCompanyId || !childGroupList.length}>
                    <option value="">{selectedKelompokId ? "Pilih group" : "Pilih kelompok dulu"}</option>
                    {childGroupList.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                </label>
              </div>
              <div className="mt-3 rounded-2xl bg-white/70 px-4 py-3 text-xs font-bold leading-5 text-blue-800">
                Untuk upload per grup, pilih <b>Perusahaan → Kelompok → Group</b>. Sistem akan mengirim <b>company_id</b>, <b>kelompok_id</b>, dan <b>group_unit_id</b> agar peserta tersimpan di scope Wellness yang benar.
              </div>
              {!settingsReady ? <div className="mt-2 text-xs font-bold text-amber-700">Pilihan existing company belum aktif karena setting belum terbaca. Pastikan SQL setting Wellness sudah dijalankan.</div> : null}
            </div>

            <div className="grid min-w-0 gap-2 text-sm font-black text-slate-700">
              {/* WELLNESS_IMPORT_COMPANY_GROUP_V348 */}
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Company Name (Entitas Perusahaan)</label>
                <input
                  value={wellnessCompanyNameV348}
                  onChange={(e) => setWellnessCompanyNameV348(e.target.value)}
                  placeholder={selectedCompanyId ? "Otomatis dari perusahaan yang dipilih" : "Contoh: PT Harmony Wellness"}
                  readOnly={!!selectedCompanyId}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100 read-only:bg-slate-50 read-only:text-slate-500"
                />
                <p className="text-xs text-slate-500">Jika memilih perusahaan yang sudah ada, field ini dikunci agar tidak typo. Pilih opsi input perusahaan baru bila ingin membuat entitas baru.</p>
              </div>

              <label className="text-sm font-black text-slate-700">Risk Cluster / Label Risiko Default (opsional)</label>
              <input className="w-full min-w-0 rounded-2xl border border-slate-300 px-4 py-3 text-sm font-bold" value={groupName} onChange={(e) => setGroupName(e.target.value)} />
              <p className="text-xs font-semibold leading-5 text-slate-500">Ini bukan Group Upload. Group Upload tetap dipilih dari dropdown biru di atas. Field ini hanya label risiko/default bila Excel tidak punya Risk Cluster.</p>
            </div>
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
              Minimal: <b>No Karyawan/KODE</b> dan <b>Nama Karyawan</b>. Opsional identitas: Email, No HP, Jenis Kelamin, Tanggal Lahir, Departemen/Divisi.
              <br /><br />
              Baseline MCU: <b>TB</b>, <b>BB Awal</b>, <b>BMI</b>, <b>Lingkar Perut</b>, <b>HbA1c</b>, <b>Gula Darah</b>, <b>Sistol</b>, <b>Diastol</b>, <b>Tekanan Darah</b>, <b>Tanggal Periksa/MCU</b>, <b>Catatan MCU</b>, <b>Risk Cluster/Nama Grup</b>.
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
        {result?.errors?.length ? (
          <div className="mt-4 rounded-3xl border border-amber-200 bg-amber-50 p-4">
            <div className="text-sm font-black text-amber-900">Detail Error / Baris Dilewati</div>
            <div className="mt-1 text-xs font-semibold leading-5 text-amber-700">Periksa kolom KODE/No Karyawan dan Nama Karyawan. Sistem sekarang mencegah kolom Nama Grup terbaca sebagai nama peserta.</div>
            <div className="mt-3 max-h-56 overflow-auto rounded-2xl bg-white/70 p-3 text-xs font-bold leading-6 text-amber-900">
              {result.errors.slice(0, 50).map((item: string, index: number) => <div key={`${index}-${item}`}>• {item}</div>)}
              {result.errors.length > 50 ? <div>• Dan {result.errors.length - 50} error lain...</div> : null}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
