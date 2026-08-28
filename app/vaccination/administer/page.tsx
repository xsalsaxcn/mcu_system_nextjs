"use client";

import { useEffect, useMemo, useState } from "react";

type SelectedVaccineItem = {
  itemId?: string;
  vaccineId: string;
  lotId: string;
  doseNumber: number;
  status?: string;
  itemNote?: string;
};

function fmtDate(value: any) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" });
}

function isDoneStatus(status: any) {
  return ["ADMINISTERED", "DONE"].includes(String(status || "").toUpperCase());
}

function itemStatusLabel(status: any) {
  return isDoneStatus(status) ? "Done" : "Not Done";
}

function sessionLabel(session: any) {
  const eventName = session?.source_name || String(session?.session_name || "").split(" - ")[0] || "Session";
  return [eventName, session?.location, session?.session_date]
    .filter(Boolean)
    .join(" · ");
}

function vaccineLabel(vaccine: any) {
  if (!vaccine) return "Vaksin";
  return `${vaccine.name || "Vaksin"}${vaccine.brand ? ` · ${vaccine.brand}` : ""}`;
}

export default function VaccinationAdministerPage() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [registrations, setRegistrations] = useState<any[]>([]);
  const [vaccines, setVaccines] = useState<any[]>([]);
  const [lots, setLots] = useState<any[]>([]);
  const [sessionVaccines, setSessionVaccines] = useState<any[]>([]);
  const [selectedVaccines, setSelectedVaccines] = useState<SelectedVaccineItem[]>([]);
  const [completedRecords, setCompletedRecords] = useState<any[]>([]);
  const [doctorNames, setDoctorNames] = useState<string[]>([]);
  const [doctorFilter, setDoctorFilter] = useState("all");
  const [searchDone, setSearchDone] = useState("");
  const [message, setMessage] = useState("Pilih antrian. Daftar vaksin session otomatis menjadi daftar sticker.");
  const [error, setError] = useState("");
  const [processingIndex, setProcessingIndex] = useState<number | "all" | null>(null);
  const [printLabelHandler, setPrintLabelHandler] = useState<"MEDIS" | "VALIDASI">("MEDIS");

  const [form, setForm] = useState({
    registrationId: "",
    administeredAt: "",
    administeredByName: "",
    notes: "",
  });

  const selectedSession = sessions.find((session) => String(session.id) === String(sessionId));

  const availableVaccines = useMemo(() => {
    if (!sessionVaccines.length) return vaccines;
    const byId = new Map<string, any>();
    for (const item of sessionVaccines) {
      const vaccine = item?.vaccine || vaccines.find((v) => String(v.id) === String(item.vaccine_id));
      if (vaccine?.id) byId.set(String(vaccine.id), vaccine);
    }
    return Array.from(byId.values());
  }, [sessionVaccines, vaccines]);

  async function loadSessions() {
    const json = await fetch("/api/vaccination/sessions", { cache: "no-store" }).then((r) => r.json());
    if (json.ok) {
      setSessions(json.sessions || []);
      if (!sessionId && json.sessions?.[0]?.id) setSessionId(String(json.sessions[0].id));
    }
  }

  async function loadPrintSetting(id = sessionId) {
    if (!id) {
      setPrintLabelHandler("MEDIS");
      return;
    }
    try {
      const json = await fetch(`/api/vaccination/session-print-setting?session_id=${encodeURIComponent(id)}`, { cache: "no-store" }).then((r) => r.json());
      const mode = String(json?.print_label_handler || "MEDIS").toUpperCase() === "VALIDASI" ? "VALIDASI" : "MEDIS";
      setPrintLabelHandler(mode);
    } catch {
      setPrintLabelHandler("MEDIS");
    }
  }

  async function loadData(id = sessionId) {
    const url = id ? `/api/vaccination/administer?session_id=${id}` : "/api/vaccination/administer";
    const json = await fetch(url, { cache: "no-store" }).then((r) => r.json());
    if (!json.ok) {
      setError(json.message || "Gagal mengambil data.");
      return;
    }

    setRegistrations(json.registrations || []);
    setVaccines(json.vaccines || []);
    setLots(json.lots || []);
    setSessionVaccines(json.sessionVaccines || []);
    setCompletedRecords(json.completedRecords || []);
    setDoctorNames(json.doctorNames || []);

    const nextSelected = (json.sessionVaccines || []).map((item: any) => ({
      vaccineId: String(item.vaccine_id),
      lotId: String(item.lot_id),
      doseNumber: Number(item.dose_number || 1),
      status: "WAITING",
    }));

    setSelectedVaccines(nextSelected);
  }

  function lotOptions(vaccineId: string) {
    const sessionLots = sessionVaccines
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

  function updateSelectedVaccine(index: number, patch: Partial<SelectedVaccineItem>) {
    setSelectedVaccines((prev) => prev.map((item, idx) => {
      if (idx !== index) return item;
      if (isDoneStatus(item.status)) return item;
      return { ...item, ...patch };
    }));
  }

  function removeSelectedVaccine(index: number) {
    setSelectedVaccines((prev) => prev.filter((item, idx) => idx !== index || isDoneStatus(item.status)));
  }

  function addManualVaccine() {
    setSelectedVaccines((prev) => [...prev, { vaccineId: "", lotId: "", doseNumber: 1, status: "WAITING" }]);
  }

  async function donePrint(targetIndex?: number) {
    setError("");
    setProcessingIndex(typeof targetIndex === "number" ? targetIndex : "all");

    try {
      if (!form.registrationId) {
        setError("Pilih peserta/antrian terlebih dahulu.");
        return;
      }

      const isValidationPrint = printLabelHandler === "VALIDASI";
      const sourceVaccines: SelectedVaccineItem[] = typeof targetIndex === "number"
        ? (selectedVaccines[targetIndex] ? [selectedVaccines[targetIndex]] : [])
        : selectedVaccines.filter((item) => !isDoneStatus(item.status));

      const vaccinesPayload = sourceVaccines
        .map((item) => ({
          itemId: item.itemId ? Number(item.itemId) : undefined,
          vaccineId: Number(item.vaccineId),
          lotId: Number(item.lotId),
          doseNumber: Number(item.doseNumber || 1),
        }))
        .filter((item) => item.itemId || (item.vaccineId && item.lotId));

      if (!vaccinesPayload.length) {
        setError("Minimal satu vaksin dan lot number wajib dipilih.");
        return;
      }

      let printWindow: Window | null = null;
      if (!isValidationPrint) {
        printWindow = window.open("about:blank", "_blank", "width=520,height=720");
        if (printWindow) {
          printWindow.document.write("<p style='font-family:Arial;padding:16px'>Menyiapkan sticker...</p>");
        }
      }

      const res = await fetch("/api/vaccination/administer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          registrationId: form.registrationId,
          administeredAt: form.administeredAt,
          administeredByName: form.administeredByName,
          notes: form.notes,
          printLabelHandler,
          vaccines: vaccinesPayload,
        }),
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        if (printWindow) printWindow.close();
        setError(json.message || "Done gagal.");
        return;
      }

      setMessage(json.message);
      setForm((f) => ({ ...f, notes: "" }));
      await loadData();
      if (!isValidationPrint && json.stickerUrl) {
        if (printWindow) printWindow.location.href = json.stickerUrl;
        else window.open(json.stickerUrl, "_blank", "width=520,height=720");
      } else if (printWindow) {
        printWindow.close();
      }
    } finally {
      setProcessingIndex(null);
    }
  }

  useEffect(() => {
    loadSessions();
  }, []);

  useEffect(() => {
    loadData(sessionId);
    loadPrintSetting(sessionId);
  }, [sessionId]);

  const selectedRegistration = registrations.find((r) => String(r.id) === String(form.registrationId));

  useEffect(() => {
    if (!selectedRegistration) return;
    const itemRows = Array.isArray(selectedRegistration.items) ? selectedRegistration.items : [];
    if (itemRows.length) {
      setSelectedVaccines(itemRows.map((item: any) => ({
        itemId: item.id ? String(item.id) : undefined,
        vaccineId: item.vaccine_id ? String(item.vaccine_id) : "",
        lotId: item.lot_id ? String(item.lot_id) : "",
        doseNumber: Number(item.dose_number || 1),
        status: item.status || "WAITING",
        itemNote: item.item_note || item.payment_note || "",
      })));
    } else if (sessionVaccines.length) {
      setSelectedVaccines(sessionVaccines.map((item: any) => ({
        vaccineId: String(item.vaccine_id),
        lotId: String(item.lot_id),
        doseNumber: Number(item.dose_number || 1),
        status: "WAITING",
      })));
    }
    if (selectedRegistration.status_note && !form.notes) {
      setForm((current) => ({ ...current, notes: selectedRegistration.status_note || current.notes }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRegistration?.id, selectedRegistration?.updated_at]);

  const groupedCompleted = useMemo(() => {
    const keyword = searchDone.trim().toLowerCase();

    const filtered = completedRecords.filter((record) => {
      const doctorOk = doctorFilter === "all" || String(record.administered_by || "") === doctorFilter;

      const haystack = [
        record.participant_name,
        record.vaccine_name,
        record.lot_number,
        record.registration?.queue_number,
        record.registration?.mcu_id,
        record.administered_by,
      ].filter(Boolean).join(" ").toLowerCase();

      return doctorOk && (!keyword || haystack.includes(keyword));
    });

    const map = new Map<string, any>();
    for (const record of filtered) {
      const key = `${record.registration_id || record.participant_name}-${record.administered_at}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          participant_name: record.participant_name,
          queue_number: record.registration?.queue_number || "-",
          mcu_id: record.registration?.mcu_id || record.registration?.employee_id || "-",
          administered_by: record.administered_by || "-",
          administered_at: record.administered_at,
          vaccines: [],
        });
      }
      map.get(key).vaccines.push(record);
    }

    return Array.from(map.values());
  }, [completedRecords, doctorFilter, searchDone]);

  return (
    <main className="p-6">
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Administered / Medis</h1>
            <p className="mt-2 text-sm text-slate-600">
              Administered hanya menandai produk selesai. Jika print label diset Tim Validasi, printout dan status selesai final dilakukan di Tim Validasi.
            </p>
          </div>
          <a href="/vaccination" className="rounded-xl border px-4 py-2 text-sm font-bold hover:bg-slate-50">☰ Menu Vaksinasi</a>
        </div>

        {error ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{error}</div> : null}
        {message ? <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800">{message}</div> : null}
        {printLabelHandler === "VALIDASI" ? (
          <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm font-bold text-blue-800">
            Mode session: print label oleh Tim Validasi. Tombol Done di halaman ini tidak akan membuka printout; peserta masuk ke Tim Validasi setelah semua produk selesai.
          </div>
        ) : null}

        <section id="vaccination-administer-participant-section" className="mt-6 rounded-2xl border bg-slate-50 p-5">
          <h2 className="font-bold">1. Pilih Peserta</h2>

          <div id="vaccination-administer-top-controls" className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <select id="vaccination-administer-session" data-vaccination-role="session" className="rounded-xl border px-3 py-2.5" value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
              <option value="">Pilih session</option>
              {sessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {sessionLabel(session)}
                </option>
              ))}
            </select>

            <select id="vaccination-administer-participant" data-vaccination-role="participant" className="rounded-xl border px-3 py-2.5" value={form.registrationId} onChange={(e) => setForm({ ...form, registrationId: e.target.value })}>
              <option value="">Pilih peserta / nomor antrian</option>
              {registrations.map((registration) => (
                <option key={registration.id} value={registration.id}>
                  {registration.queue_number} · {registration.participant_name} · {registration.queue_status}
                </option>
              ))}
            </select>

            <input
              type="datetime-local"
              className="rounded-xl border px-3 py-2.5"
              value={form.administeredAt}
              onChange={(e) => setForm({ ...form, administeredAt: e.target.value })}
            />

            <input
              id="vaccination-administer-doctor-input"
              data-vaccination-role="doctor"
              className="rounded-xl border px-3 py-2.5"
              placeholder="Nama dokter / petugas"
              value={form.administeredByName}
              onChange={(e) => setForm({ ...form, administeredByName: e.target.value })}
            />
          </div>

          {selectedRegistration ? (
            <div className="mt-4 rounded-xl border bg-white p-4 text-sm">
              <div><b>{selectedRegistration.queue_number}</b> · {selectedRegistration.participant_name} · {selectedRegistration.company_name || "-"} · {selectedRegistration.department || "-"}</div>
              {selectedRegistration.status_note ? <div className="mt-2 rounded-lg bg-orange-50 px-3 py-2 text-xs font-bold text-orange-700">Note registrasi: {selectedRegistration.status_note}</div> : null}
              {Array.isArray(selectedRegistration.items) && selectedRegistration.items.length ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {selectedRegistration.items.map((item: any) => (
                    <span key={item.id} className={`rounded-full px-3 py-1 text-xs font-black ${isDoneStatus(item.status) ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-blue-700"}`}>
                      {item.vaccine?.name || "Produk"} · Lot {item.lot?.lot_number || "-"} · {itemStatusLabel(item.status)}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </section>

        <section className="mt-6 rounded-2xl border bg-slate-50 p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="font-bold">2. Vaksin yang Diberikan</h2>
              <p className="mt-1 text-sm text-slate-500">
                Setiap baris akan menjadi 1 record dan 1 sticker.
              </p>
            </div>

            <button
              type="button"
              onClick={addManualVaccine}
              className="rounded-xl border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-bold text-blue-700"
            >
              + Tambah Vaksin Manual
            </button>
          </div>

          <div className="mt-4 space-y-3">
            {selectedVaccines.map((item, index) => (
              <div key={index} className={`grid gap-3 rounded-2xl border bg-white p-3 md:grid-cols-[1fr_1fr_100px_220px] ${isDoneStatus(item.status) ? "opacity-80" : ""}`}>
                <select
                  disabled={isDoneStatus(item.status)}
                  className="rounded-xl border px-3 py-2.5 disabled:bg-slate-100"
                  value={item.vaccineId}
                  onChange={(e) => updateSelectedVaccine(index, { vaccineId: e.target.value, lotId: "" })}
                >
                  <option value="">Pilih vaksin</option>
                  {availableVaccines.map((vaccine) => (
                    <option key={vaccine.id} value={vaccine.id}>
                      {vaccineLabel(vaccine)}
                    </option>
                  ))}
                </select>

                <select
                  disabled={isDoneStatus(item.status)}
                  className="rounded-xl border px-3 py-2.5 disabled:bg-slate-100"
                  value={item.lotId}
                  onChange={(e) => updateSelectedVaccine(index, { lotId: e.target.value })}
                >
                  <option value="">Pilih lot</option>
                  {lotOptions(item.vaccineId).map((lot) => {
                    const stock = Number(lot.stock_initial || 0) + Number(lot.stock_added || 0) - Number(lot.stock_used || 0);
                    return (
                      <option key={lot.id} value={lot.id}>
                        Lot {lot.lot_number} · stok {stock} · exp {lot.expiry_date || "-"}
                      </option>
                    );
                  })}
                </select>

                <input
                  disabled={isDoneStatus(item.status)}
                  type="number"
                  min={1}
                  className="rounded-xl border px-3 py-2.5 disabled:bg-slate-100"
                  value={item.doseNumber}
                  onChange={(e) => updateSelectedVaccine(index, { doseNumber: Number(e.target.value || 1) })}
                />

                <div className="flex flex-wrap items-center gap-2">
                  {isDoneStatus(item.status) ? (
                    <button type="button" disabled className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-500">Done</button>
                  ) : (
                    <button
                      type="button"
                      disabled={processingIndex !== null}
                      onClick={() => donePrint(index)}
                      className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-black text-white hover:bg-blue-700 disabled:opacity-60"
                    >
                      {processingIndex === index ? "Proses..." : "Done Produk"}
                    </button>
                  )}
                  <button
                    disabled={isDoneStatus(item.status)}
                    type="button"
                    onClick={() => removeSelectedVaccine(index)}
                    className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-bold text-red-700 disabled:opacity-40"
                  >
                    Hapus
                  </button>
                  {!isDoneStatus(item.status) ? <span className="rounded-xl bg-blue-50 px-3 py-2 text-xs font-black text-blue-700">Not Done</span> : null}
                </div>
              </div>
            ))}

            {!selectedVaccines.length ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">
                Belum ada vaksin di session ini. Tambahkan di Session Vaksinasi atau klik Tambah Vaksin Manual.
              </div>
            ) : null}
          </div>

          <textarea className="mt-3 w-full rounded-xl border px-3 py-2.5" placeholder="Catatan opsional" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />

          <button disabled={processingIndex !== null} onClick={() => donePrint()} className="mt-4 w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60">
            {processingIndex === "all" ? "Memproses..." : printLabelHandler === "VALIDASI" ? "Done Semua Produk - Kirim ke Tim Validasi" : "Done + Print Semua Vaksin Not Done"}
          </button>
        </section>

        <section className="mt-6 rounded-2xl border bg-white">
          <div className="border-b bg-slate-50 p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-lg font-bold">Peserta Sudah Selesai</h2>
                <p className="text-sm text-slate-500">Filter berdasarkan nama dokter/petugas dan cari nama peserta.</p>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <select className="rounded-xl border px-3 py-2.5" value={doctorFilter} onChange={(e) => setDoctorFilter(e.target.value)}>
                  <option value="all">Semua dokter/petugas</option>
                  {doctorNames.map((doctor) => (
                    <option key={doctor} value={doctor}>{doctor}</option>
                  ))}
                </select>

                <input
                  className="rounded-xl border px-3 py-2.5"
                  placeholder="Cari nama / no antrian / vaksin..."
                  value={searchDone}
                  onChange={(e) => setSearchDone(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="max-h-[560px] overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-slate-100 text-xs uppercase text-slate-600">
                <tr>
                  <th className="p-3 text-left">Antrian</th>
                  <th className="p-3 text-left">Nama</th>
                  <th className="p-3 text-left">MCU ID</th>
                  <th className="p-3 text-left">Dokter/Petugas</th>
                  <th className="p-3 text-left">Waktu</th>
                  <th className="p-3 text-left">Vaksin</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {groupedCompleted.map((row) => (
                  <tr key={row.key}>
                    <td className="p-3 text-lg font-black">{row.queue_number}</td>
                    <td className="p-3 font-bold">{row.participant_name}</td>
                    <td className="p-3">{row.mcu_id}</td>
                    <td className="p-3">{row.administered_by}</td>
                    <td className="p-3">{fmtDate(row.administered_at)}</td>
                    <td className="p-3">
                      <div className="space-y-1">
                        {row.vaccines.map((record: any) => (
                          <div key={record.id} className="rounded-lg bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700">
                            {record.vaccine_name} · Lot {record.lot_number}
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}

                {!groupedCompleted.length ? (
                  <tr>
                    <td colSpan={6} className="p-5 text-center text-slate-500">Belum ada data selesai untuk filter ini.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
