"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import VaccinationParticipantHistoryModal from "@/components/VaccinationParticipantHistoryModal";

// V518_OPTIONAL_INTERNAL_QUEUE_VENDOR_NUMBER
// VACCINATION_REGISTER_MASTER_SEARCH_V153_0_1
import VaccinationParticipantMasterSearch from "@/components/VaccinationParticipantMasterSearch";
// VACCINATION_REGISTER_PRODUCT_QUEUE_PRINT_V153_1_1
import VaccinationManualWalkInController from "@/components/VaccinationManualWalkInController";
type ProductItem = {
  id?: string;
  vaccineId: string;
  lotId: string;
  doseNumber: number;
  priceCategory: string;
  price: string;
  paymentMethod: string;
  paymentNote: string;
  itemNote: string;
  serviceMode: "HEALTHDAY" | "BAZAR";
  status?: string;
  salesOptionId?: number | null;
  saleMode?: "PACKAGE" | "NON_PACKAGE";
  packageDoseCount?: number;
  salesPriceSnapshot?: number | null;
};

type SortState = { key: string; direction: "asc" | "desc" };

const LOCK_KEY = "harmony_vaccination_locked_register_context_v65";

const stageMap: Record<string, { label: string; cls: string }> = {
  IMPORTED: { label: "Belum Datang", cls: "bg-slate-900 text-white" },
  REGISTERED: { label: "Belum Datang", cls: "bg-slate-900 text-white" },
  WAITING: { label: "Waiting", cls: "bg-red-100 text-red-700" },
  WAITING_WITH_NOTE: { label: "Waiting With Note", cls: "bg-orange-100 text-orange-700" },
  CALLED: { label: "Dokter", cls: "bg-blue-100 text-blue-700" },
  IN_PROGRESS: { label: "Dokter", cls: "bg-blue-100 text-blue-700" },
  ADMINISTERED: { label: "Selesai", cls: "bg-emerald-100 text-emerald-700" },
  DONE: { label: "Selesai", cls: "bg-emerald-100 text-emerald-700" },
  PENDING_VALIDATION: { label: "Menunggu Validasi", cls: "bg-cyan-100 text-cyan-700" },
};

function statusInfo(status: string) {
  return stageMap[String(status || "").toUpperCase()] || { label: status || "-", cls: "bg-slate-100 text-slate-700" };
}

function money(value: any) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return "-";
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}

function sessionLabel(session: any) {
  return String(session?.session_name || session?.location || `Session ${session?.id || ""}`).trim();
}

function vaccineLabel(vaccine: any) {
  if (!vaccine) return "Vaksin";
  return `${vaccine.name || "Vaksin"}${vaccine.brand ? ` · ${vaccine.brand}` : ""}${vaccine.price ? ` · ${money(vaccine.price)}` : ""}`;
}

function emptyProductItem(): ProductItem {
  return {
    vaccineId: "",
    lotId: "",
    doseNumber: 1,
    priceCategory: "Harga Perusahaan",
    price: "",
    paymentMethod: "",
    paymentNote: "",
    itemNote: "",
    serviceMode: "HEALTHDAY",
    status: "WAITING",
    salesOptionId: null,
    saleMode: "NON_PACKAGE",
    packageDoseCount: 1,
    salesPriceSnapshot: null,
  };
}

function itemFromRegistrationItem(item: any): ProductItem {
  return {
    id: item?.id ? String(item.id) : undefined,
    vaccineId: item?.vaccine_id ? String(item.vaccine_id) : "",
    lotId: item?.lot_id ? String(item.lot_id) : "",
    doseNumber: Number(item?.dose_number || 1),
    priceCategory: item?.price_category || item?.vaccine?.price_category || "Harga Perusahaan",
    price: item?.price == null ? "" : String(item.price),
    paymentMethod: item?.payment_method || "",
    paymentNote: item?.payment_note || "",
    itemNote: item?.item_note || "",
    serviceMode: String(item?.service_mode || "HEALTHDAY").toUpperCase() === "BAZAR" ? "BAZAR" : "HEALTHDAY",
    status: item?.status || "WAITING",
    salesOptionId: Number(item?.sales_option_id || 0) || null,
    saleMode: String(item?.sale_mode || "NON_PACKAGE").toUpperCase() === "PACKAGE" ? "PACKAGE" : "NON_PACKAGE",
    packageDoseCount: Math.max(1, Number(item?.package_dose_count || 1)),
    salesPriceSnapshot: item?.sales_price_snapshot == null ? null : Number(item.sales_price_snapshot),
  };
}

export default function VaccinationRegisterPage() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [sources, setSources] = useState<any[]>([]);
  const [vaccines, setVaccines] = useState<any[]>([]);
  const [lots, setLots] = useState<any[]>([]);
  const [salesOffers, setSalesOffers] = useState<any[]>([]);
  const [registrations, setRegistrations] = useState<any[]>([]);

  const [message, setMessage] = useState("Import peserta corporate/vaksinasi lebih dulu. Nomor antrian dirilis saat peserta datang registrasi ulang.");
  const [error, setError] = useState("");
  const deepLinkEditHandled = useRef(false);
  const [importing, setImporting] = useState(false);
  const [releasingId, setReleasingId] = useState<number | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [cancellingTrackKey, setCancellingTrackKey] = useState("");

  const [form, setForm] = useState({
    sessionId: "",
    sourceId: "",
    vaccineId: "",
    lotId: "",
    participantName: "",
    employeeId: "",
    nik: "",
    email: "",
    phone: "",
    companyName: "",
    department: "",
    paymentPrice: "",
    paymentMethod: "",
    paymentNote: "",
    serviceMode: "HEALTHDAY",
    participantId: null as number | null,
    historyPersonId: null as number | null,
    masterCompanyKey: "",
    familyRole: "PARENT" as "PARENT" | "DEPENDENT",
    parentHistoryPersonId: null as number | null,
    parentName: "",
    parentEmployeeId: "",
    parentNik: "",
    parentEmail: "",
    moveFromRegistrationId: null as number | null,
    walkInSuggestedVaccineIds: [] as string[],
    walkInContextLabel: "",
  });

  const [edit, setEdit] = useState<{
    registration: any;
    items: ProductItem[];
    changeNote: string;
    familyRole: "" | "PARENT" | "DEPENDENT";
    historyPersonId: number | null;
    historyPersonName: string;
    parentHistoryPersonId: number | null;
    parentName: string;
    parentEmployeeId: string;
    parentNik: string;
    parentEmail: string;
  } | null>(null);
  const [editFamilyQuery, setEditFamilyQuery] = useState("");
  const [editFamilyResults, setEditFamilyResults] = useState<any[]>([]);
  const [editFamilySearching, setEditFamilySearching] = useState(false);
  const [savingEditFamily, setSavingEditFamily] = useState(false);
  const [selectedVaccineIds, setSelectedVaccineIds] = useState<string[]>([]);
  const [contextLocked, setContextLocked] = useState(false);
  const [sort, setSort] = useState<SortState>({ key: "queue", direction: "asc" });
  const [search, setSearch] = useState("");
  const [historyRegistration, setHistoryRegistration] = useState<any | null>(null);
  const [walkinModalOpen, setWalkinModalOpen] = useState(false);
  const [walkinModalStep, setWalkinModalStep] = useState<1 | 2>(1);
  const [parentQuery, setParentQuery] = useState("");
  const [parentResults, setParentResults] = useState<any[]>([]);
  const [parentSearching, setParentSearching] = useState(false);

  function openWalkinModal() {
    setWalkinModalStep(1);
    setWalkinModalOpen(true);
  }

  const selectedSession = sessions.find((session) => String(session.id) === String(form.sessionId));
  const healthdayBazarEnabled = String(selectedSession?.existing_queue_profile || "LEGACY").toUpperCase() === "HEALTHDAY_BAZAR";
  const internalQueueEnabled = selectedSession?.existing_flow_config?.queue !== false;
  const selectedSourceId = useMemo(() => form.sourceId || selectedSession?.source_id || "", [form.sourceId, selectedSession?.source_id]);

  useEffect(() => {
    if (
      !walkinModalOpen ||
      walkinModalStep !== 1 ||
      form.familyRole !== "DEPENDENT" ||
      !String(form.masterCompanyKey || "").trim()
    ) {
      setParentResults([]);
      setParentSearching(false);
      return;
    }

    const keyword = parentQuery.trim();
    if (keyword.length < 2) {
      setParentResults([]);
      setParentSearching(false);
      return;
    }

    let active = true;
    const timer = window.setTimeout(async () => {
      setParentSearching(true);
      try {
        const params = new URLSearchParams({
          company_key: String(form.masterCompanyKey),
          q: keyword,
        });
        const response = await fetch(
          `/api/vaccination/register-master-search?${params.toString()}`,
          { cache: "no-store" },
        );
        const payload = await response.json().catch(() => ({}));
        if (!active) return;
        if (!response.ok || payload?.ok === false) {
          setParentResults([]);
          return;
        }

        const rows = (Array.isArray(payload?.results) ? payload.results : [])
          .filter(
            (row: any) =>
              String(row?.participantType || "EMPLOYEE").toUpperCase() !== "DEPENDENT" &&
              Number(row?.historyPersonId || 0) > 0,
          )
          .slice(0, 20);
        setParentResults(rows);
      } finally {
        if (active) setParentSearching(false);
      }
    }, 280);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [
    walkinModalOpen,
    walkinModalStep,
    form.familyRole,
    form.masterCompanyKey,
    parentQuery,
  ]);

  useEffect(() => {
    if (!edit || !edit.familyRole) {
      setEditFamilyResults([]);
      setEditFamilySearching(false);
      return;
    }

    const keyword = editFamilyQuery.trim();
    if (keyword.length < 2) {
      setEditFamilyResults([]);
      setEditFamilySearching(false);
      return;
    }

    let active = true;
    const timer = window.setTimeout(async () => {
      setEditFamilySearching(true);
      try {
        const response = await fetch("/api/vaccination/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "family-search",
            registrationId: edit.registration.id,
            q: keyword,
          }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!active) return;

        if (!response.ok || payload?.ok === false) {
          setEditFamilyResults([]);
          return;
        }

        setEditFamilyResults(
          (Array.isArray(payload?.results) ? payload.results : []).slice(0, 20),
        );
      } finally {
        if (active) setEditFamilySearching(false);
      }
    }, 260);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [
    edit?.registration?.id,
    edit?.familyRole,
    editFamilyQuery,
  ]);

  const priceCategoryOptions = useMemo(() => {
    const values = new Set<string>(["Harga Perusahaan", "Harga Pribadi"]);
    for (const vaccine of vaccines) {
      const value = String(vaccine?.price_category || "").trim();
      if (value) values.add(value);
    }
    return Array.from(values);
  }, [vaccines]);

  const sessionVaccineRows = useMemo(() => {
    return Array.isArray(selectedSession?.session_vaccines) ? selectedSession.session_vaccines : [];
  }, [selectedSession]);

  const availableVaccines = useMemo(() => {
    if (!sessionVaccineRows.length) return vaccines;
    const byId = new Map<string, any>();
    for (const item of sessionVaccineRows) {
      const vaccine = item?.vaccine || vaccines.find((v) => String(v.id) === String(item.vaccine_id));
      if (vaccine?.id) byId.set(String(vaccine.id), vaccine);
    }
    return Array.from(byId.values());
  }, [sessionVaccineRows, vaccines]);

  const selectedVaccines = useMemo(() => {
    const selected = selectedVaccineIds.length ? selectedVaccineIds : (form.vaccineId ? [form.vaccineId] : []);
    return selected
      .map((id) => availableVaccines.find((vaccine) => String(vaccine.id) === String(id)) || vaccines.find((vaccine) => String(vaccine.id) === String(id)))
      .filter(Boolean);
  }, [selectedVaccineIds, form.vaccineId, availableVaccines, vaccines]);

  function isDoneStatus(status: any) {
    return ["ADMINISTERED", "DONE", "FINISHED"].includes(String(status || "").toUpperCase());
  }

  function saleOffer(vaccineId: any, mode: "PACKAGE" | "NON_PACKAGE") {
    return salesOffers.find(
      (offer: any) =>
        Number(offer?.vaccine_id || 0) === Number(vaccineId || 0) &&
        String(offer?.sale_mode || "NON_PACKAGE").toUpperCase() === mode &&
        offer?.active !== false &&
        Number(offer?.price || 0) > 0,
    ) || null;
  }

  function queueNumberValue(value: any) {
    const match = String(value || "").match(/(\d+)$/);
    return match ? Number(match[1]) : 999999999;
  }

  function serviceHasTrack(status: any, track: "A" | "B") {
    const value = String(status || "HEALTHDAY").toUpperCase();
    return track === "A"
      ? value === "HEALTHDAY" || value === "COMBINATION"
      : value === "BAZAR" || value === "COMBINATION";
  }

  function setSortKey(key: string) {
    setSort((current) => current.key === key ? { key, direction: current.direction === "asc" ? "desc" : "asc" } : { key, direction: "asc" });
  }

  function sortIcon(key: string) {
    if (sort.key !== key) return "↕";
    return sort.direction === "asc" ? "↑" : "↓";
  }

  function sortButton(label: string, key: string) {
    return (
      <button type="button" onClick={() => setSortKey(key)} className="inline-flex items-center gap-1 font-black uppercase hover:text-blue-700">
        <span>{label}</span>
        <span className="text-[11px] text-slate-400">{sortIcon(key)}</span>
      </button>
    );
  }

  const sortedRegistrations = useMemo(() => {
    const rows = [...registrations];
    const dir = sort.direction === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      let av: any;
      let bv: any;
      if (sort.key === "queue") { av = queueNumberValue(a.queue_number); bv = queueNumberValue(b.queue_number); }
      else if (sort.key === "bazarQueue") { av = queueNumberValue(a.bazar_queue_number); bv = queueNumberValue(b.bazar_queue_number); }
      else if (sort.key === "name") { av = a.participant_name || ""; bv = b.participant_name || ""; }
      else if (sort.key === "identity") { av = a.employee_id || a.mcu_id || ""; bv = b.employee_id || b.mcu_id || ""; }
      else if (sort.key === "product") { av = (a.items || []).map((i: any) => i?.vaccine?.name || "").join(" ") || a.vaccine?.name || ""; bv = (b.items || []).map((i: any) => i?.vaccine?.name || "").join(" ") || b.vaccine?.name || ""; }
      else if (sort.key === "status") { av = statusInfo(a.queue_status).label; bv = statusInfo(b.queue_status).label; }
      else if (sort.key === "note") { av = a.status_note || a.payment_note || ""; bv = b.status_note || b.payment_note || ""; }
      else { av = a.id || 0; bv = b.id || 0; }
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv), "id") * dir;
    });
    return rows;
  }, [registrations, sort]);


  const activeQueueView = healthdayBazarEnabled && form.serviceMode === "BAZAR" ? "BAZAR" : "HEALTHDAY";

  const queueReadyRegistrations = useMemo(() => {
    if (!healthdayBazarEnabled) return sortedRegistrations;
    return sortedRegistrations.filter((registration: any) =>
      activeQueueView === "BAZAR"
        ? Boolean(String(registration?.bazar_queue_number || "").trim())
        : Boolean(String(registration?.queue_number || "").trim()),
    );
  }, [sortedRegistrations, healthdayBazarEnabled, activeQueueView]);

  const visibleRegistrations = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return queueReadyRegistrations;
    return queueReadyRegistrations.filter((registration: any) => {
      const haystack = [
        registration.participant_name,
        registration.employee_id,
        registration.mcu_id,
        registration.nik,
        registration.email,
        registration.phone,
        ...(Array.isArray(registration.items) ? registration.items.map((item: any) => item?.vaccine?.name) : []),
      ].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(keyword);
    });
  }, [queueReadyRegistrations, search]);

  const productSummary = useMemo(() => {
    const map = new Map<string, { name: string; count: number }>();
    for (const registration of registrations) {
      const items = Array.isArray(registration.items) ? registration.items : [];
      for (const item of items) {
        const name = item?.vaccine?.name || "Produk";
        const key = String(item?.vaccine_id || name);
        const current = map.get(key) || { name, count: 0 };
        current.count += 1;
        map.set(key, current);
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, "id"));
  }, [registrations]);

  const summary = useMemo(() => {
    const stats = { total: registrations.length, current: "-", notArrived: 0, waiting: 0, doctor: 0, done: 0 };
    const activeQueue = registrations.find((r) => ["CALLED", "IN_PROGRESS"].includes(String(r.queue_status || "").toUpperCase())) || registrations.find((r) => String(r.queue_status || "").toUpperCase() === "WAITING");
    stats.current = activeQueue?.queue_number || "-";
    for (const r of registrations) {
      const status = String(r.queue_status || "").toUpperCase();
      if (!r.queue_number || ["IMPORTED", "REGISTERED"].includes(status)) stats.notArrived += 1;
      else if (["WAITING", "WAITING_WITH_NOTE"].includes(status)) stats.waiting += 1;
      else if (["CALLED", "IN_PROGRESS"].includes(status)) stats.doctor += 1;
      else if (["ADMINISTERED", "DONE"].includes(status)) stats.done += 1;
    }
    return stats;
  }, [registrations]);

  async function loadBase() {
    const [sessionJson, sourceJson, masterJson, pricingJson] = await Promise.all([
      fetch("/api/vaccination/sessions", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/sources?program=vaccination", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/vaccination/master", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/vaccination/pricing", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ ok: false, offers: [] })),
    ]);

    if (sessionJson.ok) {
      const loadedSessions = sessionJson.sessions || [];
      setSessions(loadedSessions);
      if (!form.sessionId && loadedSessions?.[0]?.id) {
        let saved: any = null;
        let requestedSessionId = "";
        let requestedSourceId = "";
        if (typeof window !== "undefined") {
          try { saved = JSON.parse(window.localStorage.getItem(LOCK_KEY) || "null"); } catch { saved = null; }
          const query = new URLSearchParams(window.location.search);
          requestedSessionId = query.get("session_id") || "";
          requestedSourceId = query.get("source_id") || "";
        }
        const requestedSession = requestedSessionId
          ? loadedSessions.find((session: any) => String(session.id) === String(requestedSessionId))
          : null;
        const savedSession = saved?.locked ? loadedSessions.find((session: any) => String(session.id) === String(saved.sessionId)) : null;
        const first = requestedSession || savedSession || loadedSessions[0];
        const usingSavedLock = Boolean(!requestedSession && saved?.locked && savedSession);
        const savedVaccineIds = Array.isArray(saved?.vaccineIds) ? saved.vaccineIds.map(String).filter(Boolean) : [];
        const defaultVaccineIds = usingSavedLock && savedVaccineIds.length
          ? savedVaccineIds
          : (first.session_vaccines || []).map((item: any) => String(item.vaccine_id)).filter(Boolean);
        const firstVaccineId = defaultVaccineIds[0] || (first.default_vaccine_id ? String(first.default_vaccine_id) : "");
        setContextLocked(usingSavedLock);
        setSelectedVaccineIds(defaultVaccineIds);
        setForm((prev) => ({
          ...prev,
          sessionId: String(first.id),
          sourceId: requestedSourceId || (usingSavedLock && saved.sourceId ? String(saved.sourceId) : (first.source_id ? String(first.source_id) : "")),
          vaccineId: firstVaccineId,
          lotId: usingSavedLock && saved.lotId ? String(saved.lotId) : (first.default_lot_id ? String(first.default_lot_id) : ""),
          companyName: usingSavedLock && saved.companyName ? String(saved.companyName) : (first.company_name || ""),
        }));
      }
    }

    if (sourceJson.ok) setSources(sourceJson.sources || []);
    if (masterJson.ok) {
      setVaccines((masterJson.vaccines || []).filter((v: any) => v.active !== false));
      setLots((masterJson.lots || []).filter((l: any) => l.active !== false));
      setSalesOffers(pricingJson?.ok ? pricingJson.offers || [] : []);
    }
  }

  async function loadRegistrations(sessionId = form.sessionId, sourceId = selectedSourceId) {
    if (!sessionId) return;
    const params = new URLSearchParams();
    params.set("session_id", sessionId);
    if (sourceId) params.set("source_id", String(sourceId));
    const json = await fetch(`/api/vaccination/register?${params.toString()}`, { cache: "no-store" }).then((r) => r.json());
    if (json.ok) setRegistrations(json.registrations || []);
    else setError(json.message || "Gagal memuat registrasi.");
  }

  async function cancelRegistrationTrack(registration: any, track: "A" | "B") {
    const number = track === "B" ? registration?.bazar_queue_number : registration?.queue_number;
    if (!String(number || "").trim()) return;
    const trackLabel = track === "B" ? "Bazar" : "Healthday";
    const confirmed = window.confirm(
      `Cancel antrean ${trackLabel} ${number} - ${registration?.participant_name || "peserta"}?\n\nHanya antrean ${trackLabel} yang dibatalkan. Antrean lainnya pada peserta Kombinasi tidak ikut berubah.`,
    );
    if (!confirmed) return;

    const key = `${registration?.id || ""}-${track}`;
    setCancellingTrackKey(key);
    setError("");
    try {
      const json = await fetch("/api/vaccination/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "cancel",
          sessionId: Number(registration?.session_id || form.sessionId),
          registrationId: Number(registration?.id || 0),
          track,
        }),
      }).then((r) => r.json());
      if (!json.ok) {
        setError(json.message || `Gagal cancel antrean ${trackLabel}.`);
        return;
      }
      setMessage(`Antrean ${trackLabel} ${number} berhasil dibatalkan.`);
      await loadRegistrations(form.sessionId, selectedSourceId);
    } catch (err: any) {
      setError(err?.message || `Gagal cancel antrean ${trackLabel}.`);
    } finally {
      setCancellingTrackKey("");
    }
  }

  function canCancelRegistrationTrack(registration: any, track: "A" | "B") {
    const number = track === "B" ? registration?.bazar_queue_number : registration?.queue_number;
    const status = String(track === "B" ? registration?.bazar_queue_status : registration?.queue_status || "").toUpperCase();
    return Boolean(String(number || "").trim()) && !["ADMINISTERED", "DONE", "FINISHED", "CANCELLED"].includes(status);
  }

  function lotOptions(vaccineId: string) {
    const sessionLots = sessionVaccineRows
      .filter((item: any) => String(item.vaccine_id) === String(vaccineId) && item.lot_id)
      .map((item: any) => item.lot || lots.find((lot) => String(lot.id) === String(item.lot_id)))
      .filter(Boolean);
    if (sessionLots.length) {
      const byId = new Map<string, any>();
      for (const lot of sessionLots) byId.set(String(lot.id), lot);
      return Array.from(byId.values());
    }
    return lots.filter((lot) => String(lot.vaccine_id) === String(vaccineId));
  }

  function firstLotForVaccine(vaccineId: string) {
    const sessionRow = sessionVaccineRows.find((item: any) => String(item.vaccine_id) === String(vaccineId) && item.lot_id);
    const sessionLot = sessionRow?.lot || lots.find((lot) => String(lot.id) === String(sessionRow?.lot_id));
    if (sessionLot?.id) return sessionLot;
    return lots.find((lot) => String(lot.vaccine_id) === String(vaccineId));
  }

  function applyVaccineSelection(ids: string[]) {
    const allowed = new Set(availableVaccines.map((vaccine) => String(vaccine.id)));
    const unique: string[] = Array.from(new Set<string>(ids.map(String).filter((id): id is string => Boolean(id && (!allowed.size || allowed.has(id))))));
    setSelectedVaccineIds(unique);
    const first = unique[0] || "";
    const vaccine = vaccines.find((v) => String(v.id) === String(first));
    const firstLot = first ? firstLotForVaccine(first) : null;
    setForm((prev) => ({
      ...prev,
      vaccineId: first,
      lotId: firstLot?.id ? String(firstLot.id) : "",
      paymentPrice: vaccine?.price == null ? prev.paymentPrice : String(vaccine.price),
    }));
  }

  function handleVaccinePick(vaccineId: string) {
    applyVaccineSelection(vaccineId ? [vaccineId] : []);
  }

  function toggleVaccineSelection(vaccineId: string) {
    const set = new Set<string>(selectedVaccineIds.length ? selectedVaccineIds : (form.vaccineId ? [String(form.vaccineId)] : []));
    if (set.has(String(vaccineId))) set.delete(String(vaccineId));
    else set.add(String(vaccineId));
    applyVaccineSelection(Array.from(set));
  }

  function buildSelectedItems() {
    const ids = selectedVaccineIds.length ? selectedVaccineIds : (form.vaccineId ? [form.vaccineId] : []);
    const uniqueIds: string[] = Array.from(new Set<string>(ids.map(String).filter((id): id is string => Boolean(id))));
    return uniqueIds.map((vaccineId: string) => {
      const vaccine = vaccines.find((v) => String(v.id) === String(vaccineId));
      const primaryLot = String(form.vaccineId) === String(vaccineId) && form.lotId ? lots.find((lot) => String(lot.id) === String(form.lotId)) : null;
      const lot = primaryLot || firstLotForVaccine(vaccineId);
      return {
        vaccineId,
        lotId: lot?.id ? String(lot.id) : "",
        doseNumber: 1,
        priceCategory: vaccine?.price_category || "Harga Perusahaan",
        price: form.paymentPrice || (vaccine?.price == null ? "" : String(vaccine.price)),
        paymentMethod: form.paymentMethod,
        paymentNote: form.paymentNote,
        itemNote: form.paymentNote,
        serviceMode: healthdayBazarEnabled && form.serviceMode === "BAZAR" ? "BAZAR" : "HEALTHDAY",
        status: "WAITING",
      };
    });
  }

  function saveContextLock(nextLocked: boolean) {
    setContextLocked(nextLocked);
    if (typeof window === "undefined") return;
    if (!nextLocked) {
      window.localStorage.removeItem(LOCK_KEY);
      return;
    }
    window.localStorage.setItem(LOCK_KEY, JSON.stringify({
      locked: true,
      sessionId: form.sessionId,
      sourceId: selectedSourceId,
      vaccineIds: selectedVaccineIds.length ? selectedVaccineIds : (form.vaccineId ? [form.vaccineId] : []),
      lotId: form.lotId,
      companyName: form.companyName,
    }));
  }

  function updateEditItem(index: number, patch: Partial<ProductItem>) {
    setEdit((current) => {
      if (!current) return current;
      const items = current.items.map((item, idx) => {
        if (idx !== index) return item;
        if (isDoneStatus(item.status)) return item;
        const next = { ...item, ...patch };
        if (patch.vaccineId !== undefined) {
          const vaccine = vaccines.find((v) => String(v.id) === String(patch.vaccineId));
          const firstLot = lots.find((lot) => String(lot.vaccine_id) === String(patch.vaccineId));
          next.lotId = firstLot?.id ? String(firstLot.id) : "";
          next.price = vaccine?.price == null ? next.price : String(vaccine.price);
          next.priceCategory = vaccine?.price_category || next.priceCategory || "Harga Perusahaan";
          next.saleMode = "NON_PACKAGE";
          const nonPackage = saleOffer(patch.vaccineId, "NON_PACKAGE");
          next.salesOptionId = Number(nonPackage?.id || 0) || null;
          next.packageDoseCount = 1;
          next.salesPriceSnapshot = nonPackage?.price == null ? null : Number(nonPackage.price);
        }
        if (patch.priceCategory !== undefined) {
          const vaccine = vaccines.find((v) => String(v.id) === String(next.vaccineId));
          if (vaccine?.price_category === patch.priceCategory && vaccine?.price != null) next.price = String(vaccine.price);
        }
        if (patch.serviceMode === "BAZAR") {
          const nonPackage = saleOffer(next.vaccineId, "NON_PACKAGE");
          const vaccine = vaccines.find((v) => String(v.id) === String(next.vaccineId));
          const selectedPrice = nonPackage?.price ?? vaccine?.price;
          if (selectedPrice != null) next.price = String(selectedPrice);
          next.saleMode = "NON_PACKAGE";
          next.salesOptionId = Number(nonPackage?.id || 0) || null;
          next.packageDoseCount = 1;
          next.salesPriceSnapshot = selectedPrice == null ? null : Number(selectedPrice);
        }
        if (patch.saleMode !== undefined) {
          const mode = patch.saleMode === "PACKAGE" ? "PACKAGE" : "NON_PACKAGE";
          const offer = saleOffer(next.vaccineId, mode);
          const vaccine = vaccines.find((v) => String(v.id) === String(next.vaccineId));
          const selectedPrice = offer?.price ?? (mode === "NON_PACKAGE" ? vaccine?.price : null);
          next.saleMode = mode;
          next.salesOptionId = Number(offer?.id || 0) || null;
          next.packageDoseCount = Math.max(1, Number(offer?.package_dose_count || 1));
          next.salesPriceSnapshot = selectedPrice == null ? null : Number(selectedPrice);
          if (selectedPrice != null) next.price = String(selectedPrice);
        }
        return next;
      });
      return { ...current, items };
    });
  }

  function addEditItem() {
    setEdit((current) => {
      if (!current) return current;
      const next = emptyProductItem();
      if (healthdayBazarEnabled && String(current.registration?.patient_service_status || "").toUpperCase() === "HEALTHDAY") {
        next.serviceMode = "BAZAR";
      }
      return { ...current, items: [...current.items, next] };
    });
  }

  function removeEditItem(index: number) {
    setEdit((current) => {
      if (!current) return current;
      const target = current.items[index];
      if (isDoneStatus(target?.status)) return current;
      return { ...current, items: current.items.filter((_, idx) => idx !== index) };
    });
  }

  function openEditProducts(registration: any) {
    const items = Array.isArray(registration.items) && registration.items.length
      ? registration.items.map(itemFromRegistrationItem)
      : [{ ...emptyProductItem(), vaccineId: registration.vaccine_id ? String(registration.vaccine_id) : "", price: registration.payment_price == null ? "" : String(registration.payment_price), paymentMethod: registration.payment_method || "", paymentNote: registration.payment_note || "" }];

    setEditFamilyQuery("");
    setEditFamilyResults([]);
    setEdit({
      registration,
      items,
      changeNote: registration.status_note || "",
      familyRole:
        String(registration.family_role || "").toUpperCase() === "DEPENDENT"
          ? "DEPENDENT"
          : String(registration.family_role || "").toUpperCase() === "PARENT"
            ? "PARENT"
            : "",
      historyPersonId:
        Number(registration.history_person_id || 0) || null,
      historyPersonName: "",
      parentHistoryPersonId:
        Number(registration.parent_history_person_id || 0) || null,
      parentName: "",
      parentEmployeeId: "",
      parentNik: "",
      parentEmail: "",
    });

    void loadEditFamilyContext(registration.id);
    setTimeout(() => document.getElementById("edit-produk-vaksin")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  async function loadEditFamilyContext(registrationId: number) {
    try {
      const response = await fetch("/api/vaccination/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "family-context",
          registrationId,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) return;

      setEdit((current) => {
        if (!current || Number(current.registration?.id) !== Number(registrationId)) {
          return current;
        }

        return {
          ...current,
          familyRole:
            payload.familyRole === "DEPENDENT"
              ? "DEPENDENT"
              : payload.familyRole === "PARENT"
                ? "PARENT"
                : current.familyRole,
          historyPersonId:
            Number(payload?.person?.id || current.historyPersonId || 0) || null,
          historyPersonName:
            String(payload?.person?.name || current.historyPersonName || "").trim(),
          parentHistoryPersonId:
            Number(payload?.parent?.id || current.parentHistoryPersonId || 0) || null,
          parentName:
            String(payload?.parent?.name || current.parentName || "").trim(),
          parentEmployeeId:
            String(payload?.parent?.employeeId || current.parentEmployeeId || "").trim(),
          parentNik:
            String(payload?.parent?.nik || current.parentNik || "").trim(),
          parentEmail:
            String(payload?.parent?.email || current.parentEmail || "").trim(),
        };
      });
    } catch {
      // Context enhancement is best-effort; edit modal still works from registration data.
    }
  }

  async function saveEditFamily() {
    if (!edit?.familyRole) {
      setError("Pilih Parent atau Child / Family terlebih dahulu.");
      return;
    }

    if (edit.familyRole === "DEPENDENT" && !edit.parentHistoryPersonId) {
      setError("Untuk Child / Family, pilih Parent existing terlebih dahulu.");
      return;
    }

    setSavingEditFamily(true);
    setError("");
    try {
      const response = await fetch("/api/vaccination/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update-family",
          registrationId: edit.registration.id,
          familyRole: edit.familyRole,
          historyPersonId: edit.historyPersonId,
          parentHistoryPersonId:
            edit.familyRole === "DEPENDENT"
              ? edit.parentHistoryPersonId
              : null,
        }),
      });
      const json = await response.json().catch(() => ({}));

      if (!response.ok || !json.ok) {
        setError(json.message || "Gagal menyimpan relasi Parent / Child-Family.");
        return;
      }

      setMessage(json.message || "Relasi peserta berhasil diperbarui.");
      setEdit((current) => {
        if (!current) return current;
        return {
          ...current,
          registration: {
            ...current.registration,
            family_role: json?.registration?.family_role ?? current.familyRole,
            history_person_id:
              json?.registration?.history_person_id ?? current.historyPersonId,
            parent_history_person_id:
              json?.registration?.parent_history_person_id ??
              (current.familyRole === "DEPENDENT"
                ? current.parentHistoryPersonId
                : null),
          },
          historyPersonId:
            Number(json?.registration?.history_person_id || current.historyPersonId || 0) ||
            null,
          parentHistoryPersonId:
            Number(
              json?.registration?.parent_history_person_id ||
                (current.familyRole === "DEPENDENT"
                  ? current.parentHistoryPersonId
                  : 0),
            ) || null,
          parentName:
            String(json?.parent?.name || current.parentName || "").trim(),
          parentEmployeeId:
            String(json?.parent?.employeeId || current.parentEmployeeId || "").trim(),
          parentNik:
            String(json?.parent?.nik || current.parentNik || "").trim(),
          parentEmail:
            String(json?.parent?.email || current.parentEmail || "").trim(),
        };
      });
      await loadRegistrations(form.sessionId, selectedSourceId);
    } finally {
      setSavingEditFamily(false);
    }
  }

  async function saveEditProducts() {
    if (!edit) return;
    setSavingEdit(true);
    setError("");
    try {
      const json = await fetch("/api/vaccination/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update-products", registrationId: edit.registration.id, items: edit.items, changeNote: edit.changeNote }),
      }).then((r) => r.json());
      if (!json.ok) { setError(json.message || "Gagal mengubah produk."); return; }
      setMessage(json.message || "Produk berhasil diubah.");
      setEdit(null);
      await loadRegistrations(form.sessionId, selectedSourceId);
    } finally {
      setSavingEdit(false);
    }
  }

  function exportStage(status: string) {
    const params = new URLSearchParams();
    params.set("format", "csv");
    params.set("status", status);
    if (form.sessionId) params.set("session_id", form.sessionId);
    if (selectedSourceId) params.set("source_id", String(selectedSourceId));
    window.open(`/api/vaccination/dashboard?${params.toString()}`, "_blank");
  }

  async function importCorporate() {
    if (!form.sessionId) { setError("Pilih session terlebih dahulu."); return; }
    const sourceId = selectedSourceId;
    if (!sourceId) { setError("Session belum terhubung ke database corporate/vaksinasi. Pilih database corporate/vaksinasi dulu."); return; }
    setImporting(true);
    setError("");
    setMessage("Mengimport peserta dari database corporate/vaksinasi...");
    try {
      const json = await fetch("/api/vaccination/import-corporate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: Number(form.sessionId), sourceId: Number(sourceId), defaultVaccineId: Number(form.vaccineId || 0), defaultLotId: Number(form.lotId || 0), defaultVaccineIds: selectedVaccineIds.map((id) => Number(id)).filter(Boolean) }),
      }).then((r) => r.json());
      if (!json.ok) { setError(json.message || "Import database gagal."); return; }
      setMessage(json.message || "Import database berhasil. Nomor antrian belum dirilis.");
      await loadRegistrations(form.sessionId, String(sourceId));
    } finally {
      setImporting(false);
    }
  }

  async function releaseQueueV147Original(registration: any) {
    setReleasingId(registration.id);
    setError("");
    try {
      const json = await fetch("/api/vaccination/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "release-queue", registrationId: registration.id }),
      }).then((r) => r.json());
      if (!json.ok) { setError(json.message || "Gagal merilis nomor antrian."); return; }
      setMessage(json.message || "Nomor antrian berhasil dirilis.");
      await loadRegistrations(form.sessionId, selectedSourceId);
    } finally {
      setReleasingId(null);
    }
  }

  // VACCINATION_QUEUE_TICKET_PRINT_V147_1
// VACCINATION_QUEUE_TICKET_POPUP_V147_5
  async function releaseQueue(...args: any[]) {
    const rawRegistration = args[0];
    const registrationId = Number(rawRegistration?.id ?? rawRegistration ?? 0);

    // VACCINATION_QUEUE_TICKET_POPUP_V147_5
    // Buka blank popup langsung dari click event agar browser tidak menunda/menggabungkan window.
    const serviceStatus = String(rawRegistration?.patient_service_status || "HEALTHDAY").toUpperCase();
    const shouldOpenLegacyTicket = !healthdayBazarEnabled || serviceHasTrack(serviceStatus, "A");
    const ticketWindow = registrationId && shouldOpenLegacyTicket
      ? window.open("about:blank", "_blank", "width=520,height=720")
      : null;

    if (ticketWindow) {
      ticketWindow.document.open();
      ticketWindow.document.write(
        "<!doctype html><html><head><title>Menyiapkan Tiket Antrian</title></head><body style='font-family:Arial,sans-serif;padding:20px'><b>Menyiapkan tiket antrian...</b><br><span style='font-size:12px'>Nomor antrian sedang dirilis.</span></body></html>",
      );
      ticketWindow.document.close();
      ticketWindow.focus();
    } else if (registrationId) {
      console.warn("Popup tiket antrian diblokir browser.");
    }

    try {
      await (releaseQueueV147Original as any)(...args);

      if (!registrationId) return;

      const ticketUrl = `/vaccination/queue-ticket/${registrationId}?autoprint=1`;

      if (ticketWindow && !ticketWindow.closed) {
        ticketWindow.location.replace(ticketUrl);
        ticketWindow.focus();
      } else if (shouldOpenLegacyTicket) {
        window.open(ticketUrl, "_blank");
      }
    } catch (error) {
      if (ticketWindow && !ticketWindow.closed) {
        ticketWindow.document.open();
        ticketWindow.document.write(
          "<!doctype html><html><head><title>Rilis Antrian Gagal</title></head><body style='font-family:Arial,sans-serif;padding:20px;color:#b91c1c'><b>Rilis antrian gagal.</b><br><span style='font-size:12px'>Tutup window ini dan coba kembali.</span></body></html>",
        );
        ticketWindow.document.close();
      }
      throw error;
    }
  }


  async function submit() {
    setError("");
    const json = await fetch("/api/vaccination/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, sourceId: selectedSourceId, items: buildSelectedItems() }),
    }).then((r) => r.json());
    if (!json.ok) { setError(json.message || "Registrasi ulang gagal."); return; }
    setMessage(json.message);
    setForm((prev) => ({
      ...prev,
      participantName: "",
      employeeId: "",
      nik: "",
      email: "",
      phone: "",
      department: "",
      paymentPrice: "",
      paymentMethod: "",
      paymentNote: "",
      familyRole: "PARENT",
      historyPersonId: null,
      parentHistoryPersonId: null,
      parentName: "",
      parentEmployeeId: "",
      parentNik: "",
      parentEmail: "",
    }));
    await loadRegistrations(form.sessionId, selectedSourceId);
  }

  useEffect(() => { loadBase(); }, []);

  useEffect(() => {
    if (!selectedSession || contextLocked) return;
    const sessionVaccineIds = (selectedSession.session_vaccines || []).map((item: any) => String(item.vaccine_id)).filter(Boolean);
    const nextVaccineId = selectedSession.default_vaccine_id ? String(selectedSession.default_vaccine_id) : (sessionVaccineIds[0] || form.vaccineId);
    setSelectedVaccineIds(sessionVaccineIds.length ? sessionVaccineIds : (nextVaccineId ? [nextVaccineId] : []));
    setForm((prev) => ({
      ...prev,
      sourceId: selectedSession.source_id ? String(selectedSession.source_id) : prev.sourceId,
      vaccineId: nextVaccineId,
      lotId: selectedSession.default_lot_id ? String(selectedSession.default_lot_id) : (selectedSession.session_vaccines?.[0]?.lot_id ? String(selectedSession.session_vaccines[0].lot_id) : prev.lotId),
      companyName: selectedSession.company_name || prev.companyName,
      serviceMode: "HEALTHDAY",
      paymentMethod: "",
    }));
  }, [selectedSession?.id, contextLocked]);

  useEffect(() => {
    if (!contextLocked || typeof window === "undefined") return;
    window.localStorage.setItem(LOCK_KEY, JSON.stringify({
      locked: true,
      sessionId: form.sessionId,
      sourceId: selectedSourceId,
      vaccineIds: selectedVaccineIds.length ? selectedVaccineIds : (form.vaccineId ? [form.vaccineId] : []),
      lotId: form.lotId,
      companyName: form.companyName,
    }));
  }, [contextLocked, form.sessionId, selectedSourceId, selectedVaccineIds, form.vaccineId, form.lotId, form.companyName]);

  useEffect(() => { loadRegistrations(form.sessionId, selectedSourceId); }, [form.sessionId, selectedSourceId]);

  useEffect(() => {
    if (deepLinkEditHandled.current || typeof window === "undefined" || !registrations.length) return;
    const params = new URLSearchParams(window.location.search);
    const editRegistrationId = Number(params.get("edit_registration_id") || 0);
    if (!editRegistrationId) return;
    const target = registrations.find((row: any) => Number(row.id) === editRegistrationId);
    if (!target) return;
    deepLinkEditHandled.current = true;
    openEditProducts(target);
  }, [registrations]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const previousOverflow = document.body.style.overflow;
    if (edit) document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [edit]);

  return (
    <main className="p-6">
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Registrasi Vaksin</h1>
            <p className="mt-2 text-sm text-slate-600">Dashboard antrian registrasi, edit produk layanan, harga/payment note, dan export per stage.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href="/vaccination/history" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-800 hover:bg-emerald-100">History Layanan</a>
            <a href="/vaccination" className="rounded-xl border px-4 py-2 text-sm font-bold hover:bg-slate-50">☰ Menu Vaksinasi</a>
          </div>
        </div>

        {error ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{error}</div> : null}
        {message ? <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800">{message}</div> : null}

        <section className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          {[{ label: "Jumlah Peserta", value: summary.total }, { label: "Nomor Antrian", value: summary.current }, { label: "Belum Datang", value: summary.notArrived }, { label: "Menunggu", value: summary.waiting }, { label: "Dalam Tindakan", value: summary.doctor }, { label: "Selesai", value: summary.done }].map((card) => (
            <div key={card.label} className="rounded-2xl border bg-slate-50 p-4">
              <div className="text-xs font-black uppercase text-slate-500">{card.label}</div>
              <div className="mt-2 text-2xl font-black text-slate-900">{card.value}</div>
            </div>
          ))}
        </section>

        {productSummary.length ? (
          <section className="mt-4 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            {productSummary.map((item) => (
              <div key={item.name} className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
                <div className="text-xs font-black uppercase text-blue-700">{item.name}</div>
                <div className="mt-2 text-2xl font-black text-blue-900">{item.count}</div>
                <div className="text-xs text-blue-700">produk terdaftar</div>
              </div>
            ))}
          </section>
        ) : null}

        <section className="mt-6 rounded-2xl border bg-slate-50 p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <h2 className="font-bold">1. Pilih Session & Database</h2>
            <button
              type="button"
              onClick={() => saveContextLock(!contextLocked)}
              className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-black ${contextLocked ? "border-amber-200 bg-amber-50 text-amber-800" : "bg-white text-slate-700 hover:bg-slate-50"}`}
              title={contextLocked ? "Klik untuk membuka kunci pilihan" : "Klik untuk mengunci pilihan session, database, dan vaksin"}
            >
              <span>{contextLocked ? "🔒" : "🔓"}</span>
              <span>{contextLocked ? "Pilihan Terkunci" : "Kunci Pilihan"}</span>
            </button>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <select disabled={contextLocked} className="rounded-xl border px-3 py-2.5 disabled:bg-slate-100" value={form.sessionId} onChange={(e) => setForm({ ...form, sessionId: e.target.value })}>
              <option value="">Pilih session</option>
              {sessions.map((session) => <option key={session.id} value={session.id}>{sessionLabel(session)}</option>)}
            </select>
            <select disabled={contextLocked} className="rounded-xl border px-3 py-2.5 disabled:bg-slate-100" value={selectedSourceId} onChange={(e) => setForm({ ...form, sourceId: e.target.value })}>
              <option value="">Pilih database corporate/vaksinasi</option>
              {sources.map((source) => <option key={source.id} value={source.id}>{source.name}{source.institution_name ? ` · ${source.institution_name}` : ""}</option>)}
            </select>
            <div className={`rounded-xl border bg-white p-3 ${contextLocked ? "bg-slate-100" : ""}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-xs font-black uppercase text-slate-500">Vaksin default / walk-in</div>
                  <div className="mt-1 text-sm font-bold text-slate-900">{selectedVaccines.length ? `${selectedVaccines.length} vaksin dipilih` : "Belum pilih vaksin"}</div>
                </div>
                <div className="flex gap-1">
                  <button type="button" disabled={contextLocked} onClick={() => applyVaccineSelection(availableVaccines.map((v) => String(v.id)))} className="rounded-lg border px-2 py-1 text-[11px] font-bold disabled:opacity-40">Semua</button>
                  <button type="button" disabled={contextLocked} onClick={() => applyVaccineSelection([])} className="rounded-lg border px-2 py-1 text-[11px] font-bold disabled:opacity-40">Clear</button>
                </div>
              </div>
              <div className="mt-3 max-h-32 space-y-1 overflow-auto rounded-xl border bg-slate-50 p-2">
                {availableVaccines.map((vaccine) => {
                  const checked = selectedVaccineIds.includes(String(vaccine.id)) || (!selectedVaccineIds.length && String(form.vaccineId) === String(vaccine.id));
                  return (
                    <label key={vaccine.id} className="flex cursor-pointer items-center gap-2 rounded-lg bg-white px-2 py-1 text-xs font-bold text-slate-700 hover:bg-blue-50">
                      <input disabled={contextLocked} type="checkbox" checked={checked} onChange={() => toggleVaccineSelection(String(vaccine.id))} />
                      <span>{vaccineLabel(vaccine)}</span>
                    </label>
                  );
                })}
                {!availableVaccines.length ? <div className="px-2 py-1 text-xs font-semibold text-slate-500">Belum ada vaksin pada session ini.</div> : null}
              </div>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" onClick={importCorporate} disabled={importing || !form.sessionId || !selectedSourceId} className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60">{importing ? "Importing..." : "Import Peserta dari Database"}</button>
            <a href="/vaccination/session" className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50">Setup Session</a>
          </div>
        </section>

        <section className="mt-6 rounded-2xl border bg-slate-50 p-5">
          <h2 className="text-2xl font-black">2. Registrasi Ulang Manual / Walk-in</h2>
          <p className="mt-1 text-sm text-slate-500">Pilih peserta dari lokasi saat ini atau cek peserta walk-in dari database / history. Setelah itu lengkapi data dan layanan sampai nomor antrean tercetak.</p>

          <div className="mt-4 space-y-4">
            {healthdayBazarEnabled ? (
              <div className="rounded-2xl border border-violet-200 bg-white p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="text-xs font-black uppercase tracking-wide text-violet-700">Jenis Layanan / Tampilan Antrean</div>
                    <div className="mt-1 text-sm font-semibold text-slate-600">
                      Pilihan ini mengatur registrasi berikutnya sekaligus tabel antrean yang tampil di bawah.
                    </div>
                  </div>
                  <div className="grid min-w-[320px] grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setForm((prev: any) => ({
                          ...(prev || {}),
                          serviceMode: "HEALTHDAY",
                          paymentMethod: "",
                        }))
                      }
                      className={`rounded-xl border px-4 py-3 text-sm font-black ${
                        activeQueueView === "HEALTHDAY"
                          ? "border-blue-500 bg-blue-600 text-white shadow-sm"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-blue-50"
                      }`}
                    >
                      Healthday
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setForm((prev: any) => ({
                          ...(prev || {}),
                          serviceMode: "BAZAR",
                          paymentMethod: "",
                        }))
                      }
                      className={`rounded-xl border px-4 py-3 text-sm font-black ${
                        activeQueueView === "BAZAR"
                          ? "border-violet-500 bg-violet-600 text-white shadow-sm"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-violet-50"
                      }`}
                    >
                      Bazar
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            <VaccinationParticipantMasterSearch
              form={form}
              setForm={setForm}
              session={selectedSession}
              sessionRegistrations={registrations}
              onParticipantReady={openWalkinModal}
            />

            <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-600">
              Setelah peserta dipilih, seluruh proses Detail Peserta → Layanan → Rilis Nomor Antrian berjalan di pop-up. Halaman ini tetap di posisi yang sama.
            </div>
          </div>

          {/* V153.1.1: submit manual digantikan controller produk + auto print */}
        </section>


        {walkinModalOpen ? (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setWalkinModalOpen(false);
            }}
          >
            <div className="flex max-h-[94vh] w-full max-w-7xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b bg-slate-50 px-6 py-4">
                <div>
                  <div className="text-xs font-black uppercase tracking-wide text-blue-700">Registrasi Ulang / Walk-in</div>
                  <h3 className="mt-1 text-2xl font-black text-slate-900">{form.participantName || "Peserta"}</h3>
                  <div className="mt-1 flex flex-wrap gap-2 text-xs font-semibold text-slate-500">
                    {form.employeeId ? <span>ID {form.employeeId}</span> : null}
                    {form.walkInContextLabel ? <span>· {form.walkInContextLabel}</span> : null}
                    <span>· {selectedSession?.session_name || selectedSession?.location || "Session"}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setWalkinModalStep(1)}
                    className={`rounded-xl px-3 py-2 text-xs font-black ${walkinModalStep === 1 ? "bg-blue-600 text-white" : "border bg-white text-slate-700"}`}
                  >
                    1 · Data Peserta
                  </button>
                  <button
                    type="button"
                    onClick={() => setWalkinModalStep(2)}
                    className={`rounded-xl px-3 py-2 text-xs font-black ${walkinModalStep === 2 ? "bg-emerald-600 text-white" : "border bg-white text-slate-700"}`}
                  >
                    2 · Layanan & Rilis
                  </button>
                  <button
                    type="button"
                    onClick={() => setWalkinModalOpen(false)}
                    className="rounded-xl border bg-white px-4 py-2 text-xs font-black text-slate-700 hover:bg-slate-100"
                  >
                    Tutup
                  </button>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-6">
                {walkinModalStep === 1 ? (
                  <div className="space-y-5">
                    <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-black text-slate-900">Konfirmasi / Lengkapi Data Peserta</div>
                          <div className="mt-1 text-xs font-semibold text-slate-500">
                            Step ini khusus identitas peserta. Lot, harga, payment, dan detail layanan diisi pada Step 2.
                          </div>
                        </div>
                        {form.walkInContextLabel ? (
                          <span className="rounded-full bg-blue-100 px-3 py-1 text-[11px] font-black text-blue-700">
                            {form.walkInContextLabel}
                          </span>
                        ) : null}
                      </div>

                      <div className="mb-4 rounded-2xl border border-violet-200 bg-violet-50 p-4">
                        <div className="text-xs font-black uppercase tracking-wide text-violet-700">
                          Tipe Peserta
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setForm((prev) => ({
                                ...prev,
                                familyRole: "PARENT",
                                parentHistoryPersonId: null,
                                parentName: "",
                                parentEmployeeId: "",
                                parentNik: "",
                                parentEmail: "",
                              }));
                              setParentQuery("");
                              setParentResults([]);
                            }}
                            className={`rounded-xl px-4 py-3 text-sm font-black ${
                              form.familyRole === "PARENT"
                                ? "bg-violet-600 text-white"
                                : "border border-violet-200 bg-white text-violet-800"
                            }`}
                          >
                            Parent
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setForm((prev) => ({ ...prev, familyRole: "DEPENDENT" }))
                            }
                            className={`rounded-xl px-4 py-3 text-sm font-black ${
                              form.familyRole === "DEPENDENT"
                                ? "bg-violet-600 text-white"
                                : "border border-violet-200 bg-white text-violet-800"
                            }`}
                          >
                            Child / Family
                          </button>
                        </div>
                        <div className="mt-2 text-[11px] font-semibold leading-5 text-violet-800">
                          NIP yang sama tidak otomatis dianggap satu keluarga. Untuk Child / Family, pilih parent existing agar relasinya terkunci dengan benar.
                        </div>

                        {form.familyRole === "DEPENDENT" ? (
                          <div className="mt-4">
                            {form.parentHistoryPersonId ? (
                              <div className="flex flex-col gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                  <div className="text-xs font-black uppercase text-emerald-700">
                                    Parent Terpilih
                                  </div>
                                  <div className="mt-1 text-sm font-black text-emerald-950">
                                    {form.parentName || "-"}
                                  </div>
                                  <div className="mt-1 text-xs font-semibold text-emerald-800">
                                    {[form.parentEmployeeId, form.parentNik, form.parentEmail]
                                      .filter(Boolean)
                                      .join(" · ") || "Identitas parent tersimpan di History"}
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setForm((prev) => ({
                                      ...prev,
                                      parentHistoryPersonId: null,
                                      parentName: "",
                                      parentEmployeeId: "",
                                      parentNik: "",
                                      parentEmail: "",
                                    }));
                                    setParentQuery("");
                                  }}
                                  className="rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs font-black text-emerald-800"
                                >
                                  Ganti Parent
                                </button>
                              </div>
                            ) : (
                              <>
                                <label className="block text-xs font-black text-violet-900">
                                  Cari Parent Existing
                                  <input
                                    value={parentQuery}
                                    onChange={(e) => setParentQuery(e.target.value)}
                                    placeholder="Cari nama / BINUSIAN ID / NIK / email parent..."
                                    className="mt-1 block w-full rounded-xl border border-violet-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-violet-400"
                                  />
                                </label>

                                {parentSearching ? (
                                  <div className="mt-2 rounded-xl border bg-white px-3 py-2 text-xs font-bold text-slate-500">
                                    Mencari parent...
                                  </div>
                                ) : null}

                                {!parentSearching && parentResults.length ? (
                                  <div className="mt-2 max-h-52 overflow-auto rounded-xl border border-violet-200 bg-white">
                                    {parentResults.map((row: any) => (
                                      <button
                                        type="button"
                                        key={`parent-${row.historyPersonId}`}
                                        onClick={() => {
                                          setForm((prev) => ({
                                            ...prev,
                                            parentHistoryPersonId:
                                              Number(row.historyPersonId || 0) || null,
                                            parentName: String(row.name || "").trim(),
                                            parentEmployeeId: String(row.employeeId || "").trim(),
                                            parentNik: String(row.nik || "").trim(),
                                            parentEmail: String(row.email || "").trim(),
                                          }));
                                          setParentQuery("");
                                          setParentResults([]);
                                        }}
                                        className="flex w-full items-start justify-between gap-3 border-b border-slate-100 px-3 py-3 text-left last:border-b-0 hover:bg-violet-50"
                                      >
                                        <div>
                                          <div className="text-sm font-black text-slate-900">
                                            {row.name || "-"}
                                          </div>
                                          <div className="mt-1 text-[11px] font-semibold text-slate-500">
                                            {[row.employeeId, row.nik, row.email]
                                              .filter(Boolean)
                                              .join(" · ") || "History Company"}
                                          </div>
                                        </div>
                                        <span className="rounded-full bg-violet-100 px-2 py-1 text-[10px] font-black text-violet-700">
                                          Parent
                                        </span>
                                      </button>
                                    ))}
                                  </div>
                                ) : null}

                                {!parentSearching &&
                                parentQuery.trim().length >= 2 &&
                                !parentResults.length ? (
                                  <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
                                    Parent existing belum ditemukan di History Company. Pilih parent yang sudah terdaftar agar relasi tidak salah.
                                  </div>
                                ) : null}
                              </>
                            )}
                          </div>
                        ) : null}
                      </div>

                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        <input className="rounded-xl border px-3 py-2.5" placeholder="Nama peserta *" value={form.participantName} onChange={(e) => setForm({ ...form, participantName: e.target.value })} />
                        <input className="rounded-xl border px-3 py-2.5" placeholder="Employee / BINUSIAN ID" value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })} />
                        <input className="rounded-xl border px-3 py-2.5" placeholder="NIK KTP" value={form.nik} onChange={(e) => setForm({ ...form, nik: e.target.value })} />
                        <input className="rounded-xl border px-3 py-2.5" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                        <input className="rounded-xl border px-3 py-2.5" placeholder="Nomor HP" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                        <input className="rounded-xl border px-3 py-2.5" placeholder="Perusahaan" value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} />
                        <input className="rounded-xl border px-3 py-2.5" placeholder="Departemen" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => setWalkinModalStep(2)}
                        disabled={
                          !String(form.participantName || "").trim() ||
                          (form.familyRole === "DEPENDENT" && !form.parentHistoryPersonId)
                        }
                        className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        Lanjut Pilih Layanan →
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3">
                      <div>
                        <div className="text-sm font-black text-emerald-900">Layanan & Rilis Nomor Antrian</div>
                        <div className="mt-1 text-xs font-semibold text-emerald-700">
                          Pilih Healthday/Bazar, produk + lot, harga/payment, lalu rilis nomor antrean.
                        </div>
                      </div>
                      <button type="button" onClick={() => setWalkinModalStep(1)} className="rounded-xl border bg-white px-3 py-2 text-xs font-black text-slate-700">
                        ← Data Peserta
                      </button>
                    </div>

                    <VaccinationManualWalkInController form={form} setForm={setForm} session={selectedSession} />
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : null}

        {edit ? (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/45 p-4">
            <div className="flex max-h-[92vh] w-full max-w-7xl flex-col overflow-hidden rounded-[2rem] border border-orange-200 bg-orange-50 shadow-2xl">
              <div className="flex flex-col gap-3 border-b border-orange-200 bg-orange-50 px-5 py-5 md:flex-row md:items-start md:justify-between">
                <div>
                  <h2 className="text-2xl font-black text-orange-900">Edit Produk / Tindakan</h2>
                  <p className="mt-1 text-sm font-semibold text-orange-800">{edit.registration.queue_number || "Belum rilis"} · {edit.registration.participant_name}</p>
                </div>
                <button type="button" onClick={() => setEdit(null)} className="rounded-xl border bg-white px-4 py-2 text-sm font-bold hover:bg-slate-50">Tutup</button>
              </div>

              <div className="overflow-y-auto px-5 py-5">
                <div className="mb-5 rounded-2xl border border-violet-200 bg-violet-50 p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="text-xs font-black uppercase tracking-wide text-violet-700">
                        Relasi Peserta
                      </div>
                      <div className="mt-1 text-sm font-black text-violet-950">
                        Parent / Child-Family
                      </div>
                      <div className="mt-1 text-xs font-semibold leading-5 text-violet-800">
                        Relasi keluarga disimpan eksplisit. NIP yang sama tidak otomatis dianggap satu keluarga.
                      </div>
                    </div>
                    <div className="rounded-full bg-white px-3 py-1.5 text-xs font-black text-violet-800">
                      Status saat ini:{" "}
                      {edit.familyRole === "PARENT"
                        ? "Parent"
                        : edit.familyRole === "DEPENDENT"
                          ? "Child / Family"
                          : "Belum ditentukan"}
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEdit((current) =>
                          current
                            ? {
                                ...current,
                                familyRole: "PARENT",
                                parentHistoryPersonId: null,
                                parentName: "",
                                parentEmployeeId: "",
                                parentNik: "",
                                parentEmail: "",
                              }
                            : current,
                        );
                        setEditFamilyQuery("");
                        setEditFamilyResults([]);
                      }}
                      className={`rounded-xl px-4 py-3 text-sm font-black ${
                        edit.familyRole === "PARENT"
                          ? "bg-violet-600 text-white"
                          : "border border-violet-200 bg-white text-violet-800"
                      }`}
                    >
                      Parent
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEdit((current) =>
                          current
                            ? {
                                ...current,
                                familyRole: "DEPENDENT",
                              }
                            : current,
                        );
                        setEditFamilyQuery("");
                        setEditFamilyResults([]);
                      }}
                      className={`rounded-xl px-4 py-3 text-sm font-black ${
                        edit.familyRole === "DEPENDENT"
                          ? "bg-violet-600 text-white"
                          : "border border-violet-200 bg-white text-violet-800"
                      }`}
                    >
                      Child / Family
                    </button>
                  </div>

                  {edit.familyRole === "PARENT" ? (
                    <div className="mt-4 rounded-xl border border-violet-200 bg-white p-3">
                      <div className="text-xs font-black text-slate-800">
                        Hubungkan Parent ke data History existing
                      </div>
                      <div className="mt-1 text-[11px] font-semibold text-slate-500">
                        Disarankan untuk Parent agar Family Queue bisa menemukan semua anggota keluarga.
                      </div>

                      {edit.historyPersonId ? (
                        <div className="mt-3 flex flex-col gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <div className="text-sm font-black text-emerald-950">
                              {edit.historyPersonName || edit.registration.participant_name || "Parent existing"}
                            </div>
                            <div className="mt-1 text-xs font-semibold text-emerald-800">
                              History Person #{edit.historyPersonId}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setEdit((current) =>
                                current
                                  ? {
                                      ...current,
                                      historyPersonId: null,
                                      historyPersonName: "",
                                    }
                                  : current,
                              );
                              setEditFamilyQuery("");
                            }}
                            className="rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs font-black text-emerald-800"
                          >
                            Ganti
                          </button>
                        </div>
                      ) : (
                        <>
                          <input
                            value={editFamilyQuery}
                            onChange={(e) => setEditFamilyQuery(e.target.value)}
                            placeholder="Cari nama / BINUSIAN ID / NIK / email Parent..."
                            className="mt-3 w-full rounded-xl border border-violet-200 px-3 py-2.5 text-sm font-semibold outline-none focus:border-violet-400"
                          />
                          {!editFamilyQuery.trim() ? (
                            <div className="mt-2 text-[11px] font-semibold text-amber-700">
                              Parent tetap bisa disimpan tanpa History Person, tetapi Family Queue baru bisa mengelompokkan keluarga setelah Parent terhubung ke History existing.
                            </div>
                          ) : null}
                        </>
                      )}
                    </div>
                  ) : null}

                  {edit.familyRole === "DEPENDENT" ? (
                    <div className="mt-4 rounded-xl border border-violet-200 bg-white p-3">
                      <div className="text-xs font-black text-slate-800">
                        Parent Existing
                      </div>

                      {edit.parentHistoryPersonId ? (
                        <div className="mt-3 flex flex-col gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <div className="text-sm font-black text-emerald-950">
                              {edit.parentName || "Parent existing"}
                            </div>
                            <div className="mt-1 text-xs font-semibold text-emerald-800">
                              {[edit.parentEmployeeId, edit.parentNik, edit.parentEmail]
                                .filter(Boolean)
                                .join(" · ") || `History Person #${edit.parentHistoryPersonId}`}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setEdit((current) =>
                                current
                                  ? {
                                      ...current,
                                      parentHistoryPersonId: null,
                                      parentName: "",
                                      parentEmployeeId: "",
                                      parentNik: "",
                                      parentEmail: "",
                                    }
                                  : current,
                              );
                              setEditFamilyQuery("");
                            }}
                            className="rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs font-black text-emerald-800"
                          >
                            Ganti Parent
                          </button>
                        </div>
                      ) : (
                        <input
                          value={editFamilyQuery}
                          onChange={(e) => setEditFamilyQuery(e.target.value)}
                          placeholder="Cari nama / BINUSIAN ID / NIK / email Parent..."
                          className="mt-3 w-full rounded-xl border border-violet-200 px-3 py-2.5 text-sm font-semibold outline-none focus:border-violet-400"
                        />
                      )}
                    </div>
                  ) : null}

                  {editFamilySearching ? (
                    <div className="mt-3 rounded-xl border bg-white px-3 py-2 text-xs font-bold text-slate-500">
                      Mencari data History...
                    </div>
                  ) : null}

                  {!editFamilySearching &&
                  editFamilyQuery.trim().length >= 2 &&
                  editFamilyResults.length ? (
                    <div className="mt-3 max-h-52 overflow-auto rounded-xl border border-violet-200 bg-white">
                      {editFamilyResults.map((row: any) => (
                        <button
                          type="button"
                          key={`edit-family-${row.id}`}
                          onClick={() => {
                            setEdit((current) => {
                              if (!current) return current;

                              if (current.familyRole === "PARENT") {
                                return {
                                  ...current,
                                  historyPersonId: Number(row.id || 0) || null,
                                  historyPersonName: String(row.name || "").trim(),
                                };
                              }

                              return {
                                ...current,
                                parentHistoryPersonId:
                                  Number(row.id || 0) || null,
                                parentName: String(row.name || "").trim(),
                                parentEmployeeId: String(row.employeeId || "").trim(),
                                parentNik: String(row.nik || "").trim(),
                                parentEmail: String(row.email || "").trim(),
                              };
                            });
                            setEditFamilyQuery("");
                            setEditFamilyResults([]);
                          }}
                          className="flex w-full items-start justify-between gap-3 border-b border-slate-100 px-3 py-3 text-left last:border-b-0 hover:bg-violet-50"
                        >
                          <div>
                            <div className="text-sm font-black text-slate-900">
                              {row.name || "-"}
                            </div>
                            <div className="mt-1 text-[11px] font-semibold text-slate-500">
                              {[row.employeeId, row.nik, row.email]
                                .filter(Boolean)
                                .join(" · ") || "History Company"}
                            </div>
                          </div>
                          <span className="rounded-full bg-violet-100 px-2 py-1 text-[10px] font-black text-violet-700">
                            Parent
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : null}

                  <div className="mt-4 flex justify-end">
                    <button
                      type="button"
                      onClick={saveEditFamily}
                      disabled={
                        savingEditFamily ||
                        !edit.familyRole ||
                        (edit.familyRole === "DEPENDENT" &&
                          !edit.parentHistoryPersonId)
                      }
                      className="rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-black text-white hover:bg-violet-700 disabled:opacity-50"
                    >
                      {savingEditFamily
                        ? "Menyimpan Relasi..."
                        : "Simpan Relasi Peserta"}
                    </button>
                  </div>
                </div>

                <div className="space-y-3">
                  {edit.items.map((item, index) => (
                    <div key={index} className={`grid gap-3 rounded-2xl border bg-white p-4 xl:grid-cols-[130px_1.2fr_1.1fr_90px_150px_130px_1fr_150px] ${isDoneStatus(item.status) ? "opacity-80" : ""}`}>
                      {healthdayBazarEnabled ? (
                        <select disabled={isDoneStatus(item.status)} className="rounded-xl border px-3 py-2.5 font-bold disabled:bg-slate-100" value={item.serviceMode} onChange={(e) => updateEditItem(index, { serviceMode: e.target.value === "BAZAR" ? "BAZAR" : "HEALTHDAY", paymentMethod: e.target.value === "BAZAR" ? item.paymentMethod : item.paymentMethod })}>
                          <option value="HEALTHDAY">Healthday</option>
                          <option value="BAZAR">Bazar</option>
                        </select>
                      ) : <div className="rounded-xl bg-slate-100 px-3 py-2.5 text-xs font-black text-slate-500">Healthday</div>}
                      <select disabled={isDoneStatus(item.status)} className="rounded-xl border px-3 py-2.5 disabled:bg-slate-100" value={item.vaccineId} onChange={(e) => updateEditItem(index, { vaccineId: e.target.value })}>
                        <option value="">Pilih vaksin</option>
                        {availableVaccines.map((vaccine) => <option key={vaccine.id} value={vaccine.id}>{vaccineLabel(vaccine)}</option>)}
                      </select>
                      <select disabled={isDoneStatus(item.status)} className="rounded-xl border px-3 py-2.5 disabled:bg-slate-100" value={item.lotId} onChange={(e) => updateEditItem(index, { lotId: e.target.value })}>
                        <option value="">Pilih lot</option>
                        {lotOptions(item.vaccineId).map((lot) => <option key={lot.id} value={lot.id}>Lot {lot.lot_number} · exp {lot.expiry_date || "-"}</option>)}
                      </select>
                      <input disabled={isDoneStatus(item.status)} type="number" min={1} className="rounded-xl border px-3 py-2.5 disabled:bg-slate-100" value={item.doseNumber} onChange={(e) => updateEditItem(index, { doseNumber: Number(e.target.value || 1) })} />
                      {healthdayBazarEnabled && item.serviceMode === "BAZAR" ? (
                        <select disabled={isDoneStatus(item.status)} className="rounded-xl border px-3 py-2.5 font-bold disabled:bg-slate-100" value={item.saleMode || "NON_PACKAGE"} onChange={(e) => updateEditItem(index, { saleMode: e.target.value === "PACKAGE" ? "PACKAGE" : "NON_PACKAGE" })}>
                          <option value="NON_PACKAGE">Harga Non Paket · {money(saleOffer(item.vaccineId, "NON_PACKAGE")?.price ?? vaccines.find((v) => String(v.id) === String(item.vaccineId))?.price)}</option>
                          {saleOffer(item.vaccineId, "PACKAGE") ? <option value="PACKAGE">Harga Paket · {money(saleOffer(item.vaccineId, "PACKAGE")?.price)}</option> : null}
                        </select>
                      ) : (
                        <select disabled={isDoneStatus(item.status)} className="rounded-xl border px-3 py-2.5 disabled:bg-slate-100" value={item.priceCategory} onChange={(e) => updateEditItem(index, { priceCategory: e.target.value })}>
                          {priceCategoryOptions.map((category) => <option key={category} value={category}>{category}</option>)}
                        </select>
                      )}
                      <input disabled={isDoneStatus(item.status) || (healthdayBazarEnabled && item.serviceMode === "BAZAR")} type="number" className="rounded-xl border px-3 py-2.5 disabled:bg-slate-100" placeholder={healthdayBazarEnabled && item.serviceMode === "BAZAR" ? "Harga master" : "Harga"} value={item.price} onChange={(e) => updateEditItem(index, { price: e.target.value })} />
                      {healthdayBazarEnabled && item.serviceMode === "BAZAR" ? (
                        <select disabled={isDoneStatus(item.status)} className="rounded-xl border px-3 py-2.5 font-bold disabled:bg-slate-100" value={item.paymentMethod} onChange={(e) => updateEditItem(index, { paymentMethod: e.target.value })}>
                          <option value="">Metode bayar</option>
                          <option value="QRIS">QRIS</option>
                          <option value="DEBIT">Debit</option>
                          <option value="CREDIT_CARD">Credit Card +3%</option>
                          <option value="TRANSFER">Transfer</option>
                        </select>
                      ) : (
                        <input disabled={isDoneStatus(item.status)} className="rounded-xl border px-3 py-2.5 disabled:bg-slate-100" placeholder="Payment note / metode" value={item.paymentNote || item.paymentMethod} onChange={(e) => updateEditItem(index, { paymentNote: e.target.value })} />
                      )}
                      <div className="flex items-center gap-2">
                        {isDoneStatus(item.status) ? <span className="rounded-xl bg-emerald-100 px-3 py-2 text-xs font-black text-emerald-700">Done</span> : <span className="rounded-xl bg-orange-100 px-3 py-2 text-xs font-black text-orange-700">Not Done</span>}
                        <button disabled={isDoneStatus(item.status)} type="button" onClick={() => removeEditItem(index)} className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700 disabled:opacity-40">Hapus</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t border-orange-200 bg-orange-50 px-5 py-4">
                <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
                  <input className="rounded-xl border px-3 py-2.5" placeholder="Catatan perubahan untuk dokter, contoh: Tambahan vaksin pribadi QRIS" value={edit.changeNote} onChange={(e) => setEdit({ ...edit, changeNote: e.target.value })} />
                  <button type="button" onClick={addEditItem} className="rounded-xl border bg-white px-4 py-2 text-sm font-bold hover:bg-slate-50">+ Tambah Produk</button>
                  <button type="button" onClick={saveEditProducts} disabled={savingEdit} className="rounded-xl bg-orange-600 px-4 py-2 text-sm font-bold text-white hover:bg-orange-700 disabled:opacity-60">{savingEdit ? "Menyimpan..." : "Simpan Perubahan"}</button>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        <section className="mt-6 overflow-hidden rounded-2xl border">
          <div className="flex flex-col gap-3 border-b bg-slate-50 p-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="font-bold">{internalQueueEnabled
                ? (healthdayBazarEnabled
                    ? `Antrean ${activeQueueView === "BAZAR" ? "Bazar" : "Healthday"} · ${queueReadyRegistrations.length} peserta`
                    : `Registrasi Session Ini · ${registrations.length} peserta`)
                : `Pencatatan Session Ini · ${registrations.length} peserta`}</div>
              <input
                className="mt-3 w-full rounded-xl border bg-white px-3 py-2.5 text-sm xl:w-80"
                placeholder="Cari nama / Employee ID / NIK..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => exportStage("all")} className="rounded-xl border bg-white px-3 py-2 text-xs font-bold hover:bg-slate-50">Export Semua Stage</button>
              <button onClick={() => exportStage("no_queue")} className="rounded-xl border bg-white px-3 py-2 text-xs font-bold hover:bg-slate-50">Export Belum Datang</button>
              <button onClick={() => exportStage("waiting")} className="rounded-xl border bg-white px-3 py-2 text-xs font-bold hover:bg-slate-50">Export Waiting</button>
              <button onClick={() => exportStage("doctor")} className="rounded-xl border bg-white px-3 py-2 text-xs font-bold hover:bg-slate-50">Export Dokter</button>
              <button onClick={() => exportStage("done")} className="rounded-xl border bg-white px-3 py-2 text-xs font-bold hover:bg-slate-50">Export Selesai</button>
            </div>
          </div>

          <div className="max-h-[560px] overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-slate-100 text-xs uppercase text-slate-600">
                {healthdayBazarEnabled && internalQueueEnabled ? (
                  <tr>
                    <th className="p-3 text-left">{activeQueueView === "BAZAR" ? sortButton("Antrean Bazar", "bazarQueue") : sortButton("Antrean Healthday", "queue")}</th>
                    <th className="p-3 text-left">{activeQueueView === "BAZAR" ? "Aksi Bazar" : "Aksi Healthday"}</th>
                    <th className="p-3 text-left">{sortButton("Nama", "name")}</th>
                    <th className="p-3 text-left">{sortButton("NIK Karyawan / BINUSIAN ID", "identity")}</th>
                    <th className="p-3 text-left">{sortButton("Produk / Harga", "product")}</th>
                    <th className="p-3 text-left">{sortButton("Note", "note")}</th>
                    <th className="p-3 text-left">Aksi Data</th>
                  </tr>
                ) : (
                  <tr>
                    <th className="p-3 text-left">{sortButton(internalQueueEnabled ? "Antrian" : "No. Antrean Vendor", "queue")}</th>
                    <th className="p-3 text-left">{sortButton("Nama", "name")}</th>
                    <th className="p-3 text-left">{sortButton("NIK Karyawan / BINUSIAN ID", "identity")}</th>
                    <th className="p-3 text-left">{sortButton("Produk / Harga", "product")}</th>
                    <th className="p-3 text-left">{sortButton("Status", "status")}</th>
                    <th className="p-3 text-left">{sortButton("Note", "note")}</th>
                    <th className="p-3 text-left">Aksi</th>
                  </tr>
                )}
              </thead>
              <tbody className="divide-y">
                {visibleRegistrations.map((registration) => {
                  const info = statusInfo(registration.queue_status);
                  const bazarInfo = statusInfo(registration.bazar_queue_status);
                  const allItems = Array.isArray(registration.items) ? registration.items : [];
                  const items = healthdayBazarEnabled
                    ? allItems.filter((item: any) => String(item?.service_mode || "HEALTHDAY").toUpperCase() === activeQueueView)
                    : allItems;
                  const serviceStatus = String(registration.patient_service_status || "HEALTHDAY").toUpperCase();
                  const hasA = !healthdayBazarEnabled || serviceHasTrack(serviceStatus, "A");
                  const hasB = healthdayBazarEnabled && serviceHasTrack(serviceStatus, "B");
                  const hasANumber = hasA && Boolean(String(registration.queue_number || "").trim());
                  const hasBNumber = hasB && Boolean(String(registration.bazar_queue_number || "").trim());
                  const needsQueueRelease = internalQueueEnabled && !healthdayBazarEnabled && hasA && !hasANumber;
                  const aCancelKey = `${registration?.id || ""}-A`;
                  const bCancelKey = `${registration?.id || ""}-B`;

                  if (healthdayBazarEnabled && internalQueueEnabled) {
                    return (
                      <tr key={registration.id}>
                        <td className="p-3 align-top">
                          {activeQueueView === "BAZAR" ? (
                            <div className="space-y-1">
                              <div className="text-lg font-black text-violet-700">{registration.bazar_queue_number}</div>
                              <span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-black ${bazarInfo.cls}`}>{bazarInfo.label}</span>
                            </div>
                          ) : (
                            <div className="space-y-1">
                              <div className="text-lg font-black text-blue-700">{registration.queue_number}</div>
                              <span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-black ${info.cls}`}>{info.label}</span>
                            </div>
                          )}
                        </td>
                        <td className="p-3 align-top">
                          {activeQueueView === "BAZAR" ? (
                            <div className="flex min-w-[145px] flex-col items-start gap-2">
                              <button
                                type="button"
                                title="Print ulang nomor antrean Bazar"
                                aria-label="Print ulang nomor antrean Bazar"
                                onClick={() => {
                                  const registrationId = Number(registration?.id || 0);
                                  const queueSessionId = Number(registration?.session_id || 0);
                                  if (!registrationId) return;
                                  const ticketUrl =
                                    `/vaccination/queue-ticket/${registrationId}` +
                                    `?track=B&session_id=${encodeURIComponent(String(queueSessionId))}&autoprint=1`;
                                  const printWindow = window.open(
                                    ticketUrl,
                                    `vaccination_queue_ticket_bazar_reprint_${registrationId}`,
                                    "popup=yes,width=520,height=720",
                                  );
                                  if (printWindow) printWindow.focus();
                                }}
                                className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-black text-violet-700 hover:bg-violet-100"
                              >
                                🖨 Print Antrian
                              </button>
                              {canCancelRegistrationTrack(registration, "B") ? (
                                <button
                                  type="button"
                                  onClick={() => void cancelRegistrationTrack(registration, "B")}
                                  disabled={cancellingTrackKey === bCancelKey}
                                  className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-black text-red-700 hover:bg-red-100 disabled:opacity-50"
                                >
                                  {cancellingTrackKey === bCancelKey ? "Cancel..." : "Cancel Bazar"}
                                </button>
                              ) : null}
                            </div>
                          ) : (
                            <div className="flex min-w-[145px] flex-col items-start gap-2">
                              <button
                                type="button"
                                title="Print ulang nomor antrean Healthday"
                                aria-label="Print ulang nomor antrean Healthday"
                                onClick={() => {
                                  const registrationId = Number(registration?.id || 0);
                                  const queueSessionId = Number(registration?.session_id || 0);
                                  if (!registrationId) return;
                                  const ticketUrl =
                                    `/vaccination/queue-ticket/${registrationId}` +
                                    `?session_id=${encodeURIComponent(String(queueSessionId))}&autoprint=1`;
                                  const printWindow = window.open(
                                    ticketUrl,
                                    `vaccination_queue_ticket_reprint_${registrationId}`,
                                    "popup=yes,width=520,height=720",
                                  );
                                  if (printWindow) printWindow.focus();
                                }}
                                className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-black text-blue-700 hover:bg-blue-100"
                              >
                                🖨 Print Antrian
                              </button>
                              {canCancelRegistrationTrack(registration, "A") ? (
                                <button
                                  type="button"
                                  onClick={() => void cancelRegistrationTrack(registration, "A")}
                                  disabled={cancellingTrackKey === aCancelKey}
                                  className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-black text-red-700 hover:bg-red-100 disabled:opacity-50"
                                >
                                  {cancellingTrackKey === aCancelKey ? "Cancel..." : "Cancel Healthday"}
                                </button>
                              ) : null}
                            </div>
                          )}
                        </td>
                        <td className="p-3 align-top font-bold">
                          <button type="button" onClick={() => setHistoryRegistration(registration)} className="text-left font-black text-blue-700 underline decoration-blue-200 underline-offset-4 hover:text-blue-900" title="Lihat riwayat layanan peserta">
                            {registration.participant_name}
                          </button>
                          <div className="mt-1 w-fit rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-black uppercase text-violet-700">
                            {activeQueueView === "BAZAR" ? "Bazar" : "Healthday"}
                          </div>
                        </td>
                        <td className="p-3 align-top">{registration.employee_id || registration.mcu_id || "-"}</td>
                        <td className="p-3 align-top">
                          <div className="space-y-1">
                            {items.length ? items.map((item: any) => (
                              <div key={item.id} className="rounded-lg bg-slate-50 px-2 py-1 text-xs font-bold text-slate-700">
                                {item.vaccine?.name || "Produk"} · Lot {item.lot?.lot_number || "-"} · {money(item.price)}
                              </div>
                            )) : <span>{registration.vaccine?.name || "Sesuai session"}</span>}
                          </div>
                        </td>
                        <td className="p-3 align-top text-xs text-slate-600">{registration.status_note || registration.payment_note || "-"}</td>
                        <td className="p-3 align-top">
                          <button onClick={() => openEditProducts(registration)} className="rounded-xl border bg-white px-3 py-2 text-xs font-bold hover:bg-slate-50">Edit Produk</button>
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <tr key={registration.id}>
                      <td className="p-3">
                        <div className="text-xl font-black">{registration.queue_number || <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-800">Belum rilis</span>}</div>
                      </td>
                      <td className="p-3 font-bold">
                        <button type="button" onClick={() => setHistoryRegistration(registration)} className="text-left font-black text-blue-700 underline decoration-blue-200 underline-offset-4 hover:text-blue-900" title="Lihat riwayat layanan peserta">
                          {registration.participant_name}
                        </button>
                      </td>
                      <td className="p-3">{registration.employee_id || registration.mcu_id || "-"}</td>
                      <td className="p-3">
                        <div className="space-y-1">
                          {items.length ? items.map((item: any) => (
                            <div key={item.id} className="rounded-lg bg-slate-50 px-2 py-1 text-xs font-bold text-slate-700">
                              {item.vaccine?.name || "Produk"} · Lot {item.lot?.lot_number || "-"} · {money(item.price)}
                            </div>
                          )) : <span>{registration.vaccine?.name || "Sesuai session"}</span>}
                        </div>
                      </td>
                      <td className="p-3"><span className={`rounded-full px-3 py-1 text-xs font-black ${info.cls}`}>{info.label}</span></td>
                      <td className="p-3 text-xs text-slate-600">{registration.status_note || registration.payment_note || "-"}</td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-2">
                          {needsQueueRelease ? <button onClick={() => releaseQueue(registration)} disabled={releasingId === registration.id} className="rounded-xl bg-red-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-60">{releasingId === registration.id ? "Proses..." : "Rilis Antrian"}</button> : null}
                          <button onClick={() => openEditProducts(registration)} className="rounded-xl border bg-white px-3 py-2 text-xs font-bold hover:bg-slate-50">Edit Produk</button>
                          {internalQueueEnabled && String(registration?.queue_number || "").trim() && hasA ? (
                            <button
                              type="button"
                              title="Print ulang nomor antrian"
                              aria-label="Print ulang nomor antrian"
                              onClick={() => {
                                const registrationId = Number(registration?.id || 0);
                                const queueSessionId = Number(registration?.session_id || 0);
                                if (!registrationId) return;
                                const ticketUrl =
                                  `/vaccination/queue-ticket/${registrationId}` +
                                  `?session_id=${encodeURIComponent(String(queueSessionId))}&autoprint=1`;
                                const printWindow = window.open(
                                  ticketUrl,
                                  `vaccination_queue_ticket_reprint_${registrationId}`,
                                  "popup=yes,width=520,height=720",
                                );
                                if (printWindow) printWindow.focus();
                              }}
                              className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-black text-blue-700 hover:bg-blue-100"
                            >
                              🖨 Print Antrian
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!visibleRegistrations.length ? (
                  <tr>
                    <td colSpan={healthdayBazarEnabled && internalQueueEnabled ? 9 : 7} className="p-5 text-center text-slate-500">
                      {internalQueueEnabled && healthdayBazarEnabled
                        ? "Belum ada peserta yang sudah memiliki nomor antrean."
                        : internalQueueEnabled
                          ? "Belum ada peserta untuk session ini."
                          : "Belum ada peserta tercatat untuk session ini."}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>
      {historyRegistration ? <VaccinationParticipantHistoryModal registration={historyRegistration} onClose={() => setHistoryRegistration(null)} /> : null}
    </main>
  );
}
