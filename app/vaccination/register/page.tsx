"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import VaccinationParticipantHistoryModal from "@/components/VaccinationParticipantHistoryModal";

// V520_SERVICE_SPECIFIC_QUEUE_MODE
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

function registrationTypeLabel(registration: any) {
  return String(registration?.registered_by || "").toUpperCase().startsWith("SELF_BOOKING")
    ? "SELF BOOKING"
    : "ADMIN BOOKING";
}

function paymentMethodLabel(value: any) {
  const raw = String(value || "").trim().toUpperCase();
  if (!raw) return "-";
  if (raw === "CREDIT_CARD") return "Credit Card";
  if (raw === "PREPAID_PREVIOUS_EVENT") return "Sudah Lunas - Suntikan Lanjutan";
  return raw.charAt(0) + raw.slice(1).toLowerCase();
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


// V630: BINUS Child-only read-only attendee display, shared by seven audited sessions.
// Explicit ID + Source + event name + location + date guard protects BINUS Dewasa.
const V630_BINUS_CHILD_SESSIONS: Record<number, { area: string; date: string }> = {
  190: { area: "surabaya", date: "2026-11-05" },
  191: { area: "medan", date: "2026-11-11" },
  192: { area: "bekasi", date: "2026-11-14" },
  193: { area: "anggrek", date: "2026-11-14" },
  194: { area: "bandung", date: "2026-11-26" },
  195: { area: "malang", date: "2026-11-26" },
  196: { area: "semarang", date: "2026-11-27" },
};
function isV630ChildSessionUI(session: any, sourceId: any): boolean {
  const entry = V630_BINUS_CHILD_SESSIONS[Number(session?.id || 0)];
  const normalize = (s: any) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return Boolean(entry)
    && Number(sourceId || 0) === 49
    && Number(session?.source_id || 0) === 49
    && normalize(session?.session_name).includes("binus healthday anak")
    && normalize(session?.location).includes(entry.area)
    && String(session?.session_date || "").slice(0,10) === entry.date;
}

export default function VaccinationRegisterPage() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [sources, setSources] = useState<any[]>([]);
  const [vaccines, setVaccines] = useState<any[]>([]);
  const [lots, setLots] = useState<any[]>([]);
  const [salesOffers, setSalesOffers] = useState<any[]>([]);
  const [registrations, setRegistrations] = useState<any[]>([]);
  const [locationStockSummary, setLocationStockSummary] = useState<Record<string, any>>({});
  const [locationStockLoadError, setLocationStockLoadError] = useState("");
  const [selectedStockProductId, setSelectedStockProductId] = useState("");
  const [selfBookings, setSelfBookings] = useState<any[]>([]);
  const [selfBookingLoading, setSelfBookingLoading] = useState(false);
  const [processingBooking, setProcessingBooking] = useState<any | null>(null);
  const [bookingPaymentMethod, setBookingPaymentMethod] = useState("QRIS");
  const [bookingPreviousPaymentReference, setBookingPreviousPaymentReference] = useState("");
  const [bookingPaymentValidated, setBookingPaymentValidated] = useState(false);
  const [bookingProcessing, setBookingProcessing] = useState(false);
  const [bookingProcessError, setBookingProcessError] = useState("");
  const [selfBookingCatalog, setSelfBookingCatalog] = useState<any[]>([]);
  const [editingSelfBooking, setEditingSelfBooking] = useState<any | null>(null);
  const [selfBookingEditSaving, setSelfBookingEditSaving] = useState(false);

  const [message, setMessage] = useState("Import peserta corporate/vaksinasi lebih dulu. Nomor antrian dirilis saat peserta datang registrasi ulang.");
  const [error, setError] = useState("");
  // V629.1: read-only recovery preview, never creates registrations or queue numbers.
  const [v629Preview, setV629Preview] = useState<any | null>(null);
  const [v629PreviewLoading, setV629PreviewLoading] = useState(false);
  const [v629PreviewError, setV629PreviewError] = useState("");
  // V630: strict allowlisted BINUS Child sessions open the existing family-safe walk-in flow.
  const [v629ChildSelection, setV629ChildSelection] = useState<{ token: number; registrationId?: number; candidateIndex?: number } | null>(null);
  const deepLinkEditHandled = useRef(false);
  // V603: ignore stale Healthday/Bazar responses when operators switch views.
  const latestRegisterLoad = useRef(0);
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
    vendorQueueHealthday: string;
    vendorQueueBazar: string;
  } | null>(null);
  const [editFamilyQuery, setEditFamilyQuery] = useState("");
  const [editFamilyResults, setEditFamilyResults] = useState<any[]>([]);
  const [editFamilySearching, setEditFamilySearching] = useState(false);
  const [savingEditFamily, setSavingEditFamily] = useState(false);
  const [selectedVaccineIds, setSelectedVaccineIds] = useState<string[]>([]);
  const [contextLocked, setContextLocked] = useState(false);
  const [sort, setSort] = useState<SortState>({ key: "queue", direction: "asc" });
  const [search, setSearch] = useState("");
  const [productFilter, setProductFilter] = useState("");
  const [registeringExternalId, setRegisteringExternalId] = useState<number | null>(null);
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
  const legacyQueueEnabled = selectedSession?.existing_flow_config?.queue !== false;
  const healthdayQueueEnabled = selectedSession?.existing_flow_config?.queue_healthday === undefined
    ? legacyQueueEnabled
    : selectedSession?.existing_flow_config?.queue_healthday !== false;
  const bazarQueueEnabled = selectedSession?.existing_flow_config?.queue_bazar === undefined
    ? legacyQueueEnabled
    : selectedSession?.existing_flow_config?.queue_bazar !== false;
  const internalQueueEnabled = String(form.serviceMode || "HEALTHDAY").toUpperCase() === "BAZAR"
    ? bazarQueueEnabled
    : healthdayQueueEnabled;

  const editSession = edit
    ? sessions.find((session) => String(session.id) === String(edit.registration?.session_id))
    : null;
  const editLegacyQueueEnabled = editSession?.existing_flow_config?.queue !== false;
  const editHealthdayQueueEnabled = editSession?.existing_flow_config?.queue_healthday === undefined
    ? editLegacyQueueEnabled
    : editSession?.existing_flow_config?.queue_healthday !== false;
  const editBazarQueueEnabled = editSession?.existing_flow_config?.queue_bazar === undefined
    ? editLegacyQueueEnabled
    : editSession?.existing_flow_config?.queue_bazar !== false;
  const editHasHealthday = Boolean(edit?.items.some((item) => item.serviceMode === "HEALTHDAY"));
  const editHasBazar = Boolean(edit?.items.some((item) => item.serviceMode === "BAZAR"));

  const selectedSourceId = useMemo(() => form.sourceId || selectedSession?.source_id || "", [form.sourceId, selectedSession?.source_id]);
  const v629NeedsReview = isV630ChildSessionUI(selectedSession, selectedSourceId);
  // V629.3: lock repeat import only for BINUS Healthday Anak Anggrek Session 193.
  // No impact to BINUS Dewasa or other sessions, including other Source 49 sessions.
  const v629ExistingImportLocked = v629NeedsReview;
  useEffect(() => {
    setV629Preview(null);
    setV629PreviewError("");
  }, [form.sessionId, selectedSourceId]);

  // V571_VACCINATION_SOURCE_SCOPED_SESSION_SELECTION
  // Session & database must belong to the same source before loading participants.
  // This changes only the Register selector, NOT any configured Session flow.
  const sessionsForSelectedSource = useMemo(
    () => !selectedSourceId
      ? sessions
      : sessions.filter((session: any) => String(session.source_id || "") === String(selectedSourceId)),
    [sessions, selectedSourceId],
  );
  const sessionSourceMismatch = Boolean(
    selectedSession && selectedSourceId &&
    String(selectedSession.source_id || "") !== String(selectedSourceId),
  );
  const selectedSourceName = sources.find((source: any) => String(source.id) === String(selectedSourceId))?.name || "";


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
    return sortedRegistrations.filter((registration: any) => {
      const serviceStatus = String(registration?.patient_service_status || "HEALTHDAY").toUpperCase();
      const hasTrack = activeQueueView === "BAZAR"
        ? serviceHasTrack(serviceStatus, "B")
        : serviceHasTrack(serviceStatus, "A");
      if (!hasTrack) return false;
      const trackUsesInternalQueue = activeQueueView === "BAZAR" ? bazarQueueEnabled : healthdayQueueEnabled;
      if (!trackUsesInternalQueue) return true;
      return activeQueueView === "BAZAR"
        ? Boolean(String(registration?.bazar_queue_number || "").trim())
        : Boolean(String(registration?.queue_number || "").trim());
    });
  }, [sortedRegistrations, healthdayBazarEnabled, activeQueueView, bazarQueueEnabled, healthdayQueueEnabled]);

  const registrationProductOptions = useMemo(() => {
    const map = new Map<string, string>();
    const productRows = v629NeedsReview && activeQueueView === "HEALTHDAY" ? sortedRegistrations : queueReadyRegistrations;
    for (const registration of productRows) {
      const items = Array.isArray(registration?.items) ? registration.items : [];
      const matching = items.filter((item: any) => !healthdayBazarEnabled || String(item?.service_mode || "HEALTHDAY").toUpperCase() === activeQueueView);
      for (const item of matching) {
        const vaccineId = String(item?.vaccine_id || "");
        const name = String(item?.vaccine?.name || "Produk").trim();
        if (vaccineId && name && !map.has(vaccineId)) map.set(vaccineId, name);
      }
      // A legacy imported benefit may have registration.vaccine_id, but no item
      // row yet. Show its registered product without fabricating stock.
      if (!items.length && registration?.vaccine_id && registration?.vaccine?.name &&
          (!healthdayBazarEnabled || serviceHasTrack(registration?.patient_service_status, activeQueueView === "BAZAR" ? "B" : "A"))) {
        const vaccineId = String(registration.vaccine_id);
        if (!map.has(vaccineId)) map.set(vaccineId, String(registration.vaccine.name));
      }
    }
    if (v629NeedsReview && activeQueueView === "HEALTHDAY" && Array.isArray(v629Preview?.candidates)) {
      for (const candidate of v629Preview.candidates) {
        for (const raw of Array.isArray(candidate?.mappedVaccineIds) ? candidate.mappedVaccineIds : []) {
          const id = String(raw || "");
          const vaccine = vaccines.find((v: any) => String(v.id) === id);
          if (id && vaccine?.name && !map.has(id)) map.set(id, String(vaccine.name));
        }
      }
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "id"));
  }, [queueReadyRegistrations, sortedRegistrations, healthdayBazarEnabled, activeQueueView, v629NeedsReview, v629Preview, vaccines]);

  useEffect(() => {
    setProductFilter("");
  }, [activeQueueView, form.sessionId]);

  const visibleRegistrations = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    // V602: global participant lookup stays read-only for the opposite service.
    // Queue actions, counts, exports and product selection remain service-scoped.
    const searchRows = keyword ? sortedRegistrations : queueReadyRegistrations;
    return searchRows.filter((registration: any) => {
      const serviceItems = (Array.isArray(registration.items) ? registration.items : []).filter((item: any) => {
        if (!healthdayBazarEnabled) return true;
        return String(item?.service_mode || "HEALTHDAY").toUpperCase() === activeQueueView;
      });
      const hasLegacyVaccine = !serviceItems.length &&
        (!healthdayBazarEnabled || serviceHasTrack(registration?.patient_service_status, activeQueueView === "BAZAR" ? "B" : "A")) &&
        String(registration?.vaccine_id || "") === productFilter;
      if (productFilter && !hasLegacyVaccine && !serviceItems.some((item: any) => String(item?.vaccine_id || "") === productFilter)) return false;
      if (!keyword) return true;
      const haystack = [
        registration.participant_name,
        registration.employee_id,
        registration.mcu_id,
        registration.nik,
        registration.email,
        registration.phone,
        ...serviceItems.map((item: any) => item?.vaccine?.name),
        // Legacy imported vaccine is held on the registration row, not item.
        ...(!serviceItems.length && (!healthdayBazarEnabled || serviceHasTrack(registration?.patient_service_status, activeQueueView === "BAZAR" ? "B" : "A"))
          ? [registration?.vaccine?.name]
          : []),
      ].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(keyword);
    });
  }, [queueReadyRegistrations, sortedRegistrations, search, productFilter, healthdayBazarEnabled, activeQueueView]);

  // V629.5: presentation-only 347-row BINUS Anak list. Do not change internal queue mode.
  // Source preview and registered rows are joined by audited registration ID, never shared BINUSIAN ID.
  const v629ChildRows = useMemo(() => {
    if (!v629NeedsReview) return [] as any[];
    // If preview is temporarily unavailable, keep the 223 existing registrations visible.
    if (!Array.isArray(v629Preview?.candidates)) {
      const keyword = search.trim().toLocaleLowerCase("id");
      return registrations.filter((row: any) => {
        if (!serviceHasTrack(row?.patient_service_status, "A")) return false;
        if (keyword && ![row?.participant_name, row?.employee_id, row?.nik].some((x: any) => String(x || "").toLocaleLowerCase("id").includes(keyword))) return false;
        if (productFilter && !((Array.isArray(row?.items) ? row.items : []).some((item: any) => String(item?.vaccine_id) === productFilter) || String(row?.vaccine_id || "") === productFilter)) return false;
        return true;
      }).map((row: any) => ({ existing: row, candidateIndex: -1, safe: true, unregistered: false, name: String(row.participant_name || ""), identity: String(row.employee_id || ""), batch: (Array.isArray(row.items) ? row.items : []).map((item: any) => item?.vaccine?.name).filter(Boolean).join(", ") || String(row?.vaccine?.name || "Data registrasi"), candidate: null }));
    }
    const byId = new Map<number, any>(registrations.map((r: any) => [Number(r?.id || 0), r]));
    const keyword = search.trim().toLocaleLowerCase("id");
    return v629Preview.candidates.map((candidate: any, candidateIndex: number) => {
      const ids = Array.isArray(candidate?.matchedRegistrationIds)
        ? candidate.matchedRegistrationIds.map((x: any) => Number(x)).filter((x: number) => x > 0) : [];
      const existing = ids.length === 1 ? byId.get(ids[0]) || null : null;
      const status = String(candidate?.auditStatus || "");
      const safe = ids.length === 1 && status === "MATCHED_EXISTS" && Boolean(existing);
      const unregistered = ids.length === 0 && status === "POSSIBLY_MISSING_REVIEW_BEFORE_INSERT";
      const identity = String(candidate?.employeeId || "");
      const name = String(candidate?.name || "");
      const batch = Array.isArray(candidate?.sourceBatchNames) ? candidate.sourceBatchNames.filter(Boolean).join(", ") : "";
      const matchesSearch = !keyword || [name, identity, candidate?.nik, batch].some((x: any) => String(x || "").toLocaleLowerCase("id").includes(keyword));
      const matchesProduct = !productFilter || (Array.isArray(candidate?.mappedVaccineIds) && candidate.mappedVaccineIds.some((x: any) => String(x) === productFilter));
      if (!matchesSearch || !matchesProduct) return null;
      return { candidate, candidateIndex, existing, safe, unregistered, name, identity, batch, status };
    }).filter(Boolean) as any[];
  }, [v629NeedsReview, v629Preview, registrations, search, productFilter]);

  const pendingSelfBookings = useMemo(
    () => selfBookings.filter((booking: any) => String(booking?.booking_status || "").toUpperCase() === "PENDING"),
    [selfBookings],
  );

  const productSummary = useMemo(() => {
    const map = new Map<string, { id: string; name: string; count: number; stockLocation: number; registered: number; arrived: number; finalized: number; available: number }>();
    for (const registration of registrations) {
      const items = Array.isArray(registration.items) ? registration.items : [];
      for (const item of items) {
        const itemMode = String(item?.service_mode || "HEALTHDAY").toUpperCase() === "BAZAR" ? "BAZAR" : "HEALTHDAY";
        if (itemMode !== activeQueueView) continue;
        const name = item?.vaccine?.name || "Produk";
        const key = String(item?.vaccine_id || name);
        const stock = locationStockSummary[key] || {};
        const current = map.get(key) || {
          id: key,
          name,
          count: 0,
          stockLocation: Number(stock.stockLocation || 0),
          registered: Number(stock.registered || 0),
          arrived: Number(stock.arrived || 0),
          finalized: Number(stock.finalized || 0),
          available: Number(stock.available || 0),
        };
        current.count += 1;
        map.set(key, current);
      }
    }
    // V602: Show legacy imported benefit in product summaries, but do not
    // count it as an administered vaccine or as available stock.
    for (const registration of registrations) {
      const items = Array.isArray(registration?.items) ? registration.items : [];
      if (items.length || !registration?.vaccine_id || !registration?.vaccine?.name) continue;
      if (healthdayBazarEnabled && !serviceHasTrack(registration?.patient_service_status, activeQueueView === "BAZAR" ? "B" : "A")) continue;
      const key = String(registration.vaccine_id);
      const stock = locationStockSummary[key] || {};
      const current = map.get(key) || {
        id: key, name: String(registration.vaccine.name), count: 0,
        stockLocation: Number(stock.stockLocation || 0),
        registered: Number(stock.registered || 0),
        arrived: Number(stock.arrived || 0),
        finalized: Number(stock.finalized || 0),
        available: Number(stock.available || 0),
      };
      current.count += 1;
      map.set(key, current);
    }
    for (const [key, stock] of Object.entries(locationStockSummary)) {
      if (map.has(key)) continue;
      map.set(key, {
        id: key,
        name: String((stock as any)?.name || `Produk ${key}`),
        count: 0,
        stockLocation: Number((stock as any)?.stockLocation || 0),
        registered: Number((stock as any)?.registered || 0),
        arrived: Number((stock as any)?.arrived || 0),
        finalized: Number((stock as any)?.finalized || 0),
        available: Number((stock as any)?.available || 0),
      });
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, "id"));
  }, [registrations, locationStockSummary, activeQueueView]);

  const selectedStockSummary = useMemo(
    () => productSummary.find((item) => item.id === selectedStockProductId) || productSummary[0] || null,
    [productSummary, selectedStockProductId],
  );

  useEffect(() => {
    if (!productSummary.length) {
      if (selectedStockProductId) setSelectedStockProductId("");
      return;
    }
    if (!productSummary.some((item) => item.id === selectedStockProductId)) {
      setSelectedStockProductId(productSummary[0].id);
    }
  }, [productSummary, selectedStockProductId]);

  // V602: same participant set, two service views. The headline total is
  // intentionally not the sum of the service tracks: COMBINATION counts twice.
  const serviceCoverage = useMemo(() => {
    const stats = { total: registrations.length, healthday: 0, bazar: 0, both: 0, neither: 0, unlinkedHealthday: 0 };
    for (const row of registrations) {
      const a = serviceHasTrack(row?.patient_service_status, "A");
      const b = serviceHasTrack(row?.patient_service_status, "B");
      if (a) stats.healthday += 1;
      if (b) stats.bazar += 1;
      if (a && b) stats.both += 1;
      if (!a && !b) stats.neither += 1;
      if (a && row?.vaccine?.name && !(Array.isArray(row?.items) ? row.items : []).some((item: any) => String(item?.service_mode || "HEALTHDAY").toUpperCase() === "HEALTHDAY")) stats.unlinkedHealthday += 1;
    }
    return stats;
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
    const loadId = ++latestRegisterLoad.current;
    const requestedService = activeQueueView;
    if (!sessionId) {
      setRegistrations([]);
      setLocationStockSummary({});
      setLocationStockLoadError("");
      return;
    }
    const queriedSession = sessions.find((item: any) => String(item.id) === String(sessionId));
    if (sourceId && queriedSession && String(queriedSession.source_id || "") !== String(sourceId)) {
      // V571: do not load historical participants from a different database.
      setRegistrations([]);
      setLocationStockSummary({});
      setLocationStockLoadError("");
      return;
    }
    const params = new URLSearchParams();
    params.set("session_id", sessionId);
    if (sourceId) params.set("source_id", String(sourceId));
    const [json, stockJson] = await Promise.all([
      fetch(`/api/vaccination/register?${params.toString()}`, { cache: "no-store" }).then((r) => r.json()),
      fetch(`/api/vaccination/register-stock-summary?session_id=${encodeURIComponent(String(sessionId))}&service_mode=${encodeURIComponent(requestedService)}`, { cache: "no-store" }).then((r) => r.json()).catch(() => ({ ok: false, rows: [] })),
    ]);
    if (loadId !== latestRegisterLoad.current) return;
    if (json.ok) setRegistrations(json.registrations || []);
    else setError(json.message || "Gagal memuat registrasi.");
    if (stockJson?.ok) {
      const map: Record<string, any> = {};
      for (const row of stockJson.rows || []) map[String(row.vaccineId)] = row;
      setLocationStockSummary(map);
      setLocationStockLoadError("");
    } else {
      // Never represent an API failure as a factual zero inventory balance.
      setLocationStockSummary({});
      setLocationStockLoadError(String(stockJson?.message || stockJson?.error ||
        "API ringkasan stok tidak berhasil. Tidak ada stok yang dikurangi."));
    }
  }

  async function loadSelfBookings(sessionId = form.sessionId) {
    if (!sessionId) { setSelfBookings([]); return; }
    setSelfBookingLoading(true);
    try {
      const response = await fetch(`/api/vaccination/bazar-self-bookings?session_id=${encodeURIComponent(String(sessionId))}`, { cache: "no-store" });
      const json = await response.json().catch(() => ({}));
      if (!json.ok) {
        setSelfBookings([]);
        return;
      }
      setSelfBookings(Array.isArray(json.bookings) ? json.bookings : []);
      setSelfBookingCatalog(Array.isArray(json.catalog) ? json.catalog : []);
    } finally {
      setSelfBookingLoading(false);
    }
  }

  async function processSelfBooking() {
    if (!processingBooking) return;
    if (!bookingPaymentValidated) { setBookingProcessError("Centang Validasi Pembayaran sebelum memproses Self Booking."); return; }
    if (bookingPaymentMethod === "PREPAID_PREVIOUS_EVENT" && bookingPreviousPaymentReference.trim().length < 4) {
      setBookingProcessError("Isi referensi pembayaran event sebelumnya."); return;
    }
    setBookingProcessing(true);
    setBookingProcessError("");
    try {
      const submit = async (confirmedSeriesDoses: any[] = []) => {
        const response = await fetch("/api/vaccination/bazar-self-bookings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "PROCESS",
            bookingId: Number(processingBooking.id),
            paymentMethod: bookingPaymentMethod,
            previousPaymentReference: bookingPaymentMethod === "PREPAID_PREVIOUS_EVENT" ? bookingPreviousPaymentReference.trim() : undefined,
            paymentValidated: true,
            confirmedSeriesDoses,
          }),
        });
        const json = await response.json().catch(() => ({}));
        return { response, json };
      };
      let { response, json } = await submit();
      if (json?.requiresSeriesConfirmation === true && Array.isArray(json?.suggestions)) {
        const proposed = json.suggestions.map((item: any) => {
          const start = Number(item.toDose || 0);
          const end = start + Math.max(1, Number(item.quantity || 1)) - 1;
          return `${item.vaccineName}: lanjut dosis ke-${start}${end > start ? ` s.d. ${end}` : ""}`;
        }).join("\n");
        const accepted = window.confirm(
          `Peserta sudah memiliki pembelian dosis sebelumnya.\n\n${proposed}\n\n` +
          "Perubahan ini hanya untuk dosis Bazar yang belum dibeli, bukan suntikan otomatis hari ini. " +
          "Pastikan riwayat peserta dan jadwal medis sesuai.\n\nLanjutkan validasi pembayaran?",
        );
        if (!accepted) {
          setBookingProcessError("Pembayaran belum diproses. Konfirmasi dosis lanjutan dibatalkan operator.");
          return;
        }
        ({ response, json } = await submit(json.suggestions));
      }
      if (!json.ok || json?.requiresSeriesConfirmation === true) {
        const messageText = json.message || `Self Booking gagal diproses (${response.status}).`;
        setBookingProcessError(messageText);
        if (response.status === 409 && String(messageText).toLowerCase().includes("produk bazar")) window.alert(messageText);
        return;
      }
      setMessage(json.message || "Self Booking berhasil diproses.");
      setProcessingBooking(null);
      setBookingPaymentValidated(false);
      setBookingProcessError("");
      await Promise.all([loadSelfBookings(form.sessionId), loadRegistrations(form.sessionId, selectedSourceId)]);
    } catch (error: any) {
      setBookingProcessError(error?.message || "Tidak dapat menghubungi server. Coba lagi.");
    } finally {
      setBookingProcessing(false);
    }
  }

  function openSelfBookingEdit(booking: any) {
    const selectedItems = (Array.isArray(booking?.selected_items) ? booking.selected_items : []).map((item: any) => ({
      vaccineId: Number(item?.vaccineId || 0),
      lotId: Number(item?.lotId || 0),
      vaccineName: item?.vaccineName || "Produk Bazar",
      lotNumber: item?.lotNumber || "-",
      saleMode: String(item?.saleMode || "NON_PACKAGE").toUpperCase() === "PACKAGE" ? "PACKAGE" : "NON_PACKAGE",
      quantity: Number(item?.quantity || 1),
      startDose: Number(item?.startDose || 1),
    }));
    setEditingSelfBooking({
      id: Number(booking?.id || 0),
      participantName: booking?.participant_name || "",
      employeeId: booking?.employee_id || "",
      nik: booking?.nik || "",
      email: booking?.email || "",
      phone: booking?.phone || "",
      selectedItems,
      addKey: "",
    });
  }

  function selfBookingCatalogItem(vaccineId: any, lotId: any) {
    return selfBookingCatalog.find((item: any) => Number(item?.vaccineId || 0) === Number(vaccineId || 0) && Number(item?.lotId || 0) === Number(lotId || 0));
  }

  function addSelfBookingEditItem() {
    if (!editingSelfBooking?.addKey) return;
    const [vaccineIdRaw, lotIdRaw] = String(editingSelfBooking.addKey).split(":");
    const item = selfBookingCatalogItem(Number(vaccineIdRaw), Number(lotIdRaw));
    if (!item) return;
    if ((editingSelfBooking.selectedItems || []).some((row: any) => Number(row.vaccineId) === Number(item.vaccineId) && Number(row.lotId) === Number(item.lotId))) return;
    const nonPackage = (item.salesOptions || []).find((option: any) => String(option?.saleMode || "").toUpperCase() === "NON_PACKAGE");
    const first = nonPackage || (item.salesOptions || [])[0];
    setEditingSelfBooking({
      ...editingSelfBooking,
      addKey: "",
      selectedItems: [...(editingSelfBooking.selectedItems || []), {
        vaccineId: Number(item.vaccineId),
        lotId: Number(item.lotId),
        vaccineName: item.vaccineName || "Produk Bazar",
        lotNumber: item.lotNumber || "-",
        saleMode: String(first?.saleMode || "NON_PACKAGE").toUpperCase() === "PACKAGE" ? "PACKAGE" : "NON_PACKAGE",
        quantity: 1,
        startDose: 1,
      }],
    });
  }

  async function saveSelfBookingEdit() {
    if (!editingSelfBooking?.id) return;
    if (!(editingSelfBooking.selectedItems || []).length) { setError("Self Booking harus memiliki minimal satu produk Bazar."); return; }
    setSelfBookingEditSaving(true);
    setError("");
    try {
      const response = await fetch("/api/vaccination/bazar-self-bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "UPDATE",
          bookingId: Number(editingSelfBooking.id),
          participantName: editingSelfBooking.participantName,
          nik: editingSelfBooking.nik,
          email: editingSelfBooking.email,
          phone: editingSelfBooking.phone,
          selectedItems: editingSelfBooking.selectedItems,
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!json.ok) { setError(json.message || "Self Booking gagal diperbarui."); return; }
      setMessage(json.message || "Self Booking berhasil diperbarui.");
      setEditingSelfBooking(null);
      await loadSelfBookings(form.sessionId);
    } catch (error: any) {
      setError(error?.message || "Tidak dapat menyimpan perubahan Self Booking.");
    } finally {
      setSelfBookingEditSaving(false);
    }
  }

  async function registerExternalParticipant(registration: any) {
    const registrationId = Number(registration?.id || 0);
    if (!registrationId) return;
    setRegisteringExternalId(registrationId);
    setError("");
    try {
      const response = await fetch("/api/vaccination/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "mark-external-arrived",
          registrationId,
          serviceMode: activeQueueView,
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!json.ok) { setError(json.message || "Peserta gagal didaftarkan ke Tim Validasi."); return; }
      setMessage(json.message || `${registration?.participant_name || "Peserta"} masuk Menunggu Validasi.`);
      await loadRegistrations(form.sessionId, selectedSourceId);
    } catch (err: any) {
      setError(err?.message || "Peserta gagal didaftarkan ke Tim Validasi.");
    } finally {
      setRegisteringExternalId(null);
    }
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
      vendorQueueHealthday: String(registration.queue_number || ""),
      vendorQueueBazar: String(registration.bazar_queue_number || ""),
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
      setError("Untuk Child / Family, pilih data Parent yang sudah terdaftar terlebih dahulu.");
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
        body: JSON.stringify({
          action: "update-products",
          registrationId: edit.registration.id,
          items: edit.items,
          changeNote: edit.changeNote,
          vendorQueueHealthday: edit.vendorQueueHealthday,
          vendorQueueBazar: edit.vendorQueueBazar,
        }),
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
    if (healthdayBazarEnabled) params.set("service_mode", activeQueueView);
    window.open(`/api/vaccination/dashboard?${params.toString()}`, "_blank");
  }

  // V630: only verified BINUS Child sessions. Source records are SEARCH OPTIONS, not registrations.
  // Reload on session/source change; no write and no automatic queue release.
  useEffect(() => {
    if (!v629NeedsReview) return;
    let active = true;
    const controller = new AbortController();
    setV629PreviewLoading(true);
    setV629PreviewError("");
    void (async () => {
      try {
        const response = await fetch(
          `/api/vaccination/import-corporate?session_id=${form.sessionId}&mode=v629-preview`,
          { cache: "no-store", signal: controller.signal },
        );
        const json = await response.json();
        if (!response.ok || !json?.ok || Number(json?.sessionId) !== Number(form.sessionId) || Number(json?.sourceId) !== 49) {
          throw new Error(json?.message || "Daftar peserta BINUS Anak belum tersedia.");
        }
        if (active) setV629Preview(json);
      } catch (error: any) {
        if (active) {
          setV629Preview(null);
          setV629PreviewError(String(error?.message || "Gagal membaca peserta BINUS Anak."));
        }
      } finally {
        if (active) setV629PreviewLoading(false);
      }
    })();
    return () => { active = false; controller.abort(); };
  }, [v629NeedsReview, form.sessionId]);

  async function loadV629Preview() {
    if (!v629NeedsReview || v629PreviewLoading) return;
    setV629PreviewError("");
    setV629PreviewLoading(true);
    try {
      const response = await fetch(`/api/vaccination/import-corporate?session_id=${form.sessionId}&mode=v629-preview`, { cache: "no-store" });
      const json = await response.json();
      if (!response.ok || !json?.ok || Number(json.sessionId) !== Number(form.sessionId) || Number(json.sourceId) !== 49) {
        setV629PreviewError(json?.message || "Gagal membaca preview V630.");
        return;
      }
      setV629Preview(json);
    } catch {
      setV629PreviewError("Tidak dapat membaca preview. Periksa deployment V629 dan koneksi.");
    } finally {
      setV629PreviewLoading(false);
    }
  }

  async function importCorporate() {
    if (!form.sessionId) { setError("Pilih session terlebih dahulu."); return; }
    const sourceId = selectedSourceId;
    if (!sourceId) { setError("Session belum memiliki sumber data peserta. Pilih sumber data terlebih dahulu."); return; }
    if (sessionSourceMismatch || String(selectedSession?.source_id || "") !== String(sourceId)) {
      setError("Session tidak terhubung dengan database peserta yang dipilih. Pilih Session yang sesuai terlebih dahulu.");
      return;
    }
    setImporting(true);
    setError("");
    setMessage("Memuat peserta...");
    try {
      const json = await fetch("/api/vaccination/import-corporate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: Number(form.sessionId), sourceId: Number(sourceId), defaultVaccineId: Number(form.vaccineId || 0), defaultLotId: Number(form.lotId || 0), defaultVaccineIds: selectedVaccineIds.map((id) => Number(id)).filter(Boolean) }),
      }).then((r) => r.json());
      if (!json.ok) {
        if (String(json.message || "").startsWith("V629 SAFETY STOP:")) {
          setError("");
          setMessage("Import ulang tidak dijalankan: registrasi lama dilindungi. Buka audit peserta BINUS Anak pada Session terpilih. Tidak ada peserta yang dihapus.");
        } else {
          setMessage("");
          setError(json.message || "Gagal memuat peserta.");
        }
        return;
      }
      setMessage(json.message || "Peserta berhasil dimuat. Nomor antrean belum dirilis.");
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

  useEffect(() => {
    loadRegistrations(form.sessionId, selectedSourceId);
    loadSelfBookings(form.sessionId);
  }, [form.sessionId, selectedSourceId]);

  useEffect(() => {
    if (!form.sessionId) return;
    void loadRegistrations(form.sessionId, selectedSourceId);
  }, [activeQueueView]);

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
    if (edit || processingBooking || editingSelfBooking) document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [edit, processingBooking, editingSelfBooking]);

  return (
    <main className="p-6">
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Registrasi Vaksin</h1>
            <p className="mt-2 text-sm text-slate-600">Dashboard antrian registrasi, edit produk layanan, harga/payment note, dan export per stage.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href="/vaccination/history" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-800 hover:bg-emerald-100">Riwayat Layanan</a>
            <a href="/vaccination" className="rounded-xl border px-4 py-2 text-sm font-bold hover:bg-slate-50">☰ Menu Vaksinasi</a>
          </div>
        </div>

        {error ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{error}</div> : null}
        {message ? <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800">{message}</div> : null}

        <section className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          {[{ label: "Jumlah Peserta", value: v629NeedsReview && Array.isArray(v629Preview?.candidates) ? v629Preview.candidates.length : summary.total }, { label: "Nomor Antrian", value: summary.current }, { label: "Belum Datang", value: v629NeedsReview && Array.isArray(v629Preview?.candidates) ? summary.notArrived + Math.max(0, v629Preview.candidates.length - registrations.length) : summary.notArrived }, { label: "Menunggu", value: summary.waiting }, { label: "Dalam Tindakan", value: summary.doctor }, { label: "Selesai", value: summary.done }].map((card) => (
            <div key={card.label} className="rounded-2xl border bg-slate-50 p-4">
              <div className="text-xs font-black uppercase text-slate-500">{card.label}</div>
              <div className="mt-2 text-2xl font-black text-slate-900">{card.value}</div>
            </div>
          ))}
        </section>

        {productSummary.length ? (
          <section className="mt-4 rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="text-xs font-black uppercase tracking-wide text-blue-700">Ringkasan Stok {activeQueueView === "BAZAR" ? "Bazar" : "Healthday"}</div>
                <div className="mt-1 text-xs font-semibold text-slate-500">Hanya produk {activeQueueView === "BAZAR" ? "Bazar" : "Healthday"} pada Session yang dipilih.</div>
              </div>
              <select
                className="w-full rounded-xl border border-blue-200 bg-white px-3 py-2.5 text-sm font-black text-slate-800 lg:max-w-md"
                value={selectedStockSummary?.id || ""}
                onChange={(e) => setSelectedStockProductId(e.target.value)}
              >
                {productSummary.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </div>
            {locationStockLoadError ? (
              <div className="mt-3 rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-900">
                Ringkasan stok belum berhasil dimuat: {locationStockLoadError}. Ini bukan berarti stok nol. Periksa API sebelum merilis tindakan.
              </div>
            ) : null}
            {selectedStockSummary && !locationStockLoadError ? (
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                <div className="rounded-xl bg-white px-3 py-2"><div className="text-[10px] font-black uppercase text-slate-500">Terdaftar</div><div className="mt-1 text-xl font-black">{selectedStockSummary.registered}</div></div>
                <div className="rounded-xl bg-white px-3 py-2"><div className="text-[10px] font-black uppercase text-slate-500">Sudah Datang</div><div className="mt-1 text-xl font-black">{selectedStockSummary.arrived}</div>{selectedStockSummary.finalized > 0 ? <div className="mt-1 text-[10px] font-bold text-emerald-700">{selectedStockSummary.finalized} sudah selesai</div> : null}</div>
                <div className="rounded-xl bg-white px-3 py-2"><div className="text-[10px] font-black uppercase text-slate-500">Stok Lokasi</div><div className="mt-1 text-xl font-black">{selectedStockSummary.stockLocation}</div></div>
                <div className={`rounded-xl px-3 py-2 ${selectedStockSummary.available > 0 ? "bg-emerald-100" : "bg-rose-100"}`}><div className="text-[10px] font-black uppercase text-slate-600">Sisa Bisa Didaftarkan</div><div className={`mt-1 text-xl font-black ${selectedStockSummary.available > 0 ? "text-emerald-800" : "text-rose-700"}`}>{selectedStockSummary.available}</div></div>
                <div className="rounded-xl bg-white px-3 py-2"><div className="text-[10px] font-black uppercase text-slate-500">Total Data Produk</div><div className="mt-1 text-xl font-black">{selectedStockSummary.count}</div></div>
              </div>
            ) : null}
          </section>
        ) : null}

        <section className="mt-6 rounded-2xl border bg-slate-50 p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <h2 className="font-bold">1. Pilih Session & Database</h2>
            <button
              type="button"
              onClick={() => saveContextLock(!contextLocked)}
              className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-black ${contextLocked ? "border-amber-200 bg-amber-50 text-amber-800" : "bg-white text-slate-700 hover:bg-slate-50"}`}
              title={contextLocked ? "Klik untuk membuka kunci pilihan" : "Klik untuk mengunci pilihan session, sumber data, dan vaksin"}
            >
              <span>{contextLocked ? "🔒" : "🔓"}</span>
              <span>{contextLocked ? "Pilihan Terkunci" : "Kunci Pilihan"}</span>
            </button>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <select disabled={contextLocked} className="rounded-xl border px-3 py-2.5 disabled:bg-slate-100" value={sessionSourceMismatch ? "" : form.sessionId} onChange={(e) => setForm((prev) => ({ ...prev, sessionId: e.target.value }))}>
              <option value="">Pilih session sesuai database</option>
              {sessionsForSelectedSource.map((session: any) => <option key={session.id} value={session.id}>{sessionLabel(session)}</option>)}
            </select>
            <select
              disabled={contextLocked}
              className="rounded-xl border px-3 py-2.5 disabled:bg-slate-100"
              value={selectedSourceId}
              onChange={(e) => {
                // V571: changing the source cannot keep a Session from another database.
                setForm((prev) => ({ ...prev, sourceId: e.target.value, sessionId: "", vaccineId: "", lotId: "" }));
                setSelectedVaccineIds([]);
                setRegistrations([]);
                setLocationStockSummary({});
                setSelfBookings([]);
                setError("");
                setMessage("");
              }}
            >
              <option value="">Pilih sumber data peserta</option>
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
          {selectedSourceId && !sessionsForSelectedSource.length ? (
            <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-900">
              Database {selectedSourceName || "terpilih"} belum memiliki Session terhubung. Data peserta belum boleh dimuat ke Session database lain. Periksa hubungan sumber data dan Session pada Setup.
            </p>
          ) : null}
          {sessionSourceMismatch ? (
            <p className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-800">
              Session dan database peserta tidak cocok. {contextLocked ? "Buka kunci pilihan terlebih dahulu." : "Pilih Session yang terhubung dengan database ini."}
            </p>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" onClick={importCorporate} disabled={importing || v629ExistingImportLocked || !form.sessionId || !selectedSourceId || sessionSourceMismatch || !sessionsForSelectedSource.some((session: any) => String(session.id) === String(form.sessionId))} className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60" title={v629ExistingImportLocked ? "Registrasi existing dilindungi. Jangan impor ulang sebelum rekonsiliasi identitas dan produk." : "Muat peserta"}>{importing ? "Memuat..." : v629ExistingImportLocked ? "Import BINUS Anak Dikunci" : "Muat Peserta"}</button>
            <a href="/vaccination/session" className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50">Atur Session</a>
          </div>
          {v629ExistingImportLocked ? (
            <p className="mt-2 text-xs text-slate-600">
              {registrations.length} registrasi existing tetap tersimpan. Import massal BINUS Anak dinonaktifkan; seluruh peserta sumber dapat dicari melalui Registrasi Ulang.
            </p>
          ) : null}
          {v629NeedsReview ? (
            <details className="mt-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
              <summary className="cursor-pointer font-semibold text-slate-700">Audit kandidat BINUS Anak (read-only, tanpa import)</summary>
              <p className="mt-2">Membandingkan data sumber dan registrasi existing. Tidak menambah peserta, item vaksin, nomor antrean, atau stok.</p>
              <button type="button" onClick={() => void loadV629Preview()} disabled={v629PreviewLoading} className="mt-2 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50">
                {v629PreviewLoading ? "Memeriksa..." : "Lihat hasil audit kandidat"}
              </button>
              {v629PreviewError ? <p className="mt-2 text-xs font-semibold text-red-700">{v629PreviewError}</p> : null}
              {v629Preview ? (
                <div className="mt-3 rounded-lg border bg-slate-50 p-3">
                  <p className="font-semibold">Sumber: {v629Preview.sourceTable || "-"} · Baris sumber: {v629Preview.importedSourceRows ?? "-"} · Kandidat: {v629Preview.personsGroupedByNameAndNik ?? "-"} · Registrasi: {v629Preview.existingRegistrations ?? "-"} · Perlu review: {v629Preview.missingCandidateCount ?? "-"}</p>
                  <p className="mt-1 text-[11px] text-amber-800">{v629Preview.sourceNote || "Angka kandidat bukan persetujuan pembuatan registrasi. Identitas dan item vaksin harus diverifikasi terlebih dahulu."}</p>
                  <p className="mt-2 text-[11px] font-semibold text-slate-600">Semua peserta sumber kini dapat dicari langsung lewat <strong>Registrasi Ulang → Peserta di Lokasi Ini</strong>. Peserta tanpa registrasi tetap perlu konfirmasi identitas dan vaksin saat datang.</p>
                </div>
              ) : null}
            </details>
          ) : null}
        </section>

        <section className="mt-6 rounded-2xl border bg-slate-50 p-5">
          <h2 className="text-2xl font-black">2. Registrasi Ulang Manual / Walk-in</h2>
          <p className="mt-1 text-sm text-slate-500">Pilih peserta yang terdaftar atau cari peserta lain, lalu lengkapi layanan sesuai kebutuhan.</p>

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
              sessionCandidates={v629NeedsReview && Number(v629Preview?.sessionId) === Number(form.sessionId) && Number(v629Preview?.sourceId) === 49
                ? (Array.isArray(v629Preview?.candidates) ? v629Preview.candidates : [])
                : []}
              sessionCandidatesLoading={v629NeedsReview && v629PreviewLoading}
              sessionCandidatesError={v629NeedsReview ? v629PreviewError : ""}
              v629SelectionRequest={v629NeedsReview ? v629ChildSelection : null}
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
                          Untuk Child / Family, pilih Parent yang sesuai agar hubungan keluarga tercatat dengan benar.
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
                                      .join(" · ") || "Identitas Parent tersimpan"}
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
                                              .join(" · ") || "Riwayat Perusahaan"}
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
                                    Data Parent belum ditemukan. Pilih Parent yang sudah terdaftar agar hubungan keluarga tercatat dengan benar.
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
                        Pastikan Parent dan Child/Family yang dipilih sudah sesuai.
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
                        Hubungkan Parent ke data yang sudah terdaftar
                      </div>
                      <div className="mt-1 text-[11px] font-semibold text-slate-500">
                        Disarankan untuk Parent agar Family Queue bisa menemukan semua anggota keluarga.
                      </div>

                      {edit.historyPersonId ? (
                        <div className="mt-3 flex flex-col gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <div className="text-sm font-black text-emerald-950">
                              {edit.historyPersonName || edit.registration.participant_name || "Parent terdaftar"}
                            </div>
                            <div className="mt-1 text-xs font-semibold text-emerald-800">
                              ID Riwayat #{edit.historyPersonId}
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
                              Parent tetap dapat disimpan. Untuk pengelompokan keluarga, hubungkan Parent ke data yang sudah terdaftar.
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
                              {edit.parentName || "Parent terdaftar"}
                            </div>
                            <div className="mt-1 text-xs font-semibold text-emerald-800">
                              {[edit.parentEmployeeId, edit.parentNik, edit.parentEmail]
                                .filter(Boolean)
                                .join(" · ") || `ID Riwayat #${edit.parentHistoryPersonId}`}
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
                      Mencari data riwayat...
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
                                .join(" · ") || "Riwayat Perusahaan"}
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

                {((editHasHealthday && !editHealthdayQueueEnabled) || (editHasBazar && !editBazarQueueEnabled)) ? (
                  <div className="mb-4 rounded-2xl border border-cyan-200 bg-cyan-50 p-4">
                    <div className="text-xs font-black uppercase tracking-wide text-cyan-800">Nomor Antrean Vendor</div>
                    <div className="mt-1 text-xs font-semibold text-slate-600">
                      Isi nomor antrean dari sistem vendor untuk layanan yang tidak menggunakan antrean internal.
                    </div>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      {editHasHealthday && !editHealthdayQueueEnabled ? (
                        <label className="text-xs font-black text-slate-700">
                          Healthday
                          <input
                            value={edit.vendorQueueHealthday}
                            onChange={(event) => setEdit({ ...edit, vendorQueueHealthday: event.target.value })}
                            placeholder="Contoh: HD-014 / 014"
                            className="mt-1 block w-full rounded-xl border border-cyan-200 bg-white px-3 py-2.5 text-sm font-black text-slate-900"
                          />
                        </label>
                      ) : null}
                      {editHasBazar && !editBazarQueueEnabled ? (
                        <label className="text-xs font-black text-slate-700">
                          Bazar
                          <input
                            value={edit.vendorQueueBazar}
                            onChange={(event) => setEdit({ ...edit, vendorQueueBazar: event.target.value })}
                            placeholder="Contoh: BZ-014 / 014"
                            className="mt-1 block w-full rounded-xl border border-cyan-200 bg-white px-3 py-2.5 text-sm font-black text-slate-900"
                          />
                        </label>
                      ) : null}
                    </div>
                  </div>
                ) : null}

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
                          <option value="PREPAID_PREVIOUS_EVENT">Sudah Lunas - Suntikan Lanjutan</option>
                        </select>
                      ) : (
                        <input disabled={isDoneStatus(item.status)} className="rounded-xl border px-3 py-2.5 disabled:bg-slate-100" placeholder="Payment note / metode" value={item.paymentNote || item.paymentMethod} onChange={(e) => updateEditItem(index, { paymentNote: e.target.value })} />
                      )}
                      {healthdayBazarEnabled && item.serviceMode === "BAZAR" && item.paymentMethod === "PREPAID_PREVIOUS_EVENT" && !isDoneStatus(item.status) ? (
                        <input className="rounded-xl border border-violet-300 bg-violet-50 px-3 py-2.5" placeholder="Bukti bayar sebelumnya (wajib)" value={item.paymentNote || ""} onChange={(e) => updateEditItem(index, { paymentNote: e.target.value, saleMode: "NON_PACKAGE", packageDoseCount: 1 })} />
                      ) : null}
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

        {healthdayBazarEnabled && activeQueueView === "BAZAR" ? (
          <section className="mt-6 overflow-hidden rounded-2xl border border-violet-200 bg-white">
            <div className="flex flex-col gap-3 border-b border-violet-100 bg-violet-50/70 p-4 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="font-black text-violet-900">Penampungan Self Booking Bazar</div>
                <div className="mt-1 text-xs font-semibold text-violet-700">Pendaftaran mandiri belum masuk Registrasi sampai pembayaran divalidasi oleh tim.</div>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-violet-700">{pendingSelfBookings.length} menunggu</span>
                <button type="button" onClick={() => void loadSelfBookings(form.sessionId)} className="rounded-xl border border-violet-200 bg-white px-3 py-2 text-xs font-black text-violet-700">{selfBookingLoading ? "Memuat..." : "Refresh"}</button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-[980px] w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="p-3 text-left">Waktu</th>
                    <th className="p-3 text-left">Peserta</th>
                    <th className="p-3 text-left">NIK Karyawan / BINUSIAN ID</th>
                    <th className="p-3 text-left">Produk Bazar</th>
                    <th className="p-3 text-left">Estimasi</th>
                    <th className="p-3 text-left">Status</th>
                    <th className="p-3 text-left">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {pendingSelfBookings.map((booking: any) => {
                    const items = Array.isArray(booking?.selected_items) ? booking.selected_items : [];
                    return (
                      <tr key={`self-booking-${booking.id}`} className="align-top hover:bg-violet-50/30">
                        <td className="p-3 text-xs font-semibold text-slate-500">{booking.submitted_at ? new Date(booking.submitted_at).toLocaleString("id-ID") : "-"}</td>
                        <td className="p-3"><div className="font-black text-slate-900">{booking.participant_name || "-"}</div><div className="mt-1 text-xs text-slate-500">{booking.company_name || "-"}</div></td>
                        <td className="p-3 font-bold">{booking.employee_id || "-"}</td>
                        <td className="p-3">
                          <div className="space-y-1">{items.map((item: any, index: number) => <div key={`${booking.id}-${index}`} className="rounded-lg bg-slate-50 px-2 py-1 text-xs font-bold">{item.vaccineName || "Produk Bazar"} · Lot {item.lotNumber || "-"} · {String(item.saleMode || "NON_PACKAGE").toUpperCase() === "PACKAGE" ? "Paket" : `Non Paket · ${Number(item.quantity || 1)} dosis`} · mulai dosis {Number(item.startDose || 1)}</div>)}</div>
                        </td>
                        <td className="p-3 font-black text-violet-700">{money(booking.estimated_total)}</td>
                        <td className="p-3"><span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-800">Menunggu Proses</span></td>
                        <td className="p-3"><div className="flex flex-wrap gap-2"><button type="button" onClick={() => openSelfBookingEdit(booking)} className="rounded-xl border border-violet-200 bg-white px-3 py-2 text-xs font-black text-violet-700 hover:bg-violet-50">Edit</button><button type="button" onClick={() => { setProcessingBooking(booking); setBookingPaymentMethod("QRIS"); setBookingPreviousPaymentReference(""); setBookingPaymentValidated(false); setBookingProcessError(""); }} className="rounded-xl bg-violet-600 px-4 py-2 text-xs font-black text-white hover:bg-violet-700">Process</button></div></td>
                      </tr>
                    );
                  })}
                  {!pendingSelfBookings.length ? <tr><td colSpan={7} className="p-5 text-center text-sm font-semibold text-slate-500">Belum ada Self Booking Bazar yang menunggu diproses.</td></tr> : null}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {v629NeedsReview && activeQueueView === "HEALTHDAY" ? (
          <section className="mt-6 overflow-hidden rounded-2xl border">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-slate-50 p-4">
              <div>
                <div className="font-bold">Pencatatan Healthday · {Array.isArray(v629Preview?.candidates) ? v629Preview.candidates.length : registrations.length} peserta BINUS Anak</div>
                <div className="mt-1 text-xs text-slate-600">{registrations.length} registrasi existing · sumber peserta untuk Session {form.sessionId} · antrean tetap dirilis hanya saat peserta datang</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => exportStage("all")} className="rounded-xl border bg-white px-3 py-2 text-xs font-bold">Export Registrasi Existing</button>
                <button type="button" onClick={() => exportStage("no_queue")} className="rounded-xl border bg-white px-3 py-2 text-xs font-bold">Export Belum Datang Existing</button>
              </div>
              <div className="flex w-full flex-wrap gap-2">
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari nama / BINUSIAN ID / NIK..." className="w-full rounded-xl border bg-white px-3 py-2 text-sm sm:w-80" />
                <select value={productFilter} onChange={(e) => setProductFilter(e.target.value)} className="w-full rounded-xl border bg-white px-3 py-2 text-sm sm:w-64">
                  <option value="">Semua Produk Healthday</option>
                  {registrationProductOptions.map((opt) => <option key={opt.id} value={opt.id}>{opt.name}</option>)}
                </select>
              </div>
            </div>
            <div className="max-h-[560px] overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 bg-slate-100 text-xs uppercase text-slate-600">
                  <tr>
                    <th className="p-3 text-left">No. Antrean</th>
                    <th className="p-3 text-left">Nama</th>
                    <th className="p-3 text-left">BINUSIAN ID / NIK</th>
                    <th className="p-3 text-left">Produk / Batch</th>
                    <th className="p-3 text-left">Status</th>
                    <th className="p-3 text-left">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {v629ChildRows.map((entry: any) => {
                    const row = entry.existing;
                    const number = String(row?.queue_number || "").trim();
                    const qStatus = String(row?.queue_status || "").toUpperCase();
                    const label = number ? statusInfo(qStatus).label : "Belum Datang";
                    const blocked = !(entry.safe || entry.unregistered);
                    return (
                      <tr key={`v6295-child-${entry.candidateIndex}`} className="hover:bg-slate-50">
                        <td className="p-3 text-xs font-semibold">{number || <span className="rounded-full bg-amber-100 px-2 py-1 text-amber-800">Belum isi No. Antrean</span>}</td>
                        <td className="p-3 font-bold">{entry.name}</td>
                        <td className="p-3 text-xs">{entry.identity || entry.candidate?.nik || "-"}</td>
                        <td className="p-3 text-xs">{entry.batch || "Perlu verifikasi produk"}</td>
                        <td className="p-3"><span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-bold text-white">{label}</span></td>
                        <td className="p-3">
                          {blocked ? <span className="text-xs font-semibold text-amber-700">Periksa identitas / produk</span> : (
                            <button
                              type="button"
                              onClick={() => setV629ChildSelection((prev) => ({
                                token: Number(prev?.token || 0) + 1,
                                ...(entry.safe ? { registrationId: Number(row.id) } : { candidateIndex: entry.candidateIndex }),
                              }))}
                              className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700"
                            >Daftarkan</button>
                          )}
                          {row ? <button type="button" onClick={() => openEditProducts(row)} className="ml-2 rounded-xl border bg-white px-3 py-2 text-xs font-bold">Edit Produk</button> : null}
                        </td>
                      </tr>
                    );
                  })}
                  {!v629ChildRows.length ? <tr><td colSpan={6} className="p-5 text-center text-slate-500">{v629PreviewLoading ? "Memuat data peserta BINUS Anak..." : "Data belum tersedia atau tidak sesuai pencarian. Registrasi existing tetap aman."}</td></tr> : null}
                </tbody>
              </table>
            </div>
            <p className="border-t bg-slate-50 px-4 py-2 text-xs text-slate-600">Daftarkan membuka Registrasi Ulang untuk verifikasi; tidak membuat antrean, tindakan, atau stok secara otomatis. Label Belum Datang bukan bukti vaksinasi belum dilakukan.</p>
          </section>
        ) : (
        <section className="mt-6 overflow-hidden rounded-2xl border">
          <div className="flex flex-col gap-3 border-b bg-slate-50 p-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="font-bold">{internalQueueEnabled
                ? (healthdayBazarEnabled
                    ? `Antrean ${activeQueueView === "BAZAR" ? "Bazar" : "Healthday"} · ${queueReadyRegistrations.length} peserta`
                    : `Registrasi Session Ini · ${registrations.length} peserta`)
                : (healthdayBazarEnabled
                    ? `Pencatatan ${activeQueueView === "BAZAR" ? "Bazar" : "Healthday"} · ${queueReadyRegistrations.length} peserta`
                    : `Pencatatan Session Ini · ${registrations.length} peserta`)}</div>
              {healthdayBazarEnabled ? (
                <div className="mt-2 text-xs font-semibold text-slate-600">
                  Total Session <b>{serviceCoverage.total}</b> · Healthday <b>{serviceCoverage.healthday}</b> · Bazar <b>{serviceCoverage.bazar}</b> · Keduanya <b>{serviceCoverage.both}</b>
                  {serviceCoverage.neither > 0 ? <> · Perlu cek layanan <b>{serviceCoverage.neither}</b></> : null}
                  <span className="mt-1 block text-[11px] text-slate-500">Pencarian nama/ID menjangkau seluruh Session. Peserta dari layanan lain hanya ditampilkan sebagai referensi, tanpa tombol tindakan.</span>
                </div>
              ) : null}
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <input
                  className="w-full rounded-xl border bg-white px-3 py-2.5 text-sm xl:w-72"
                  placeholder="Cari nama / Employee ID / NIK..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <select
                  value={productFilter}
                  onChange={(e) => setProductFilter(e.target.value)}
                  className="w-full rounded-xl border bg-white px-3 py-2.5 text-sm font-bold sm:w-64"
                >
                  <option value="">Semua Produk {activeQueueView === "BAZAR" ? "Bazar" : "Healthday"}</option>
                  {registrationProductOptions.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
                </select>
              </div>
              {selectedStockSummary && !locationStockLoadError ? (
                <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-blue-100 bg-blue-50/70 px-3 py-2 text-[11px] font-black text-slate-700">
                  <span className="text-blue-800">Stok · {selectedStockSummary.name}</span>
                  <span className="rounded-full bg-white px-2 py-1">Lokasi {selectedStockSummary.stockLocation}</span>
                  <span className="rounded-full bg-white px-2 py-1">Terdaftar {selectedStockSummary.registered}</span>
                  <span className="rounded-full bg-white px-2 py-1">Datang {selectedStockSummary.arrived}</span>
                  <span className="rounded-full bg-white px-2 py-1">Selesai {selectedStockSummary.finalized}</span>
                  <span className={`rounded-full px-2 py-1 ${selectedStockSummary.available > 0 ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-700"}`}>Sisa {selectedStockSummary.available}</span>
                </div>
              ) : null}
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
                    {activeQueueView === "BAZAR" ? <><th className="p-3 text-left">Payment Method</th><th className="p-3 text-left">Jenis Pendaftaran</th></> : null}
                    <th className="p-3 text-left">{sortButton("Note", "note")}</th>
                    <th className="p-3 text-left">Aksi Data</th>
                  </tr>
                ) : (
                  <tr>
                    <th className="p-3 text-left">{sortButton(internalQueueEnabled ? "Antrian" : "No. Antrean Vendor", "queue")}</th>
                    <th className="p-3 text-left">{sortButton("Nama", "name")}</th>
                    <th className="p-3 text-left">{sortButton("NIK Karyawan / BINUSIAN ID", "identity")}</th>
                    <th className="p-3 text-left">{sortButton("Produk / Harga", "product")}</th>
                    {activeQueueView === "BAZAR" ? <><th className="p-3 text-left">Payment Method</th><th className="p-3 text-left">Jenis Pendaftaran</th></> : null}
                    <th className="p-3 text-left">{sortButton("Status", "status")}</th>
                    <th className="p-3 text-left">{sortButton("Note", "note")}</th>
                    <th className="p-3 text-left">Aksi</th>
                  </tr>
                )}
              </thead>
              <tbody className="divide-y">
                {visibleRegistrations.map((registration) => {
                  // Search result from a different track must not expose active
                  // queue, register or edit actions in the current service.
                  const inCurrentTrack = !healthdayBazarEnabled || serviceHasTrack(
                    registration?.patient_service_status, activeQueueView === "BAZAR" ? "B" : "A",
                  );
                  if (!inCurrentTrack) return (
                    <tr key={registration.id} className="bg-amber-50/70">
                      <td colSpan={activeQueueView === "BAZAR" ? 9 : 7} className="p-3 text-xs text-amber-900">
                        <b>{registration.participant_name || "Peserta"}</b> · {registration.employee_id || registration.mcu_id || "ID belum ada"}
                        <span className="ml-2 rounded-full bg-amber-100 px-2 py-1 font-bold">
                          Terdaftar di {String(registration?.patient_service_status || "").toUpperCase() === "BAZAR" ? "Bazar" : "layanan lain"}; bukan {activeQueueView}
                        </span>
                        <span className="ml-2 text-amber-700">Hanya hasil pencarian. Buka layanan yang sesuai untuk tindakan.</span>
                      </td>
                    </tr>
                  );
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
                  const activeTrackNumber = healthdayBazarEnabled && activeQueueView === "BAZAR"
                    ? String(registration?.bazar_queue_number || "").trim()
                    : String(registration?.queue_number || "").trim();
                  const activeTrackInfo = healthdayBazarEnabled && activeQueueView === "BAZAR" ? bazarInfo : info;
                  const activePaymentMethod = items.find((item: any) => String(item?.payment_method || "").trim())?.payment_method || (activeQueueView === "BAZAR" ? registration?.payment_method : "");
                  const registrationType = registrationTypeLabel(registration);

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
                            )) : (
                              <span className={registration?.vaccine?.name ? "font-bold text-slate-700" : "font-semibold text-amber-700"}>
                                {registration?.vaccine?.name || "Item vaksin belum tercatat"}
                                {registration?.vaccine?.name ? <span className="ml-1 text-[10px] text-amber-600">(data import)</span> : null}
                              </span>
                            )}
                          </div>
                        </td>
                        {activeQueueView === "BAZAR" ? <><td className="p-3 align-top font-bold">{paymentMethodLabel(activePaymentMethod)}</td><td className="p-3 align-top"><span className={`rounded-full px-3 py-1 text-[11px] font-black ${registrationType === "SELF BOOKING" ? "bg-violet-100 text-violet-700" : "bg-slate-100 text-slate-700"}`}>{registrationType}</span></td></> : null}
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
                        <div className="text-xl font-black">{activeTrackNumber || <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-800">Belum isi No. Vendor</span>}</div>
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
                            )) : (
                              <span className={registration?.vaccine?.name ? "font-bold text-slate-700" : "font-semibold text-amber-700"}>
                                {registration?.vaccine?.name || "Item vaksin belum tercatat"}
                                {registration?.vaccine?.name ? <span className="ml-1 text-[10px] text-amber-600">(data import)</span> : null}
                              </span>
                            )}
                        </div>
                      </td>
                      {activeQueueView === "BAZAR" ? <><td className="p-3 font-bold">{paymentMethodLabel(activePaymentMethod)}</td><td className="p-3"><span className={`rounded-full px-3 py-1 text-[11px] font-black ${registrationType === "SELF BOOKING" ? "bg-violet-100 text-violet-700" : "bg-slate-100 text-slate-700"}`}>{registrationType}</span></td></> : null}
                      <td className="p-3"><span className={`rounded-full px-3 py-1 text-xs font-black ${activeTrackInfo.cls}`}>{activeTrackInfo.label}</span></td>
                      <td className="p-3 text-xs text-slate-600">{registration.status_note || registration.payment_note || "-"}</td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-2">
                          {needsQueueRelease ? <button onClick={() => releaseQueue(registration)} disabled={releasingId === registration.id} className="rounded-xl bg-red-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-60">{releasingId === registration.id ? "Proses..." : "Rilis Antrian"}</button> : null}
                          {!internalQueueEnabled && ["IMPORTED", "REGISTERED", ""].includes(String(activeQueueView === "BAZAR" ? registration?.bazar_queue_status : registration?.queue_status || "").toUpperCase()) ? (
                            <button type="button" onClick={() => void registerExternalParticipant(registration)} disabled={registeringExternalId === Number(registration.id)} className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-black text-white hover:bg-blue-700 disabled:opacity-50">
                              {registeringExternalId === Number(registration.id) ? "Mendaftarkan..." : "Daftarkan"}
                            </button>
                          ) : null}
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
                    <td colSpan={activeQueueView === "BAZAR" ? 9 : 7} className="p-5 text-center text-slate-500">
                      {search.trim()
                        ? "Peserta tidak ditemukan pada layanan/produk filter saat ini. Hapus filter produk atau periksa Session."
                        : internalQueueEnabled && healthdayBazarEnabled
                        ? "Belum ada nomor antrean yang dirilis. Peserta belum datang tetap tersedia di Registrasi Ulang."
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
        )}
      </div>
      {editingSelfBooking ? (
        <div className="fixed inset-0 z-[96] flex items-center justify-center bg-slate-950/55 p-4">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-[28px] border border-violet-100 bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b p-5">
              <div><div className="text-xs font-black uppercase tracking-wide text-violet-600">Edit Self Booking Bazar</div><h3 className="mt-1 text-2xl font-black text-slate-950">{editingSelfBooking.participantName || "Peserta"}</h3><div className="mt-1 text-sm font-semibold text-slate-500">{editingSelfBooking.employeeId || "-"} · ID peserta tidak diubah dari admin edit.</div></div>
              <button type="button" onClick={() => setEditingSelfBooking(null)} className="rounded-xl border px-4 py-2 text-sm font-black">Tutup</button>
            </div>
            <div className="grid gap-3 p-5 md:grid-cols-2">
              <label className="text-xs font-black text-slate-600">Nama Peserta<input value={editingSelfBooking.participantName} onChange={(event) => setEditingSelfBooking({ ...editingSelfBooking, participantName: event.target.value })} className="mt-1 block w-full rounded-xl border px-3 py-2.5 text-sm font-bold text-slate-900" /></label>
              <label className="text-xs font-black text-slate-600">NIK KTP<input value={editingSelfBooking.nik} onChange={(event) => setEditingSelfBooking({ ...editingSelfBooking, nik: event.target.value })} className="mt-1 block w-full rounded-xl border px-3 py-2.5 text-sm font-bold text-slate-900" /></label>
              <label className="text-xs font-black text-slate-600">Email<input type="email" value={editingSelfBooking.email} onChange={(event) => setEditingSelfBooking({ ...editingSelfBooking, email: event.target.value })} className="mt-1 block w-full rounded-xl border px-3 py-2.5 text-sm font-bold text-slate-900" /></label>
              <label className="text-xs font-black text-slate-600">No. HP<input value={editingSelfBooking.phone} onChange={(event) => setEditingSelfBooking({ ...editingSelfBooking, phone: event.target.value })} className="mt-1 block w-full rounded-xl border px-3 py-2.5 text-sm font-bold text-slate-900" /></label>
            </div>
            <div className="border-t px-5 py-4">
              <div className="text-xs font-black uppercase tracking-wide text-slate-500">Produk Bazar</div>
              <div className="mt-3 space-y-2">
                {(editingSelfBooking.selectedItems || []).map((item: any, index: number) => {
                  const catalogItem = selfBookingCatalogItem(item.vaccineId, item.lotId);
                  return <div key={`edit-booking-${item.vaccineId}-${item.lotId}-${index}`} className="grid gap-2 rounded-2xl border p-3 md:grid-cols-[1fr_170px_auto] md:items-center">
                    <div><div className="font-black">{item.vaccineName}</div><div className="text-xs font-semibold text-slate-500">Lot {item.lotNumber || "-"}</div></div>
                    <select value={item.saleMode} onChange={(event) => { const next = [...editingSelfBooking.selectedItems]; next[index] = { ...next[index], saleMode: event.target.value === "PACKAGE" ? "PACKAGE" : "NON_PACKAGE", quantity: event.target.value === "PACKAGE" ? 1 : (next[index].quantity || 1) }; setEditingSelfBooking({ ...editingSelfBooking, selectedItems: next }); }} className="rounded-xl border px-3 py-2 text-sm font-bold">
                      {(catalogItem?.salesOptions || []).map((option: any) => <option key={`${item.vaccineId}-${item.lotId}-${option.saleMode}`} value={option.saleMode}>{String(option.saleMode).toUpperCase() === "PACKAGE" ? `Paket · ${money(option.price)}` : `Non Paket · ${money(option.price)}`}</option>)}
                    </select>
                    <div className="flex flex-wrap gap-2 text-xs font-bold">
                      {item.saleMode !== "PACKAGE" ? <label>Jumlah dosis <select className="ml-1 rounded-lg border p-2" value={item.quantity || 1} onChange={e => { const next=[...editingSelfBooking.selectedItems]; next[index]={...next[index],quantity:Number(e.target.value)};setEditingSelfBooking({...editingSelfBooking,selectedItems:next}); }}>{[1,2,3].map(n=><option key={n} value={n}>{n}</option>)}</select></label> : null}
                      <label>Dosis ke- <select className="ml-1 rounded-lg border p-2" value={item.startDose || 1} onChange={e => { const next=[...editingSelfBooking.selectedItems]; next[index]={...next[index],startDose:Number(e.target.value)};setEditingSelfBooking({...editingSelfBooking,selectedItems:next}); }}>{[1,2,3,4,5].map(n=><option key={n} value={n}>{n}</option>)}</select></label>
                    </div>
                    <button type="button" onClick={() => setEditingSelfBooking({ ...editingSelfBooking, selectedItems: editingSelfBooking.selectedItems.filter((_: any, rowIndex: number) => rowIndex !== index) })} className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-black text-red-700">Hapus</button>
                  </div>;
                })}
              </div>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <select value={editingSelfBooking.addKey} onChange={(event) => setEditingSelfBooking({ ...editingSelfBooking, addKey: event.target.value })} className="min-w-0 flex-1 rounded-xl border px-3 py-2.5 text-sm font-bold">
                  <option value="">Tambah produk Bazar...</option>
                  {selfBookingCatalog.map((item: any) => <option key={`${item.vaccineId}:${item.lotId}`} value={`${item.vaccineId}:${item.lotId}`}>{item.vaccineName} · Lot {item.lotNumber} {item.stockRemaining == null ? "" : `· Sisa ${item.stockRemaining}`}</option>)}
                </select>
                <button type="button" onClick={addSelfBookingEditItem} className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-2.5 text-sm font-black text-violet-700">+ Tambah</button>
              </div>
            </div>
            <div className="flex flex-col-reverse gap-3 border-t bg-slate-50 p-5 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setEditingSelfBooking(null)} className="rounded-2xl border bg-white px-5 py-3 text-sm font-black">Batal</button>
              <button type="button" onClick={() => void saveSelfBookingEdit()} disabled={selfBookingEditSaving} className="rounded-2xl bg-violet-600 px-6 py-3 text-sm font-black text-white disabled:opacity-40">{selfBookingEditSaving ? "Menyimpan..." : "Simpan Perubahan"}</button>
            </div>
          </div>
        </div>
      ) : null}
      {processingBooking ? (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-950/55 p-4">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-[28px] border border-violet-100 bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b p-5">
              <div>
                <div className="text-xs font-black uppercase tracking-wide text-violet-600">Process Self Booking Bazar</div>
                <h3 className="mt-1 text-2xl font-black text-slate-950">{processingBooking.participant_name || "Peserta"}</h3>
                <div className="mt-1 text-sm font-semibold text-slate-500">{processingBooking.employee_id || "-"} · {processingBooking.company_name || "-"}</div>
              </div>
              <button type="button" onClick={() => setProcessingBooking(null)} className="rounded-xl border px-4 py-2 text-sm font-black">Tutup</button>
            </div>

            {bookingProcessError ? <div className="mx-5 mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{bookingProcessError}</div> : null}

            <div className="grid gap-4 p-5 md:grid-cols-3">
              <div className="rounded-2xl bg-slate-50 p-4"><div className="text-[10px] font-black uppercase text-slate-400">NIK KTP</div><div className="mt-1 font-black">{processingBooking.nik || "-"}</div></div>
              <div className="rounded-2xl bg-slate-50 p-4"><div className="text-[10px] font-black uppercase text-slate-400">Email</div><div className="mt-1 font-black break-all">{processingBooking.email || "-"}</div></div>
              <div className="rounded-2xl bg-slate-50 p-4"><div className="text-[10px] font-black uppercase text-slate-400">No. HP</div><div className="mt-1 font-black">{processingBooking.phone || "-"}</div></div>
            </div>

            <div className="px-5 pb-2">
              <div className="text-xs font-black uppercase tracking-wide text-slate-500">Produk yang dipilih</div>
              <div className="mt-3 space-y-2">
                {(Array.isArray(processingBooking.selected_items) ? processingBooking.selected_items : []).map((item: any, index: number) => (
                  <div key={`process-${processingBooking.id}-${index}`} className="flex flex-col gap-2 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="font-black">{item.vaccineName || "Produk Bazar"}</div>
                      <div className="mt-1 text-xs font-semibold text-slate-500">Lot {item.lotNumber || "-"} · {String(item.saleMode || "NON_PACKAGE").toUpperCase() === "PACKAGE" ? `Paket ${Number(item.packageDoseCount || 1)} dosis` : `Non Paket · ${Number(item.quantity || 1)} dosis`} · mulai dosis ke-{Number(item.startDose || 1)}</div>
                    </div>
                    <div className="font-black text-violet-700">{money(Number(item.unitPrice || 0) * (Number(item.quantity || 1)))}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-4 p-5 md:grid-cols-[1fr_auto] md:items-end">
              <label>
                <span className="text-xs font-black uppercase tracking-wide text-slate-500">Metode Pembayaran</span>
                <select value={bookingPaymentMethod} onChange={(event) => { setBookingPaymentMethod(event.target.value); setBookingPaymentValidated(false); }} className="mt-2 w-full rounded-2xl border px-4 py-3 font-black">
                  <option value="QRIS">QRIS</option>
                  <option value="DEBIT">Debit</option>
                  <option value="CREDIT_CARD">Credit Card</option>
                  <option value="TRANSFER">Transfer</option>
                  <option value="PREPAID_PREVIOUS_EVENT">Sudah Lunas - Suntikan Lanjutan</option>
                </select>
                {bookingPaymentMethod === "PREPAID_PREVIOUS_EVENT" ? (
                  <input className="mt-2 w-full rounded-xl border border-violet-300 px-3 py-2 text-sm font-semibold" placeholder="Referensi event/kuitansi sebelumnya (wajib)" value={bookingPreviousPaymentReference} onChange={(event) => { setBookingPreviousPaymentReference(event.target.value); setBookingPaymentValidated(false); }} />
                ) : null}
              </label>
              <div className="rounded-2xl bg-violet-50 px-5 py-3 text-right">
                <div className="text-[10px] font-black uppercase text-violet-500">Estimasi</div>
                <div className="text-xl font-black text-violet-800">{bookingPaymentMethod === "PREPAID_PREVIOUS_EVENT" ? money(0) : money(processingBooking.estimated_total)}</div>
                {bookingPaymentMethod === "PREPAID_PREVIOUS_EVENT" ? <div className="mt-1 text-xs font-semibold text-violet-700">Sudah dibayar sebelumnya · tagihan kunjungan Rp0</div> : null}
                {bookingPaymentMethod === "CREDIT_CARD" ? <div className="mt-1 text-[11px] font-bold text-violet-600">Total final akan termasuk CC +3%</div> : null}
              </div>
            </div>

            <div className="px-5 pb-5">
              <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <input type="checkbox" checked={bookingPaymentValidated} onChange={(event) => setBookingPaymentValidated(event.target.checked)} className="mt-1 h-4 w-4" />
                <span><span className="font-black text-emerald-800">Validasi Pembayaran</span><span className="mt-1 block text-xs font-semibold leading-5 text-emerald-700">Saya sudah memeriksa metode dan status pembayaran peserta. Setelah diproses, data masuk ke Registrasi Bazar.</span></span>
              </label>
            </div>

            <div className="flex flex-col-reverse gap-3 border-t bg-slate-50 p-5 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setProcessingBooking(null)} className="rounded-2xl border bg-white px-5 py-3 text-sm font-black">Batal</button>
              <button type="button" onClick={() => void processSelfBooking()} disabled={bookingProcessing || !bookingPaymentValidated} className="rounded-2xl bg-violet-600 px-6 py-3 text-sm font-black text-white disabled:opacity-40">{bookingProcessing ? "Memproses..." : "Validasi Pembayaran & Masukkan ke Registrasi"}</button>
            </div>
          </div>
        </div>
      ) : null}
      {historyRegistration ? <VaccinationParticipantHistoryModal registration={historyRegistration} onClose={() => setHistoryRegistration(null)} /> : null}
    </main>
  );
}
