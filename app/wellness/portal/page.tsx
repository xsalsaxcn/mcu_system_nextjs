"use client";

// WELLNESS_PORTAL_USER_STRAVA_V347
// Isolated Wellness participant portal. No MCU Corporate, CAPASKA, Vaccination, export, PDF, or scoring code is imported.

import { useEffect, useMemo, useState } from "react";
import { calculateBmi, classifyWellnessPortalRisk, type WellnessMonitoringLog, type WellnessPortalAccount } from "@/lib/wellness/portalRules";

const ACCOUNT_KEY = "wellness_portal_accounts_v347";
const ACTIVE_KEY = "wellness_portal_active_account_v347";
const LOG_KEY = "wellness_portal_logs_v347";

type AccountDraft = {
  name: string;
  employeeId: string;
  emailOrPhone: string;
  company: string;
  department: string;
  role: WellnessPortalAccount["role"];
  groupName: string;
  heightCm: string;
  baselineWeightKg: string;
  baselineWaistCm: string;
  baselineSbp: string;
  baselineDbp: string;
  baselineHba1c: string;
  baselineGlucose: string;
};

type LogDraft = {
  date: string;
  weightKg: string;
  waistCm: string;
  sbp: string;
  dbp: string;
  glucose: string;
  hba1c: string;
  activityMinutes: string;
  steps: string;
  mealNote: string;
  symptoms: string;
  medicationNote: string;
  bpPhotoUrl: string;
  labFileUrl: string;
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function safeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function numberOrUndefined(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function readJsonArray<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveJsonArray<T>(key: string, value: T[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

const defaultAccount: AccountDraft = {
  name: "",
  employeeId: "",
  emailOrPhone: "",
  company: "",
  department: "",
  role: "peserta",
  groupName: "",
  heightCm: "",
  baselineWeightKg: "",
  baselineWaistCm: "",
  baselineSbp: "",
  baselineDbp: "",
  baselineHba1c: "",
  baselineGlucose: "",
};

const defaultLog: LogDraft = {
  date: today(),
  weightKg: "",
  waistCm: "",
  sbp: "",
  dbp: "",
  glucose: "",
  hba1c: "",
  activityMinutes: "",
  steps: "",
  mealNote: "",
  symptoms: "",
  medicationNote: "",
  bpPhotoUrl: "",
  labFileUrl: "",
};

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">{children}</label>;
}

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:bg-slate-100 disabled:text-slate-400"
    />
  );
}

function SelectInput(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
    />
  );
}

function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className="min-h-[110px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
    />
  );
}

export default function WellnessPortalPage() {
  const [accounts, setAccounts] = useState<WellnessPortalAccount[]>([]);
  const [activeId, setActiveId] = useState("");
  const [draft, setDraft] = useState<AccountDraft>(defaultAccount);
  const [logDraft, setLogDraft] = useState<LogDraft>(defaultLog);
  const [logs, setLogs] = useState<WellnessMonitoringLog[]>([]);
  const [message, setMessage] = useState("Buat akun wellness peserta, connect Strava, lalu input monitoring harian/mingguan.");

  useEffect(() => {
    const storedAccounts = readJsonArray<WellnessPortalAccount>(ACCOUNT_KEY);
    const storedLogs = readJsonArray<WellnessMonitoringLog>(LOG_KEY);
    const storedActive = window.localStorage.getItem(ACTIVE_KEY) || "";
    setAccounts(storedAccounts);
    setLogs(storedLogs);
    if (storedAccounts.some((item) => item.id === storedActive)) setActiveId(storedActive);
    else if (storedAccounts[0]) setActiveId(storedAccounts[0].id);

    const params = new URLSearchParams(window.location.search);
    const strava = params.get("strava");
    const participantId = params.get("participantId");
    if (strava === "connected") {
      const id = participantId || storedActive || storedAccounts[0]?.id || "";
      if (id) {
        const nextAccounts = storedAccounts.map((account) =>
          account.id === id ? { ...account, stravaConnected: true, stravaConnectedAt: new Date().toISOString() } : account,
        );
        saveJsonArray(ACCOUNT_KEY, nextAccounts);
        setAccounts(nextAccounts);
        setActiveId(id);
        window.localStorage.setItem(ACTIVE_KEY, id);
        setMessage("Strava berhasil dihubungkan untuk portal wellness. Token permanen belum disimpan sampai tabel Wellness/Strava dibuat.");
      }
    }
    if (strava === "demo") {
      setMessage("Mode demo Strava aktif. Isi STRAVA_CLIENT_ID di environment untuk OAuth asli.");
    }
    if (strava === "error") {
      setMessage(`Strava belum terhubung: ${params.get("message") || "otorisasi dibatalkan"}.`);
    }
  }, []);

  const activeAccount = useMemo(() => accounts.find((item) => item.id === activeId), [accounts, activeId]);
  const accountLogs = useMemo(() => logs.filter((item) => item.accountId === activeId).sort((a, b) => b.date.localeCompare(a.date)), [logs, activeId]);
  const latestLog = accountLogs[0];
  const risk = activeAccount ? classifyWellnessPortalRisk(activeAccount, latestLog) : undefined;
  const latestBmi = activeAccount ? calculateBmi(latestLog?.weightKg ?? activeAccount.baselineWeightKg, activeAccount.heightCm) : undefined;

  function updateDraft<K extends keyof AccountDraft>(key: K, value: AccountDraft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function updateLog<K extends keyof LogDraft>(key: K, value: LogDraft[K]) {
    setLogDraft((prev) => ({ ...prev, [key]: value }));
  }

  function createAccount() {
    if (!draft.name.trim()) {
      setMessage("Nama peserta wajib diisi.");
      return;
    }
    if (!draft.employeeId.trim()) {
      setMessage("ID/NIK karyawan wajib diisi.");
      return;
    }

    const account: WellnessPortalAccount = {
      id: safeId("wellness-account"),
      name: draft.name.trim(),
      employeeId: draft.employeeId.trim(),
      emailOrPhone: draft.emailOrPhone.trim(),
      company: draft.company.trim() || "Wellness Program",
      department: draft.department.trim(),
      role: draft.role,
      groupName: draft.groupName.trim() || "Belum dikelompokkan",
      heightCm: numberOrUndefined(draft.heightCm),
      baselineWeightKg: numberOrUndefined(draft.baselineWeightKg),
      baselineWaistCm: numberOrUndefined(draft.baselineWaistCm),
      baselineSbp: numberOrUndefined(draft.baselineSbp),
      baselineDbp: numberOrUndefined(draft.baselineDbp),
      baselineHba1c: numberOrUndefined(draft.baselineHba1c),
      baselineGlucose: numberOrUndefined(draft.baselineGlucose),
      createdAt: new Date().toISOString(),
      stravaConnected: false,
    };

    const next = [account, ...accounts];
    setAccounts(next);
    setActiveId(account.id);
    saveJsonArray(ACCOUNT_KEY, next);
    window.localStorage.setItem(ACTIVE_KEY, account.id);
    setDraft(defaultAccount);
    setMessage(`Akun wellness ${account.name} dibuat. Data tersimpan lokal khusus modul Wellness.`);
  }

  function saveLog() {
    if (!activeAccount) {
      setMessage("Pilih atau buat akun peserta dulu.");
      return;
    }

    const log: WellnessMonitoringLog = {
      id: safeId("wellness-log"),
      accountId: activeAccount.id,
      date: logDraft.date || today(),
      weightKg: numberOrUndefined(logDraft.weightKg),
      waistCm: numberOrUndefined(logDraft.waistCm),
      sbp: numberOrUndefined(logDraft.sbp),
      dbp: numberOrUndefined(logDraft.dbp),
      glucose: numberOrUndefined(logDraft.glucose),
      hba1c: numberOrUndefined(logDraft.hba1c),
      activityMinutes: numberOrUndefined(logDraft.activityMinutes),
      steps: numberOrUndefined(logDraft.steps),
      mealNote: logDraft.mealNote.trim(),
      symptoms: logDraft.symptoms.trim(),
      medicationNote: logDraft.medicationNote.trim(),
      bpPhotoUrl: logDraft.bpPhotoUrl.trim(),
      labFileUrl: logDraft.labFileUrl.trim(),
      source: "manual",
      createdAt: new Date().toISOString(),
    };

    const nextLogs = [log, ...logs];
    setLogs(nextLogs);
    saveJsonArray(LOG_KEY, nextLogs);
    setLogDraft({ ...defaultLog, date: today() });
    setMessage("Input monitoring wellness berhasil disimpan lokal. Modul lain tidak terdampak.");
  }

  function connectDemoStrava() {
    if (!activeAccount) {
      setMessage("Pilih atau buat akun peserta dulu sebelum connect Strava.");
      return;
    }
    const next = accounts.map((account) =>
      account.id === activeAccount.id ? { ...account, stravaConnected: true, stravaConnectedAt: new Date().toISOString() } : account,
    );
    setAccounts(next);
    saveJsonArray(ACCOUNT_KEY, next);
    setMessage("Strava ditandai connected dalam mode demo. OAuth asli memakai tombol Connect Strava.");
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950 md:px-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="rounded-[2rem] bg-gradient-to-br from-emerald-600 via-sky-600 to-indigo-700 p-8 text-white shadow-xl">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="mb-3 inline-flex rounded-full bg-white/15 px-4 py-1 text-xs font-bold uppercase tracking-wide">Wellness Portal</div>
              <h1 className="text-3xl font-black md:text-4xl">Portal Peserta Wellness</h1>
              <p className="mt-2 max-w-3xl text-sm font-medium text-white/85">
                Create account peserta, hubungkan Strava, dan input monitoring harian/mingguan. Portal ini dibuat khusus modul Wellness dan tidak menyentuh MCU Corporate, CAPASKA, atau Vaksinasi.
              </p>
            </div>
            <div className="rounded-3xl bg-white/15 p-4 text-sm font-bold backdrop-blur">
              <div>Akun aktif</div>
              <div className="text-xl">{activeAccount?.name || "Belum ada"}</div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-black">Create Account</h2>
                <p className="text-sm text-slate-500">MVP lokal untuk akun peserta wellness. Integrasi database bisa ditambahkan setelah skema Wellness disetujui.</p>
              </div>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">Wellness only</span>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2"><FieldLabel>Nama peserta</FieldLabel><TextInput value={draft.name} onChange={(e) => updateDraft("name", e.target.value)} placeholder="Nama lengkap" /></div>
              <div className="space-y-2"><FieldLabel>ID/NIK karyawan</FieldLabel><TextInput value={draft.employeeId} onChange={(e) => updateDraft("employeeId", e.target.value)} placeholder="ID peserta" /></div>
              <div className="space-y-2"><FieldLabel>Email / No HP</FieldLabel><TextInput value={draft.emailOrPhone} onChange={(e) => updateDraft("emailOrPhone", e.target.value)} placeholder="email atau WhatsApp" /></div>
              <div className="space-y-2"><FieldLabel>Role portal</FieldLabel><SelectInput value={draft.role} onChange={(e) => updateDraft("role", e.target.value as AccountDraft["role"])}><option value="peserta">Peserta</option><option value="ketua_kelompok">Ketua Kelompok</option><option value="tim_medis">Tim Medis/Admin Wellness</option><option value="perusahaan">Perusahaan/HR</option></SelectInput></div>
              <div className="space-y-2"><FieldLabel>Perusahaan</FieldLabel><TextInput value={draft.company} onChange={(e) => updateDraft("company", e.target.value)} placeholder="Nama perusahaan" /></div>
              <div className="space-y-2"><FieldLabel>Departemen</FieldLabel><TextInput value={draft.department} onChange={(e) => updateDraft("department", e.target.value)} placeholder="Departemen/lokasi" /></div>
              <div className="space-y-2"><FieldLabel>Kelompok wellness</FieldLabel><TextInput value={draft.groupName} onChange={(e) => updateDraft("groupName", e.target.value)} placeholder="Kelompok 1 / 2 / dst" /></div>
              <div className="space-y-2"><FieldLabel>Tinggi badan (cm)</FieldLabel><TextInput type="number" value={draft.heightCm} onChange={(e) => updateDraft("heightCm", e.target.value)} placeholder="170" /></div>
            </div>

            <div className="mt-5 rounded-3xl bg-slate-50 p-4">
              <div className="mb-3 text-sm font-black">Baseline MCU awal</div>
              <div className="grid gap-4 md:grid-cols-3">
                <TextInput type="number" value={draft.baselineWeightKg} onChange={(e) => updateDraft("baselineWeightKg", e.target.value)} placeholder="BB awal kg" />
                <TextInput type="number" value={draft.baselineWaistCm} onChange={(e) => updateDraft("baselineWaistCm", e.target.value)} placeholder="Lingkar perut cm" />
                <TextInput type="number" value={draft.baselineHba1c} onChange={(e) => updateDraft("baselineHba1c", e.target.value)} placeholder="HbA1c awal" />
                <TextInput type="number" value={draft.baselineGlucose} onChange={(e) => updateDraft("baselineGlucose", e.target.value)} placeholder="Gula darah" />
                <TextInput type="number" value={draft.baselineSbp} onChange={(e) => updateDraft("baselineSbp", e.target.value)} placeholder="SBP" />
                <TextInput type="number" value={draft.baselineDbp} onChange={(e) => updateDraft("baselineDbp", e.target.value)} placeholder="DBP" />
              </div>
            </div>

            <button onClick={createAccount} className="mt-5 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-slate-800">Buat Akun Wellness</button>
          </div>

          <div className="space-y-6">
            <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-black">Login / Pilih Akun</h2>
              <div className="mt-4 space-y-2">
                <FieldLabel>Akun wellness lokal</FieldLabel>
                <SelectInput value={activeId} onChange={(e) => { setActiveId(e.target.value); window.localStorage.setItem(ACTIVE_KEY, e.target.value); }}>
                  <option value="">Pilih akun</option>
                  {accounts.map((account) => <option key={account.id} value={account.id}>{account.name} - {account.employeeId}</option>)}
                </SelectInput>
              </div>
              <div className="mt-4 rounded-3xl bg-slate-50 p-4 text-sm text-slate-600">{message}</div>
            </div>

            <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-black">Connect Strava</h2>
                  <p className="text-sm text-slate-500">Aktivitas fisik dapat disiapkan via OAuth Strava.</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-black ${activeAccount?.stravaConnected ? "bg-orange-50 text-orange-700" : "bg-slate-100 text-slate-500"}`}>{activeAccount?.stravaConnected ? "Connected" : "Not connected"}</span>
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <a href={activeAccount ? `/api/wellness/strava/connect?participantId=${encodeURIComponent(activeAccount.id)}` : "#"} onClick={(e) => { if (!activeAccount) { e.preventDefault(); setMessage("Buat atau pilih akun dulu sebelum connect Strava."); } }} className="rounded-2xl bg-orange-600 px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-orange-700">Connect Strava</a>
                <button onClick={connectDemoStrava} className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-50">Demo Connected</button>
              </div>
              <p className="mt-3 text-xs text-slate-500">OAuth asli membutuhkan STRAVA_CLIENT_ID. Penyimpanan refresh token permanen butuh tabel khusus Wellness/Strava pada fase berikutnya.</p>
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-black">Status Risiko Peserta</h2>
            {!activeAccount || !risk ? (
              <div className="mt-4 rounded-3xl bg-slate-50 p-5 text-sm text-slate-500">Pilih akun untuk melihat status risiko.</div>
            ) : (
              <div className="mt-4 space-y-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-3xl bg-blue-50 p-4"><div className="text-xs font-bold text-blue-500">Risiko</div><div className="text-2xl font-black text-blue-900">{risk.level}</div></div>
                  <div className="rounded-3xl bg-emerald-50 p-4"><div className="text-xs font-bold text-emerald-500">BMI</div><div className="text-2xl font-black text-emerald-900">{latestBmi ?? "-"}</div></div>
                  <div className="rounded-3xl bg-amber-50 p-4"><div className="text-xs font-bold text-amber-600">Follow-up</div><div className="text-2xl font-black text-amber-900">{risk.followUp ? "Ya" : "Tidak"}</div></div>
                </div>
                <div className="rounded-3xl border border-slate-100 p-4">
                  <div className="text-sm font-black">{risk.group}</div>
                  <ul className="mt-2 list-inside list-disc text-sm text-slate-600">
                    {risk.reasons.map((reason) => <li key={reason}>{reason}</li>)}
                  </ul>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-black">Input Monitoring</h2>
            <p className="text-sm text-slate-500">Form peserta untuk berat badan, tensi, gula darah, aktivitas, makan, keluhan, dan bukti upload.</p>
            <div className="mt-5 grid gap-4 md:grid-cols-3">
              <div className="space-y-2"><FieldLabel>Tanggal</FieldLabel><TextInput type="date" value={logDraft.date} onChange={(e) => updateLog("date", e.target.value)} /></div>
              <div className="space-y-2"><FieldLabel>Berat badan</FieldLabel><TextInput type="number" value={logDraft.weightKg} onChange={(e) => updateLog("weightKg", e.target.value)} placeholder="kg" /></div>
              <div className="space-y-2"><FieldLabel>Lingkar perut</FieldLabel><TextInput type="number" value={logDraft.waistCm} onChange={(e) => updateLog("waistCm", e.target.value)} placeholder="cm" /></div>
              <div className="space-y-2"><FieldLabel>SBP</FieldLabel><TextInput type="number" value={logDraft.sbp} onChange={(e) => updateLog("sbp", e.target.value)} placeholder="sistolik" /></div>
              <div className="space-y-2"><FieldLabel>DBP</FieldLabel><TextInput type="number" value={logDraft.dbp} onChange={(e) => updateLog("dbp", e.target.value)} placeholder="diastolik" /></div>
              <div className="space-y-2"><FieldLabel>Gula darah</FieldLabel><TextInput type="number" value={logDraft.glucose} onChange={(e) => updateLog("glucose", e.target.value)} placeholder="mg/dL" /></div>
              <div className="space-y-2"><FieldLabel>HbA1c</FieldLabel><TextInput type="number" value={logDraft.hba1c} onChange={(e) => updateLog("hba1c", e.target.value)} placeholder="%" /></div>
              <div className="space-y-2"><FieldLabel>Aktivitas</FieldLabel><TextInput type="number" value={logDraft.activityMinutes} onChange={(e) => updateLog("activityMinutes", e.target.value)} placeholder="menit" /></div>
              <div className="space-y-2"><FieldLabel>Steps</FieldLabel><TextInput type="number" value={logDraft.steps} onChange={(e) => updateLog("steps", e.target.value)} placeholder="langkah" /></div>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="space-y-2"><FieldLabel>Pola makan singkat</FieldLabel><TextArea value={logDraft.mealNote} onChange={(e) => updateLog("mealNote", e.target.value)} placeholder="Contoh: nasi merah, ayam, sayur, tidak minum manis" /></div>
              <div className="space-y-2"><FieldLabel>Keluhan / obat</FieldLabel><TextArea value={[logDraft.symptoms, logDraft.medicationNote].filter(Boolean).join("\n")} onChange={(e) => { const [symptoms, ...rest] = e.target.value.split("\n"); updateLog("symptoms", symptoms || ""); updateLog("medicationNote", rest.join("\n")); }} placeholder="Keluhan, obat yang dikonsumsi, catatan pribadi" /></div>
              <div className="space-y-2"><FieldLabel>URL foto tensi</FieldLabel><TextInput value={logDraft.bpPhotoUrl} onChange={(e) => updateLog("bpPhotoUrl", e.target.value)} placeholder="opsional" /></div>
              <div className="space-y-2"><FieldLabel>URL lab ulang</FieldLabel><TextInput value={logDraft.labFileUrl} onChange={(e) => updateLog("labFileUrl", e.target.value)} placeholder="opsional" /></div>
            </div>
            <button onClick={saveLog} className="mt-5 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-blue-700">Simpan Monitoring</button>
          </div>
        </section>

        <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-black">Riwayat Monitoring</h2>
              <p className="text-sm text-slate-500">Data tersimpan lokal untuk MVP portal wellness.</p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">{accountLogs.length} log</span>
          </div>
          <div className="mt-5 overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-y-2 text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-2">Tanggal</th><th className="px-3 py-2">BB</th><th className="px-3 py-2">Tensi</th><th className="px-3 py-2">Gula/HbA1c</th><th className="px-3 py-2">Aktivitas</th><th className="px-3 py-2">Catatan</th></tr></thead>
              <tbody>
                {accountLogs.length === 0 ? (
                  <tr><td colSpan={6} className="rounded-2xl bg-slate-50 px-3 py-6 text-center text-slate-500">Belum ada input monitoring.</td></tr>
                ) : accountLogs.map((item) => (
                  <tr key={item.id} className="bg-slate-50">
                    <td className="rounded-l-2xl px-3 py-3 font-bold">{item.date}</td>
                    <td className="px-3 py-3">{item.weightKg ?? "-"} kg<br /><span className="text-xs text-slate-500">LP {item.waistCm ?? "-"} cm</span></td>
                    <td className="px-3 py-3">{item.sbp ?? "-"}/{item.dbp ?? "-"}</td>
                    <td className="px-3 py-3">GD {item.glucose ?? "-"}<br /><span className="text-xs text-slate-500">HbA1c {item.hba1c ?? "-"}</span></td>
                    <td className="px-3 py-3">{item.activityMinutes ?? "-"} menit<br /><span className="text-xs text-slate-500">{item.steps ?? "-"} steps</span></td>
                    <td className="rounded-r-2xl px-3 py-3 text-slate-600">{item.mealNote || item.symptoms || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
