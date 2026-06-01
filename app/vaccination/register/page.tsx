"use client";

import { useEffect, useMemo, useState } from "react";

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
  status?: string;
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
  const eventName = session?.source_name || String(session?.session_name || "").split(" - ")[0] || "Session";
  return [eventName, session?.location, session?.session_date]
    .filter(Boolean)
    .join(" · ");
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
    status: "WAITING",
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
    status: item?.status || "WAITING",
  };
}

export default function VaccinationRegisterPage() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [sources, setSources] = useState<any[]>([]);
  const [vaccines, setVaccines] = useState<any[]>([]);
  const [lots, setLots] = useState<any[]>([]);
  const [registrations, setRegistrations] = useState<any[]>([]);

  const [message, setMessage] = useState("Import peserta corporate/vaksinasi lebih dulu. Nomor antrian dirilis saat peserta datang registrasi ulang.");
  const [error, setError] = useState("");
  const [importing, setImporting] = useState(false);
  const [releasingId, setReleasingId] = useState<number | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

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
  });

  const [edit, setEdit] = useState<{ registration: any; items: ProductItem[]; changeNote: string } | null>(null);
  const [selectedVaccineIds, setSelectedVaccineIds] = useState<string[]>([]);
  const [contextLocked, setContextLocked] = useState(false);
  const [sort, setSort] = useState<SortState>({ key: "queue", direction: "asc" });
  const [search, setSearch] = useState("");

  const selectedSession = sessions.find((session) => String(session.id) === String(form.sessionId));
  const selectedSourceId = useMemo(() => form.sourceId || selectedSession?.source_id || "", [form.sourceId, selectedSession?.source_id]);

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
    return ["ADMINISTERED", "DONE"].includes(String(status || "").toUpperCase());
  }

  function queueNumberValue(value: any) {
    const match = String(value || "").match(/(\d+)$/);
    return match ? Number(match[1]) : 999999999;
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
      else if (sort.key === "name") { av = a.participant_name || ""; bv = b.participant_name || ""; }
      else if (sort.key === "identity") { av = a.nik || a.mcu_id || a.employee_id || ""; bv = b.nik || b.mcu_id || b.employee_id || ""; }
      else if (sort.key === "product") { av = (a.items || []).map((i: any) => i?.vaccine?.name || "").join(" ") || a.vaccine?.name || ""; bv = (b.items || []).map((i: any) => i?.vaccine?.name || "").join(" ") || b.vaccine?.name || ""; }
      else if (sort.key === "status") { av = statusInfo(a.queue_status).label; bv = statusInfo(b.queue_status).label; }
      else if (sort.key === "note") { av = a.status_note || a.payment_note || ""; bv = b.status_note || b.payment_note || ""; }
      else { av = a.id || 0; bv = b.id || 0; }
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv), "id") * dir;
    });
    return rows;
  }, [registrations, sort]);


  const visibleRegistrations = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return sortedRegistrations;
    return sortedRegistrations.filter((registration: any) => {
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
  }, [sortedRegistrations, search]);

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
    const [sessionJson, sourceJson, masterJson] = await Promise.all([
      fetch("/api/vaccination/sessions", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/sources?program=vaccination", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/vaccination/master", { cache: "no-store" }).then((r) => r.json()),
    ]);

    if (sessionJson.ok) {
      const loadedSessions = sessionJson.sessions || [];
      setSessions(loadedSessions);
      if (!form.sessionId && loadedSessions?.[0]?.id) {
        let saved: any = null;
        if (typeof window !== "undefined") {
          try { saved = JSON.parse(window.localStorage.getItem(LOCK_KEY) || "null"); } catch { saved = null; }
        }
        const savedSession = saved?.locked ? loadedSessions.find((session: any) => String(session.id) === String(saved.sessionId)) : null;
        const first = savedSession || loadedSessions[0];
        const savedVaccineIds = Array.isArray(saved?.vaccineIds) ? saved.vaccineIds.map(String).filter(Boolean) : [];
        const defaultVaccineIds = saved?.locked && savedVaccineIds.length
          ? savedVaccineIds
          : (first.session_vaccines || []).map((item: any) => String(item.vaccine_id)).filter(Boolean);
        const firstVaccineId = defaultVaccineIds[0] || (first.default_vaccine_id ? String(first.default_vaccine_id) : "");
        setContextLocked(Boolean(saved?.locked));
        setSelectedVaccineIds(defaultVaccineIds);
        setForm((prev) => ({
          ...prev,
          sessionId: String(first.id),
          sourceId: saved?.locked && saved.sourceId ? String(saved.sourceId) : (first.source_id ? String(first.source_id) : ""),
          vaccineId: firstVaccineId,
          lotId: saved?.locked && saved.lotId ? String(saved.lotId) : (first.default_lot_id ? String(first.default_lot_id) : ""),
          companyName: saved?.locked && saved.companyName ? String(saved.companyName) : (first.company_name || ""),
        }));
      }
    }

    if (sourceJson.ok) setSources(sourceJson.sources || []);
    if (masterJson.ok) {
      setVaccines((masterJson.vaccines || []).filter((v: any) => v.active !== false));
      setLots((masterJson.lots || []).filter((l: any) => l.active !== false));
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
    const unique = Array.from(new Set(ids.map(String).filter((id) => id && (!allowed.size || allowed.has(id)))));
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
    const set = new Set(selectedVaccineIds.length ? selectedVaccineIds : (form.vaccineId ? [form.vaccineId] : []));
    if (set.has(String(vaccineId))) set.delete(String(vaccineId));
    else set.add(String(vaccineId));
    applyVaccineSelection(Array.from(set));
  }

  function buildSelectedItems() {
    const ids = selectedVaccineIds.length ? selectedVaccineIds : (form.vaccineId ? [form.vaccineId] : []);
    return Array.from(new Set(ids.map(String).filter(Boolean))).map((vaccineId) => {
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
        }
        if (patch.priceCategory !== undefined) {
          const vaccine = vaccines.find((v) => String(v.id) === String(next.vaccineId));
          if (vaccine?.price_category === patch.priceCategory && vaccine?.price != null) next.price = String(vaccine.price);
        }
        return next;
      });
      return { ...current, items };
    });
  }

  function addEditItem() {
    setEdit((current) => current ? { ...current, items: [...current.items, emptyProductItem()] } : current);
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
    setEdit({ registration, items, changeNote: registration.status_note || "" });
    setTimeout(() => document.getElementById("edit-produk-vaksin")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
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

  async function releaseQueue(registration: any) {
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

  async function submit() {
    setError("");
    const json = await fetch("/api/vaccination/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, sourceId: selectedSourceId, items: buildSelectedItems() }),
    }).then((r) => r.json());
    if (!json.ok) { setError(json.message || "Registrasi ulang gagal."); return; }
    setMessage(json.message);
    setForm((prev) => ({ ...prev, participantName: "", employeeId: "", nik: "", email: "", phone: "", department: "", paymentPrice: "", paymentMethod: "", paymentNote: "" }));
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

  return (
    <main className="p-6">
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Registrasi Vaksin</h1>
            <p className="mt-2 text-sm text-slate-600">Dashboard antrian registrasi, edit produk layanan, harga/payment note, dan export per stage.</p>
          </div>
          <a href="/vaccination" className="rounded-xl border px-4 py-2 text-sm font-bold hover:bg-slate-50">☰ Menu Vaksinasi</a>
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
          <h2 className="font-bold">2. Registrasi Ulang Manual / Walk-in</h2>
          <p className="mt-1 text-sm text-slate-500">NIK, harga pribadi, metode payment, dan catatan payment dapat diisi saat registrasi.</p>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <input className="rounded-xl border px-3 py-2.5" placeholder="Nama peserta *" value={form.participantName} onChange={(e) => setForm({ ...form, participantName: e.target.value })} />
            <input className="rounded-xl border px-3 py-2.5" placeholder="Employee ID" value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })} />
            <input className="rounded-xl border px-3 py-2.5" placeholder="NIK KTP" value={form.nik} onChange={(e) => setForm({ ...form, nik: e.target.value })} />
            <input className="rounded-xl border px-3 py-2.5" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <input className="rounded-xl border px-3 py-2.5" placeholder="Nomor HP" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <input className="rounded-xl border px-3 py-2.5" placeholder="Perusahaan" value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} />
            <input className="rounded-xl border px-3 py-2.5" placeholder="Departemen" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
            <select className="rounded-xl border px-3 py-2.5" value={form.lotId} onChange={(e) => setForm({ ...form, lotId: e.target.value })}>
              <option value="">Lot utama vaksin pertama</option>
              {lotOptions(form.vaccineId).map((lot) => <option key={lot.id} value={lot.id}>Lot {lot.lot_number} · exp {lot.expiry_date || "-"}</option>)}
            </select>
            <input type="number" className="rounded-xl border px-3 py-2.5" placeholder="Harga pribadi / tambahan" value={form.paymentPrice} onChange={(e) => setForm({ ...form, paymentPrice: e.target.value })} />
            <input className="rounded-xl border px-3 py-2.5" placeholder="Metode payment, contoh: QRIS/Cash/Transfer" value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })} />
            <input className="rounded-xl border px-3 py-2.5 md:col-span-2" placeholder="Catatan payment / tambahan vaksin" value={form.paymentNote} onChange={(e) => setForm({ ...form, paymentNote: e.target.value })} />
          </div>
          {selectedVaccines.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {selectedVaccines.map((vaccine: any) => (
                <span key={vaccine.id} className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">{vaccineLabel(vaccine)}</span>
              ))}
            </div>
          ) : null}
          <button onClick={submit} className="mt-4 rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white hover:bg-blue-700">Registrasi Ulang + Rilis Nomor Antrian</button>
        </section>

        {edit ? (
          <section id="edit-produk-vaksin" className="mt-6 rounded-2xl border border-orange-200 bg-orange-50 p-5">
            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
              <div>
                <h2 className="font-black text-orange-900">Edit Produk / Tindakan</h2>
                <p className="mt-1 text-sm font-semibold text-orange-800">{edit.registration.queue_number || "Belum rilis"} · {edit.registration.participant_name}</p>
              </div>
              <button type="button" onClick={() => setEdit(null)} className="rounded-xl border bg-white px-4 py-2 text-sm font-bold hover:bg-slate-50">Tutup</button>
            </div>

            <div className="mt-4 space-y-3">
              {edit.items.map((item, index) => (
                <div key={index} className={`grid gap-3 rounded-2xl border bg-white p-4 xl:grid-cols-[1.2fr_1.1fr_100px_160px_130px_1fr_160px] ${isDoneStatus(item.status) ? "opacity-80" : ""}`}>
                  <select disabled={isDoneStatus(item.status)} className="rounded-xl border px-3 py-2.5 disabled:bg-slate-100" value={item.vaccineId} onChange={(e) => updateEditItem(index, { vaccineId: e.target.value })}>
                    <option value="">Pilih vaksin</option>
                    {availableVaccines.map((vaccine) => <option key={vaccine.id} value={vaccine.id}>{vaccineLabel(vaccine)}</option>)}
                  </select>
                  <select disabled={isDoneStatus(item.status)} className="rounded-xl border px-3 py-2.5 disabled:bg-slate-100" value={item.lotId} onChange={(e) => updateEditItem(index, { lotId: e.target.value })}>
                    <option value="">Pilih lot</option>
                    {lotOptions(item.vaccineId).map((lot) => <option key={lot.id} value={lot.id}>Lot {lot.lot_number} · exp {lot.expiry_date || "-"}</option>)}
                  </select>
                  <input disabled={isDoneStatus(item.status)} type="number" min={1} className="rounded-xl border px-3 py-2.5 disabled:bg-slate-100" value={item.doseNumber} onChange={(e) => updateEditItem(index, { doseNumber: Number(e.target.value || 1) })} />
                  <select disabled={isDoneStatus(item.status)} className="rounded-xl border px-3 py-2.5 disabled:bg-slate-100" value={item.priceCategory} onChange={(e) => updateEditItem(index, { priceCategory: e.target.value })}>
                    {priceCategoryOptions.map((category) => <option key={category} value={category}>{category}</option>)}
                  </select>
                  <input disabled={isDoneStatus(item.status)} type="number" className="rounded-xl border px-3 py-2.5 disabled:bg-slate-100" placeholder="Harga" value={item.price} onChange={(e) => updateEditItem(index, { price: e.target.value })} />
                  <input disabled={isDoneStatus(item.status)} className="rounded-xl border px-3 py-2.5 disabled:bg-slate-100" placeholder="Payment note / metode" value={item.paymentNote || item.paymentMethod} onChange={(e) => updateEditItem(index, { paymentNote: e.target.value })} />
                  <div className="flex items-center gap-2">
                    {isDoneStatus(item.status) ? <span className="rounded-xl bg-emerald-100 px-3 py-2 text-xs font-black text-emerald-700">Done</span> : <span className="rounded-xl bg-orange-100 px-3 py-2 text-xs font-black text-orange-700">Not Done</span>}
                    <button disabled={isDoneStatus(item.status)} type="button" onClick={() => removeEditItem(index)} className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700 disabled:opacity-40">Hapus</button>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto_auto]">
              <input className="rounded-xl border px-3 py-2.5" placeholder="Catatan perubahan untuk dokter, contoh: Tambahan vaksin pribadi QRIS" value={edit.changeNote} onChange={(e) => setEdit({ ...edit, changeNote: e.target.value })} />
              <button type="button" onClick={addEditItem} className="rounded-xl border bg-white px-4 py-2 text-sm font-bold hover:bg-slate-50">+ Tambah Produk</button>
              <button type="button" onClick={saveEditProducts} disabled={savingEdit} className="rounded-xl bg-orange-600 px-4 py-2 text-sm font-bold text-white hover:bg-orange-700 disabled:opacity-60">{savingEdit ? "Menyimpan..." : "Simpan Perubahan"}</button>
            </div>
          </section>
        ) : null}

        <section className="mt-6 overflow-hidden rounded-2xl border">
          <div className="flex flex-col gap-3 border-b bg-slate-50 p-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="font-bold">Registrasi Session Ini · {registrations.length} peserta</div>
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
                <tr>
                  <th className="p-3 text-left">{sortButton("Antrian", "queue")}</th>
                  <th className="p-3 text-left">{sortButton("Nama", "name")}</th>
                  <th className="p-3 text-left">{sortButton("NIK / ID", "identity")}</th>
                  <th className="p-3 text-left">{sortButton("Produk / Harga", "product")}</th>
                  <th className="p-3 text-left">{sortButton("Status", "status")}</th>
                  <th className="p-3 text-left">{sortButton("Note", "note")}</th>
                  <th className="p-3 text-left">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {visibleRegistrations.map((registration) => {
                  const info = statusInfo(registration.queue_status);
                  const items = Array.isArray(registration.items) ? registration.items : [];
                  return (
                    <tr key={registration.id}>
                      <td className="p-3 text-xl font-black">{registration.queue_number || <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-800">Belum rilis</span>}</td>
                      <td className="p-3 font-bold">{registration.participant_name}</td>
                      <td className="p-3">{registration.nik || registration.mcu_id || registration.employee_id || "-"}</td>
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
                          {!registration.queue_number ? <button onClick={() => releaseQueue(registration)} disabled={releasingId === registration.id} className="rounded-xl bg-red-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-60">{releasingId === registration.id ? "Proses..." : "Rilis Antrian"}</button> : null}
                          <button onClick={() => openEditProducts(registration)} className="rounded-xl border bg-white px-3 py-2 text-xs font-bold hover:bg-slate-50">Edit Produk</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!registrations.length ? <tr><td colSpan={7} className="p-5 text-center text-slate-500">Belum ada peserta untuk session ini.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
