
"use client";

import { useEffect, useMemo, useState } from "react";
import AuthGate from "@/components/AuthGate";

const CAPASKA_STAFF_STAGES = [
  "Kesehatan Mata",
  "Kesehatan THT",
  "Kesehatan Gigi & Mulut + Dental Panoramik",
  "Penyakit Dalam",
  "Jantung",
  "Ortopedi",
  "Radiologi",
];

function normalizeText(value: any) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/orthopedi/g, "ortopedi")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function uniqueStaffNames(text: string) {
  const seen = new Set<string>();
  const names: string[] = [];

  String(text || "")
    .split(/\r?\n|;/)
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((name) => {
      const key = normalizeText(name);
      if (!key || seen.has(key)) return;
      seen.add(key);
      names.push(name);
    });

  return names;
}

function findStageName(rowStage: any) {
  const rowKey = normalizeText(rowStage);
  return CAPASKA_STAFF_STAGES.find((stage) => {
    const stageKey = normalizeText(stage);
    return stageKey === rowKey || stageKey.includes(rowKey) || rowKey.includes(stageKey);
  });
}

export default function StaffEditorPage() {
  return (
    <AuthGate>
      {(user) => <StaffEditor user={user} />}
    </AuthGate>
  );
}

function StaffEditor({ user }: { user: any }) {
  const [forms, setForms] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const totalNames = useMemo(() => {
    return CAPASKA_STAFF_STAGES.reduce((sum, stage) => sum + uniqueStaffNames(forms[stage] || "").length, 0);
  }, [forms]);

  async function loadStaffOptions() {
    setLoading(true);
    setMessage("");

    try {
      const res = await fetch("/api/mcu/stage-staff/options?program_type=capaska", { cache: "no-store" });
      const json = await res.json();

      if (!json.ok) {
        setMessage(json.message || "Gagal memuat data petugas.");
        return;
      }

      const next: Record<string, string[]> = {};
      CAPASKA_STAFF_STAGES.forEach((stage) => { next[stage] = []; });

      (json.rows || []).forEach((row: any) => {
        const staffName = String(row.staff_name || "").trim();
        if (!staffName) return;
        const stageName = findStageName(row.stage_name);
        if (!stageName) return;
        next[stageName].push(staffName);
      });

      const textForms: Record<string, string> = {};
      CAPASKA_STAFF_STAGES.forEach((stage) => {
        textForms[stage] = uniqueStaffNames((next[stage] || []).join("\n")).join("\n");
      });

      setForms(textForms);
      setMessage("Data petugas berhasil dimuat.");
    } catch (error: any) {
      setMessage(error?.message || "Gagal memuat data petugas.");
    } finally {
      setLoading(false);
    }
  }

  async function saveStaffOptions() {
    const stages = CAPASKA_STAFF_STAGES.map((stage) => ({
      stage_name: stage,
      staff_names: uniqueStaffNames(forms[stage] || ""),
    }));

    setLoading(true);
    setMessage("");

    try {
      const res = await fetch("/api/mcu/stage-staff/options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ program_type: "capaska", replace_all: true, stages }),
      });

      const json = await res.json();

      if (!json.ok) {
        setMessage(json.message || "Gagal menyimpan data petugas.");
        return;
      }

      const saved = json.saved ?? totalNames;
      setMessage("Data petugas berhasil disimpan. Total nama aktif: " + saved + ".");
      await loadStaffOptions();
    } catch (error: any) {
      setMessage(error?.message || "Gagal menyimpan data petugas.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStaffOptions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (String(user?.role || "").toLowerCase() !== "admin") {
    return <div className="card p-5 text-red-700">Hanya admin yang dapat mengedit data petugas.</div>;
  }

  return (
    <div className="space-y-5">
      <section className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-2xl font-black">Edit Data Petugas CAPASKA</div>
            <div className="mt-1 text-sm text-slate-500">
              Ubah daftar nama dokter/petugas per operator. Satu nama per baris. Nama ini akan muncul di form input masing-masing operator.
            </div>
          </div>
          <a href="/setup-parameters" className="btn-secondary">Kembali</a>
        </div>

        {message && (
          <div className="mt-4 rounded-2xl bg-indigo-50 p-3 text-sm font-semibold text-indigo-700">{message}</div>
        )}
      </section>

      <section className="card p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xl font-black">Daftar Petugas per Operator</div>
            <div className="mt-1 text-sm text-slate-500">Total nama aktif: {totalNames}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-secondary" onClick={loadStaffOptions} disabled={loading}>Refresh</button>
            <button type="button" className="btn-primary" onClick={saveStaffOptions} disabled={loading}>{loading ? "Menyimpan..." : "Simpan Data Petugas"}</button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {CAPASKA_STAFF_STAGES.map((stage) => (
            <div key={stage} className="rounded-2xl border border-slate-200 bg-white p-4">
              <label className="label">{stage}</label>
              <textarea
                className="input min-h-40 font-medium"
                value={forms[stage] || ""}
                onChange={(e) => setForms({ ...forms, [stage]: e.target.value })}
                placeholder={"Contoh:\ndr. Nama Petugas 1\ndr. Nama Petugas 2"}
              />
              <div className="mt-2 text-xs text-slate-500">Total: {uniqueStaffNames(forms[stage] || "").length} nama aktif</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
