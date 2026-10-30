"use client";

// V520_SERVICE_SPECIFIC_QUEUE_BULK_SESSION_FLOW

import { useEffect, useMemo, useState } from "react";
import {
  DEFAULT_ONSITE_QUEUE_FORM_CONFIG,
  defaultOnsiteQueueField,
  onsiteQueueFieldKindLabel,
  sanitizeOnsiteQueueFormConfig,
  type OnsiteQueueFormField,
  type OnsiteQueueFormFieldKind,
} from "@/lib/vaccination/onsiteQueueForm";

// VACCINATION_SESSION_EXISTING_CONFIG_V153_3
// V153_18_IMPORTED_PRODUCT_LOT_SESSION_SAFE
// V153_23_SESSION_ALL_ACTIVE_MASTER_LOTS_SAFE
// VACCINATION_SESSION_STOCK_OWNERSHIP_V2
// VACCINATION_COMPANY_STOCK_OWNERSHIP_V1
// V500_SESSION_PRODUCT_ASSIGNMENT_SOURCE_OF_TRUTH
type SourceItem = {
  id: number;
  name: string;
  institution_name?: string | null;
  program_type?: string | null;
};

type SessionVaccineDraft = {
  vaccineId: string;
  lotId: string;
  doseNumber: number;
};

type BatchMappingDraft = {
  sourceBatchName: string;
  vaccineId: string;
  lotId: string;
  doseNumber: number;
};

type EditSessionDraft = {
  id: string;
  sessionName: string;
  companyName: string;
  location: string;
  sessionDate: string;
  timeSlot: string;
  participantCountPlanned: string;
  printLabelHandler: "MEDIS" | "VALIDASI";
  existingQueueProfile: "LEGACY" | "HEALTHDAY_BAZAR";
  existingFlowQueueEnabled: boolean;
  existingFlowHealthdayQueueEnabled: boolean;
  existingFlowBazarQueueEnabled: boolean;
  existingFlowDoctorEnabled: boolean;
  existingNotificationEnabled: boolean;
  existingNotificationRepeat: number;
};

type LocationOption = {
  key: string;
  locationName: string;
  sessionDate: string;
  timeSlot: string;
  batchName: string;
  batchNames?: string[];
  timeAreaName: string;
  participantCount: number;
  sessionName: string;
};

const emptyDraft: SessionVaccineDraft = {
  vaccineId: "",
  lotId: "",
  doseNumber: 1,
};

const emptyEditSession: EditSessionDraft = {
  id: "",
  sessionName: "",
  companyName: "",
  location: "",
  sessionDate: "",
  timeSlot: "",
  participantCountPlanned: "",
  printLabelHandler: "MEDIS",
  existingQueueProfile: "LEGACY",
  existingFlowQueueEnabled: true,
  existingFlowHealthdayQueueEnabled: true,
  existingFlowBazarQueueEnabled: true,
  existingFlowDoctorEnabled: true,
  existingNotificationEnabled: false,
  existingNotificationRepeat: 3,
};

const queueFieldKinds: OnsiteQueueFormFieldKind[] = [
  "participant_name",
  "employee_id",
  "whatsapp",
  "email",
  "custom_text",
  "custom_number",
  "custom_date",
];

const uniqueQueueFieldKinds = new Set<OnsiteQueueFormFieldKind>([
  "participant_name",
  "employee_id",
  "whatsapp",
  "email",
]);

const allLocationsKey = "__all__";

function normalizeBatchName(value: any) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeCompanyName(value: any) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function lotAllowedForSession(
  lot: any,
  companyName: any,
  sessionId?: any,
) {
  const rawScope = String(lot?.stock_scope || "").trim().toUpperCase();
  const scope =
    rawScope === "SESSION"
      ? "SESSION"
      : rawScope === "COMPANY"
        ? "COMPANY"
        : "GENERAL";

  if (scope === "GENERAL") return true;

  const owner = normalizeCompanyName(lot?.stock_company_name);
  const company = normalizeCompanyName(companyName);
  if (!owner || !company || owner !== company) return false;

  if (scope === "COMPANY") return true;

  return (
    Number(lot?.stock_session_id || 0) > 0 &&
    Number(lot?.stock_session_id || 0) === Number(sessionId || 0)
  );
}

export default function VaccinationSessionPage() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [sources, setSources] = useState<SourceItem[]>([]);
  const [vaccines, setVaccines] = useState<any[]>([]);
  const [lots, setLots] = useState<any[]>([]);
  const [productMappings, setProductMappings] = useState<any[]>([]);
  const [sessionProductAssignments, setSessionProductAssignments] = useState<any[]>([]);
  const [sessionProductAssignmentReady, setSessionProductAssignmentReady] = useState(true);
  const [sessionProductAssignmentMessage, setSessionProductAssignmentMessage] = useState("");
  const [pendingLotDrafts, setPendingLotDrafts] = useState<Record<string, { lotId: string; doseNumber: number }>>({});
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [loadingLocations, setLoadingLocations] = useState(false);
  const [editingSession, setEditingSession] = useState<any | null>(null);
  const [editSessionForm, setEditSessionForm] = useState<EditSessionDraft>(emptyEditSession);
  const [loadingEditPrintMode, setLoadingEditPrintMode] = useState(false);
  const [editPrintModeReady, setEditPrintModeReady] = useState(false);
  const [savingEditSession, setSavingEditSession] = useState(false);
  const [editSessionVaccines, setEditSessionVaccines] = useState<(SessionVaccineDraft & {
    vaccineLabel?: string;
    lotLabel?: string;
  })[]>([]);
  const [editVaccineDraft, setEditVaccineDraft] = useState<SessionVaccineDraft>(emptyDraft);
  const [editQueueFormFields, setEditQueueFormFields] = useState<OnsiteQueueFormField[]>(
    DEFAULT_ONSITE_QUEUE_FORM_CONFIG.map((item) => ({ ...item })),
  );
  const [queueFieldKindToAdd, setQueueFieldKindToAdd] =
    useState<OnsiteQueueFormFieldKind>("whatsapp");

  const [draft, setDraft] = useState<SessionVaccineDraft>(emptyDraft);
  const [sessionVaccines, setSessionVaccines] = useState<SessionVaccineDraft[]>(
    [],
  );
  const [batchMappings, setBatchMappings] = useState<BatchMappingDraft[]>([]);

  const [form, setForm] = useState({
    sessionName: "",
    sourceId: "",
    companyName: "",
    locationKey: "",
    location: "",
    sessionDate: "",
    timeSlot: "",
    existingFlowQueueEnabled: true,
    existingFlowHealthdayQueueEnabled: true,
    existingFlowBazarQueueEnabled: true,
    existingFlowDoctorEnabled: false,
  });

  const [selectedSessionIds, setSelectedSessionIds] = useState<number[]>([]);
  const [bulkApplyingFlow, setBulkApplyingFlow] = useState(false);

  const [message, setMessage] = useState(
    "Pilih database vaksinasi, lalu generate session berdasarkan lokasi dan tanggal yang tersedia dari file import.",
  );
  const [error, setError] = useState("");

  const selectedSource = sources.find(
    (source) => String(source.id) === String(form.sourceId),
  );
  const currentCompanyName =
    form.companyName ||
    selectedSource?.institution_name ||
    selectedSource?.name ||
    "";
  const editCompanyName = editSessionForm.companyName || editingSession?.company_name || "";
  const selectedLocation = locations.find(
    (item) => item.key === form.locationKey,
  );

  const selectedExistingSession = useMemo(() => {
    if (!form.sourceId || !form.locationKey || form.locationKey === allLocationsKey) {
      return null;
    }

    const sameSourceSessions = sessions.filter(
      (session) => String(session.source_id || "") === String(form.sourceId),
    );

    const exact = sameSourceSessions.find(
      (session) =>
        String(session.import_location_key || "") === String(form.locationKey),
    );
    if (exact) return exact;

    if (!selectedLocation) return null;
    return (
      sameSourceSessions.find(
        (session) =>
          String(session.location || "").trim().toLowerCase() ===
            String(selectedLocation.locationName || "").trim().toLowerCase() &&
          String(session.session_date || "") ===
            String(selectedLocation.sessionDate || ""),
      ) || null
    );
  }, [form.locationKey, form.sourceId, selectedLocation, sessions]);

  const currentSessionId = Number(selectedExistingSession?.id || 0);
  const editSessionId = Number(editingSession?.id || 0);

  const availableBatchNames = useMemo(() => {
    const selectedLocations =
      form.locationKey && form.locationKey !== allLocationsKey
        ? locations.filter((item) => item.key === form.locationKey)
        : locations;

    const names = new Set<string>();
    selectedLocations.forEach((item) => {
      (item.batchNames || []).forEach((name) => {
        const text = String(name || "").trim();
        if (text) names.add(text);
      });
      const single = String(item.batchName || "").trim();
      if (single) names.add(single);
    });

    return Array.from(names.values()).sort((a, b) => a.localeCompare(b));
  }, [form.locationKey, locations]);

  const sessionVaccineOptions = useMemo(() => {
    return sessionVaccines.map((item) => {
      const key = `${item.vaccineId}|${item.lotId}|${item.doseNumber}`;
      return {
        key,
        item,
        label: `${vaccineName(item.vaccineId)} · ${lotName(item.lotId)} · Dose ${item.doseNumber}`,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionVaccines, vaccines, lots]);

  // V500: Master Product & Lot assignment is the source of truth for Session eligibility.
  // A product may be assigned before a Lot exists. Existing session_vaccines remain
  // grandfathered so historical/operational mappings are never silently dropped.
  const currentSessionAssignments = useMemo(() => {
    if (!currentSessionId) return [];
    return sessionProductAssignments.filter(
      (assignment) =>
        assignment.active !== false &&
        Number(assignment.session_id || 0) === currentSessionId,
    );
  }, [sessionProductAssignments, currentSessionId]);

  const assignedVaccineIdsForCurrentSession = useMemo(() => {
    return new Set(
      currentSessionAssignments
        .map((assignment) => String(assignment.vaccine_id || ""))
        .filter(Boolean),
    );
  }, [currentSessionAssignments]);

  const selectableVaccines = useMemo(() => {
    const grandfatheredIds = new Set(
      sessionVaccines.map((item) => String(item.vaccineId || "")).filter(Boolean),
    );

    return vaccines.filter(
      (vaccine) =>
        assignedVaccineIdsForCurrentSession.has(String(vaccine.id)) ||
        grandfatheredIds.has(String(vaccine.id)),
    );
  }, [vaccines, assignedVaccineIdsForCurrentSession, sessionVaccines]);

  function assignmentServiceModes(sessionId: number, vaccineId: any) {
    const modes = new Set<string>();
    for (const assignment of sessionProductAssignments) {
      if (assignment.active === false) continue;
      if (Number(assignment.session_id || 0) !== Number(sessionId || 0)) continue;
      if (String(assignment.vaccine_id || "") !== String(vaccineId || "")) continue;
      modes.add(
        String(assignment.service_mode || "HEALTHDAY").toUpperCase() === "BAZAR"
          ? "BAZAR"
          : "HEALTHDAY",
      );
    }
    return Array.from(modes);
  }

  function assignmentServiceLabel(sessionId: number, vaccineId: any) {
    const modes = assignmentServiceModes(sessionId, vaccineId);
    if (!modes.length) return "";
    return modes
      .map((mode) => (mode === "BAZAR" ? "Bazar" : "Healthday"))
      .join(" + ");
  }

  const pendingAssignedProducts = useMemo(() => {
    if (!currentSessionId) return [];
    const existingIds = new Set(
      sessionVaccines.map((item) => String(item.vaccineId || "")).filter(Boolean),
    );
    const seen = new Set<string>();
    const rows: any[] = [];

    for (const assignment of currentSessionAssignments) {
      const vaccineId = String(assignment.vaccine_id || "");
      if (!vaccineId || existingIds.has(vaccineId) || seen.has(vaccineId)) continue;
      const vaccine = vaccines.find((item) => String(item.id) === vaccineId);
      if (!vaccine) continue;
      seen.add(vaccineId);
      rows.push({
        vaccineId,
        vaccine,
        modes: assignmentServiceModes(currentSessionId, vaccineId),
      });
    }

    return rows;
  }, [
    currentSessionId,
    currentSessionAssignments,
    sessionVaccines,
    vaccines,
    sessionProductAssignments,
  ]);

  const filteredLots = useMemo(() => {
    return lots.filter(
      (lot) =>
        lot.active !== false &&
        lotAllowedForSession(lot, currentCompanyName, currentSessionId) &&
        (!draft.vaccineId || String(lot.vaccine_id) === String(draft.vaccineId)),
    );
  }, [lots, draft.vaccineId, currentCompanyName, currentSessionId]);

  const selectedVaccineHasNoActiveLot = useMemo(() => {
    if (!draft.vaccineId) return false;
    return filteredLots.length === 0;
  }, [draft.vaccineId, filteredLots]);

  const editFilteredLots = useMemo(() => {
    return lots.filter(
      (lot) =>
        lot.active !== false &&
        lotAllowedForSession(lot, editCompanyName, editSessionId) &&
        (!editVaccineDraft.vaccineId ||
          String(lot.vaccine_id) === String(editVaccineDraft.vaccineId)),
    );
  }, [lots, editVaccineDraft.vaccineId, editCompanyName, editSessionId]);

  const editSelectableVaccines = useMemo(() => {
    const allowedIds = new Set(
      sessionProductAssignments
        .filter(
          (assignment) =>
            assignment.active !== false &&
            Number(assignment.session_id || 0) === editSessionId,
        )
        .map((assignment) => String(assignment.vaccine_id || ""))
        .filter(Boolean),
    );

    // Grandfather existing active session vaccines even if the Master assignment
    // was created later, so existing operations/history remain editable.
    for (const item of editSessionVaccines) {
      if (item.vaccineId) allowedIds.add(String(item.vaccineId));
    }

    return vaccines.filter((vaccine) => allowedIds.has(String(vaccine.id)));
  }, [
    vaccines,
    sessionProductAssignments,
    editSessionId,
    editSessionVaccines,
  ]);

  function importedProductLabel(vaccineId: string) {
    const mapping = productMappings.find(
      (item) =>
        item.active !== false &&
        String(item.vaccine_id) === String(vaccineId),
    );
    return String(
      mapping?.external_product_label ||
        mapping?.external_product_name ||
        "",
    ).trim();
  }

  function vaccineName(vaccineId: string) {
    const vaccine = vaccines.find(
      (item) => String(item.id) === String(vaccineId),
    );
    if (!vaccine) return "Vaksin";
    const importedLabel = importedProductLabel(vaccineId);
    if (importedLabel) return importedLabel;
    return `${vaccine.name}${vaccine.brand ? ` · ${vaccine.brand}` : ""}`;
  }

  function lotName(lotId: string) {
    const lot = lots.find((item) => String(item.id) === String(lotId));
    if (!lot) return "Lot";
    return `Lot ${lot.lot_number} · exp ${lot.expiry_date || "-"}`;
  }

  function setBatchMapping(sourceBatchName: string, optionKey: string) {
    const option = sessionVaccineOptions.find((item) => item.key === optionKey);
    setBatchMappings((prev) =>
      prev.map((item) =>
        item.sourceBatchName === sourceBatchName
          ? {
              ...item,
              vaccineId: option?.item.vaccineId || "",
              lotId: option?.item.lotId || "",
              doseNumber: option?.item.doseNumber || 1,
            }
          : item,
      ),
    );
  }

  function mappingValue(item: BatchMappingDraft) {
    if (!item.vaccineId || !item.lotId) return "";
    return `${item.vaccineId}|${item.lotId}|${item.doseNumber || 1}`;
  }

  function addSessionVaccine() {
    setError("");

    if (!draft.vaccineId) {
      setError("Pilih vaksin terlebih dahulu.");
      return;
    }

    if (!draft.lotId) {
      setError("Pilih lot number terlebih dahulu.");
      return;
    }

    const duplicate = sessionVaccines.some(
      (item) =>
        String(item.vaccineId) === String(draft.vaccineId) &&
        String(item.lotId) === String(draft.lotId) &&
        Number(item.doseNumber) === Number(draft.doseNumber),
    );

    if (duplicate) {
      setError("Kombinasi vaksin dan lot ini sudah ada di session.");
      return;
    }

    setSessionVaccines((prev) => [...prev, draft]);
    setDraft(emptyDraft);
  }

  function pendingLotsForVaccine(vaccineId: string) {
    return lots.filter(
      (lot) =>
        lot.active !== false &&
        lotAllowedForSession(lot, currentCompanyName, currentSessionId) &&
        String(lot.vaccine_id || "") === String(vaccineId || ""),
    );
  }

  function setPendingAssignedLot(vaccineId: string, patch: { lotId?: string; doseNumber?: number }) {
    setPendingLotDrafts((prev) => ({
      ...prev,
      [String(vaccineId)]: {
        lotId: patch.lotId ?? prev[String(vaccineId)]?.lotId ?? "",
        doseNumber: Math.max(
          1,
          Number(patch.doseNumber ?? prev[String(vaccineId)]?.doseNumber ?? 1),
        ),
      },
    }));
  }

  function activatePendingAssignedProduct(vaccineId: string) {
    setError("");
    const pending = pendingLotDrafts[String(vaccineId)] || { lotId: "", doseNumber: 1 };
    if (!pending.lotId) {
      setError("Pilih Lot Number terlebih dahulu. Jika Lot belum ada, tambahkan di Master Produk & Lot.");
      return;
    }

    const duplicate = sessionVaccines.some(
      (item) =>
        String(item.vaccineId) === String(vaccineId) &&
        String(item.lotId) === String(pending.lotId) &&
        Number(item.doseNumber) === Number(pending.doseNumber || 1),
    );
    if (duplicate) return;

    setSessionVaccines((prev) => [
      ...prev,
      {
        vaccineId: String(vaccineId),
        lotId: String(pending.lotId),
        doseNumber: Math.max(1, Number(pending.doseNumber || 1)),
      },
    ]);
    setPendingLotDrafts((prev) => {
      const next = { ...prev };
      delete next[String(vaccineId)];
      return next;
    });
  }

  function removeSessionVaccine(index: number) {
    const removed = sessionVaccines[index];
    setSessionVaccines((prev) => prev.filter((_, idx) => idx !== index));
    if (removed) {
      setBatchMappings((prev) =>
        prev.map((item) =>
          String(item.vaccineId) === String(removed.vaccineId) &&
          String(item.lotId) === String(removed.lotId)
            ? { ...item, vaccineId: "", lotId: "", doseNumber: 1 }
            : item,
        ),
      );
    }
  }

  function editVaccineLabel(item: SessionVaccineDraft & { vaccineLabel?: string }) {
    return item.vaccineLabel || vaccineName(item.vaccineId);
  }

  function editLotLabel(item: SessionVaccineDraft & { lotLabel?: string }) {
    return item.lotLabel || lotName(item.lotId);
  }

  function editLotsForVaccine(vaccineId: string) {
    return lots.filter(
      (lot) =>
        lot.active !== false &&
        lotAllowedForSession(lot, editCompanyName, editSessionId) &&
        String(lot.vaccine_id || "") === String(vaccineId || ""),
    );
  }

  function updateEditSessionVaccine(
    index: number,
    patch: Partial<SessionVaccineDraft & { vaccineLabel?: string; lotLabel?: string }>,
  ) {
    setEditSessionVaccines((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, ...patch } : item)),
    );
  }

  function addEditSessionVaccine() {
    setError("");

    if (!editVaccineDraft.vaccineId) {
      setError("Pilih vaksin terlebih dahulu.");
      return;
    }

    if (!editVaccineDraft.lotId) {
      setError("Pilih lot number terlebih dahulu.");
      return;
    }

    const duplicate = editSessionVaccines.some(
      (item) =>
        String(item.vaccineId) === String(editVaccineDraft.vaccineId) &&
        String(item.lotId) === String(editVaccineDraft.lotId) &&
        Number(item.doseNumber) === Number(editVaccineDraft.doseNumber),
    );

    if (duplicate) {
      setError("Kombinasi vaksin, lot, dan dosis ini sudah ada di session.");
      return;
    }

    setEditSessionVaccines((prev) => [
      ...prev,
      {
        ...editVaccineDraft,
        vaccineLabel: vaccineName(editVaccineDraft.vaccineId),
        lotLabel: lotName(editVaccineDraft.lotId),
      },
    ]);
    setEditVaccineDraft(emptyDraft);
  }

  function removeEditSessionVaccine(index: number) {
    setEditSessionVaccines((prev) => prev.filter((_, idx) => idx !== index));
  }

  function addEditQueueField() {
    if (
      uniqueQueueFieldKinds.has(queueFieldKindToAdd) &&
      editQueueFormFields.some((item) => item.kind === queueFieldKindToAdd)
    ) {
      setError(`${onsiteQueueFieldKindLabel(queueFieldKindToAdd)} sudah ada di form antrean.`);
      return;
    }

    const suffix = `${Date.now()}_${editQueueFormFields.length + 1}`;
    setEditQueueFormFields((prev) => {
      const nextField = defaultOnsiteQueueField(queueFieldKindToAdd, suffix);
      if (!prev.length) {
        nextField.recoveryKey = true;
        nextField.required = true;
      }
      return [...prev, nextField];
    });
    setError("");
  }

  function updateEditQueueField(
    index: number,
    patch: Partial<OnsiteQueueFormField>,
  ) {
    setEditQueueFormFields((prev) =>
      prev.map((item, idx) => {
        if (idx !== index) return item;
        if (item.recoveryKey && patch.required === false) {
          return { ...item, ...patch, required: true };
        }
        return { ...item, ...patch };
      }),
    );
  }

  function setEditQueueRecoveryField(index: number) {
    setEditQueueFormFields((prev) =>
      prev.map((item, idx) => ({
        ...item,
        recoveryKey: idx === index,
        required: idx === index ? true : item.required,
      })),
    );
    setError("");
  }

  function removeEditQueueField(index: number) {
    setEditQueueFormFields((prev) => prev.filter((_, idx) => idx !== index));
  }

  function moveEditQueueField(index: number, direction: -1 | 1) {
    setEditQueueFormFields((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function openEditSession(session: any) {
    setError("");
    setMessage("");
    setEditingSession(session);
    setLoadingEditPrintMode(true);
    setEditPrintModeReady(false);
    setEditSessionForm({
      id: String(session.id || ""),
      sessionName: String(session.session_name || ""),
      companyName: String(session.company_name || ""),
      location: String(session.location || ""),
      sessionDate: String(session.session_date || ""),
      timeSlot: String(session.time_slot || ""),
      participantCountPlanned:
        session.participant_count_planned === null || session.participant_count_planned === undefined
          ? ""
          : String(session.participant_count_planned),
      printLabelHandler:
        String(session.print_label_handler || "").toUpperCase() === "VALIDASI"
          ? "VALIDASI"
          : "MEDIS",
      existingQueueProfile:
        String(session.existing_queue_profile || "").toUpperCase() ===
        "HEALTHDAY_BAZAR"
          ? "HEALTHDAY_BAZAR"
          : "LEGACY",
      existingFlowQueueEnabled:
        session?.existing_flow_config?.queue !== false,
      existingFlowHealthdayQueueEnabled:
        session?.existing_flow_config?.queue_healthday === undefined
          ? session?.existing_flow_config?.queue !== false
          : session?.existing_flow_config?.queue_healthday !== false,
      existingFlowBazarQueueEnabled:
        session?.existing_flow_config?.queue_bazar === undefined
          ? session?.existing_flow_config?.queue !== false
          : session?.existing_flow_config?.queue_bazar !== false,
      existingFlowDoctorEnabled:
        session?.existing_flow_config?.doctor !== false,
      existingNotificationEnabled:
        session?.existing_notification_config?.enabled === true,
      existingNotificationRepeat: Math.min(
        5,
        Math.max(
          1,
          Number(session?.existing_notification_config?.repeat || 3),
        ),
      ),
    });
    setEditSessionVaccines(
      (session.session_vaccines || []).map((item: any) => ({
        vaccineId: String(item.vaccine_id || item.vaccine?.id || ""),
        lotId: String(item.lot_id || item.lot?.id || ""),
        doseNumber: Math.max(1, Number(item.dose_number || 1)),
        vaccineLabel: item.vaccine
          ? `${item.vaccine.name || "Vaksin"}${item.vaccine.brand ? ` · ${item.vaccine.brand}` : ""}`
          : "",
        lotLabel: item.lot
          ? `Lot ${item.lot.lot_number || "-"} · exp ${item.lot.expiry_date || "-"}`
          : "",
      })),
    );
    setEditQueueFormFields(
      sanitizeOnsiteQueueFormConfig(session.onsite_queue_form_config),
    );
    setEditVaccineDraft(emptyDraft);

    try {
      const qs = new URLSearchParams({
        session_id: String(session.id || ""),
        session_name: String(session.session_name || ""),
      });
      const res = await fetch(`/api/vaccination/session-print-setting?${qs.toString()}`, { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        throw new Error(json.message || "Gagal membaca setting print session.");
      }
      setEditSessionForm((prev) => ({
        ...prev,
        printLabelHandler:
          String(json.print_label_handler || "").toUpperCase() === "VALIDASI"
            ? "VALIDASI"
            : "MEDIS",
      }));
      setEditPrintModeReady(true);
    } catch (err: any) {
      setEditPrintModeReady(false);
      setError(err?.message || "Gagal membaca setting print session.");
    } finally {
      setLoadingEditPrintMode(false);
    }
  }

  function closeEditSession() {
    if (savingEditSession) return;
    setEditingSession(null);
    setEditSessionForm(emptyEditSession);
    setEditSessionVaccines([]);
    setEditVaccineDraft(emptyDraft);
    setEditQueueFormFields(
      DEFAULT_ONSITE_QUEUE_FORM_CONFIG.map((item) => ({ ...item })),
    );
    setLoadingEditPrintMode(false);
    setEditPrintModeReady(false);
  }

  async function saveEditSession() {
    if (!editSessionForm.id) return;
    if (!editSessionForm.sessionName.trim()) {
      setError("Nama session wajib diisi.");
      return;
    }

    const invalidService = editSessionVaccines.find(
      (item) => !item.vaccineId || !item.lotId || Number(item.doseNumber) < 1,
    );
    if (invalidService) {
      setError("Lengkapi vaksin, lot number, dan dosis pada semua layanan session.");
      return;
    }

    const editServiceKeys = editSessionVaccines.map(
      (item) => `${item.vaccineId}|${item.lotId}|${Math.max(1, Number(item.doseNumber || 1))}`,
    );
    if (new Set(editServiceKeys).size !== editServiceKeys.length) {
      setError("Ada kombinasi vaksin, lot, dan dosis yang duplikat di layanan session.");
      return;
    }

    if (!editQueueFormFields.length) {
      setError("Form antrean harus memiliki minimal 1 field agar antrean dapat dipulihkan jika browser tertutup.");
      return;
    }

    const recoveryFields = editQueueFormFields.filter((field) => field.recoveryKey);
    if (recoveryFields.length !== 1) {
      setError("Pilih tepat 1 field sebagai Recovery Key antrean.");
      return;
    }

    const employeeIdField = editQueueFormFields.find((field) => field.kind === "employee_id");
    if (
      employeeIdField?.exactLength !== undefined &&
      (!Number.isInteger(employeeIdField.exactLength) ||
        employeeIdField.exactLength < 1 ||
        employeeIdField.exactLength > 32)
    ) {
      setError("Jumlah karakter No Karyawan harus 1 sampai 32.");
      return;
    }

    if (loadingEditPrintMode || !editPrintModeReady) {
      setError("Setting print session belum berhasil dimuat. Tutup Edit Session lalu buka kembali sebelum menyimpan.");
      return;
    }

    setSavingEditSession(true);
    setError("");
    setMessage("Menyimpan perubahan session...");

    try {
      const res = await fetch("/api/vaccination/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update-session",
          id: editSessionForm.id,
          sessionName: editSessionForm.sessionName,
          companyName: editSessionForm.companyName,
          location: editSessionForm.location,
          sessionDate: editSessionForm.sessionDate,
          timeSlot: editSessionForm.timeSlot,
          participantCountPlanned: editSessionForm.participantCountPlanned,
          existingQueueProfile: editSessionForm.existingQueueProfile,
          existingFlowConfig: {
            registration: true,
            queue:
              editSessionForm.existingFlowHealthdayQueueEnabled ||
              editSessionForm.existingFlowBazarQueueEnabled,
            queue_healthday: editSessionForm.existingFlowHealthdayQueueEnabled,
            queue_bazar: editSessionForm.existingFlowBazarQueueEnabled,
            doctor: editSessionForm.existingFlowDoctorEnabled,
          },
          existingNotificationConfig: {
            enabled: editSessionForm.existingNotificationEnabled,
            channel: "VOICE",
            repeat: editSessionForm.existingNotificationRepeat,
          },
          onsiteQueueFormConfig: editQueueFormFields,
          sessionVaccines: editSessionVaccines.map((item) => ({
            vaccineId: item.vaccineId,
            lotId: item.lotId,
            doseNumber: item.doseNumber,
          })),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        throw new Error(json.message || "Gagal menyimpan perubahan session.");
      }

      const printRes = await fetch("/api/vaccination/session-print-setting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          session_id: editSessionForm.id,
          session_name: editSessionForm.sessionName,
          print_label_handler: editSessionForm.printLabelHandler,
        }),
      });
      const printJson = await printRes.json().catch(() => ({}));
      if (!printRes.ok || !printJson.ok) {
        throw new Error(
          printJson.message ||
            "Data session tersimpan, tetapi setting print belum berhasil disimpan. Silakan klik Simpan Perubahan lagi.",
        );
      }

      setMessage("Session, layanan/vaksin, lot, dosis, dan pilihan petugas print label berhasil diperbarui.");
      setEditingSession(null);
      setEditSessionForm(emptyEditSession);
      setEditSessionVaccines([]);
      setEditVaccineDraft(emptyDraft);
      setEditQueueFormFields(
        DEFAULT_ONSITE_QUEUE_FORM_CONFIG.map((item) => ({ ...item })),
      );
      await loadSessions();
    } catch (err: any) {
      setError(err?.message || "Gagal menyimpan perubahan session.");
      setMessage("Edit session belum selesai.");
    } finally {
      setSavingEditSession(false);
    }
  }

  async function applyBulkFlowToSelectedSessions() {
    if (!selectedSessionIds.length || bulkApplyingFlow) return;
    setBulkApplyingFlow(true);
    setError("");
    setMessage(`Menerapkan flow ke ${selectedSessionIds.length} Session...`);
    try {
      const res = await fetch("/api/vaccination/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "bulk-update-flow",
          sessionIds: selectedSessionIds,
          existingFlowConfig: {
            registration: true,
            queue:
              form.existingFlowHealthdayQueueEnabled ||
              form.existingFlowBazarQueueEnabled,
            queue_healthday: form.existingFlowHealthdayQueueEnabled,
            queue_bazar: form.existingFlowBazarQueueEnabled,
            doctor: form.existingFlowDoctorEnabled,
          },
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.message || "Gagal menerapkan flow massal.");
      setMessage(json.message || "Flow massal berhasil diterapkan.");
      setSelectedSessionIds([]);
      await loadSessions();
    } catch (err: any) {
      setError(err?.message || "Gagal menerapkan flow massal.");
    } finally {
      setBulkApplyingFlow(false);
    }
  }

  async function deleteSession(session: any) {
    const confirmed = window.confirm(
      `Hapus session "${session.session_name}"?\n\nData registrasi, antrian, dan record vaksinasi di session ini juga bisa ikut terhapus karena relasi database.`,
    );

    if (!confirmed) return;

    setError("");
    setMessage("Menghapus session...");

    const res = await fetch("/api/vaccination/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete-session", id: session.id }),
    });

    const json = await res.json();

    if (!res.ok || !json.ok) {
      setError(json.message || "Gagal menghapus session.");
      setMessage("Hapus session gagal.");
      return;
    }

    setMessage(json.message || "Session berhasil dihapus.");
    loadSessions();
  }

  async function loadSources() {
    const res = await fetch("/api/sources?program=vaccination", {
      cache: "no-store",
    });
    const json = await res.json();
    if (json.ok) setSources(json.sources || []);
  }

  async function loadMaster() {
    const json = await fetch("/api/vaccination/master", {
      cache: "no-store",
    }).then((r) => r.json());
    if (json.ok) {
      setVaccines((json.vaccines || []).filter((v: any) => v.active !== false));
      setLots((json.lots || []).filter((lot: any) => lot.active !== false));
      setProductMappings((json.productMappings || []).filter((mapping: any) => mapping.active !== false));
      setSessionProductAssignments(
        (json.sessionProductAssignments || []).filter(
          (assignment: any) => assignment.active !== false,
        ),
      );
      setSessionProductAssignmentReady(json.sessionProductAssignmentReady !== false);
      setSessionProductAssignmentMessage(json.sessionProductAssignmentMessage || "");
    }
  }

  async function loadSessions() {
    const res = await fetch("/api/vaccination/sessions", { cache: "no-store" });
    const json = await res.json();
    if (!res.ok || !json.ok) {
      setError(json.message || "Gagal mengambil session.");
      return;
    }
    setSessions(json.sessions || []);
  }

  async function loadLocations(sourceId: string) {
    setLocations([]);
    if (!sourceId) return;

    setLoadingLocations(true);
    setError("");

    try {
      const res = await fetch(
        `/api/vaccination/session-locations?source_id=${encodeURIComponent(sourceId)}`,
        { cache: "no-store" },
      );
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.message || "Gagal memuat rincian lokasi dari database.");
        return;
      }
      setLocations(json.locations || []);
      if (!json.locations?.length) {
        setMessage(
          json.message ||
            "Informasi lokasi belum tersedia. Periksa kembali sumber data peserta atau hubungi administrator.",
        );
      } else {
        // VACCINATION_AUTO_PERSIST_DETECTED_SESSIONS_V153_31
        // Candidate lokasi/tanggal dari Excel harus menjadi Session tersimpan,
        // supaya Daftar Session dan Master Vaksin memakai sumber data yang sama.
        const syncRes = await fetch("/api/vaccination/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "ensure-source-sessions",
            sourceId,
            companyName:
              json.source?.institution_name || json.source?.name || "",
            sourceName:
              json.source?.name || json.source?.institution_name || "",
            existingFlowConfig: {
              registration: true,
              queue:
                form.existingFlowHealthdayQueueEnabled ||
                form.existingFlowBazarQueueEnabled,
              queue_healthday: form.existingFlowHealthdayQueueEnabled,
              queue_bazar: form.existingFlowBazarQueueEnabled,
              doctor: form.existingFlowDoctorEnabled,
            },
          }),
        });
        const syncJson = await syncRes.json().catch(() => ({}));
        if (!syncRes.ok || !syncJson.ok) {
          setError(
            syncJson.message ||
              "Lokasi terdeteksi, tetapi sinkronisasi Session tersimpan gagal.",
          );
          return;
        }

        await loadSessions();
        setMessage(
          `Ditemukan ${json.locations.length} rincian lokasi/tanggal. Session tersimpan otomatis: ${Number(syncJson.created || 0)} baru, ${Number(syncJson.existing || 0)} sudah ada.`,
        );
      }
    } catch (err: any) {
      setError(err?.message || "Gagal memuat rincian lokasi dari database.");
    } finally {
      setLoadingLocations(false);
    }
  }

  function applyLocation(value: string) {
    if (value === allLocationsKey) {
      setForm((prev) => ({
        ...prev,
        locationKey: value,
        sessionName: "",
        location: "",
        sessionDate: "",
        timeSlot: "",
      }));
      return;
    }

    const location = locations.find((item) => item.key === value);
    if (!location) {
      setForm((prev) => ({ ...prev, locationKey: value }));
      return;
    }

    setForm((prev) => ({
      ...prev,
      locationKey: value,
      sessionName: location.sessionName,
      location: location.locationName,
      sessionDate: location.sessionDate || "",
      timeSlot: location.timeSlot || "",
    }));
  }

  async function submit() {
    setError("");

    const source = sources.find(
      (item) => String(item.id) === String(form.sourceId),
    );
    const companyName =
      form.companyName || source?.institution_name || source?.name || "";
    const autoGenerateFromLocations = Boolean(form.locationKey);

    if (autoGenerateFromLocations && !locations.length) {
      setError(
        "Rincian lokasi belum tersedia. Periksa kembali sumber data peserta atau hubungi administrator.",
      );
      return;
    }

    if (availableBatchNames.length && !sessionVaccines.length) {
      setError("Tambahkan daftar vaksin & lot dulu sebelum mapping BatchName dari database.");
      return;
    }

    const unmapped = batchMappings.filter(
      (item) => item.sourceBatchName && (!item.vaccineId || !item.lotId),
    );
    if (unmapped.length) {
      setError(
        `Mapping vaksin belum lengkap untuk: ${unmapped
          .map((item) => item.sourceBatchName)
          .join(", ")}.`,
      );
      return;
    }

    if (selectedExistingSession) {
      const res = await fetch("/api/vaccination/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "sync-session-config",
          sessionId: selectedExistingSession.id,
          sourceId: form.sourceId,
          sessionVaccines,
          batchMappings: batchMappings.filter(
            (item) => item.sourceBatchName && item.vaccineId && item.lotId,
          ),
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.message || "Gagal memperbarui vaksin dan mapping session existing.");
        return;
      }

      setMessage(
        json.message ||
          "Daftar vaksin/lot dan mapping session existing berhasil diperbarui.",
      );
      setDraft(emptyDraft);
      await loadSessions();
      return;
    }

    const res = await fetch("/api/vaccination/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        companyName,
        sourceName: source
          ? `${source.name}${source.institution_name ? ` · ${source.institution_name}` : ""}`
          : "",
        sessionVaccines,
        batchMappings: batchMappings.filter((item) => item.sourceBatchName && item.vaccineId && item.lotId),
        autoGenerateFromLocations,
        selectedLocationKey: form.locationKey,
        importLocationKey: selectedLocation?.key || "",
        importTimeAreaName: selectedLocation?.timeAreaName || "",
        participantCountPlanned: selectedLocation?.participantCount || 0,
        existingFlowConfig: {
          registration: true,
          queue:
            form.existingFlowHealthdayQueueEnabled ||
            form.existingFlowBazarQueueEnabled,
          queue_healthday: form.existingFlowHealthdayQueueEnabled,
          queue_bazar: form.existingFlowBazarQueueEnabled,
          doctor: form.existingFlowDoctorEnabled,
        },
      }),
    });

    const json = await res.json();
    if (!res.ok || !json.ok) {
      setError(json.message || "Gagal membuat session.");
      return;
    }

    setMessage(json.message || "Session berhasil dibuat.");
    setForm({
      sessionName: "",
      sourceId: form.sourceId,
      companyName,
      locationKey: "",
      location: "",
      sessionDate: "",
      timeSlot: "",
      existingFlowQueueEnabled:
        form.existingFlowHealthdayQueueEnabled || form.existingFlowBazarQueueEnabled,
      existingFlowHealthdayQueueEnabled: form.existingFlowHealthdayQueueEnabled,
      existingFlowBazarQueueEnabled: form.existingFlowBazarQueueEnabled,
      existingFlowDoctorEnabled: form.existingFlowDoctorEnabled,
    });
    setSessionVaccines([]);
    setDraft(emptyDraft);
    setBatchMappings([]);
    await loadSessions();
    if (form.sourceId) await loadLocations(form.sourceId);
  }

  useEffect(() => {
    loadSources();
    loadMaster();
    loadSessions();
  }, []);

  // V500: when returning from Master Produk & Lot in another tab/window,
  // refresh assignments + lots automatically so a newly added Lot appears
  // without rebuilding the Session mapping from scratch.
  useEffect(() => {
    const refreshMasterOnFocus = () => {
      loadMaster();
    };
    window.addEventListener("focus", refreshMasterOnFocus);
    return () => window.removeEventListener("focus", refreshMasterOnFocus);
  }, []);

  useEffect(() => {
    if (selectedExistingSession) {
      const loadedVaccines: SessionVaccineDraft[] = (
        selectedExistingSession.session_vaccines || []
      ).map((item: any) => ({
        vaccineId: String(item.vaccine_id || ""),
        lotId: String(item.lot_id || ""),
        doseNumber: Math.max(1, Number(item.dose_number || 1)),
      }));

      const mappingByName = new Map(
        (selectedExistingSession.batch_mappings || []).map((item: any) => [
          normalizeBatchName(item.source_batch_name),
          item,
        ]),
      );

      setSessionVaccines(loadedVaccines);
      setDraft(emptyDraft);
      setBatchMappings(
        availableBatchNames.map((name) => {
          const existing: any = mappingByName.get(normalizeBatchName(name));
          return {
            sourceBatchName: name,
            vaccineId: existing ? String(existing.vaccine_id || "") : "",
            lotId: existing ? String(existing.lot_id || "") : "",
            doseNumber: existing
              ? Math.max(1, Number(existing.dose_number || 1))
              : 1,
          };
        }),
      );
      setForm((prev) => ({
        ...prev,
        sessionName: String(selectedExistingSession.session_name || prev.sessionName),
        companyName: String(selectedExistingSession.company_name || prev.companyName),
      }));
      setMessage(
        `Data session ditemukan. ${loadedVaccines.length} vaksin/lot dan pengaturan sebelumnya siap digunakan.`,
      );
      return;
    }

    setSessionVaccines([]);
    setDraft(emptyDraft);
    setBatchMappings(
      availableBatchNames.map((name) => ({
        sourceBatchName: name,
        vaccineId: "",
        lotId: "",
        doseNumber: 1,
      })),
    );
  }, [selectedExistingSession, availableBatchNames.join("|")]);

  useEffect(() => {
    if (selectedSource && !form.companyName) {
      setForm((prev) => ({
        ...prev,
        companyName:
          selectedSource.institution_name || selectedSource.name || "",
      }));
    }

    setForm((prev) => ({
      ...prev,
      locationKey: "",
      location: "",
      sessionDate: "",
      timeSlot: "",
      sessionName: "",
    }));

    loadLocations(form.sourceId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.sourceId]);

  return (
    <main className="p-6">
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Session Vaksinasi</h1>
            <p className="mt-2 text-sm text-slate-600">
              Kelola jadwal, alur layanan, petugas, serta produk vaksin untuk setiap session.
            </p>
          </div>
          <a
            href="/vaccination"
            className="rounded-xl border px-4 py-2 text-sm font-bold hover:bg-slate-50"
          >
            ☰ Menu Vaksinasi
          </a>
        </div>

        {error ? (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
            {error}
          </div>
        ) : null}
        {message ? (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800">
            {message}
          </div>
        ) : null}

        <section className="mt-6 rounded-2xl border bg-slate-50 p-5">
          <h2 className="font-bold">1. Informasi Session</h2>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <select
              className="rounded-xl border px-3 py-2.5"
              value={form.sourceId}
              onChange={(e) => setForm({ ...form, sourceId: e.target.value })}
            >
              <option value="">Pilih sumber data peserta</option>
              {sources.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.name}
                  {source.institution_name
                    ? ` · ${source.institution_name}`
                    : ""}
                </option>
              ))}
            </select>

            <select
              className="rounded-xl border px-3 py-2.5"
              value={form.locationKey}
              onChange={(e) => applyLocation(e.target.value)}
              disabled={!form.sourceId || loadingLocations}
            >
              <option value="">Pilih lokasi / isi manual</option>
              {locations.length ? (
                <option value={allLocationsKey}>
                  Atur semua lokasi sekaligus ({locations.length})
                </option>
              ) : null}
              {locations.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.locationName} · {item.sessionDate || "Tanpa tanggal"} · {item.participantCount} peserta
                </option>
              ))}
            </select>

            <input
              className="rounded-xl border px-3 py-2.5"
              placeholder="Nama perusahaan"
              value={form.companyName}
              onChange={(e) =>
                setForm({ ...form, companyName: e.target.value })
              }
            />

            <input
              className="rounded-xl border px-3 py-2.5"
              placeholder="Nama session, contoh: HealthDay PT ABC"
              value={form.sessionName}
              onChange={(e) =>
                setForm({ ...form, sessionName: e.target.value })
              }
              disabled={form.locationKey === allLocationsKey}
            />

            <input
              className="rounded-xl border px-3 py-2.5"
              placeholder="Lokasi"
              value={form.location}
              onChange={(e) =>
                setForm({ ...form, location: e.target.value, locationKey: "" })
              }
              disabled={
                Boolean(selectedLocation) ||
                form.locationKey === allLocationsKey
              }
            />

            <input
              type="date"
              className="rounded-xl border px-3 py-2.5"
              value={form.sessionDate}
              onChange={(e) =>
                setForm({
                  ...form,
                  sessionDate: e.target.value,
                  locationKey: "",
                })
              }
              disabled={
                Boolean(selectedLocation) ||
                form.locationKey === allLocationsKey
              }
            />

            <input
              className="rounded-xl border px-3 py-2.5 md:col-span-2 xl:col-span-3"
              placeholder="Jam / slot, contoh: 09.00 - 14.00"
              value={form.timeSlot}
              onChange={(e) =>
                setForm({ ...form, timeSlot: e.target.value, locationKey: "" })
              }
              disabled={
                Boolean(selectedLocation) ||
                form.locationKey === allLocationsKey
              }
            />
          </div>

          <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50/60 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-black text-slate-900">Alur Layanan</div>
                <div className="mt-1 text-[11px] font-semibold text-slate-500">
                  Atur alur Healthday dan Bazar sesuai kebutuhan operasional event.
                </div>
              </div>
              <div className="rounded-full border border-sky-200 bg-white px-3 py-1 text-[11px] font-black text-sky-700">
                Pengaturan per layanan
              </div>
            </div>

            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              {([
                ["HEALTHDAY", "Healthday", form.existingFlowHealthdayQueueEnabled],
                ["BAZAR", "Bazar", form.existingFlowBazarQueueEnabled],
              ] as const).map(([mode, label, enabled]) => (
                <div key={mode} className={`rounded-xl border p-3 ${mode === "BAZAR" ? "border-violet-200 bg-violet-50/60" : "border-blue-200 bg-blue-50/60"}`}>
                  <div className={`text-xs font-black uppercase ${mode === "BAZAR" ? "text-violet-700" : "text-blue-700"}`}>{label}</div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-sm font-bold">
                    <span className="rounded-lg bg-emerald-100 px-2.5 py-1 text-emerald-700">1. Registrasi</span>
                    <span>→</span>
                    <label className={`flex items-center gap-2 rounded-lg px-2.5 py-1 ${enabled ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                      <input
                        type="checkbox"
                        checked={enabled}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            existingFlowQueueEnabled:
                              mode === "HEALTHDAY"
                                ? e.target.checked || prev.existingFlowBazarQueueEnabled
                                : prev.existingFlowHealthdayQueueEnabled || e.target.checked,
                            ...(mode === "HEALTHDAY"
                              ? { existingFlowHealthdayQueueEnabled: e.target.checked }
                              : { existingFlowBazarQueueEnabled: e.target.checked }),
                          }))
                        }
                      />
                      2. Antrean inHarmony
                    </label>
                    <span>→</span>
                    <span className={form.existingFlowDoctorEnabled ? "rounded-lg bg-blue-100 px-2.5 py-1 text-blue-700" : "rounded-lg bg-slate-100 px-2.5 py-1 text-slate-500"}>
                      3. Dokter {form.existingFlowDoctorEnabled ? "Aktif" : "Nonaktif"}
                    </span>
                  </div>
                  <div className="mt-2 text-[11px] font-semibold text-slate-500">
                    {enabled
                      ? "Nomor antrean dibuat otomatis oleh inHarmony."
                      : "Gunakan nomor antrean dari vendor, lalu lanjutkan proses melalui Tim Validasi."}
                  </div>
                </div>
              ))}
            </div>

            <label className="mt-3 inline-flex items-center gap-2 rounded-xl border bg-white px-3 py-2 text-sm font-bold text-slate-700">
              <input
                type="checkbox"
                checked={form.existingFlowDoctorEnabled}
                onChange={(e) => setForm((prev) => ({ ...prev, existingFlowDoctorEnabled: e.target.checked }))}
              />
              Aktifkan tahap Dokter
            </label>
          </div>

          {form.sourceId && !loadingLocations && !locations.length ? (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-800">
              Belum ada lokasi yang tersedia pada sumber data ini. Periksa kembali data peserta atau hubungi administrator.
            </div>
          ) : null}

          {selectedLocation ? (
            <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
              <div className="font-black">Lokasi dipilih</div>
              <div>
                {selectedLocation.locationName} · {selectedLocation.sessionDate || "Tanpa tanggal"}
              </div>
              <div>
                Estimasi peserta:{" "}
                <b>{selectedLocation.participantCount}</b>
              </div>
            </div>
          ) : null}
        </section>

        <section className="mt-6 rounded-2xl border bg-slate-50 p-5">
          <h2 className="font-bold">
            2. Daftar Vaksin & Lot untuk Session Ini
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Tambahkan semua vaksin yang akan diberikan. Jika pilih Generate
            Semua Lokasi, daftar vaksin/lot ini akan dipasang ke semua session
            lokasi yang dibuat.
          </p>

          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">
            Daftar vaksin mengikuti pengaturan di <b>Master Produk & Lot</b> untuk session ini. Produk tetap dapat disiapkan meskipun lot belum tersedia.
          </div>

          {!sessionProductAssignmentReady ? (
            <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
              {sessionProductAssignmentMessage || "Pengaturan produk untuk session ini belum tersedia. Hubungi administrator jika kondisi ini berlanjut."}
            </div>
          ) : null}

          <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700">
            Produk untuk <b>{currentCompanyName || "perusahaan belum dipilih"}</b> mengikuti pengaturan session yang dipilih. Produk yang pernah digunakan tetap ditampilkan agar riwayat layanan tetap utuh.
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_120px_auto]">
            <select
              className="rounded-xl border px-3 py-2.5"
              value={draft.vaccineId}
              onChange={(e) =>
                setDraft({ ...draft, vaccineId: e.target.value, lotId: "" })
              }
            >
              <option value="">Pilih vaksin</option>
              {selectableVaccines.map((vaccine) => {
                const importedLabel = importedProductLabel(String(vaccine.id));
                return (
                  <option key={vaccine.id} value={vaccine.id}>
                    {importedLabel || vaccine.name}
                    {!importedLabel && vaccine.brand ? ` · ${vaccine.brand}` : ""}
                    {currentSessionId && assignmentServiceLabel(currentSessionId, vaccine.id)
                      ? ` · ${assignmentServiceLabel(currentSessionId, vaccine.id)}`
                      : ""}
                  </option>
                );
              })}
            </select>

            <select
              className="rounded-xl border px-3 py-2.5"
              value={draft.lotId}
              onChange={(e) => setDraft({ ...draft, lotId: e.target.value })}
            >
              <option value="">Pilih lot number</option>
              {filteredLots.map((lot) => {
                const remaining =
                  lot.stock_physical_count == null
                    ? Number(lot.stock_initial || 0) +
                      Number(lot.stock_added || 0) -
                      Number(lot.stock_used || 0)
                    : Number(lot.stock_physical_count || 0);
                return (
                  <option key={lot.id} value={lot.id}>
                    {lot.vaccine?.name || "Vaksin"} · Lot {lot.lot_number} ·
                    stok {remaining} · exp {lot.expiry_date || "-"}
                  </option>
                );
              })}
            </select>

            {selectedVaccineHasNoActiveLot ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 md:col-span-2">
                Produk tersedia untuk session ini, tetapi belum memiliki lot aktif. Tambahkan lot melalui <a href="/vaccination/master" className="font-bold underline">Master Produk & Lot</a> sebelum digunakan.
              </div>
            ) : null}

            <input
              type="number"
              min={1}
              className="rounded-xl border px-3 py-2.5"
              value={draft.doseNumber}
              onChange={(e) =>
                setDraft({ ...draft, doseNumber: Number(e.target.value || 1) })
              }
            />

            <button
              type="button"
              onClick={addSessionVaccine}
              className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white hover:bg-blue-700"
            >
              Tambah
            </button>
          </div>

          <div className="mt-4 overflow-hidden rounded-2xl border bg-white">
            <table className="min-w-[1320px] table-fixed text-sm">
              <thead className="bg-slate-100 text-xs uppercase text-slate-600">
                <tr>
                  <th className="p-3 text-left">Vaksin</th>
                  <th className="p-3 text-left">Lot Number</th>
                  <th className="p-3 text-left">Dose</th>
                  <th className="w-[160px] p-3 text-left">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {sessionVaccines.map((item, index) => (
                  <tr
                    key={`${item.vaccineId}-${item.lotId}-${item.doseNumber}`}
                  >
                    <td className="p-3 font-bold">
                      {vaccineName(item.vaccineId)}
                    </td>
                    <td className="p-3">{lotName(item.lotId)}</td>
                    <td className="p-3">{item.doseNumber}</td>
                    <td className="p-3">
                      <button
                        type="button"
                        onClick={() => removeSessionVaccine(index)}
                        className="rounded-lg border border-red-200 bg-red-50 px-3 py-1 text-xs font-bold text-red-700"
                      >
                        Hapus
                      </button>
                    </td>
                  </tr>
                ))}

                {pendingAssignedProducts.map((row) => {
                  const vaccineId = String(row.vaccineId);
                  const availableLots = pendingLotsForVaccine(vaccineId);
                  const pending = pendingLotDrafts[vaccineId] || {
                    lotId: "",
                    doseNumber: 1,
                  };
                  return (
                    <tr key={`assigned-${vaccineId}`} className="bg-amber-50/60">
                      <td className="p-3">
                        <div className="font-bold">{vaccineName(vaccineId)}</div>
                        <div className="mt-1 text-[11px] font-semibold text-amber-700">
                          Tersedia untuk · {row.modes
                            .map((mode: string) => (mode === "BAZAR" ? "Bazar" : "Healthday"))
                            .join(" + ") || "Session"}
                        </div>
                      </td>
                      <td className="p-3">
                        {availableLots.length ? (
                          <select
                            className="w-full min-w-[260px] rounded-lg border bg-white px-2 py-2 text-xs font-semibold"
                            value={pending.lotId}
                            onChange={(e) =>
                              setPendingAssignedLot(vaccineId, { lotId: e.target.value })
                            }
                          >
                            <option value="">Pilih Lot Number yang baru tersedia</option>
                            {availableLots.map((lot) => (
                              <option key={lot.id} value={String(lot.id)}>
                                {lotName(String(lot.id))}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="rounded-lg bg-amber-100 px-2 py-1 text-xs font-bold text-amber-800">
                            Menunggu Lot
                          </span>
                        )}
                      </td>
                      <td className="p-3">
                        <input
                          type="number"
                          min={1}
                          className="w-20 rounded-lg border bg-white px-2 py-2 text-xs font-semibold"
                          value={pending.doseNumber}
                          onChange={(e) =>
                            setPendingAssignedLot(vaccineId, {
                              doseNumber: Math.max(1, Number(e.target.value || 1)),
                            })
                          }
                        />
                      </td>
                      <td className="p-3">
                        <button
                          type="button"
                          disabled={!availableLots.length || !pending.lotId}
                          onClick={() => activatePendingAssignedProduct(vaccineId)}
                          className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Set Lot
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {!sessionVaccines.length && !pendingAssignedProducts.length ? (
                  <tr>
                    <td colSpan={4} className="p-5 text-center text-slate-500">
                      Belum ada produk untuk session ini. Tambahkan produk melalui Master Produk & Lot.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>


          {availableBatchNames.length ? (
            <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <div className="font-black text-amber-900">3. Pemetaan Produk Peserta</div>
              <p className="mt-1 text-sm text-amber-800">
                Pengaturan yang sudah tersimpan tetap dipertahankan. Pilihan hanya menampilkan produk session yang sudah memiliki lot aktif.
              </p>
              {!sessionVaccines.length ? (
                <div className="mt-3 rounded-xl bg-white p-3 text-sm font-bold text-red-700">
                  Belum ada produk dengan lot aktif untuk session ini. Tambahkan lot di Master Produk & Lot terlebih dahulu.
                </div>
              ) : null}
              <div className="mt-3 overflow-x-auto rounded-xl border bg-white">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-100 text-xs uppercase text-slate-600">
                    <tr>
                      <th className="p-3 text-left">Nama Batch / Layanan</th>
                      <th className="p-3 text-left">Vaksin / Lot</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {batchMappings.map((item) => (
                      <tr key={item.sourceBatchName}>
                        <td className="p-3 font-bold">{item.sourceBatchName}</td>
                        <td className="p-3">
                          <select
                            className="w-full rounded-xl border px-3 py-2.5"
                            value={mappingValue(item)}
                            onChange={(e) => setBatchMapping(item.sourceBatchName, e.target.value)}
                            disabled={!sessionVaccineOptions.length}
                          >
                            <option value="">- Pilih mapping vaksin -</option>
                            {sessionVaccineOptions.map((option) => (
                              <option key={option.key} value={option.key}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          <button
            onClick={submit}
            className="mt-4 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-700"
          >
            {form.locationKey === allLocationsKey
              ? "Generate Semua Session"
              : selectedExistingSession
                ? "Update Session Existing"
                : "Simpan Session"}
          </button>
        </section>

        <section className="mt-6 overflow-hidden rounded-2xl border bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-slate-50 px-4 py-3">
            <div>
              <div className="font-black text-slate-900">Daftar Session</div>
              <div className="text-xs text-slate-500">Produk dipisahkan per layanan agar Healthday dan Bazar tidak tercampur.</div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {selectedSessionIds.length ? (
                <>
                  <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">{selectedSessionIds.length} Session dipilih</span>
                  <button
                    type="button"
                    onClick={applyBulkFlowToSelectedSessions}
                    disabled={bulkApplyingFlow}
                    className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-black text-white disabled:opacity-50"
                  >
                    {bulkApplyingFlow ? "Menerapkan..." : "Terapkan Flow di Atas"}
                  </button>
                  <button type="button" onClick={() => setSelectedSessionIds([])} className="rounded-xl border bg-white px-3 py-2 text-xs font-bold">Batal Pilih</button>
                </>
              ) : null}
              <div className="rounded-full border bg-white px-3 py-1 text-xs font-bold text-slate-600">{sessions.length} session</div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[1180px] w-full text-sm">
              <thead className="bg-slate-100 text-xs uppercase text-slate-600">
                <tr>
                  <th className="w-[48px] p-3 text-center">
                    <input
                      type="checkbox"
                      aria-label="Pilih semua Session"
                      checked={sessions.length > 0 && selectedSessionIds.length === sessions.length}
                      onChange={(e) => setSelectedSessionIds(e.target.checked ? sessions.map((item: any) => Number(item.id)).filter(Boolean) : [])}
                    />
                  </th>
                  <th className="w-[260px] p-3 text-left">Session</th>
                  <th className="w-[210px] p-3 text-left">Lokasi / Tanggal</th>
                  <th className="min-w-[420px] p-3 text-left">Produk Session</th>
                  <th className="w-[110px] p-3 text-left">Peserta</th>
                  <th className="w-[120px] p-3 text-left">Public</th>
                  <th className="w-[150px] p-3 text-left">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {sessions.map((session) => {
                  const allItems = Array.isArray(session.session_vaccines) ? session.session_vaccines : [];
                  const itemsForMode = (mode: "HEALTHDAY" | "BAZAR") =>
                    allItems.filter((item: any) => {
                      const modes = Array.isArray(item?.service_modes) && item.service_modes.length
                        ? item.service_modes.map((value: any) => String(value || "").toUpperCase())
                        : ["HEALTHDAY"];
                      return modes.includes(mode);
                    });
                  const healthdayItems = itemsForMode("HEALTHDAY");
                  const bazarItems = itemsForMode("BAZAR");
                  const renderModeGroup = (
                    label: string,
                    mode: "HEALTHDAY" | "BAZAR",
                    items: any[],
                  ) => (
                    <details
                      open={mode === "HEALTHDAY"}
                      className={`rounded-xl border ${mode === "BAZAR" ? "border-violet-200 bg-violet-50/60" : "border-blue-200 bg-blue-50/60"}`}
                    >
                      <summary className={`cursor-pointer list-none px-3 py-2 text-xs font-black ${mode === "BAZAR" ? "text-violet-800" : "text-blue-800"}`}>
                        <span className="inline-flex items-center gap-2">
                          <span>{label}</span>
                          <span className="rounded-full bg-white px-2 py-0.5 text-[10px] text-slate-600">{items.length} produk</span>
                        </span>
                      </summary>
                      <div className="max-h-36 space-y-1 overflow-y-auto border-t border-white/80 px-2 py-2">
                        {items.length ? items.map((item: any) => (
                          <div key={`${mode}-${item.id}`} className="flex items-center justify-between gap-2 rounded-lg bg-white px-2.5 py-1.5 text-xs shadow-sm">
                            <span className="min-w-0 truncate font-bold text-slate-800">{item.vaccine?.name || "Vaksin"}</span>
                            <span className="shrink-0 text-[11px] font-semibold text-slate-500">Lot {item.lot?.lot_number || "-"}</span>
                          </div>
                        )) : (
                          <div className="px-2 py-1 text-xs font-semibold text-slate-400">Tidak ada produk {label}.</div>
                        )}
                      </div>
                    </details>
                  );

                  return (
                    <tr key={session.id} className="align-top hover:bg-slate-50/60">
                      <td className="p-3 text-center">
                        <input
                          type="checkbox"
                          aria-label={`Pilih Session ${session.session_name || session.id}`}
                          checked={selectedSessionIds.includes(Number(session.id))}
                          onChange={(e) => setSelectedSessionIds((prev) => e.target.checked
                            ? Array.from(new Set([...prev, Number(session.id)]))
                            : prev.filter((id) => id !== Number(session.id)))}
                        />
                      </td>
                      <td className="p-3">
                        <div className="max-w-[250px] font-black leading-snug text-slate-900" title={session.session_name || ""}>
                          {session.session_name || "-"}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">{session.source_name || session.source_id || "-"}</div>
                        <div className="mt-2 flex flex-wrap gap-1 text-[10px] font-black">
                          <span className={`rounded-full px-2 py-0.5 ${
                            (session?.existing_flow_config?.queue_healthday === undefined
                              ? session?.existing_flow_config?.queue !== false
                              : session?.existing_flow_config?.queue_healthday !== false)
                              ? "bg-blue-100 text-blue-700"
                              : "bg-slate-100 text-slate-600"
                          }`}>
                            Healthday: {(session?.existing_flow_config?.queue_healthday === undefined
                              ? session?.existing_flow_config?.queue !== false
                              : session?.existing_flow_config?.queue_healthday !== false) ? "Internal" : "Vendor"}
                          </span>
                          <span className={`rounded-full px-2 py-0.5 ${
                            (session?.existing_flow_config?.queue_bazar === undefined
                              ? session?.existing_flow_config?.queue !== false
                              : session?.existing_flow_config?.queue_bazar !== false)
                              ? "bg-violet-100 text-violet-700"
                              : "bg-slate-100 text-slate-600"
                          }`}>
                            Bazar: {(session?.existing_flow_config?.queue_bazar === undefined
                              ? session?.existing_flow_config?.queue !== false
                              : session?.existing_flow_config?.queue_bazar !== false) ? "Internal" : "Vendor"}
                          </span>
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="font-bold text-slate-800">{session.location || "-"}</div>
                        <div className="mt-1 text-xs font-semibold text-slate-500">{session.session_date || "-"}</div>
                      </td>
                      <td className="p-3">
                        <div className="grid gap-2 lg:grid-cols-2">
                          {renderModeGroup("Healthday", "HEALTHDAY", healthdayItems)}
                          {renderModeGroup("Bazar", "BAZAR", bazarItems)}
                        </div>
                      </td>
                      <td className="p-3 font-black text-slate-800">{session.participant_count_planned ?? "-"}</td>
                      <td className="p-3 whitespace-nowrap">
                        <a
                          className="rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-bold text-blue-700"
                          href={`/vaccination/public/queue/${session.public_queue_token}`}
                          target="_blank"
                        >
                          Public Queue
                        </a>
                      </td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => openEditSession(session)}
                            className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-100"
                            title="Edit session"
                          >
                            ✏ Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteSession(session)}
                            className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-100"
                            title="Hapus session"
                          >
                            🗑 Hapus
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!sessions.length ? (
                  <tr>
                    <td colSpan={6} className="p-5 text-center text-slate-500">Belum ada session.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        {editingSession ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
            <div className="max-h-[90vh] w-full max-w-5xl overflow-x-hidden overflow-y-auto rounded-3xl border bg-white p-6 shadow-2xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-black">Edit Session</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Perbarui informasi session, produk, lot, dan dosis. Data registrasi serta riwayat layanan yang sudah tercatat tetap dipertahankan.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeEditSession}
                  disabled={savingEditSession}
                  className="rounded-xl border px-3 py-2 text-sm font-bold hover:bg-slate-50 disabled:opacity-50"
                >
                  Tutup
                </button>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-2">
                <label className="grid gap-1 text-sm font-bold text-slate-700 md:col-span-2">
                  Nama Session
                  <input
                    className="rounded-xl border px-3 py-2.5 font-medium"
                    value={editSessionForm.sessionName}
                    onChange={(e) => setEditSessionForm((prev) => ({ ...prev, sessionName: e.target.value }))}
                  />
                </label>

                <label className="grid gap-1 text-sm font-bold text-slate-700">
                  Nama Perusahaan
                  <input
                    className="rounded-xl border px-3 py-2.5 font-medium"
                    value={editSessionForm.companyName}
                    onChange={(e) => setEditSessionForm((prev) => ({ ...prev, companyName: e.target.value }))}
                  />
                </label>

                <label className="grid gap-1 text-sm font-bold text-slate-700">
                  Lokasi
                  <input
                    className="rounded-xl border px-3 py-2.5 font-medium"
                    value={editSessionForm.location}
                    onChange={(e) => setEditSessionForm((prev) => ({ ...prev, location: e.target.value }))}
                  />
                </label>

                <label className="grid gap-1 text-sm font-bold text-slate-700">
                  Tanggal
                  <input
                    type="date"
                    className="rounded-xl border px-3 py-2.5 font-medium"
                    value={editSessionForm.sessionDate}
                    onChange={(e) => setEditSessionForm((prev) => ({ ...prev, sessionDate: e.target.value }))}
                  />
                </label>

                <label className="grid gap-1 text-sm font-bold text-slate-700">
                  Jam / Slot
                  <input
                    className="rounded-xl border px-3 py-2.5 font-medium"
                    value={editSessionForm.timeSlot}
                    onChange={(e) => setEditSessionForm((prev) => ({ ...prev, timeSlot: e.target.value }))}
                    placeholder="Contoh: 09.00 - 14.00"
                  />
                </label>

                <label className="grid gap-1 text-sm font-bold text-slate-700">
                  Peserta Rencana
                  <input
                    type="number"
                    min={0}
                    className="rounded-xl border px-3 py-2.5 font-medium"
                    value={editSessionForm.participantCountPlanned}
                    onChange={(e) => setEditSessionForm((prev) => ({ ...prev, participantCountPlanned: e.target.value }))}
                  />
                </label>

                <label className="grid gap-1 text-sm font-bold text-slate-700">
                  Petugas Print Label
                  <select
                    className="rounded-xl border px-3 py-2.5 font-bold"
                    value={editSessionForm.printLabelHandler}
                    disabled={loadingEditPrintMode || !editPrintModeReady}
                    onChange={(e) =>
                      setEditSessionForm((prev) => ({
                        ...prev,
                        printLabelHandler: e.target.value === "VALIDASI" ? "VALIDASI" : "MEDIS",
                      }))
                    }
                  >
                    <option value="MEDIS">Dokter / Medis</option>
                    <option value="VALIDASI">Tim Validasi</option>
                  </select>
                </label>
              </div>

              <div className="mt-5 rounded-2xl border border-sky-200 bg-sky-50/50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-black text-slate-900">
                      Flow Mode Existing
                    </div>
                    <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-600">
                      Session lama tetap memakai Legacy. Pilih Healthday + Bazar hanya
                      untuk session yang akan memakai antrean A/B dan alur baru.
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-black ${
                      editSessionForm.existingQueueProfile === "HEALTHDAY_BAZAR"
                        ? "bg-sky-600 text-white"
                        : "bg-slate-200 text-slate-700"
                    }`}
                  >
                    {editSessionForm.existingQueueProfile === "HEALTHDAY_BAZAR"
                      ? "HEALTHDAY + BAZAR"
                      : "LEGACY"}
                  </span>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <label className="grid gap-1 text-sm font-bold text-slate-700">
                    Tipe Mode Existing
                    <select
                      className="rounded-xl border bg-white px-3 py-2.5 font-bold"
                      value={editSessionForm.existingQueueProfile}
                      onChange={(e) =>
                        setEditSessionForm((prev) => ({
                          ...prev,
                          existingQueueProfile:
                            e.target.value === "HEALTHDAY_BAZAR"
                              ? "HEALTHDAY_BAZAR"
                              : "LEGACY",
                        }))
                      }
                    >
                      <option value="LEGACY">Legacy — kondisi lama</option>
                      <option value="HEALTHDAY_BAZAR">
                        Healthday + Bazar — antrean A/B
                      </option>
                    </select>
                  </label>

                  <div className="rounded-xl border bg-white p-3">
                    <div className="text-xs font-black uppercase tracking-wide text-slate-500">Flow per Layanan</div>
                    <div className="mt-3 grid gap-3">
                      {([
                        ["HEALTHDAY", "Healthday", editSessionForm.existingFlowHealthdayQueueEnabled],
                        ["BAZAR", "Bazar", editSessionForm.existingFlowBazarQueueEnabled],
                      ] as const).map(([mode, label, enabled]) => (
                        <div key={mode} className={`rounded-xl border p-3 ${mode === "BAZAR" ? "border-violet-200 bg-violet-50/50" : "border-blue-200 bg-blue-50/50"}`}>
                          <div className={`text-xs font-black uppercase ${mode === "BAZAR" ? "text-violet-700" : "text-blue-700"}`}>{label}</div>
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm font-bold">
                            <span className="rounded-lg bg-emerald-100 px-2.5 py-1 text-emerald-700">1. Registrasi</span>
                            <span>→</span>
                            <label className={`flex items-center gap-2 rounded-lg px-2.5 py-1 ${enabled ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                              <input
                                type="checkbox"
                                checked={enabled}
                                onChange={(e) => setEditSessionForm((prev) => ({
                                  ...prev,
                                  existingFlowQueueEnabled:
                                    mode === "HEALTHDAY"
                                      ? e.target.checked || prev.existingFlowBazarQueueEnabled
                                      : prev.existingFlowHealthdayQueueEnabled || e.target.checked,
                                  ...(mode === "HEALTHDAY"
                                    ? { existingFlowHealthdayQueueEnabled: e.target.checked }
                                    : { existingFlowBazarQueueEnabled: e.target.checked }),
                                }))}
                              />
                              2. Antrean inHarmony
                            </label>
                            <span>→</span>
                            <span className={editSessionForm.existingFlowDoctorEnabled ? "rounded-lg bg-blue-100 px-2.5 py-1 text-blue-700" : "rounded-lg bg-slate-100 px-2.5 py-1 text-slate-500"}>
                              3. Dokter {editSessionForm.existingFlowDoctorEnabled ? "ON" : "OFF"}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                    <label className="mt-3 inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-bold">
                      <input
                        type="checkbox"
                        checked={editSessionForm.existingFlowDoctorEnabled}
                        onChange={(e) => setEditSessionForm((prev) => ({ ...prev, existingFlowDoctorEnabled: e.target.checked }))}
                      />
                      Aktifkan Alur Dokter
                    </label>
                    <p className="mt-2 text-[11px] font-semibold leading-4 text-slate-500">
                      Atur metode antrean Healthday dan Bazar sesuai kebutuhan operasional event.
                    </p>
                  </div>

                  <div className="rounded-xl border bg-white p-3 md:col-span-2">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <label className="flex items-center gap-2 text-sm font-black text-slate-700">
                        <input
                          type="checkbox"
                          checked={editSessionForm.existingNotificationEnabled}
                          onChange={(e) =>
                            setEditSessionForm((prev) => ({
                              ...prev,
                              existingNotificationEnabled: e.target.checked,
                            }))
                          }
                        />
                        Notifikasi panggilan Existing (non-WhatsApp)
                      </label>

                      <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
                        Ulangi
                        <select
                          value={editSessionForm.existingNotificationRepeat}
                          disabled={!editSessionForm.existingNotificationEnabled}
                          onChange={(e) =>
                            setEditSessionForm((prev) => ({
                              ...prev,
                              existingNotificationRepeat: Number(e.target.value),
                            }))
                          }
                          className="rounded-lg border bg-white px-2 py-1.5 font-black disabled:opacity-50"
                        >
                          {[1, 2, 3, 4, 5].map((value) => (
                            <option key={value} value={value}>
                              {value}x
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <p className="mt-2 text-[11px] font-semibold leading-4 text-slate-500">
                      Channel disiapkan sebagai Voice/Browser per session, terpisah
                      dari WhatsApp Onsite. Tahap ini hanya menyimpan setting; belum
                      mengubah perilaku antrean Existing lama.
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-5 rounded-2xl border border-violet-200 bg-violet-50/50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-black text-slate-900">Form Ambil Nomor Antrean</div>
                    <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-600">
                      Atur field yang tampil saat peserta scan QR onsite. Field dapat ditambah,
                      dihapus, diurutkan, diubah labelnya, dan dibuat wajib/opsional per session.
                      Pilih satu Recovery Key agar peserta dapat membuka kembali antrean jika browser tertutup.
                    </p>
                  </div>
                  <div
                    className={`rounded-full px-3 py-1 text-xs font-black ${
                      editQueueFormFields.some((item) => item.kind === "whatsapp")
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-200 text-slate-600"
                    }`}
                  >
                    WA Reminder{" "}
                    {editQueueFormFields.some((item) => item.kind === "whatsapp")
                      ? "AKTIF"
                      : "NONAKTIF"}
                  </div>
                </div>

                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <select
                    value={queueFieldKindToAdd}
                    onChange={(e) =>
                      setQueueFieldKindToAdd(e.target.value as OnsiteQueueFormFieldKind)
                    }
                    className="min-w-0 flex-1 rounded-xl border bg-white px-3 py-2.5 text-sm font-bold"
                  >
                    {queueFieldKinds.map((kind) => (
                      <option
                        key={kind}
                        value={kind}
                        disabled={
                          uniqueQueueFieldKinds.has(kind) &&
                          editQueueFormFields.some((item) => item.kind === kind)
                        }
                      >
                        {onsiteQueueFieldKindLabel(kind)}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={addEditQueueField}
                    className="rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-black text-white"
                  >
                    + Tambah Field
                  </button>
                </div>

                <div className="mt-4 space-y-3">
                  {editQueueFormFields.map((field, index) => (
                    <div
                      key={field.id}
                      className={`grid gap-3 rounded-2xl border bg-white p-3 ${
                        field.kind === "employee_id"
                          ? "md:grid-cols-2 xl:grid-cols-[140px_minmax(0,1fr)_minmax(0,1fr)_140px_110px_150px_auto]"
                          : "md:grid-cols-2 xl:grid-cols-[140px_minmax(0,1fr)_minmax(0,1fr)_110px_150px_auto]"
                      }`}
                    >
                      <div className="flex items-center">
                        <span className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-black text-slate-700">
                          {onsiteQueueFieldKindLabel(field.kind)}
                        </span>
                      </div>

                      <label className="grid min-w-0 gap-1 text-xs font-bold text-slate-600">
                        Label
                        <input
                          value={field.label}
                          onChange={(e) =>
                            updateEditQueueField(index, { label: e.target.value })
                          }
                          className="w-full min-w-0 rounded-xl border px-3 py-2 text-sm font-semibold text-slate-900"
                          placeholder="Label field"
                        />
                      </label>

                      <label className="grid min-w-0 gap-1 text-xs font-bold text-slate-600">
                        Placeholder
                        <input
                          value={field.placeholder || ""}
                          onChange={(e) =>
                            updateEditQueueField(index, { placeholder: e.target.value })
                          }
                          className="w-full min-w-0 rounded-xl border px-3 py-2 text-sm font-semibold text-slate-900"
                          placeholder="Placeholder"
                        />
                      </label>

                      {field.kind === "employee_id" ? (
                        <label className="grid min-w-0 gap-1 text-xs font-bold text-slate-600">
                          Jumlah Karakter
                          <input
                            type="number"
                            min={1}
                            max={32}
                            step={1}
                            value={field.exactLength ?? ""}
                            onChange={(e) => {
                              const value = e.target.value.trim();
                              updateEditQueueField(index, {
                                exactLength: value ? Number(value) : undefined,
                              });
                            }}
                            className="w-full min-w-0 rounded-xl border px-3 py-2 text-sm font-semibold text-slate-900"
                            placeholder="8"
                          />
                          <span className="whitespace-normal text-[10px] font-semibold leading-4 text-slate-400">
                            Kosong = tidak dibatasi
                          </span>
                        </label>
                      ) : null}

                      <label className="flex min-h-[44px] items-center gap-2 self-end rounded-xl border px-3 py-2.5 text-xs font-black text-slate-700">
                        <input
                          type="checkbox"
                          checked={field.required}
                          disabled={field.recoveryKey}
                          onChange={(e) =>
                            updateEditQueueField(index, { required: e.target.checked })
                          }
                        />
                        Wajib
                      </label>

                      <label className={`flex min-h-[44px] items-center gap-2 self-end rounded-xl border px-3 py-2.5 text-xs font-black ${
                        field.recoveryKey
                          ? "border-violet-300 bg-violet-50 text-violet-800"
                          : "border-slate-200 text-slate-700"
                      }`}>
                        <input
                          type="radio"
                          name="onsite-queue-recovery-key"
                          checked={field.recoveryKey}
                          onChange={() => setEditQueueRecoveryField(index)}
                        />
                        Recovery Key
                      </label>

                      <div className="flex flex-wrap items-end justify-start gap-1 xl:justify-end">
                        <button
                          type="button"
                          disabled={index === 0}
                          onClick={() => moveEditQueueField(index, -1)}
                          className="rounded-lg border px-2.5 py-2 text-xs font-black disabled:opacity-30"
                          title="Naik"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          disabled={index === editQueueFormFields.length - 1}
                          onClick={() => moveEditQueueField(index, 1)}
                          className="rounded-lg border px-2.5 py-2 text-xs font-black disabled:opacity-30"
                          title="Turun"
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          onClick={() => removeEditQueueField(index)}
                          className="rounded-lg border border-red-200 px-2.5 py-2 text-xs font-black text-red-700"
                          title="Hapus field"
                        >
                          Hapus
                        </button>
                      </div>
                    </div>
                  ))}

                  {!editQueueFormFields.length ? (
                    <div className="rounded-xl border border-dashed border-red-200 bg-red-50 p-4 text-center text-sm font-semibold text-red-700">
                      Tambahkan minimal 1 field dan pilih sebagai Recovery Key sebelum session disimpan.
                    </div>
                  ) : null}
                </div>

                <div className="mt-4 grid gap-2 text-xs font-semibold sm:grid-cols-3">
                  <div className={`rounded-xl border p-3 ${
                    editQueueFormFields.some((item) => item.kind === "whatsapp")
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border-slate-200 bg-slate-100 text-slate-600"
                  }`}>
                    <span className="font-black">WhatsApp:</span>{" "}
                    {editQueueFormFields.some((item) => item.kind === "whatsapp")
                      ? "field WhatsApp ada → reminder WA session aktif."
                      : "field WhatsApp tidak ada → reminder WA session nonaktif."}
                  </div>
                  <div className={`rounded-xl border p-3 ${
                    editQueueFormFields.some((item) => item.kind === "employee_id")
                      ? "border-blue-200 bg-blue-50 text-blue-800"
                      : "border-amber-200 bg-amber-50 text-amber-800"
                  }`}>
                    <span className="font-black">Duplikasi antrean:</span>{" "}
                    {editQueueFormFields.some((item) => item.kind === "employee_id")
                      ? `NIK / ID peserta dipakai untuk menjaga 1 peserta = 1 nomor.${
                          editQueueFormFields.find((item) => item.kind === "employee_id")?.exactLength
                            ? ` Wajib ${
                                editQueueFormFields.find((item) => item.kind === "employee_id")?.exactLength
                              } karakter.`
                            : ""
                        }`
                      : "tanpa NIK / ID, sistem memakai identitas anonim per scan."}
                  </div>
                  <div className={`rounded-xl border p-3 ${
                    editQueueFormFields.some((item) => item.recoveryKey)
                      ? "border-violet-200 bg-violet-50 text-violet-800"
                      : "border-red-200 bg-red-50 text-red-700"
                  }`}>
                    <span className="font-black">Recovery antrean:</span>{" "}
                    {editQueueFormFields.find((item) => item.recoveryKey)
                      ? `${editQueueFormFields.find((item) => item.recoveryKey)?.label} dipakai untuk Cek Antrean Saya.`
                      : "belum ada Recovery Key."}
                  </div>
                </div>
              </div>

              <div className="mt-5 rounded-2xl border bg-slate-50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-black text-slate-900">Layanan / Vaksin Session</div>
                    <p className="mt-1 text-xs text-slate-500">
                      Tambah, ganti, atau hapus layanan aktif untuk session ini. Perubahan tidak menghapus record vaksinasi pasien yang sudah tersimpan.
                    </p>
                  </div>
                  <div className="rounded-lg bg-white px-3 py-1 text-xs font-bold text-slate-600">
                    {editSessionVaccines.length} layanan aktif
                  </div>
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1.5fr)_110px_auto]">
                  <select
                    className="min-w-0 rounded-xl border bg-white px-3 py-2.5 text-sm font-semibold"
                    value={editVaccineDraft.vaccineId}
                    onChange={(e) =>
                      setEditVaccineDraft({
                        vaccineId: e.target.value,
                        lotId: "",
                        doseNumber: editVaccineDraft.doseNumber || 1,
                      })
                    }
                  >
                    <option value="">Pilih vaksin</option>
                    {editSelectableVaccines.map((vaccine) => (
                      <option key={vaccine.id} value={String(vaccine.id)}>
                        {vaccineName(String(vaccine.id))}
                        {editSessionId && assignmentServiceLabel(editSessionId, vaccine.id)
                          ? ` · ${assignmentServiceLabel(editSessionId, vaccine.id)}`
                          : ""}
                      </option>
                    ))}
                  </select>

                  <select
                    className="min-w-0 rounded-xl border bg-white px-3 py-2.5 text-sm font-semibold disabled:bg-slate-100"
                    value={editVaccineDraft.lotId}
                    disabled={!editVaccineDraft.vaccineId}
                    onChange={(e) =>
                      setEditVaccineDraft((prev) => ({ ...prev, lotId: e.target.value }))
                    }
                  >
                    <option value="">
                      {editVaccineDraft.vaccineId ? "Pilih lot number" : "Pilih vaksin dulu"}
                    </option>
                    {editFilteredLots.map((lot) => (
                      <option key={lot.id} value={String(lot.id)}>
                        {lotName(String(lot.id))}
                      </option>
                    ))}
                  </select>

                  <input
                    type="number"
                    min={1}
                    className="rounded-xl border bg-white px-3 py-2.5 text-sm font-semibold"
                    value={editVaccineDraft.doseNumber}
                    onChange={(e) =>
                      setEditVaccineDraft((prev) => ({
                        ...prev,
                        doseNumber: Math.max(1, Number(e.target.value || 1)),
                      }))
                    }
                    aria-label="Dosis"
                  />

                  <button
                    type="button"
                    onClick={addEditSessionVaccine}
                    className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-black text-white hover:bg-blue-700"
                  >
                    + Tambah
                  </button>
                </div>

                <div className="mt-3 overflow-hidden rounded-xl border bg-white">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-100 text-xs uppercase text-slate-600">
                      <tr>
                        <th className="p-3 text-left">Vaksin / Layanan</th>
                        <th className="p-3 text-left">Lot Number</th>
                        <th className="p-3 text-left">Dosis</th>
                        <th className="w-24 p-3 text-left">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {editSessionVaccines.map((item, index) => {
                        const rowVaccineExists = vaccines.some(
                          (vaccine) => String(vaccine.id) === String(item.vaccineId),
                        );
                        const rowLots = editLotsForVaccine(item.vaccineId);
                        const rowLotExists = rowLots.some(
                          (lot) => String(lot.id) === String(item.lotId),
                        );

                        return (
                          <tr key={`edit-service-${index}`}>
                            <td className="p-2 align-top">
                              <select
                                className="w-full rounded-lg border bg-white px-2 py-2 text-sm font-semibold"
                                value={item.vaccineId}
                                onChange={(e) => {
                                  const vaccineId = e.target.value;
                                  updateEditSessionVaccine(index, {
                                    vaccineId,
                                    lotId: "",
                                    vaccineLabel: vaccineName(vaccineId),
                                    lotLabel: "",
                                  });
                                }}
                              >
                                {!rowVaccineExists && item.vaccineId ? (
                                  <option value={item.vaccineId}>{editVaccineLabel(item)}</option>
                                ) : null}
                                {editSelectableVaccines.map((vaccine) => (
                                  <option key={vaccine.id} value={String(vaccine.id)}>
                                    {vaccineName(String(vaccine.id))}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="p-2 align-top">
                              <select
                                className="w-full rounded-lg border bg-white px-2 py-2 text-sm font-semibold"
                                value={item.lotId}
                                onChange={(e) => {
                                  const lotId = e.target.value;
                                  updateEditSessionVaccine(index, {
                                    lotId,
                                    lotLabel: lotName(lotId),
                                  });
                                }}
                              >
                                <option value="">Pilih lot number</option>
                                {!rowLotExists && item.lotId ? (
                                  <option value={item.lotId}>{editLotLabel(item)}</option>
                                ) : null}
                                {rowLots.map((lot) => (
                                  <option key={lot.id} value={String(lot.id)}>
                                    {lotName(String(lot.id))}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="p-2 align-top">
                              <input
                                type="number"
                                min={1}
                                className="w-24 rounded-lg border px-2 py-2 text-sm font-semibold"
                                value={item.doseNumber}
                                onChange={(e) =>
                                  updateEditSessionVaccine(index, {
                                    doseNumber: Math.max(1, Number(e.target.value || 1)),
                                  })
                                }
                              />
                            </td>
                            <td className="p-2 align-top">
                              <button
                                type="button"
                                onClick={() => removeEditSessionVaccine(index)}
                                className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-black text-red-700 hover:bg-red-100"
                              >
                                Hapus
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                      {!editSessionVaccines.length ? (
                        <tr>
                          <td colSpan={4} className="p-4 text-center text-sm text-slate-500">
                            Belum ada layanan/vaksin aktif di session ini.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
                <div className="font-black">Routing Print Label</div>
                {loadingEditPrintMode ? (
                  <div className="mt-1">Memuat setting print session...</div>
                ) : !editPrintModeReady ? (
                  <div className="mt-1 font-bold text-red-700">Setting print belum berhasil dimuat. Tutup lalu klik Edit lagi agar pilihan print tidak salah tersimpan.</div>
                ) : editSessionForm.printLabelHandler === "VALIDASI" ? (
                  <div className="mt-1">Tim Validasi: Medis menyelesaikan produk lalu mengirim ke Tim Validasi. Sticker dicetak di Tim Validasi.</div>
                ) : (
                  <div className="mt-1">Dokter / Medis: proses dan print sticker tetap dilakukan di workflow Medis sesuai aturan Administer.</div>
                )}
              </div>

              <div className="mt-6 flex flex-wrap justify-end gap-3">
                <button
                  type="button"
                  onClick={closeEditSession}
                  disabled={savingEditSession}
                  className="rounded-xl border px-4 py-3 text-sm font-bold hover:bg-slate-50 disabled:opacity-50"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={saveEditSession}
                  disabled={savingEditSession || loadingEditPrintMode || !editPrintModeReady}
                  className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {savingEditSession ? "Menyimpan..." : "Simpan Perubahan"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
