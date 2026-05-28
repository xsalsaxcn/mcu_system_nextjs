"use client";

import { useEffect, useMemo, useState } from "react";

export default function VaccinationRegisterPage() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [sources, setSources] = useState<any[]>([]);
  const [vaccines, setVaccines] = useState<any[]>([]);
  const [registrations, setRegistrations] = useState<any[]>([]);

  const [message, setMessage] = useState("Import peserta corporate lebih dulu. Nomor antrian dirilis saat peserta datang registrasi ulang.");
  const [error, setError] = useState("");
  const [importing, setImporting] = useState(false);
  const [releasingId, setReleasingId] = useState<number | null>(null);

  const [form, setForm] = useState({
    sessionId: "",
    sourceId: "",
    vaccineId: "",
    participantName: "",
    employeeId: "",
    nik: "",
    email: "",
    phone: "",
    companyName: "",
    department: "",
  });

  const selectedSession = sessions.find((session) => String(session.id) === String(form.sessionId));

  const selectedSourceId = useMemo(() => {
    return form.sourceId || selectedSession?.source_id || "";
  }, [form.sourceId, selectedSession?.source_id]);

  async function loadBase() {
    const [sessionJson, sourceJson, masterJson] = await Promise.all([
      fetch("/api/vaccination/sessions", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/sources?program=corporate", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/vaccination/master", { cache: "no-store" }).then((r) => r.json()),
    ]);

    if (sessionJson.ok) {
      setSessions(sessionJson.sessions || []);
      if (!form.sessionId && sessionJson.sessions?.[0]?.id) {
        const first = sessionJson.sessions[0];
        setForm((prev) => ({
          ...prev,
          sessionId: String(first.id),
          sourceId: first.source_id ? String(first.source_id) : "",
          vaccineId: first.default_vaccine_id ? String(first.default_vaccine_id) : "",
          companyName: first.company_name || "",
        }));
      }
    }

    if (sourceJson.ok) setSources(sourceJson.sources || []);
    if (masterJson.ok) setVaccines((masterJson.vaccines || []).filter((v: any) => v.active !== false));
  }

  async function loadRegistrations(sessionId = form.sessionId, sourceId = selectedSourceId) {
    if (!sessionId) return;

    const params = new URLSearchParams();
    params.set("session_id", sessionId);
    if (sourceId) params.set("source_id", String(sourceId));

    const res = await fetch(`/api/vaccination/register?${params.toString()}`, { cache: "no-store" });
    const json = await res.json();
    if (json.ok) setRegistrations(json.registrations || []);
  }

  async function importCorporate() {
    if (!form.sessionId) {
      setError("Pilih session terlebih dahulu.");
      return;
    }

    const sourceId = selectedSourceId;
    if (!sourceId) {
      setError("Session belum terhubung ke database corporate. Pilih database corporate dulu.");
      return;
    }

    setImporting(true);
    setError("");
    setMessage("Mengimport peserta dari database corporate...");

    try {
      const res = await fetch("/api/vaccination/import-corporate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          sessionId: Number(form.sessionId),
          sourceId: Number(sourceId),
        }),
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        setError(json.message || "Import corporate gagal.");
        setMessage("Import corporate gagal.");
        return;
      }

      setMessage(json.message || "Import corporate berhasil. Nomor antrian belum dirilis.");
      await loadRegistrations(form.sessionId, String(sourceId));
    } catch (err: any) {
      setError(err?.message || "Import corporate gagal.");
      setMessage("Import corporate gagal.");
    } finally {
      setImporting(false);
    }
  }

  async function releaseQueue(registration: any) {
    setReleasingId(registration.id);
    setError("");
    setMessage(`Merilis nomor antrian untuk ${registration.participant_name}...`);

    try {
      const res = await fetch("/api/vaccination/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          action: "release-queue",
          registrationId: registration.id,
        }),
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        setError(json.message || "Gagal merilis nomor antrian.");
        setMessage("Rilis nomor antrian gagal.");
        return;
      }

      setMessage(json.message || "Nomor antrian berhasil dirilis.");
      await loadRegistrations(form.sessionId, selectedSourceId);
    } catch (err: any) {
      setError(err?.message || "Gagal merilis nomor antrian.");
      setMessage("Rilis nomor antrian gagal.");
    } finally {
      setReleasingId(null);
    }
  }

  async function submit() {
    setError("");

    const res = await fetch("/api/vaccination/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        sourceId: selectedSourceId,
      }),
    });

    const json = await res.json();

    if (!res.ok || !json.ok) {
      setError(json.message || "Registrasi ulang gagal.");
      return;
    }

    setMessage(json.message);
    setForm((prev) => ({
      ...prev,
      participantName: "",
      employeeId: "",
      nik: "",
      email: "",
      phone: "",
      department: "",
    }));

    loadRegistrations(form.sessionId, selectedSourceId);
  }

  useEffect(() => {
    loadBase();
  }, []);

  useEffect(() => {
    if (!selectedSession) return;

    setForm((prev) => ({
      ...prev,
      sourceId: selectedSession.source_id ? String(selectedSession.source_id) : prev.sourceId,
      vaccineId: selectedSession.default_vaccine_id ? String(selectedSession.default_vaccine_id) : prev.vaccineId,
      companyName: selectedSession.company_name || prev.companyName,
    }));
  }, [selectedSession?.id]);

  useEffect(() => {
    loadRegistrations(form.sessionId, selectedSourceId);
  }, [form.sessionId, selectedSourceId]);

  return (
    <main className="p-6">
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Registrasi Vaksin</h1>
            <p className="mt-2 text-sm text-slate-600">
              Import peserta corporate tidak membuat nomor antrian. Nomor antrian dirilis berdasarkan kedatangan di registrasi ulang.
            </p>
          </div>
          <a href="/vaccination" className="rounded-xl border px-4 py-2 text-sm font-bold hover:bg-slate-50">☰ Menu Vaksinasi</a>
        </div>

        {error ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{error}</div> : null}
        {message ? <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800">{message}</div> : null}

        <section className="mt-6 rounded-2xl border bg-slate-50 p-5">
          <h2 className="font-bold">1. Pilih Session & Database</h2>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <select
              className="rounded-xl border px-3 py-2.5"
              value={form.sessionId}
              onChange={(e) => setForm({ ...form, sessionId: e.target.value })}
            >
              <option value="">Pilih session</option>
              {sessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {session.session_name} · {session.company_name || "-"}
                </option>
              ))}
            </select>

            <select
              className="rounded-xl border px-3 py-2.5"
              value={selectedSourceId}
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

            <select
              className="rounded-xl border px-3 py-2.5"
              value={form.vaccineId}
              onChange={(e) => setForm({ ...form, vaccineId: e.target.value })}
            >
              <option value="">Vaksin default dari session / pilih manual</option>
              {vaccines.map((vaccine) => (
                <option key={vaccine.id} value={vaccine.id}>
                  {vaccine.name}
                  {vaccine.brand ? ` · ${vaccine.brand}` : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={importCorporate}
              disabled={importing || !form.sessionId || !selectedSourceId}
              className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {importing ? "Importing..." : "Import Peserta dari Database Corporate"}
            </button>

            <a
              href="/vaccination/session"
              className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50"
            >
              Setup Session
            </a>
          </div>
        </section>

        <section className="mt-6 rounded-2xl border bg-slate-50 p-5">
          <h2 className="font-bold">2. Registrasi Ulang Manual / Walk-in</h2>
          <p className="mt-1 text-sm text-slate-500">
            Form ini langsung merilis nomor antrian karena dipakai saat peserta datang.
          </p>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <input className="rounded-xl border px-3 py-2.5" placeholder="Nama peserta *" value={form.participantName} onChange={(e) => setForm({ ...form, participantName: e.target.value })} />
            <input className="rounded-xl border px-3 py-2.5" placeholder="Employee ID" value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })} />
            <input className="rounded-xl border px-3 py-2.5" placeholder="NIK" value={form.nik} onChange={(e) => setForm({ ...form, nik: e.target.value })} />
            <input className="rounded-xl border px-3 py-2.5" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <input className="rounded-xl border px-3 py-2.5" placeholder="Nomor HP" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <input className="rounded-xl border px-3 py-2.5" placeholder="Perusahaan" value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} />
            <input className="rounded-xl border px-3 py-2.5" placeholder="Departemen" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
          </div>

          <button onClick={submit} className="mt-4 rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white hover:bg-blue-700">
            Registrasi Ulang + Rilis Nomor Antrian
          </button>
        </section>

        <section className="mt-6 overflow-hidden rounded-2xl border">
          <div className="border-b bg-slate-50 p-4 font-bold">
            Registrasi Session Ini · {registrations.length} peserta
          </div>

          <div className="max-h-[560px] overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-slate-100 text-xs uppercase text-slate-600">
                <tr>
                  <th className="p-3 text-left">Antrian</th>
                  <th className="p-3 text-left">Nama</th>
                  <th className="p-3 text-left">MCU ID</th>
                  <th className="p-3 text-left">Vaksin</th>
                  <th className="p-3 text-left">Status</th>
                  <th className="p-3 text-left">Aksi Registrasi Ulang</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {registrations.map((registration) => (
                  <tr key={registration.id}>
                    <td className="p-3 text-xl font-black">
                      {registration.queue_number ? (
                        registration.queue_number
                      ) : (
                        <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-800">Belum rilis</span>
                      )}
                    </td>
                    <td className="p-3">{registration.participant_name}</td>
                    <td className="p-3">{registration.mcu_id || registration.employee_id || "-"}</td>
                    <td className="p-3">{registration.vaccine?.name || "Sesuai session"}</td>
                    <td className="p-3">{registration.queue_status}</td>
                    <td className="p-3">
                      {!registration.queue_number ? (
                        <button
                          type="button"
                          onClick={() => releaseQueue(registration)}
                          disabled={releasingId === registration.id}
                          className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-60"
                        >
                          {releasingId === registration.id ? "Merilis..." : "Rilis Nomor Antrian"}
                        </button>
                      ) : (
                        <span className="text-xs font-bold text-slate-500">Sudah rilis</span>
                      )}
                    </td>
                  </tr>
                ))}

                {!registrations.length ? (
                  <tr>
                    <td colSpan={6} className="p-5 text-center text-slate-500">Belum ada peserta pada session ini.</td>
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
