"use client";

import { useEffect, useMemo, useState } from "react";

// WELLNESS_COACH_PORTAL_FLAGS_TARGETS_V53
// WELLNESS_COACH_COMPACT_LIST_ACTION_CHAT_V54
// Extends the existing Coach Portal without changing database schema or other modules.

type FlagLevel = "green" | "yellow" | "red";
type CoachView = "monitoring" | "chat";
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
  const [coachView, setCoachView] = useState<CoachView>("monitoring");
  const [coachMenuOpen, setCoachMenuOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatText, setChatText] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatSending, setChatSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
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
    setChatMessages([]);
    setCoachView("monitoring");
    setCoachMenuOpen(false);
    setMessage("Coach logout berhasil.");
  }

  function chooseParticipant(item: any) {
    setSelectedParticipant(item);
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
  }

  function openInstruction(scope: "participant" | "group") {
    if (scope === "participant" && !selectedParticipant) {
      setMessage("Pilih peserta sebelum menambah instruksi individual.");
      return;
    }
    if (scope === "group" && selectedGroup === "all") {
      setMessage("Pilih satu assigned group sebelum menambah instruksi kelompok.");
      return;
    }
    setInstructionScope(scope);
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
    const group = (dashboard?.groups || []).find(
      (item: any) =>
        String(item.wellness_group_unit_id || item.group_name) === selectedGroup
    );
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
            <div className="grid gap-4 md:grid-cols-4">
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
                    Klik card untuk melihat daftar peserta pada status tersebut.
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
              <div className="mt-5 grid gap-4 md:grid-cols-3">
                <FlagCard
                  level="green"
                  count={dashboard?.summary?.flags?.green || 0}
                  active={flagFilter === "green"}
                  onClick={() => setFlagFilter("green")}
                />
                <FlagCard
                  level="yellow"
                  count={dashboard?.summary?.flags?.yellow || 0}
                  active={flagFilter === "yellow"}
                  onClick={() => setFlagFilter("yellow")}
                />
                <FlagCard
                  level="red"
                  count={dashboard?.summary?.flags?.red || 0}
                  active={flagFilter === "red"}
                  onClick={() => setFlagFilter("red")}
                />
              </div>
            </section>

            <div className="grid gap-5 lg:grid-cols-[1fr_430px]">
              <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
                <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                  <div>
                    <h2 className="text-xl font-black">Monitoring Anggota</h2>
                    <p className="mt-1 text-sm font-bold text-slate-500">
                      Coach: {dashboard?.coach?.name || "-"}
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

                <div className="mt-5 grid gap-3 md:grid-cols-[220px_1fr]">
                  <select
                    className={fieldClass}
                    value={selectedGroup}
                    onChange={(e) => setSelectedGroup(e.target.value)}
                  >
                    <option value="all">Semua Assigned Group</option>
                    {groups.map((group: any) => (
                      <option
                        key={group.id}
                        value={String(
                          group.wellness_group_unit_id || group.group_name
                        )}
                      >
                        {group.group_name} ({group.member_count || 0})
                      </option>
                    ))}
                  </select>
                  <input
                    className={fieldClass}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Cari nama, kode, group, atau status"
                  />
                </div>

                <div className="mt-5 text-xs font-black uppercase tracking-wide text-slate-400">
                  Menampilkan {filteredParticipants.length} anggota
                </div>
                <label className="mt-3 grid gap-2 text-sm font-bold text-slate-700">
                  Pilih Anggota
                  <select
                    className={`${fieldClass} w-full`}
                    value={selectedParticipant?.id ? String(selectedParticipant.id) : ""}
                    onChange={(event) => {
                      const participant = filteredParticipants.find(
                        (item: any) => String(item.id) === event.target.value
                      );
                      if (participant) chooseParticipant(participant);
                      else setSelectedParticipant(null);
                    }}
                  >
                    <option value="">
                      {filteredParticipants.length > 0
                        ? "Pilih nama peserta"
                        : "Tidak ada peserta pada filter ini"}
                    </option>
                    {filteredParticipants.map((item: any) => (
                      <option key={item.id} value={String(item.id)}>
                        {item.name} | {item.group_name} | Steps {fmtNumber(item.today?.steps || 0)} | {fmtNumber(item.today?.calories || 0)} kkal | {item.status}
                      </option>
                    ))}
                  </select>
                  <span className="text-xs font-bold leading-5 text-slate-400">
                    Format: Nama lengkap · Kelompok · Steps · Kalori · Status
                  </span>
                </label>
              </section>

              <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
                {!selectedParticipant ? (
                  <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
                    <h3 className="text-lg font-black text-slate-900">Pilih Peserta</h3>
                    <p className="mt-2 text-sm font-bold leading-6 text-slate-500">
                      Pilih nama pada daftar untuk melihat progres, target, dan status instruksi.
                    </p>
                  </div>
                ) : (
                  <ParticipantDetail
                    participant={selectedParticipant}
                    targetForm={targetForm}
                    setTargetForm={setTargetForm}
                    saveTargets={saveTargets}
                    openInstruction={() => openInstruction("participant")}
                    saving={saving}
                  />
                )}
              </section>
            </div>
              </div>
            ) : (
              <CoachChatPanel
                dashboard={dashboard}
                participants={participants}
                groups={groups}
                selectedGroup={selectedGroup}
                setSelectedGroup={setSelectedGroup}
                selectedParticipant={selectedParticipant}
                chooseParticipant={chooseParticipant}
                chatMessages={chatMessages}
                chatText={chatText}
                setChatText={setChatText}
                chatLoading={chatLoading}
                chatSending={chatSending}
                loadChat={() => loadMemberChat()}
                sendChat={sendMemberChat}
              />
            )}
          </section>
        )}
      </div>

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
    <div className={`rounded-3xl border p-5 shadow-sm ${toneClass[tone]}`}>
      <div className="text-xs font-black uppercase tracking-wide opacity-70">{label}</div>
      <div className="mt-2 text-2xl font-black">{value}</div>
      <div className="mt-1 text-xs font-bold opacity-70">{note}</div>
    </div>
  );
}

function FlagCard({ level, count, active, onClick }: any) {
  const config: Record<string, any> = {
    green: {
      label: "Green Flag",
      note: "Patuh dan konsisten",
      emoji: "\u{1F7E2}",
      style: "border-emerald-200 bg-emerald-50 text-emerald-900",
    },
    yellow: {
      label: "Yellow Flag",
      note: "Perlu dipantau",
      emoji: "\u{1F7E1}",
      style: "border-amber-200 bg-amber-50 text-amber-900",
    },
    red: {
      label: "Red Flag",
      note: "Perlu follow up",
      emoji: "\u{1F534}",
      style: "border-rose-200 bg-rose-50 text-rose-900",
    },
  };
  const item = config[level];
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-3xl border p-5 text-left shadow-sm transition ${item.style} ${
        active ? "ring-4 ring-slate-200" : "hover:-translate-y-0.5"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-2xl">{item.emoji}</span>
        <span className="text-3xl font-black">{fmtNumber(count)}</span>
      </div>
      <div className="mt-3 text-base font-black">{item.label}</div>
      <div className="mt-1 text-xs font-bold opacity-70">{item.note}</div>
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

function ParticipantDetail({
  participant,
  targetForm,
  setTargetForm,
  saveTargets,
  openInstruction,
  saving,
}: any) {
  const clinical = participant.clinical || {};
  const latestNote = participant.latest_note || null;
  const setTarget = (key: string, value: string) =>
    setTargetForm((previous: any) => ({ ...previous, [key]: value }));

  return (
    <div className="space-y-5">
      <div className="rounded-3xl bg-gradient-to-br from-teal-50 to-sky-50 p-5">
        <div className="text-xs font-black uppercase tracking-[0.18em] text-teal-700">
          Detail Peserta
        </div>
        <h2 className="mt-2 text-2xl font-black text-slate-950">{participant.name}</h2>
        <div className="mt-2 text-sm font-bold leading-6 text-slate-500">
          Kode {participant.code} - {participant.group_name}
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <MiniInfo label="Kepatuhan 7 Hari" value={`${fmtNumber(participant.compliance?.compliance_percent || 0)}%`} />
          <MiniInfo label="Status" value={participant.flag_label || "-"} />
          <MiniInfo label="Nutrisi Hari Ini" value={`${fmtNumber(participant.today?.nutrition_calories || 0)} kkal`} />
          <MiniInfo label="Workout Hari Ini" value={`${fmtNumber(participant.today?.calories || 0)} kkal`} />
          <MiniInfo label="BMI" value={clinical?.bmi ? fmtNumber(clinical.bmi, 1) : "-"} />
          <MiniInfo
            label="Tensi"
            value={clinical?.systolic ? `${clinical.systolic}/${clinical.diastolic || "-"}` : "-"}
          />
        </div>
      </div>

      <div className="rounded-3xl border border-slate-100 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-black">Target Individual</h3>
          <span className="rounded-full bg-sky-50 px-3 py-2 text-[11px] font-black text-sky-700">
            Diterima peserta sebagai instruksi
          </span>
        </div>
        <div className="mt-4 grid gap-3">
          <label className="grid gap-2 text-sm font-bold text-slate-700">
            Batas Konsumsi Kalori Harian (kkal)
            <input
              type="number"
              min="0"
              className={fieldClass}
              value={targetForm.nutrition_max_calories}
              onChange={(e) => setTarget("nutrition_max_calories", e.target.value)}
              placeholder="Contoh: 1700"
            />
          </label>
          <label className="grid gap-2 text-sm font-bold text-slate-700">
            Target Kalori Terbakar dari Workout (kkal)
            <input
              type="number"
              min="0"
              className={fieldClass}
              value={targetForm.workout_min_calories}
              onChange={(e) => setTarget("workout_min_calories", e.target.value)}
              placeholder="Contoh: 300"
            />
          </label>
          <label className="grid gap-2 text-sm font-bold text-slate-700">
            Target Berat Badan (kg)
            <input
              type="number"
              min="0"
              step="0.1"
              className={fieldClass}
              value={targetForm.target_weight_kg}
              onChange={(e) => setTarget("target_weight_kg", e.target.value)}
              placeholder="Contoh: 72"
            />
          </label>
          <label className="grid gap-2 text-sm font-bold text-slate-700">
            Catatan Target
            <textarea
              className={`${fieldClass} min-h-[80px]`}
              value={targetForm.coach_note}
              onChange={(e) => setTarget("coach_note", e.target.value)}
              placeholder="Arahan singkat untuk mencapai target"
            />
          </label>
          <button
            type="button"
            onClick={saveTargets}
            disabled={saving}
            className="rounded-2xl bg-teal-600 px-5 py-4 text-sm font-black text-white disabled:opacity-50"
          >
            {saving ? "Menyimpan..." : "Simpan Target Peserta"}
          </button>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-100 bg-slate-50 p-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-base font-black">Instruksi Terakhir</h3>
          <button
            type="button"
            onClick={openInstruction}
            className="rounded-full bg-slate-950 px-4 py-2 text-xs font-black text-white"
          >
            + Tambah Instruksi
          </button>
        </div>
        {latestNote ? (
          <div className="mt-4">
            <div className="text-sm font-black text-slate-900">
              {latestNote.topic || "Catatan Coaching"}
            </div>
            <div className="mt-2 whitespace-pre-line text-xs font-bold leading-5 text-slate-600">
              {latestNote.coach_note || latestNote.action_plan || "-"}
            </div>
            {latestNote.action_plan ? (
              <div className="mt-3 whitespace-pre-line rounded-2xl bg-white p-3 text-xs font-bold leading-5 text-slate-700">
                {latestNote.action_plan}
              </div>
            ) : null}
            <div
              className={`mt-3 inline-flex rounded-full px-3 py-2 text-xs font-black ${
                latestNote.is_read
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-amber-100 text-amber-800"
              }`}
            >
              {formatReadAt(latestNote.read_at)}
            </div>
          </div>
        ) : (
          <div className="mt-4 text-sm font-bold text-slate-400">Belum ada instruksi.</div>
        )}
      </div>
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

function InstructionModal({
  scope,
  participant,
  selectedGroup,
  groups,
  form,
  setForm,
  saving,
  onClose,
  onSave,
}: any) {
  const group = groups.find(
    (item: any) => String(item.wellness_group_unit_id || item.group_name) === selectedGroup
  );
  const setValue = (key: string, value: string) =>
    setForm((previous: any) => ({ ...previous, [key]: value }));

  return (
    <div className="fixed inset-0 z-[9999] flex items-end justify-center bg-slate-950/60 p-3 backdrop-blur-sm md:items-center">
      <button type="button" className="absolute inset-0" onClick={onClose} aria-label="Tutup" />
      <section className="relative max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-[2rem] bg-white p-5 shadow-2xl md:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.18em] text-teal-600">
              {scope === "group" ? "Instruksi Kelompok" : "Instruksi Individual"}
            </div>
            <h2 className="mt-2 text-2xl font-black">
              {scope === "group" ? group?.group_name || "Kelompok" : participant?.name || "Peserta"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-lg font-black"
          >
            ×
          </button>
        </div>
        <div className="mt-5 grid gap-3">
          <label className="grid gap-2 text-sm font-bold text-slate-700">
            Topik
            <input className={fieldClass} value={form.topic} onChange={(e) => setValue("topic", e.target.value)} />
          </label>
          <label className="grid gap-2 text-sm font-bold text-slate-700">
            Masalah / Fokus
            <textarea
              className={`${fieldClass} min-h-[80px]`}
              value={form.main_issue}
              onChange={(e) => setValue("main_issue", e.target.value)}
              placeholder="Contoh: input nutrisi belum konsisten"
            />
          </label>
          <label className="grid gap-2 text-sm font-bold text-slate-700">
            Instruksi / Note
            <textarea
              className={`${fieldClass} min-h-[110px]`}
              value={form.coach_note}
              onChange={(e) => setValue("coach_note", e.target.value)}
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
                  onChange={(e) => setValue("action_workout_calories", e.target.value)}
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
                  onChange={(e) => setValue("action_nutrition_calories", e.target.value)}
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
                  onChange={(e) => setValue("action_target_weight", e.target.value)}
                  placeholder="Contoh: 72"
                />
              </label>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-2 text-sm font-bold text-slate-700">
              Status Follow Up
              <select className={fieldClass} value={form.follow_up_status} onChange={(e) => setValue("follow_up_status", e.target.value)}>
                <option value="Open">Open</option>
                <option value="In Progress">In Progress</option>
                <option value="Done">Done</option>
                <option value="Need Medical Review">Need Medical Review</option>
              </select>
            </label>
            <label className="grid gap-2 text-sm font-bold text-slate-700">
              Follow Up Berikutnya
              <input type="date" className={fieldClass} value={form.next_follow_up_date} onChange={(e) => setValue("next_follow_up_date", e.target.value)} />
            </label>
          </div>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="rounded-2xl bg-teal-600 px-5 py-4 text-sm font-black text-white shadow-lg shadow-teal-100 disabled:opacity-50"
          >
            {saving
              ? "Mengirim..."
              : scope === "group"
                ? "Kirim ke Seluruh Anggota"
                : "Kirim ke Peserta"}
          </button>
        </div>
      </section>
    </div>
  );
}
