"use client";

// WELLNESS_ADMIN_SUPPORT_UNREAD_NORMALIZED_V79Q
// WELLNESS_ADMIN_PARTICIPANT_DETAIL_UI_V89

import { useEffect, useMemo, useState } from "react";
import { WellnessAvatar } from "@/components/wellness/WellnessProfile";

// WELLNESS_ADMIN_MOBILE_FOUNDATION_V79B
// WELLNESS_ADMIN_RANKING_BACKEND_TRUTH_V79C
// WELLNESS_ADMIN_EXCEL_EXPORT_V79D
// WELLNESS_ADMIN_UNIFIED_WEB_MOBILE_V79E
// WELLNESS_ADMIN_CONTROL_FITNESS_UI_V79F
// Dedicated mobile-first Admin Portal. It intentionally does not reuse the
// desktop operational dashboard layout.

type View =
  | "home"
  | "companies"
  | "coaches"
  | "participants"
  | "monitoring"
  | "ranking"
  | "communication"
  | "reports"
  | "profile"
  | "menu";

function clean(value: any) {
  return String(value ?? "").trim();
}

function fmt(value: any, maximumFractionDigits = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "0";
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits }).format(
    number,
  );
}

function initials(name: any) {
  const words = clean(name).split(/\s+/).filter(Boolean);
  return (words[0]?.[0] || "A") + (words[1]?.[0] || "");
}

function profilePhotoOf(item: any) {
  return clean(
    item?.profile_photo_preview_url ||
      item?.profile_photo_url ||
      item?.photo_preview_url ||
      item?.photo_url ||
      item?.avatar_url ||
      item?.profile_picture_url ||
      item?.raw_payload?.profile_photo_preview_url ||
      item?.raw_payload?.profile_photo_url,
  );
}

function roleLabel(role: any) {
  return clean(role)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function flagOf(item: any) {
  const backendFlag = clean(item.flag).toLowerCase();
  if (["green", "yellow", "red"].includes(backendFlag)) {
    return backendFlag;
  }

  const level = clean(item.risk_level).toLowerCase();
  const compliance = clean(item.compliance_status).toLowerCase();
  if (
    level === "high" ||
    item.need_followup ||
    /tidak aktif|drop risk/.test(compliance)
  ) {
    return "red";
  }
  if (level === "medium" || !/baik/.test(compliance)) return "yellow";
  return "green";
}

function flagTone(flag: string) {
  if (flag === "green") return "border-emerald-100 bg-emerald-50 text-emerald-800";
  if (flag === "yellow") return "border-amber-100 bg-amber-50 text-amber-900";
  return "border-rose-100 bg-rose-50 text-rose-800";
}

function dailyInputLabel(value: any, lastDate?: any) {
  const days = Number(value);
  if (Number.isFinite(days) && days <= 0) return "Hari ini ✓";
  if (Number.isFinite(days) && days === 1) return "1 hari lalu";
  if (Number.isFinite(days) && days > 1 && days < 99) {
    return `${Math.floor(days)} hari lalu`;
  }
  return clean(lastDate) ? "Riwayat tersedia" : "Belum pernah input";
}

function avatarTone(index: number) {
  return [
    "from-teal-500 to-cyan-600",
    "from-violet-500 to-indigo-600",
    "from-orange-500 to-rose-500",
    "from-sky-500 to-blue-600",
  ][index % 4];
}

function fitnessSourceLabel(value: any) {
  const source = clean(value).toLowerCase().replace(/-/g, "_");
  if (source === "health_connect") return "Health Connect";
  if (source === "google_fit") return "Google Fit";
  return "Nonaktif";
}

function ToggleSwitch({
  active,
  disabled,
  onClick,
  label,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      className={`relative h-7 w-12 shrink-0 rounded-full transition ${
        active ? "bg-emerald-600" : "bg-slate-300"
      } disabled:cursor-not-allowed disabled:opacity-50`}
    >
      <span
        className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${
          active ? "left-6" : "left-1"
        }`}
      />
    </button>
  );
}

function MetricCard({
  label,
  value,
  icon,
  tone,
  onClick,
}: {
  label: string;
  value: any;
  icon: string;
  tone: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-[1.35rem] border p-3.5 text-left shadow-sm transition active:scale-[0.98] ${tone}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="text-[10px] font-black uppercase tracking-[0.1em] opacity-70">
          {label}
        </div>
        <div className="text-lg">{icon}</div>
      </div>
      <div className="mt-1 text-2xl font-black">{fmt(value)}</div>
    </button>
  );
}

function EmptyState({ icon, title, text }: any) {
  return (
    <div className="rounded-[1.5rem] border border-dashed border-slate-200 bg-white px-5 py-12 text-center">
      <div className="text-4xl">{icon}</div>
      <div className="mt-3 text-base font-black text-slate-950">{title}</div>
      <div className="mt-1 text-sm font-bold leading-5 text-slate-500">{text}</div>
    </div>
  );
}

export default function WellnessAdminMobilePage() {
  const [view, setView] = useState<View>("home");
  const [data, setData] = useState<any>(null);
  const [wellnessData, setWellnessData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("Memuat Portal Admin...");
  const [menuOpen, setMenuOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [sessionRequired, setSessionRequired] = useState(false);
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [query, setQuery] = useState("");
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null);
  const [supportUnread, setSupportUnread] = useState(0);
  const [selectedParticipant, setSelectedParticipant] = useState<any>(null);
  const [participantNutritionDetail, setParticipantNutritionDetail] = useState<any>(null);
  const [participantNutritionLoading, setParticipantNutritionLoading] = useState(false);
  const [participantNutritionError, setParticipantNutritionError] = useState("");
  // WELLNESS_ADMIN_SUPPORT_BADGE_V79P
  // WELLNESS_ADMIN_SUPPORT_CONTEXT_EXACT_V79R2
  const [controlSavingId, setControlSavingId] = useState<number | null>(null);
  const [controlNotice, setControlNotice] = useState("");
  // WELLNESS_COMPANY_NAKES_DIRECT_LINK_V90_1
  const [nakesLinkCompany, setNakesLinkCompany] = useState<any>(null);
  const [nakesLinkCopied, setNakesLinkCopied] = useState(false);

  function companyNakesFormPath(company: any) {
    const companyId = Number(company?.id || 0);
    const params = new URLSearchParams();
    if (companyId > 0) params.set("company_id", String(companyId));
    const companyName = clean(company?.name);
    if (companyName) params.set("company_name", companyName);
    const queryString = params.toString();
    return `/wellness/nakes-input${queryString ? `?${queryString}` : ""}`;
  }

  function companyNakesFormUrl(company: any) {
    const path = companyNakesFormPath(company);
    if (typeof window === "undefined") return path;
    return `${window.location.origin}${path}`;
  }

  async function copyCompanyNakesLink() {
    if (!nakesLinkCompany) return;
    const url = companyNakesFormUrl(nakesLinkCompany);
    try {
      await navigator.clipboard.writeText(url);
      setNakesLinkCopied(true);
      window.setTimeout(() => setNakesLinkCopied(false), 2200);
    } catch {
      window.prompt("Salin Link Input NAKES:", url);
    }
  }

  function openCompanyNakesLink() {
    if (!nakesLinkCompany || typeof window === "undefined") return;
    window.open(
      companyNakesFormPath(nakesLinkCompany),
      "_blank",
      "noopener,noreferrer",
    );
  }

  async function loadSupportUnread() {
    const result = await fetch(
      "/api/wellness/support?mode=threads&status=all&limit=1&actor_context=admin",
      {
        cache: "no-store",
        credentials: "include",
        headers: { "x-wellness-actor-context": "admin" },
      },
    )
      .then((response) => response.json())
      .catch(() => null);

    if (result?.ok) {
      setSupportUnread(Math.max(0, Number(result.summary?.unread ?? result.summary?.unread_admin ?? result.summary?.unreadAdmin ?? 0)));
    }
  }

  async function load(options?: { quiet?: boolean }) {
    if (!options?.quiet) setLoading(true);

    const structureResult = await fetch("/api/wellness/admin/dashboard", {
      cache: "no-store",
      credentials: "include",
    })
      .then(async (response) => ({
        ...(await response.json().catch(() => ({}))),
        http_status: response.status,
      }))
      .catch((error) => ({
        ok: false,
        http_status: 0,
        message: error?.message || "Network error",
      }));

    if (structureResult.ok) {
      const companyList = structureResult.companies || [];

      // WELLNESS_ADMIN_RANKING_BACKEND_TRUTH_V79C
      // Source of truth Admin ranking = endpoint Portal Perusahaan yang sama.
      // Tidak ada perhitungan poin ulang di UI Admin.
      const companyDashboardResults = await Promise.all(
        companyList.map(async (company: any) => {
          const companyId = Number(company.id || 0);
          if (!companyId) {
            return {
              ok: false,
              company,
              message: "Company ID tidak valid.",
            };
          }

          return fetch(
            `/api/wellness/company/dashboard?company_id=${encodeURIComponent(
              String(companyId),
            )}&days=30`,
            {
              cache: "no-store",
              credentials: "include",
            },
          )
            .then(async (response) => ({
              ...(await response.json().catch(() => ({}))),
              http_status: response.status,
            }))
            .catch((error) => ({
              ok: false,
              company,
              message: error?.message || "Gagal memuat ranking perusahaan.",
            }));
        }),
      );

      const successfulDashboards = companyDashboardResults.filter(
        (item: any) => item?.ok && item?.company?.id,
      );
      const failedDashboards = companyDashboardResults.filter(
        (item: any) => !item?.ok,
      );

      const participantControlById = new Map<number, any>(
        (structureResult.participant_controls || []).map((item: any) => [
          Number(item.participant_id || 0),
          item,
        ]),
      );

      const rankingRows = successfulDashboards.flatMap((companyResult: any) => {
        const companyId = Number(companyResult.company?.id || 0);
        const companyName =
          clean(companyResult.company?.name) || `Perusahaan ${companyId}`;

        return (companyResult.participants || []).map((participant: any) => ({
          ...participant,
          id: Number(participant.id || participant.participant_id || 0),
          participant_id: Number(
            participant.participant_id || participant.id || 0,
          ),
          company_id: companyId,
          company_name: companyName,
          group_name:
            clean(participant.group_name) ||
            clean(participant.kelompok_name) ||
            "-",
          bmi: Number(
            participant.current?.bmi ||
              participant.bmi ||
              participant.baseline?.bmi ||
              0,
          ),
          compliance_status:
            clean(participant.flag_label) ||
            (participant.flag === "green"
              ? "Patuh"
              : participant.flag === "yellow"
                ? "Perlu dipantau"
                : "Perlu follow up"),
          need_followup: participant.flag === "red",
          risk_flags:
            participant.flag === "red"
              ? [clean(participant.flag_label) || "Perlu follow up"]
              : [],
          ranking_source: "company_dashboard",
          ranking_period_days: Number(companyResult.period?.days || 30),
          wellness_control:
            participantControlById.get(
              Number(participant.participant_id || participant.id || 0),
            ) || null,
        }));
      });

      setData(structureResult);
      setWellnessData({
        ok: successfulDashboards.length > 0 || companyList.length === 0,
        source: "company_dashboard",
        source_label: "Backend Portal Perusahaan",
        period_days: 30,
        rows: rankingRows,
        company_dashboards: successfulDashboards,
        failed_company_dashboards: failedDashboards,
        summary: {
          pending_evidence_count: 0,
          total_points: successfulDashboards.reduce(
            (sum: number, item: any) =>
              sum + Number(item.summary?.total_points || 0),
            0,
          ),
        },
      });

      setSessionRequired(false);
      setLoginError("");
      setLastLoadedAt(new Date());

      if (failedDashboards.length > 0) {
        setMessage(
          `${successfulDashboards.length} perusahaan berhasil dimuat, ${failedDashboards.length} gagal. Ranking hanya menampilkan data backend yang valid.`,
        );
      } else {
        setMessage(
          "Portal Admin aktif. Ranking tersambung ke backend Portal Perusahaan.",
        );
      }
    } else {
      const needsSession =
        Number(structureResult.http_status || 0) === 401 ||
        /session admin belum aktif|unauthorized/i.test(
          clean(structureResult.message),
        );

      if (needsSession) {
        setData(null);
        setWellnessData(null);
        setSessionRequired(true);
      }

      setMessage(structureResult.message || "Portal Admin gagal dimuat.");
    }

    if (!options?.quiet) setLoading(false);
    return structureResult;
  }

  useEffect(() => {
    void loadSupportUnread();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadSupportUnread();
    }, 8000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void loadSupportUnread();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (sessionRequired) return;

    const refreshQuietly = () => {
      if (document.visibilityState === "visible") {
        void load({ quiet: true });
      }
    };

    const intervalId = window.setInterval(refreshQuietly, 10_000);
    window.addEventListener("focus", refreshQuietly);
    document.addEventListener("visibilitychange", refreshQuietly);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshQuietly);
      document.removeEventListener("visibilitychange", refreshQuietly);
    };
  }, [sessionRequired]);

  async function loginAdmin(event: React.FormEvent) {
    event.preventDefault();
    if (!loginUsername.trim() || !loginPassword) {
      setLoginError("Username dan password wajib diisi.");
      return;
    }

    setLoginLoading(true);
    setLoginError("");

    const result = await fetch("/api/auth/login", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: loginUsername.trim(),
        password: loginPassword,
      }),
    })
      .then(async (response) => ({
        ...(await response.json().catch(() => ({}))),
        http_status: response.status,
      }))
      .catch((error) => ({
        ok: false,
        message: error?.message || "Tidak dapat terhubung ke server.",
      }));

    if (!result.ok) {
      setLoginError(result.message || "Login Admin gagal.");
      setLoginLoading(false);
      return;
    }

    const dashboardResult = await load();
    if (!dashboardResult?.ok) {
      setLoginError(
        dashboardResult?.message ||
          "Akun berhasil masuk, tetapi tidak memiliki akses Portal Admin.",
      );
    } else {
      setLoginPassword("");
    }
    setLoginLoading(false);
  }

  async function logout() {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
    }).catch(() => null);
    setMenuOpen(false);
    setSessionRequired(true);
    setData(null);
    setWellnessData(null);
    setView("home");
  }

  async function saveParticipantControl(item: any, patch: any) {
    const participantId = Number(item.participant_id || item.id || 0);
    if (!participantId) return;
    const current = item.wellness_control || {};
    setControlSavingId(participantId);
    setControlNotice(`Menyimpan kontrol ${item.name || "peserta"}...`);

    const result = await fetch("/api/wellness/admin/participant-control", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        participant_id: participantId,
        session_enabled:
          patch.session_enabled ?? current.session_enabled ?? true,
        fitness_enabled:
          patch.fitness_enabled ?? current.fitness_enabled ?? false,
        fitness_source:
          patch.fitness_source ?? current.fitness_source ?? "none",
      }),
    })
      .then((response) => response.json())
      .catch((error) => ({
        ok: false,
        message: error?.message || "Network error",
      }));

    if (result.ok) {
      const nextControl = result.control;
      setWellnessData((previous: any) => ({
        ...previous,
        rows: (previous?.rows || []).map((row: any) =>
          Number(row.participant_id || row.id || 0) === participantId
            ? { ...row, wellness_control: nextControl }
            : row,
        ),
      }));
      setData((previous: any) => ({
        ...previous,
        participant_controls: (previous?.participant_controls || []).some(
          (control: any) =>
            Number(control.participant_id || 0) === participantId,
        )
          ? (previous?.participant_controls || []).map((control: any) =>
              Number(control.participant_id || 0) === participantId
                ? nextControl
                : control,
            )
          : [...(previous?.participant_controls || []), nextControl],
      }));
      setControlNotice(result.message || "Kontrol peserta berhasil disimpan.");
    } else {
      setControlNotice(result.message || "Kontrol peserta gagal disimpan.");
    }
    setControlSavingId(null);
  }

  const rows = wellnessData?.rows || [];
  const companyDashboards = wellnessData?.company_dashboards || [];


  async function loadParticipantNutritionDetail(item: any) {
    const participantId = Number(item?.participant_id || item?.id || 0);
    if (!participantId) return;

    setParticipantNutritionLoading(true);
    setParticipantNutritionError("");
    setParticipantNutritionDetail(null);

    const result = await fetch(
      `/api/wellness/admin/participant-detail?participant_id=${encodeURIComponent(String(participantId))}&t=${Date.now()}`,
      { cache: "no-store", credentials: "include" },
    )
      .then(async (response) => ({
        ...(await response.json().catch(() => ({}))),
        http_status: response.status,
      }))
      .catch((error) => ({
        ok: false,
        message: error?.message || "Network error",
      }));

    if (result?.ok) {
      setParticipantNutritionDetail(result);
    } else {
      setParticipantNutritionError(
        result?.message || "History nutrisi belum dapat dimuat.",
      );
    }

    setParticipantNutritionLoading(false);
  }

  function closeParticipantDetail() {
    setSelectedParticipant(null);
    setParticipantNutritionDetail(null);
    setParticipantNutritionError("");
    setParticipantNutritionLoading(false);
  }

  function openParticipantDetail(item: any) {
    const participantId = Number(item?.participant_id || item?.id || 0);
    const participantCode = clean(item?.code).toLowerCase();
    const latestRow = rows.find((row: any) => {
      const rowId = Number(row?.participant_id || row?.id || 0);
      if (participantId > 0 && rowId === participantId) return true;
      return Boolean(
        participantCode && clean(row?.code).toLowerCase() === participantCode,
      );
    });

    const selected = { ...item, ...(latestRow || {}) };
    setMenuOpen(false);
    setNotificationOpen(false);
    setSelectedParticipant(selected);
    void loadParticipantNutritionDetail(selected);
  }
  const companies = data?.companies || [];
  const coaches = data?.coaches || [];
  const groups = data?.groups || [];
  const summary = data?.summary || {};
  const admin = data?.admin || {};

  const flags = useMemo(() => {
    const result = { green: 0, yellow: 0, red: 0 };
    for (const row of rows) result[flagOf(row) as keyof typeof result] += 1;
    return result;
  }, [rows]);

  const enrichedCompanies = useMemo(() => {
    const dashboardByCompanyId = new Map<number, any>(
      companyDashboards.map((item: any) => [
        Number(item.company?.id || 0),
        item,
      ]),
    );

    return companies
      .map((company: any) => {
        const companyId = Number(company.id || 0);
        const dashboard = dashboardByCompanyId.get(companyId);
        const backendSummary = dashboard?.summary || {};
        const companyRows = rows.filter(
          (item: any) => Number(item.company_id || 0) === companyId,
        );

        const fallbackFlags = {
          green: companyRows.filter(
            (item: any) => flagOf(item) === "green",
          ).length,
          yellow: companyRows.filter(
            (item: any) => flagOf(item) === "yellow",
          ).length,
          red: companyRows.filter(
            (item: any) => flagOf(item) === "red",
          ).length,
        };

        return {
          ...company,
          participant_count: Number(
            backendSummary.total_participants ??
              company.participant_count ??
              companyRows.length,
          ),
          compliance: Number(backendSummary.compliance_rate || 0),
          achievement_score: Number(
            backendSummary.average_group_score || 0,
          ),
          total_points: Number(backendSummary.total_points || 0),
          flags: backendSummary.flags || fallbackFlags,
          ranking_loaded: Boolean(dashboard?.ok),
          ranking_period: dashboard?.period || null,
        };
      })
      .sort((left: any, right: any) => {
        // WELLNESS_RANKING_UI_POINT_FLOW_V111
        // Ranking Perusahaan is point-first; achievement score is the tie-breaker.
        const pointDifference =
          Number(right.total_points || 0) - Number(left.total_points || 0);
        if (pointDifference !== 0) return pointDifference;

        const scoreDifference =
          Number(right.achievement_score || 0) -
          Number(left.achievement_score || 0);
        if (scoreDifference !== 0) return scoreDifference;

        return clean(left.name).localeCompare(clean(right.name), "id");
      });
  }, [companies, companyDashboards, rows]);

  const topParticipants = useMemo(
    () =>
      [...rows]
        .sort((left: any, right: any) => {
          const pointsDifference =
            Number(right.total_points || 0) - Number(left.total_points || 0);
          if (pointsDifference !== 0) return pointsDifference;
          return clean(left.name).localeCompare(clean(right.name), "id");
        })
        .slice(0, 10),
    [rows],
  );

  const filteredParticipants = useMemo(() => {
    const keyword = clean(query).toLowerCase();
    if (!keyword) return rows.slice(0, 120);
    return rows
      .filter((item: any) =>
        [item.name, item.code, item.company_name, item.group_name]
          .map((value) => clean(value).toLowerCase())
          .join(" ")
          .includes(keyword),
      )
      .slice(0, 120);
  }, [rows, query]);

  const unreadPriority = supportUnread;

  if (sessionRequired && !loading) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-teal-900 px-4 py-8 text-slate-950">
        <section className="mx-auto max-w-md overflow-hidden rounded-[2rem] bg-white shadow-2xl shadow-slate-950/30">
          <div className="bg-gradient-to-br from-slate-950 via-blue-800 to-teal-600 p-6 text-white">
            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-white/70">
              Harmony Health
            </div>
            <h1 className="mt-2 text-3xl font-black leading-tight">
              Portal Admin
            </h1>
            <p className="mt-2 text-sm font-bold leading-6 text-white/80">
              Masuk menggunakan akun Admin, Supervisor, Doctor, atau Wellness Admin.
            </p>
          </div>

          <form onSubmit={loginAdmin} className="space-y-4 p-6">
            {loginError ? (
              <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-bold leading-5 text-rose-700">
                {loginError}
              </div>
            ) : null}

            <div>
              <label className="mb-1.5 block text-xs font-black uppercase tracking-[0.12em] text-slate-500">
                Username
              </label>
              <input
                value={loginUsername}
                onChange={(event) => setLoginUsername(event.target.value)}
                autoCapitalize="none"
                autoCorrect="off"
                autoComplete="username"
                placeholder="Masukkan username"
                className="h-14 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold text-slate-950 outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-100"
              />
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between gap-3">
                <label className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => setShowPassword((previous) => !previous)}
                  className="text-xs font-black text-teal-700"
                >
                  {showPassword ? "Sembunyikan" : "Tampilkan"}
                </button>
              </div>
              <input
                type={showPassword ? "text" : "password"}
                value={loginPassword}
                onChange={(event) => setLoginPassword(event.target.value)}
                autoComplete="current-password"
                placeholder="Masukkan password"
                className="h-14 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold text-slate-950 outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-100"
              />
            </div>

            <button
              type="submit"
              disabled={loginLoading}
              className="h-14 w-full rounded-2xl bg-slate-950 text-sm font-black text-white shadow-lg disabled:opacity-60"
            >
              {loginLoading ? "Memproses..." : "Masuk Portal Admin"}
            </button>
          </form>
        </section>
      </main>
    );
  }

  if (loading && !data) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 text-center">
        <div>
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-teal-600" />
          <div className="mt-4 text-sm font-black text-slate-600">
            Memuat Portal Admin...
          </div>
        </div>
      </main>
    );
  }

  function openView(nextView: View) {
    setView(nextView);
    setMenuOpen(false);
    setNotificationOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const titleByView: Record<View, string> = {
    home: "Portal Admin",
    companies: "Perusahaan",
    coaches: "Coach",
    participants: "Peserta",
    monitoring: "Monitoring & Flag",
    ranking: "Ranking",
    communication: "Komunikasi",
    reports: "Laporan",
    profile: "Profil Admin",
    menu: "Menu Admin",
  };


  const canonicalAdminUrl = "/wellness/admin";
  const exportExcelUrl = "/api/wellness/admin/export-excel?days=30";
  const lastLoadedLabel = lastLoadedAt
    ? lastLoadedAt.toLocaleTimeString("id-ID", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : "-";

  return (
    <main className="min-h-screen bg-[#f4f8fb] pb-24 text-slate-950 lg:pb-8">
      <div className="w-full max-w-none px-3 py-3 sm:px-5 sm:py-5 lg:px-6 lg:py-6 xl:px-8">
        {/* WELLNESS_ADMIN_DESKTOP_NAV_V79E */}
        <nav className="mb-5 hidden items-center justify-between gap-4 rounded-[1.4rem] border border-slate-200 bg-white p-3 shadow-sm lg:flex">
          <div className="flex min-w-0 items-center gap-2">
            {[
              ["home", "Dashboard"],
              ["companies", "Perusahaan"],
              ["coaches", "Coach"],
              ["participants", "Peserta"],
              ["monitoring", "Monitoring"],
              ["ranking", "Ranking"],
              ["reports", "Laporan"],
            ].map(([key, label]) => (
              <button
                key={String(key)}
                type="button"
                onClick={() => openView(key as View)}
                className={`rounded-xl px-3 py-2.5 text-xs font-black transition ${
                  view === key
                    ? "bg-slate-950 text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div className="rounded-xl bg-emerald-50 px-3 py-2 text-[10px] font-black text-emerald-800">
              Sync {lastLoadedLabel}
            </div>
            <a
              href={exportExcelUrl}
              className="rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-black text-white shadow-sm"
            >
              ⬇ Export Excel
            </a>
          </div>
        </nav>

        {view === "home" ? (
          <section className="relative overflow-visible rounded-[1.75rem] bg-gradient-to-br from-slate-950 via-blue-900 to-teal-600 p-5 text-white shadow-xl shadow-blue-100 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white/15 text-lg font-black ring-2 ring-white/25">
                  {initials(admin.name)}
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] font-black uppercase tracking-[0.16em] text-white/65">
                    Harmony Health Admin Portal
                  </div>
                  <h1 className="mt-1 break-words text-2xl font-black leading-tight">
                    Halo, {clean(admin.name).split(/\s+/)[0] || "Admin"}
                  </h1>
                  <p className="mt-1 text-xs font-bold leading-5 text-white/75">
                    Pantau seluruh perusahaan, Coach, peserta, dan alert program.
                  </p>
                </div>
              </div>

              <div className="relative flex shrink-0 gap-2">
                <a
                  href={exportExcelUrl}
                  className="flex h-11 items-center justify-center gap-1 rounded-2xl bg-emerald-500 px-3 text-[10px] font-black text-white shadow-sm"
                  aria-label="Export Excel Admin"
                >
                  <span>⬇</span>
                  <span className="hidden sm:inline">Excel</span>
                </a>
                <button
                  type="button"
                  onClick={() =>
                    setNotificationOpen((previous) => !previous)
                  }
                  className="relative flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-lg text-slate-800 shadow-sm"
                  aria-label="Buka notifikasi Admin"
                >
                  🔔
                  {unreadPriority > 0 ? (
                    <span className="absolute -right-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-black text-white ring-2 ring-white">
                      {unreadPriority > 99 ? "99+" : unreadPriority}
                    </span>
                  ) : null}
                </button>
                <button
                  type="button"
                  onClick={() => setMenuOpen(true)}
                  className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 text-xl font-black text-white backdrop-blur"
                  aria-label="Buka menu Admin"
                >
                  ☰
                </button>

                {notificationOpen ? (
                  <div className="absolute right-0 top-14 z-50 w-[min(19rem,calc(100vw-2rem))] rounded-[1.4rem] border border-slate-100 bg-white p-3 text-slate-950 shadow-2xl">
                    <div className="px-2 pb-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                      Alert Prioritas
                    </div>
                    <button
                      type="button"
                      onClick={() => openView("monitoring")}
                      className="flex w-full items-center justify-between rounded-2xl bg-rose-50 px-4 py-3 text-left"
                    >
                      <span className="text-sm font-black text-rose-900">
                        🚩 Peserta perlu follow-up
                      </span>
                      <span className="rounded-full bg-rose-600 px-2.5 py-1 text-xs font-black text-white">
                        {flags.red}
                      </span>
                    </button>
                    <a
                      href="/wellness/support-admin"
                      className="mt-2 flex items-center justify-between gap-3 rounded-2xl bg-indigo-50 px-4 py-3 text-sm font-black text-indigo-950"
                    >
                      <span>💬 Buka Admin Support Inbox</span>
                      {supportUnread > 0 ? (
                        <span className="rounded-full bg-rose-600 px-2.5 py-1 text-xs font-black text-white">
                          {supportUnread > 99 ? "99+" : supportUnread}
                        </span>
                      ) : null}
                    </a>
                  </div>
                ) : null}
              </div>
            </div>
          </section>
        ) : (
          <section className="flex items-center justify-between gap-3 rounded-[1.2rem] border border-slate-100 bg-white px-3.5 py-3 shadow-sm">
            <div className="min-w-0">
              <div className="text-[9px] font-black uppercase tracking-[0.15em] text-teal-600">
                Harmony Health Admin
              </div>
              <h1 className="mt-0.5 break-words text-lg font-black leading-tight text-slate-950">
                {titleByView[view]}
              </h1>
            </div>
            <div className="flex shrink-0 gap-2">
              <a
                href={exportExcelUrl}
                className="flex h-10 items-center justify-center gap-1 rounded-full bg-emerald-700 px-3 text-[10px] font-black text-white"
                aria-label="Export Excel Admin"
              >
                <span>⬇</span>
                <span className="hidden sm:inline">Excel</span>
              </a>
              <button
                type="button"
                onClick={() => openView("home")}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-lg font-black text-slate-700"
                aria-label="Kembali ke Dashboard"
              >
                ←
              </button>
              <button
                type="button"
                onClick={() => setMenuOpen(true)}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-950 text-lg font-black text-white"
                aria-label="Buka menu Admin"
              >
                ☰
              </button>
            </div>
          </section>
        )}

        {message && !/aktif/i.test(message) ? (
          <div className="mt-3 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs font-bold leading-5 text-amber-900">
            {message}
          </div>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-emerald-100 bg-emerald-50 px-3.5 py-2.5 text-[10px] font-bold text-emerald-900">
          <div>
            Data mobile dan web: <span className="font-black">satu backend yang sama</span>
            <span className="mx-1">·</span>
            Portal Perusahaan 30 hari
          </div>
          <div className="flex items-center gap-2">
            <span>Sync {lastLoadedLabel}</span>
            <span className="rounded-full bg-white px-2 py-1 font-black text-emerald-700">V79E</span>
          </div>
        </div>

        <div className="mt-4">
          {view === "home" ? (
            <div className="space-y-4">
              <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <MetricCard
                  label="Perusahaan"
                  value={summary.total_companies}
                  icon="🏢"
                  tone="border-sky-100 bg-sky-50 text-sky-950"
                  onClick={() => openView("companies")}
                />
                <MetricCard
                  label="Peserta"
                  value={summary.total_participants}
                  icon="👥"
                  tone="border-teal-100 bg-teal-50 text-teal-950"
                  onClick={() => openView("participants")}
                />
                <MetricCard
                  label="Coach"
                  value={summary.total_coaches}
                  icon="🧭"
                  tone="border-violet-100 bg-violet-50 text-violet-950"
                  onClick={() => openView("coaches")}
                />
                <MetricCard
                  label="Kelompok"
                  value={summary.total_kelompok}
                  icon="🧩"
                  tone="border-orange-100 bg-orange-50 text-orange-950"
                  onClick={() => openView("ranking")}
                />
              </section>

              <section className="rounded-[1.65rem] border border-slate-100 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-[0.14em] text-rose-500">
                      Alert Prioritas
                    </div>
                    <h2 className="mt-1 text-lg font-black text-slate-950">
                      Monitoring hari ini
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => openView("monitoring")}
                    className="rounded-full bg-slate-950 px-3 py-2 text-[10px] font-black text-white"
                  >
                    Lihat semua
                  </button>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {[
                    ["green", "Green", flags.green, "bg-emerald-50 text-emerald-800"],
                    ["yellow", "Yellow", flags.yellow, "bg-amber-50 text-amber-900"],
                    ["red", "Red", flags.red, "bg-rose-50 text-rose-800"],
                  ].map(([key, label, value, tone]) => (
                    <button
                      key={String(key)}
                      type="button"
                      onClick={() => openView("monitoring")}
                      className={`rounded-2xl p-3 text-center ${tone}`}
                    >
                      <div className="text-[9px] font-black uppercase tracking-wide opacity-70">
                        {label}
                      </div>
                      <div className="mt-1 text-2xl font-black">{fmt(value)}</div>
                    </button>
                  ))}
                  <a
                    href={exportExcelUrl}
                    className="flex items-center gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-3 text-left text-emerald-900"
                  >
                    <span className="text-xl">📥</span>
                    <span className="text-xs font-black">Export Excel</span>
                  </a>
                  <button
                    type="button"
                    onClick={() => openView("reports")}
                    className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3 text-left"
                  >
                    <span className="text-xl">📄</span>
                    <span className="text-xs font-black text-slate-800">Laporan</span>
                  </button>
                </div>
              </section>

              <section className="rounded-[1.65rem] border border-slate-100 bg-white p-4 shadow-sm">
                <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                  Quick Action
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2.5 md:grid-cols-3 lg:grid-cols-4">
                  {[
                    ["🏢", "Perusahaan", "companies"],
                    ["🧭", "Coach", "coaches"],
                    ["👥", "Peserta", "participants"],
                    ["🚩", "Monitoring", "monitoring"],
                    ["🏆", "Ranking", "ranking"],
                    ["💬", "Komunikasi", "communication"],
                  ].map(([icon, label, nextView]) => (
                    <button
                      key={String(label)}
                      type="button"
                      onClick={() => openView(nextView as View)}
                      className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3 text-left"
                    >
                      <span className="text-xl">{icon}</span>
                      <span className="text-xs font-black text-slate-800">{label}</span>
                    </button>
                  ))}
                </div>
              </section>

              <section className="rounded-[1.65rem] border border-slate-100 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-[0.14em] text-sky-500">
                      Performa Perusahaan
                    </div>
                    <h2 className="mt-1 text-lg font-black text-slate-950">
                      Capaian tertinggi
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => openView("companies")}
                    className="text-[10px] font-black text-sky-700"
                  >
                    Lihat semua →
                  </button>
                </div>
                <div className="mt-3 space-y-2">
                  {enrichedCompanies.slice(0, 4).map((company: any, index: number) => (
                    <button
                      key={company.id}
                      type="button"
                      onClick={() => openView("companies")}
                      className="flex w-full items-center gap-3 rounded-2xl border border-slate-100 p-3 text-left"
                    >
                      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${avatarTone(index)} text-sm font-black text-white`}>
                        {initials(company.name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="break-words text-sm font-black leading-5 text-slate-950">
                          {company.name}
                        </div>
                        <div className="mt-0.5 text-[10px] font-bold text-slate-500">
                          {fmt(company.participant_count)} peserta · {fmt(company.kelompok_count)} kelompok
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-lg font-black text-teal-700">
                          {fmt(company.compliance)}%
                        </div>
                        <div className="text-[9px] font-bold text-slate-400">kepatuhan</div>
                      </div>
                    </button>
                  ))}
                  {enrichedCompanies.length === 0 ? (
                    <EmptyState
                      icon="🏢"
                      title="Belum ada perusahaan"
                      text="Data perusahaan belum tersedia."
                    />
                  ) : null}
                </div>
              </section>
            </div>
          ) : null}

          {view === "companies" ? (
            <section className="space-y-3 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0">
              {enrichedCompanies.map((company: any, index: number) => (
                <article
                  key={company.id}
                  className="rounded-[1.55rem] border border-slate-100 bg-white p-4 shadow-sm"
                >
                  <div className="flex items-start gap-3">
                    <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${avatarTone(index)} text-sm font-black text-white`}>
                      {initials(company.name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="break-words text-base font-black leading-5 text-slate-950">
                        {company.name}
                      </div>
                      <div className="mt-1 text-[11px] font-bold text-slate-500">
                        {fmt(company.participant_count)} peserta · {fmt(company.kelompok_count)} kelompok · {fmt(company.coach_count)} Coach
                      </div>
                    </div>
                    <div className="shrink-0 rounded-full bg-teal-50 px-3 py-2 text-xs font-black text-teal-800">
                      {fmt(company.compliance)}%
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    {[
                      ["Green", company.flags.green, "bg-emerald-50 text-emerald-800"],
                      ["Yellow", company.flags.yellow, "bg-amber-50 text-amber-900"],
                      ["Red", company.flags.red, "bg-rose-50 text-rose-800"],
                    ].map(([label, value, tone]) => (
                      <div key={String(label)} className={`rounded-xl px-2 py-2 ${tone}`}>
                        <div className="text-[9px] font-black uppercase opacity-70">{label}</div>
                        <div className="mt-0.5 text-lg font-black">{fmt(value)}</div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <a
                      href={`/wellness/company?company_id=${company.id}`}
                      className="block rounded-2xl bg-slate-950 px-4 py-3 text-center text-xs font-black text-white transition hover:bg-slate-800"
                    >
                      Buka Portal Perusahaan
                    </a>
                    <button
                      type="button"
                      onClick={() => {
                        setNakesLinkCompany(company);
                        setNakesLinkCopied(false);
                      }}
                      className="rounded-2xl border border-teal-200 bg-teal-50 px-4 py-3 text-center text-xs font-black text-teal-800 transition hover:bg-teal-100"
                    >
                      🔗 Link Input NAKES
                    </button>
                  </div>
                </article>
              ))}
              {enrichedCompanies.length === 0 ? (
                <EmptyState icon="🏢" title="Belum ada perusahaan" text="Tambahkan perusahaan melalui Wellness Management." />
              ) : null}
            </section>
          ) : null}

          {view === "coaches" ? (
            <section className="space-y-3 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0">
              {coaches.map((coach: any, index: number) => (
                <article key={coach.id} className="rounded-[1.55rem] border border-slate-100 bg-white p-4 shadow-sm">
                  <div className="flex items-start gap-3">
                    <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${avatarTone(index + 1)} text-sm font-black text-white`}>
                      {initials(coach.name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="break-words text-base font-black leading-5 text-slate-950">{coach.name}</div>
                      <div className="mt-1 break-words text-[11px] font-bold text-slate-500">{coach.email || "Email belum tersedia"}</div>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div className="rounded-xl bg-violet-50 p-3 text-violet-900">
                      <div className="text-[9px] font-black uppercase opacity-70">Assigned Group</div>
                      <div className="mt-1 text-xl font-black">{fmt(coach.assigned_group_count)}</div>
                    </div>
                    <div className="rounded-xl bg-teal-50 p-3 text-teal-900">
                      <div className="text-[9px] font-black uppercase opacity-70">Peserta</div>
                      <div className="mt-1 text-xl font-black">{fmt(coach.participant_count)}</div>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {(coach.companies || []).map((company: any) => (
                      <span key={company.id} className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black text-slate-600">{company.name}</span>
                    ))}
                  </div>
                </article>
              ))}
              {coaches.length === 0 ? (
                <EmptyState icon="🧭" title="Belum ada Coach" text="Data Coach belum tersedia." />
              ) : null}
            </section>
          ) : null}

          {view === "participants" ? (
            <section className="space-y-3">
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Cari nama, kode, perusahaan, atau kelompok"
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-100"
                />
                <div className="flex items-center rounded-2xl border border-slate-200 bg-white px-4 text-xs font-black text-slate-600">
                  {fmt(filteredParticipants.length)} peserta tampil
                </div>
              </div>

              {controlNotice ? (
                <div
                  className={`rounded-2xl px-4 py-3 text-xs font-bold leading-5 ${
                    /gagal|belum tersedia|error/i.test(controlNotice)
                      ? "bg-rose-50 text-rose-700"
                      : "bg-sky-50 text-sky-800"
                  }`}
                >
                  {controlNotice}
                </div>
              ) : null}

              <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                {filteredParticipants.map((item: any, index: number) => {
                  const flag = flagOf(item);
                  const control = item.wellness_control || {
                    session_enabled: true,
                    fitness_enabled: false,
                    fitness_source: "none",
                    connected_providers: [],
                    active_providers: [],
                    has_multiple_active_providers: false,
                  };
                  const participantId = Number(
                    item.participant_id || item.id || 0,
                  );
                  const saving = controlSavingId === participantId;
                  const connected = Array.isArray(control.connected_providers)
                    ? control.connected_providers
                    : [];
                  const source = clean(control.fitness_source || "none")
                    .toLowerCase()
                    .replace(/-/g, "_");

                  return (
                    <article
                      key={item.id || index}
                      role="button"
                      tabIndex={0}
                      aria-label={`Buka detail peserta ${item.name || ""}`}
                      onClick={() => openParticipantDetail(item)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          openParticipantDetail(item);
                        }
                      }}
                      className="cursor-pointer rounded-[1.45rem] border border-slate-100 bg-white p-3.5 shadow-sm transition hover:-translate-y-0.5 hover:border-teal-200 hover:shadow-md focus:outline-none focus:ring-4 focus:ring-teal-100"
                    >
                      <div className="flex items-start gap-3">
                        <WellnessAvatar
                          name={item.name}
                          src={profilePhotoOf(item)}
                          size="md"
                          className="h-11 w-11 ring-2"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="break-words text-sm font-black leading-5 text-slate-950">
                            {item.name}
                          </div>
                          <div className="mt-0.5 break-words text-[10px] font-bold leading-4 text-slate-500">
                            {item.code || "-"} · {item.company_name || "-"} · {item.group_name || "-"}
                          </div>
                        </div>
                        <span
                          className={`shrink-0 rounded-full border px-2.5 py-1 text-[9px] font-black uppercase ${flagTone(flag)}`}
                        >
                          {flag}
                        </span>
                      </div>

                      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                        <div className="rounded-xl bg-slate-50 p-2">
                          <div className="text-[9px] font-black text-slate-400">POINT</div>
                          <div className="mt-0.5 text-sm font-black">{fmt(item.total_points)}</div>
                        </div>
                        <div className="rounded-xl bg-slate-50 p-2">
                          <div className="text-[9px] font-black text-slate-400">BMI</div>
                          <div className="mt-0.5 text-sm font-black">{fmt(item.bmi, 1)}</div>
                        </div>
                        <div className="rounded-xl bg-slate-50 p-2">
                          <div className="text-[9px] font-black text-slate-400">STATUS</div>
                          <div className="mt-0.5 break-words text-[10px] font-black leading-4">
                            {item.compliance_status || "-"}
                          </div>
                        </div>
                      </div>

                      <div
                        className="mt-3 rounded-2xl border border-slate-100 bg-slate-50 p-3"
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => event.stopPropagation()}
                      >
                        <div className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">
                          Kontrol Pengembangan
                        </div>

                        <div className="mt-3 flex items-center justify-between gap-3">
                          <div>
                            <div className="text-xs font-black text-slate-900">Session Wellness</div>
                            <div className="mt-0.5 text-[10px] font-bold text-slate-500">
                              {control.session_enabled ? "Aktif" : "Nonaktif"}
                            </div>
                          </div>
                          <ToggleSwitch
                            active={control.session_enabled !== false}
                            disabled={saving}
                            label="Aktifkan atau nonaktifkan Session Wellness"
                            onClick={() =>
                              void saveParticipantControl(item, {
                                session_enabled: !control.session_enabled,
                              })
                            }
                          />
                        </div>

                        <div className="my-3 border-t border-slate-200" />

                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-xs font-black text-slate-900">Aktivasi Fitness App</div>
                            <div className="mt-0.5 text-[10px] font-bold text-slate-500">
                              {control.fitness_enabled
                                ? fitnessSourceLabel(source)
                                : "Nonaktif"}
                            </div>
                          </div>
                          <ToggleSwitch
                            active={control.fitness_enabled === true}
                            disabled={saving}
                            label="Aktifkan atau nonaktifkan Fitness App"
                            onClick={() => {
                              const nextEnabled = !control.fitness_enabled;
                              const fallbackSource = connected.includes("health_connect")
                                ? "health_connect"
                                : connected.includes("google_fit")
                                  ? "google_fit"
                                  : source !== "none"
                                    ? source
                                    : "health_connect";
                              void saveParticipantControl(item, {
                                fitness_enabled: nextEnabled,
                                fitness_source: nextEnabled
                                  ? fallbackSource
                                  : "none",
                              });
                            }}
                          />
                        </div>

                        <select
                          value={control.fitness_enabled ? source : "none"}
                          disabled={saving || !control.fitness_enabled}
                          onChange={(event) =>
                            void saveParticipantControl(item, {
                              fitness_enabled: event.target.value !== "none",
                              fitness_source: event.target.value,
                            })
                          }
                          className="mt-3 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-800 outline-none disabled:bg-slate-100 disabled:text-slate-400"
                        >
                          <option value="none">Nonaktif</option>
                          <option value="health_connect">Health Connect</option>
                          <option value="google_fit">Google Fit</option>
                        </select>

                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {connected.length ? (
                            connected.map((provider: string) => (
                              <span
                                key={provider}
                                className={`rounded-full px-2 py-1 text-[9px] font-black ${
                                  provider === source && control.fitness_enabled
                                    ? "bg-emerald-600 text-white"
                                    : "bg-white text-slate-600"
                                }`}
                              >
                                {fitnessSourceLabel(provider)}
                              </span>
                            ))
                          ) : (
                            <span className="text-[9px] font-bold text-slate-400">
                              Belum ada aplikasi fitness terkoneksi.
                            </span>
                          )}
                        </div>

                        {control.has_multiple_active_providers ? (
                          <div className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-[10px] font-bold leading-4 text-amber-900">
                            ⚠️ Hanya boleh memilih satu aplikasi fitness. Simpan salah satu sumber untuk menonaktifkan koneksi lainnya.
                          </div>
                        ) : null}

                        {saving ? (
                          <div className="mt-2 text-[10px] font-black text-sky-700">
                            Menyimpan...
                          </div>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>

              {filteredParticipants.length === 0 ? (
                <EmptyState
                  icon="👥"
                  title="Peserta tidak ditemukan"
                  text="Ubah kata pencarian atau periksa data peserta."
                />
              ) : null}
            </section>
          ) : null}

          {view === "monitoring" ? (
            <section className="space-y-4">
              <div className="grid grid-cols-3 gap-2">
                <MetricCard label="Green" value={flags.green} icon="●" tone="border-emerald-100 bg-emerald-50 text-emerald-900" />
                <MetricCard label="Yellow" value={flags.yellow} icon="●" tone="border-amber-100 bg-amber-50 text-amber-900" />
                <MetricCard label="Red" value={flags.red} icon="●" tone="border-rose-100 bg-rose-50 text-rose-900" />
              </div>
              <div className="space-y-2">
                {rows
                  .filter((item: any) => flagOf(item) === "red")
                  .slice(0, 50)
                  .map((item: any, index: number) => (
                    <button
                      key={item.id || index}
                      type="button"
                      aria-label={`Buka detail peserta ${item.name || ""}`}
                      onClick={() => openParticipantDetail(item)}
                      className="w-full cursor-pointer rounded-[1.4rem] border border-rose-100 bg-white p-3.5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-rose-200 hover:shadow-md focus:outline-none focus:ring-4 focus:ring-rose-100 active:scale-[0.995]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-3">
                          <WellnessAvatar
                            name={item.name}
                            src={profilePhotoOf(item)}
                            size="md"
                            className="h-11 w-11 ring-2"
                          />
                          <div className="min-w-0">
                            <div className="break-words text-sm font-black leading-5 text-slate-950">{item.name}</div>
                            <div className="mt-1 break-words text-[10px] font-bold text-slate-500">{item.company_name} · {item.group_name}</div>
                          </div>
                        </div>
                        <span className="rounded-full bg-rose-600 px-2.5 py-1 text-[9px] font-black text-white">RED</span>
                      </div>
                      <div className="mt-2 text-xs font-bold leading-5 text-rose-800">{(item.risk_flags || []).join(" · ") || item.compliance_status || "Membutuhkan follow-up"}</div>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <div className="rounded-xl bg-orange-50 px-3 py-2 text-orange-900">
                          <div className="text-[8px] font-black uppercase tracking-wide opacity-60">Nutrisi</div>
                          <div className="mt-1 text-[10px] font-black leading-4">
                            {dailyInputLabel(item.days_since_nutrition, item.last_nutrition_date)}
                          </div>
                        </div>
                        <div className="rounded-xl bg-sky-50 px-3 py-2 text-sky-900">
                          <div className="text-[8px] font-black uppercase tracking-wide opacity-60">Workout</div>
                          <div className="mt-1 text-[10px] font-black leading-4">
                            {dailyInputLabel(item.days_since_workout, item.last_workout_date)}
                          </div>
                        </div>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-3 text-[10px] font-black text-slate-400">
                        <span>Klik untuk melihat detail peserta</span>
                        <span aria-hidden="true" className="text-sm text-rose-500">›</span>
                      </div>
                    </button>
                  ))}
              </div>
              {flags.red === 0 ? (
                <EmptyState icon="✅" title="Tidak ada Red Flag" text="Belum ada peserta prioritas yang perlu ditindaklanjuti." />
              ) : null}
            </section>
          ) : null}

          {view === "ranking" ? (
            <section className="space-y-4 lg:grid lg:grid-cols-2 lg:gap-5 lg:space-y-0">
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 lg:col-span-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] font-black uppercase tracking-[0.13em] text-emerald-700">
                      Sumber Data
                    </div>
                    <div className="mt-1 text-xs font-bold leading-5 text-emerald-900">
                      Backend Portal Perusahaan · Supabase + Google Sheet · Periode 30 hari
                    </div>
                    <div className="mt-1 text-[10px] font-bold leading-4 text-emerald-700">
                      Portal Admin tidak menghitung ulang poin di perangkat.
                    </div>
                  </div>

                  <a
                    href={exportExcelUrl}
                    className="flex shrink-0 items-center gap-1.5 rounded-xl bg-emerald-700 px-3 py-2.5 text-[10px] font-black text-white shadow-sm active:scale-[0.98]"
                    aria-label="Export laporan Portal Admin ke Excel"
                  >
                    <span>⬇️</span>
                    <span>Excel</span>
                  </a>
                </div>
              </div>

              <div className="rounded-[1.55rem] border border-slate-100 bg-white p-4 shadow-sm">
                <div className="text-[10px] font-black uppercase tracking-[0.14em] text-sky-500">
                  Ranking Perusahaan
                </div>
                <div className="mt-3 space-y-2">
                  {enrichedCompanies.slice(0, 10).map((company: any, index: number) => (
                    <div key={company.id} className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-950 text-xs font-black text-white">
                        {index + 1}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="break-words text-sm font-black leading-5">
                          {company.name}
                        </div>
                        <div className="mt-0.5 break-words text-[10px] font-bold leading-4 text-slate-500">
                          {fmt(company.participant_count)} peserta · {fmt(company.achievement_score)}% capaian
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-lg font-black text-teal-700">
                          {fmt(company.total_points)}
                        </div>
                        <div className="text-[9px] font-bold text-slate-400">
                          poin
                        </div>
                      </div>
                    </div>
                  ))}
                  {enrichedCompanies.length === 0 ? (
                    <EmptyState
                      icon="🏢"
                      title="Ranking belum tersedia"
                      text="Backend perusahaan belum mengembalikan data yang valid."
                    />
                  ) : null}
                </div>
              </div>

              <div className="rounded-[1.55rem] border border-slate-100 bg-white p-4 shadow-sm">
                <div className="text-[10px] font-black uppercase tracking-[0.14em] text-violet-500">
                  Top Participants · Poin 30 Hari
                </div>
                <div className="mt-3 space-y-2">
                  {topParticipants.map((item: any, index: number) => (
                    <button
                      key={item.id || index}
                      type="button"
                      onClick={() => openParticipantDetail(item)}
                      aria-label={`Buka detail ranking peserta ${item.name || ""}`}
                      className="w-full rounded-2xl bg-slate-50 p-3 text-left transition hover:bg-violet-50 focus:outline-none focus:ring-4 focus:ring-violet-100 active:scale-[0.995]"
                    >
                      <div className="flex items-center gap-3">
                        <div className="relative shrink-0">
                          <WellnessAvatar
                            name={item.name}
                            src={profilePhotoOf(item)}
                            size="sm"
                            className="h-10 w-10 ring-2"
                          />
                          <span className="absolute -bottom-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-violet-600 px-1 text-[9px] font-black text-white ring-2 ring-slate-50">
                            {index + 1}
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="break-words text-sm font-black leading-5">
                            {item.name}
                          </div>
                          <div className="mt-0.5 break-words text-[10px] font-bold leading-4 text-slate-500">
                            {item.company_name} · {item.group_name}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="text-base font-black text-violet-700">
                            {fmt(item.total_points)}
                          </div>
                          <div className="text-[9px] font-bold text-slate-400">
                            poin
                          </div>
                        </div>
                      </div>

                      <div className="mt-2 flex flex-wrap gap-1.5 text-[9px] font-black">
                        <span className="rounded-full bg-orange-50 px-2 py-1 text-orange-700">
                          Nutrisi {fmt(item.nutrition_points)}
                        </span>
                        <span className="rounded-full bg-sky-50 px-2 py-1 text-sky-700">
                          Workout {fmt(item.workout_points)}
                        </span>
                        <span className="rounded-full bg-fuchsia-50 px-2 py-1 text-fuchsia-700">
                          Health Talk {fmt(item.healthtalk_points)}
                        </span>
                        {Number(item.other_points || 0) > 0 ? (
                          <span className="rounded-full bg-slate-200 px-2 py-1 text-slate-700">
                            Lainnya {fmt(item.other_points)}
                          </span>
                        ) : null}
                      </div>
                    </button>
                  ))}
                  {topParticipants.length === 0 ? (
                    <EmptyState
                      icon="🏆"
                      title="Poin belum tersedia"
                      text="Tidak ada data ranking valid dari backend Portal Perusahaan."
                    />
                  ) : null}
                </div>
              </div>
            </section>
          ) : null}

          {view === "communication" ? (
            <section className="grid gap-3">
              <a href="/wellness/support-admin" className="rounded-[1.5rem] border border-indigo-100 bg-indigo-50 p-4 text-indigo-950 shadow-sm">
                <div className="text-2xl">🛠️</div><div className="mt-2 text-base font-black">Admin Support Inbox</div><div className="mt-1 text-xs font-bold leading-5 text-indigo-700">Balas kendala Peserta, Coach, dan Perusahaan.</div>
              </a>
              <a href="/wellness/company" className="rounded-[1.5rem] border border-orange-100 bg-orange-50 p-4 text-orange-950 shadow-sm">
                <div className="text-2xl">🏢</div><div className="mt-2 text-base font-black">Portal Perusahaan</div><div className="mt-1 text-xs font-bold leading-5 text-orange-700">Pilih perusahaan dan buka komunikasi dengan Coach.</div>
              </a>
              <a href="/wellness/coach" className="rounded-[1.5rem] border border-violet-100 bg-violet-50 p-4 text-violet-950 shadow-sm">
                <div className="text-2xl">🧭</div><div className="mt-2 text-base font-black">Portal Coach</div><div className="mt-1 text-xs font-bold leading-5 text-violet-700">Tinjau pengalaman Coach dan komunikasi member.</div>
              </a>
              <div className="rounded-[1.5rem] border border-dashed border-slate-200 bg-white p-4">
                <div className="text-sm font-black text-slate-900">Communication Center terpadu</div>
                <div className="mt-1 text-xs font-bold leading-5 text-slate-500">Inbox Admin–Perusahaan, Admin–Coach, broadcast, dan read receipt dilanjutkan pada V79D.</div>
              </div>
            </section>
          ) : null}

          {view === "reports" ? (
            <section className="grid gap-3">
              <a href="/wellness/dashboard" className="rounded-[1.5rem] border border-sky-100 bg-sky-50 p-4 text-sky-950 shadow-sm"><div className="text-2xl">📊</div><div className="mt-2 text-base font-black">Dashboard Wellness Lengkap</div><div className="mt-1 text-xs font-bold leading-5 text-sky-700">Buka laporan operasional dan detail parameter.</div></a>
              <a href="/wellness/history-import" className="rounded-[1.5rem] border border-teal-100 bg-teal-50 p-4 text-teal-950 shadow-sm"><div className="text-2xl">📈</div><div className="mt-2 text-base font-black">History MCU</div><div className="mt-1 text-xs font-bold leading-5 text-teal-700">Kelola baseline dan pemeriksaan berkala.</div></a>
              <a href="/wellness/support-admin" className="rounded-[1.5rem] border border-violet-100 bg-violet-50 p-4 text-violet-950 shadow-sm"><div className="text-2xl">📄</div><div className="mt-2 text-base font-black">Laporan Follow-up</div><div className="mt-1 text-xs font-bold leading-5 text-violet-700">Tinjau tiket dan tindak lanjut layanan.</div></a>
              <a
                href={exportExcelUrl}
                className="rounded-[1.5rem] border border-emerald-100 bg-emerald-50 p-4 text-emerald-950 shadow-sm active:scale-[0.99]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-2xl">📥</div>
                    <div className="mt-2 text-base font-black">Export Excel Admin</div>
                    <div className="mt-1 text-xs font-bold leading-5 text-emerald-700">
                      Unduh ringkasan, ranking perusahaan, ranking kelompok, peserta, flag, Coach, dan before–after dalam satu workbook.
                    </div>
                  </div>
                  <span className="shrink-0 rounded-full bg-emerald-700 px-3 py-2 text-[10px] font-black text-white">
                    XLSX
                  </span>
                </div>
              </a>
              <div className="rounded-[1.5rem] border border-dashed border-slate-200 bg-white p-4"><div className="text-sm font-black">Export PDF dan Presentation Summary</div><div className="mt-1 text-xs font-bold leading-5 text-slate-500">Format PDF dan presentasi dilanjutkan pada tahap laporan berikutnya.</div></div>
            </section>
          ) : null}

          {view === "profile" ? (
            <section className="rounded-[1.7rem] border border-slate-100 bg-white p-5 shadow-sm">
              <div className="flex flex-col items-center text-center">
                <div className="flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-slate-950 via-blue-800 to-teal-500 text-2xl font-black text-white shadow-lg">{initials(admin.name)}</div>
                <div className="mt-4 break-words text-xl font-black text-slate-950">{admin.name}</div>
                <div className="mt-1 text-xs font-bold text-slate-500">@{admin.username || "admin"}</div>
                <span className="mt-3 rounded-full bg-blue-50 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-blue-700">{roleLabel(admin.role)}</span>
                <div className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-[10px] font-bold text-emerald-800">
                  Web dan mobile menggunakan {canonicalAdminUrl}
                </div>
              </div>
              <div className="mt-5 grid gap-2">
                <a href="/dashboard" className="rounded-2xl bg-slate-100 px-4 py-3 text-sm font-black text-slate-800">Buka Dashboard Desktop</a>
                <a href="/master" className="rounded-2xl bg-slate-100 px-4 py-3 text-sm font-black text-slate-800">User & Hak Akses</a>
                <button type="button" onClick={logout} className="rounded-2xl bg-rose-600 px-4 py-3 text-sm font-black text-white">Logout</button>
              </div>
            </section>
          ) : null}
        </div>
      </div>

      {selectedParticipant ? (
        <div className="fixed inset-0 z-[120] flex items-end justify-center p-0 sm:items-center sm:p-4">
          <button
            type="button"
            aria-label="Tutup detail peserta"
            onClick={closeParticipantDetail}
            className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
          />

          <section
            role="dialog"
            aria-modal="true"
            aria-label={`Detail peserta ${selectedParticipant.name || ""}`}
            className="relative z-10 max-h-[92vh] w-full overflow-y-auto rounded-t-[2rem] bg-slate-50 shadow-2xl sm:max-w-3xl sm:rounded-[2rem]"
          >
            <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur">
              <div className="flex items-start gap-3">
                <WellnessAvatar
                  name={selectedParticipant.name}
                  src={profilePhotoOf(selectedParticipant)}
                  size="lg"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] font-black uppercase tracking-[0.14em] text-teal-600">Detail Peserta</div>
                  <h2 className="mt-1 break-words text-xl font-black text-slate-950">{selectedParticipant.name || "Peserta Wellness"}</h2>
                  <div className="mt-1 break-words text-xs font-bold leading-5 text-slate-500">
                    {selectedParticipant.code || "-"} · {selectedParticipant.company_name || "-"} · {selectedParticipant.group_name || "-"}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={closeParticipantDetail}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-lg font-black text-slate-600 hover:bg-slate-200"
                  aria-label="Tutup"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="space-y-4 p-4 sm:p-5">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  ["Total Point", selectedParticipant.total_points, "bg-violet-50 text-violet-800"],
                  ["Nutrisi", selectedParticipant.nutrition_points, "bg-orange-50 text-orange-800"],
                  ["Workout", selectedParticipant.workout_points, "bg-sky-50 text-sky-800"],
                  ["Health Talk", selectedParticipant.healthtalk_points, "bg-fuchsia-50 text-fuchsia-800"],
                ].map(([label, value, tone]) => (
                  <div key={String(label)} className={`rounded-2xl p-3 ${tone}`}>
                    <div className="text-[9px] font-black uppercase tracking-wide opacity-70">{label}</div>
                    <div className="mt-1 text-xl font-black">{fmt(value)}</div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-2xl bg-orange-50 p-4 text-orange-900">
                  <div className="text-[9px] font-black uppercase tracking-[0.12em] opacity-60">Input Nutrisi</div>
                  <div className="mt-2 text-sm font-black">
                    {dailyInputLabel(
                      selectedParticipant.days_since_nutrition,
                      selectedParticipant.last_nutrition_date,
                    )}
                  </div>
                </div>
                <div className="rounded-2xl bg-sky-50 p-4 text-sky-900">
                  <div className="text-[9px] font-black uppercase tracking-[0.12em] opacity-60">Input Workout</div>
                  <div className="mt-2 text-sm font-black">
                    {dailyInputLabel(
                      selectedParticipant.days_since_workout,
                      selectedParticipant.last_workout_date,
                    )}
                  </div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">Status</div>
                  <span className={`mt-2 inline-flex rounded-full border px-3 py-1.5 text-[10px] font-black uppercase ${flagTone(flagOf(selectedParticipant))}`}>
                    {selectedParticipant.compliance_status || flagOf(selectedParticipant)}
                  </span>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">Streak</div>
                  <div className="mt-2 text-xl font-black text-slate-950">{fmt(selectedParticipant.current_streak)} hari</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">Hari Aktif</div>
                  <div className="mt-2 text-xl font-black text-slate-950">{fmt(selectedParticipant.active_days)} hari</div>
                </div>
              </div>

              <div className="rounded-[1.5rem] border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-black text-slate-950">Perkembangan Kesehatan</div>
                    <div className="mt-1 text-[10px] font-bold text-slate-500">Baseline dibandingkan data terbaru dari backend.</div>
                  </div>
                  <span className="rounded-full bg-teal-50 px-3 py-1.5 text-[9px] font-black text-teal-700">READ ONLY</span>
                </div>
                <div className="mt-4 overflow-hidden rounded-2xl border border-slate-100">
                  <div className="grid grid-cols-[1.4fr_1fr_1fr] bg-slate-50 px-3 py-2 text-[9px] font-black uppercase tracking-wide text-slate-400">
                    <div>Parameter</div><div className="text-right">Baseline</div><div className="text-right">Terbaru</div>
                  </div>
                  {[
                    ["Berat Badan", "weight", "kg"],
                    ["BMI", "bmi", ""],
                    ["Lingkar Pinggang", "waist", "cm"],
                    ["HbA1c", "hba1c", "%"],
                    ["Tekanan Darah Sistolik", "sbp", "mmHg"],
                  ].map(([label, key, unit]) => (
                    <div key={String(key)} className="grid grid-cols-[1.4fr_1fr_1fr] border-t border-slate-100 px-3 py-3 text-xs">
                      <div className="font-black text-slate-700">{label}</div>
                      <div className="text-right font-bold text-slate-500">{fmt(selectedParticipant.baseline?.[String(key)], 1)}{unit ? ` ${unit}` : ""}</div>
                      <div className="text-right font-black text-teal-700">{fmt(selectedParticipant.current?.[String(key)], 1)}{unit ? ` ${unit}` : ""}</div>
                    </div>
                  ))}
                </div>
              </div>


              <div className="rounded-[1.5rem] border border-slate-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-black text-slate-950">History Nutrisi</div>
                    <div className="mt-1 text-[10px] font-bold leading-5 text-slate-500">
                      Sumber dan flow sama dengan Portal Peserta.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void loadParticipantNutritionDetail(selectedParticipant)}
                    className="rounded-full bg-teal-50 px-3 py-2 text-[10px] font-black text-teal-700"
                  >
                    Refresh
                  </button>
                </div>

                {participantNutritionLoading ? (
                  <div className="mt-4 rounded-2xl bg-slate-50 p-6 text-center text-xs font-bold text-slate-400">
                    Memuat history nutrisi...
                  </div>
                ) : participantNutritionError ? (
                  <div className="mt-4 rounded-2xl bg-rose-50 p-4 text-xs font-bold leading-5 text-rose-700">
                    {participantNutritionError}
                  </div>
                ) : (
                  <>
                    {participantNutritionDetail?.nutrition?.sources ? (
                      <div className="mt-3 rounded-2xl bg-slate-50 px-3 py-2 text-[10px] font-bold text-slate-500">
                        Supabase {fmt(participantNutritionDetail.nutrition.sources.supabase_rows || 0)} row · Google Sheet {fmt(participantNutritionDetail.nutrition.sources.google_sheet_rows || 0)} row
                      </div>
                    ) : null}

                    <div className="mt-4">
                      <div className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">
                        Kalori per Hari
                      </div>
                      <div className="mt-2 flex min-h-24 items-end gap-1 overflow-x-auto rounded-2xl bg-slate-50 p-3">
                        {(participantNutritionDetail?.nutrition?.daily_calories || []).slice(-14).map((point: any, index: number, items: any[]) => {
                          const maxCalories = Math.max(
                            1,
                            ...items.map((item: any) => Number(item?.calories || 0)),
                          );
                          const height = Math.max(
                            8,
                            Math.round((Number(point?.calories || 0) / maxCalories) * 70),
                          );
                          return (
                            <div key={`${point?.date || index}-${index}`} className="flex min-w-8 flex-1 flex-col items-center justify-end gap-1">
                              <div className="text-[8px] font-black text-teal-700">{fmt(point?.calories)}</div>
                              <div className="w-full rounded-t-lg bg-teal-500" style={{ height: `${height}px` }} />
                              <div className="text-[8px] font-bold text-slate-400">{point?.label || "-"}</div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="mt-4 max-h-[30rem] space-y-2 overflow-y-auto pr-1">
                      {(participantNutritionDetail?.nutrition?.logs || []).length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-xs font-bold text-slate-400">
                          Belum ada history nutrisi yang terbaca.
                        </div>
                      ) : (
                        (participantNutritionDetail?.nutrition?.logs || []).map((item: any, index: number) => (
                          <div key={`${item?.id || index}-${index}`} className="rounded-2xl bg-slate-50 p-3">
                            <div className="flex items-center gap-3">
                              {clean(item?.photo_url) ? (
                                <img
                                  src={item.photo_url}
                                  alt="Foto makanan"
                                  className="h-12 w-12 shrink-0 rounded-xl object-cover"
                                  onError={(event) => {
                                    event.currentTarget.style.display = "none";
                                  }}
                                />
                              ) : (
                                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-white text-[9px] font-black text-teal-700">FOOD</div>
                              )}
                              <div className="min-w-0 flex-1">
                                <div className="break-words text-xs font-black text-slate-900">{item?.food_name || item?.meal_text || "-"}</div>
                                <div className="mt-1 text-[9px] font-bold text-slate-500">{clean(item?.log_date || item?.created_at).slice(0, 10) || "-"} · {item?.meal_time || item?.meal_type || "-"}</div>
                                <div className="mt-2 flex flex-wrap gap-2">
                                  <span className="rounded-full bg-teal-50 px-2.5 py-1 text-[9px] font-black text-teal-700">{fmt(item?.calories || item?.total_calories)} kkal</span>
                                  <span className="rounded-full bg-white px-2.5 py-1 text-[9px] font-black text-slate-500">{item?.source === "google_sheet" ? "Google Sheet" : "Supabase"}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </>
                )}
              </div>

              <div className="rounded-[1.5rem] border border-slate-200 bg-white p-4">
                <div className="text-sm font-black text-slate-950">Akses & Fitness</div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <div className="rounded-2xl bg-slate-50 p-3">
                    <div className="text-[9px] font-black uppercase text-slate-400">Session Wellness</div>
                    <div className="mt-1 text-sm font-black text-slate-900">{selectedParticipant.wellness_control?.session_enabled === false ? "Nonaktif" : "Aktif"}</div>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-3">
                    <div className="text-[9px] font-black uppercase text-slate-400">Fitness App</div>
                    <div className="mt-1 text-sm font-black text-slate-900">
                      {selectedParticipant.wellness_control?.fitness_enabled
                        ? fitnessSourceLabel(selectedParticipant.wellness_control?.fitness_source)
                        : "Nonaktif"}
                    </div>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={closeParticipantDetail}
                className="w-full rounded-2xl bg-slate-950 px-5 py-4 text-sm font-black text-white"
              >
                Tutup Detail
              </button>
            </div>
          </section>
        </div>
      ) : null}

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-12px_30px_rgba(15,23,42,0.08)] backdrop-blur lg:hidden">
        <div className="mx-auto grid max-w-3xl grid-cols-5 gap-1">
          {[
            ["home", "🏠", "Home"],
            ["monitoring", "🚩", "Monitoring"],
            ["communication", "💬", "Chat"],
            ["ranking", "🏆", "Ranking"],
            ["menu", "☰", "Menu"],
          ].map(([key, icon, label]) => {
            const active = view === key || (key === "menu" && menuOpen);
            return (
              <button
                key={String(key)}
                type="button"
                onClick={() =>
                  key === "menu" ? setMenuOpen(true) : openView(key as View)
                }
                className={`flex min-h-[3.25rem] flex-col items-center justify-center rounded-xl px-1 text-[9px] font-black ${active ? "bg-teal-50 text-teal-700" : "text-slate-500"}`}
              >
                <span className="text-lg">{icon}</span>
                <span className="mt-0.5">{label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {nakesLinkCompany ? (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Tutup Link Input NAKES"
            onClick={() => setNakesLinkCompany(null)}
            className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
          />
          <section className="relative w-full max-w-2xl overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 bg-gradient-to-r from-slate-950 via-blue-900 to-teal-600 px-5 py-5 text-white md:px-7">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-white/65">
                  Direct Link Form NAKES
                </div>
                <h2 className="mt-1 text-2xl font-black">Link Input NAKES</h2>
                <p className="mt-1 text-sm font-bold text-white/75">
                  {clean(nakesLinkCompany.name)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setNakesLinkCompany(null)}
                className="rounded-full bg-white/15 px-3 py-2 text-xs font-black ring-1 ring-white/20"
              >
                Tutup
              </button>
            </div>

            <div className="space-y-5 p-5 md:p-7">
              <div className="rounded-3xl border border-emerald-100 bg-emerald-50 p-4 text-emerald-950">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-lg text-white">
                    🔗
                  </div>
                  <div>
                    <div className="text-sm font-black">Direct link perusahaan</div>
                    <div className="mt-1 text-xs font-bold leading-5 text-emerald-800">
                      Link otomatis membuka Form NAKES dengan peserta dari perusahaan ini sebagai scope awal.
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                  Share with link
                </label>
                <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-2">
                  <span className="pl-2 text-slate-400">🔗</span>
                  <input
                    readOnly
                    value={companyNakesFormUrl(nakesLinkCompany)}
                    onFocus={(event) => event.currentTarget.select()}
                    className="min-w-0 flex-1 bg-transparent px-2 py-2 text-xs font-bold text-slate-700 outline-none md:text-sm"
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={copyCompanyNakesLink}
                  className="rounded-2xl bg-emerald-600 px-5 py-3.5 text-sm font-black text-white shadow-lg shadow-emerald-100 transition hover:bg-emerald-700"
                >
                  {nakesLinkCopied ? "✓ Link tersalin" : "Copy Link"}
                </button>
                <button
                  type="button"
                  onClick={openCompanyNakesLink}
                  className="rounded-2xl bg-blue-600 px-5 py-3.5 text-sm font-black text-white shadow-lg shadow-blue-100 transition hover:bg-blue-700"
                >
                  Open in New Tab
                </button>
              </div>

              <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs font-bold leading-5 text-amber-900">
                Form tetap memakai autentikasi, field pemeriksaan, API, dan proses simpan NAKES yang sudah berjalan. Tidak ada perubahan database atau rules.
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {menuOpen ? (
        <div className="fixed inset-0 z-[100]">
          <button type="button" aria-label="Tutup menu" onClick={() => setMenuOpen(false)} className="absolute inset-0 bg-slate-950/55" />
          <aside className="absolute bottom-2 right-2 top-2 flex w-[min(22rem,calc(100vw-1rem))] flex-col overflow-hidden rounded-[1.8rem] bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-3 bg-gradient-to-br from-slate-950 via-blue-900 to-teal-600 p-5 text-white">
              <div><div className="text-[10px] font-black uppercase tracking-[0.16em] text-white/65">Harmony Health</div><div className="mt-1 text-xl font-black">Menu Admin</div><div className="mt-1 break-words text-xs font-bold text-white/75">{admin.name}</div></div>
              <button type="button" onClick={() => setMenuOpen(false)} className="rounded-full bg-white/15 px-3 py-2 text-xs font-black">Tutup</button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50 p-3">
              {[
                ["🏠", "Dashboard", "home"],
                ["🏢", "Perusahaan", "companies"],
                ["🧩", "Kelompok & Ranking", "ranking"],
                ["🧭", "Coach", "coaches"],
                ["👥", "Peserta", "participants"],
                ["🚩", "Monitoring & Flag", "monitoring"],
                ["💬", "Komunikasi", "communication"],
                ["📄", "Laporan", "reports"],
                ["🙍", "Profil Admin", "profile"],
              ].map(([icon, label, nextView]) => (
                <button key={String(label)} type="button" onClick={() => openView(nextView as View)} className="mb-2 flex w-full items-center gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3 text-left shadow-sm"><span className="text-xl">{icon}</span><span className="text-sm font-black text-slate-800">{label}</span></button>
              ))}
              {["admin", "super_admin", "wellness_admin"].includes(
                clean(admin.role).toLowerCase(),
              ) ? (
                <a
                  href="/wellness/admin/maintenance"
                  className="mb-2 flex w-full items-center gap-3 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-left shadow-sm"
                >
                  <span className="text-xl">🧹</span>
                  <span className="text-sm font-black text-amber-900">
                    Maintenance · Kelola Data Dummy
                  </span>
                </a>
              ) : null}
              <a
                href="/wellness/admin/users"
                className="mb-2 flex w-full items-center gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3 text-left shadow-sm"
              >
                <span className="text-xl">👤</span>
                <span className="text-sm font-black text-slate-800">User</span>
              </a>
              <a
                href={exportExcelUrl}
                className="mb-2 block rounded-2xl bg-emerald-700 px-4 py-3 text-sm font-black text-white"
              >
                📥 Export Excel Admin
              </a>
              <div className="my-3 border-t border-slate-200" />
              <a href="/wellness/dashboard" className="mb-2 block rounded-2xl bg-blue-50 px-4 py-3 text-sm font-black text-blue-800">Wellness Management</a>
              <a href="/dashboard" className="mb-2 block rounded-2xl bg-slate-200 px-4 py-3 text-sm font-black text-slate-800">Dashboard Operasional</a>
              <button type="button" onClick={logout} className="w-full rounded-2xl bg-rose-600 px-4 py-3 text-left text-sm font-black text-white">🚪 Logout</button>
            </div>
          </aside>
        </div>
      ) : null}
    </main>
  );
}
