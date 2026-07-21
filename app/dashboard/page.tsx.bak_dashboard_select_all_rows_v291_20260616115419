"use client";

import { useEffect, useMemo, useState } from "react";
import AuthGate from "@/components/AuthGate";

type ModuleKey = "mcu_capaska" | "mcu_corporate" | "vaccination" | "wellness";

const MODULES: Array<{
  key: ModuleKey;
  title: string;
  subtitle: string;
  accent: string;
}> = [
  {
    key: "mcu_capaska",
    title: "MCU CAPASKA",
    subtitle: "Progress, kelulusan, dan pemeriksaan CAPASKA.",
    accent: "from-blue-600 to-indigo-700",
  },
  {
    key: "mcu_corporate",
    title: "MCU Corporate",
    subtitle: "Progress dan hasil medical check-up corporate.",
    accent: "from-slate-700 to-slate-950",
  },
  {
    key: "vaccination",
    title: "Vaksinasi Perusahaan",
    subtitle: "Vaksin, antrian, administered, dokter, dan export.",
    accent: "from-emerald-600 to-teal-700",
  },
  {
    key: "wellness",
    title: "Wellness",
    subtitle: "Pemantauan berat badan, makanan, aktivitas, BMI, dan Strava optional.",
    accent: "from-fuchsia-600 via-rose-600 to-orange-500",
  },
];

const VACCINATION_STATUS = [
  { value: "all", label: "Semua" },
  { value: "done", label: "Sudah" },
  { value: "not_done", label: "Belum" },
  { value: "no_queue", label: "Belum Rilis Antrian" },
  { value: "waiting", label: "Sudah Antrian Belum Selesai" },
];

type SortDirection = "asc" | "desc";

type SortConfig = {
  key: string;
  direction: SortDirection;
};

function SortIcon({ active, direction }: { active: boolean; direction: SortDirection }) {
  return (
    <svg
      aria-hidden="true"
      className={`h-3.5 w-3.5 shrink-0 ${active ? "text-blue-700" : "text-slate-400 group-hover:text-slate-600"}`}
      viewBox="0 0 12 12"
      fill="none"
    >
      {!active ? (
        <>
          <path d="M6 1.8 2.8 5.1h6.4L6 1.8Z" fill="currentColor" opacity="0.75" />
          <path d="M6 10.2 2.8 6.9h6.4L6 10.2Z" fill="currentColor" opacity="0.75" />
        </>
      ) : direction === "asc" ? (
        <path d="M6 1.8 2.8 5.8h6.4L6 1.8Z" fill="currentColor" />
      ) : (
        <path d="M6 10.2 2.8 6.2h6.4L6 10.2Z" fill="currentColor" />
      )}
    </svg>
  );
}

function SortHeader({
  label,
  sortKey,
  sortConfig,
  onSort,
}: {
  label: string;
  sortKey: string;
  sortConfig: SortConfig;
  onSort: (key: string) => void;
}) {
  const active = sortConfig.key === sortKey;

  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={`group inline-flex items-center gap-1.5 rounded-lg px-1 py-0.5 text-left font-black uppercase tracking-wide transition hover:bg-white hover:text-slate-900 ${
        active ? "text-blue-700" : "text-slate-500"
      }`}
      title={`Urutkan berdasarkan ${label}`}
    >
      <span>{label}</span>
      <SortIcon active={active} direction={sortConfig.direction} />
    </button>
  );
}

function getSortValue(row: any, key: string, isVaccination: boolean) {
  if (isVaccination) {
    if (key === "mcu_or_id") return row.mcu_id || row.employee_id || "";
    if (key === "company") return row.company_name || row.session?.company_name || "";
    return row[key];
  }

  if (key === "mcu_or_id") return row.mcu_id || row.external_id || "";
  if (key === "progress_percent") return Number(row.progress_percent || 0);
  if (key === "total_score") return row.total_score === null || row.total_score === undefined ? null : Number(row.total_score);
  return row[key];
}

function compareSortValues(a: any, b: any, sortConfig: SortConfig, isVaccination: boolean) {
  const direction = sortConfig.direction === "asc" ? 1 : -1;
  const aValue = getSortValue(a, sortConfig.key, isVaccination);
  const bValue = getSortValue(b, sortConfig.key, isVaccination);

  const aEmpty = aValue === null || aValue === undefined || String(aValue).trim() === "" || String(aValue).trim() === "-";
  const bEmpty = bValue === null || bValue === undefined || String(bValue).trim() === "" || String(bValue).trim() === "-";

  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;

  const aNumber = typeof aValue === "number" ? aValue : Number(String(aValue).replace(/[^0-9.-]/g, ""));
  const bNumber = typeof bValue === "number" ? bValue : Number(String(bValue).replace(/[^0-9.-]/g, ""));
  const numericKeys = ["queue_number", "total_score", "progress_percent", "done_stage", "total_stage", "initial_weight_kg", "current_weight_kg", "weight_delta_kg", "bmi", "calories_today"];

  if (numericKeys.includes(sortConfig.key) && Number.isFinite(aNumber) && Number.isFinite(bNumber)) {
    return (aNumber - bNumber) * direction;
  }

  return String(aValue).localeCompare(String(bValue), "id-ID", { numeric: true, sensitivity: "base" }) * direction;
}

export default function DashboardPage() {
  return (
    <AuthGate>
      {(user) => <Dashboard user={user as unknown as Record<string, unknown>} />}
    </AuthGate>
  );
}

function valueOf(rawUser: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = rawUser[key];
    if (value !== undefined && value !== null && String(value).trim()) {
      return String(value);
    }
  }

  return "";
}

function getRole(rawUser: Record<string, unknown>) {
  return valueOf(rawUser, ["role", "role_name", "user_role"]).toLowerCase();
}

function getProgram(rawUser: Record<string, unknown>) {
  return valueOf(rawUser, ["program_type", "program", "program_status"]).toLowerCase();
}

function getPost(rawUser: Record<string, unknown>) {
  return valueOf(rawUser, ["post", "post_name", "post_label", "assigned_post", "station", "parameter"]).toLowerCase();
}

function getUsername(rawUser: Record<string, unknown>) {
  return valueOf(rawUser, ["username", "email", "name"]).toLowerCase();
}

function getOperatorFormRoute(rawUser: Record<string, unknown>) {
  const program = getProgram(rawUser);
  const post = getPost(rawUser);
  const username = getUsername(rawUser);

  if (post.includes("registrasi")) {
    return "/registrasi-ulang";
  }

  const corporateTokens = [
    "corporate",
    "corp",
    "antropometri",
    "vital",
    "laboratorium",
    "lab",
    "ekg",
    "audiometri",
    "spirometri",
    "treadmill",
  ];

  const isCorporate =
    program.includes("corporate") ||
    corporateTokens.some((token) => post.includes(token) || username.includes(token));

  return isCorporate ? "/input-corporate" : "/input";
}

function getOperatorFormLabel(rawUser: Record<string, unknown>) {
  const post = getPost(rawUser);
  const program = getProgram(rawUser);

  if (post.includes("registrasi")) return "Registrasi Ulang";
  if (program.includes("corporate")) return "Form Corporate";

  return "Form CAPASKA";
}

function MetricCard({
  label,
  value,
  tone = "slate",
  onClick,
  active,
}: {
  label: string;
  value: any;
  tone?: "slate" | "blue" | "emerald" | "amber" | "red" | "indigo";
  onClick?: () => void;
  active?: boolean;
}) {
  const toneClass = {
    slate: active ? "border-slate-700 bg-slate-800 text-white" : "border-slate-200 bg-white text-slate-900",
    blue: active ? "border-blue-600 bg-blue-600 text-white" : "border-blue-100 bg-blue-50 text-blue-900",
    emerald: active ? "border-emerald-600 bg-emerald-600 text-white" : "border-emerald-100 bg-emerald-50 text-emerald-900",
    amber: active ? "border-amber-500 bg-amber-500 text-white" : "border-amber-100 bg-amber-50 text-amber-900",
    red: active ? "border-red-600 bg-red-600 text-white" : "border-red-100 bg-red-50 text-red-900",
    indigo: active ? "border-indigo-600 bg-indigo-600 text-white" : "border-indigo-100 bg-indigo-50 text-indigo-900",
  }[tone];

  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-3xl border p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${toneClass}`}
    >
      <div className="text-xs font-black uppercase tracking-wide opacity-70">{label}</div>
      <div className="mt-2 text-3xl font-black">{value ?? 0}</div>
    </button>
  );
}

function StatusPill({ children, tone = "slate" }: { children: any; tone?: "slate" | "blue" | "emerald" | "amber" | "red" }) {
  const cls = {
    slate: "bg-slate-100 text-slate-700",
    blue: "bg-blue-100 text-blue-700",
    emerald: "bg-emerald-100 text-emerald-700",
    amber: "bg-amber-100 text-amber-800",
    red: "bg-red-100 text-red-700",
  }[tone];

  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-black ${cls}`}>{children}</span>;
}

function buildCapaskaAdminFormUrl(row: any, stage: any) {
  const params = new URLSearchParams();
  params.set("participant_id", String(row.participant_id || ""));
  params.set("post_id", String(stage.post_id || ""));
  params.set("post_name", String(stage.post_name || ""));
  params.set("admin_help", "1");
  return `/input?${params.toString()}`;
}

function CapaskaParticipantDetailModal({ row, onClose }: { row: any; onClose: () => void }) {
  if (!row) return null;

  const stages = Array.isArray(row.stages) ? row.stages : [];
  const domainScores = row.capaska_domain_scores || {};
  const redFlags = Array.isArray(row.capaska_red_flags) ? row.capaska_red_flags : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-[2rem] bg-white shadow-2xl">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-5 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-2xl font-black text-slate-950">{row.name}</div>
            <div className="mt-1 text-sm font-semibold text-slate-500">
              {row.mcu_id || row.external_id || "-"} · {row.source_name || "-"} · {row.package_name || "-"}
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 hover:bg-slate-50">
            Tutup
          </button>
        </div>

        <div className="max-h-[calc(90vh-90px)] overflow-auto p-5">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="text-xs font-black uppercase tracking-wide text-slate-400">Progress</div>
              <div className="mt-2 text-2xl font-black text-slate-950">{row.done_stage}/{row.total_stage}</div>
              <div className="text-sm font-bold text-slate-500">{row.progress_percent}%</div>
            </div>
            <div className="rounded-2xl bg-blue-50 p-4">
              <div className="text-xs font-black uppercase tracking-wide text-blue-400">Total Score</div>
              <div className="mt-2 text-2xl font-black text-blue-950">{row.total_score ?? "-"}</div>
            </div>
            <div className="rounded-2xl bg-emerald-50 p-4">
              <div className="text-xs font-black uppercase tracking-wide text-emerald-500">Kelulusan</div>
              <div className="mt-2 text-lg font-black text-emerald-900">{row.kelulusan_status || "-"}</div>
            </div>
            <div className="rounded-2xl bg-red-50 p-4">
              <div className="text-xs font-black uppercase tracking-wide text-red-400">Red Flag</div>
              <div className="mt-2 text-2xl font-black text-red-900">{redFlags.length}</div>
            </div>
          </div>

          {!!Object.keys(domainScores).length && (
            <div className="mt-5 rounded-3xl border border-slate-200 p-4">
              <div className="text-sm font-black uppercase tracking-wide text-slate-500">Skor per Pemeriksaan</div>
              <div className="mt-3 grid gap-2 md:grid-cols-4">
                {Object.entries(domainScores).map(([name, score]) => (
                  <div key={name} className="rounded-2xl bg-slate-50 p-3">
                    <div className="text-xs font-bold text-slate-500">{name}</div>
                    <div className="text-lg font-black text-slate-950">{String(score ?? "-")}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-5 rounded-3xl border border-slate-200 p-4">
            <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <div>
                <div className="text-sm font-black uppercase tracking-wide text-slate-500">Detail Progress Stage</div>
                <div className="mt-1 text-sm font-semibold text-slate-500">
                  Admin bisa klik tombol stage untuk langsung membuka form CAPASKA peserta ini pada post tersebut.
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-3">
              {stages.map((stage: any) => (
                <div key={stage.post_id} className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <div className="font-black text-slate-950">{stage.post_name}</div>
                      <div className="mt-1 text-sm font-semibold text-slate-500">{stage.filled_parameters}/{stage.total_parameters} parameter · {stage.status_text || stage.progress_text}</div>
                      <div className="mt-2 h-2 max-w-md rounded-full bg-slate-100">
                        <div
                          className={`h-2 rounded-full ${stage.is_done ? "bg-emerald-500" : "bg-blue-600"}`}
                          style={{ width: `${stage.total_parameters ? Math.min(100, Math.round((Number(stage.filled_parameters || 0) / Number(stage.total_parameters || 1)) * 100)) : 0}%` }}
                        />
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span className={`rounded-full px-3 py-1 text-xs font-black ${stage.is_done ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                        {stage.is_done ? "Selesai" : "Belum"}
                      </span>
                      {stage.post_id ? (
                        <a
                          href={buildCapaskaAdminFormUrl(row, stage)}
                          className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-black text-white hover:bg-blue-700"
                        >
                          Buka / Edit Stage
                        </a>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {!!redFlags.length && (
            <div className="mt-5 rounded-3xl border border-red-100 bg-red-50 p-4">
              <div className="text-sm font-black uppercase tracking-wide text-red-600">Red Flag / Tidak Direkomendasikan</div>
              <div className="mt-3 grid gap-2">
                {redFlags.map((flag: any, index: number) => (
                  <div key={`${flag?.parameter || index}-${index}`} className="rounded-2xl bg-white p-3 text-sm font-bold text-red-700">
                    {String(flag?.parameter || flag?.name || "Temuan")} {flag?.value ? `· ${flag.value}` : ""} {flag?.score !== undefined ? `· skor ${flag.score}` : ""}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


// DASHBOARD_OPERATOR_CLICK_DETAIL_V269
// Read-only dashboard modal: lists participants that are done / not done for a clicked CAPASKA operator stage.
// It only filters rows already retrieved by /api/dashboard. No database writes and no scoring/save/setup changes.
function normalizeOperatorStageKeyV269(value: any) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getOperatorStageFromRowV269(row: any, item: any) {
  const stages = Array.isArray(row?.stages) ? row.stages : [];
  const itemKey = String(item?.key || "");
  const itemName = normalizeOperatorStageKeyV269(item?.name);

  return stages.find((stage: any) => {
    const stageKey = String(stage?.post_id || stage?.id || stage?.key || "");
    const stageName = normalizeOperatorStageKeyV269(stage?.post_name || stage?.name || stage?.title);
    return (itemKey && stageKey && itemKey === stageKey) || (!!itemName && stageName === itemName);
  });
}

// DASHBOARD_OPERATOR_STAFF_SORT_V277
type OperatorDetailSortKeyV277 = "name" | "mcu" | "database" | "package" | "staff" | "progress" | "status";

function getOperatorDetailSortValueV277(entry: any, key: OperatorDetailSortKeyV277) {
  const row = entry?.row || {};
  if (key === "name") return String(row.name || "");
  if (key === "mcu") return String(row.mcu_id || row.external_id || "");
  if (key === "database") return String(row.source_name || row.institution_name || "");
  if (key === "package") return String(row.package_name || "");
  if (key === "staff") return String(entry?.staffName || entry?.stage?.staff_name || "");
  if (key === "progress") return Number(entry?.percent || 0);
  if (key === "status") return entry?.done ? "Sudah" : "Belum";
  return "";
}

function compareOperatorDetailRowsV277(a: any, b: any, sortState: { key: OperatorDetailSortKeyV277; direction: "asc" | "desc" }) {
  const av = getOperatorDetailSortValueV277(a, sortState.key);
  const bv = getOperatorDetailSortValueV277(b, sortState.key);
  let result = 0;
  if (typeof av === "number" || typeof bv === "number") result = Number(av || 0) - Number(bv || 0);
  else result = String(av || "").localeCompare(String(bv || ""), "id", { sensitivity: "base", numeric: true });
  return sortState.direction === "asc" ? result : -result;
}

function SortableOperatorHeaderV277({ label, sortKey, sortState, onSort }: { label: string; sortKey: OperatorDetailSortKeyV277; sortState: { key: OperatorDetailSortKeyV277; direction: "asc" | "desc" }; onSort: (key: OperatorDetailSortKeyV277) => void }) {
  const active = sortState.key === sortKey;
  return (
    <button type="button" onClick={() => onSort(sortKey)} className="inline-flex items-center gap-1 font-black hover:text-blue-700" title={`Sort ${label}`}>
      <span>{label}</span>
      <span className="text-[10px]">{active ? (sortState.direction === "asc" ? "A-Z" : "Z-A") : "Sort"}</span>
    </button>
  );
}

function OperatorProgressDetailModalV269({ item, rows, onClose }: { item: any; rows: any[]; onClose: () => void }) {
  const [tab, setTab] = useState<"done" | "not_done">("done");
  const [sortV277, setSortV277] = useState<{ key: OperatorDetailSortKeyV277; direction: "asc" | "desc" }>({ key: "name", direction: "asc" });

  function handleOperatorDetailSortV277(key: OperatorDetailSortKeyV277) {
    setSortV277((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc",
    }));
  }

  const detailRows = useMemo(() => {
    return (Array.isArray(rows) ? rows : [])
      .map((row: any) => {
        const stage = getOperatorStageFromRowV269(row, item);
        if (!stage) return null;

        const totalParams = Number(stage?.total_parameters || 0);
        const filledParams = Number(stage?.filled_parameters || 0);
        const percent = totalParams > 0 ? Math.round((filledParams / totalParams) * 1000) / 10 : (stage?.is_done ? 100 : 0);
        const staffName = String(stage?.staff_name || stage?.doctor_name || stage?.assigned_staff_name || stage?.staff || "").trim();

        return {
          row,
          stage,
          done: !!stage?.is_done,
          percent,
          filledParams,
          totalParams,
          staffName,
        };
      })
      .filter(Boolean) as any[];
  }, [item, rows]);

  const doneRows = detailRows.filter((entry: any) => entry.done);
  const notDoneRows = detailRows.filter((entry: any) => !entry.done);
  const activeRows = [...(tab === "done" ? doneRows : notDoneRows)].sort((a: any, b: any) => compareOperatorDetailRowsV277(a, b, sortV277));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-6xl overflow-hidden rounded-[2rem] bg-white shadow-2xl">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-5 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-xs font-black uppercase tracking-wide text-blue-600">Detail Progress Operator</div>
            <div className="mt-1 text-2xl font-black text-slate-950">{item?.name || "Operator"}</div>
            <div className="mt-1 text-sm font-semibold text-slate-500">
              Data read-only dari dashboard yang sedang tampil. Tidak ada perubahan data, scoring, atau hasil input.
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 hover:bg-slate-50">
            Tutup
          </button>
        </div>

        <div className="max-h-[calc(90vh-92px)] overflow-auto p-5">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="text-xs font-black uppercase tracking-wide text-slate-400">Total Peserta</div>
              <div className="mt-1 text-3xl font-black text-slate-950">{detailRows.length}</div>
            </div>
            <button type="button" onClick={() => setTab("done")} className={`rounded-2xl p-4 text-left ${tab === "done" ? "bg-emerald-600 text-white" : "bg-emerald-50 text-emerald-900"}`}>
              <div className="text-xs font-black uppercase tracking-wide opacity-70">Sudah Selesai</div>
              <div className="mt-1 text-3xl font-black">{doneRows.length}</div>
            </button>
            <button type="button" onClick={() => setTab("not_done")} className={`rounded-2xl p-4 text-left ${tab === "not_done" ? "bg-amber-500 text-white" : "bg-amber-50 text-amber-900"}`}>
              <div className="text-xs font-black uppercase tracking-wide opacity-70">Belum Selesai</div>
              <div className="mt-1 text-3xl font-black">{notDoneRows.length}</div>
            </button>
          </div>

          <div className="mt-5 overflow-hidden rounded-3xl border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left"><SortableOperatorHeaderV277 label="Nama" sortKey="name" sortState={sortV277} onSort={handleOperatorDetailSortV277} /></th>
                  <th className="px-4 py-3 text-left"><SortableOperatorHeaderV277 label="No. MCU" sortKey="mcu" sortState={sortV277} onSort={handleOperatorDetailSortV277} /></th>
                  <th className="px-4 py-3 text-left"><SortableOperatorHeaderV277 label="Database" sortKey="database" sortState={sortV277} onSort={handleOperatorDetailSortV277} /></th>
                  <th className="px-4 py-3 text-left"><SortableOperatorHeaderV277 label="Paket" sortKey="package" sortState={sortV277} onSort={handleOperatorDetailSortV277} /></th>
                  <th className="px-4 py-3 text-left"><SortableOperatorHeaderV277 label="Dokter/Staff" sortKey="staff" sortState={sortV277} onSort={handleOperatorDetailSortV277} /></th>
                  <th className="px-4 py-3 text-left"><SortableOperatorHeaderV277 label="Progress Stage" sortKey="progress" sortState={sortV277} onSort={handleOperatorDetailSortV277} /></th>
                  <th className="px-4 py-3 text-left"><SortableOperatorHeaderV277 label="Status" sortKey="status" sortState={sortV277} onSort={handleOperatorDetailSortV277} /></th>
                  <th className="px-4 py-3 text-left">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {activeRows.length ? activeRows.map((entry: any) => {
                  const row = entry.row || {};
                  const stage = entry.stage || {};
                  return (
                    <tr key={`${row.participant_id || row.id}-${stage.post_id || item?.key}-${tab}`} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-black text-slate-900">{row.name || "-"}</td>
                      <td className="px-4 py-3 text-slate-600">{row.mcu_id || row.external_id || "-"}</td>
                      <td className="px-4 py-3 text-slate-600">{row.source_name || row.institution_name || "-"}</td>
                      <td className="px-4 py-3 text-slate-600">{row.package_name || "-"}</td>
                      <td className="px-4 py-3 font-bold text-slate-700">{entry.staffName || stage?.staff_name || "-"}</td>
                      <td className="px-4 py-3 font-bold text-slate-700">{entry.filledParams}/{entry.totalParams} - {entry.percent}%</td>
                      <td className="px-4 py-3">
                        <StatusPill tone={entry.done ? "emerald" : "amber"}>{entry.done ? "Sudah" : "Belum"}</StatusPill>
                      </td>
                      <td className="px-4 py-3">
                        {stage?.post_id ? (
                          <a href={buildCapaskaAdminFormUrl(row, stage)} className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-black text-white hover:bg-blue-700">
                            Lihat / Edit Hasil
                          </a>
                        ) : <span className="text-slate-400">-</span>}
                      </td>
                    </tr>
                  );
                }) : (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-sm font-bold text-slate-400">
                      Tidak ada peserta pada tab ini.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
function OperatorDashboard({ user }: { user: Record<string, unknown> }) {
  const formRoute = getOperatorFormRoute(user);
  const formLabel = getOperatorFormLabel(user);
  const displayName = valueOf(user, ["name", "username", "email"]) || "Operator";
  const postName = valueOf(user, ["post", "post_name", "post_label", "assigned_post", "station", "parameter"]) || "-";
  const program = valueOf(user, ["program_type", "program", "program_status"]) || "-";

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[2rem] bg-gradient-to-r from-blue-600 via-indigo-600 to-slate-950 shadow-sm">
        <div className="p-7 text-white">
          <div className="text-3xl font-black">Dashboard Operator</div>
          <div className="mt-2 max-w-3xl text-sm font-medium text-blue-100">
            Akses dibatasi sesuai akun operator. Gunakan form pemeriksaan untuk input, edit, melihat score, dan menyelesaikan peserta sesuai parameter/post kamu.
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-black uppercase tracking-wide text-slate-400">Nama</div>
          <div className="mt-2 text-xl font-black text-slate-900">{displayName}</div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-black uppercase tracking-wide text-slate-400">Post / Parameter</div>
          <div className="mt-2 text-xl font-black text-slate-900">{postName}</div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-black uppercase tracking-wide text-slate-400">Program</div>
          <div className="mt-2 text-xl font-black text-slate-900">{program}</div>
        </div>
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-2xl font-black text-slate-900">{formLabel}</div>
            <div className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-slate-500">
              Halaman form lama tetap dipakai, jadi fitur cari peserta, edit hasil, lihat score, status belum/selesai, dan QR tetap berada di halaman tersebut.
            </div>
          </div>

          <a
            href={formRoute}
            className="inline-flex items-center justify-center rounded-2xl bg-blue-600 px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-blue-700"
          >
            Buka {formLabel}
          </a>
        </div>
      </section>
    </div>
  );
}

function Dashboard({ user }: { user: Record<string, unknown> }) {
  const role = getRole(user);

  if (role === "operator") {
    return <OperatorDashboard user={user} />;
  }

  return <AdminDashboard />;
}

function AdminDashboard() {
  const [moduleKey, setModuleKey] = useState<ModuleKey>("mcu_corporate");
  const [sources, setSources] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [sourceId, setSourceId] = useState("all");
  const [sessionId, setSessionId] = useState("");
  const [vaccStatus, setVaccStatus] = useState("all");
  const [mcuStatus, setMcuStatus] = useState("Semua");
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: "name", direction: "asc" });
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [summary, setSummary] = useState<any>({});
  const [rows, setRows] = useState<any[]>([]);
  const [selectedMcuRow, setSelectedMcuRow] = useState<any>(null);
  const [selectedOperatorProgressV269, setSelectedOperatorProgressV269] = useState<any>(null); // DASHBOARD_OPERATOR_CLICK_DETAIL_V269
  // DASHBOARD_RESET_SELECTED_RESULTS_V221
  const [selectedMcuIds, setSelectedMcuIds] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState("Pilih modul dan database, lalu klik Tampilkan Dashboard.");

  const activeModule = MODULES.find((m) => m.key === moduleKey) || MODULES[0];
  const isVaccination = moduleKey === "vaccination";
  const isWellness = moduleKey === "wellness";
  const mcuProgram = moduleKey === "mcu_capaska" ? "capaska" : "corporate";

  async function loadOptions(nextModule = moduleKey) {
    setRows([]);
    setSelectedMcuRow(null);
    setSummary({});
    setLoaded(false);
    setSearch("");

    if (nextModule === "wellness") {
      setSourceId("");
      setSessionId("");
      setSources([]);
      setSessions([]);
      return;
    }

    if (nextModule === "vaccination") {
      setSourceId("");
      const [sessionJson, sourceJson] = await Promise.all([
        fetch("/api/vaccination/sessions", { cache: "no-store" }).then((r) => r.json()).catch(() => ({})),
        fetch("/api/sources?program=corporate", { cache: "no-store" }).then((r) => r.json()).catch(() => ({})),
      ]);

      setSessions(sessionJson.sessions || []);
      setSources(sourceJson.sources || []);

      if (sessionJson.sessions?.[0]?.id) {
        setSessionId(String(sessionJson.sessions[0].id));
      }
      return;
    }

    setSessionId("");
    setSourceId("all");
    const json = await fetch(`/api/sources?program=${nextModule === "mcu_capaska" ? "capaska" : "corporate"}`, { cache: "no-store" })
      .then((r) => r.json())
      .catch(() => ({}));
    setSources(json.sources || []);
  }

  async function loadDashboard(nextMcuStatus = mcuStatus) {
    setLoading(true);
    setMessage("Memuat dashboard...");

    try {
      if (isWellness) {
        const json = await fetch("/api/wellness/dashboard", { cache: "no-store" }).then((r) => r.json());

        if (!json.ok) {
          setMessage(json.message || "Gagal memuat dashboard Wellness.");
          setRows([]);
          setSummary({});
          setLoaded(true);
          return;
        }

        setSummary(json.summary || {});
        setRows(json.rows || []);
        setMessage("Dashboard Wellness berhasil dimuat.");
        setLoaded(true);
        return;
      }

      if (isVaccination) {
        const params = new URLSearchParams();
        params.set("status", vaccStatus);
        if (sessionId) params.set("session_id", sessionId);
        if (sourceId && sourceId !== "all") params.set("source_id", sourceId);

        const json = await fetch(`/api/vaccination/dashboard?${params.toString()}`, { cache: "no-store" }).then((r) => r.json());

        if (!json.ok) {
          setMessage(json.message || "Gagal memuat dashboard vaksinasi.");
          setRows([]);
          setSummary({});
          setLoaded(true);
          return;
        }

        setSummary(json.summary || {});
        setRows(json.rows || []);
        setMessage("Dashboard vaksinasi berhasil dimuat.");
        setLoaded(true);
        return;
      }

      const params = new URLSearchParams({
        program: mcuProgram,
        source_id: sourceId || "all",
        status: nextMcuStatus,
        limit: "1000",
      });

      const json = await fetch(`/api/dashboard?${params.toString()}`, { cache: "no-store" }).then((r) => r.json());

      if (!json.ok) {
        setMessage(json.message || "Gagal memuat dashboard MCU.");
        setRows([]);
        setSummary({});
        setLoaded(true);
        return;
      }

      setSummary(json.summary || {});
      setRows(json.rows || []);
      setMessage("Dashboard MCU berhasil dimuat.");
      setLoaded(true);
    } finally {
      setLoading(false);
    }
  }

  function handleMcuMetricClick(nextStatus: string) {
    setMcuStatus(nextStatus);
    setSearch("");
    loadDashboard(nextStatus);
  }

  function handleSort(key: string) {
    setSortConfig((previous) => ({
      key,
      direction: previous.key === key && previous.direction === "asc" ? "desc" : "asc",
    }));
  }

  function toggleSelectedMcuRowV221(row: any, checked: boolean) {
    const id = String(row?.participant_id || "");
    if (!id) return;

    setSelectedMcuIds((previous) => {
      const next = new Set(previous);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function resetSelectedCapaskaResultsV221() {
    const participantIds = Array.from(selectedMcuIds)
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value > 0);

    if (!participantIds.length) {
      alert("Pilih minimal satu peserta dari tabel terlebih dahulu.");
      return;
    }

    const confirmed = window.confirm(
      "Reset seluruh hasil pengisian form untuk " + participantIds.length + " peserta terpilih?\n\nYang dihapus hanya hasil input pemeriksaan dan pilihan petugas pemeriksa. Data peserta, nomor MCU, dan status label print tidak akan diubah."
    );

    if (!confirmed) return;

    setLoading(true);
    setMessage("Mereset hasil pengisian form peserta terpilih...");

    try {
      const json = await fetch("/api/results/reset-participants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participantIds }),
      }).then((response) => response.json());

      if (!json.ok) {
        alert(json.message || "Gagal reset hasil pengisian form.");
        setMessage(json.message || "Gagal reset hasil pengisian form.");
        return;
      }

      alert("Reset berhasil untuk " + (json.participantCount || participantIds.length) + " peserta.");
      setSelectedMcuIds(new Set());
      await loadDashboard();
    } catch (error: any) {
      alert(error?.message || "Gagal reset hasil pengisian form.");
      setMessage(error?.message || "Gagal reset hasil pengisian form.");
    } finally {
      setLoading(false);
    }
  }

  function exportData(type: "all" | "done" | "not_done" | "active" | "progress" | "full" | "selected_full") {
    if (isWellness) {
      window.open("/api/wellness/export", "_blank");
      return;
    }

    if (isVaccination) {
      const params = new URLSearchParams();
      params.set("format", "csv");
      params.set("status", type === "active" ? vaccStatus : type);
      if (sessionId) params.set("session_id", sessionId);
      if (sourceId && sourceId !== "all") params.set("source_id", sourceId);

      window.open(`/api/vaccination/dashboard?${params.toString()}`, "_blank");
      return;
    }

    const params = new URLSearchParams({
      program: mcuProgram,
      source_id: sourceId || "all",
      // DASHBOARD_EXPORT_FULL_ALL_STATUS_V273
      // Export Semua must ignore the active dashboard status filter so the XLSX is not header-only.
      status: type === "full" ? "Semua" : mcuStatus,
      type: (type === "full" || type === "selected_full") ? "full" : "progress",
    });

    // DASHBOARD_EXPORT_SELECTED_FULL_V289
    // Export selected rows exactly as selected from the dashboard table.
    if (type === "selected_full") {
      const participantIds = Array.from(selectedMcuIds)
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value > 0);

      if (!participantIds.length) {
        alert("Pilih minimal satu peserta dari tabel terlebih dahulu.");
        return;
      }

      params.set("participant_ids", participantIds.join(","));
      params.set("selected", "1");
      params.set("limit", String(Math.max(1000, participantIds.length)));
    }
    window.open(`/api/dashboard/export?${params.toString()}`, "_blank");
  }

  useEffect(() => {
    loadOptions(moduleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moduleKey]);

  useEffect(() => {
    setSortConfig(isVaccination ? { key: "queue_number", direction: "asc" } : { key: "name", direction: "asc" });
  }, [isVaccination, isWellness]);

  const filteredRows = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    const searchedRows = keyword
      ? rows.filter((row: any) => {
          const haystack = isWellness
            ? [
                row.name,
                row.code,
                row.group_name,
                row.current_weight_kg,
                row.bmi,
                row.bmi_status,
                row.latest_weight_date,
              ]
            : isVaccination
            ? [
                row.queue_number,
                row.participant_name,
                row.mcu_id,
                row.employee_id,
                row.company_name,
                row.department,
                row.dashboard_status,
                row.vaccine_names,
                row.lot_numbers,
                row.administered_by,
              ]
            : [
                row.name,
                row.mcu_id,
                row.external_id,
                row.source_name,
                row.package_name,
                row.status_pemeriksaan,
                row.kelulusan_status,
                row.total_score,
                row.progress_percent,
              ];

          return haystack.filter(Boolean).join(" ").toLowerCase().includes(keyword);
        })
      : rows;

    return [...searchedRows].sort((a: any, b: any) => compareSortValues(a, b, sortConfig, isVaccination));
  }, [rows, search, isVaccination, isWellness, sortConfig]);

  // DASHBOARD_OPERATOR_PROGRESS_V251
  // Read-only summary for admin: percentage and completed participant count per MCU operator/stage.
  // It uses rows already returned by /api/dashboard, so it does not change saving, scoring, setup parameter, or database data.
  const mcuOperatorProgressSummaryV251 = useMemo(() => {
    if (isWellness || isVaccination || !Array.isArray(rows) || !rows.length) return [];

    type OperatorProgressItemV251 = {
      key: string;
      name: string;
      order: number;
      total: number;
      done: number;
      progressSum: number;
    };

    const summaryMap = new Map<string, OperatorProgressItemV251>();
    let orderCounter = 0;

    rows.forEach((row: any) => {
      const stages = Array.isArray(row?.stages) ? row.stages : [];

      stages.forEach((stage: any) => {
        const name = String(stage?.post_name || stage?.name || stage?.title || "").trim();
        if (!name) return;

        const normalizedName = name.toLowerCase();
        if (normalizedName.includes("registrasi")) return;

        const key = String(stage?.post_id || name);
        let item = summaryMap.get(key);
        if (!item) {
          item = { key, name, order: orderCounter++, total: 0, done: 0, progressSum: 0 };
          summaryMap.set(key, item);
        }

        const totalParams = Number(stage?.total_parameters || 0);
        const filledParams = Number(stage?.filled_parameters || 0);
        const stagePercent = totalParams > 0
          ? Math.min(100, Math.round((filledParams / totalParams) * 1000) / 10)
          : (stage?.is_done ? 100 : 0);

        item.total += 1;
        item.done += stage?.is_done ? 1 : 0;
        item.progressSum += Number.isFinite(stagePercent) ? stagePercent : 0;
      });
    });

    return Array.from(summaryMap.values())
      .map((item) => ({
        ...item,
        percent: item.total ? Math.round((item.done / item.total) * 1000) / 10 : 0,
        avgProgress: item.total ? Math.round((item.progressSum / item.total) * 10) / 10 : 0,
      }))
      .sort((a, b) => a.order - b.order);
  }, [isVaccination, isWellness, rows]);
  const canClickMcuMetric = !isWellness && mcuProgram === "capaska";

  return (
    <div className="space-y-6">
      {selectedMcuRow && <CapaskaParticipantDetailModal row={selectedMcuRow} onClose={() => setSelectedMcuRow(null)} />}
      {selectedOperatorProgressV269 && (
        <OperatorProgressDetailModalV269
          item={selectedOperatorProgressV269}
          rows={rows}
          onClose={() => setSelectedOperatorProgressV269(null)}
        />
      )}

      <section className={`overflow-hidden rounded-[2rem] bg-gradient-to-r ${activeModule.accent} shadow-sm`}>
        <div className="p-7 text-white">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-3xl font-black">Dashboard Operasional</div>
              <div className="mt-2 max-w-3xl text-sm font-medium opacity-90">
                Pilih layanan yang ingin ditampilkan, pilih database/session, lalu retrieve dashboard card dan tabel.
              </div>
            </div>

            <div className="rounded-2xl bg-white/15 px-4 py-3 text-sm font-black backdrop-blur">
              {activeModule.title}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-4">
        {MODULES.map((item) => (
          <button
            type="button"
            key={item.key}
            onClick={() => {
              setModuleKey(item.key);
              setMessage(`Modul ${item.title} dipilih. Pilih database/session lalu tampilkan dashboard.`);
            }}
            className={`rounded-3xl border p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
              moduleKey === item.key
                ? "border-blue-500 bg-blue-600 text-white"
                : "border-slate-200 bg-white text-slate-900 hover:border-blue-200"
            }`}
          >
            <div className="text-lg font-black">{item.title}</div>
            <div className={`mt-2 text-sm leading-6 ${moduleKey === item.key ? "text-blue-50" : "text-slate-500"}`}>
              {item.subtitle}
            </div>
          </button>
        ))}
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[220px_1fr_1fr_auto]">
          <select
            className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            value={moduleKey}
            onChange={(e) => setModuleKey(e.target.value as ModuleKey)}
          >
            {MODULES.map((item) => (
              <option key={item.key} value={item.key}>
                {item.title}
              </option>
            ))}
          </select>

          {isWellness ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-black text-rose-700">
              Data Wellness semua peserta sesuai akses akun
            </div>
          ) : isVaccination ? (
            <select
              className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
            >
              <option value="">Semua Session Vaksinasi</option>
              {sessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {session.session_name} - {session.company_name || "-"}
                </option>
              ))}
            </select>
          ) : (
            <select
              className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              value={sourceId}
              onChange={(e) => setSourceId(e.target.value)}
            >
              <option value="all">Semua Database</option>
              {sources.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.name} - {source.institution_name || "-"}
                </option>
              ))}
            </select>
          )}

          {isWellness ? (
            <div className="flex flex-wrap gap-2">
              <a href="/wellness/input" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-black text-rose-700">Input Harian</a>
              <a href="/wellness/master" className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700">Master</a>
            </div>
          ) : isVaccination ? (
            <select
              className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              value={vaccStatus}
              onChange={(e) => setVaccStatus(e.target.value)}
            >
              {VACCINATION_STATUS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          ) : (
            <select
              className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              value={mcuStatus}
              onChange={(e) => setMcuStatus(e.target.value)}
            >
              <option value="Semua">Semua</option>
              <option value="Belum Selesai">Belum Selesai</option>
              <option value="Selesai">Selesai</option>
              <option value="Lulus">Lulus</option>
              <option value="Tidak Lulus">Tidak Lulus</option>
              <option value="Belum Dinilai">Belum Dinilai</option>
            </select>
          )}

          <button
            type="button"
            onClick={() => loadDashboard()}
            disabled={loading}
            className="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60"
          >
            {loading ? "Memuat..." : "Tampilkan Dashboard"}
          </button>
        </div>

        <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600">
          {message}
        </div>
      </section>

      {loaded ? (
        <>
          {isWellness ? (
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <MetricCard label="Peserta" value={summary.total} tone="slate" />
              <MetricCard label="Rata-rata BMI" value={summary.avg_bmi} tone="blue" />
              <MetricCard label="Kalori Makanan Hari Ini" value={summary.total_food_calories_today} tone="amber" />
              <MetricCard label="Kalori Aktivitas Hari Ini" value={summary.total_activity_calories_today} tone="emerald" />
              <MetricCard label="Aktif" value={summary.active} tone="indigo" />
            </section>
          ) : isVaccination ? (
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <MetricCard label="Total" value={summary.total} tone="slate" onClick={() => setVaccStatus("all")} active={vaccStatus === "all"} />
              <MetricCard label="Sudah" value={summary.done} tone="emerald" onClick={() => setVaccStatus("done")} active={vaccStatus === "done"} />
              <MetricCard label="Belum" value={summary.not_done} tone="amber" onClick={() => setVaccStatus("not_done")} active={vaccStatus === "not_done"} />
              <MetricCard label="Belum Antrian" value={summary.no_queue} tone="indigo" onClick={() => setVaccStatus("no_queue")} active={vaccStatus === "no_queue"} />
              <MetricCard label="Antri Belum Selesai" value={summary.waiting} tone="blue" onClick={() => setVaccStatus("waiting")} active={vaccStatus === "waiting"} />
            </section>
          ) : (
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
              <MetricCard
                label="Total"
                value={summary.total}
                tone="slate"
                onClick={canClickMcuMetric ? () => handleMcuMetricClick("Semua") : undefined}
                active={canClickMcuMetric && mcuStatus === "Semua"}
              />
              <MetricCard
                label="Belum Selesai"
                value={summary.belum_selesai}
                tone="amber"
                onClick={canClickMcuMetric ? () => handleMcuMetricClick("Belum Selesai") : undefined}
                active={canClickMcuMetric && mcuStatus === "Belum Selesai"}
              />
              <MetricCard
                label="Selesai"
                value={summary.selesai}
                tone="blue"
                onClick={canClickMcuMetric ? () => handleMcuMetricClick("Selesai") : undefined}
                active={canClickMcuMetric && mcuStatus === "Selesai"}
              />
              <MetricCard
                label="Lulus"
                value={summary.lulus}
                tone="emerald"
                onClick={canClickMcuMetric ? () => handleMcuMetricClick("Lulus") : undefined}
                active={canClickMcuMetric && mcuStatus === "Lulus"}
              />
              <MetricCard
                label="Tidak Lulus"
                value={summary.tidak_lulus}
                tone="red"
                onClick={canClickMcuMetric ? () => handleMcuMetricClick("Tidak Lulus") : undefined}
                active={canClickMcuMetric && mcuStatus === "Tidak Lulus"}
              />
              <MetricCard
                label="Rata-rata"
                value={`${summary.rata_rata || 0}%`}
                tone="indigo"
                onClick={canClickMcuMetric ? () => handleMcuMetricClick("Semua") : undefined}
                active={false}
              />
            </section>
          )}
          {!isWellness && !isVaccination && mcuOperatorProgressSummaryV251.length ? (
            <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
                <div>
                  <div className="text-xl font-black text-slate-900">Progress Selesai per Operator</div>
                  <div className="text-sm font-semibold text-slate-500">
                    Menampilkan jumlah peserta selesai dan persentase selesai per stage/operator berdasarkan filter dashboard saat ini.
                  </div>
                </div>
                <div className="rounded-2xl bg-blue-50 px-4 py-2 text-xs font-black text-blue-700">
                  DASHBOARD_OPERATOR_PROGRESS_V251
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {mcuOperatorProgressSummaryV251.map((item: any) => (
                  <div
                    key={item.key}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedOperatorProgressV269(item)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") setSelectedOperatorProgressV269(item);
                    }}
                    className="rounded-3xl border border-slate-200 bg-slate-50 p-4 text-left transition hover:-translate-y-0.5 hover:border-blue-300 hover:bg-blue-50 hover:shadow-md"
                    title={`Lihat peserta sudah dan belum selesai untuk ${item.name}`}
                  >
                    <div className="text-sm font-black text-slate-900">{item.name}</div>
                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <div>
                        <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">Selesai</div>
                        <div className="text-2xl font-black text-slate-950">{item.done}/{item.total}</div>
                      </div>
                      <div>
                        <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">Persen</div>
                        <div className="text-2xl font-black text-blue-700">{item.percent}%</div>
                      </div>
                    </div>
                    <div className="mt-3 h-2 rounded-full bg-white">
                      <div className="h-2 rounded-full bg-blue-600" style={{ width: `${Math.min(100, Number(item.percent || 0))}%` }} />
                    </div>
                    <div className="mt-2 text-xs font-bold text-slate-500">Rata-rata progress input: {item.avgProgress}%</div>
                    <div className="mt-2 text-xs font-black text-blue-600">Klik untuk lihat daftar peserta</div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
          <section className="rounded-[2rem] border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-slate-200 p-5 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="text-xl font-black text-slate-900">Data {activeModule.title}</div>
                <div className="text-sm font-medium text-slate-500">{filteredRows.length} baris ditampilkan</div>
              </div>

              <div className="flex flex-wrap gap-2">
                <input
                  className="min-w-[260px] rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  placeholder="Cari nama, nomor, status..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />

                {isWellness ? (
                  <>
                    <a href="/wellness/input" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-black text-rose-700">Input Harian</a>
                    <button className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-black text-white" onClick={() => exportData("all")}>Export Wellness</button>
                  </>
                ) : isVaccination ? (
                  <>
                    <button className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-700" onClick={() => exportData("done")}>Export Sudah</button>
                    <button className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-black text-amber-700" onClick={() => exportData("not_done")}>Export Belum</button>
                    <button className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-black text-white" onClick={() => exportData("active")}>Export Filter</button>
                  </>
                ) : (
                  <>
                    {mcuProgram === "capaska" ? (
                      <button
                        type="button"
                        disabled={!selectedMcuIds.size || loading}
                        className={selectedMcuIds.size
                          ? "rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-black text-rose-700 transition hover:bg-rose-100"
                          : "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-black text-slate-400 transition"
                        }
                        onClick={resetSelectedCapaskaResultsV221}
                        title="Hapus seluruh hasil input form untuk peserta yang dipilih. Data peserta, nomor MCU, dan status label print tetap aman."
                      >
                        Reset Hasil Terpilih ({selectedMcuIds.size})
                      </button>
                    ) : null}
                    <button className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700" onClick={() => exportData("progress")}>Export Progress</button>
                    <button
                      className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-black text-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={() => exportData("selected_full")}
                      disabled={!selectedMcuIds.size}
                      title="Export hasil pemeriksaan lengkap untuk peserta yang dipilih di tabel dashboard"
                    >
                      Export Terpilih ({selectedMcuIds.size})
                    </button>
                    <button className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-700" onClick={() => exportData("full")}>Export Semua</button>
                  </>
                )}
              </div>
            </div>

            <div className="overflow-x-auto">
              {isWellness ? (
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="w-12 px-4 py-3 text-left">
                        <span className="sr-only">Pilih peserta untuk reset hasil form</span>
                      </th>
                      <th className="px-4 py-3 text-left"><SortHeader label="Nama" sortKey="name" sortConfig={sortConfig} onSort={handleSort} /></th>
                      <th className="px-4 py-3 text-left"><SortHeader label="Kelompok" sortKey="group_name" sortConfig={sortConfig} onSort={handleSort} /></th>
                      <th className="px-4 py-3 text-left"><SortHeader label="BB Awal" sortKey="initial_weight_kg" sortConfig={sortConfig} onSort={handleSort} /></th>
                      <th className="px-4 py-3 text-left"><SortHeader label="BB Kini" sortKey="current_weight_kg" sortConfig={sortConfig} onSort={handleSort} /></th>
                      <th className="px-4 py-3 text-left"><SortHeader label="Delta" sortKey="weight_delta_kg" sortConfig={sortConfig} onSort={handleSort} /></th>
                      <th className="px-4 py-3 text-left"><SortHeader label="BMI" sortKey="bmi" sortConfig={sortConfig} onSort={handleSort} /></th>
                      <th className="px-4 py-3 text-left"><SortHeader label="Kalori" sortKey="calories_today" sortConfig={sortConfig} onSort={handleSort} /></th>
                      <th className="px-4 py-3 text-left">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredRows.map((row: any) => (
                      <tr key={row.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-black text-slate-900">{row.name}<div className="text-xs font-semibold text-slate-400">{row.code || "-"}</div></td>
                        <td className="px-4 py-3 text-slate-600">{row.group_name || "-"}</td>
                        <td className="px-4 py-3 font-bold">{row.initial_weight_kg ? `${row.initial_weight_kg} kg` : "-"}</td>
                        <td className="px-4 py-3 font-bold">{row.current_weight_kg ? `${row.current_weight_kg} kg` : "-"}</td>
                        <td className={`px-4 py-3 font-black ${Number(row.weight_delta_kg || 0) <= 0 ? "text-emerald-700" : "text-rose-700"}`}>{row.weight_delta_kg !== null && row.weight_delta_kg !== undefined ? `${row.weight_delta_kg} kg` : "-"}</td>
                        <td className="px-4 py-3"><StatusPill tone="blue">{row.bmi || "-"} · {row.bmi_status || "-"}</StatusPill></td>
                        <td className="px-4 py-3 text-slate-600">Makan {row.calories_today || 0} / Aktivitas {row.activity_calories_today || 0}</td>
                        <td className="px-4 py-3"><a href="/wellness/input" className="rounded-xl bg-rose-600 px-3 py-2 text-xs font-black text-white">Input</a></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : isVaccination ? (
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3 text-left"><SortHeader label="Antrian" sortKey="queue_number" sortConfig={sortConfig} onSort={handleSort} /></th>
                      <th className="px-4 py-3 text-left"><SortHeader label="Nama" sortKey="participant_name" sortConfig={sortConfig} onSort={handleSort} /></th>
                      <th className="px-4 py-3 text-left"><SortHeader label="MCU / ID" sortKey="mcu_or_id" sortConfig={sortConfig} onSort={handleSort} /></th>
                      <th className="px-4 py-3 text-left"><SortHeader label="Perusahaan" sortKey="company" sortConfig={sortConfig} onSort={handleSort} /></th>
                      <th className="px-4 py-3 text-left"><SortHeader label="Status" sortKey="dashboard_status" sortConfig={sortConfig} onSort={handleSort} /></th>
                      <th className="px-4 py-3 text-left"><SortHeader label="Vaksin" sortKey="vaccine_names" sortConfig={sortConfig} onSort={handleSort} /></th>
                      <th className="px-4 py-3 text-left"><SortHeader label="Dokter" sortKey="administered_by" sortConfig={sortConfig} onSort={handleSort} /></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredRows.map((row: any) => (
                      <tr key={row.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-black">{row.queue_number || "-"}</td>
                        <td className="px-4 py-3 font-bold text-slate-900">{row.participant_name}</td>
                        <td className="px-4 py-3 text-slate-600">{row.mcu_id || row.employee_id || "-"}</td>
                        <td className="px-4 py-3 text-slate-600">{row.company_name || row.session?.company_name || "-"}</td>
                        <td className="px-4 py-3">
                          <StatusPill tone={row.is_done ? "emerald" : row.queue_number ? "blue" : "amber"}>
                            {row.dashboard_status}
                          </StatusPill>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{row.vaccine_names || "-"}</td>
                        <td className="px-4 py-3 text-slate-600">{row.administered_by || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3 text-left"><SortHeader label="Nama" sortKey="name" sortConfig={sortConfig} onSort={handleSort} /></th>
                      <th className="px-4 py-3 text-left"><SortHeader label="No. MCU" sortKey="mcu_or_id" sortConfig={sortConfig} onSort={handleSort} /></th>
                      <th className="px-4 py-3 text-left"><SortHeader label="Database" sortKey="source_name" sortConfig={sortConfig} onSort={handleSort} /></th>
                      <th className="px-4 py-3 text-left"><SortHeader label="Paket" sortKey="package_name" sortConfig={sortConfig} onSort={handleSort} /></th>
                      <th className="px-4 py-3 text-left"><SortHeader label="Status" sortKey="status_pemeriksaan" sortConfig={sortConfig} onSort={handleSort} /></th>
                      <th className="px-4 py-3 text-left"><SortHeader label="Kelulusan" sortKey="kelulusan_status" sortConfig={sortConfig} onSort={handleSort} /></th>
                      <th className="px-4 py-3 text-left"><SortHeader label="Score" sortKey="total_score" sortConfig={sortConfig} onSort={handleSort} /></th>
                      <th className="px-4 py-3 text-left"><SortHeader label="Progress" sortKey="progress_percent" sortConfig={sortConfig} onSort={handleSort} /></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredRows.map((row: any) => (
                      <tr
  key={`${row.participant_id}-${row.mcu_id || row.external_id}`}
  onClick={() => {
    if (mcuProgram === "capaska") setSelectedMcuRow(row);
  }}
  className={`hover:bg-slate-50 ${mcuProgram === "capaska" ? "cursor-pointer" : ""}`}
>
                        <td className="px-4 py-3">
                          {mcuProgram === "capaska" ? (
                            <input
                              type="checkbox"
                              checked={selectedMcuIds.has(String(row.participant_id || ""))}
                              onClick={(event) => event.stopPropagation()}
                              onChange={(event) => toggleSelectedMcuRowV221(row, event.currentTarget.checked)}
                              className="h-4 w-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500"
                              title="Pilih peserta ini untuk reset seluruh hasil pengisian form"
                            />
                          ) : null}
                        </td>
                        <td className="px-4 py-3 font-bold text-slate-900">
                          {mcuProgram === "capaska" ? (
                            <button
  type="button"
  onClick={(event) => {
    event.stopPropagation();
    setSelectedMcuRow(row);
  }}
  className="inline-flex items-center gap-2 text-left font-black text-blue-700 underline-offset-4 hover:underline"
  title="Lihat detail progress peserta"
>
  <span>{row.name}</span>
  <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-black text-blue-700">
    Detail
  </span>
</button>
                          ) : (
                            row.name
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-600">{row.mcu_id || row.external_id || "-"}</td>
                        <td className="px-4 py-3 text-slate-600">{row.source_name || "-"}</td>
                        <td className="px-4 py-3 text-slate-600">{row.package_name || "-"}</td>
                        <td className="px-4 py-3"><StatusPill tone={row.status_pemeriksaan === "Selesai" ? "blue" : "slate"}>{row.status_pemeriksaan}</StatusPill></td>
                        <td className="px-4 py-3"><StatusPill tone={row.kelulusan_status === "Lulus" ? "emerald" : row.kelulusan_status === "Tidak Lulus" ? "red" : "slate"}>{row.kelulusan_status}</StatusPill></td>
                        <td className="px-4 py-3 font-black">{row.total_score ?? "-"}</td>
                        <td className="px-4 py-3">
                          <div className="min-w-[140px]">
                            <div className="mb-1 text-xs font-bold text-slate-500">{row.done_stage}/{row.total_stage} - {row.progress_percent}%</div>
                            <div className="h-2 rounded-full bg-slate-100">
                              <div className="h-2 rounded-full bg-blue-600" style={{ width: `${row.progress_percent || 0}%` }} />
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {!filteredRows.length ? (
                <div className="p-8 text-center text-sm font-semibold text-slate-500">
                  Belum ada data untuk pilihan ini.
                </div>
              ) : null}
            </div>
          </section>
        </>
      ) : (
        <section className="rounded-[2rem] border border-dashed border-slate-300 bg-white p-10 text-center">
          <div className="text-xl font-black text-slate-900">Belum ada dashboard ditampilkan</div>
          <p className="mt-2 text-sm font-medium text-slate-500">
            Pilih salah satu layanan, tentukan database/session, lalu klik Tampilkan Dashboard.
          </p>
        </section>
      )}
    </div>
  );
}