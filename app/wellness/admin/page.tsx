"use client";

import { useEffect, useMemo, useState } from "react";

// WELLNESS_ADMIN_MOBILE_FOUNDATION_V79B
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

function roleLabel(role: any) {
  return clean(role)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function flagOf(item: any) {
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

function avatarTone(index: number) {
  return [
    "from-teal-500 to-cyan-600",
    "from-violet-500 to-indigo-600",
    "from-orange-500 to-rose-500",
    "from-sky-500 to-blue-600",
  ][index % 4];
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

  async function load(options?: { quiet?: boolean }) {
    if (!options?.quiet) setLoading(true);

    const [structureResult, participantResult] = await Promise.all([
      fetch("/api/wellness/admin/dashboard", {
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
        })),
      fetch("/api/wellness/dashboard", {
        cache: "no-store",
        credentials: "include",
      })
        .then((response) => response.json())
        .catch(() => ({ ok: false })),
    ]);

    if (structureResult.ok) {
      setData(structureResult);
      setSessionRequired(false);
      setLoginError("");
      setMessage("Portal Admin aktif.");
      if (participantResult.ok) setWellnessData(participantResult);
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
    void load();
  }, []);

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

  const rows = wellnessData?.rows || [];
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
    return companies
      .map((company: any) => {
        const companyRows = rows.filter(
          (item: any) =>
            clean(item.company_name).toLowerCase() ===
            clean(company.name).toLowerCase(),
        );
        const good = companyRows.filter(
          (item: any) => flagOf(item) === "green",
        ).length;
        const compliance = companyRows.length
          ? Math.round((good / companyRows.length) * 100)
          : 0;
        return {
          ...company,
          compliance,
          flags: {
            green: good,
            yellow: companyRows.filter((item: any) => flagOf(item) === "yellow")
              .length,
            red: companyRows.filter((item: any) => flagOf(item) === "red")
              .length,
          },
        };
      })
      .sort((left: any, right: any) => right.compliance - left.compliance);
  }, [companies, rows]);

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

  const unreadPriority = flags.red + Number(wellnessData?.summary?.pending_evidence_count || 0);

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

  return (
    <main className="min-h-screen bg-[#f4f8fb] pb-24 text-slate-950">
      <div className="mx-auto max-w-3xl px-3 py-3 sm:px-5 sm:py-5">
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
                      className="mt-2 block rounded-2xl bg-indigo-50 px-4 py-3 text-sm font-black text-indigo-950"
                    >
                      💬 Buka Admin Support Inbox
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

        <div className="mt-4">
          {view === "home" ? (
            <div className="space-y-4">
              <section className="grid grid-cols-2 gap-3">
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
                </div>
              </section>

              <section className="rounded-[1.65rem] border border-slate-100 bg-white p-4 shadow-sm">
                <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                  Quick Action
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2.5">
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
            <section className="space-y-3">
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
                  <a
                    href={`/wellness/company?company_id=${company.id}`}
                    className="mt-3 block rounded-2xl bg-slate-950 px-4 py-3 text-center text-xs font-black text-white"
                  >
                    Buka Portal Perusahaan
                  </a>
                </article>
              ))}
              {enrichedCompanies.length === 0 ? (
                <EmptyState icon="🏢" title="Belum ada perusahaan" text="Tambahkan perusahaan melalui Wellness Management." />
              ) : null}
            </section>
          ) : null}

          {view === "coaches" ? (
            <section className="space-y-3">
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
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Cari nama, kode, perusahaan, atau kelompok"
                className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-100"
              />
              {filteredParticipants.map((item: any, index: number) => {
                const flag = flagOf(item);
                return (
                  <article key={item.id || index} className="rounded-[1.45rem] border border-slate-100 bg-white p-3.5 shadow-sm">
                    <div className="flex items-start gap-3">
                      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${avatarTone(index + 2)} text-xs font-black text-white`}>
                        {initials(item.name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="break-words text-sm font-black leading-5 text-slate-950">{item.name}</div>
                        <div className="mt-0.5 break-words text-[10px] font-bold leading-4 text-slate-500">{item.code || "-"} · {item.company_name || "-"} · {item.group_name || "-"}</div>
                      </div>
                      <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[9px] font-black uppercase ${flagTone(flag)}`}>{flag}</span>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-xl bg-slate-50 p-2"><div className="text-[9px] font-black text-slate-400">POINT</div><div className="mt-0.5 text-sm font-black">{fmt(item.total_points)}</div></div>
                      <div className="rounded-xl bg-slate-50 p-2"><div className="text-[9px] font-black text-slate-400">BMI</div><div className="mt-0.5 text-sm font-black">{fmt(item.bmi, 1)}</div></div>
                      <div className="rounded-xl bg-slate-50 p-2"><div className="text-[9px] font-black text-slate-400">STATUS</div><div className="mt-0.5 truncate text-[10px] font-black">{item.compliance_status || "-"}</div></div>
                    </div>
                  </article>
                );
              })}
              {filteredParticipants.length === 0 ? (
                <EmptyState icon="👥" title="Peserta tidak ditemukan" text="Ubah kata pencarian atau periksa data peserta." />
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
                    <article key={item.id || index} className="rounded-[1.4rem] border border-rose-100 bg-white p-3.5 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="break-words text-sm font-black leading-5 text-slate-950">{item.name}</div>
                          <div className="mt-1 break-words text-[10px] font-bold text-slate-500">{item.company_name} · {item.group_name}</div>
                        </div>
                        <span className="rounded-full bg-rose-600 px-2.5 py-1 text-[9px] font-black text-white">RED</span>
                      </div>
                      <div className="mt-2 text-xs font-bold leading-5 text-rose-800">{(item.risk_flags || []).join(" · ") || item.compliance_status || "Membutuhkan follow-up"}</div>
                    </article>
                  ))}
              </div>
              {flags.red === 0 ? (
                <EmptyState icon="✅" title="Tidak ada Red Flag" text="Belum ada peserta prioritas yang perlu ditindaklanjuti." />
              ) : null}
            </section>
          ) : null}

          {view === "ranking" ? (
            <section className="space-y-4">
              <div className="rounded-[1.55rem] border border-slate-100 bg-white p-4 shadow-sm">
                <div className="text-[10px] font-black uppercase tracking-[0.14em] text-sky-500">Ranking Perusahaan</div>
                <div className="mt-3 space-y-2">
                  {enrichedCompanies.slice(0, 10).map((company: any, index: number) => (
                    <div key={company.id} className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-950 text-xs font-black text-white">{index + 1}</div>
                      <div className="min-w-0 flex-1">
                        <div className="break-words text-sm font-black leading-5">{company.name}</div>
                        <div className="mt-0.5 text-[10px] font-bold text-slate-500">{fmt(company.participant_count)} peserta</div>
                      </div>
                      <div className="text-lg font-black text-teal-700">{fmt(company.compliance)}%</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-[1.55rem] border border-slate-100 bg-white p-4 shadow-sm">
                <div className="text-[10px] font-black uppercase tracking-[0.14em] text-violet-500">Top Participants</div>
                <div className="mt-3 space-y-2">
                  {topParticipants.map((item: any, index: number) => (
                    <div key={item.id || index} className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-600 text-xs font-black text-white">{index + 1}</div>
                      <div className="min-w-0 flex-1">
                        <div className="break-words text-sm font-black leading-5">{item.name}</div>
                        <div className="mt-0.5 break-words text-[10px] font-bold text-slate-500">{item.company_name} · {item.group_name}</div>
                      </div>
                      <div className="shrink-0 text-right"><div className="text-base font-black text-violet-700">{fmt(item.total_points)}</div><div className="text-[9px] font-bold text-slate-400">poin</div></div>
                    </div>
                  ))}
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
              <div className="rounded-[1.5rem] border border-dashed border-slate-200 bg-white p-4"><div className="text-sm font-black">Export PDF, Excel, dan Presentation Summary</div><div className="mt-1 text-xs font-bold leading-5 text-slate-500">Paket laporan mobile dilanjutkan pada V79E.</div></div>
            </section>
          ) : null}

          {view === "profile" ? (
            <section className="rounded-[1.7rem] border border-slate-100 bg-white p-5 shadow-sm">
              <div className="flex flex-col items-center text-center">
                <div className="flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-slate-950 via-blue-800 to-teal-500 text-2xl font-black text-white shadow-lg">{initials(admin.name)}</div>
                <div className="mt-4 break-words text-xl font-black text-slate-950">{admin.name}</div>
                <div className="mt-1 text-xs font-bold text-slate-500">@{admin.username || "admin"}</div>
                <span className="mt-3 rounded-full bg-blue-50 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-blue-700">{roleLabel(admin.role)}</span>
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

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-12px_30px_rgba(15,23,42,0.08)] backdrop-blur">
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
