"use client";

// VACCINATION_REGISTER_MASTER_SEARCH_COMPONENT_V153_0
import { useEffect, useMemo, useState } from "react";

function clean(value: any) {
  return String(value ?? "").trim();
}

function resultIdentity(row: any) {
  return [
    clean(row?.name),
    clean(row?.employeeId),
    clean(row?.nik),
    clean(row?.email),
    clean(row?.sourceLabel),
  ]
    .filter(Boolean)
    .join("|");
}

export default function VaccinationParticipantMasterSearch({
  form,
  setForm,
}: {
  form: any;
  setForm: any;
}) {
  const [companies, setCompanies] = useState<any[]>([]);
  const [companyKey, setCompanyKey] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [loadingCompanies, setLoadingCompanies] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadCompanies() {
      setLoadingCompanies(true);
      setError("");
      try {
        const response = await fetch("/api/vaccination/register-master-search", {
          cache: "no-store",
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload?.ok === false) {
          throw new Error(payload?.message || payload?.error || `HTTP ${response.status}`);
        }
        if (!active) return;
        setCompanies(Array.isArray(payload?.companies) ? payload.companies : []);
      } catch (e: any) {
        if (active) setError(String(e?.message || e || "Gagal memuat daftar perusahaan."));
      } finally {
        if (active) setLoadingCompanies(false);
      }
    }

    void loadCompanies();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setSelected(null);
    setResults([]);
    setQuery("");
  }, [companyKey]);

  useEffect(() => {
    const keyword = query.trim();
    if (!companyKey || keyword.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }

    let active = true;
    const timer = window.setTimeout(async () => {
      setSearching(true);
      setError("");
      try {
        const params = new URLSearchParams({
          company_key: companyKey,
          q: keyword,
        });
        const response = await fetch(`/api/vaccination/register-master-search?${params.toString()}`, {
          cache: "no-store",
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload?.ok === false) {
          throw new Error(payload?.message || payload?.error || `HTTP ${response.status}`);
        }
        if (!active) return;
        setResults(Array.isArray(payload?.results) ? payload.results : []);
      } catch (e: any) {
        if (active) {
          setResults([]);
          setError(String(e?.message || e || "Pencarian peserta gagal."));
        }
      } finally {
        if (active) setSearching(false);
      }
    }, 320);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [companyKey, query]);

  const company = useMemo(
    () => companies.find((item: any) => clean(item?.key) === companyKey) || null,
    [companies, companyKey],
  );

  function chooseParticipant(row: any) {
    const participantId = Number(row?.participantId || 0) || null;
    const name = clean(row?.name);
    const employeeId = clean(row?.employeeId);
    const nik = clean(row?.nik);
    const email = clean(row?.email);
    const phone = clean(row?.phone);
    const department = clean(row?.department);
    const companyName = clean(row?.companyName) || clean(company?.name);

    setSelected(row);

    // Set both camelCase and snake_case aliases.
    // Existing manual registration UI keeps using its current form keys;
    // extra aliases are harmless and preserve compatibility with the register POST body.
    setForm((previous: any) => ({
      ...(previous || {}),
      participantId,
      participant_id: participantId,
      name,
      participantName: name,
      participant_name: name,
      employeeId,
      employee_id: employeeId,
      nik,
      email,
      phone,
      department,
      companyName,
      company_name: companyName,
      historyPersonId: Number(row?.historyPersonId || 0) || null,
      masterSearchSource: clean(row?.sourceType),
    }));
  }

  return (
    <div className="mb-4 rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-sm font-black text-slate-900">Cari Peserta dari Master</div>
          <div className="mt-1 text-xs font-semibold leading-5 text-slate-500">
            Pilih asal perusahaan terlebih dahulu, lalu cari nama / NIP / NIK / email.
            Pencarian mencakup seluruh database perusahaan dan peserta tambahan dari History Company.
          </div>
        </div>
        <div className="rounded-full border border-blue-100 bg-white px-3 py-1 text-[11px] font-black text-blue-700">
          Opsional · input manual tetap bisa
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[0.85fr_1.15fr]">
        <label className="block">
          <span className="mb-1.5 block text-[11px] font-black uppercase tracking-wide text-slate-500">
            1. Asal Perusahaan / Instansi
          </span>
          <select
            value={companyKey}
            onChange={(e) => setCompanyKey(e.target.value)}
            disabled={loadingCompanies}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-blue-400"
          >
            <option value="">
              {loadingCompanies ? "Memuat perusahaan..." : "Pilih perusahaan / instansi"}
            </option>
            {companies.map((item: any) => (
              <option key={item.key} value={item.key}>
                {item.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-[11px] font-black uppercase tracking-wide text-slate-500">
            2. Cari Peserta
          </span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={!companyKey}
            placeholder={companyKey ? "Ketik minimal 2 huruf nama / NIP / NIK / email..." : "Pilih perusahaan terlebih dahulu"}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none placeholder:font-medium placeholder:text-slate-400 focus:border-blue-400 disabled:bg-slate-100"
          />
        </label>
      </div>

      {error ? (
        <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">
          {error}
        </div>
      ) : null}

      {selected ? (
        <div className="mt-3 flex flex-col gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-xs font-black text-emerald-900">
              Peserta dipilih: {selected.name}
            </div>
            <div className="mt-0.5 text-[11px] font-semibold text-emerald-700">
              {selected.employeeId ? `NIP ${selected.employeeId}` : selected.nik ? `NIK ${selected.nik}` : "Identitas master"}
              {" · "}
              {selected.sourceLabel || (selected.sourceType === "HISTORY_COMPANY" ? "History Company" : "Database Utama")}
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setSelected(null);
              setQuery("");
            }}
            className="rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-xs font-black text-emerald-800"
          >
            Ganti Peserta
          </button>
        </div>
      ) : null}

      {searching ? (
        <div className="mt-3 rounded-xl border bg-white px-3 py-3 text-xs font-bold text-slate-500">
          Mencari peserta...
        </div>
      ) : null}

      {!searching && companyKey && query.trim().length >= 2 && results.length ? (
        <div className="mt-3 max-h-72 overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          {results.map((row: any) => {
            const isHistory = row.sourceType === "HISTORY_COMPANY";
            return (
              <button
                type="button"
                key={resultIdentity(row)}
                onClick={() => chooseParticipant(row)}
                className="flex w-full items-start justify-between gap-4 border-b border-slate-100 px-4 py-3 text-left last:border-b-0 hover:bg-blue-50"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-black text-slate-900">{row.name || "-"}</div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-semibold text-slate-500">
                    {row.employeeId ? <span>NIP: {row.employeeId}</span> : null}
                    {row.nik ? <span>NIK: {row.nik}</span> : null}
                    {row.email ? <span>{row.email}</span> : null}
                  </div>
                  <div className="mt-1 text-[10px] font-bold text-slate-400">
                    {row.sourceLabel || row.companyName || "-"}
                  </div>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black ${
                    isHistory
                      ? "bg-violet-100 text-violet-700"
                      : "bg-blue-100 text-blue-700"
                  }`}
                >
                  {isHistory ? "History Company" : "Database Utama"}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}

      {!searching && companyKey && query.trim().length >= 2 && !results.length && !error ? (
        <div className="mt-3 rounded-xl border border-dashed bg-white px-3 py-3 text-xs font-semibold text-slate-500">
          Peserta tidak ditemukan. Anda tetap dapat mengisi form manual di bawah.
        </div>
      ) : null}
    </div>
  );
}
