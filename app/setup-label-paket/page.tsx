"use client";

import { useEffect, useMemo, useState } from "react";
import AuthGate from "@/components/AuthGate";

type PackageRow = {
  id: number;
  name: string;
  program_type?: string;
  company_id?: number;
};

type StationPrintOption = {
  key: string;
  label: string;
  shortCode: string;
  defaultCopies: number;
  kind?: string;
};

const STATION_PRINT_OPTIONS: StationPrintOption[] = [
  { key: "registrasi_ulang", label: "REGISTRASI ULANG", shortCode: "REG", defaultCopies: 1 },
  { key: "pemeriksaan_fisik", label: "PEMERIKSAAN FISIK", shortCode: "FISIK", defaultCopies: 1 },
  { key: "darah", label: "DARAH", shortCode: "DRH", defaultCopies: 1 },
  { key: "urine", label: "URINE", shortCode: "URN", defaultCopies: 1 },
  { key: "dokter", label: "DOKTER", shortCode: "DOK", defaultCopies: 1 },
  { key: "rontgen", label: "RONTGEN", shortCode: "RO", defaultCopies: 1 },
  { key: "ekg_hasil", label: "EKG - HASIL", shortCode: "EKG", defaultCopies: 1 },
  { key: "ekg_nakes", label: "EKG - NAKES", shortCode: "EKG", defaultCopies: 1 },
  { key: "audio", label: "AUDIO", shortCode: "AUD", defaultCopies: 1 },
  { key: "mata", label: "MATA", shortCode: "MATA", defaultCopies: 1 },
  { key: "tht", label: "THT", shortCode: "THT", defaultCopies: 1 },
  { key: "gigi", label: "GIGI", shortCode: "GIGI", defaultCopies: 2 },
  { key: "penyakit_dalam", label: "PENYAKIT DALAM", shortCode: "PD", defaultCopies: 1 },
  { key: "jantung", label: "JANTUNG", shortCode: "JTG", defaultCopies: 1 },
  { key: "radiologi", label: "RADIOLOGI", shortCode: "RAD", defaultCopies: 1 },
  { key: "ortopedi", label: "ORTOPEDI", shortCode: "ORT", defaultCopies: 1 }
];

function copiesForStations(stations: StationPrintOption[]) {
  return Object.fromEntries(
    stations.map((station) => [station.key, station.defaultCopies])
  ) as Record<string, number>;
}

function apiStationsToOptions(rows: any[]): StationPrintOption[] {
  return (rows || [])
    .map((row: any) => ({
      key: String(row.station_key || row.key || ""),
      label: String(row.station_label || row.label || "").trim(),
      shortCode: String(row.short_code || row.shortCode || ""),
      defaultCopies: Math.max(0, Math.min(20, Number(row.default_copies ?? row.defaultCopies ?? 1))),
      kind: String(row.kind || "")
    }))
    .filter((station: StationPrintOption) => station.key && station.label);
}

export default function SetupLabelPaketPage() {
  return (
    <AuthGate>
      {(user) => <SetupLabelPaket user={user} />}
    </AuthGate>
  );
}

function SetupLabelPaket({ user }: { user: any }) {
  const [program, setProgram] = useState(user.program_type === "all" ? "capaska" : user.program_type || "capaska");
  const [packages, setPackages] = useState<PackageRow[]>([]);
  const [packageId, setPackageId] = useState("");
  const [activeStations, setActiveStations] = useState<StationPrintOption[]>(STATION_PRINT_OPTIONS);
  const [copies, setCopies] = useState<Record<string, number>>(() => copiesForStations(STATION_PRINT_OPTIONS));
  const [packageParameterNames, setPackageParameterNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const selectedPackage = useMemo(() => {
    return packages.find((pkg) => String(pkg.id) === packageId);
  }, [packages, packageId]);

  useEffect(() => {
    loadPackages();
  }, [program]);

  useEffect(() => {
    if (packageId) {
      loadSettings(packageId);
    }
  }, [packageId]);

  if (user.role !== "admin") {
    return <div className="card p-5 text-red-700">Hanya admin yang dapat membuka Setup Label Paket.</div>;
  }

  async function loadPackages() {
    setLoading(true);
    setMessage("Memuat paket...");

    try {
      const res = await fetch(`/api/package-label-settings?program=${program}`, { cache: "no-store" });
      const json = await res.json();

      if (!json.ok) {
        setPackages([]);
        setMessage(json.message || "Gagal memuat paket.");
        return;
      }

      const rows = json.packages || [];
      setPackages(rows);

      if (rows.length) {
        setPackageId(String(rows[0].id));
      } else {
        setPackageId("");
        const fallbackStations = program === "corporate" ? [] : STATION_PRINT_OPTIONS;
        setActiveStations(fallbackStations);
        setCopies(copiesForStations(fallbackStations));
        setPackageParameterNames([]);
      }

      setMessage(rows.length ? "Pilih paket, lalu atur jumlah label per station." : "Belum ada paket untuk program ini.");
    } catch (err: any) {
      setPackages([]);
      setMessage(err?.message || "Gagal memuat paket.");
    } finally {
      setLoading(false);
    }
  }

  async function loadSettings(id: string) {
    setLoading(true);
    setMessage("Memuat setting label paket...");

    try {
      const params = new URLSearchParams({
        program,
        package_id: id
      });

      const res = await fetch(`/api/package-label-settings?${params.toString()}`, { cache: "no-store" });
      const json = await res.json();

      if (!json.ok) {
        const fallbackStations = program === "corporate" ? [] : STATION_PRINT_OPTIONS;
        setActiveStations(fallbackStations);
        setCopies(copiesForStations(fallbackStations));
        setPackageParameterNames([]);
        setMessage(json.message || "Gagal memuat setting.");
        return;
      }

      const apiStations = program === "corporate" && Array.isArray(json.available_stations)
        ? apiStationsToOptions(json.available_stations)
        : STATION_PRINT_OPTIONS;

      const nextStations = apiStations.length ? apiStations : (program === "corporate" ? [] : STATION_PRINT_OPTIONS);
      const next = copiesForStations(nextStations);

      (json.settings || []).forEach((setting: any) => {
        const key = String(setting.station_key || "");
        if (key in next) {
          next[key] = Math.max(0, Math.min(20, Number(setting.default_copies ?? 0)));
        }
      });

      setActiveStations(nextStations);
      setCopies(next);
      setPackageParameterNames(
        Array.isArray(json.package_parameters)
          ? json.package_parameters.map((row: any) => String(row.parameter_name || "").trim()).filter(Boolean)
          : []
      );
      setMessage("Setting siap diedit sesuai isi paket.");
    } catch (err: any) {
      const fallbackStations = program === "corporate" ? [] : STATION_PRINT_OPTIONS;
      setActiveStations(fallbackStations);
      setCopies(copiesForStations(fallbackStations));
      setPackageParameterNames([]);
      setMessage(err?.message || "Gagal memuat setting.");
    } finally {
      setLoading(false);
    }
  }

  function setCopy(stationKey: string, value: number) {
    const safeValue = Math.max(0, Math.min(20, Number(value || 0)));

    setCopies((prev) => ({
      ...prev,
      [stationKey]: safeValue
    }));
  }

  function setAll(value: number) {
    const safeValue = Math.max(0, Math.min(20, Number(value || 0)));

    setCopies(
      Object.fromEntries(
        activeStations.map((station) => [station.key, safeValue])
      ) as Record<string, number>
    );
  }

  function setDefault() {
    setCopies(copiesForStations(activeStations));
  }

  async function save() {
    if (!packageId) {
      setMessage("Pilih paket dulu.");
      return;
    }

    if (!activeStations.length) {
      setMessage("Tidak ada station barcode untuk paket ini. Cek checklist parameter paket.");
      return;
    }

    setSaving(true);
    setMessage("Menyimpan setting label paket...");

    try {
      const settings = activeStations.map((station) => ({
        station_key: station.key,
        station_label: station.label,
        short_code: station.shortCode,
        default_copies: Number(copies[station.key] || 0)
      }));

      const res = await fetch("/api/package-label-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          program_type: program,
          package_id: Number(packageId),
          settings
        })
      });

      const json = await res.json();

      if (!json.ok) {
        setMessage(json.message || "Gagal menyimpan setting.");
        return;
      }

      setMessage("Setting label paket berhasil disimpan.");
    } catch (err: any) {
      setMessage(err?.message || "Gagal menyimpan setting.");
    } finally {
      setSaving(false);
    }
  }

  const total = activeStations.reduce((sum, station) => sum + Number(copies[station.key] || 0), 0);
  const hasEkg = activeStations.some((station) => station.key === "ekg_hasil" || station.key === "ekg_nakes");
  const packageLabelPreview = activeStations
    .filter((station) => station.key !== "registrasi_ulang")
    .map((station) => station.label)
    .join(", ");

  return (
    <div className="space-y-5">
      <section className="card p-5">
        <div className="text-2xl font-black">Setup Label Paket</div>
        <div className="mt-1 text-sm text-slate-500">
          Atur default jumlah print label per station berdasarkan paket pemeriksaan. Setting ini dipakai otomatis di Registrasi Ulang.
        </div>
        <div className="mt-2 w-fit rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
          Setup Label Paket v424 · Corporate follows selected package items
        </div>
      </section>

      <section className="card p-5">
        <div className="grid items-end gap-4 md:grid-cols-[180px_1fr_auto]">
          <div>
            <label className="label">Program</label>
            <select className="input" value={program} onChange={(e) => setProgram(e.target.value)}>
              <option value="capaska">CAPASKA</option>
              <option value="corporate">Corporate</option>
            </select>
          </div>

          <div>
            <label className="label">Paket Pemeriksaan</label>
            <select className="input" value={packageId} onChange={(e) => setPackageId(e.target.value)}>
              {packages.map((pkg) => (
                <option key={pkg.id} value={pkg.id}>{pkg.name}</option>
              ))}
            </select>
          </div>

          <button type="button" className="btn-primary" onClick={save} disabled={saving || !packageId || !activeStations.length}>
            {saving ? "Menyimpan..." : "Save Setting"}
          </button>
        </div>

        {selectedPackage && (
          <div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
            <div>Paket aktif: <b>{selectedPackage.name}</b>. Total default label: <b>{total}</b>.</div>
            {program === "corporate" && (
              <>
                <div className="mt-1">Label dari paket: <b>{packageLabelPreview || "-"}</b>.</div>
                {packageParameterNames.length > 0 && (
                  <div className="mt-1 text-xs text-slate-500">Parameter ter-checklist: {packageParameterNames.join(", ")}</div>
                )}
              </>
            )}
          </div>
        )}

        {message && (
          <div className="mt-4 rounded-xl bg-blue-50 p-3 text-sm font-semibold text-blue-700">
            {message}
          </div>
        )}
      </section>

      <section className="card p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xl font-black">Jumlah Print per Station</div>
            <div className="text-sm text-slate-500">
              {program === "corporate"
                ? "Hanya station/parameter yang memang ada di paket terpilih yang ditampilkan."
                : "Isi 0 jika station tidak perlu dicetak untuk paket ini."}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-secondary" onClick={() => setAll(1)} disabled={!activeStations.length}>Semua 1x</button>
            {hasEkg && (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setCopy("ekg_hasil", 1);
                  setCopy("ekg_nakes", 1);
                }}
              >
                EKG 2 Label
              </button>
            )}
            <button type="button" className="btn-secondary" onClick={setDefault} disabled={!activeStations.length}>Default</button>
            <button type="button" className="btn-secondary" onClick={() => setAll(0)} disabled={!activeStations.length}>Kosongkan</button>
          </div>
        </div>

        {activeStations.length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {activeStations.map((station) => (
              <div key={station.key} className="rounded-2xl border border-slate-200 bg-white p-3">
                <label className="mb-2 block text-sm font-black text-slate-800">{station.label}</label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="rounded-xl border border-slate-300 px-3 py-2 font-black"
                    onClick={() => setCopy(station.key, Number(copies[station.key] || 0) - 1)}
                  >
                    -
                  </button>

                  <input
                    type="number"
                    min={0}
                    max={20}
                    className="input text-center"
                    value={copies[station.key] ?? 0}
                    onChange={(e) => setCopy(station.key, Number(e.target.value || 0))}
                  />

                  <button
                    type="button"
                    className="rounded-xl border border-slate-300 px-3 py-2 font-black"
                    onClick={() => setCopy(station.key, Number(copies[station.key] || 0) + 1)}
                  >
                    +
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">
            Belum ada station barcode dari paket ini. Cek kembali parameter yang dichecklist di Setup Parameter.
          </div>
        )}
      </section>
    </div>
  );
}
