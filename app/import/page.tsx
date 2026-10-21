"use client";

import { useEffect, useState } from "react";
import AuthGate from "@/components/AuthGate";

export default function ImportPage() {
  return (
    <AuthGate>
      {(user) => <ImportForm user={user} />}
    </AuthGate>
  );
}

const IMPORT_TARGETS = [
  {
    value: "capaska",
    label: "CAPASKA / BPIP",
    helper: "Data masuk ke modul MCU CAPASKA.",
    institution: "BPIP / CAPASKA",
    company: "BPIP / CAPASKA",
    packageName: "CAPASKA 2025/2026",
    databasePlaceholder: "CAPASKA BPIP 2026 Batch 1",
  },
  {
    value: "corporate",
    label: "MCU Corporate",
    helper: "Data masuk ke modul MCU Corporate.",
    institution: "Corporate",
    company: "Corporate",
    packageName: "MCU Corporate Basic",
    databasePlaceholder: "MCU Corporate Batch 1",
  },
  {
    value: "vaccination",
    label: "Vaksinasi Perusahaan",
    helper: "Data masuk sebagai database peserta vaksinasi dan bisa dipilih saat membuat session vaksinasi.",
    institution: "Vaksinasi Perusahaan",
    company: "Vaksinasi Perusahaan",
    packageName: "Vaksinasi Perusahaan",
    databasePlaceholder: "Vaksinasi PT ABC Batch 1",
  },
];


const MCU_STAGE_STAFF_STAGES_V165 = [
  "Registrasi Ulang",
  "Kesehatan Mata",
  "Penyakit Dalam",
  "Kesehatan Gigi & Mulut + Dental panoramik",
  "Kesehatan THT",
  "Kesehatan Jantung dan Pembuluh Darah",
  "Ortopedi",
  "Radiologi",
];

function makeStageStaffMapV165() {
  return Object.fromEntries(MCU_STAGE_STAFF_STAGES_V165.map((stage) => [stage, [""]])) as Record<string, string[]>;
}

function cleanStageStaffNamesV165(values: string[]) {
  const seen = new Set<string>();
  const names: string[] = [];

  for (const value of values || []) {
    const name = String(value || "").trim();
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }

  return names;
}
function getImportTarget(programType: string) {
  return IMPORT_TARGETS.find((target) => target.value === programType) || IMPORT_TARGETS[0];
}

type ImportSourceOptionV237 = {
  id: number;
  name: string;
  institution_name?: string | null;
  description?: string | null;
  program_type?: string | null;
};

type ImportCompanyOptionV238 = {
  id: number;
  name: string;
};

// MCU_CORPORATE_IMPORT_PACKAGE_DROPDOWN_V432
type ImportCorporatePackageOptionV432 = {
  id: number;
  name: string;
  company_ids: number[];
};

// MCU_CORPORATE_IMPORT_MAPPING_SESSION_V466
type CorporateImportSessionV466 = {
  id: number;
  company_id: number;
  package_id: number;
  company_name: string;
  package_name: string;
  location_name: string;
  session_date: string;
  label: string;
};

type CorporatePreviewV466 = {
  sheet_name: string;
  header_row: number;
  headers: string[];
  row_count: number;
  preview: Record<string, any>[];
  suggested_mapping: Record<string, string>;
};

const CORPORATE_MAPPING_FIELDS_V466 = [
  { key: "name", label: "Nama Lengkap", required: true },
  { key: "employee_nik", label: "NIK Karyawan / Employee ID", required: false },
  { key: "birth_date", label: "Tanggal Lahir", required: false },
  { key: "department", label: "Department / Division", required: false },
  { key: "position", label: "Posisi / Jabatan", required: false },
  { key: "nik", label: "NIK / Identitas", required: false },
  { key: "gender", label: "Jenis Kelamin", required: false },
  { key: "phone", label: "No HP / WhatsApp", required: false },
] as const;

const NEW_VACCINATION_COMPANY_V238 = "__new_company__";
// MCU_CORPORATE_IMPORT_COMPANY_DROPDOWN_V431
const NEW_CORPORATE_COMPANY_V431 = "__new_corporate_company__";
const NEW_CORPORATE_PACKAGE_V432 = "__new_corporate_package__";

function ImportForm({ user }: { user: any }) {
  const [programType, setProgramType] = useState("capaska");
  const [databaseName, setDatabaseName] = useState("");
  const [selectedSourceIdV237, setSelectedSourceIdV237] = useState("");
  const [sourceOptionsV237, setSourceOptionsV237] = useState<ImportSourceOptionV237[]>([]);
  const [loadingSourcesV237, setLoadingSourcesV237] = useState(false);
  const [companyOptionsV238, setCompanyOptionsV238] = useState<ImportCompanyOptionV238[]>([]);
  const [vaccinationCompanyChoiceV238, setVaccinationCompanyChoiceV238] = useState("");
  const [corporateCompanyChoiceV431, setCorporateCompanyChoiceV431] = useState("");
  const [corporatePackageOptionsV432, setCorporatePackageOptionsV432] = useState<ImportCorporatePackageOptionV432[]>([]);
  const [corporatePackageChoiceV432, setCorporatePackageChoiceV432] = useState("");
  const [institutionName, setInstitutionName] = useState("BPIP / CAPASKA");
  const [companyName, setCompanyName] = useState("BPIP / CAPASKA");
  const [packageName, setPackageName] = useState("CAPASKA 2025/2026");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [corporatePreviewV466, setCorporatePreviewV466] = useState<CorporatePreviewV466 | null>(null);
  const [corporateMappingV466, setCorporateMappingV466] = useState<Record<string, string>>({});
  const [corporateSessionsV466, setCorporateSessionsV466] = useState<CorporateImportSessionV466[]>([]);
  const [corporateSessionIdV466, setCorporateSessionIdV466] = useState("");
  const [corporateLocationModeV466, setCorporateLocationModeV466] = useState<"session" | "column" | "fixed">("session");
  const [corporateLocationColumnV466, setCorporateLocationColumnV466] = useState("");
  const [corporateFixedLocationV466, setCorporateFixedLocationV466] = useState("");
  const [corporateMappingLoadingV466, setCorporateMappingLoadingV466] = useState(false);
  const [corporateMappingErrorV466, setCorporateMappingErrorV466] = useState("");
  const [corporateSessionLoadingV470, setCorporateSessionLoadingV470] = useState(false); // MCU_CORPORATE_IMPORT_SESSION_TOP_V470
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [companyOnlyModeV239, setCompanyOnlyModeV239] = useState(false);
  const [companyOnlyNameV239, setCompanyOnlyNameV239] = useState("");
  const [stageStaffOptionsV165, setStageStaffOptionsV165] = useState<Record<string, string[]>>(makeStageStaffMapV165());


  // IMPORT_EXISTING_DATABASE_SELECT_V237
  useEffect(() => {
    let cancelled = false;

    async function loadSourcesV237() {
      setLoadingSourcesV237(true);
      try {
        const res = await fetch(`/api/sources?program=${encodeURIComponent(programType)}`, { cache: "no-store" });
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        const rows = Array.isArray(json?.sources) ? json.sources : [];
        setSourceOptionsV237(rows.map((row: any) => ({
          id: Number(row.id),
          name: String(row.name || ""),
          institution_name: row.institution_name || "",
          description: row.description || "",
          program_type: row.program_type || "",
        })).filter((row: ImportSourceOptionV237) => row.id && row.name));
        let companies = Array.isArray(json?.companies) ? json.companies : [];
        let corporatePackages = Array.isArray(json?.corporate_packages) ? json.corporate_packages : [];

        // MCU_CORPORATE_IMPORT_SESSION_OPTIONS_V433
        // Session MCU is the source of truth for company <-> package availability.
        // Import must expose the exact same pairs, including setup/session pairs that
        // do not yet have a participant database import.
        if (programType === "corporate") {
          try {
            const sessionRes = await fetch("/api/mcu/session", { cache: "no-store" });
            const sessionJson = await sessionRes.json().catch(() => ({}));
            if (sessionRes.ok && sessionJson?.ok) {
              const sessionCompanies = Array.isArray(sessionJson?.companies) ? sessionJson.companies : [];
              const sessionPackages = Array.isArray(sessionJson?.packages) ? sessionJson.packages : [];

              const packageCompanies = new Map<number, number[]>();
              for (const company of sessionCompanies) {
                const companyId = Number(company?.id || 0);
                if (!companyId) continue;
                const packageIds = Array.isArray(company?.package_ids) ? company.package_ids : [];
                for (const rawPackageId of packageIds) {
                  const packageId = Number(rawPackageId || 0);
                  if (!packageId) continue;
                  const list = packageCompanies.get(packageId) || [];
                  if (!list.includes(companyId)) list.push(companyId);
                  packageCompanies.set(packageId, list);
                }
              }

              companies = sessionCompanies;
              corporatePackages = sessionPackages.map((pkg: any) => ({
                ...pkg,
                company_ids: packageCompanies.get(Number(pkg?.id || 0)) || [],
              }));
            }
          } catch {
            // Keep /api/sources as a safe fallback if Session MCU cannot be read.
          }
        }

        setCompanyOptionsV238(
          companies
            .map((row: any) => ({
              id: Number(row.id),
              name: String(row.name || "").trim(),
            }))
            .filter((row: ImportCompanyOptionV238) => row.id && row.name),
        );

        setCorporatePackageOptionsV432(
          corporatePackages
            .map((row: any) => ({
              id: Number(row.id),
              name: String(row.name || "").trim(),
              company_ids: Array.isArray(row.company_ids)
                ? row.company_ids.map((id: any) => Number(id)).filter((id: number) => id > 0)
                : Number(row.company_id || 0) > 0
                  ? [Number(row.company_id)]
                  : [],
            }))
            .filter((row: ImportCorporatePackageOptionV432) => row.id && row.name),
        );
      } catch {
        if (!cancelled) {
          setSourceOptionsV237([]);
          setCompanyOptionsV238([]);
          setCorporatePackageOptionsV432([]);
        }
      } finally {
        if (!cancelled) setLoadingSourcesV237(false);
      }
    }

    loadSourcesV237();
    return () => { cancelled = true; };
  }, [programType]);

  if (user.role !== "admin") {
    return <div className="card p-5 text-red-700">Hanya admin yang dapat import database peserta.</div>;
  }

  const selectedTarget = getImportTarget(programType);
  const showMcuStageStaffV165 = programType === "capaska" || programType === "corporate";

  function changeProgram(nextProgram: string) {
    const target = getImportTarget(nextProgram);

    setProgramType(target.value);
    setSelectedSourceIdV237("");
    setDatabaseName("");
    setVaccinationCompanyChoiceV238("");
    setCorporateCompanyChoiceV431("");
    setCorporatePackageChoiceV432("");
    setCompanyOnlyModeV239(false);
    setCompanyOnlyNameV239("");
    setInstitutionName(target.value === "vaccination" ? "" : target.institution);
    setCompanyName(target.value === "vaccination" ? "" : target.company);
    setPackageName(target.packageName);
    setFile(null);
    setCorporatePreviewV466(null);
    setCorporateMappingV466({});
    setCorporateSessionsV466([]);
    setCorporateSessionIdV466("");
    setCorporateLocationModeV466("session");
    setCorporateLocationColumnV466("");
    setCorporateFixedLocationV466("");
    setCorporateMappingErrorV466("");
  }



  function packagesForCorporateCompanyV432(companyIdValue: string | number) {
    const companyId = Number(companyIdValue || 0);
    if (!companyId) return [] as ImportCorporatePackageOptionV432[];

    return corporatePackageOptionsV432.filter((pkg) =>
      (pkg.company_ids || []).some((id) => Number(id) === companyId),
    );
  }

  function selectCorporatePackageForCompanyV432(companyIdValue: string | number) {
    const matches = packagesForCorporateCompanyV432(companyIdValue);
    if (matches.length > 0) {
      setCorporatePackageChoiceV432(String(matches[0].id));
      setPackageName(matches[0].name);
    } else {
      setCorporatePackageChoiceV432("");
      setPackageName("");
    }
  }

  function chooseExistingDatabaseV237(sourceId: string) {
    setSelectedSourceIdV237(sourceId);

    if (!sourceId) return;

    const selected = sourceOptionsV237.find((source) => String(source.id) === sourceId);
    if (!selected) return;

    setDatabaseName(selected.name || "");
    if (selected.institution_name) {
      setInstitutionName(selected.institution_name);
      setCompanyName(selected.institution_name);

      if (programType === "vaccination") {
        const matchedCompany = companyOptionsV238.find(
          (company) =>
            company.name.toLowerCase() ===
            String(selected.institution_name || "").trim().toLowerCase(),
        );
        setVaccinationCompanyChoiceV238(
          matchedCompany
            ? String(matchedCompany.id)
            : NEW_VACCINATION_COMPANY_V238,
        );
      }

      if (programType === "corporate") {
        const matchedCompany = companyOptionsV238.find(
          (company) =>
            company.name.toLowerCase() ===
            String(selected.institution_name || "").trim().toLowerCase(),
        );
        const companyChoice = matchedCompany
          ? String(matchedCompany.id)
          : NEW_CORPORATE_COMPANY_V431;
        setCorporateCompanyChoiceV431(companyChoice);
        if (matchedCompany) {
          selectCorporatePackageForCompanyV432(matchedCompany.id);
        } else {
          setCorporatePackageChoiceV432(NEW_CORPORATE_PACKAGE_V432);
          setPackageName("");
        }
      }
    }
    if (selected.description && !description) setDescription(selected.description);
  }

  function changeVaccinationCompanyV238(value: string) {
    setVaccinationCompanyChoiceV238(value);

    if (!value) {
      setInstitutionName("");
      setCompanyName("");
      return;
    }

    if (value === NEW_VACCINATION_COMPANY_V238) {
      setInstitutionName("");
      setCompanyName("");
      return;
    }

    const selected = companyOptionsV238.find(
      (company) => String(company.id) === value,
    );
    const name = String(selected?.name || "").trim();
    setInstitutionName(name);
    setCompanyName(name);
  }

  function changeCorporateCompanyV431(value: string) {
    setCorporateCompanyChoiceV431(value);

    if (!value) {
      setInstitutionName("");
      setCompanyName("");
      setCorporatePackageChoiceV432("");
      setPackageName("");
      return;
    }

    if (value === NEW_CORPORATE_COMPANY_V431) {
      setInstitutionName("");
      setCompanyName("");
      setCorporatePackageChoiceV432(NEW_CORPORATE_PACKAGE_V432);
      setPackageName("");
      return;
    }

    const selected = companyOptionsV238.find(
      (company) => String(company.id) === value,
    );
    const name = String(selected?.name || "").trim();
    setInstitutionName(name);
    setCompanyName(name);
    selectCorporatePackageForCompanyV432(value);
  }

  function changeCorporatePackageV432(value: string) {
    setCorporatePackageChoiceV432(value);

    if (!value) {
      setPackageName("");
      return;
    }

    if (value === NEW_CORPORATE_PACKAGE_V432) {
      setPackageName("");
      return;
    }

    const selected = corporatePackageOptionsV432.find(
      (pkg) => String(pkg.id) === value,
    );
    setPackageName(String(selected?.name || "").trim());
  }

  function updateStageStaffNameV165(stageName: string, index: number, value: string) {
    setStageStaffOptionsV165((prev) => {
      const rows = [...(prev[stageName] || [""])];
      rows[index] = value;
      return { ...prev, [stageName]: rows };
    });
  }

  function addStageStaffNameV165(stageName: string) {
    setStageStaffOptionsV165((prev) => ({
      ...prev,
      [stageName]: [...(prev[stageName] || [""]), ""],
    }));
  }

  function removeStageStaffNameV165(stageName: string, index: number) {
    setStageStaffOptionsV165((prev) => {
      const rows = [...(prev[stageName] || [""])];
      rows.splice(index, 1);
      return { ...prev, [stageName]: rows.length ? rows : [""] };
    });
  }

  async function saveStageStaffOptionsV165() {
    if (!showMcuStageStaffV165) return null;

    const stages = MCU_STAGE_STAFF_STAGES_V165.map((stageName) => ({
      stage_name: stageName,
      staff_names: cleanStageStaffNamesV165(stageStaffOptionsV165[stageName] || []),
    })).filter((stage) => stage.staff_names.length > 0);

    if (!stages.length) return null;

    const staffRes = await fetch("/api/mcu/stage-staff/options", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ program_type: programType, stages }),
    });

    return staffRes.json().catch(() => null);
  }
  async function saveVaccinationCompanyOnlyV239() {
    const name = companyOnlyNameV239.trim();
    if (!name) return alert("Masukkan nama perusahaan dulu.");

    const form = new FormData();
    form.append("mode", "vaccination_company_only");
    form.append("program_type", "vaccination");
    form.append("institution_name", name);
    form.append("company_name", name);
    form.append("description", "Perusahaan vaksinasi tanpa database peserta");

    setLoading(true);
    setResult(null);

    try {
      const res = await fetch("/api/import", { method: "POST", body: form });
      const json = await res.json().catch(() => ({}));
      setResult(json);

      if (res.ok && json?.ok) {
        setCompanyOnlyNameV239("");
      }
    } finally {
      setLoading(false);
    }
  }

  // MCU_CORPORATE_IMPORT_MAPPING_FAST_V469
  // MCU_CORPORATE_IMPORT_SESSION_SOURCE_V471
  function normalizeCorporateSessionOptionV471(row: any): CorporateImportSessionV466 | null {
    if (!row || typeof row !== "object") return null;

    const raw = row?.raw && typeof row.raw === "object" ? row.raw : {};
    const merged: any = { ...raw, ...row };

    const clean = (value: any) => String(value ?? "").trim();
    const first = (...values: any[]) => {
      for (const value of values) {
        const text = clean(value);
        if (text) return text;
      }
      return "";
    };

    const id = Number(
      merged.id ??
      merged.queue_session_id ??
      merged.session_id ??
      merged.mcu_session_id ??
      merged.sessionId ??
      0
    );
    if (!id) return null;

    const companyId = Number(merged.company_id ?? merged.companyId ?? corporateCompanyChoiceV431 ?? 0);
    const packageId = Number(merged.package_id ?? merged.packageId ?? corporatePackageChoiceV432 ?? 0);

    const companyName = first(
      merged.company_name,
      merged.company?.name,
      merged.institution_name,
      institutionName,
      "MCU Corporate",
    );

    const resolvedPackageName = first(
      merged.package_name,
      merged.package?.name,
      merged.service_name,
      merged.program_name,
      packageName,
      "Paket MCU",
    );

    const sessionDate = first(
      merged.session_date,
      merged.sessionDate,
      merged.event_date,
      merged.exam_date,
      merged.mcu_date,
      merged.scheduled_date,
      merged.service_date,
      merged.appointment_date,
      merged.queue_date,
      merged.date,
    ).slice(0, 10);

    const locationName = first(
      merged.location_name,
      merged.session_location_name,
      merged.session_location,
      merged.location_label,
      merged.location,
      merged.site_location,
      merged.site_name,
      merged.site,
      merged.campus_name,
      merged.campus,
      merged.branch_name,
      merged.branch,
      merged.event_location,
      merged.venue,
      merged.place,
    );

    const explicitLabel = first(
      merged.label,
      merged.session_label,
      merged.display_label,
      merged.display_name,
      merged.session_name,
      merged.title,
    );

    const richParts = [sessionDate, locationName, resolvedPackageName].filter(Boolean);
    let label = richParts.length >= 2 ? richParts.join(" · ") : "";

    if (
      explicitLabel &&
      (
        explicitLabel !== resolvedPackageName ||
        /\d{1,4}[-/ ]\d{1,2}|·| - |lokasi|session|serpong|jakarta|bandung|kampus/i.test(explicitLabel)
      )
    ) {
      label = explicitLabel;
    }

    if (!label) {
      label = explicitLabel || `Session #${id} · ${resolvedPackageName}`;
    }

    return {
      id,
      company_id: companyId,
      package_id: packageId,
      company_name: companyName,
      package_name: resolvedPackageName,
      location_name: locationName,
      session_date: sessionDate,
      label,
    };
  }

  function extractCorporateSessionArraysV471(json: any): any[] {
    if (!json || typeof json !== "object") return [];

    const candidates: any[] = [
      json.sessions,
      json.session_options,
      json.available_sessions,
      json.queue_sessions,
      json.mcu_sessions,
      json.options,
      json.data?.sessions,
      json.data?.session_options,
      json.data?.available_sessions,
      json.data?.queue_sessions,
      json.result?.sessions,
    ];

    for (const candidate of candidates) {
      if (Array.isArray(candidate) && candidate.length) return candidate;
    }

    const singles = [
      json.selected_session,
      json.current_session,
      json.queue_session,
      json.session,
      json.data?.selected_session,
      json.data?.queue_session,
      json.data?.session,
    ].filter(Boolean);

    return singles.length ? singles : [];
  }

  async function loadCorporateSessionOptionsV471(companyId: string, packageId: string) {
    const qs = `company_id=${encodeURIComponent(companyId)}&package_id=${encodeURIComponent(packageId)}`;

    const endpoints = [
      `/api/mcu/queue?${qs}&session_options=1&t=${Date.now()}`,
      `/api/mcu/session?${qs}&list_sessions=1&t=${Date.now()}`,
      `/api/mcu/import-mapping?${qs}&t=${Date.now()}`,
    ];

    let fallback: CorporateImportSessionV466[] = [];
    let lastError = "";

    for (const endpoint of endpoints) {
      try {
        const res = await fetch(endpoint, {
          cache: "no-store",
          headers: { "Cache-Control": "no-cache" },
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || json?.ok === false) {
          lastError = String(json?.message || `HTTP ${res.status}`);
          continue;
        }

        const rows = extractCorporateSessionArraysV471(json);
        const normalized = rows
          .map(normalizeCorporateSessionOptionV471)
          .filter(Boolean) as CorporateImportSessionV466[];

        const filtered = normalized.filter((session) => {
          const companyMatch = !session.company_id || String(session.company_id) === String(companyId);
          const packageMatch = !session.package_id || String(session.package_id) === String(packageId);
          return companyMatch && packageMatch;
        });

        const deduped = Array.from(
          new Map(filtered.map((session) => [`${session.id}:${session.label}`, session])).values(),
        );

        if (!deduped.length) continue;

        const hasRichSession = deduped.some(
          (session) => Boolean(session.session_date || session.location_name),
        );
        if (hasRichSession || deduped.length > 1) return deduped;

        if (!fallback.length) fallback = deduped;
      } catch (error: any) {
        lastError = error?.message || String(error || "");
      }
    }

    if (fallback.length) return fallback;
    throw new Error(lastError || "Belum ada Session MCU / Lokasi untuk perusahaan + paket ini.");
  }

  // MCU_CORPORATE_IMPORT_SESSION_TOP_V470
  useEffect(() => {
    if (programType !== "corporate") return;

    const companyId = String(corporateCompanyChoiceV431 || "");
    const packageId = String(corporatePackageChoiceV432 || "");

    if (
      !companyId ||
      companyId === NEW_CORPORATE_COMPANY_V431 ||
      !packageId ||
      packageId === NEW_CORPORATE_PACKAGE_V432
    ) {
      setCorporateSessionsV466([]);
      setCorporateSessionIdV466("");
      return;
    }

    let cancelled = false;
    setCorporateSessionLoadingV470(true);

    loadCorporateSessionOptionsV471(companyId, packageId)
      .then((sessions) => {
        if (cancelled) return;
        setCorporateSessionsV466(sessions);
        setCorporateSessionIdV466((prev) => {
          const existingStillValid = sessions.some((row: any) => String(row?.id) === String(prev));
          if (existingStillValid) return String(prev);
          return sessions.length === 1 ? String(sessions[0].id) : "";
        });
      })
      .catch((error: any) => {
        if (cancelled) return;
        setCorporateSessionsV466([]);
        setCorporateSessionIdV466("");
        setCorporateMappingErrorV466(error?.message || "Gagal membaca Session MCU/Lokasi.");
      })
      .finally(() => {
        if (!cancelled) setCorporateSessionLoadingV470(false);
      });

    return () => {
      cancelled = true;
    };
  }, [programType, corporateCompanyChoiceV431, corporatePackageChoiceV432]);

  async function openCorporateMappingV466(fileOverride?: File | null) {
    if (programType !== "corporate") return;

    const activeFile = fileOverride || file;
    if (!activeFile) return alert("Upload file Excel dulu.");

    if (!corporateCompanyChoiceV431 || corporateCompanyChoiceV431 === NEW_CORPORATE_COMPANY_V431) {
      setCorporateMappingErrorV466("Pilih perusahaan MCU Corporate existing dulu agar Session/Lokasi bisa dibaca.");
      return;
    }
    if (!corporatePackageChoiceV432 || corporatePackageChoiceV432 === NEW_CORPORATE_PACKAGE_V432) {
      setCorporateMappingErrorV466("Pilih paket pemeriksaan existing dulu agar Session/Lokasi bisa dibaca.");
      return;
    }

    setCorporateMappingLoadingV466(true);
    setCorporateMappingErrorV466("");

    try {
      const sessionPromise = loadCorporateSessionOptionsV471(
        String(corporateCompanyChoiceV431),
        String(corporatePackageChoiceV432),
      );

      // FAST V469: parse workbook locally in browser. No upload just to inspect headers.
      const XLSX = await import("xlsx");
      const arrayBuffer = await activeFile.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: "array" });

      const cleanLocal = (value: any) => String(value ?? "").trim();
      const normLocal = (value: any) =>
        cleanLocal(value)
          .toLowerCase()
          .replace(/[_\-.]/g, " ")
          .replace(/\s+/g, " ")
          .trim();

      const knownHeaders = [
        "nama", "nama peserta", "nama lengkap", "employee name",
        "binusian id", "employee id", "date of birth", "tanggal lahir",
        "department", "division", "bu/division", "posisi", "position", "jabatan",
      ];

      const chooseHeaderRowLocal = (rows: any[][]) => {
        let bestIndex = 0;
        let bestScore = -1;
        rows.slice(0, 20).forEach((row, idx) => {
          const values = (Array.isArray(row) ? row : []).map(normLocal);
          const score = values.reduce(
            (total, value) => total + (knownHeaders.some((candidate) => value.includes(candidate)) ? 1 : 0),
            0,
          );
          if (score > bestScore) {
            bestIndex = idx;
            bestScore = score;
          }
        });
        return bestIndex;
      };

      const exactOrPartialHeaderLocal = (headers: string[], candidates: string[]) => {
        const normalized = headers.map(normLocal);
        const targets = candidates.map(normLocal);
        for (const candidate of targets) {
          const idx = normalized.findIndex((header) => header === candidate);
          if (idx >= 0) return headers[idx];
        }
        for (const candidate of targets) {
          const idx = normalized.findIndex(
            (header) => header && (header.includes(candidate) || candidate.includes(header)),
          );
          if (idx >= 0) return headers[idx];
        }
        return "";
      };

      const suggestedMappingLocal = (headers: string[]) => ({
        name: exactOrPartialHeaderLocal(headers, ["Nama", "Nama Lengkap", "Nama Peserta", "Employee Name", "Nama Karyawan"]),
        employee_nik: exactOrPartialHeaderLocal(headers, ["Binusian ID", "BinusianID", "NIK Karyawan", "Employee ID", "Employee No", "NIP"]),
        birth_date: exactOrPartialHeaderLocal(headers, ["Date of Birth", "Tanggal Lahir", "Birth Date", "DOB"]),
        department: exactOrPartialHeaderLocal(headers, ["BU/Division", "Department", "Division", "Departemen", "Divisi"]),
        position: exactOrPartialHeaderLocal(headers, ["Posisi", "Position", "Jabatan", "Job Title"]),
        nik: exactOrPartialHeaderLocal(headers, ["NIK", "NIK / Identitas", "Nomor Induk Kependudukan"]),
        gender: exactOrPartialHeaderLocal(headers, ["Jenis Kelamin", "Gender", "JK", "L/P"]),
        phone: exactOrPartialHeaderLocal(headers, ["No HP", "No. HP", "Phone", "Phone Number", "Telepon", "WhatsApp"]),
        location: exactOrPartialHeaderLocal(headers, ["Lokasi", "Location", "Site", "Campus", "Kampus", "Cabang"]),
      });

      let preview: CorporatePreviewV466 | null = null;

      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false }) as any[][];
        if (!rows.length) continue;

        const headerRowIndex = chooseHeaderRowLocal(rows);
        const headers = (rows[headerRowIndex] || []).map(
          (value: any, index: number) => cleanLocal(value) || `Column_${index + 1}`,
        );
        const bodyRows = rows
          .slice(headerRowIndex + 1)
          .filter((row: any) => Array.isArray(row) && row.some((value: any) => cleanLocal(value)));

        if (!headers.length || !bodyRows.length) continue;

        const previewRows = bodyRows.slice(0, 5).map((row: any[]) =>
          Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])),
        );

        preview = {
          sheet_name: sheetName,
          header_row: headerRowIndex + 1,
          headers,
          row_count: bodyRows.length,
          preview: previewRows,
          suggested_mapping: suggestedMappingLocal(headers),
        };
        break;
      }

      if (!preview) throw new Error("Tidak menemukan sheet Excel berisi data peserta.");

      const sessions = await sessionPromise;

      setCorporatePreviewV466(preview);
      setCorporateMappingV466(preview.suggested_mapping || {});
      setCorporateSessionsV466(sessions);
      setCorporateSessionIdV466((prev) => {
        const existingStillValid = sessions.some((row: any) => String(row?.id) === String(prev));
        if (existingStillValid) return String(prev);
        return sessions.length === 1 ? String(sessions[0].id) : "";
      });
      setCorporateLocationModeV466("session");
      setCorporateLocationColumnV466("");
      setCorporateFixedLocationV466("");
    } catch (error: any) {
      setCorporateMappingErrorV466(error?.message || "Gagal menyiapkan mapping data.");
    } finally {
      setCorporateMappingLoadingV466(false);
    }
  }

  function updateCorporateMappingV466(key: string, value: string) {
    setCorporateMappingV466((prev) => ({ ...prev, [key]: value }));
  }

  function resetCorporateMappingV466() {
    setCorporatePreviewV466(null);
    setCorporateMappingV466({});
    // V470: Session sudah dipilih dari bagian atas. Jangan dihapus saat ganti/upload file.
    setCorporateLocationColumnV466("");
    setCorporateFixedLocationV466("");
    setCorporateLocationModeV466("session");
    setCorporateMappingErrorV466("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return alert("Upload file Excel dulu.");
    if (programType === "corporate") {
      if (!corporatePreviewV466) return alert("Klik Mapping Data & Session dulu sebelum import.");
      if (!String(corporateMappingV466.name || "").trim()) return alert("Mapping Nama Lengkap wajib dipilih.");
      if (!corporateSessionIdV466) return alert("Pilih Session MCU / Lokasi untuk import ini.");
      if (corporateLocationModeV466 === "column" && !corporateLocationColumnV466) return alert("Pilih kolom Excel sumber lokasi.");
      if (corporateLocationModeV466 === "fixed" && !corporateFixedLocationV466.trim()) return alert("Isi nilai lokasi tetap.");
    }

    const form = new FormData();
    form.append("program_type", programType);
    form.append("database_name", databaseName);
    form.append("source_id", selectedSourceIdV237);
    form.append("institution_name", institutionName);
    form.append("company_name", companyName);
    form.append("package_name", packageName);
    form.append("description", description);
    if (programType === "corporate" && corporatePreviewV466) {
      form.append("mapping_json", JSON.stringify(corporateMappingV466));
      form.append("queue_session_id", corporateSessionIdV466);
      form.append("location_mode", corporateLocationModeV466);
      form.append("location_column", corporateLocationColumnV466);
      form.append("location_value", corporateFixedLocationV466);
      form.append("mapping_sheet_name", corporatePreviewV466.sheet_name || "");
      form.append("mapping_header_row", String(corporatePreviewV466.header_row || 1));
    }
    form.append("file", file);

    setLoading(true);
    setResult(null);

    const res = await fetch("/api/import", { method: "POST", body: form });
    const json = await res.json();

    let finalResult = json;
    if (json?.ok && showMcuStageStaffV165) {
      const staffJson = await saveStageStaffOptionsV165();
      if (staffJson) finalResult = { ...json, stage_staff_options_v165: staffJson };
    }

    setLoading(false);
    setResult(finalResult);
  }

  return (
    <div className="space-y-5">
      <section className="card p-5">
        <div className="text-2xl font-black">Import Database Peserta</div>
        <div className="mt-1 text-sm text-slate-500">
          Import peserta dipusatkan di Admin. Pilih tujuan data: MCU Corporate, CAPASKA, atau Vaksinasi. Template tidak wajib, sistem auto-detect header nama peserta.
          Field Database Existing dipakai untuk merge import berkala ke database yang sama.
        </div>
      </section>

      <form onSubmit={submit} className="card space-y-4 p-5">
        <div>
          <label className="label">Tujuan Import</label>
          <select className="input" value={programType} onChange={(e) => changeProgram(e.target.value)}>
            {IMPORT_TARGETS.map((target) => (
              <option key={target.value} value={target.value}>
                {target.label}
              </option>
            ))}
          </select>
          <div className="mt-2 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-800">
            {selectedTarget.helper}
          </div>

          {programType === "vaccination" && (
            <div className="mt-3 space-y-3">
              <div className="flex flex-col gap-2 rounded-2xl border border-cyan-100 bg-cyan-50 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-xs font-semibold text-cyan-900">
                  Template sudah menyiapkan <b>TimeAreaName</b> untuk lokasi + tanggal dan <b>TimeName</b> untuk jam/slot agar Session bisa membaca lokasi otomatis.
                </div>
                <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                  <a
                    href="/templates/template_database_vaksinasi.xlsx"
                    download
                    className="rounded-2xl bg-cyan-600 px-4 py-2 text-center text-sm font-black text-white hover:bg-cyan-700"
                  >
                    Download Template Database Vaksinasi
                  </a>
                  <button
                    type="button"
                    onClick={() => setCompanyOnlyModeV239((value) => !value)}
                    className="rounded-2xl border border-emerald-200 bg-white px-4 py-2 text-sm font-black text-emerald-700 hover:bg-emerald-50"
                  >
                    {companyOnlyModeV239 ? "Kembali ke Import Excel" : "+ Perusahaan Tanpa Database"}
                  </button>
                </div>
              </div>

              {companyOnlyModeV239 && (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                  <div className="font-black text-emerald-900">Buat Perusahaan Tanpa Database Peserta</div>
                  <div className="mt-1 text-xs font-semibold text-emerald-700">
                    Cukup masukkan nama perusahaan. Lokasi, tanggal, dan jam diatur manual nanti di Session Vaksinasi.
                  </div>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <input
                      className="input flex-1"
                      value={companyOnlyNameV239}
                      onChange={(e) => setCompanyOnlyNameV239(e.target.value)}
                      placeholder="Nama perusahaan, contoh: PT ABC"
                    />
                    <button
                      type="button"
                      disabled={loading}
                      onClick={saveVaccinationCompanyOnlyV239}
                      className="rounded-2xl bg-emerald-600 px-5 py-2.5 text-sm font-black text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {loading ? "Menyimpan..." : "Simpan Perusahaan"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {!(programType === "vaccination" && companyOnlyModeV239) && (
          <>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-3">
            <div>
              <label className="label">Database Existing</label>
              <select
                className="input"
                value={selectedSourceIdV237}
                onChange={(e) => chooseExistingDatabaseV237(e.target.value)}
              >
                <option value="">+ Buat database baru / isi manual</option>
                {sourceOptionsV237.map((source) => (
                  <option key={source.id} value={source.id}>
                    {source.name}
                  </option>
                ))}
              </select>
              <div className="mt-2 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-700">
                {loadingSourcesV237
                  ? "Memuat database existing..."
                  : selectedSourceIdV237
                    ? "Mode merge: import akan masuk ke database existing yang dipilih. Peserta lama di-update, peserta baru ditambahkan."
                    : "Pilih database existing untuk merge berkala, atau kosongkan untuk membuat database baru."}
              </div>
            </div>

            <div>
              <label className="label">Nama Database</label>
              <input
                className="input"
                value={databaseName}
                onChange={(e) => {
                  setDatabaseName(e.target.value);
                  setSelectedSourceIdV237("");
                }}
                placeholder={selectedTarget.databasePlaceholder}
                required
              />
            </div>
          </div>
          <div>
            <label className="label">Nama Instansi / Source</label>

            {programType === "vaccination" ? (
              <div className="space-y-2">
                <select
                  className="input"
                  value={vaccinationCompanyChoiceV238}
                  onChange={(e) => changeVaccinationCompanyV238(e.target.value)}
                  required
                >
                  <option value="">
                    {loadingSourcesV237 ? "Memuat daftar perusahaan..." : "Pilih perusahaan existing"}
                  </option>
                  {companyOptionsV238.map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.name}
                    </option>
                  ))}
                  <option value={NEW_VACCINATION_COMPANY_V238}>+ Perusahaan baru</option>
                </select>

                {vaccinationCompanyChoiceV238 === NEW_VACCINATION_COMPANY_V238 && (
                  <input
                    className="input"
                    value={institutionName}
                    onChange={(e) => {
                      const value = e.target.value;
                      setInstitutionName(value);
                      setCompanyName(value);
                    }}
                    placeholder="Ketik nama perusahaan / instansi baru"
                    required
                  />
                )}
              </div>
            ) : programType === "corporate" ? (
              <div className="space-y-2">
                <select
                  className="input"
                  value={corporateCompanyChoiceV431}
                  onChange={(e) => changeCorporateCompanyV431(e.target.value)}
                  required
                >
                  <option value="">
                    {loadingSourcesV237 ? "Memuat perusahaan MCU Corporate..." : "Pilih perusahaan MCU Corporate"}
                  </option>
                  {companyOptionsV238.map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.name}
                    </option>
                  ))}
                  <option value={NEW_CORPORATE_COMPANY_V431}>+ Perusahaan / instansi baru</option>
                </select>

                {corporateCompanyChoiceV431 === NEW_CORPORATE_COMPANY_V431 && (
                  <input
                    className="input"
                    value={institutionName}
                    onChange={(e) => {
                      const value = e.target.value;
                      setInstitutionName(value);
                      setCompanyName(value);
                    }}
                    placeholder="Ketik nama perusahaan / instansi baru"
                    required
                  />
                )}

                <div className="text-xs font-semibold text-slate-500">
                  Daftar diambil dari perusahaan yang sudah terhubung ke modul MCU Corporate, termasuk perusahaan yang belum pernah punya Database Existing.
                </div>
              </div>
            ) : (
              <input
                className="input"
                value={institutionName}
                onChange={(e) => setInstitutionName(e.target.value)}
              />
            )}
          </div>

          {programType !== "vaccination" && (
            <div>
              <label className="label">Perusahaan/Instansi</label>
              <input className="input" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
            </div>
          )}

          {programType !== "vaccination" && (
            <div>
              <label className="label">Paket Pemeriksaan</label>
              {programType === "corporate" ? (
                <div className="space-y-2">
                  <select
                    className="input"
                    value={corporatePackageChoiceV432}
                    onChange={(e) => changeCorporatePackageV432(e.target.value)}
                    required
                    disabled={!corporateCompanyChoiceV431}
                  >
                    <option value="">
                      {!corporateCompanyChoiceV431
                        ? "Pilih perusahaan dulu"
                        : corporateCompanyChoiceV431 === NEW_CORPORATE_COMPANY_V431
                          ? "Paket baru / isi manual"
                          : packagesForCorporateCompanyV432(corporateCompanyChoiceV431).length
                            ? "Pilih paket pemeriksaan"
                            : "Belum ada paket untuk perusahaan ini"}
                    </option>
                    {corporateCompanyChoiceV431 !== NEW_CORPORATE_COMPANY_V431 &&
                      packagesForCorporateCompanyV432(corporateCompanyChoiceV431).map((pkg) => (
                        <option key={pkg.id} value={pkg.id}>
                          {pkg.name}
                        </option>
                      ))}
                    <option value={NEW_CORPORATE_PACKAGE_V432}>+ Paket baru / isi manual</option>
                  </select>

                  {corporatePackageChoiceV432 === NEW_CORPORATE_PACKAGE_V432 && (
                    <input
                      className="input"
                      value={packageName}
                      onChange={(e) => setPackageName(e.target.value)}
                      placeholder="Ketik nama paket pemeriksaan"
                      required
                    />
                  )}

                  <div className="text-xs font-semibold text-slate-500">
                    Paket difilter dari paket MCU Corporate yang sudah dibuat/terhubung ke perusahaan terpilih.
                  </div>
                </div>
              ) : (
                <input className="input" value={packageName} onChange={(e) => setPackageName(e.target.value)} />
              )}
            </div>
          )}
        </div>
        {showMcuStageStaffV165 && (
          <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-1">
              <div className="text-lg font-black">Nama Petugas per Stage</div>
              <div className="text-sm text-slate-500">
                Tambahkan nama dokter/petugas untuk setiap proses. Nanti operator CAPASKA/MCU Corporate bisa memilih lebih dari 1 petugas di stage masing-masing.
              </div>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {MCU_STAGE_STAFF_STAGES_V165.map((stageName) => (
                <div key={stageName} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <div className="mb-2 text-sm font-black text-slate-800">{stageName}</div>

                  <div className="space-y-2">
                    {(stageStaffOptionsV165[stageName] || [""]).map((staffName, index) => (
                      <div key={`${stageName}-${index}`} className="flex gap-2">
                        <input
                          className="input"
                          value={staffName}
                          onChange={(e) => updateStageStaffNameV165(stageName, index, e.target.value)}
                          placeholder="Nama dokter / petugas"
                        />
                        <button
                          type="button"
                          className="rounded-2xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm font-black text-rose-700"
                          onClick={() => removeStageStaffNameV165(stageName, index)}
                        >
                          Hapus
                        </button>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    className="mt-2 rounded-2xl border border-blue-100 bg-blue-50 px-3 py-2 text-sm font-black text-blue-700"
                    onClick={() => addStageStaffNameV165(stageName)}
                  >
                    + Add More
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}


        <div>
          <label className="label">Catatan</label>
          <textarea className="input min-h-24" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>

        {programType === "corporate" &&
        corporateCompanyChoiceV431 &&
        corporateCompanyChoiceV431 !== NEW_CORPORATE_COMPANY_V431 &&
        corporatePackageChoiceV432 &&
        corporatePackageChoiceV432 !== NEW_CORPORATE_PACKAGE_V432 ? (
          <section className="rounded-3xl border border-blue-200 bg-blue-50/60 p-4">
            <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
              <div>
                <label className="label">Session MCU / Lokasi *</label>
                <select
                  className="input"
                  value={corporateSessionIdV466}
                  onChange={(e) => setCorporateSessionIdV466(e.target.value)}
                  disabled={corporateSessionLoadingV470}
                >
                  <option value="">
                    {corporateSessionLoadingV470 ? "Membaca Session MCU..." : "- Pilih Session MCU / Lokasi -"}
                  </option>
                  {corporateSessionsV466.map((session) => (
                    <option key={session.id} value={String(session.id)}>
                      {session.label || `${session.session_date || "Tanpa tanggal"} · ${session.location_name || "Tanpa lokasi"} · ${session.package_name || ""}`}
                    </option>
                  ))}
                </select>
              </div>
              <div className="rounded-2xl bg-white px-4 py-3 text-xs font-bold text-slate-600">
                {corporateSessionLoadingV470
                  ? "Membaca session..."
                  : corporateSessionsV466.length
                    ? `${corporateSessionsV466.length} session tersedia`
                    : "Belum ada Session MCU untuk perusahaan + paket ini"}
              </div>
            </div>

            {corporateSessionIdV466 ? (
              <div className="mt-3 rounded-2xl border border-blue-100 bg-white px-4 py-3 text-sm font-semibold text-slate-700">
                Session terpilih:{" "}
                <span className="font-black text-blue-700">
                  {corporateSessionsV466.find((session) => String(session.id) === String(corporateSessionIdV466))?.label ||
                    corporateSessionsV466.find((session) => String(session.id) === String(corporateSessionIdV466))?.location_name ||
                    corporateSessionIdV466}
                </span>
              </div>
            ) : null}
          </section>
        ) : null}

        <div>
          <label className="label">Upload Excel</label>
          <input
            className="input"
            type="file"
            accept=".xlsx,.xls"
            onChange={(e) => {
              const selectedFile = e.target.files?.[0] || null;
              setFile(selectedFile);
              resetCorporateMappingV466();
              if (programType === "corporate" && selectedFile) {
                void openCorporateMappingV466(selectedFile);
              }
            }}
            required
          />
          <div className="mt-2 text-xs text-slate-500">
            {programType === "vaccination"
              ? "Header vaksinasi: Nama Peserta, ID Peserta/NIK, Jenis Kelamin, Email, No HP, BatchName, TimeAreaName, TimeName. File BINUS dengan Child Name, Child Gender, Parent Binusian ID, Parent Email, Parent HP juga didukung."
              : programType === "corporate"
                ? "Format Corporate boleh bervariasi. Pilih file dan mapping akan dibaca otomatis di browser tanpa upload ulang."
                : "Header yang didukung: Nama Peserta, Nama Lengkap, Nama, Peserta, Putra, Putri, NIK, ID Peserta, Nomor Peserta, Employee ID, Provinsi, Jenis Kelamin, Email, Telepon/HP."}
          </div>
        </div>

        {programType === "corporate" ? (
          <section className="rounded-3xl border border-cyan-200 bg-cyan-50/50 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-lg font-black text-slate-900">Mapping Data & Session</div>
                <div className="mt-1 text-sm font-semibold text-slate-600">Baca header Excel, tentukan field sistem, lalu hubungkan seluruh peserta ke Session MCU / Lokasi yang benar.</div>
              </div>
              <button
                type="button"
                disabled={!file || corporateMappingLoadingV466}
                onClick={() => void openCorporateMappingV466()}
                className="rounded-2xl bg-cyan-600 px-4 py-3 text-sm font-black text-white disabled:opacity-50"
              >
                {corporateMappingLoadingV466 ? "Membaca lokal..." : corporatePreviewV466 ? "Baca Ulang Mapping" : "Mapping Data & Session →"}
              </button>
            </div>

            {corporateMappingErrorV466 ? <div className="mt-3 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">{corporateMappingErrorV466}</div> : null}

            {corporatePreviewV466 ? (
              <div className="mt-4 space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="font-black">Step 1 · Mapping Kolom Excel</div>
                      <div className="text-xs font-semibold text-slate-500">Sheet: {corporatePreviewV466.sheet_name} · Header baris {corporatePreviewV466.header_row} · {corporatePreviewV466.row_count} baris data terbaca</div>
                    </div>
                    <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-700">Preview siap</span>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    {CORPORATE_MAPPING_FIELDS_V466.map((field) => (
                      <div key={field.key}>
                        <label className="label">{field.label}{field.required ? " *" : ""}</label>
                        <select
                          className="input"
                          value={corporateMappingV466[field.key] || ""}
                          onChange={(e) => updateCorporateMappingV466(field.key, e.target.value)}
                        >
                          <option value="">— Tidak ada / jangan import —</option>
                          {corporatePreviewV466.headers.map((header) => <option key={`${field.key}-${header}`} value={header}>{header}</option>)}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-blue-200 bg-white p-4">
                  <div className="font-black">Step 2 · Mapping ke Session MCU / Lokasi</div>
                  <div className="mt-1 text-xs font-semibold text-slate-500">Peserta hasil import akan ditautkan ke Session yang dipilih, bukan menebak lokasi dari Department/BU.</div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <div className="md:col-span-2">
                      <label className="label">Session MCU / Lokasi *</label>
                      <select className="input" value={corporateSessionIdV466} onChange={(e) => setCorporateSessionIdV466(e.target.value)}>
                        <option value="">- Pilih Session MCU / Lokasi -</option>
                        {corporateSessionsV466.map((session) => <option key={session.id} value={session.id}>{session.label}</option>)}
                      </select>
                      {!corporateSessionsV466.length ? <div className="mt-2 rounded-xl bg-amber-50 p-3 text-xs font-bold text-amber-800">Belum ada Session MCU/Lokasi untuk perusahaan + paket ini. Buat Session MCU terlebih dahulu.</div> : null}
                    </div>
                    <div>
                      <label className="label">Sumber Lokasi</label>
                      <select className="input" value={corporateLocationModeV466} onChange={(e) => setCorporateLocationModeV466(e.target.value as any)}>
                        <option value="session">Gunakan Lokasi Session</option>
                        <option value="column">Ambil dari kolom Excel</option>
                        <option value="fixed">Isi nilai tetap</option>
                      </select>
                    </div>
                    <div>
                      {corporateLocationModeV466 === "column" ? (
                        <>
                          <label className="label">Kolom Lokasi Excel</label>
                          <select className="input" value={corporateLocationColumnV466} onChange={(e) => setCorporateLocationColumnV466(e.target.value)}>
                            <option value="">- Pilih kolom -</option>
                            {corporatePreviewV466.headers.map((header) => <option key={`loc-${header}`} value={header}>{header}</option>)}
                          </select>
                        </>
                      ) : corporateLocationModeV466 === "fixed" ? (
                        <>
                          <label className="label">Nilai Lokasi Tetap</label>
                          <input className="input" value={corporateFixedLocationV466} onChange={(e) => setCorporateFixedLocationV466(e.target.value)} placeholder="Contoh: BINUS - SERPONG" />
                        </>
                      ) : (
                        <>
                          <label className="label">Lokasi</label>
                          <div className="rounded-2xl border bg-slate-50 px-4 py-3 text-sm font-black text-slate-800">{corporateSessionsV466.find((row) => String(row.id) === corporateSessionIdV466)?.location_name || "Akan mengikuti Session yang dipilih"}</div>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="font-black">Step 3 · Preview Data</div>
                  <div className="mt-1 text-xs font-semibold text-slate-500">Contoh 5 baris pertama sebelum import. Nilai asli Excel tidak diubah.</div>
                  <div className="mt-3 overflow-x-auto rounded-xl border">
                    <table className="min-w-full text-xs">
                      <thead className="bg-slate-50">
                        <tr>{corporatePreviewV466.headers.slice(0, 8).map((header) => <th key={header} className="whitespace-nowrap p-2 text-left font-black text-slate-600">{header}</th>)}</tr>
                      </thead>
                      <tbody className="divide-y">
                        {corporatePreviewV466.preview.slice(0, 5).map((row, idx) => (
                          <tr key={idx}>{corporatePreviewV466.headers.slice(0, 8).map((header) => <td key={`${idx}-${header}`} className="max-w-56 whitespace-nowrap p-2 text-slate-700">{String(row?.[header] ?? "")}</td>)}</tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <button className="btn-primary w-full" disabled={loading || !corporateSessionIdV466}>
                  {loading ? "Import berjalan..." : `Import ${corporatePreviewV466.row_count || ""} Peserta ke Session Terpilih`}
                </button>
              </div>
            ) : null}
          </section>
        ) : (
          <button className="btn-primary" disabled={loading}>{loading ? "Import berjalan..." : "Import Database Peserta"}</button>
        )}

          </>
        )}
      </form>

      {result && (
        <section className={`card p-5 ${result.ok ? "border-emerald-200" : "border-red-200"}`}>
          <div className="text-lg font-black">
            {result?.mode === "vaccination_company_only"
              ? result.ok
                ? "Perusahaan tersimpan"
                : "Gagal menyimpan perusahaan"
              : result.ok
                ? "Import selesai"
                : "Import gagal"}
          </div>
          <pre className="mt-3 max-h-96 overflow-auto rounded-xl bg-slate-900 p-4 text-xs text-white">{JSON.stringify(result, null, 2)}</pre>
        </section>
      )}
    </div>
  );
}

