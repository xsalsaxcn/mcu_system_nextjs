"use client";

// VACCINATION_REGISTER_MASTER_SEARCH_COMPONENT_V153_74
import { useEffect, useMemo, useState } from "react";

function clean(value: any) {
  return String(value ?? "").trim();
}

function normalized(value: any) {
  return clean(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function resultIdentity(row: any) {
  return [
    clean(row?.name),
    clean(row?.employeeId),
    clean(row?.nik),
    clean(row?.email),
    clean(row?.sourceLabel),
  ]
    .filter(Boolean)
    .join("|");
}

function dateLabel(value: any) {
  if (!value) return "Tanggal belum tercatat";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function benefitLabel(item: any) {
  const name = clean(item?.name) || "Layanan";
  const brand = clean(item?.brand);
  return brand && !name.toLowerCase().includes(brand.toLowerCase())
    ? `${name} · ${brand}`
    : name;
}

function familyRoleLabel(value: any) {
  return String(value || "").toUpperCase() === "DEPENDENT"
    ? "Child / Family"
    : "Parent";
}

function identityLabel(row: any) {
  return [
    clean(row?.participantName || row?.name),
    clean(row?.employeeId) ? `ID ${clean(row.employeeId)}` : "",
    clean(row?.nik) ? `NIK ${clean(row.nik)}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

function sessionPersonKey(row: any) {
  const historyPersonId = Number(row?.history_person_id || row?.historyPersonId || 0);
  if (historyPersonId) return `history:${historyPersonId}`;

  const participantId = Number(row?.participant_id || row?.participantId || 0);
  if (participantId) return `participant:${participantId}`;

  const role = clean(row?.family_role || row?.familyRole || "PARENT").toUpperCase();
  const parentId = Number(row?.parent_history_person_id || row?.parentHistoryPersonId || 0);
  return [
    "fallback",
    normalized(row?.participant_name || row?.name),
    role,
    parentId || 0,
    normalized(row?.employee_id || row?.employeeId),
    normalized(row?.nik),
  ].join(":");
}

function registrationPriority(row: any) {
  const aStatus = clean(row?.queue_status).toUpperCase();
  const bStatus = clean(row?.bazar_queue_status).toUpperCase();
  const done = new Set(["ADMINISTERED", "DONE", "FINISHED"]);
  const cancelled = new Set(["CANCELLED", "CANCELED", "VOID", "BATAL"]);
  let score = 0;
  if (done.has(aStatus)) score += 120;
  else if (clean(row?.queue_number) && !cancelled.has(aStatus)) score += 90;
  if (done.has(bStatus)) score += 120;
  else if (clean(row?.bazar_queue_number) && !cancelled.has(bStatus)) score += 90;
  if (clean(row?.queue_number)) score += 15;
  if (clean(row?.bazar_queue_number)) score += 15;
  if (cancelled.has(aStatus) && cancelled.has(bStatus || aStatus)) score -= 100;
  score += Math.min(20, Number(row?.id || 0) / 1000000);
  return score;
}

export default function VaccinationParticipantMasterSearch({
  form,
  setForm,
  session,
  sessionRegistrations = [],
  onParticipantReady,
}: {
  form: any;
  setForm: any;
  session?: any;
  sessionRegistrations?: any[];
  onParticipantReady?: () => void;
}) {
  const [companies, setCompanies] = useState<any[]>([]);
  const [companyKey, setCompanyKey] = useState("");
  const [query, setQuery] = useState("");
  const [currentQuery, setCurrentQuery] = useState("");
  const [currentOpen, setCurrentOpen] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [loadingCompanies, setLoadingCompanies] = useState(false);
  const [searching, setSearching] = useState(false);
  const [loadingContext, setLoadingContext] = useState(false);
  const [pending, setPending] = useState<any>(null);
  const [error, setError] = useState("");
  const [walkInMode, setWalkInMode] = useState<"EXISTING" | "NEW">("EXISTING");

  const sessionId = Number(form?.sessionId || form?.session_id || session?.id || 0);

  useEffect(() => {
    let active = true;

    async function loadCompanies() {
      setLoadingCompanies(true);
      setError("");
      try {
        const response = await fetch("/api/vaccination/register-master-search", {
          cache: "no-store",
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload?.ok === false) {
          throw new Error(payload?.message || payload?.error || `HTTP ${response.status}`);
        }
        if (!active) return;
        const loaded = Array.isArray(payload?.companies) ? payload.companies : [];
        setCompanies(loaded);
      } catch (e: any) {
        if (active) setError(String(e?.message || e || "Gagal memuat daftar perusahaan."));
      } finally {
        if (active) setLoadingCompanies(false);
      }
    }

    void loadCompanies();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!companies.length || companyKey) return;
    const hints = [form?.companyName, session?.company_name, session?.source_name]
      .map(normalized)
      .filter(Boolean);
    const match = companies.find((item: any) => {
      const candidate = normalized(item?.name);
      return hints.some(
        (hint) => candidate === hint || candidate.includes(hint) || hint.includes(candidate),
      );
    });
    if (match?.key) setCompanyKey(String(match.key));
  }, [companies, companyKey, form?.companyName, session?.company_name, session?.source_name]);

  useEffect(() => {
    setSelected(null);
    setResults([]);
    setQuery("");
  }, [companyKey]);

  useEffect(() => {
    setCurrentQuery("");
    setCurrentOpen(false);
    setPending(null);
    setWalkInMode("EXISTING");
  }, [sessionId]);

  useEffect(() => {
    const keyword = query.trim();
    if (!companyKey || keyword.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }

    let active = true;
    const timer = window.setTimeout(async () => {
      setSearching(true);
      setError("");
      try {
        const params = new URLSearchParams({
          company_key: companyKey,
          q: keyword,
        });
        const response = await fetch(
          `/api/vaccination/register-master-search?${params.toString()}`,
          { cache: "no-store" },
        );
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload?.ok === false) {
          throw new Error(payload?.message || payload?.error || `HTTP ${response.status}`);
        }
        if (!active) return;
        setResults(Array.isArray(payload?.results) ? payload.results : []);
      } catch (e: any) {
        if (active) {
          setResults([]);
          setError(String(e?.message || e || "Pencarian peserta gagal."));
        }
      } finally {
        if (active) setSearching(false);
      }
    }, 320);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [companyKey, query]);

  const company = useMemo(
    () => companies.find((item: any) => clean(item?.key) === companyKey) || null,
    [companies, companyKey],
  );

  const currentSessionRows = useMemo(() => {
    const keyword = normalized(currentQuery);
    const grouped = new Map<string, any>();

    for (const row of Array.isArray(sessionRegistrations) ? sessionRegistrations : []) {
      const haystack = normalized(
        [row?.participant_name, row?.employee_id, row?.nik, row?.email, row?.queue_number, row?.bazar_queue_number]
          .filter(Boolean)
          .join(" "),
      );
      if (keyword && !haystack.includes(keyword)) continue;

      const key = sessionPersonKey(row);
      const current = grouped.get(key);
      if (!current || registrationPriority(row) > registrationPriority(current)) {
        grouped.set(key, row);
      }
    }

    return Array.from(grouped.values())
      .sort((a: any, b: any) =>
        clean(a?.participant_name).localeCompare(clean(b?.participant_name), "id"),
      )
      .slice(0, 60);
  }, [sessionRegistrations, currentQuery]);

  function applyParticipant(row: any, extra: any = {}) {
    const participantId = Number(row?.participantId || row?.participant_id || 0) || null;
    const name = clean(row?.name || row?.participant_name);
    const employeeId = clean(row?.employeeId || row?.employee_id);
    const nik = clean(row?.nik);
    const email = clean(row?.email);
    const phone = clean(row?.phone);
    const department = clean(row?.department);
    const companyName =
      clean(row?.companyName || row?.company_name) ||
      clean(company?.name) ||
      clean(session?.company_name);
    const rowParticipantType = clean(
      row?.participantType || row?.participant_type || row?.family_role,
    ).toUpperCase();
    const familyRole =
      rowParticipantType === "DEPENDENT" ||
      rowParticipantType === "CHILD" ||
      rowParticipantType === "FAMILY"
        ? "DEPENDENT"
        : "PARENT";

    setSelected({ ...row, name });
    setForm((previous: any) => ({
      ...(previous || {}),
      participantId,
      participant_id: participantId,
      name,
      participantName: name,
      participant_name: name,
      employeeId,
      employee_id: employeeId,
      nik,
      email,
      phone,
      department,
      companyName,
      company_name: companyName,
      masterCompanyKey: clean(companyKey),
      familyRole: clean(extra?.familyRole || familyRole) || "PARENT",
      historyPersonId:
        Number(row?.historyPersonId || row?.history_person_id || extra?.historyPersonId || 0) || null,
      parentHistoryPersonId:
        Number(
          row?.parentHistoryPersonId ||
          row?.parent_history_person_id ||
          extra?.parentHistoryPersonId ||
          0,
        ) || null,
      parentName: clean(row?.parentName || row?.parent_name || extra?.parentName),
      parentEmployeeId: clean(
        row?.parentEmployeeId ||
        row?.parent_employee_id ||
        extra?.parentEmployeeId,
      ),
      parentNik: clean(row?.parentNik || row?.parent_nik || extra?.parentNik),
      parentEmail: clean(row?.parentEmail || row?.parent_email || extra?.parentEmail),
      masterSearchSource: clean(row?.sourceType || extra?.sourceType),
      existingRegistrationId:
        Number(
          extra?.existingRegistrationId ||
          row?.existingRegistrationId ||
          row?.registrationId ||
          row?.registration_id ||
          0,
        ) || null,
      moveFromRegistrationId: Number(extra?.moveFromRegistrationId || 0) || null,
      walkInSuggestedVaccineIds: Array.isArray(extra?.suggestedVaccineIds)
        ? extra.suggestedVaccineIds.map(String).filter(Boolean)
        : [],
      walkInContextLabel: clean(extra?.contextLabel),
      ...(extra?.serviceMode ? { serviceMode: extra.serviceMode } : {}),
    }));
  }

  function chooseCurrentRegistration(row: any) {
    const currentHealthdayVaccineIds = (Array.isArray(row?.items) ? row.items : [])
      .filter((item: any) => clean(item?.service_mode || "HEALTHDAY").toUpperCase() !== "BAZAR")
      .map((item: any) => String(item?.vaccine_id || item?.vaccine?.id || ""))
      .filter(Boolean);
    if (!currentHealthdayVaccineIds.length && row?.vaccine_id) {
      currentHealthdayVaccineIds.push(String(row.vaccine_id));
    }

    applyParticipant(row, {
      sourceType: "CURRENT_SESSION",
      existingRegistrationId: Number(row?.id || 0) || null,
      // V513: carry the participant's registered Healthday vaccine into the
      // Healthday confirmation pop-up. Bazar mode ignores/clears this selection.
      suggestedVaccineIds: Array.from(new Set(currentHealthdayVaccineIds)),
      contextLabel: `Terdaftar di ${session?.session_name || session?.location || "session ini"}`,
    });
    setCurrentQuery(clean(row?.participant_name));
    setCurrentOpen(false);
    window.setTimeout(() => onParticipantReady?.(), 0);
  }

  async function loadParticipantContext(row: any) {
    if (!sessionId) {
      setError("Pilih session / lokasi terlebih dahulu.");
      return;
    }
    setLoadingContext(true);
    setError("");
    try {
      const params = new URLSearchParams({
        session_id: String(sessionId),
      });
      const participantId = Number(row?.participantId || row?.participant_id || 0);
      const historyPersonId = Number(row?.historyPersonId || row?.history_person_id || 0);
      if (participantId) params.set("participant_id", String(participantId));
      if (historyPersonId) params.set("history_person_id", String(historyPersonId));
      if (clean(row?.name || row?.participant_name)) params.set("name", clean(row?.name || row?.participant_name));
      if (clean(row?.employeeId || row?.employee_id)) params.set("employee_id", clean(row?.employeeId || row?.employee_id));
      if (clean(row?.nik)) params.set("nik", clean(row?.nik));
      if (clean(row?.email)) params.set("email", clean(row?.email));

      const participantType = clean(
        row?.participantType ||
          row?.participant_type ||
          row?.familyRole ||
          row?.family_role,
      ).toUpperCase();
      const familyRole =
        participantType === "DEPENDENT" ||
        participantType === "CHILD" ||
        participantType === "FAMILY"
          ? "DEPENDENT"
          : "PARENT";
      params.set("family_role", familyRole);

      const parentHistoryPersonId = Number(
        row?.parentHistoryPersonId ||
          row?.parent_history_person_id ||
          0,
      );
      if (parentHistoryPersonId) {
        params.set(
          "parent_history_person_id",
          String(parentHistoryPersonId),
        );
      }

      const response = await fetch(
        `/api/vaccination/register-participant-context?${params.toString()}`,
        { cache: "no-store" },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.message || payload?.error || `HTTP ${response.status}`);
      }
      setPending({ row, context: payload });
    } catch (e: any) {
      setError(String(e?.message || e || "Gagal memuat konteks peserta."));
    } finally {
      setLoadingContext(false);
    }
  }

  function chooseParticipant(row: any) {
    void loadParticipantContext(row);
  }

  function openRelatedPerson(member: any, relationshipLabel: "Parent" | "Child" | "Sibling") {
    if (!member?.id) return;
    const fallbackType = relationshipLabel === "Parent" ? "EMPLOYEE" : "DEPENDENT";
    void loadParticipantContext({
      sourceType: "HISTORY_COMPANY",
      historyPersonId: Number(member.id || 0) || null,
      name: clean(member.name),
      employeeId: clean(member.employeeId),
      nik: clean(member.nik),
      email: clean(member.email),
      phone: clean(member.phone),
      participantType: clean(member.participantType) || fallbackType,
      companyName:
        clean(pending?.row?.companyName || pending?.row?.company_name) ||
        clean(company?.name) ||
        clean(session?.company_name),
    });
  }

  function continueFromPopup(mode: "CURRENT" | "MOVE" | "NEW") {
    if (!pending) return;
    const row = pending.row || {};
    const context = pending.context || {};
    const other = context.otherRegistration || null;
    const current = context.currentRegistration || null;
    const historical = Array.isArray(context.historical) ? context.historical : [];
    const historyPersonId = Number(context?.historyPerson?.id || row?.historyPersonId || 0) || null;

    if (mode === "CURRENT" && current) {
      applyParticipant(
        {
          ...row,
          participantId: current.participantId || row.participantId,
          name: current.participantName || row.name,
          employeeId: current.employeeId || row.employeeId,
          nik: current.nik || row.nik,
          email: current.email || row.email,
          phone: current.phone || row.phone,
          department: current.department || row.department,
          companyName: current.companyName || row.companyName,
          historyPersonId,
        },
        {
          sourceType: "CURRENT_SESSION",
          existingRegistrationId: Number(current?.id || 0) || null,
          suggestedVaccineIds: Array.from(
            new Set(
              (Array.isArray(current?.benefits) ? current.benefits : [])
                .filter((benefit: any) => clean(benefit?.serviceMode || "HEALTHDAY").toUpperCase() !== "BAZAR")
                .map((benefit: any) => String(benefit?.vaccineId || ""))
                .filter(Boolean),
            ),
          ),
          contextLabel: `Sudah terdaftar di ${current?.session?.name || current?.session?.location || "session ini"}`,
        },
      );
    } else if (mode === "MOVE" && other) {
      applyParticipant(
        {
          ...row,
          participantId: other.participantId || row.participantId,
          name: other.participantName || row.name,
          employeeId: other.employeeId || row.employeeId,
          nik: other.nik || row.nik,
          email: other.email || row.email,
          phone: other.phone || row.phone,
          department: other.department || row.department,
          companyName: other.companyName || row.companyName,
          historyPersonId,
        },
        {
          sourceType: "MOVE_LOCATION",
          moveFromRegistrationId: other.id,
          suggestedVaccineIds: other.vaccineIds || [],
          serviceMode: String(other?.patientServiceStatus || "").toUpperCase() === "BAZAR" ? "BAZAR" : "HEALTHDAY",
          contextLabel: `Pindah dari ${other?.session?.name || other?.session?.location || "lokasi lain"}`,
        },
      );
    } else {
      applyParticipant(
        {
          ...row,
          historyPersonId,
        },
        {
          sourceType: historical.length ? "HISTORY_ONLY" : "NEW_WALKIN",
          suggestedVaccineIds: [],
          contextLabel: historical.length
            ? `History ditemukan: ${historical.length} layanan`
            : "Belum ada history",
        },
      );
    }

    setPending(null);
    window.setTimeout(() => onParticipantReady?.(), 0);
  }

  function startNewParticipant() {
    const name = query.trim();
    if (!name) return;
    setPending({
      row: {
        sourceType: "NEW_WALKIN",
        name,
        companyName: clean(company?.name) || clean(session?.company_name),
      },
      context: {
        caseType: "NEW",
        selectedSession: {
          id: sessionId,
          name: clean(session?.session_name),
          companyName: clean(session?.company_name),
          location: clean(session?.location),
          date: session?.session_date || null,
        },
        currentRegistration: null,
        otherRegistration: null,
        historyPerson: null,
        historical: [],
      },
    });
  }


  function startManualParticipant() {
    if (!sessionId) {
      setError("Pilih session / lokasi terlebih dahulu.");
      return;
    }

    const resolvedCompanyName =
      clean(company?.name) ||
      clean(session?.company_name) ||
      clean(session?.source_name);

    setError("");
    setSelected(null);
    setPending(null);
    setResults([]);
    setQuery("");

    setForm((previous: any) => ({
      ...(previous || {}),
      participantId: null,
      participant_id: null,
      participantName: "",
      participant_name: "",
      name: "",
      employeeId: "",
      employee_id: "",
      nik: "",
      email: "",
      phone: "",
      department: "",
      companyName: resolvedCompanyName,
      company_name: resolvedCompanyName,
      masterCompanyKey: clean(companyKey),
      familyRole: "PARENT",
      historyPersonId: null,
      parentHistoryPersonId: null,
      parentName: "",
      parentEmployeeId: "",
      parentNik: "",
      parentEmail: "",
      masterSearchSource: "NEW_MANUAL",
      moveFromRegistrationId: null,
      walkInSuggestedVaccineIds: [],
      walkInContextLabel: "Peserta baru / Registrasi manual",
    }));

    window.setTimeout(() => onParticipantReady?.(), 0);
  }

  const context = pending?.context || null;
  const other = context?.otherRegistration || null;
  const current = context?.currentRegistration || null;
  const historical = Array.isArray(context?.historical) ? context.historical : [];
  const contextPerson = context?.historyPerson || {
    name: current?.participantName || other?.participantName || pending?.row?.name || pending?.row?.participant_name || "",
    employeeId: current?.employeeId || other?.employeeId || pending?.row?.employeeId || pending?.row?.employee_id || "",
    nik: current?.nik || other?.nik || pending?.row?.nik || "",
    email: current?.email || other?.email || pending?.row?.email || "",
    phone: current?.phone || other?.phone || pending?.row?.phone || "",
    participantType: pending?.row?.participantType || pending?.row?.participant_type || current?.familyRole || other?.familyRole || "",
  };
  const family = context?.family || { role: "", parent: null, children: [], siblings: [] };
  const familyChildren = Array.isArray(family?.children) ? family.children : [];
  const familySiblings = Array.isArray(family?.siblings) ? family.siblings : [];
  const familyDisplayRows =
    String(family?.role || contextPerson?.participantType || "").toUpperCase() === "DEPENDENT"
      ? familySiblings.map((row: any) => ({ ...row, relationshipLabel: "Sibling" }))
      : familyChildren.map((row: any) => ({ ...row, relationshipLabel: "Child" }));
  const contextCompany = clean(
    current?.companyName ||
      other?.companyName ||
      pending?.row?.companyName ||
      pending?.row?.company_name ||
      context?.selectedSession?.companyName ||
      company?.name,
  );

  return (
    <div className="w-full rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
      <div className="flex flex-col gap-2 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="text-base font-black text-slate-900">Cari / Pilih Peserta</div>
          <div className="mt-1 text-xs font-semibold leading-5 text-slate-500">
            Setelah session dipilih, cari peserta yang sudah terdaftar di lokasi ini atau cari peserta walk-in dari database / history.
          </div>
        </div>
        <div className="rounded-full border border-blue-100 bg-white px-3 py-1 text-[11px] font-black text-blue-700">
          Session: {session?.session_name || session?.location || "belum dipilih"}
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <section className="rounded-2xl border border-emerald-200 bg-white p-4">
          <div className="text-xs font-black uppercase tracking-wide text-emerald-700">
            Peserta Terdaftar di Lokasi Ini
          </div>
          <div className="mt-1 text-xs font-semibold text-slate-500">
            {sessionId
              ? `${sessionRegistrations.length} peserta pada session terpilih · bisa dicari nama / ID / NIK`
              : "Pilih session terlebih dahulu."}
          </div>
          <input
            value={currentQuery}
            onFocus={() => setCurrentOpen(true)}
            onChange={(e) => { setCurrentQuery(e.target.value); setCurrentOpen(true); }}
            onBlur={() => window.setTimeout(() => setCurrentOpen(false), 160)}
            disabled={!sessionId}
            placeholder="Cari peserta terdaftar di lokasi ini..."
            className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold outline-none focus:border-emerald-400 disabled:bg-slate-100"
          />
          {sessionId && currentOpen ? (
            <div className="mt-2 max-h-60 overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
              {currentSessionRows.map((row: any) => (
                <button
                  type="button"
                  key={`current-${row.id}`}
                  onClick={() => chooseCurrentRegistration(row)}
                  className="flex w-full items-start justify-between gap-3 border-b border-slate-100 px-3 py-2.5 text-left last:border-b-0 hover:bg-emerald-50"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-black text-slate-900">{row.participant_name || "-"}</div>
                    <div className="mt-1 text-[11px] font-semibold text-slate-500">
                      {[row.employee_id, row.nik, row.queue_number, row.bazar_queue_number]
                        .filter(Boolean)
                        .join(" · ") || "Data session"}
                    </div>
                  </div>
                  <span className="shrink-0 rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-black text-emerald-700">
                    Lokasi Ini
                  </span>
                </button>
              ))}
              {!currentSessionRows.length ? (
                <div className="px-3 py-3 text-xs font-semibold text-slate-500">Peserta tidak ditemukan di session ini.</div>
              ) : null}
            </div>
          ) : null}
        </section>

        <section className="rounded-2xl border border-blue-200 bg-white p-4">
          <div className="text-xs font-black uppercase tracking-wide text-blue-700">
            Walk-in / Peserta Lain
          </div>
          <div className="mt-1 text-xs font-semibold text-slate-500">
            Pilih apakah peserta sudah pernah ada di database/history atau benar-benar peserta baru.
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => {
                setWalkInMode("EXISTING");
                setError("");
              }}
              className={`rounded-lg px-3 py-2.5 text-xs font-black transition ${
                walkInMode === "EXISTING"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-transparent text-slate-600 hover:bg-white"
              }`}
            >
              Cari Peserta Existing
            </button>
            <button
              type="button"
              onClick={() => {
                setWalkInMode("NEW");
                setError("");
                setResults([]);
                setQuery("");
              }}
              className={`rounded-lg px-3 py-2.5 text-xs font-black transition ${
                walkInMode === "NEW"
                  ? "bg-violet-600 text-white shadow-sm"
                  : "bg-transparent text-slate-600 hover:bg-white"
              }`}
            >
              Peserta Baru / Manual
            </button>
          </div>

          {walkInMode === "EXISTING" ? (
            <>
              <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-[11px] font-semibold text-blue-800">
                Gunakan ini bila peserta pernah terdaftar, pernah punya history, atau mungkin terdaftar di lokasi lain.
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-[0.85fr_1.15fr]">
                <select
                  value={companyKey}
                  onChange={(e) => setCompanyKey(e.target.value)}
                  disabled={loadingCompanies}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-blue-400"
                >
                  <option value="">
                    {loadingCompanies ? "Memuat perusahaan..." : "Pilih perusahaan / instansi"}
                  </option>
                  {companies.map((item: any) => (
                    <option key={item.key} value={item.key}>{item.name}</option>
                  ))}
                </select>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  disabled={!companyKey || !sessionId}
                  placeholder={sessionId ? "Cari nama / NIP / NIK / email..." : "Pilih session terlebih dahulu"}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none placeholder:font-medium placeholder:text-slate-400 focus:border-blue-400 disabled:bg-slate-100"
                />
              </div>

              {searching || loadingContext ? (
                <div className="mt-3 rounded-xl border bg-slate-50 px-3 py-3 text-xs font-bold text-slate-500">
                  {loadingContext ? "Memeriksa lokasi & history peserta..." : "Mencari peserta..."}
                </div>
              ) : null}

              {!searching && companyKey && query.trim().length >= 2 && results.length ? (
                <div className="mt-3 max-h-64 overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
                  {results.map((row: any) => {
                    const isMerged = Number(row?.mergedSourceCount || 0) > 1;
                    const isHistory = row.sourceType === "HISTORY_COMPANY";
                    return (
                      <button
                        type="button"
                        key={resultIdentity(row)}
                        onClick={() => chooseParticipant(row)}
                        className="flex w-full items-start justify-between gap-4 border-b border-slate-100 px-4 py-3 text-left last:border-b-0 hover:bg-blue-50"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-sm font-black text-slate-900">{row.name || "-"}</div>
                          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-semibold text-slate-500">
                            {row.employeeId ? <span>ID: {row.employeeId}</span> : null}
                            {row.nik ? <span>NIK: {row.nik}</span> : null}
                            {row.email ? <span>{row.email}</span> : null}
                          </div>
                        </div>
                        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black ${isMerged ? "bg-emerald-100 text-emerald-700" : isHistory ? "bg-violet-100 text-violet-700" : "bg-blue-100 text-blue-700"}`}>
                          {isMerged ? "Database + History" : isHistory ? "History" : "Database"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : null}

              {!searching && companyKey && query.trim().length >= 2 && !results.length && !error ? (
                <div className="mt-3 rounded-xl border border-dashed bg-slate-50 p-3">
                  <div className="text-xs font-semibold text-slate-600">
                    Peserta tidak ditemukan di database perusahaan.
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={startNewParticipant}
                      className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-black text-white hover:bg-blue-700"
                    >
                      Lanjut sebagai peserta baru: {query.trim()}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setWalkInMode("NEW");
                        setResults([]);
                      }}
                      className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-black text-violet-700 hover:bg-violet-100"
                    >
                      Buka Registrasi Manual
                    </button>
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <div className="mt-3 rounded-2xl border border-violet-200 bg-violet-50 p-4">
              <div className="text-sm font-black text-violet-950">Peserta Baru / Belum Pernah Terdaftar</div>
              <div className="mt-1 text-xs font-semibold leading-5 text-violet-800">
                Gunakan jalur ini untuk peserta yang benar-benar belum pernah ada di database maupun history.
                Data peserta akan diisi manual di pop-up, lalu lanjut pilih layanan sampai nomor antrean dirilis.
              </div>

              <div className="mt-3">
                <label className="text-[11px] font-black uppercase text-violet-700">Perusahaan / Instansi</label>
                <select
                  value={companyKey}
                  onChange={(e) => setCompanyKey(e.target.value)}
                  disabled={loadingCompanies}
                  className="mt-1 w-full rounded-xl border border-violet-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-violet-400"
                >
                  <option value="">
                    {loadingCompanies ? "Memuat perusahaan..." : (session?.company_name || session?.source_name || "Pilih perusahaan / instansi")}
                  </option>
                  {companies.map((item: any) => (
                    <option key={item.key} value={item.key}>{item.name}</option>
                  ))}
                </select>
              </div>

              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-800">
                Jika ragu peserta sudah pernah terdaftar atau belum, gunakan <b>Cari Peserta Existing</b> dulu untuk mencegah data ganda.
              </div>

              <button
                type="button"
                onClick={startManualParticipant}
                disabled={!sessionId}
                className="mt-3 w-full rounded-xl bg-violet-600 px-4 py-3 text-sm font-black text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                + Registrasi Manual Peserta Baru
              </button>
            </div>
          )}
        </section>
      </div>

      {error ? (
        <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">
          {error}
        </div>
      ) : null}

      {selected ? (
        <div className="mt-3 flex flex-col gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-xs font-black text-emerald-900">Peserta aktif: {selected.name}</div>
            <div className="mt-0.5 text-[11px] font-semibold text-emerald-700">
              {[form?.employeeId ? `ID ${form.employeeId}` : "", form?.walkInContextLabel]
                .filter(Boolean)
                .join(" · ") || "Siap lanjut registrasi"}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onParticipantReady?.()}
              className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-black text-white hover:bg-emerald-800"
            >
              Lanjutkan Registrasi
            </button>
            <button
              type="button"
              onClick={() => {
                setSelected(null);
                setQuery("");
                setCurrentQuery("");
                setForm((previous: any) => ({
                  ...(previous || {}),
                  participantId: null,
                  participant_id: null,
                  historyPersonId: null,
                  existingRegistrationId: null,
                  moveFromRegistrationId: null,
                  walkInSuggestedVaccineIds: [],
                  walkInContextLabel: "",
                }));
              }}
              className="rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-xs font-black text-emerald-800"
            >
              Ganti Peserta
            </button>
          </div>
        </div>
      ) : null}

      {pending && context ? (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-950/55 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setPending(null); }}>
          <div className="max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b bg-slate-50 px-6 py-5">
              <div>
                <div className="text-xs font-black uppercase tracking-wide text-blue-700">Cek Peserta Walk-in</div>
                <h3 className="mt-1 text-2xl font-black text-slate-900">{pending?.row?.name || pending?.row?.participant_name || "Peserta"}</h3>
              </div>
              <button type="button" onClick={() => setPending(null)} className="rounded-xl border bg-white px-4 py-2 text-sm font-black">Tutup</button>
            </div>

            <div className="max-h-[calc(90vh-96px)] space-y-4 overflow-y-auto p-6">
              {current ? (
                <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
                  <div className="text-xs font-black uppercase text-emerald-700">Sudah terdaftar di lokasi ini</div>
                  <div className="mt-2 text-lg font-black text-emerald-950">
                    {current?.session?.location || current?.session?.name || "Session saat ini"} · {dateLabel(current?.session?.date)}
                  </div>
                  <div className="mt-2 text-sm font-semibold text-emerald-800">
                    Nomor: {[current.queueNumber, current.bazarQueueNumber].filter(Boolean).join(" / ") || "Belum rilis"}
                  </div>
                  <button type="button" onClick={() => continueFromPopup("CURRENT")} className="mt-4 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-black text-white">
                    Gunakan Data Peserta
                  </button>
                </section>
              ) : other ? (
                <section className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-5 shadow-sm">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="text-xs font-black uppercase tracking-wide text-amber-700">
                        Peringatan · Pernah Terdaftar di Lokasi Lain
                      </div>
                      <div className="mt-2 text-lg font-black leading-snug text-amber-950">
                        Peserta ini sudah pernah terdaftar di{" "}
                        {other?.session?.name || other?.session?.location || "lokasi lain"},{" "}
                        {dateLabel(other?.session?.date || other?.registeredAt)}.
                      </div>
                    </div>
                    <span className="shrink-0 rounded-full bg-white px-3 py-1 text-xs font-black text-amber-800">
                      {familyRoleLabel(
                        other?.familyRole ||
                          pending?.row?.participantType ||
                          pending?.row?.participant_type,
                      )}
                    </span>
                  </div>

                  <div className="mt-4 rounded-xl border border-amber-200 bg-white p-3">
                    <div className="text-[10px] font-black uppercase tracking-wide text-slate-500">
                      Identitas yang dicocokkan
                    </div>
                    <div className="mt-1 text-sm font-black text-slate-950">
                      {identityLabel(other) ||
                        identityLabel(pending?.row) ||
                        pending?.row?.name ||
                        "Peserta"}
                    </div>
                    {other?.familyRole === "DEPENDENT" && other?.parentName ? (
                      <div className="mt-1 text-xs font-semibold text-slate-600">
                        Parent: {other.parentName}
                      </div>
                    ) : null}
                    <div className="mt-2 text-[11px] font-semibold text-slate-500">
                      Sistem membedakan peserta berdasarkan kombinasi status keluarga,
                      nama, NIK/Employee ID, dan Parent bila tersedia — bukan dari NIK
                      karyawan saja.
                    </div>
                  </div>

                  <div className="mt-4">
                    <div className="text-xs font-black uppercase text-amber-700">
                      Layanan Sebelumnya
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(other?.benefits || []).map((benefit: any, index: number) => (
                        <span key={`${benefit?.vaccineId || index}-${index}`} className="rounded-full bg-white px-3 py-1 text-xs font-black text-amber-900">
                          {benefitLabel(benefit)}
                        </span>
                      ))}
                      {!(other?.benefits || []).length ? (
                        <span className="text-xs font-semibold text-amber-800">
                          Layanan belum tercatat.
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {other.moveAllowed ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button type="button" onClick={() => continueFromPopup("MOVE")} className="rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-black text-white hover:bg-amber-700">
                        Pindah ke lokasi saat ini
                      </button>
                      <button type="button" onClick={() => setPending(null)} className="rounded-xl border bg-white px-4 py-2.5 text-sm font-black text-slate-700">
                        Tutup · Tidak Jadi
                      </button>
                    </div>
                  ) : (
                    <div className="mt-4 rounded-xl border border-orange-200 bg-white p-3 text-xs font-bold text-orange-700">
                      {other.moveBlockedReason || "Pendaftaran lama tidak dapat dipindahkan."}
                    </div>
                  )}
                </section>
              ) : null}

              <section className="rounded-2xl border border-blue-100 bg-blue-50/50 p-5">
                <div className="text-xs font-black uppercase tracking-wide text-blue-700">Data Peserta</div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {[
                    ["Nama", clean(contextPerson?.name) || "-"],
                    [
                      "NIK Karyawan / BINUSIAN ID",
                      clean(contextPerson?.employeeId) ||
                        (clean(family?.parent?.employeeId)
                          ? `${clean(family.parent.employeeId)} (Parent)`
                          : "-"),
                    ],
                    ["NIK KTP", clean(contextPerson?.nik) || "-"],
                    [
                      "No. HP",
                      clean(contextPerson?.phone) ||
                        (clean(family?.parent?.phone)
                          ? `${clean(family.parent.phone)} (Parent)`
                          : "-"),
                    ],
                    [
                      "Email",
                      clean(contextPerson?.email) ||
                        (clean(family?.parent?.email)
                          ? `${clean(family.parent.email)} (Parent)`
                          : "-"),
                    ],
                    ["Perusahaan", contextCompany || "-"],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-xl border bg-white p-3">
                      <div className="text-[10px] font-black uppercase tracking-wide text-slate-500">{label}</div>
                      <div className="mt-1 break-words text-sm font-black text-slate-900">{value}</div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border bg-white p-3">
                    <div className="text-[10px] font-black uppercase tracking-wide text-slate-500">Parent</div>
                    {family?.parent ? (
                      <button
                        type="button"
                        onClick={() => openRelatedPerson(family.parent, "Parent")}
                        disabled={loadingContext}
                        className="mt-1 w-full rounded-lg bg-slate-50 px-3 py-2 text-left transition hover:bg-blue-50 disabled:opacity-60"
                        title="Klik untuk buka data Parent"
                      >
                        <div className="text-sm font-black text-slate-900">{family.parent.name || "-"} <span className="font-bold text-blue-700">(Parent)</span></div>
                        <div className="mt-1 text-xs font-semibold text-slate-500">
                          {[family.parent.employeeId ? `ID ${family.parent.employeeId}` : "", family.parent.nik ? `NIK ${family.parent.nik}` : "", family.parent.phone || ""].filter(Boolean).join(" · ") || "-"}
                        </div>
                        <div className="mt-1 text-[10px] font-black uppercase tracking-wide text-blue-600">Klik lihat data</div>
                      </button>
                    ) : (
                      <div className="mt-1 text-sm font-semibold text-slate-500">
                        {String(family?.role || contextPerson?.participantType || "").toUpperCase() === "DEPENDENT" ? "Parent belum terhubung" : "Peserta adalah Parent / tidak ada Parent"}
                      </div>
                    )}
                  </div>
                  <div className="rounded-xl border bg-white p-3">
                    <div className="text-[10px] font-black uppercase tracking-wide text-slate-500">Child / Family</div>
                    {familyDisplayRows.length ? (
                      <div className="mt-2 space-y-2">
                        {familyDisplayRows.map((member: any) => (
                          <button
                            type="button"
                            key={member.id || `${member.name}-${member.nik}`}
                            onClick={() => openRelatedPerson(member, member.relationshipLabel === "Sibling" ? "Sibling" : "Child")}
                            disabled={loadingContext}
                            className="w-full rounded-lg bg-slate-50 px-3 py-2 text-left transition hover:bg-violet-50 disabled:opacity-60"
                            title={`Klik untuk buka data ${member.relationshipLabel || "family"}`}
                          >
                            <div className="text-sm font-black text-slate-900">
                              {member.name || "-"} <span className="font-bold text-violet-700">({member.relationshipLabel})</span>
                            </div>
                            <div className="mt-0.5 text-[11px] font-semibold text-slate-500">
                              {[member.employeeId ? `ID ${member.employeeId}` : "", member.nik ? `NIK ${member.nik}` : "", member.phone || ""].filter(Boolean).join(" · ") || "-"}
                            </div>
                            <div className="mt-1 text-[10px] font-black uppercase tracking-wide text-violet-600">Klik lihat data</div>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-1 text-sm font-semibold text-slate-500">Belum ada Child / Family terhubung.</div>
                    )}
                  </div>
                </div>
              </section>

              <section className="rounded-2xl border bg-white p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-black uppercase text-violet-700">History Peserta</div>
                    <div className="mt-1 text-sm font-semibold text-slate-500">Riwayat layanan terdahulu sebelum registrasi walk-in dilanjutkan.</div>
                  </div>
                  <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-black text-violet-700">{historical.length}</span>
                </div>
                <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">
                  {historical.map((item: any) => (
                    <div key={item.id} className="rounded-xl border bg-slate-50 p-3">
                      <div className="font-black text-slate-900">{item.service_name || "Layanan"}{item.product_brand ? ` · ${item.product_brand}` : ""}</div>
                      <div className="mt-1 text-xs font-semibold text-slate-500">{dateLabel(item.service_date)}{item.location ? ` · ${item.location}` : ""}</div>
                    </div>
                  ))}
                  {!historical.length ? (
                    <div className="rounded-xl border border-dashed p-5 text-center text-sm font-black text-slate-500">Belum ada history.</div>
                  ) : null}
                </div>
              </section>

              {!current && !other?.moveAllowed ? (
                <button type="button" onClick={() => continueFromPopup("NEW")} className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-black text-white hover:bg-blue-700">
                  Lanjut Registrasi
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
