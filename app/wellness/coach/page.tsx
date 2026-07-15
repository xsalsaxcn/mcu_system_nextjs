"use client";

// WELLNESS_COACH_MOBILE_TABLE_MODAL_V58
// WELLNESS_COACH_DETAIL_POINTS_INSTRUCTION_V59
// WELLNESS_COACH_ADMIN_SUPPORT_V61
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import SupportChatPanel from "@/components/wellness/SupportChatPanel";

// WELLNESS_COACH_PORTAL_FLAGS_TARGETS_V53
// WELLNESS_COACH_COMPACT_LIST_ACTION_CHAT_V54
// WELLNESS_COACH_TABLE_DETAIL_CHARTS_V55
// WELLNESS_COACH_MODAL_RESPONSIVE_CHARTS_V56
// WELLNESS_COACH_MODAL_PORTAL_MISSING_DAYS_V57
// Extends the existing Coach Portal without changing database schema or other modules.

type FlagLevel = "green" | "yellow" | "red";
type CoachView = "monitoring" | "chat" | "support";
type CoachParticipantDetail = {
  ok: boolean;
  message?: string;
  participant?: any;
  summary?: any;
  point_breakdown?: any;
  charts?: Record<string, any[]>;
  healthtalks?: any[];
};
type CoachDashboard = {
  ok: boolean;
  message?: string;
  coach?: any;
  groups?: any[];
  summary?: any;
  participants?: any[];
  notes?: any[];
  today?: string;
  monitoring_period?: any;
};

function clean(value: any) {
  return String(value || "").trim();
}

function fmtNumber(value: any, digits = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0";
  return new Intl.NumberFormat("id-ID", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(n);
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function formatReadAt(value: any) {
  if (!value) return "Belum dibaca";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sudah dibaca";
  return `Sudah dibaca ${new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)}`;
}

function formatChatTime(value: any) {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatDaysWithoutInput(value: any) {
  const days = Number(value);
  if (!Number.isFinite(days) || days >= 99) return "Belum pernah";
  if (days <= 0) return "Hari ini";
  if (days === 1) return "1 hari";
  return `${Math.floor(days)} hari`;
}

const fieldClass =
  "rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-100";

export default function WellnessCoachPortalPage() {
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("Masuk menggunakan akun coach.");
  const [login, setLogin] = useState({ email: "", access_code: "" });
  const [dashboard, setDashboard] = useState<CoachDashboard | null>(null);
  const [selectedGroup, setSelectedGroup] = useState("all");
  const [flagFilter, setFlagFilter] = useState<"all" | FlagLevel>("all");
  const [search, setSearch] = useState("");
  const [selectedParticipant, setSelectedParticipant] = useState<any>(null);
  const [participantDetail, setParticipantDetail] = useState<CoachParticipantDetail | null>(null);
  const [participantDetailLoading, setParticipantDetailLoading] = useState(false);
  const [participantModalOpen, setParticipantModalOpen] = useState(false);
  const [coachView, setCoachView] = useState<CoachView>("monitoring");
  const [coachMenuOpen, setCoachMenuOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatText, setChatText] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatSending, setChatSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [instructionGroup, setInstructionGroup] = useState("");
  const [instructionScope, setInstructionScope] = useState<"participant" | "group">(
    "participant"
  );
  const [instructionForm, setInstructionForm] = useState({
    session_date: todayDate(),
    topic: "Instruksi Wellness",
    main_issue: "",
    coach_note: "",
    action_workout_calories: "",
    action_nutrition_calories: "",
    action_target_weight: "",
    follow_up_status: "Open",
    next_follow_up_date: "",
  });
  const [targetForm, setTargetForm] = useState({
    nutrition_max_calories: "",
    workout_min_calories: "",
    target_weight_kg: "",
    coach_note: "",
    next_follow_up_date: "",
  });

  async function loadDashboard(options?: { keepSelection?: boolean }) {
    setLoading(true);
    const result = await fetch("/api/wellness/coach/dashboard", { cache: "no-store" })
      .then((response) => response.json())
      .catch((error) => ({ ok: false, message: error?.message || "Network error" }));

    if (result.ok) {
      setDashboard(result);
      setMessage("Portal Coach aktif.");
      if (options?.keepSelection && selectedParticipant?.id) {
        const fresh = (result.participants || []).find(
          (item: any) => Number(item.id) === Number(selectedParticipant.id)
        );
        if (fresh) setSelectedParticipant(fresh);
      }
    } else {
      setDashboard(null);
      setMessage(result.message || "Session coach belum aktif.");
    }

    setLoading(false);
    return result;
  }

  async function submitLogin() {
    if (!clean(login.email) || !clean(login.access_code)) {
      setMessage("Email dan access code wajib diisi.");
      return;
    }
    setLoading(true);
    setMessage("Login coach...");
    const result = await fetch("/api/wellness/coach/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(login),
    })
      .then((response) => response.json())
      .catch((error) => ({ ok: false, message: error?.message || "Network error" }));

    if (result.ok) await loadDashboard();
    else {
      setMessage(result.message || "Login gagal.");
      setLoading(false);
    }
  }

  async function logout() {
    await fetch("/api/wellness/coach/me", { method: "DELETE" }).catch(() => null);
    setDashboard(null);
    setSelectedParticipant(null);
    setParticipantDetail(null);
    setChatMessages([]);
    setCoachView("monitoring");
    setCoachMenuOpen(false);
    setMessage("Coach logout berhasil.");
  }

  async function loadParticipantDetail(item: any) {
    const participantId = Number(item?.id || 0);
    if (!participantId) {
      setParticipantDetail(null);
      return;
    }

    setParticipantDetailLoading(true);
    const result = await fetch(
      `/api/wellness/coach/participant-detail?participant_id=${participantId}`,
      { cache: "no-store" }
    )
      .then((response) => response.json())
      .catch((error) => ({ ok: false, message: error?.message || "Network error" }));

    if (result.ok) setParticipantDetail(result);
    else {
      setParticipantDetail(null);
      setMessage(result.message || "Gagal memuat detail peserta.");
    }
    setParticipantDetailLoading(false);
  }

  function chooseParticipant(
    item: any,
    options?: { openDetail?: boolean }
  ) {
    setSelectedParticipant(item);
    setParticipantDetail(null);
    setTargetForm({
      nutrition_max_calories: item?.targets?.nutrition_max_calories
        ? String(item.targets.nutrition_max_calories)
        : "",
      workout_min_calories: item?.targets?.workout_min_calories
        ? String(item.targets.workout_min_calories)
        : "",
      target_weight_kg: item?.targets?.target_weight_kg
        ? String(item.targets.target_weight_kg)
        : "",
      coach_note: "",
      next_follow_up_date: "",
    });
    if (options?.openDetail !== false) setParticipantModalOpen(true);
    void loadParticipantDetail(item);
  }

  function applyFlagFilter(level: FlagLevel) {
    setFlagFilter(level);
    window.setTimeout(() => {
      document.getElementById("coach-participant-table")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 80);
  }

  function openInstruction(scope: "participant" | "group") {
    if (scope === "participant" && !selectedParticipant) {
      setMessage("Pilih peserta sebelum menambah instruksi individual.");
      return;
    }
    if (scope === "group" && groups.length === 0) {
      setMessage("Belum ada assigned group untuk coach ini.");
      return;
    }

    const defaultGroup =
      selectedGroup !== "all"
        ? selectedGroup
        : String(
            groups[0]?.wellness_group_unit_id ||
              groups[0]?.group_name ||
              ""
          );

    setInstructionScope(scope);
    setInstructionGroup(scope === "group" ? defaultGroup : "");
    setInstructionForm((previous) => ({
      ...previous,
      topic: scope === "group" ? "Instruksi Kelompok" : "Instruksi Individual",
      main_issue: "",
      coach_note: "",
      action_workout_calories: "",
      action_nutrition_calories: "",
      action_target_weight: "",
      next_follow_up_date: "",
    }));
    setComposerOpen(true);
  }

  async function saveInstruction() {
    const targetGroupKey =
      instructionScope === "group" ? instructionGroup : selectedGroup;
    const group = (dashboard?.groups || []).find(
      (item: any) =>
        String(item.wellness_group_unit_id || item.group_name) === targetGroupKey
    );

    if (instructionScope === "group" && !group) {
      setMessage("Pilih kelompok penerima instruksi.");
      return;
    }
    const actionPlan = [
      clean(instructionForm.action_workout_calories)
        ? `Target Workout: ${clean(instructionForm.action_workout_calories)} kkal/hari`
        : "",
      clean(instructionForm.action_nutrition_calories)
        ? `Target Nutrisi: ${clean(instructionForm.action_nutrition_calories)} kkal/hari`
        : "",
      clean(instructionForm.action_target_weight)
        ? `Target BB: ${clean(instructionForm.action_target_weight)} kg`
        : "",
    ]
      .filter(Boolean)
      .join("\n");

    setSaving(true);
    setMessage("Mengirim instruksi coach...");

    const result = await fetch("/api/wellness/coach/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "save_instruction",
        scope: instructionScope,
        participant_id: selectedParticipant?.id || null,
        wellness_group_unit_id: group?.wellness_group_unit_id || null,
        group_name: group?.group_name || selectedParticipant?.group_name || "",
        session_date: instructionForm.session_date,
        topic: instructionForm.topic,
        main_issue: instructionForm.main_issue,
        coach_note: instructionForm.coach_note,
        action_plan: actionPlan,
        follow_up_status: instructionForm.follow_up_status,
        next_follow_up_date: instructionForm.next_follow_up_date,
      }),
    })
      .then((response) => response.json())
      .catch((error) => ({ ok: false, message: error?.message || "Network error" }));

    if (result.ok) {
      setMessage(result.message || "Instruksi berhasil dikirim.");
      setComposerOpen(false);
      await loadDashboard({ keepSelection: true });
    } else setMessage(result.message || "Gagal mengirim instruksi.");
    setSaving(false);
  }

  async function saveTargets() {
    if (!selectedParticipant) return;
    setSaving(true);
    setMessage("Menyimpan target peserta...");

    const result = await fetch("/api/wellness/coach/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "save_targets",
        participant_id: selectedParticipant.id,
        nutrition_max_calories: targetForm.nutrition_max_calories,
        workout_min_calories: targetForm.workout_min_calories,
        target_weight_kg: targetForm.target_weight_kg,
        coach_note: targetForm.coach_note,
        next_follow_up_date: targetForm.next_follow_up_date,
      }),
    })
      .then((response) => response.json())
      .catch((error) => ({ ok: false, message: error?.message || "Network error" }));

    if (result.ok) {
      setMessage(result.message || "Target peserta berhasil disimpan.");
      await loadDashboard({ keepSelection: true });
    } else setMessage(result.message || "Gagal menyimpan target peserta.");
    setSaving(false);
  }

  async function loadMemberChat(participant = selectedParticipant) {
    const participantId = Number(participant?.id || 0);
    if (!participantId) {
      setChatMessages([]);
      return;
    }

    setChatLoading(true);
    const result = await fetch(
      `/api/wellness/coach/notes?participant_id=${participantId}&mode=chat`,
      { cache: "no-store" }
    )
      .then((response) => response.json())
      .catch((error) => ({ ok: false, message: error?.message || "Network error" }));

    if (result.ok) {
      const rows = Array.isArray(result.messages) ? result.messages : [];
      setChatMessages(rows);

      const unreadMemberIds = rows
        .filter((item: any) => item.sender === "participant" && !item.is_read)
        .map((item: any) => Number(item.id))
        .filter(Boolean);

      if (unreadMemberIds.length > 0) {
        await fetch("/api/wellness/coach/notes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "mark_chat_read",
            participant_id: participantId,
            note_ids: unreadMemberIds,
          }),
        }).catch(() => null);

        setChatMessages((current) =>
          current.map((item) =>
            unreadMemberIds.includes(Number(item.id))
              ? { ...item, is_read: true, read_at: new Date().toISOString() }
              : item
          )
        );
      }
    } else {
      setMessage(result.message || "Chat member belum dapat dimuat.");
    }

    setChatLoading(false);
  }

  async function sendMemberChat() {
    const participantId = Number(selectedParticipant?.id || 0);
    const chatMessage = clean(chatText);

    if (!participantId) {
      setMessage("Pilih anggota sebelum mengirim chat.");
      return;
    }
    if (!chatMessage) {
      setMessage("Tulis pesan chat terlebih dahulu.");
      return;
    }

    setChatSending(true);
    const result = await fetch("/api/wellness/coach/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "send_chat",
        participant_id: participantId,
        message: chatMessage,
      }),
    })
      .then((response) => response.json())
      .catch((error) => ({ ok: false, message: error?.message || "Network error" }));

    if (result.ok) {
      setChatText("");
      setMessage("Pesan berhasil dikirim kepada member.");
      await loadMemberChat();
      await loadDashboard({ keepSelection: true });
    } else {
      setMessage(result.message || "Pesan chat gagal dikirim.");
    }

    setChatSending(false);
  }

  useEffect(() => {
    loadDashboard();
  }, []);

  useEffect(() => {
    if (coachView === "chat" && selectedParticipant?.id) {
      loadMemberChat(selectedParticipant);
    }
  }, [coachView, selectedParticipant?.id]);

  const participants = dashboard?.participants || [];
  const groups = dashboard?.groups || [];
  const filteredParticipants = useMemo(() => {
    const q = search.toLowerCase();
    return participants.filter((item: any) => {
      const byGroup =
        selectedGroup === "all" ||
        clean(item.group_name).toLowerCase() === selectedGroup.toLowerCase() ||
        clean(item.raw?.wellness_group_unit_id) === selectedGroup ||
        clean(item.raw?.group_unit_id) === selectedGroup;
      const byFlag = flagFilter === "all" || item.flag === flagFilter;
      const haystack = [
        item.name,
        item.code,
        item.group_name,
        item.risk,
        item.status,
        item.flag_reason,
      ]
        .map((x) => clean(x).toLowerCase())
        .join(" ");
      return byGroup && byFlag && (!q || haystack.includes(q));
    });
  }, [participants, selectedGroup, flagFilter, search]);

  const isLoggedIn = !!dashboard?.coach;

  return (
    <main className="min-h-screen bg-[#f4fbfa] text-slate-900">
      <div className="mx-auto max-w-7xl px-4 py-5 md:px-8 md:py-8">
        <section className="overflow-hidden rounded-[2rem] bg-gradient-to-br from-teal-400 via-sky-400 to-blue-500 p-6 text-white shadow-xl shadow-sky-100 md:p-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.2em] text-white/75">
                Wellness Coach Portal
              </div>
              <h1 className="mt-2 text-3xl font-black md:text-4xl">Portal Coach</h1>
              <p className="mt-2 max-w-3xl text-sm font-bold leading-6 text-white/90">
                Monitoring kepatuhan, target individual, dan instruksi untuk assigned group.
              </p>
            </div>
            {isLoggedIn ? (
              <button
                type="button"
                onClick={() => setCoachMenuOpen(true)}
                className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20 text-2xl font-black text-white shadow-sm backdrop-blur"
                aria-label="Buka menu coach"
              >
                ☰
              </button>
            ) : null}
          </div>
        </section>

        <section className="mt-5 rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
          <div
            className={`rounded-2xl px-4 py-3 text-sm font-bold leading-6 ${
              /gagal|wajib|belum|pilih/i.test(message)
                ? "bg-amber-50 text-amber-900"
                : "bg-sky-50 text-sky-800"
            }`}
          >
            {loading ? "Memuat Portal Coach..." : message}
          </div>
        </section>

        {!isLoggedIn ? (
          <LoginSection
            login={login}
            setLogin={setLogin}
            submitLogin={submitLogin}
            loading={loading}
          />
        ) : (
          <section className="mt-6">
            {coachView === "monitoring" ? (
              <div className="space-y-6">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <SummaryCard
                label="Total Peserta"
                value={fmtNumber(dashboard?.summary?.total_participants || 0)}
                note="anggota assigned group"
                tone="teal"
              />
              <SummaryCard
                label="Aktif Hari Ini"
                value={fmtNumber(dashboard?.summary?.active_today || 0)}
                note="input nutrisi atau workout"
                tone="sky"
              />
              <SummaryCard
                label="Perlu Follow Up"
                value={fmtNumber(dashboard?.summary?.need_follow_up || 0)}
                note="yellow + red flag"
                tone="amber"
              />
              <SummaryCard
                label="Instruksi Belum Dibaca"
                value={fmtNumber(dashboard?.summary?.unread_instructions || 0)}
                note="seluruh catatan peserta"
                tone="rose"
              />
            </div>

            <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
              <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div>
                  <h2 className="text-xl font-black">Status Kepatuhan 7 Hari</h2>
                  <p className="mt-1 text-sm font-bold text-slate-500">
                    Klik status untuk menampilkan daftar peserta pada tabel.
                  </p>
                </div>
                {flagFilter !== "all" ? (
                  <button
                    type="button"
                    onClick={() => setFlagFilter("all")}
                    className="rounded-full bg-slate-100 px-4 py-2 text-xs font-black text-slate-700"
                  >
                    Tampilkan Semua
                  </button>
                ) : null}
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 md:gap-3">
                <FlagCard
                  level="green"
                  count={dashboard?.summary?.flags?.green || 0}
                  active={flagFilter === "green"}
                  onClick={() => applyFlagFilter("green")}
                />
                <FlagCard
                  level="yellow"
                  count={dashboard?.summary?.flags?.yellow || 0}
                  active={flagFilter === "yellow"}
                  onClick={() => applyFlagFilter("yellow")}
                />
                <FlagCard
                  level="red"
                  count={dashboard?.summary?.flags?.red || 0}
                  active={flagFilter === "red"}
                  onClick={() => applyFlagFilter("red")}
                />
              </div>
            </section>

            <section
              id="coach-participant-table"
              className="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm md:p-6"
            >
              <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                  <h2 className="text-xl font-black">Monitoring Anggota</h2>
                  <p className="mt-1 text-sm font-bold text-slate-500">
                    Coach: {dashboard?.coach?.name || "-"} · Klik nama untuk membuka grafik dan detail peserta.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => openInstruction("group")}
                    className="rounded-full bg-teal-600 px-4 py-2 text-xs font-black text-white"
                  >
                    + Instruksi Kelompok
                  </button>
                  <button
                    type="button"
                    onClick={() => loadDashboard({ keepSelection: true })}
                    className="rounded-full bg-slate-100 px-4 py-2 text-xs font-black text-slate-700"
                  >
                    Refresh
                  </button>
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-[220px_1fr]">
                <select
                  className={fieldClass}
                  value={selectedGroup}
                  onChange={(e) => setSelectedGroup(e.target.value)}
                >
                  <option value="all">Semua Assigned Group</option>
                  {groups.map((group: any) => (
                    <option
                      key={group.id}
                      value={String(group.wellness_group_unit_id || group.group_name)}
                    >
                      {group.group_name} ({group.member_count || 0})
                    </option>
                  ))}
                </select>
                <input
                  className={fieldClass}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Cari nama, kode, kelompok, atau status"
                />
              </div>

              <div className="mt-4 flex items-center justify-between gap-3 text-xs font-black uppercase tracking-wide text-slate-400">
                <span>Menampilkan {filteredParticipants.length} anggota</span>
                <span>{flagFilter === "all" ? "Semua status" : `${flagFilter} flag`}</span>
              </div>

              <div className="mt-3 overflow-hidden rounded-2xl border border-slate-100 bg-white" data-wellness-coach-mobile-table="v58">
                <table className="w-full table-fixed border-collapse text-left">
                  <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wide text-slate-500 sm:text-[11px]">
                    <tr>
                      <th className="w-[47%] px-3 py-3 sm:w-[50%] sm:px-4">Peserta</th>
                      <th className="w-[53%] px-3 py-3 sm:w-[50%] sm:px-4">Monitoring</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {filteredParticipants.length === 0 ? (
                      <tr>
                        <td colSpan={2} className="px-4 py-10 text-center text-sm font-bold text-slate-400">
                          Tidak ada peserta pada filter ini.
                        </td>
                      </tr>
                    ) : (
                      filteredParticipants.map((item: any) => (
                        <tr
                          key={item.id}
                          className={`transition hover:bg-teal-50/50 ${
                            Number(selectedParticipant?.id) === Number(item.id)
                              ? "bg-teal-50"
                              : ""
                          }`}
                        >
                          <td className="min-w-0 px-3 py-3 align-top sm:px-4 sm:py-4">
                            <button
                              type="button"
                              onClick={() => chooseParticipant(item)}
                              className="block w-full min-w-0 rounded-xl text-left focus:outline-none focus:ring-2 focus:ring-teal-300"
                            >
                              <div className="break-words text-[13px] font-black leading-[1.35] text-slate-950 hover:text-teal-700 sm:text-base">
                                {item.name}
                              </div>
                              <div className="mt-1 break-all text-[9px] font-bold leading-4 text-slate-400 sm:break-words sm:text-xs">
                                {item.code} · {item.group_name}
                              </div>
                              <div className="mt-2 text-[9px] font-black leading-4 text-slate-500 sm:text-[11px]">
                                {fmtNumber(item.today?.steps || 0)} step · {fmtNumber(item.today?.calories || 0)} kkal
                              </div>
                              <div className="mt-2 inline-flex items-center rounded-full bg-teal-50 px-2 py-1 text-[9px] font-black text-teal-700 sm:text-[10px]">
                                Buka detail peserta
                              </div>
                            </button>
                          </td>
                          <td className="min-w-0 px-3 py-3 align-top sm:px-4 sm:py-4">
                            <div className="grid min-w-0 gap-1.5">
                              <div className="min-w-0 rounded-lg bg-orange-50 px-2 py-1.5 text-orange-900">
                                <div className="text-[8px] font-black uppercase tracking-wide opacity-60 sm:text-[9px]">Nutrisi</div>
                                <div className="mt-0.5 break-words text-[10px] font-black leading-4 sm:text-xs">
                                  {formatDaysWithoutInput(item.compliance?.days_since_nutrition)}
                                </div>
                              </div>
                              <div className="min-w-0 rounded-lg bg-sky-50 px-2 py-1.5 text-sky-900">
                                <div className="text-[8px] font-black uppercase tracking-wide opacity-60 sm:text-[9px]">Workout</div>
                                <div className="mt-0.5 break-words text-[10px] font-black leading-4 sm:text-xs">
                                  {formatDaysWithoutInput(item.compliance?.days_since_workout)}
                                </div>
                              </div>
                            </div>
                            <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5">
                              <span className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-black text-slate-700 sm:text-[10px]">
                                {fmtNumber(item.compliance?.compliance_percent || 0)}%
                              </span>
                              <FlagBadge level={item.flag} label={item.status} />
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>

              </div>
            ) : coachView === "chat" ? (
              <CoachChatPanel
                dashboard={dashboard}
                participants={participants}
                groups={groups}
                selectedGroup={selectedGroup}
                setSelectedGroup={setSelectedGroup}
                selectedParticipant={selectedParticipant}
                chooseParticipant={(item: any) =>
                  chooseParticipant(item, { openDetail: false })
                }
                chatMessages={chatMessages}
                chatText={chatText}
                setChatText={setChatText}
                chatLoading={chatLoading}
                chatSending={chatSending}
                loadChat={() => loadMemberChat()}
                sendChat={sendMemberChat}
              />
            ) : (
              <SupportChatPanel actorType="coach" onClose={() => setCoachView("monitoring")} />
            )}
          </section>
        )}
      </div>

      {participantModalOpen && selectedParticipant ? (
        <ParticipantDetailModal
          participant={selectedParticipant}
          detail={participantDetail}
          detailLoading={participantDetailLoading}
          reloadDetail={() => loadParticipantDetail(selectedParticipant)}
          targetForm={targetForm}
          setTargetForm={setTargetForm}
          saveTargets={saveTargets}
          openInstruction={() => openInstruction("participant")}
          saving={saving}
          onClose={() => setParticipantModalOpen(false)}
        />
      ) : null}

      {coachMenuOpen ? (
        <div className="fixed inset-0 z-[9998] bg-slate-950/50 p-4 backdrop-blur-sm">
          <button
            type="button"
            className="absolute inset-0"
            onClick={() => setCoachMenuOpen(false)}
            aria-label="Tutup menu coach"
          />
          <aside className="absolute bottom-4 right-4 top-4 flex w-[calc(100vw-2rem)] max-w-[420px] flex-col overflow-hidden rounded-[2rem] bg-white shadow-2xl">
            <div className="bg-gradient-to-br from-teal-500 via-cyan-500 to-sky-500 p-5 text-white">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xs font-black uppercase tracking-[0.18em] text-white/75">
                    Coach Menu
                  </div>
                  <div className="mt-2 text-xl font-black">
                    {dashboard?.coach?.name || "Coach Wellness"}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setCoachMenuOpen(false)}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20 text-xl font-black"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              <button
                type="button"
                onClick={() => {
                  setCoachView("monitoring");
                  setCoachMenuOpen(false);
                }}
                className={`w-full rounded-3xl border p-4 text-left ${
                  coachView === "monitoring"
                    ? "border-teal-200 bg-teal-50"
                    : "border-slate-100 bg-white"
                }`}
              >
                <div className="text-base font-black">📊 Monitoring Peserta</div>
                <div className="mt-1 text-sm font-bold text-slate-500">
                  Flag kepatuhan, target, dan instruksi
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setCoachView("chat");
                  setCoachMenuOpen(false);
                }}
                className={`w-full rounded-3xl border p-4 text-left ${
                  coachView === "chat"
                    ? "border-sky-200 bg-sky-50"
                    : "border-slate-100 bg-white"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-base font-black">💬 Chat With Member</div>
                  {Number(dashboard?.summary?.unread_chat_messages || 0) > 0 ? (
                    <span className="rounded-full bg-rose-500 px-3 py-1 text-xs font-black text-white">
                      {fmtNumber(dashboard?.summary?.unread_chat_messages || 0)}
                    </span>
                  ) : null}
                </div>
                <div className="mt-1 text-sm font-bold text-slate-500">
                  Percakapan dengan anggota assigned group
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setCoachView("support");
                  setCoachMenuOpen(false);
                }}
                className={`w-full rounded-3xl border p-4 text-left ${
                  coachView === "support"
                    ? "border-indigo-200 bg-indigo-50"
                    : "border-slate-100 bg-white"
                }`}
              >
                <div className="text-base font-black">🛠️ Chat with Admin</div>
                <div className="mt-1 text-sm font-bold text-slate-500">
                  Bantuan teknis Portal Coach dan aplikasi
                </div>
              </button>
            </div>

            <div className="border-t border-slate-100 p-4">
              <button
                type="button"
                onClick={logout}
                className="w-full rounded-2xl bg-slate-950 px-5 py-4 text-sm font-black text-white"
              >
                Keluar dari Portal Coach
              </button>
            </div>
          </aside>
        </div>
      ) : null}

      {composerOpen ? (
        <InstructionModal
          scope={instructionScope}
          participant={selectedParticipant}
          selectedGroup={selectedGroup}
          groups={groups}
          instructionGroup={instructionGroup}
          setInstructionGroup={setInstructionGroup}
          form={instructionForm}
          setForm={setInstructionForm}
          saving={saving}
          onClose={() => setComposerOpen(false)}
          onSave={saveInstruction}
        />
      ) : null}
    </main>
  );
}

function CoachChatPanel({
  dashboard,
  participants,
  groups,
  selectedGroup,
  setSelectedGroup,
  selectedParticipant,
  chooseParticipant,
  chatMessages,
  chatText,
  setChatText,
  chatLoading,
  chatSending,
  loadChat,
  sendChat,
}: any) {
  const availableParticipants = (participants || []).filter((item: any) => {
    if (selectedGroup === "all") return true;
    return (
      clean(item.group_name).toLowerCase() === selectedGroup.toLowerCase() ||
      clean(item.raw?.wellness_group_unit_id) === selectedGroup ||
      clean(item.raw?.group_unit_id) === selectedGroup
    );
  });

  return (
    <section className="overflow-hidden rounded-[2rem] border border-white bg-white shadow-xl shadow-slate-200/60">
      <div className="bg-gradient-to-br from-sky-500 via-cyan-500 to-teal-500 p-5 text-white md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.2em] text-white/75">
              Member Support
            </div>
            <h2 className="mt-2 text-2xl font-black">Chat With Member</h2>
            <p className="mt-2 text-sm font-bold leading-6 text-white/90">
              Coach hanya dapat menghubungi anggota dari kelompok yang di-assign.
            </p>
          </div>
          <div className="rounded-full bg-white/20 px-4 py-2 text-xs font-black backdrop-blur">
            {fmtNumber(dashboard?.summary?.unread_chat_messages || 0)} pesan belum dibaca
          </div>
        </div>
      </div>

      <div className="grid gap-5 p-4 md:p-6 lg:grid-cols-[360px_1fr]">
        <aside className="rounded-[1.75rem] border border-slate-100 bg-slate-50 p-4">
          <div className="text-sm font-black text-slate-900">Pilih Member</div>
          <div className="mt-3 grid gap-3">
            <select
              className={fieldClass}
              value={selectedGroup}
              onChange={(event) => setSelectedGroup(event.target.value)}
            >
              <option value="all">Semua Assigned Group</option>
              {(groups || []).map((group: any) => (
                <option
                  key={group.id}
                  value={String(group.wellness_group_unit_id || group.group_name)}
                >
                  {group.group_name} ({group.member_count || 0})
                </option>
              ))}
            </select>

            <select
              className={fieldClass}
              value={selectedParticipant?.id ? String(selectedParticipant.id) : ""}
              onChange={(event) => {
                const participant = availableParticipants.find(
                  (item: any) => String(item.id) === event.target.value
                );
                if (participant) chooseParticipant(participant);
              }}
            >
              <option value="">Pilih nama member</option>
              {availableParticipants.map((item: any) => (
                <option key={item.id} value={String(item.id)}>
                  {item.name} | {item.group_name} | Steps {fmtNumber(item.today?.steps || 0)} | {fmtNumber(item.today?.calories || 0)} kkal | {item.status}
                </option>
              ))}
            </select>
          </div>

          {selectedParticipant ? (
            <div className="mt-4 rounded-3xl bg-white p-4 shadow-sm">
              <div className="text-base font-black text-slate-950">
                {selectedParticipant.name}
              </div>
              <div className="mt-1 text-xs font-bold text-slate-500">
                {selectedParticipant.group_name} · {selectedParticipant.status}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-full bg-slate-100 px-3 py-2 text-xs font-black text-slate-700">
                  Steps {fmtNumber(selectedParticipant.today?.steps || 0)}
                </span>
                <span className="rounded-full bg-slate-100 px-3 py-2 text-xs font-black text-slate-700">
                  {fmtNumber(selectedParticipant.today?.calories || 0)} kkal
                </span>
              </div>
            </div>
          ) : null}
        </aside>

        <div className="min-w-0">
          {!selectedParticipant ? (
            <div className="flex min-h-[420px] items-center justify-center rounded-[1.75rem] border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
              <div>
                <div className="text-lg font-black text-slate-900">Pilih member untuk chat</div>
                <p className="mt-2 text-sm font-bold leading-6 text-slate-500">
                  Percakapan akan tampil setelah coach memilih satu anggota.
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-lg font-black text-slate-950">
                    {selectedParticipant.name}
                  </div>
                  <div className="text-xs font-bold text-slate-500">
                    Chat member · {selectedParticipant.group_name}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={loadChat}
                  className="rounded-full bg-slate-100 px-4 py-2 text-xs font-black text-slate-700"
                >
                  Refresh
                </button>
              </div>

              <div className="mt-4 max-h-[52vh] min-h-[340px] space-y-3 overflow-y-auto rounded-[1.75rem] bg-[#f4fbfa] p-4">
                {chatLoading ? (
                  <div className="py-12 text-center text-sm font-bold text-slate-400">
                    Memuat percakapan...
                  </div>
                ) : chatMessages.length === 0 ? (
                  <div className="py-12 text-center">
                    <div className="text-base font-black text-slate-900">
                      Belum ada percakapan.
                    </div>
                    <p className="mt-2 text-sm font-bold text-slate-500">
                      Kirim pesan pertama kepada member.
                    </p>
                  </div>
                ) : (
                  chatMessages.map((item: any) => {
                    const fromCoach = item.sender === "coach";
                    return (
                      <div
                        key={item.id}
                        className={`flex ${fromCoach ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[86%] rounded-[1.5rem] px-4 py-3 shadow-sm ${
                            fromCoach
                              ? "rounded-br-md bg-slate-950 text-white"
                              : "rounded-bl-md border border-teal-100 bg-white text-slate-900"
                          }`}
                        >
                          <div className="whitespace-pre-wrap text-sm font-bold leading-6">
                            {item.message || item.coach_note || "-"}
                          </div>
                          <div
                            className={`mt-2 text-[11px] font-bold ${
                              fromCoach ? "text-white/60" : "text-slate-400"
                            }`}
                          >
                            {formatChatTime(item.created_at || item.session_date)}
                            {fromCoach
                              ? item.is_read
                                ? " · Sudah dibaca member"
                                : " · Terkirim"
                              : " · Member"}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="mt-4 grid gap-3">
                <textarea
                  className={`${fieldClass} min-h-[96px] resize-none`}
                  value={chatText}
                  onChange={(event) => setChatText(event.target.value)}
                  placeholder="Tulis pesan untuk member..."
                />
                <button
                  type="button"
                  onClick={sendChat}
                  disabled={chatSending || !clean(chatText)}
                  className="rounded-2xl bg-teal-600 px-5 py-4 text-sm font-black text-white shadow-lg shadow-teal-100 disabled:opacity-50"
                >
                  {chatSending ? "Mengirim..." : "Kirim Pesan"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function LoginSection({ login, setLogin, submitLogin, loading }: any) {
  return (
    <section className="mt-6 grid gap-6 lg:grid-cols-[1fr_380px]">
      <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-black">Login Coach</h2>
        <p className="mt-1 text-sm font-bold leading-6 text-slate-500">
          Gunakan email coach dan access code yang dibuat oleh admin.
        </p>
        <div className="mt-5 grid gap-4">
          <label className="grid gap-2 text-sm font-bold text-slate-700">
            Email Coach
            <input
              type="email"
              className={fieldClass}
              value={login.email}
              onChange={(e) => setLogin((previous: any) => ({ ...previous, email: e.target.value }))}
              placeholder="coach@inharmony.co.id"
            />
          </label>
          <label className="grid gap-2 text-sm font-bold text-slate-700">
            Access Code
            <input
              className={fieldClass}
              value={login.access_code}
              onChange={(e) =>
                setLogin((previous: any) => ({ ...previous, access_code: e.target.value }))
              }
              placeholder="Contoh: INA2026"
            />
          </label>
          <button
            type="button"
            onClick={submitLogin}
            disabled={loading}
            className="rounded-2xl bg-teal-600 px-5 py-4 text-sm font-black text-white shadow-lg shadow-teal-100 disabled:opacity-50"
          >
            Masuk Portal Coach
          </button>
        </div>
      </div>
      <aside className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-black">Akses Coach</h3>
        <div className="mt-4 space-y-3 text-sm font-bold leading-6 text-slate-500">
          <p>Coach hanya melihat peserta sesuai group assignment.</p>
          <p>Green, Yellow, dan Red Flag dihitung dari kepatuhan 7 hari.</p>
          <p className="rounded-2xl bg-teal-50 p-4 text-teal-900">
            Instruksi kelompok akan diterima oleh seluruh anggota kelompok terpilih.
          </p>
        </div>
      </aside>
    </section>
  );
}

function SummaryCard({ label, value, note, tone }: any) {
  const toneClass: Record<string, string> = {
    teal: "border-teal-100 bg-teal-50 text-teal-800",
    sky: "border-sky-100 bg-sky-50 text-sky-800",
    amber: "border-amber-100 bg-amber-50 text-amber-900",
    rose: "border-rose-100 bg-rose-50 text-rose-800",
  };
  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${toneClass[tone]}`}>
      <div className="text-xs font-black uppercase tracking-wide opacity-70">{label}</div>
      <div className="mt-1 text-xl font-black md:text-2xl">{value}</div>
      <div className="mt-1 text-xs font-bold opacity-70">{note}</div>
    </div>
  );
}

function FlagCard({ level, count, active, onClick }: any) {
  const config: Record<string, any> = {
    green: {
      label: "Green",
      note: "Patuh",
      emoji: "\u{1F7E2}",
      style: "border-emerald-200 bg-emerald-50 text-emerald-900",
    },
    yellow: {
      label: "Yellow",
      note: "Pantau",
      emoji: "\u{1F7E1}",
      style: "border-amber-200 bg-amber-50 text-amber-900",
    },
    red: {
      label: "Red",
      note: "Follow up",
      emoji: "\u{1F534}",
      style: "border-rose-200 bg-rose-50 text-rose-900",
    },
  };
  const item = config[level];
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-w-0 rounded-2xl border p-3 text-left shadow-sm transition md:p-4 ${item.style} ${
        active ? "ring-4 ring-slate-200" : "hover:-translate-y-0.5"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-base md:text-lg">{item.emoji}</span>
        <span className="text-xl font-black md:text-2xl">{fmtNumber(count)}</span>
      </div>
      <div className="mt-2 truncate text-xs font-black md:text-sm">{item.label} Flag</div>
      <div className="mt-0.5 truncate text-[10px] font-bold opacity-70 md:text-xs">{item.note}</div>
    </button>
  );
}

function ParticipantCard({ item, active, onClick }: any) {
  const flagClass: Record<string, string> = {
    green: "bg-emerald-100 text-emerald-800",
    yellow: "bg-amber-100 text-amber-800",
    red: "bg-rose-100 text-rose-800",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-3xl border p-4 text-left transition ${
        active
          ? "border-teal-300 bg-teal-50"
          : "border-slate-100 bg-slate-50 hover:border-teal-200 hover:bg-teal-50/40"
      }`}
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="truncate text-base font-black text-slate-950">{item.name}</div>
          <div className="mt-1 text-xs font-bold text-slate-500">
            Kode {item.code} - {item.group_name}
          </div>
          <div className="mt-2 text-xs font-bold leading-5 text-slate-500">
            {item.flag_reason}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-white px-3 py-2 text-xs font-black text-slate-700">
            Patuh {fmtNumber(item.compliance?.compliance_percent || 0)}%
          </span>
          <span className="rounded-full bg-white px-3 py-2 text-xs font-black text-slate-700">
            {fmtNumber(item.today?.calories || 0)} kkal
          </span>
          <span className={`rounded-full px-3 py-2 text-xs font-black ${flagClass[item.flag]}`}>
            {item.flag_label}
          </span>
        </div>
      </div>
    </button>
  );
}

function ParticipantDetailModal({ onClose, ...props }: any) {
  const [viewportFrame, setViewportFrame] = useState({
    top: 0,
    height: 0,
  });

  useEffect(() => {
    const updateViewportFrame = () => {
      const viewport = window.visualViewport;
      const top = Math.max(
        0,
        Number(viewport?.pageTop ?? window.scrollY ?? 0)
      );
      const height = Math.max(
        320,
        Number(viewport?.height ?? window.innerHeight ?? 0)
      );
      setViewportFrame({ top, height });
    };

    updateViewportFrame();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    window.addEventListener("resize", updateViewportFrame);
    window.visualViewport?.addEventListener("resize", updateViewportFrame);
    window.visualViewport?.addEventListener("scroll", updateViewportFrame);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("resize", updateViewportFrame);
      window.visualViewport?.removeEventListener("resize", updateViewportFrame);
      window.visualViewport?.removeEventListener("scroll", updateViewportFrame);
    };
  }, []);

  if (typeof document === "undefined" || viewportFrame.height <= 0) return null;

  return createPortal(
    <div
      data-wellness-coach-participant-modal="v58"
      style={{
        position: "absolute",
        top: `${viewportFrame.top}px`,
        left: 0,
        right: 0,
        height: `${viewportFrame.height}px`,
        zIndex: 2147483000,
        background: "rgba(15, 23, 42, 0.42)",
      }}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Tutup detail peserta"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          border: 0,
          padding: 0,
          background: "transparent",
        }}
      />
      <section
        style={{
          position: "absolute",
          top: "8px",
          right: "8px",
          bottom: "8px",
          left: "8px",
          zIndex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          border: "1px solid rgb(226 232 240)",
          borderRadius: "24px",
          background: "#ffffff",
          boxShadow: "0 24px 70px rgba(15, 23, 42, 0.28)",
          transform: "translateZ(0)",
        }}
      >
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-100 bg-white px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-teal-600">
              Progress Peserta
            </div>
            <div className="mt-1 truncate text-base font-black text-slate-950 sm:text-lg">
              {props.participant?.name || "Detail peserta"}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xl font-black text-slate-700"
            aria-label="Tutup detail peserta"
          >
            ×
          </button>
        </div>
        <div
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-white p-3 sm:p-5"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          <ParticipantDetail {...props} />
        </div>
      </section>
    </div>,
    document.body
  );
}

function ParticipantDetail({
  participant,
  detail,
  detailLoading,
  reloadDetail,
  targetForm,
  setTargetForm,
  saveTargets,
  openInstruction,
  saving,
}: any) {
  const latestNote = participant.latest_note || null;
  const summary = detail?.summary || {};
  const breakdown = detail?.point_breakdown || {};
  const charts = detail?.charts || {};
  const healthtalks = detail?.healthtalks || [];
  const pointRules = detail?.point_rules || {};
  const setTarget = (key: string, value: string) =>
    setTargetForm((previous: any) => ({ ...previous, [key]: value }));

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 rounded-3xl bg-gradient-to-br from-teal-50 to-sky-50 p-4 md:flex-row md:items-center md:justify-between md:p-5">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.18em] text-teal-700">
            Detail dan Progress Peserta
          </div>
          <h2 className="mt-2 text-2xl font-black text-slate-950">{participant.name}</h2>
          <div className="mt-1 text-sm font-bold text-slate-500">
            Kode {participant.code} · {participant.group_name} · {participant.flag_label}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={reloadDetail}
            className="rounded-full bg-white px-4 py-2 text-xs font-black text-slate-700 shadow-sm"
          >
            Refresh Data
          </button>
          <button
            type="button"
            onClick={openInstruction}
            className="rounded-full bg-slate-950 px-4 py-2 text-xs font-black text-white"
          >
            + Tambah Instruksi
          </button>
        </div>
      </div>

      {detailLoading ? (
        <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-10 text-center text-sm font-bold text-slate-400">
          Mengambil point, grafik, dan riwayat Health Talk peserta...
        </div>
      ) : !detail?.ok ? (
        <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
          <div className="text-base font-black text-slate-900">Detail belum dimuat</div>
          <p className="mt-2 text-sm font-bold text-slate-500">
            Tekan Refresh Data untuk mengambil progress peserta.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
            <CompactMetric label="Total Point" value={fmtNumber(summary.total_points || 0)} tone="amber" />
            <CompactMetric label="Health Talk" value={`${fmtNumber(summary.healthtalk_count || 0)}x`} tone="violet" />
            <CompactMetric label="Log Nutrisi" value={fmtNumber(summary.nutrition_log_count || 0)} tone="sky" />
            <CompactMetric label="Log Workout" value={fmtNumber(summary.workout_log_count || 0)} tone="teal" />
            <CompactMetric label="BB Terakhir" value={summary.latest_weight_kg ? `${fmtNumber(summary.latest_weight_kg, 1)} kg` : "-"} tone="slate" />
            <CompactMetric label="BMI Terakhir" value={summary.latest_bmi ? fmtNumber(summary.latest_bmi, 1) : "-"} tone="slate" />
          </div>

          <section className="rounded-3xl border border-slate-100 bg-slate-50 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <h3 className="text-lg font-black text-slate-950">Breakdown Point</h3>
                <p className="mt-1 text-xs font-bold text-slate-500">
                  Ringkasan sumber point peserta dari data Wellness yang sudah tersedia.
                </p>
              </div>
              <div className="grid grid-cols-4 gap-2 text-center">
                <PointPill label="Nutrisi" value={breakdown.nutrition || 0} />
                <PointPill label="Workout" value={breakdown.activity || 0} />
                <PointPill label="Health Talk" value={breakdown.healthtalk || 0} />
                <PointPill label="Lainnya" value={breakdown.other || 0} />
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-amber-100 bg-amber-50/60 p-4">
            <h3 className="text-base font-black text-slate-950">Aturan Point Wellness</h3>
            <p className="mt-1 text-xs font-bold leading-5 text-slate-500">
              Point dihitung otomatis per hari dari input aktual peserta.
            </p>
            <div className="mt-3 grid gap-2 text-xs font-bold text-slate-700">
              <div className="rounded-2xl bg-white px-3 py-3">
                <span className="font-black text-sky-700">Nutrisi:</span> 3 kali atau lebih = 10 point; 1–2 kali = 5 point; tidak input = 0 point.
              </div>
              <div className="rounded-2xl bg-white px-3 py-3">
                <span className="font-black text-teal-700">Workout:</span>{" "}
                {Number(pointRules.workout_target_calories || 0) > 0
                  ? `mencapai target ${fmtNumber(pointRules.workout_target_calories)} kkal = 10 point; ada aktivitas tetapi belum mencapai target = 5 point; tidak workout = 0 point.`
                  : "target belum ditetapkan; aktivitas yang tercatat = 5 point dan tidak workout = 0 point."}
              </div>
              <div className="rounded-2xl bg-white px-3 py-3">
                <span className="font-black text-violet-700">Health Talk:</span> offline = 10 point; online = 5 point; tidak ikut = 0 point.
              </div>
            </div>
          </section>

          <section>
            <div>
              <h3 className="text-lg font-black text-slate-950">Grafik Progress Peserta</h3>
              <p className="mt-1 text-xs font-bold text-slate-500">
                Grafik diambil saat nama peserta dipilih, tanpa memuat seluruh anggota sekaligus.
              </p>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <CoachTrendChart title="Kalori Nutrisi" points={charts.nutrition_calories || []} suffix="kkal" />
              <CoachTrendChart title="Kalori Workout" points={charts.workout_calories || []} suffix="kkal" />
              <CoachTrendChart title="Steps" points={charts.steps || []} />
              <CoachTrendChart title="Berat Badan" points={charts.weight_kg || []} suffix="kg" />
              <CoachTrendChart title="BMI" points={charts.bmi || []} />
              <CoachTrendChart title="Lingkar Pinggang" points={charts.waist_cm || []} suffix="cm" />
              <CoachTrendChart title="HbA1c" points={charts.hba1c || []} suffix="%" />
              <CoachTrendChart title="Gula Darah" points={charts.glucose || []} suffix="mg/dL" />
              <CoachTrendChart title="Tekanan Darah" points={charts.blood_pressure || []} suffix="mmHg" secondaryLabel="Diastolik" />
              <CoachTrendChart title="Point Harian" points={charts.points || []} suffix="pt" />
            </div>
          </section>

          <section className="rounded-3xl border border-slate-100 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-black text-slate-950">Keikutsertaan Health Talk</h3>
                <p className="mt-1 text-xs font-bold text-slate-500">
                  Total {fmtNumber(summary.healthtalk_count || 0)} kegiatan yang tercatat.
                </p>
              </div>
            </div>
            <div className="mt-4 overflow-hidden rounded-2xl border border-slate-100">
              <table className="w-full table-fixed text-left text-xs sm:text-sm">
                <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wide text-slate-500 sm:text-[11px]">
                  <tr>
                    <th className="w-[24%] px-3 py-3">Tanggal</th>
                    <th className="w-[58%] px-3 py-3">Health Talk</th>
                    <th className="w-[18%] px-2 py-3 text-right">Point</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {healthtalks.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-4 py-8 text-center font-bold text-slate-400">
                        Belum ada keikutsertaan Health Talk yang tercatat.
                      </td>
                    </tr>
                  ) : (
                    healthtalks.slice(0, 12).map((item: any, index: number) => (
                      <tr key={item.id || `${item.date}-${index}`}>
                        <td className="px-3 py-3 align-top font-bold text-slate-500">{item.date || "-"}</td>
                        <td className="px-3 py-3 align-top">
                          <div className="break-words font-black text-slate-900">{item.title || "Health Talk"}</div>
                          <div className="mt-1 text-[10px] font-bold text-slate-500 sm:text-xs">{item.type || "-"}</div>
                        </td>
                        <td className="px-2 py-3 text-right align-top font-black text-violet-700">{fmtNumber(item.points || 0)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-3xl border border-slate-100 bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-black">Target Individual</h3>
            <span className="rounded-full bg-sky-50 px-3 py-2 text-[11px] font-black text-sky-700">
              Opsional
            </span>
          </div>
          <p className="mt-2 text-xs font-bold leading-5 text-slate-500">
            Isi hanya target yang ingin ditetapkan atau diubah.
          </p>
          <div className="mt-4 grid gap-3">
            <label className="grid gap-2 text-sm font-bold text-slate-700">
              Batas Konsumsi Kalori Harian (kkal/hari)
              <input type="number" min="0" className={fieldClass} value={targetForm.nutrition_max_calories} onChange={(e) => setTarget("nutrition_max_calories", e.target.value)} placeholder="Contoh: 1700" />
            </label>
            <label className="grid gap-2 text-sm font-bold text-slate-700">
              Target Kalori Terbakar dari Workout (kkal/hari)
              <input type="number" min="0" className={fieldClass} value={targetForm.workout_min_calories} onChange={(e) => setTarget("workout_min_calories", e.target.value)} placeholder="Contoh: 300" />
            </label>
            <label className="grid gap-2 text-sm font-bold text-slate-700">
              Target Berat Badan (kg)
              <input type="number" min="0" step="0.1" className={fieldClass} value={targetForm.target_weight_kg} onChange={(e) => setTarget("target_weight_kg", e.target.value)} placeholder="Contoh: 72" />
            </label>
            <label className="grid gap-2 text-sm font-bold text-slate-700">
              Catatan Target
              <textarea className={`${fieldClass} min-h-[72px]`} value={targetForm.coach_note} onChange={(e) => setTarget("coach_note", e.target.value)} placeholder="Arahan singkat untuk mencapai target" />
            </label>
            <button type="button" onClick={saveTargets} disabled={saving} className="rounded-2xl bg-teal-600 px-5 py-4 text-sm font-black text-white disabled:opacity-50">
              {saving ? "Menyimpan..." : "Simpan Target Peserta"}
            </button>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-100 bg-slate-50 p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-base font-black">Instruksi Terakhir</h3>
            <button type="button" onClick={openInstruction} className="rounded-full bg-slate-950 px-4 py-2 text-xs font-black text-white">
              + Tambah Instruksi
            </button>
          </div>
          {latestNote ? (
            <div className="mt-4">
              <div className="text-sm font-black text-slate-900">{latestNote.topic || "Catatan Coaching"}</div>
              <div className="mt-2 whitespace-pre-line text-xs font-bold leading-5 text-slate-600">{latestNote.coach_note || latestNote.action_plan || "-"}</div>
              {latestNote.action_plan ? (
                <div className="mt-3 whitespace-pre-line rounded-2xl bg-white p-3 text-xs font-bold leading-5 text-slate-700">{latestNote.action_plan}</div>
              ) : null}
              <div className={`mt-3 inline-flex rounded-full px-3 py-2 text-xs font-black ${latestNote.is_read ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                {formatReadAt(latestNote.read_at)}
              </div>
            </div>
          ) : (
            <div className="mt-4 text-sm font-bold text-slate-400">Belum ada instruksi.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function FlagBadge({ level, label }: { level: string; label: string }) {
  const classes: Record<string, string> = {
    green: "bg-emerald-100 text-emerald-800",
    yellow: "bg-amber-100 text-amber-800",
    red: "bg-rose-100 text-rose-800",
  };
  return (
    <span className={`inline-flex max-w-full items-center justify-center whitespace-normal rounded-full px-2 py-1 text-center text-[9px] font-black leading-3 sm:px-3 sm:py-2 sm:text-xs ${classes[level] || "bg-slate-100 text-slate-700"}`}>
      {label || "-"}
    </span>
  );
}

function CompactMetric({ label, value, tone }: any) {
  const tones: Record<string, string> = {
    amber: "bg-amber-50 text-amber-900",
    violet: "bg-violet-50 text-violet-900",
    sky: "bg-sky-50 text-sky-900",
    teal: "bg-teal-50 text-teal-900",
    slate: "bg-slate-50 text-slate-900",
  };
  return (
    <div className={`rounded-2xl p-3 ${tones[tone] || tones.slate}`}>
      <div className="text-[10px] font-black uppercase tracking-wide opacity-60">{label}</div>
      <div className="mt-1 text-lg font-black">{value}</div>
    </div>
  );
}

function PointPill({ label, value }: any) {
  return (
    <div className="rounded-2xl bg-white px-3 py-2 shadow-sm">
      <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-1 text-sm font-black text-slate-900">{fmtNumber(value)}</div>
    </div>
  );
}

function clampCoachChartValue(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function smoothCoachChartPath(points: Array<{ x: number; y: number }>) {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  if (points.length === 2) {
    return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
  }

  let path = `M ${points[0].x} ${points[0].y}`;
  const tension = 0.18;

  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = points[Math.max(index - 1, 0)];
    const p1 = points[index];
    const p2 = points[index + 1];
    const p3 = points[Math.min(index + 2, points.length - 1)];
    const cp1x = p1.x + (p2.x - p0.x) * tension;
    const cp1y = p1.y + (p2.y - p0.y) * tension;
    const cp2x = p2.x - (p3.x - p1.x) * tension;
    const cp2y = p2.y - (p3.y - p1.y) * tension;
    path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }

  return path;
}

function coachChartTooltipStyle(
  point: { x: number; y: number },
  width: number,
  height: number
) {
  const rawLeft = (point.x / width) * 100;
  const rawTop = (point.y / height) * 100;
  const placeBelow = point.y <= height * 0.38;
  let left = clampCoachChartValue(rawLeft, 4, 96);
  let translateX = "-50%";

  if (rawLeft < 18) {
    left = 4;
    translateX = "0%";
  } else if (rawLeft > 82) {
    left = 96;
    translateX = "-100%";
  }

  const top = placeBelow
    ? clampCoachChartValue(rawTop + 9, 7, 82)
    : clampCoachChartValue(rawTop - 7, 14, 90);

  return {
    left: `${left}%`,
    top: `${top}%`,
    transform: `translate(${translateX}, ${placeBelow ? "0%" : "-100%"})`,
  };
}

function CoachTrendChart({ title, points, suffix = "", secondaryLabel = "" }: any) {
  const rows = Array.isArray(points) ? points.filter(Boolean).slice(-14) : [];
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const width = 620;
  const height = 250;
  const padX = 34;
  const padTop = 28;
  const padBottom = 38;
  const values = rows
    .flatMap((item: any) => [Number(item.value), Number(item.secondary)])
    .filter(Number.isFinite);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 1;
  const buffer = Math.max((max - min) * 0.12, max === min ? 1 : 0);
  const chartMin = min - buffer;
  const chartMax = max + buffer;
  const range = chartMax - chartMin || 1;
  const x = (index: number) =>
    rows.length === 1
      ? width / 2
      : padX + (index * (width - padX * 2)) / Math.max(rows.length - 1, 1);
  const y = (value: any) =>
    padTop +
    ((chartMax - Number(value || 0)) / range) *
      (height - padTop - padBottom);
  const plotted = rows.map((item: any, index: number) => ({
    row: item,
    x: x(index),
    y: y(item.value),
    secondaryY: Number.isFinite(Number(item.secondary))
      ? y(item.secondary)
      : null,
  }));
  const primary = smoothCoachChartPath(
    plotted.map((item) => ({ x: item.x, y: item.y }))
  );
  const secondaryPoints = plotted
    .filter((item) => item.secondaryY !== null)
    .map((item) => ({ x: item.x, y: Number(item.secondaryY) }));
  const secondary = smoothCoachChartPath(secondaryPoints);
  const latest = rows.at(-1);
  const visibleActiveIndex =
    activeIndex === null ? Math.max(plotted.length - 1, 0) : activeIndex;
  const activePoint = plotted[visibleActiveIndex] || null;

  function activateNearest(event: any) {
    if (plotted.length === 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const pointerX =
      ((event.clientX - rect.left) / Math.max(rect.width, 1)) * width;
    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;
    plotted.forEach((point, index) => {
      const distance = Math.abs(point.x - pointerX);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });
    setActiveIndex(nearestIndex);
  }

  return (
    <div className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-black text-slate-950">{title}</div>
          <div className="mt-1 text-[11px] font-bold text-slate-400">
            {rows.length} titik data · sentuh titik untuk melihat nilai
          </div>
        </div>
        <div className="text-right">
          <div className="text-base font-black text-teal-800">
            {latest?.value !== undefined && latest?.value !== null
              ? `${fmtNumber(latest.value, 1)} ${suffix}`.trim()
              : "-"}
          </div>
          {latest?.secondary !== undefined && latest?.secondary !== null ? (
            <div className="text-[11px] font-bold text-sky-600">
              {secondaryLabel || "Nilai 2"}: {fmtNumber(latest.secondary, 1)}
            </div>
          ) : null}
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="mt-4 flex h-[180px] items-center justify-center rounded-2xl bg-slate-50 text-xs font-bold text-slate-400">
          Data grafik belum cukup.
        </div>
      ) : (
        <div className="relative mt-3 overflow-hidden rounded-2xl bg-gradient-to-b from-teal-50/70 to-white">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="h-[190px] w-full touch-none sm:h-[220px]"
            role="img"
            aria-label={`Grafik ${title}`}
            onPointerMove={activateNearest}
            onPointerDown={activateNearest}
            onClick={activateNearest}
            onPointerLeave={() => setActiveIndex(null)}
          >
            {[0.25, 0.5, 0.75].map((ratio) => (
              <line
                key={ratio}
                x1={padX}
                y1={padTop + (height - padTop - padBottom) * ratio}
                x2={width - padX}
                y2={padTop + (height - padTop - padBottom) * ratio}
                stroke="#cbd5e1"
                strokeWidth="1"
                strokeDasharray="6 8"
                opacity="0.45"
              />
            ))}
            <line
              x1={padX}
              y1={height - padBottom}
              x2={width - padX}
              y2={height - padBottom}
              stroke="#cbd5e1"
              strokeWidth="1"
            />
            <path
              d={primary}
              fill="none"
              stroke="#14b8a6"
              strokeWidth="6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {secondary ? (
              <path
                d={secondary}
                fill="none"
                stroke="#38bdf8"
                strokeWidth="5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}
            {plotted.map((item: any, index: number) => {
              const isActive = visibleActiveIndex === index;
              return (
                <g key={`${item.row.date || item.row.label}-${index}`}>
                  {isActive ? (
                    <circle
                      cx={item.x}
                      cy={item.y}
                      r="15"
                      fill="#14b8a6"
                      opacity="0.22"
                      className="animate-ping"
                    />
                  ) : null}
                  <circle
                    cx={item.x}
                    cy={item.y}
                    r={isActive ? "7" : "5"}
                    fill="white"
                    stroke="#0f766e"
                    strokeWidth={isActive ? "4" : "3"}
                  />
                  {item.secondaryY !== null ? (
                    <circle
                      cx={item.x}
                      cy={item.secondaryY}
                      r={isActive ? "6" : "4"}
                      fill="white"
                      stroke="#0284c7"
                      strokeWidth="3"
                    />
                  ) : null}
                </g>
              );
            })}
            {rows.length === 1 ? (
              <text
                x={width / 2}
                y={height - 10}
                textAnchor="middle"
                fontSize="18"
                fill="#94a3b8"
              >
                {rows[0]?.label || ""}
              </text>
            ) : (
              <>
                <text x={padX} y={height - 10} fontSize="18" fill="#94a3b8">
                  {rows[0]?.label || ""}
                </text>
                <text
                  x={width - padX}
                  y={height - 10}
                  textAnchor="end"
                  fontSize="18"
                  fill="#94a3b8"
                >
                  {rows.at(-1)?.label || ""}
                </text>
              </>
            )}
          </svg>

          {activePoint ? (
            <div
              className="pointer-events-none absolute z-10 min-w-[108px] max-w-[180px] rounded-2xl bg-slate-950 px-3 py-2 text-white shadow-xl"
              style={coachChartTooltipStyle(activePoint, width, height)}
            >
              <div className="text-[10px] font-bold text-white/60">
                {activePoint.row.label || activePoint.row.date || "Data"}
              </div>
              <div className="mt-1 text-sm font-black">
                {fmtNumber(activePoint.row.value, 1)} {suffix}
              </div>
              {activePoint.row.secondary !== undefined &&
              activePoint.row.secondary !== null ? (
                <div className="mt-1 text-[11px] font-bold text-sky-200">
                  {secondaryLabel || "Nilai 2"}: {fmtNumber(activePoint.row.secondary, 1)} {suffix}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function MiniInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white p-4">
      <div className="text-xs font-black uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-1 text-sm font-black text-slate-900">{value}</div>
    </div>
  );
}

// WELLNESS_COACH_INSTRUCTION_MODAL_V60
// Modal memakai pola viewport yang sama dengan detail peserta agar stabil di Android WebView.
function InstructionModal({
  scope,
  participant,
  selectedGroup,
  groups,
  instructionGroup,
  setInstructionGroup,
  form,
  setForm,
  saving,
  onClose,
  onSave,
}: any) {
  const [viewportFrame, setViewportFrame] = useState({ top: 0, height: 0 });
  const groupKey = scope === "group" ? instructionGroup : selectedGroup;
  const group = (groups || []).find(
    (item: any) => String(item.wellness_group_unit_id || item.group_name) === groupKey
  );
  const setValue = (key: string, value: string) =>
    setForm((previous: any) => ({ ...previous, [key]: value }));

  useEffect(() => {
    const updateViewportFrame = () => {
      const viewport = window.visualViewport;
      const top = Math.max(0, Number(viewport?.pageTop ?? window.scrollY ?? 0));
      const height = Math.max(420, Number(viewport?.height ?? window.innerHeight ?? 0));
      setViewportFrame({ top, height });
    };

    updateViewportFrame();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    window.addEventListener("resize", updateViewportFrame);
    window.visualViewport?.addEventListener("resize", updateViewportFrame);
    window.visualViewport?.addEventListener("scroll", updateViewportFrame);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("resize", updateViewportFrame);
      window.visualViewport?.removeEventListener("resize", updateViewportFrame);
      window.visualViewport?.removeEventListener("scroll", updateViewportFrame);
    };
  }, []);

  if (typeof document === "undefined" || viewportFrame.height <= 0) return null;

  return createPortal(
    <div
      data-wellness-coach-instruction-modal="v60"
      style={{
        position: "absolute",
        top: `${viewportFrame.top}px`,
        left: 0,
        right: 0,
        height: `${viewportFrame.height}px`,
        zIndex: 2147483600,
        background: "rgba(15, 23, 42, 0.42)",
      }}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Tutup instruksi"
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 0,
          width: "100%",
          height: "100%",
          border: 0,
          padding: 0,
          background: "transparent",
        }}
      />

      <section
        style={{
          position: "absolute",
          top: "8px",
          right: "8px",
          bottom: "8px",
          left: "8px",
          zIndex: 2,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          border: "1px solid rgb(226 232 240)",
          borderRadius: "24px",
          background: "#ffffff",
          boxShadow: "0 24px 70px rgba(15, 23, 42, 0.28)",
          transform: "translateZ(0)",
        }}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 bg-white px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-teal-600 sm:text-xs">
              {scope === "group" ? "Instruksi Kelompok" : "Instruksi Individual"}
            </div>
            <h2 className="mt-1 break-words text-lg font-black text-slate-950 sm:text-2xl">
              {scope === "group"
                ? group?.group_name || "Pilih kelompok penerima"
                : participant?.name || "Peserta"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xl font-black text-slate-700"
            aria-label="Tutup instruksi"
            style={{ touchAction: "manipulation" }}
          >
            ×
          </button>
        </div>

        <div
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-white px-4 py-4 sm:px-6 sm:py-5"
          style={{
            WebkitOverflowScrolling: "touch",
            paddingBottom: "max(24px, env(safe-area-inset-bottom))",
          }}
        >
          {scope === "group" ? (
            <label className="grid gap-2 text-sm font-bold text-slate-700">
              Kelompok Penerima
              <select
                className={fieldClass}
                value={instructionGroup}
                onChange={(event) => setInstructionGroup(event.target.value)}
              >
                {(groups || []).map((item: any) => (
                  <option
                    key={item.id}
                    value={String(item.wellness_group_unit_id || item.group_name)}
                  >
                    {item.group_name} ({item.member_count || 0} anggota)
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <div className="mt-4 grid gap-3">
            <label className="grid gap-2 text-sm font-bold text-slate-700">
              Topik
              <input
                className={fieldClass}
                value={form.topic}
                onChange={(event) => setValue("topic", event.target.value)}
              />
            </label>

            <label className="grid gap-2 text-sm font-bold text-slate-700">
              Masalah / Fokus
              <textarea
                className={`${fieldClass} min-h-[80px]`}
                value={form.main_issue}
                onChange={(event) => setValue("main_issue", event.target.value)}
                placeholder="Contoh: input nutrisi belum konsisten"
              />
            </label>

            <label className="grid gap-2 text-sm font-bold text-slate-700">
              Instruksi / Note
              <textarea
                className={`${fieldClass} min-h-[110px]`}
                value={form.coach_note}
                onChange={(event) => setValue("coach_note", event.target.value)}
                placeholder="Pesan yang akan diterima peserta"
              />
            </label>

            <div className="rounded-[1.5rem] border border-sky-100 bg-sky-50 p-4">
              <div className="text-sm font-black text-sky-950">Target / Action Plan (Opsional)</div>
              <p className="mt-1 text-xs font-bold leading-5 text-sky-800/70">
                Isi hanya target yang ingin ditetapkan atau diubah. Kolom lainnya boleh dikosongkan.
              </p>
              <div className="mt-4 grid gap-3">
                <label className="grid gap-2 text-sm font-bold text-slate-700">
                  Target Kalori Terbakar dari Workout (kkal/hari)
                  <input
                    type="number"
                    min="0"
                    className={fieldClass}
                    value={form.action_workout_calories}
                    onChange={(event) => setValue("action_workout_calories", event.target.value)}
                    placeholder="Contoh: 300"
                  />
                </label>
                <label className="grid gap-2 text-sm font-bold text-slate-700">
                  Batas Konsumsi Kalori Harian (kkal/hari)
                  <input
                    type="number"
                    min="0"
                    className={fieldClass}
                    value={form.action_nutrition_calories}
                    onChange={(event) => setValue("action_nutrition_calories", event.target.value)}
                    placeholder="Contoh: 1700"
                  />
                </label>
                <label className="grid gap-2 text-sm font-bold text-slate-700">
                  Target Berat Badan (kg)
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    className={fieldClass}
                    value={form.action_target_weight}
                    onChange={(event) => setValue("action_target_weight", event.target.value)}
                    placeholder="Contoh: 72"
                  />
                </label>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-bold text-slate-700">
                Status Follow Up
                <select
                  className={fieldClass}
                  value={form.follow_up_status}
                  onChange={(event) => setValue("follow_up_status", event.target.value)}
                >
                  <option value="Open">Open</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Done">Done</option>
                  <option value="Need Medical Review">Need Medical Review</option>
                </select>
              </label>
              <label className="grid gap-2 text-sm font-bold text-slate-700">
                Follow Up Berikutnya
                <input
                  type="date"
                  className={fieldClass}
                  value={form.next_follow_up_date}
                  onChange={(event) => setValue("next_follow_up_date", event.target.value)}
                />
              </label>
            </div>

            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              className="sticky bottom-0 rounded-2xl bg-teal-600 px-5 py-4 text-sm font-black text-white shadow-lg shadow-teal-100 disabled:opacity-50"
              style={{ touchAction: "manipulation" }}
            >
              {saving
                ? "Mengirim..."
                : scope === "group"
                  ? "Kirim ke Seluruh Anggota"
                  : "Kirim ke Peserta"}
            </button>
          </div>
        </div>
      </section>
    </div>,
    document.body
  );
}
