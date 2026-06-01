"use client";

import { useEffect, useMemo, useState } from "react";

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

const allLocationsKey = "__all__";

export default function VaccinationSessionPage() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [sources, setSources] = useState<SourceItem[]>([]);
  const [vaccines, setVaccines] = useState<any[]>([]);
  const [lots, setLots] = useState<any[]>([]);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [loadingLocations, setLoadingLocations] = useState(false);

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
  });

  const [message, setMessage] = useState(
    "Pilih database vaksinasi, lalu generate session berdasarkan lokasi dan tanggal yang tersedia dari file import.",
  );
  const [error, setError] = useState("");

  const selectedSource = sources.find(
    (source) => String(source.id) === String(form.sourceId),
  );
  const selectedLocation = locations.find(
    (item) => item.key === form.locationKey,
  );

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

  const filteredLots = useMemo(() => {
    return lots.filter(
      (lot) =>
        !draft.vaccineId || String(lot.vaccine_id) === String(draft.vaccineId),
    );
  }, [lots, draft.vaccineId]);

  function vaccineName(vaccineId: string) {
    const vaccine = vaccines.find(
      (item) => String(item.id) === String(vaccineId),
    );
    if (!vaccine) return "Vaksin";
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
            "Belum ada metadata lokasi. Jalankan SQL v55 dan re-import data vaksinasi agar lokasi/tanggal/jam bisa dibuat otomatis.",
        );
      } else {
        setMessage(
          `Ditemukan ${json.locations.length} rincian lokasi/tanggal dari database. Pilih lokasi atau pilih Generate Semua Lokasi.`,
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
        "Rincian lokasi belum tersedia. Jalankan SQL v55 lalu re-import data vaksinasi.",
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

  useEffect(() => {
    setBatchMappings((prev) => {
      const byName = new Map(prev.map((item) => [item.sourceBatchName, item]));
      return availableBatchNames.map((name) =>
        byName.get(name) || {
          sourceBatchName: name,
          vaccineId: "",
          lotId: "",
          doseNumber: 1,
        },
      );
    });
  }, [availableBatchNames.join("|")]);

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
              Session sekarang bisa dibuat otomatis dari lokasi dan tanggal yang tersedia di database vaksinasi.
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
              <option value="">Pilih database corporate/vaksinasi</option>
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
              <option value="">Manual / pilih lokasi dari database</option>
              {locations.length ? (
                <option value={allLocationsKey}>
                  Generate semua lokasi dari database ({locations.length})
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
              className="rounded-xl border px-3 py-2.5"
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

          {form.sourceId && !loadingLocations && !locations.length ? (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-800">
              Belum ada rincian lokasi dari database ini. Untuk data seperti
              BINUS, jalankan SQL v55 lalu re-import Excel agar kolom
              TimeAreaName dan TimeName tersimpan.
            </div>
          ) : null}

          {selectedLocation ? (
            <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
              <div className="font-black">Lokasi dipilih</div>
              <div>
                {selectedLocation.locationName} · {selectedLocation.sessionDate || "Tanpa tanggal"}
              </div>
              <div>
                Estimasi peserta dari database:{" "}
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

          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_120px_auto]">
            <select
              className="rounded-xl border px-3 py-2.5"
              value={draft.vaccineId}
              onChange={(e) =>
                setDraft({ ...draft, vaccineId: e.target.value, lotId: "" })
              }
            >
              <option value="">Pilih vaksin</option>
              {vaccines.map((vaccine) => (
                <option key={vaccine.id} value={vaccine.id}>
                  {vaccine.name}
                  {vaccine.brand ? ` · ${vaccine.brand}` : ""}
                </option>
              ))}
            </select>

            <select
              className="rounded-xl border px-3 py-2.5"
              value={draft.lotId}
              onChange={(e) => setDraft({ ...draft, lotId: e.target.value })}
            >
              <option value="">Pilih lot number</option>
              {filteredLots.map((lot) => {
                const remaining =
                  Number(lot.stock_initial || 0) +
                  Number(lot.stock_added || 0) -
                  Number(lot.stock_used || 0);
                return (
                  <option key={lot.id} value={lot.id}>
                    {lot.vaccine?.name || "Vaksin"} · Lot {lot.lot_number} ·
                    stok {remaining} · exp {lot.expiry_date || "-"}
                  </option>
                );
              })}
            </select>

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
            <table className="min-w-full text-sm">
              <thead className="bg-slate-100 text-xs uppercase text-slate-600">
                <tr>
                  <th className="p-3 text-left">Vaksin</th>
                  <th className="p-3 text-left">Lot Number</th>
                  <th className="p-3 text-left">Dose</th>
                  <th className="p-3 text-left">Aksi</th>
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

                {!sessionVaccines.length ? (
                  <tr>
                    <td colSpan={4} className="p-5 text-center text-slate-500">
                      Belum ada vaksin di session ini.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>


          {availableBatchNames.length ? (
            <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <div className="font-black text-amber-900">3. Mapping Manual Vaksin dari Database</div>
              <p className="mt-1 text-sm text-amber-800">
                Sistem tidak auto-detect vaksin. Map setiap nilai BatchName dari Excel ke vaksin/lot yang sudah ditambahkan di session.
              </p>
              {!sessionVaccines.length ? (
                <div className="mt-3 rounded-xl bg-white p-3 text-sm font-bold text-red-700">
                  Tambahkan daftar vaksin & lot terlebih dahulu, baru pilih mapping.
                </div>
              ) : null}
              <div className="mt-3 overflow-hidden rounded-xl border bg-white">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-100 text-xs uppercase text-slate-600">
                    <tr>
                      <th className="p-3 text-left">BatchName di Database</th>
                      <th className="p-3 text-left">Map ke Vaksin / Lot Session</th>
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
              : "Simpan Session"}
          </button>
        </section>

        <section className="mt-6 overflow-hidden rounded-2xl border">
          <div className="border-b bg-slate-50 p-4 font-bold">
            Daftar Session
          </div>
          <table className="min-w-full text-sm">
            <thead className="bg-slate-100 text-xs uppercase text-slate-600">
              <tr>
                <th className="p-3 text-left">Session</th>
                <th className="p-3 text-left">Database</th>
                <th className="p-3 text-left">Lokasi</th>
                <th className="p-3 text-left">Vaksin Session</th>
                <th className="p-3 text-left">Tanggal</th>
                <th className="p-3 text-left">Peserta Rencana</th>
                <th className="p-3 text-left">Public</th>
                <th className="p-3 text-left">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {sessions.map((session) => (
                <tr key={session.id}>
                  <td className="p-3 font-bold">{session.session_name}</td>
                  <td className="p-3">
                    {session.source_name || session.source_id || "-"}
                  </td>
                  <td className="p-3">
                    <div className="font-semibold">
                      {session.location || "-"}
                    </div>
                    <div className="text-xs text-slate-500">Tanggal: {session.session_date || "-"}</div>
                  </td>
                  <td className="p-3">
                    {session.session_vaccines?.length ? (
                      <div className="space-y-1">
                        {session.session_vaccines.map((item: any) => (
                          <div
                            key={item.id}
                            className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700"
                          >
                            {item.vaccine?.name || "Vaksin"} · Lot{" "}
                            {item.lot?.lot_number || "-"}
                          </div>
                        ))}
                      </div>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="p-3">{session.session_date || "-"}</td>
                  <td className="p-3">
                    {session.participant_count_planned ?? "-"}
                  </td>
                  <td className="p-3">
                    <a
                      className="font-bold text-blue-600"
                      href={`/vaccination/public/queue/${session.public_queue_token}`}
                      target="_blank"
                    >
                      Public Queue
                    </a>
                  </td>
                  <td className="p-3">
                    <button
                      type="button"
                      onClick={() => deleteSession(session)}
                      className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700 hover:bg-red-100"
                      title="Hapus session"
                    >
                      🗑 Hapus
                    </button>
                  </td>
                </tr>
              ))}
              {!sessions.length ? (
                <tr>
                  <td colSpan={8} className="p-5 text-center text-slate-500">
                    Belum ada session.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>
      </div>
    </main>
  );
}
