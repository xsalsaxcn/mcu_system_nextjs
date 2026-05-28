"use client";

import { useEffect, useMemo, useState } from "react";

type SelectedVaccineItem = {
  vaccineId: string;
  lotId: string;
  doseNumber: number;
};

export default function VaccinationAdministerPage() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [registrations, setRegistrations] = useState<any[]>([]);
  const [vaccines, setVaccines] = useState<any[]>([]);
  const [lots, setLots] = useState<any[]>([]);
  const [sessionVaccines, setSessionVaccines] = useState<any[]>([]);
  const [selectedVaccines, setSelectedVaccines] = useState<SelectedVaccineItem[]>([]);
  const [message, setMessage] = useState("Pilih antrian. Daftar vaksin session otomatis menjadi daftar sticker.");
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    registrationId: "",
    administeredAt: "",
    notes: "",
  });

  async function loadSessions() {
    const json = await fetch("/api/vaccination/sessions", { cache: "no-store" }).then((r) => r.json());
    if (json.ok) {
      setSessions(json.sessions || []);
      if (!sessionId && json.sessions?.[0]?.id) setSessionId(String(json.sessions[0].id));
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

    const nextSelected = (json.sessionVaccines || []).map((item: any) => ({
      vaccineId: String(item.vaccine_id),
      lotId: String(item.lot_id),
      doseNumber: Number(item.dose_number || 1),
    }));

    setSelectedVaccines(nextSelected);
  }

  function vaccineName(vaccineId: string) {
    const vaccine = vaccines.find((item) => String(item.id) === String(vaccineId));
    if (!vaccine) return "Vaksin";
    return `${vaccine.name}${vaccine.brand ? ` · ${vaccine.brand}` : ""}`;
  }

  function lotOptions(vaccineId: string) {
    return lots.filter((lot) => String(lot.vaccine_id) === String(vaccineId));
  }

  function updateSelectedVaccine(index: number, patch: Partial<SelectedVaccineItem>) {
    setSelectedVaccines((prev) => prev.map((item, idx) => idx === index ? { ...item, ...patch } : item));
  }

  function removeSelectedVaccine(index: number) {
    setSelectedVaccines((prev) => prev.filter((_, idx) => idx !== index));
  }

  function addManualVaccine() {
    setSelectedVaccines((prev) => [...prev, { vaccineId: "", lotId: "", doseNumber: 1 }]);
  }

  async function donePrint() {
    setError("");

    if (!form.registrationId) {
      setError("Pilih peserta/antrian terlebih dahulu.");
      return;
    }

    const vaccinesPayload = selectedVaccines
      .map((item) => ({
        vaccineId: Number(item.vaccineId),
        lotId: Number(item.lotId),
        doseNumber: Number(item.doseNumber || 1),
      }))
      .filter((item) => item.vaccineId && item.lotId);

    if (!vaccinesPayload.length) {
      setError("Minimal satu vaksin dan lot number wajib dipilih.");
      return;
    }

    const res = await fetch("/api/vaccination/administer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        registrationId: form.registrationId,
        administeredAt: form.administeredAt,
        notes: form.notes,
        vaccines: vaccinesPayload,
      }),
    });

    const json = await res.json();

    if (!res.ok || !json.ok) {
      setError(json.message || "Done gagal.");
      return;
    }

    setMessage(json.message);
    setForm((f) => ({ ...f, registrationId: "", notes: "" }));
    loadData();
    window.open(json.stickerUrl, "_blank", "width=520,height=720");
  }

  useEffect(() => {
    loadSessions();
  }, []);

  useEffect(() => {
    loadData(sessionId);
  }, [sessionId]);

  const selectedRegistration = registrations.find((r) => String(r.id) === String(form.registrationId));

  return (
    <main className="p-6">
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Administered / Medis</h1>
            <p className="mt-2 text-sm text-slate-600">
              Jika session memiliki 2 vaksin, Done akan membuat 2 record dan membuka 2 sticker label.
            </p>
          </div>
          <a href="/vaccination" className="rounded-xl border px-4 py-2 text-sm font-bold hover:bg-slate-50">☰ Menu Vaksinasi</a>
        </div>

        {error ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{error}</div> : null}
        {message ? <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800">{message}</div> : null}

        <section className="mt-6 rounded-2xl border bg-slate-50 p-5">
          <h2 className="font-bold">1. Pilih Peserta</h2>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <select className="rounded-xl border px-3 py-2.5" value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
              <option value="">Pilih session</option>
              {sessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {session.session_name} · {session.company_name || "-"}
                </option>
              ))}
            </select>

            <select className="rounded-xl border px-3 py-2.5" value={form.registrationId} onChange={(e) => setForm({ ...form, registrationId: e.target.value })}>
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
          </div>

          {selectedRegistration ? (
            <div className="mt-4 rounded-xl border bg-white p-4 text-sm">
              <b>{selectedRegistration.queue_number}</b> · {selectedRegistration.participant_name} · {selectedRegistration.company_name || "-"} · {selectedRegistration.department || "-"}
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
              <div key={index} className="grid gap-3 rounded-2xl border bg-white p-3 md:grid-cols-[1fr_1fr_100px_auto]">
                <select
                  className="rounded-xl border px-3 py-2.5"
                  value={item.vaccineId}
                  onChange={(e) => updateSelectedVaccine(index, { vaccineId: e.target.value, lotId: "" })}
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
                  value={item.lotId}
                  onChange={(e) => updateSelectedVaccine(index, { lotId: e.target.value })}
                >
                  <option value="">Pilih lot</option>
                  {lotOptions(item.vaccineId).map((lot) => {
                    const stock = Number(lot.stock_initial || 0) - Number(lot.stock_used || 0);
                    return (
                      <option key={lot.id} value={lot.id}>
                        Lot {lot.lot_number} · stok {stock} · exp {lot.expiry_date || "-"}
                      </option>
                    );
                  })}
                </select>

                <input
                  type="number"
                  min={1}
                  className="rounded-xl border px-3 py-2.5"
                  value={item.doseNumber}
                  onChange={(e) => updateSelectedVaccine(index, { doseNumber: Number(e.target.value || 1) })}
                />

                <button
                  type="button"
                  onClick={() => removeSelectedVaccine(index)}
                  className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-bold text-red-700"
                >
                  Hapus
                </button>
              </div>
            ))}

            {!selectedVaccines.length ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">
                Belum ada vaksin di session ini. Tambahkan di Session Vaksinasi atau klik Tambah Vaksin Manual.
              </div>
            ) : null}
          </div>

          <textarea className="mt-3 w-full rounded-xl border px-3 py-2.5" placeholder="Catatan opsional" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />

          <button onClick={donePrint} className="mt-4 w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-700">
            Done + Print Semua Sticker
          </button>
        </section>
      </div>
    </main>
  );
}
