"use client";

import { useEffect, useMemo, useState } from "react";

// V502_ISERVE_EXACT_COMBINATION_BATCH_EXPORT_UI
function cleanText(value: any) {
  return String(value ?? "").trim();
}

function sessionLabel(session: any) {
  const parts = [
    cleanText(session?.session_name),
    cleanText(session?.location),
    cleanText(session?.session_date),
  ].filter(Boolean);
  return parts.join(" · ") || `Session ${session?.id || ""}`;
}

export default function VaccinationIserveExportPage() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [combinations, setCombinations] = useState<any[]>([]);
  const [session, setSession] = useState<any | null>(null);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [loadingCombinations, setLoadingCombinations] = useState(false);
  const [error, setError] = useState("");
  const [skippedCount, setSkippedCount] = useState(0);
  const [skippedNames, setSkippedNames] = useState<string[]>([]);
  const [totalAppointments, setTotalAppointments] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function loadSessions() {
      setLoadingSessions(true);
      setError("");
      try {
        const response = await fetch(
          "/api/vaccination/iserve?mode=sessions",
          { cache: "no-store" },
        );
        const json = await response.json().catch(() => ({}));
        if (!response.ok || !json.ok) {
          throw new Error(json.message || "Gagal mengambil Session.");
        }
        if (cancelled) return;
        const rows = json.sessions || [];
        setSessions(rows);
        if (rows.length) setSessionId(String(rows[0].id));
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message || "Gagal mengambil Session.");
        }
      } finally {
        if (!cancelled) setLoadingSessions(false);
      }
    }
    loadSessions();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!sessionId) {
      setCombinations([]);
      setSession(null);
      return;
    }

    let cancelled = false;
    async function loadCombinations() {
      setLoadingCombinations(true);
      setError("");
      try {
        const params = new URLSearchParams({
          mode: "meta",
          session_id: sessionId,
        });
        const response = await fetch(
          `/api/vaccination/iserve?${params.toString()}`,
          { cache: "no-store" },
        );
        const json = await response.json().catch(() => ({}));
        if (!response.ok || !json.ok) {
          throw new Error(json.message || "Gagal membaca batch kombinasi.");
        }
        if (cancelled) return;
        setSession(json.session || null);
        setCombinations(json.combinations || []);
        setSkippedCount(Number(json.skipped_count || 0));
        setSkippedNames(json.skipped_names || []);
        setTotalAppointments(Number(json.total_appointments || 0));
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message || "Gagal membaca batch kombinasi.");
          setCombinations([]);
        }
      } finally {
        if (!cancelled) setLoadingCombinations(false);
      }
    }

    loadCombinations();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const selectedSession = useMemo(
    () =>
      sessions.find((row) => String(row.id || "") === String(sessionId)) ||
      session,
    [sessions, sessionId, session],
  );

  function exportUrl(combinationKey: string) {
    const params = new URLSearchParams({
      mode: "export",
      session_id: sessionId,
      combination: combinationKey,
    });
    return `/api/vaccination/iserve?${params.toString()}`;
  }

  const templateUrl = sessionId
    ? `/api/vaccination/iserve?mode=template&session_id=${encodeURIComponent(
        sessionId,
      )}`
    : "#";

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-7xl">
        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.18em] text-indigo-600">
                Vaccination · iServe
              </div>
              <h1 className="mt-1 text-2xl font-black text-slate-900">
                Export Appointment iServe per Batch Kombinasi
              </h1>
              <p className="mt-2 max-w-3xl text-sm text-slate-600">
                Satu exact kombinasi vaksin = satu file batch. Product, Lot/Serial
                Number, Dose, dan Quantity dipilih langsung di wizard iServe,
                bukan diisi dari file export ini.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <a
                href={templateUrl}
                className={`rounded-xl border px-4 py-2 text-sm font-bold ${
                  sessionId
                    ? "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    : "pointer-events-none opacity-50"
                }`}
              >
                Template Kosong iServe
              </a>
              <a
                href="/vaccination/master"
                className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-bold text-blue-700"
              >
                ← Master Produk & Stok
              </a>
              <a
                href="/vaccination"
                className="rounded-xl border px-4 py-2 text-sm font-bold"
              >
                ☰ Menu Vaksinasi
              </a>
            </div>
          </div>

          {error ? (
            <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
              {error}
            </div>
          ) : null}

          <section className="mt-6 rounded-2xl border bg-slate-50 p-5">
            <label className="text-xs font-black uppercase text-slate-500">
              Session / Lokasi
            </label>
            <select
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
              disabled={loadingSessions}
              className="mt-2 w-full rounded-xl border bg-white px-4 py-3 text-sm font-semibold"
            >
              {loadingSessions ? (
                <option value="">Memuat Session...</option>
              ) : null}
              {!loadingSessions && !sessions.length ? (
                <option value="">Tidak ada Session tersedia</option>
              ) : null}
              {sessions.map((row) => (
                <option key={row.id} value={String(row.id)}>
                  {sessionLabel(row)}
                </option>
              ))}
            </select>

            {selectedSession ? (
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <div className="rounded-xl border bg-white p-3">
                  <div className="text-xs font-bold uppercase text-slate-500">
                    Perusahaan
                  </div>
                  <div className="mt-1 font-bold">
                    {selectedSession.company_name || "-"}
                  </div>
                </div>
                <div className="rounded-xl border bg-white p-3">
                  <div className="text-xs font-bold uppercase text-slate-500">
                    Lokasi
                  </div>
                  <div className="mt-1 font-bold">
                    {selectedSession.location || "-"}
                  </div>
                </div>
                <div className="rounded-xl border bg-white p-3">
                  <div className="text-xs font-bold uppercase text-slate-500">
                    Tanggal
                  </div>
                  <div className="mt-1 font-bold">
                    {selectedSession.session_date || "-"}
                  </div>
                </div>
              </div>
            ) : null}
          </section>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border bg-indigo-50 p-4">
              <div className="text-xs font-black uppercase text-indigo-600">
                Exact Combination
              </div>
              <div className="mt-1 text-2xl font-black text-indigo-800">
                {combinations.length}
              </div>
            </div>
            <div className="rounded-xl border bg-emerald-50 p-4">
              <div className="text-xs font-black uppercase text-emerald-600">
                Siap Export
              </div>
              <div className="mt-1 text-2xl font-black text-emerald-800">
                {totalAppointments}
              </div>
            </div>
            <div className="rounded-xl border bg-amber-50 p-4">
              <div className="text-xs font-black uppercase text-amber-600">
                Belum Punya Kombinasi
              </div>
              <div className="mt-1 text-2xl font-black text-amber-800">
                {skippedCount}
              </div>
            </div>
          </div>

          {skippedCount > 0 ? (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              <div className="font-black">
                {skippedCount} peserta belum punya registration item vaksin aktif,
                jadi belum masuk batch iServe.
              </div>
              {skippedNames.length ? (
                <div className="mt-1 text-xs">
                  Contoh: {skippedNames.join(", ")}
                </div>
              ) : null}
            </div>
          ) : null}

          <section className="mt-6 overflow-hidden rounded-2xl border">
            <div className="border-b bg-slate-50 px-4 py-3">
              <div className="font-black">Batch iServe</div>
              <div className="mt-1 text-xs text-slate-500">
                Peserta dengan kombinasi berbeda tidak dicampur ke file yang sama.
              </div>
            </div>

            {loadingCombinations ? (
              <div className="p-6 text-sm font-semibold text-slate-500">
                Membaca kombinasi vaksin peserta...
              </div>
            ) : (
              <div className="overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-100 text-xs uppercase text-slate-600">
                    <tr>
                      <th className="p-3 text-left">Kombinasi Vaksin</th>
                      <th className="p-3 text-left">Jumlah Vaksin</th>
                      <th className="p-3 text-left">Peserta</th>
                      <th className="p-3 text-left">Contoh Nama</th>
                      <th className="p-3 text-left">Export</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {combinations.map((combo) => (
                      <tr key={combo.key}>
                        <td className="p-3">
                          <div className="font-black text-slate-900">
                            {combo.label}
                          </div>
                          <div className="mt-1 text-xs text-slate-500">
                            Exact combination
                          </div>
                        </td>
                        <td className="p-3 font-bold">
                          {combo.benefit_count}
                        </td>
                        <td className="p-3">
                          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-black text-emerald-700">
                            {combo.participant_count} peserta
                          </span>
                        </td>
                        <td className="max-w-[420px] p-3 text-xs text-slate-600">
                          {(combo.participant_names || []).join(", ") || "-"}
                          {combo.participant_count >
                          (combo.participant_names || []).length
                            ? " …"
                            : ""}
                        </td>
                        <td className="p-3">
                          <a
                            href={exportUrl(combo.key)}
                            className="inline-flex rounded-lg bg-indigo-600 px-3 py-2 text-xs font-black text-white hover:bg-indigo-700"
                          >
                            ⇩ Export Batch
                          </a>
                        </td>
                      </tr>
                    ))}
                    {!combinations.length ? (
                      <tr>
                        <td
                          colSpan={5}
                          className="p-8 text-center text-sm text-slate-500"
                        >
                          Belum ada exact combination untuk Session ini.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <div className="mt-5 rounded-2xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-900">
            <div className="font-black">Flow iServe</div>
            <div className="mt-1">
              Pilih Session → pilih satu exact combination → Export Batch →
              buka Import Appointment di iServe → pilih Vaccination/Product +
              Lot/Serial Number langsung di wizard → upload file batch tersebut.
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
