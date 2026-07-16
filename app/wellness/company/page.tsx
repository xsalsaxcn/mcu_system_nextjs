"use client";

import { useEffect, useMemo, useState } from "react";
import CompanyCoachChatPanel from "@/components/wellness/CompanyCoachChatPanel";
import SupportChatPanel from "@/components/wellness/SupportChatPanel";
import WellnessProfilePanel, {
  WellnessAvatar,
  WellnessProfileAvatar,
} from "@/components/wellness/WellnessProfile";

// WELLNESS_COMPANY_PORTAL_EXECUTIVE_V78
// WELLNESS_COMPANY_MOBILE_INLINE_LOGIN_V78A
// Company-scoped executive dashboard with rankings per kelompok, ranking
// between kelompok, participant leaderboard, Coach/Admin communication,
// profile, and mobile-first navigation.

type View =
  | "overview"
  | "groups"
  | "group_detail"
  | "participants"
  | "coach_chat"
  | "profile";

type Metric =
  | "overall"
  | "diligence"
  | "workout"
  | "nutrition"
  | "healthtalk"
  | "streak";

const METRICS: { key: Metric; label: string; icon: string }[] = [
  { key: "overall", label: "Keseluruhan", icon: "🏆" },
  { key: "diligence", label: "Kerajinan", icon: "✅" },
  { key: "workout", label: "Workout", icon: "🔥" },
  { key: "nutrition", label: "Nutrisi", icon: "🥗" },
  { key: "healthtalk", label: "Health Talk", icon: "🎤" },
  { key: "streak", label: "Streak", icon: "⚡" },
];

function clean(value: any) {
  return String(value ?? "").trim();
}

function fmt(value: any, maximumFractionDigits = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "0";
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits }).format(number);
}

function metricValue(item: any, metric: Metric) {
  if (metric === "diligence") return Number(item.diligence_percent || 0);
  if (metric === "workout") return Number(item.workout_achievement_percent || 0);
  if (metric === "nutrition") return Number(item.nutrition_achievement_percent || 0);
  if (metric === "healthtalk") return Number(item.healthtalk_points || 0);
  if (metric === "streak") return Number(item.current_streak || 0);
  return Number(item.overall_score ?? item.total_points ?? 0);
}

function metricSuffix(metric: Metric) {
  if (["diligence", "workout", "nutrition", "overall"].includes(metric)) return "%";
  if (metric === "streak") return " hari";
  return " poin";
}

function flagTone(flag: string) {
  if (flag === "green") return "bg-emerald-50 text-emerald-700 border-emerald-100";
  if (flag === "yellow") return "bg-amber-50 text-amber-800 border-amber-100";
  return "bg-rose-50 text-rose-700 border-rose-100";
}

export default function WellnessCompanyPortalPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [message, setMessage] = useState("Memuat Portal Perusahaan...");
  const [view, setView] = useState<View>("overview");
  const [menuOpen, setMenuOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<any>(null);
  const [metric, setMetric] = useState<Metric>("overall");
  const [unreadCoach, setUnreadCoach] = useState(0);
  const [unreadAdmin, setUnreadAdmin] = useState(0);
  const [sessionRequired, setSessionRequired] = useState(false);
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState("");

  async function load(options?: { quiet?: boolean }) {
    if (!options?.quiet) setLoading(true);

    const result = await fetch("/api/wellness/company/dashboard?days=30", {
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

    if (result.ok) {
      setData(result);
      setSessionRequired(false);
      setLoginError("");
      setMessage(result.message || "Portal Perusahaan aktif.");
      if (selectedGroup) {
        const fresh = (result.group_ranking || []).find(
          (item: any) => Number(item.id) === Number(selectedGroup.id),
        );
        if (fresh) setSelectedGroup(fresh);
      }
    } else {
      const needsSession =
        Number(result.http_status || 0) === 401 ||
        /session perusahaan belum aktif|unauthorized/i.test(
          clean(result.message),
        );

      if (needsSession) {
        setData(null);
        setSessionRequired(true);
      }

      setMessage(result.message || "Portal Perusahaan gagal dimuat.");
    }

    if (!options?.quiet) setLoading(false);
    return result;
  }

  async function loadUnread() {
    const [coachResult, adminResult] = await Promise.all([
      fetch("/api/wellness/company/coach-chat?mode=threads", {
        cache: "no-store",
        credentials: "include",
      })
        .then((response) => response.json())
        .catch(() => ({ ok: false })),
      fetch("/api/wellness/support?mode=summary", {
        cache: "no-store",
        credentials: "include",
        headers: { "x-wellness-actor-context": "company" },
      })
        .then((response) => response.json())
        .catch(() => ({ ok: false })),
    ]);
    if (coachResult.ok) setUnreadCoach(Number(coachResult.unread_count || 0));
    if (adminResult.ok) setUnreadAdmin(Number(adminResult.unread_count || 0));
  }

  useEffect(() => {
    void load().then((result) => {
      if (result?.ok) void loadUnread();
    });

    const timer = window.setInterval(() => {
      if (!sessionRequired) void loadUnread();
    }, 60_000);

    return () => window.clearInterval(timer);
  }, [sessionRequired]);

  const totalUnread = unreadCoach + unreadAdmin;
  const company = data?.company || {};
  const summary = data?.summary || {};
  const groupRanking = data?.group_ranking || [];
  const topParticipants = data?.rankings?.[metric] || [];

  // WELLNESS_COMPANY_INLINE_LOGIN_V78A
  async function loginCompany(event: React.FormEvent) {
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
      setLoginError(result.message || "Login perusahaan gagal.");
      setLoginLoading(false);
      return;
    }

    const dashboardResult = await load();
    if (dashboardResult?.ok) {
      setLoginPassword("");
      await loadUnread();
    } else if (!dashboardResult?.requires_company_selection) {
      setLoginError(
        dashboardResult?.message ||
          "Akun berhasil masuk, tetapi belum memiliki akses Portal Perusahaan.",
      );
    }

    setLoginLoading(false);
  }

  async function chooseCompany(companyId: string) {
    if (!companyId) return;
    setLoading(true);
    const result = await fetch("/api/wellness/company/session", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ company_id: companyId }),
    }).then((response) => response.json());
    if (!result.ok) {
      setMessage(result.message || "Perusahaan gagal dipilih.");
      setLoading(false);
      return;
    }
    await load();
    await loadUnread();
  }

  if (sessionRequired && !loading) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-teal-900 px-4 py-8 text-slate-950">
        <section className="mx-auto max-w-md overflow-hidden rounded-[2rem] bg-white shadow-2xl shadow-slate-950/30">
          <div className="bg-gradient-to-br from-indigo-950 via-blue-800 to-teal-600 p-6 text-white">
            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-white/70">
              Harmony Health
            </div>
            <h1 className="mt-2 text-3xl font-black leading-tight">
              Portal Perusahaan
            </h1>
            <p className="mt-2 text-sm font-bold leading-6 text-white/80">
              Masuk menggunakan akun perusahaan, HR, management, atau admin Wellness.
            </p>
          </div>

          <form onSubmit={loginCompany} className="space-y-4 p-6">
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
                  onClick={() =>
                    setShowLoginPassword((previous) => !previous)
                  }
                  className="text-xs font-black text-teal-700"
                >
                  {showLoginPassword ? "Sembunyikan" : "Tampilkan"}
                </button>
              </div>
              <input
                type={showLoginPassword ? "text" : "password"}
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
              className="h-14 w-full rounded-2xl bg-teal-600 px-4 text-sm font-black text-white shadow-lg shadow-teal-100 disabled:opacity-50"
            >
              {loginLoading ? "Memproses..." : "Masuk ke Portal Perusahaan"}
            </button>

            <div className="rounded-2xl bg-sky-50 px-4 py-3 text-xs font-bold leading-5 text-sky-800">
              Session akan tersimpan pada aplikasi ini. Setelah login berhasil, dashboard perusahaan dibuka otomatis.
            </div>
          </form>
        </section>
      </main>
    );
  }

  if (data?.requires_company_selection) {
    return (
      <main className="min-h-screen bg-[#f4fbfa] px-4 py-8 text-slate-950">
        <section className="mx-auto max-w-lg rounded-[2rem] bg-white p-6 shadow-xl shadow-slate-200/60">
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-teal-600">
            Harmony Health
          </div>
          <h1 className="mt-2 text-3xl font-black">Pilih Perusahaan</h1>
          <p className="mt-2 text-sm font-bold leading-6 text-slate-500">
            Pilih perusahaan yang ingin dipantau melalui Portal Perusahaan.
          </p>
          <select
            className="mt-6 h-14 w-full rounded-2xl border border-slate-200 bg-white px-4 text-base font-black outline-none focus:border-teal-400"
            defaultValue=""
            onChange={(event) => void chooseCompany(event.target.value)}
          >
            <option value="" disabled>
              Pilih perusahaan
            </option>
            {(data.companies || []).map((item: any) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f4fbfa] pb-10 text-slate-950">
      <div className="sticky top-0 z-40 border-b border-teal-100/80 bg-[#f4fbfa]/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <WellnessProfileAvatar
            actorType="company"
            name={company.name || "Perusahaan"}
            size="sm"
          />
          <div className="min-w-0 flex-1">
            <div className="text-[9px] font-black uppercase tracking-[0.16em] text-teal-600">
              Company Portal
            </div>
            <div className="break-words text-sm font-black leading-5 text-slate-950">
              {company.name || "Portal Perusahaan"}
            </div>
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => setNotificationOpen((previous) => !previous)}
              className="relative flex h-11 w-11 items-center justify-center rounded-full bg-white text-lg shadow-sm"
              aria-label="Buka notifikasi"
            >
              🔔
              {totalUnread > 0 ? (
                <span className="absolute -right-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-black text-white ring-2 ring-white">
                  {totalUnread > 99 ? "99+" : totalUnread}
                </span>
              ) : null}
            </button>

            {notificationOpen ? (
              <div className="absolute right-0 top-13 z-50 w-[min(19rem,calc(100vw-2rem))] rounded-[1.4rem] border border-slate-100 bg-white p-3 shadow-2xl">
                <button
                  type="button"
                  onClick={() => {
                    setView("coach_chat");
                    setNotificationOpen(false);
                  }}
                  className="flex w-full items-center justify-between rounded-2xl bg-teal-50 px-4 py-3 text-left"
                >
                  <span className="text-sm font-black text-teal-950">💬 Chat With Coach</span>
                  {unreadCoach > 0 ? (
                    <span className="rounded-full bg-rose-600 px-2.5 py-1 text-xs font-black text-white">
                      {unreadCoach}
                    </span>
                  ) : null}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSupportOpen(true);
                    setNotificationOpen(false);
                  }}
                  className="mt-2 flex w-full items-center justify-between rounded-2xl bg-indigo-50 px-4 py-3 text-left"
                >
                  <span className="text-sm font-black text-indigo-950">🛠️ Chat With Admin</span>
                  {unreadAdmin > 0 ? (
                    <span className="rounded-full bg-rose-600 px-2.5 py-1 text-xs font-black text-white">
                      {unreadAdmin}
                    </span>
                  ) : null}
                </button>
              </div>
            ) : null}
          </div>

          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-950 text-xl font-black text-white"
            aria-label="Buka menu perusahaan"
          >
            ☰
          </button>
        </div>
      </div>

      <section className="mx-auto max-w-6xl px-4 pt-5">
        {loading ? (
          <div className="rounded-2xl bg-white px-4 py-4 text-sm font-bold text-slate-500 shadow-sm">
            Memuat Portal Perusahaan...
          </div>
        ) : null}
        {!loading && message && !data?.company ? (
          <div className="rounded-2xl bg-rose-50 px-4 py-4 text-sm font-bold text-rose-700">
            {message}
          </div>
        ) : null}

        {view === "overview" ? (
          <Overview
            data={data}
            onOpenGroups={() => setView("groups")}
            onOpenGroup={(group) => {
              setSelectedGroup(group);
              setView("group_detail");
            }}
            onOpenParticipants={() => setView("participants")}
          />
        ) : null}

        {view === "groups" ? (
          <GroupRankingList
            groups={groupRanking}
            onOpen={(group) => {
              setSelectedGroup(group);
              setView("group_detail");
            }}
          />
        ) : null}

        {view === "group_detail" && selectedGroup ? (
          <GroupDetail
            group={selectedGroup}
            metric={metric}
            setMetric={setMetric}
            onBack={() => setView("groups")}
          />
        ) : null}

        {view === "participants" ? (
          <ParticipantLeaderboard
            title="Top Participants Perusahaan"
            items={topParticipants}
            metric={metric}
            setMetric={setMetric}
          />
        ) : null}

        {view === "coach_chat" ? (
          <CompanyCoachChatPanel actorRole="company" />
        ) : null}

        {view === "profile" ? (
          <WellnessProfilePanel
            actorType="company"
            actor={{
              id: company.id,
              name: company.name,
              code: company.code,
              email: "",
            }}
            title={company.name}
          />
        ) : null}
      </section>

      {supportOpen ? (
        <SupportChatPanel
          actorType="company"
          onClose={() => {
            setSupportOpen(false);
            void loadUnread();
          }}
        />
      ) : null}

      {menuOpen ? (
        <div className="fixed inset-0 z-[100] bg-slate-950/45 backdrop-blur-sm">
          <button
            type="button"
            onClick={() => setMenuOpen(false)}
            className="absolute inset-0"
            aria-label="Tutup menu"
          />
          <aside className="absolute bottom-3 right-3 top-3 flex w-[calc(100vw-1.5rem)] max-w-[420px] flex-col overflow-hidden rounded-[2rem] bg-white shadow-2xl">
            <div className="bg-gradient-to-br from-indigo-950 via-blue-800 to-teal-600 p-5 text-white">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-white/70">
                    Company Menu
                  </div>
                  <div className="mt-2 break-words text-xl font-black">
                    {company.name || "Perusahaan"}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setMenuOpen(false)}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20 text-xl font-black"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto p-4">
              <MenuButton icon="🏠" title="Dashboard" description="Ringkasan eksekutif program" onClick={() => { setView("overview"); setMenuOpen(false); }} />
              <MenuButton icon="👥" title="Monitoring Kelompok" description="Ranking dan capaian setiap kelompok" onClick={() => { setView("groups"); setMenuOpen(false); }} />
              <MenuButton icon="🌟" title="Top Participants" description="Peserta terbaik seluruh perusahaan" onClick={() => { setView("participants"); setMenuOpen(false); }} />
              <MenuButton icon="💬" title="Chat With Coach" description="Komunikasi dengan Coach kelompok" badge={unreadCoach} onClick={() => { setView("coach_chat"); setMenuOpen(false); }} />
              <MenuButton icon="🛠️" title="Chat With Admin" description="Bantuan teknis dan penggunaan aplikasi" badge={unreadAdmin} onClick={() => { setSupportOpen(true); setMenuOpen(false); }} />
              <MenuButton icon="🏢" title="Profil Perusahaan" description="Data dan foto profil perusahaan" onClick={() => { setView("profile"); setMenuOpen(false); }} />
            </div>

            {data?.can_select_company && (data?.companies || []).length > 1 ? (
              <div className="border-t border-slate-100 p-4">
                <label className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                  Ganti Perusahaan
                </label>
                <select
                  value={company.id || ""}
                  onChange={(event) => void chooseCompany(event.target.value)}
                  className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-black outline-none"
                >
                  {(data.companies || []).map((item: any) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </aside>
        </div>
      ) : null}
    </main>
  );
}

function Overview({ data, onOpenGroups, onOpenGroup, onOpenParticipants }: any) {
  const summary = data?.summary || {};
  const groups = data?.group_ranking || [];
  const participants = data?.top_participants || [];
  const flags = summary.flags || {};

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-[2rem] bg-gradient-to-br from-indigo-950 via-blue-800 to-teal-600 p-5 text-white shadow-xl shadow-blue-100 md:p-7">
        <div className="text-[10px] font-black uppercase tracking-[0.18em] text-white/70">
          Executive Wellness Dashboard
        </div>
        <h1 className="mt-2 break-words text-3xl font-black leading-tight md:text-4xl">
          {data?.company?.name || "Portal Perusahaan"}
        </h1>
        <p className="mt-2 text-sm font-bold leading-6 text-white/80">
          Periode {data?.period?.days || 30} hari · {data?.period?.from || "-"} sampai {data?.period?.to || "-"}
        </p>

        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <HeroStat label="Peserta" value={fmt(summary.total_participants)} />
          <HeroStat label="Kepatuhan" value={`${fmt(summary.compliance_rate)}%`} />
          <HeroStat label="Kelompok" value={fmt(summary.group_count)} />
          <HeroStat label="Coach" value={fmt(summary.coach_count)} />
        </div>
      </section>

      <section className="grid grid-cols-3 gap-2">
        <FlagCard label="Green Flag" value={flags.green} tone="green" />
        <FlagCard label="Yellow Flag" value={flags.yellow} tone="yellow" />
        <FlagCard label="Red Flag" value={flags.red} tone="red" />
      </section>

      <section className="rounded-[1.75rem] bg-white p-4 shadow-lg shadow-slate-200/50 md:p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.16em] text-violet-600">Group Performance</div>
            <h2 className="mt-1 text-xl font-black">Ranking Antarkelompok</h2>
          </div>
          <button type="button" onClick={onOpenGroups} className="rounded-full bg-violet-50 px-3 py-2 text-xs font-black text-violet-700">Lihat Semua</button>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {groups.slice(0, 3).map((group: any) => (
            <button key={group.id} type="button" onClick={() => onOpenGroup(group)} className="rounded-[1.5rem] border border-violet-100 bg-gradient-to-br from-violet-950 via-purple-800 to-fuchsia-700 p-4 text-left text-white shadow-lg">
              <div className="flex items-start justify-between gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-lg font-black">{group.rank}</div>
                <div className="text-2xl font-black text-amber-300">{fmt(group.overall_score)}%</div>
              </div>
              <div className="mt-4 break-words text-base font-black leading-5">{group.name}</div>
              <div className="mt-1 break-words text-[11px] font-bold leading-4 text-white/70">{(group.coaches || []).map((coach: any) => coach.name).join(", ") || "Coach belum di-assign"}</div>
              <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-black">
                <span className="rounded-full bg-white/10 px-2 py-1">{fmt(group.member_count)} peserta</span>
                <span className="rounded-full bg-emerald-400/20 px-2 py-1">🟢 {fmt(group.flags?.green)}</span>
                <span className="rounded-full bg-rose-400/20 px-2 py-1">🔴 {fmt(group.flags?.red)}</span>
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-[1.75rem] bg-white p-4 shadow-lg shadow-slate-200/50 md:p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.16em] text-teal-600">Top Performance</div>
            <h2 className="mt-1 text-xl font-black">Peserta Terbaik</h2>
          </div>
          <button type="button" onClick={onOpenParticipants} className="rounded-full bg-teal-50 px-3 py-2 text-xs font-black text-teal-700">Top 10</button>
        </div>
        <div className="mt-4 space-y-2">
          {participants.slice(0, 5).map((item: any) => <ParticipantRow key={item.id} item={item} metric="overall" />)}
        </div>
      </section>

      <BeforeAfter items={data?.before_after || []} />
    </div>
  );
}

function GroupRankingList({ groups, onOpen }: any) {
  return (
    <section className="rounded-[1.75rem] bg-white p-4 shadow-lg shadow-slate-200/50 md:p-5">
      <div className="text-[10px] font-black uppercase tracking-[0.16em] text-violet-600">Company Ranking</div>
      <h1 className="mt-1 text-2xl font-black">Ranking Kelompok</h1>
      <p className="mt-2 text-sm font-bold leading-6 text-slate-500">Skor dinormalisasi agar kelompok dengan jumlah anggota berbeda tetap dibandingkan secara adil.</p>
      <div className="mt-5 space-y-3">
        {(groups || []).map((group: any) => (
          <button key={group.id} type="button" onClick={() => onOpen(group)} className="flex w-full items-center gap-3 rounded-[1.4rem] border border-slate-100 bg-slate-50 p-3 text-left transition active:scale-[0.99]">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-violet-100 text-base font-black text-violet-700">{group.rank}</div>
            <div className="min-w-0 flex-1">
              <div className="break-words text-sm font-black leading-5 text-slate-950">{group.name}</div>
              <div className="mt-1 break-words text-[10px] font-bold leading-4 text-slate-500">{(group.coaches || []).map((coach: any) => coach.name).join(", ") || "Coach belum di-assign"} · {fmt(group.member_count)} peserta</div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500" style={{ width: `${Math.min(100, Number(group.overall_score || 0))}%` }} /></div>
            </div>
            <div className="shrink-0 text-right"><div className="text-xl font-black text-violet-700">{fmt(group.overall_score)}%</div><div className="text-[9px] font-black uppercase text-slate-400">Capaian</div></div>
          </button>
        ))}
      </div>
    </section>
  );
}

function GroupDetail({ group, metric, setMetric, onBack }: any) {
  const items = group?.rankings?.[metric] || [];
  return (
    <div className="space-y-4">
      <section className="rounded-[1.75rem] bg-gradient-to-br from-violet-950 via-purple-800 to-fuchsia-700 p-5 text-white shadow-xl">
        <button type="button" onClick={onBack} className="rounded-full bg-white/15 px-3 py-2 text-xs font-black">← Ranking Kelompok</button>
        <div className="mt-4 text-[10px] font-black uppercase tracking-[0.16em] text-white/70">Kelompok #{group.rank}</div>
        <h1 className="mt-1 break-words text-2xl font-black leading-tight">{group.name}</h1>
        <div className="mt-2 break-words text-xs font-bold leading-5 text-white/75">Coach: {(group.coaches || []).map((coach: any) => coach.name).join(", ") || "Belum di-assign"}</div>
        <div className="mt-4 grid grid-cols-3 gap-2"><HeroStat label="Capaian" value={`${fmt(group.overall_score)}%`} /><HeroStat label="Peserta" value={fmt(group.member_count)} /><HeroStat label="Red Flag" value={fmt(group.flags?.red)} /></div>
      </section>
      <ParticipantLeaderboard title={`Ranking ${group.name}`} items={items} metric={metric} setMetric={setMetric} />
    </div>
  );
}

function ParticipantLeaderboard({ title, items, metric, setMetric }: any) {
  return (
    <section className="overflow-hidden rounded-[1.75rem] bg-white shadow-lg shadow-slate-200/50">
      <div className="p-4 md:p-5">
        <div className="text-[10px] font-black uppercase tracking-[0.16em] text-teal-600">Leaderboard</div>
        <h1 className="mt-1 break-words text-2xl font-black leading-tight">{title}</h1>
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {METRICS.map((item) => (
            <button key={item.key} type="button" onClick={() => setMetric(item.key)} className={`shrink-0 rounded-full px-3 py-2 text-xs font-black ${metric === item.key ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-600"}`}>{item.icon} {item.label}</button>
          ))}
        </div>
      </div>
      <div className="divide-y divide-slate-100">
        {(items || []).map((item: any) => <ParticipantRow key={`${item.id}-${metric}`} item={item} metric={metric} />)}
      </div>
    </section>
  );
}

function ParticipantRow({ item, metric }: any) {
  const value = metricValue(item, metric);
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="w-6 shrink-0 text-center text-sm font-black text-slate-400">{item.rank || "-"}</div>
      <WellnessAvatar name={item.name} src={item.profile_photo_preview_url || item.profile_photo_url} size="md" />
      <div className="min-w-0 flex-1">
        <div className="break-words text-sm font-black leading-5 text-slate-950">{item.name}</div>
        <div className="mt-1 break-words text-[10px] font-bold leading-4 text-slate-500">{item.kelompok_name} · {item.group_name} · {fmt(item.total_points)} poin · 🔥 {fmt(item.current_streak)} hari</div>
      </div>
      <div className="shrink-0 text-right"><div className="text-lg font-black text-teal-700">{fmt(value)}{metricSuffix(metric)}</div><div className={`mt-1 rounded-full border px-2 py-1 text-[9px] font-black ${flagTone(item.flag)}`}>{item.flag_label}</div></div>
    </div>
  );
}

function BeforeAfter({ items }: any) {
  return (
    <section className="rounded-[1.75rem] bg-white p-4 shadow-lg shadow-slate-200/50 md:p-5">
      <div className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-600">Program Outcome</div>
      <h2 className="mt-1 text-xl font-black">Before–After Agregat</h2>
      <p className="mt-2 text-xs font-bold leading-5 text-slate-500">Ringkasan perusahaan tanpa menampilkan diagnosis individual.</p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {(items || []).map((item: any) => (
          <div key={item.key} className="rounded-[1.35rem] border border-slate-100 bg-slate-50 p-4">
            <div className="flex items-start justify-between gap-3"><div><div className="text-xs font-black text-slate-900">{item.label}</div><div className="mt-1 text-[10px] font-bold text-slate-400">{fmt(item.participant_count)} peserta terukur</div></div><div className={`rounded-full px-2.5 py-1 text-[10px] font-black ${Number(item.delta) < 0 ? "bg-emerald-50 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>{Number(item.delta) > 0 ? "+" : ""}{fmt(item.delta, 1)} {item.unit}</div></div>
            <div className="mt-4 flex items-center justify-between gap-3"><div><div className="text-[9px] font-black uppercase text-slate-400">Baseline</div><div className="mt-1 text-lg font-black">{fmt(item.baseline, 1)} {item.unit}</div></div><div className="text-slate-300">→</div><div className="text-right"><div className="text-[9px] font-black uppercase text-slate-400">Terkini</div><div className="mt-1 text-lg font-black text-teal-700">{fmt(item.current, 1)} {item.unit}</div></div></div>
          </div>
        ))}
      </div>
    </section>
  );
}

function HeroStat({ label, value }: any) {
  return <div className="rounded-2xl bg-white/10 px-3 py-3 backdrop-blur"><div className="text-[9px] font-black uppercase tracking-wide text-white/65">{label}</div><div className="mt-1 break-words text-xl font-black text-white">{value}</div></div>;
}

function FlagCard({ label, value, tone }: any) {
  const classes = tone === "green" ? "border-emerald-100 bg-emerald-50 text-emerald-700" : tone === "yellow" ? "border-amber-100 bg-amber-50 text-amber-800" : "border-rose-100 bg-rose-50 text-rose-700";
  return <div className={`rounded-[1.3rem] border p-3 ${classes}`}><div className="text-2xl font-black">{fmt(value)}</div><div className="mt-1 break-words text-[10px] font-black leading-4">{label}</div></div>;
}

function MenuButton({ icon, title, description, badge, onClick }: any) {
  return <button type="button" onClick={onClick} className="flex w-full items-center gap-3 rounded-[1.4rem] border border-slate-100 bg-white p-3 text-left transition active:bg-slate-50"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-50 text-xl">{icon}</div><div className="min-w-0 flex-1"><div className="break-words text-sm font-black text-slate-950">{title}</div><div className="mt-1 break-words text-[11px] font-bold leading-4 text-slate-500">{description}</div></div>{Number(badge) > 0 ? <span className="rounded-full bg-rose-600 px-2.5 py-1 text-xs font-black text-white">{badge}</span> : null}</button>;
}
