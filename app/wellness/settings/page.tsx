"use client";

import { useEffect, useMemo, useState } from "react";
import AuthGate from "@/components/AuthGate";

// WELLNESS_SETTINGS_PARAMETER_V350_PAGE
// WELLNESS_SETTINGS_COACH_DROPDOWN_V121

type ParameterDraft = {
  parameter_key: string;
  label: string;
  frequency?: string;
  filled_by?: string;
  unit?: string;
  is_enabled?: number | boolean;
  sort_order?: number;
};

const FALLBACK_MAIN_PARAMETERS: ParameterDraft[] = [
  { parameter_key: "nutrition", label: "Nutrisi", frequency: "Harian", filled_by: "Peserta", is_enabled: true },
  { parameter_key: "height_weight", label: "TB & BB", frequency: "Berkala", filled_by: "Peserta/Nakes", is_enabled: true },
  { parameter_key: "workout", label: "Workout", frequency: "Harian", filled_by: "Peserta", is_enabled: true },
  { parameter_key: "mini_mcu", label: "Mini MCU", frequency: "Berkala", filled_by: "Nakes", is_enabled: true },
];

const FALLBACK_MINI_MCU_PARAMETERS: ParameterDraft[] = [
  { parameter_key: "weight_kg", label: "Berat Badan", unit: "kg", is_enabled: true },
  { parameter_key: "bmi", label: "BMI", unit: "kg/m2", is_enabled: true },
  { parameter_key: "waist_cm", label: "Lingkar Perut", unit: "cm", is_enabled: true },
  { parameter_key: "blood_pressure", label: "Tekanan Darah", unit: "mmHg", is_enabled: true },
  { parameter_key: "glucose", label: "Gula Darah", unit: "mg/dL", is_enabled: true },
  { parameter_key: "hba1c", label: "HbA1c", unit: "%", is_enabled: true },
  { parameter_key: "lipid", label: "Profil Lipid", unit: "mg/dL", is_enabled: false },
  { parameter_key: "uric_acid", label: "Asam Urat", unit: "mg/dL", is_enabled: false },
  { parameter_key: "notes", label: "Catatan Nakes", unit: "", is_enabled: true },
];

function enabled(value: any) {
  return value === true || value === 1 || value === "1" || value === "true";
}

export default function WellnessSettingsPage() {
  return <AuthGate>{() => <WellnessSettings />}</AuthGate>;
}

function WellnessSettings() {
  const [companies, setCompanies] = useState<any[]>([]);
  const [groupUnits, setGroupUnits] = useState<any[]>([]);
  const [coaches, setCoaches] = useState<any[]>([]);
  const [programParameters, setProgramParameters] = useState<any[]>([]);
  const [miniMcuParameters, setMiniMcuParameters] = useState<any[]>([]);
  const [defaultMain, setDefaultMain] = useState<ParameterDraft[]>(FALLBACK_MAIN_PARAMETERS);
  const [defaultMini, setDefaultMini] = useState<ParameterDraft[]>(FALLBACK_MINI_MCU_PARAMETERS);
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [kelompokName, setKelompokName] = useState("");
  const [selectedCoachId, setSelectedCoachId] = useState("");
  const [groupName, setGroupName] = useState("");
  const [parentKelompokId, setParentKelompokId] = useState("");
  const [message, setMessage] = useState("Setting Wellness hanya menyimpan tabel wellness_* dan tidak menyentuh MCU/CAPASKA/Vaksinasi.");
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const json = await fetch("/api/wellness/settings", { cache: "no-store" }).then((r) => r.json());
      if (!json.ok) {
        setMessage(json.message || "Gagal memuat setting Wellness.");
        return;
      }
      setCompanies(json.companies || []);
      setGroupUnits(json.groupUnits || []);
      setCoaches(json.coaches || []);
      setProgramParameters(json.programParameters || []);
      setMiniMcuParameters(json.miniMcuParameters || []);
      setDefaultMain(json.defaults?.mainParameters || FALLBACK_MAIN_PARAMETERS);
      setDefaultMini(json.defaults?.miniMcuParameters || FALLBACK_MINI_MCU_PARAMETERS);
      const firstCompany = selectedCompanyId || String(json.companies?.[0]?.id || "");
      if (firstCompany) setSelectedCompanyId(firstCompany);
      setMessage("Setting Wellness berhasil dimuat.");
    } catch (error: any) {
      setMessage(error?.message || "Gagal memuat setting Wellness.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const selectedCompany = useMemo(() => companies.find((item) => String(item.id) === String(selectedCompanyId)), [companies, selectedCompanyId]);

  const selectedCoach = useMemo(
    () =>
      coaches.find(
        (item) =>
          String(item.id) ===
          String(selectedCoachId),
      ),
    [coaches, selectedCoachId],
  );

  const kelompokList = useMemo(() => groupUnits.filter((item) => String(item.company_id) === String(selectedCompanyId) && item.unit_type === "kelompok"), [groupUnits, selectedCompanyId]);
  const childGroupList = useMemo(() => groupUnits.filter((item) => String(item.company_id) === String(selectedCompanyId) && item.unit_type === "group"), [groupUnits, selectedCompanyId]);

  function mergedParameters(defaults: ParameterDraft[], saved: any[]) {
    const savedByKey = new Map(saved.filter((item) => String(item.company_id) === String(selectedCompanyId)).map((item) => [item.parameter_key, item]));
    return defaults.map((item) => ({ ...item, ...(savedByKey.get(item.parameter_key) || {}) }));
  }

  const mainParams = mergedParameters(defaultMain, programParameters);
  const miniParams = mergedParameters(defaultMini, miniMcuParameters);

  async function post(body: any, successMessage: string) {
    setLoading(true);
    try {
      const json = await fetch("/api/wellness/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then((r) => r.json());

      if (!json.ok) {
        setMessage(json.message || "Gagal menyimpan setting Wellness.");
        return null;
      }
      setMessage(successMessage);
      await load();
      return json;
    } catch (error: any) {
      setMessage(error?.message || "Gagal menyimpan setting Wellness.");
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function saveCompany(event: React.FormEvent) {
    event.preventDefault();
    const json = await post({ action: "save_company", name: companyName }, "Perusahaan Wellness berhasil disimpan.");
    if (json?.company?.id) setSelectedCompanyId(String(json.company.id));
    if (json?.company?.id) setCompanyName("");
  }

  async function addKelompok(event: React.FormEvent) {
    event.preventDefault();

    if (!selectedCoachId) {
      setMessage(
        "Pilih Coach penanggung jawab terlebih dahulu.",
      );
      return;
    }

    const json = await post(
      {
        action: "add_kelompok",
        companyId: selectedCompanyId,
        name: kelompokName,
        coachUserId: selectedCoachId,
        coachName:
          selectedCoach?.name || "",
      },
      "Kelompok dan Coach penanggung jawab berhasil disimpan.",
    );

    if (json?.groupUnit?.id) {
      setParentKelompokId(
        String(json.groupUnit.id),
      );

      setKelompokName("");
      setSelectedCoachId("");
    }
  }

  async function addGroup(event: React.FormEvent) {
    event.preventDefault();
    const json = await post({ action: "add_group", companyId: selectedCompanyId, parentId: parentKelompokId, name: groupName }, "Group di bawah kelompok berhasil disimpan.");
    if (json?.groupUnit?.id) setGroupName("");
  }

  async function saveParameters() {
    await post({
      action: "save_parameters",
      companyId: selectedCompanyId,
      parameters: mainParams.map((item) => ({ parameter_key: item.parameter_key, is_enabled: enabled(item.is_enabled) })),
      miniMcuParameters: miniParams.map((item) => ({ parameter_key: item.parameter_key, is_enabled: enabled(item.is_enabled) })),
    }, "Parameter form dan Mini MCU berhasil disimpan.");
  }

  function toggleParam(type: "main" | "mini", key: string) {
    const setter = type === "main" ? setProgramParameters : setMiniMcuParameters;
    const currentRows = type === "main" ? programParameters : miniMcuParameters;
    const defaults = type === "main" ? defaultMain : defaultMini;
    const baseItem = defaults.find((item) => item.parameter_key === key);
    const existing = currentRows.find((item) => String(item.company_id) === String(selectedCompanyId) && item.parameter_key === key);
    const nextEnabled = existing ? !enabled(existing.is_enabled) : !enabled(baseItem?.is_enabled ?? true);
    setter([
      ...currentRows.filter((item) => !(String(item.company_id) === String(selectedCompanyId) && item.parameter_key === key)),
      { ...(baseItem || {}), ...(existing || {}), company_id: selectedCompanyId, parameter_key: key, is_enabled: nextEnabled ? 1 : 0 },
    ]);
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[2rem] bg-gradient-to-r from-fuchsia-600 via-rose-600 to-orange-500 shadow-sm">
        <div className="p-7 text-white">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-3xl font-black">Setting Parameter Wellness</div>
              <div className="mt-2 max-w-3xl text-sm font-medium text-rose-50">Atur Main Entity, Kelompok, Group, Coach, form harian, dan parameter Mini MCU sebelum import peserta.</div>
            </div>
            <a href="/wellness/import" className="rounded-2xl bg-white px-4 py-3 text-center text-sm font-black text-rose-700 shadow-sm">Lanjut Import Peserta</a>
          </div>
        </div>
      </section>

      <div className="rounded-2xl bg-slate-100 px-4 py-3 text-sm font-bold text-slate-600">{loading ? "Memproses... " : ""}{message}</div>

      <section className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <div className="space-y-5">
          <form onSubmit={saveCompany} className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-xl font-black text-slate-900">1. Nama Perusahaan</div>
            <div className="mt-1 text-sm font-semibold text-slate-500">Main Entity program Wellness.</div>
            <input className="mt-4 w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm font-bold" placeholder="Contoh: PT Guntner Indonesia" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
            <button disabled={loading || !companyName.trim()} className="mt-3 w-full rounded-2xl bg-rose-600 px-4 py-3 text-sm font-black text-white disabled:opacity-60">Simpan Perusahaan</button>
          </form>

          <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-xl font-black text-slate-900">Pilih Entity Aktif</div>
            <select className="mt-4 w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm font-bold" value={selectedCompanyId} onChange={(e) => setSelectedCompanyId(e.target.value)}>
              <option value="">Pilih perusahaan</option>
              {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
            </select>
            <div className="mt-3 rounded-2xl bg-blue-50 px-4 py-3 text-sm font-bold text-blue-800">Aktif: {selectedCompany?.name || "Belum dipilih"}</div>
          </div>

          <form onSubmit={addKelompok} className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-xl font-black text-slate-900">2. Add Kelompok</div>
            <input className="mt-4 w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm font-bold" placeholder="Nama kelompok" value={kelompokName} onChange={(e) => setKelompokName(e.target.value)} />
            <select
              className="mt-3 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold"
              value={selectedCoachId}
              onChange={(event) =>
                setSelectedCoachId(
                  event.target.value,
                )
              }
            >
              <option value="">
                Pilih Coach penanggung jawab
              </option>

              {coaches.map((coach) => (
                <option
                  key={coach.id}
                  value={coach.id}
                >
                  {coach.name}
                  {" — "}
                  {coach.email}
                  {coach.username
                    ? ` (@${coach.username})`
                    : ""}
                </option>
              ))}
            </select>

            {!coaches.length ? (
              <div className="mt-2 rounded-2xl bg-amber-50 px-4 py-3 text-xs font-bold leading-5 text-amber-800">
                Belum ada Coach aktif dengan email
                dan username lengkap. Tambahkan
                melalui Admin → User → Coach.
              </div>
            ) : null}
            <button
              disabled={
                loading ||
                !selectedCompanyId ||
                !kelompokName.trim() ||
                !selectedCoachId
              }
              className="mt-3 w-full rounded-2xl bg-blue-600 px-4 py-3 text-sm font-black text-white disabled:opacity-60"
            >
              Tambah Kelompok
            </button>
          </form>

          <form onSubmit={addGroup} className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-xl font-black text-slate-900">3. Add Group</div>
            <select className="mt-4 w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm font-bold" value={parentKelompokId} onChange={(e) => setParentKelompokId(e.target.value)}>
              <option value="">Pilih parent kelompok</option>
              {kelompokList.map((item) => <option key={item.id} value={item.id}>{item.name} {item.coach_name ? `- Coach ${item.coach_name}` : ""}</option>)}
            </select>
            <input className="mt-3 w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm font-bold" placeholder="Nama group/divisi/shift" value={groupName} onChange={(e) => setGroupName(e.target.value)} />
            <button disabled={loading || !selectedCompanyId || !parentKelompokId || !groupName.trim()} className="mt-3 w-full rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-black text-white disabled:opacity-60">Tambah Group</button>
          </form>
        </div>

        <div className="space-y-5">
          <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-xl font-black text-slate-900">Struktur Kelompok & Group</div>
                <div className="mt-1 text-sm font-semibold text-slate-500">Group berada di bawah parent Kelompok. Coach disimpan di level Kelompok.</div>
              </div>
              <div className="rounded-2xl bg-slate-100 px-4 py-3 text-sm font-black text-slate-700">{kelompokList.length} kelompok · {childGroupList.length} group</div>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {kelompokList.map((kelompok) => {
                const children = childGroupList.filter((group) => String(group.parent_id) === String(kelompok.id));
                return (
                  <div key={kelompok.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-sm font-black text-slate-950">{kelompok.name}</div>
                    <div className="mt-1 text-xs font-bold text-blue-700">Coach: {kelompok.coach_name || "-"}</div>
                    <div className="mt-3 space-y-2">
                      {children.length ? children.map((group) => <div key={group.id} className="rounded-2xl bg-white px-3 py-2 text-xs font-black text-slate-700 shadow-sm">{group.name}</div>) : <div className="rounded-2xl bg-white px-3 py-2 text-xs font-bold text-slate-400">Belum ada group</div>}
                    </div>
                  </div>
                );
              })}
              {!kelompokList.length ? <div className="rounded-3xl border border-dashed border-slate-300 p-5 text-sm font-bold text-slate-500">Belum ada kelompok untuk entity ini.</div> : null}
            </div>
          </section>

          <section className="grid gap-5 lg:grid-cols-2">
            <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="text-xl font-black text-slate-900">4. Parameter Form</div>
              <div className="mt-1 text-sm font-semibold text-slate-500">Parameter ini menentukan menu/form monitoring peserta.</div>
              <div className="mt-4 space-y-3">
                {mainParams.map((param) => (
                  <label key={param.parameter_key} className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <input type="checkbox" className="mt-1" checked={enabled(param.is_enabled)} onChange={() => toggleParam("main", param.parameter_key)} />
                    <div>
                      <div className="text-sm font-black text-slate-900">{param.label}</div>
                      <div className="mt-1 text-xs font-bold text-slate-500">{param.frequency || "-"} · Diisi oleh {param.filled_by || "-"}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="text-xl font-black text-slate-900">Mini MCU oleh Nakes</div>
              <div className="mt-1 text-sm font-semibold text-slate-500">Pilih item pemeriksaan berkala untuk before-after.</div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {miniParams.map((param) => (
                  <label key={param.parameter_key} className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <input type="checkbox" className="mt-1" checked={enabled(param.is_enabled)} onChange={() => toggleParam("mini", param.parameter_key)} />
                    <div>
                      <div className="text-sm font-black text-slate-900">{param.label}</div>
                      <div className="mt-1 text-xs font-bold text-slate-500">{param.unit || "Catatan"}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </section>

          <button disabled={loading || !selectedCompanyId} onClick={saveParameters} className="w-full rounded-2xl bg-slate-950 px-5 py-4 text-sm font-black text-white disabled:opacity-60">Simpan Parameter Wellness</button>
        </div>
      </section>
    </div>
  );
}
