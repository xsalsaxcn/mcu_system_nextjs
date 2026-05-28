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

const emptyDraft: SessionVaccineDraft = {
  vaccineId: "",
  lotId: "",
  doseNumber: 1,
};

export default function VaccinationSessionPage() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [sources, setSources] = useState<SourceItem[]>([]);
  const [vaccines, setVaccines] = useState<any[]>([]);
  const [lots, setLots] = useState<any[]>([]);

  const [draft, setDraft] = useState<SessionVaccineDraft>(emptyDraft);
  const [sessionVaccines, setSessionVaccines] = useState<SessionVaccineDraft[]>([]);

  const [form, setForm] = useState({
    sessionName: "",
    sourceId: "",
    companyName: "",
    location: "",
    sessionDate: "",
  });

  const [message, setMessage] = useState("Buat session vaksinasi perusahaan dan link ke database corporate.");
  const [error, setError] = useState("");

  const selectedSource = sources.find((source) => String(source.id) === String(form.sourceId));

  const filteredLots = useMemo(() => {
    return lots.filter((lot) => !draft.vaccineId || String(lot.vaccine_id) === String(draft.vaccineId));
  }, [lots, draft.vaccineId]);

  function vaccineName(vaccineId: string) {
    const vaccine = vaccines.find((item) => String(item.id) === String(vaccineId));
    if (!vaccine) return "Vaksin";
    return `${vaccine.name}${vaccine.brand ? ` · ${vaccine.brand}` : ""}`;
  }

  function lotName(lotId: string) {
    const lot = lots.find((item) => String(item.id) === String(lotId));
    if (!lot) return "Lot";
    return `Lot ${lot.lot_number} · exp ${lot.expiry_date || "-"}`;
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
        Number(item.doseNumber) === Number(draft.doseNumber)
    );

    if (duplicate) {
      setError("Kombinasi vaksin dan lot ini sudah ada di session.");
      return;
    }

    setSessionVaccines((prev) => [...prev, draft]);
    setDraft(emptyDraft);
  }

  function removeSessionVaccine(index: number) {
    setSessionVaccines((prev) => prev.filter((_, idx) => idx !== index));
  }

  async function loadSources() {
    const res = await fetch("/api/sources?program=corporate", { cache: "no-store" });
    const json = await res.json();
    if (json.ok) setSources(json.sources || []);
  }

  async function loadMaster() {
    const json = await fetch("/api/vaccination/master", { cache: "no-store" }).then((r) => r.json());
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

  async function submit() {
    setError("");

    const source = sources.find((item) => String(item.id) === String(form.sourceId));
    const companyName = form.companyName || source?.institution_name || source?.name || "";

    const res = await fetch("/api/vaccination/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        companyName,
        sourceName: source ? `${source.name}${source.institution_name ? ` · ${source.institution_name}` : ""}` : "",
        sessionVaccines,
      }),
    });

    const json = await res.json();
    if (!res.ok || !json.ok) {
      setError(json.message || "Gagal membuat session.");
      return;
    }

    setMessage(json.message);
    setForm({
      sessionName: "",
      sourceId: "",
      companyName: "",
      location: "",
      sessionDate: "",
    });
    setSessionVaccines([]);
    setDraft(emptyDraft);
    loadSessions();
  }

  useEffect(() => {
    loadSources();
    loadMaster();
    loadSessions();
  }, []);

  useEffect(() => {
    if (selectedSource && !form.companyName) {
      setForm((prev) => ({
        ...prev,
        companyName: selectedSource.institution_name || selectedSource.name || "",
      }));
    }
  }, [form.sourceId]);

  return (
    <main className="p-6">
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Session Vaksinasi</h1>
            <p className="mt-2 text-sm text-slate-600">
              Satu perusahaan/session bisa memiliki lebih dari satu vaksin dan lebih dari satu lot number.
            </p>
          </div>
          <a href="/vaccination" className="rounded-xl border px-4 py-2 text-sm font-bold hover:bg-slate-50">☰ Menu Vaksinasi</a>
        </div>

        {error ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{error}</div> : null}
        {message ? <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800">{message}</div> : null}

        <section className="mt-6 rounded-2xl border bg-slate-50 p-5">
          <h2 className="font-bold">1. Informasi Session</h2>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <input
              className="rounded-xl border px-3 py-2.5"
              placeholder="Nama session, contoh: HealthDay PT ABC"
              value={form.sessionName}
              onChange={(e) => setForm({ ...form, sessionName: e.target.value })}
            />

            <select
              className="rounded-xl border px-3 py-2.5"
              value={form.sourceId}
              onChange={(e) => setForm({ ...form, sourceId: e.target.value })}
            >
              <option value="">Pilih database corporate</option>
              {sources.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.name}
                  {source.institution_name ? ` · ${source.institution_name}` : ""}
                </option>
              ))}
            </select>

            <input
              className="rounded-xl border px-3 py-2.5"
              placeholder="Nama perusahaan"
              value={form.companyName}
              onChange={(e) => setForm({ ...form, companyName: e.target.value })}
            />

            <input
              className="rounded-xl border px-3 py-2.5"
              placeholder="Lokasi"
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
            />

            <input
              type="date"
              className="rounded-xl border px-3 py-2.5"
              value={form.sessionDate}
              onChange={(e) => setForm({ ...form, sessionDate: e.target.value })}
            />
          </div>
        </section>

        <section className="mt-6 rounded-2xl border bg-slate-50 p-5">
          <h2 className="font-bold">2. Daftar Vaksin & Lot untuk Session Ini</h2>
          <p className="mt-1 text-sm text-slate-500">
            Tambahkan semua vaksin yang akan diberikan. Jika ada 2 vaksin, nanti sistem membuat 2 record dan 2 sticker.
          </p>

          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_120px_auto]">
            <select
              className="rounded-xl border px-3 py-2.5"
              value={draft.vaccineId}
              onChange={(e) => setDraft({ ...draft, vaccineId: e.target.value, lotId: "" })}
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
                const remaining = Number(lot.stock_initial || 0) - Number(lot.stock_used || 0);
                return (
                  <option key={lot.id} value={lot.id}>
                    {lot.vaccine?.name || "Vaksin"} · Lot {lot.lot_number} · stok {remaining} · exp {lot.expiry_date || "-"}
                  </option>
                );
              })}
            </select>

            <input
              type="number"
              min={1}
              className="rounded-xl border px-3 py-2.5"
              value={draft.doseNumber}
              onChange={(e) => setDraft({ ...draft, doseNumber: Number(e.target.value || 1) })}
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
                  <tr key={`${item.vaccineId}-${item.lotId}-${item.doseNumber}`}>
                    <td className="p-3 font-bold">{vaccineName(item.vaccineId)}</td>
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

          <button onClick={submit} className="mt-4 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-700">
            Simpan Session
          </button>
        </section>

        <section className="mt-6 overflow-hidden rounded-2xl border">
          <div className="border-b bg-slate-50 p-4 font-bold">Daftar Session</div>
          <table className="min-w-full text-sm">
            <thead className="bg-slate-100 text-xs uppercase text-slate-600">
              <tr>
                <th className="p-3 text-left">Session</th>
                <th className="p-3 text-left">Database</th>
                <th className="p-3 text-left">Vaksin Session</th>
                <th className="p-3 text-left">Tanggal</th>
                <th className="p-3 text-left">Public</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {sessions.map((session) => (
                <tr key={session.id}>
                  <td className="p-3 font-bold">{session.session_name}</td>
                  <td className="p-3">{session.source_name || session.source_id || "-"}</td>
                  <td className="p-3">
                    {session.session_vaccines?.length ? (
                      <div className="space-y-1">
                        {session.session_vaccines.map((item: any) => (
                          <div key={item.id} className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">
                            {item.vaccine?.name || "Vaksin"} · Lot {item.lot?.lot_number || "-"}
                          </div>
                        ))}
                      </div>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="p-3">{session.session_date || "-"}</td>
                  <td className="p-3">
                    <a className="font-bold text-blue-600" href={`/vaccination/public/queue/${session.public_queue_token}`} target="_blank">
                      Public Queue
                    </a>
                  </td>
                </tr>
              ))}
              {!sessions.length ? (
                <tr>
                  <td colSpan={5} className="p-5 text-center text-slate-500">Belum ada session.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>
      </div>
    </main>
  );
}
