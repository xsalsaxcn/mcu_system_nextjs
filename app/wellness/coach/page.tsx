"use client";

// WELLNESS_COACH_MOBILE_TABLE_MODAL_V58
// WELLNESS_COACH_DETAIL_POINTS_INSTRUCTION_V59
// WELLNESS_COACH_ADMIN_SUPPORT_V61
// WELLNESS_PROGRESS_CHAT_SMOOTH_V65
// WELLNESS_COACH_RANKING_PROFILE_V76
// WELLNESS_COACH_USERNAME_ACCOUNTS_V117A
// WELLNESS_COACH_CANONICAL_GROUP_ACCESS_V126M20_3
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import SupportChatPanel from "@/components/wellness/SupportChatPanel";
import WellnessMomentumDashboard, {
  type WellnessMomentumDay,
} from "@/components/wellness/WellnessMomentumDashboard";
import WellnessLeaderboard from "@/components/wellness/WellnessLeaderboard";
import WellnessProfilePanel, {
  WellnessAvatar,
  WellnessProfileAvatar,
} from "@/components/wellness/WellnessProfile";

// WELLNESS_COACH_PORTAL_FLAGS_TARGETS_V53
// WELLNESS_COACH_GROUP_TARGET_PERSISTENCE_V126M22
// WELLNESS_COACH_COMPACT_LIST_ACTION_CHAT_V54
// WELLNESS_COACH_TABLE_DETAIL_CHARTS_V55
// WELLNESS_COACH_MODAL_RESPONSIVE_CHARTS_V56
// WELLNESS_COACH_MODAL_PORTAL_MISSING_DAYS_V57
// Extends the existing Coach Portal without changing database schema or other modules.

type FlagLevel = "green" | "yellow" | "red";
type CoachView = "monitoring" | "chat" | "ranking" | "profile" | "support";
type CoachParticipantDetail = {
  ok: boolean;
  message?: string;
  participant?: any;
  summary?: any;
  point_breakdown?: any;
  charts?: Record<string, any[]>;
  nutrition_logs?: any[];
  nutrition_sources?: any;
  healthtalks?: any[];
  streak?: any;
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

function participantMatchesSelectedCoachGroup(item: any, selectedGroup: any) {
  const selected = clean(selectedGroup);
  if (!selected || selected === "all") return true;

  const accessIds = Array.isArray(item?.access_group_ids)
    ? item.access_group_ids.map((value: any) => clean(value)).filter(Boolean)
    : [];

  return (
    accessIds.includes(selected) ||
    clean(item?.assigned_group_unit_id) === selected
  );
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

type ReminderFilter =
  | "all"
  | "reminder"
  | "nutrition"
  | "workout"
  | "complete";

function normalizedMissingDays(value: any) {
  if (value === null || value === undefined || value === "") return null;
  const days = Number(value);
  return Number.isFinite(days) ? Math.max(0, Math.floor(days)) : null;
}

function formatDaysWithoutInput(value: any) {
  const days = normalizedMissingDays(value);
  if (days === null) return "Data belum tersedia";
  if (days >= 99) return "Belum pernah input";
  if (days <= 0) return "Hari ini ✓";
  if (days === 1) return "1 hari lalu";
  return `${days} hari lalu`;
}

function reminderMeta(item: any) {
  const nutritionDays = normalizedMissingDays(
    item?.compliance?.days_since_nutrition,
  );
  const workoutDays = normalizedMissingDays(
    item?.compliance?.days_since_workout,
  );
  const nutritionMissing = nutritionDays === null || nutritionDays > 0;
  const workoutMissing = workoutDays === null || workoutDays > 0;
  const complete = !nutritionMissing && !workoutMissing;
  const neverInput =
    nutritionDays !== null &&
    nutritionDays >= 99 &&
    workoutDays !== null &&
    workoutDays >= 99;
  const urgent =
    !complete &&
    (neverInput ||
      (nutritionDays !== null && nutritionDays >= 2) ||
      (workoutDays !== null && workoutDays >= 2));

  let label = "Belum lengkap hari ini";
  let tone = "amber";
  if (complete) {
    label = "Lengkap hari ini";
    tone = "emerald";
  } else if (neverInput) {
    label = "Belum pernah input";
    tone = "rose";
  } else if (urgent) {
    label = "Perlu segera diingatkan";
    tone = "rose";
  } else if (nutritionMissing && workoutMissing) {
    label = "Belum isi hari ini";
    tone = "amber";
  } else if (nutritionMissing) {
    label = "Belum isi nutrisi";
    tone = "orange";
  } else if (workoutMissing) {
    label = "Belum isi workout";
    tone = "sky";
  }

  const priority = complete
    ? 5
    : neverInput
      ? 0
      : urgent
        ? 1
        : nutritionMissing && workoutMissing
          ? 2
          : 3;

  return {
    nutritionDays,
    workoutDays,
    nutritionMissing,
    workoutMissing,
    complete,
    urgent,
    neverInput,
    label,
    tone,
    priority,
  };
}

function formatLastActivityDate(value: any) {
  const raw = clean(value);
  if (!raw) return "Belum ada aktivitas tercatat";
  const date = new Date(`${raw.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return raw;
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

const fieldClass =
  "rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-100";

export default function WellnessCoachPortalPage() {
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("Masuk menggunakan akun coach.");
  const [login, setLogin] = useState({
    email: "",
    username: "",
    access_code: "",
    use_legacy: false,
  });
  const [dashboard, setDashboard] = useState<CoachDashboard | null>(null);
  const [selectedGroup, setSelectedGroup] = useState("all");
  const [flagFilter, setFlagFilter] = useState<"all" | FlagLevel>("all");
  const [reminderFilter, setReminderFilter] =
    useState<ReminderFilter>("all");
  const [search, setSearch] = useState("");
  const [selectedParticipant, setSelectedParticipant] = useState<any>(null);
  const [participantDetail, setParticipantDetail] =
    useState<CoachParticipantDetail | null>(null);
  const [participantDetailLoading, setParticipantDetailLoading] =
    useState(false);
  const [participantModalOpen, setParticipantModalOpen] = useState(false);
  const [coachView, setCoachView] = useState<CoachView>("monitoring");
  const [coachMenuOpen, setCoachMenuOpen] = useState(false);
  const [coachNotificationOpen, setCoachNotificationOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatText, setChatText] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatSending, setChatSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [instructionGroup, setInstructionGroup] = useState("");
  const [instructionScope, setInstructionScope] = useState<
    "participant" | "group"
  >("participant");
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

  async function loadDashboard(options?: {
    keepSelection?: boolean;
    silent?: boolean;
  }) {
    if (!options?.silent) setLoading(true);

    const result = await fetch("/api/wellness/coach/dashboard", {
      cache: "no-store",
    })
      .then((response) => response.json())
      .catch((error) => ({
        ok: false,
        message: error?.message || "Network error",
      }));

    if (result.ok) {
      setDashboard(result);
      if (!options?.silent) setMessage("Portal Coach aktif.");

      if (options?.keepSelection && selectedParticipant?.id) {
        const fresh = (result.participants || []).find(
          (item: any) => Number(item.id) === Number(selectedParticipant.id),
        );
        if (fresh) setSelectedParticipant(fresh);
      }
    } else if (!options?.silent) {
      setDashboard(null);
      setMessage(result.message || "Session coach belum aktif.");
    }

    if (!options?.silent) setLoading(false);
    return result;
  }

  async function submitLogin() {
    const legacy = login.use_legacy === true;

    if (!clean(login.email)) {
      setMessage("Email Coach wajib diisi.");
      return;
    }

    if (legacy && !clean(login.access_code)) {
      setMessage("Access code lama wajib diisi.");
      return;
    }

    if (!legacy && !clean(login.username)) {
      setMessage("Username Coach wajib diisi.");
      return;
    }

    setLoading(true);
    setMessage("Login Coach...");

    const payload = legacy
      ? {
          email: login.email,
          access_code: login.access_code,
        }
      : {
          email: login.email,
          username: login.username,
        };

    const result = await fetch("/api/wellness/coach/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    })
      .then((response) => response.json())
      .catch((error) => ({
        ok: false,
        message: error?.message || "Network error",
      }));

    if (result.ok) {
      await loadDashboard();
    } else {
      setMessage(result.message || "Login gagal.");
      setLoading(false);
    }
  }


  async function logout() {
    await fetch("/api/wellness/coach/me", { method: "DELETE" }).catch(
      () => null,
    );
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
      { cache: "no-store" },
    )
      .then((response) => response.json())
      .catch((error) => ({
        ok: false,
        message: error?.message || "Network error",
      }));

    if (result.ok) setParticipantDetail(result);
    else {
      setParticipantDetail(null);
      setMessage(result.message || "Gagal memuat detail peserta.");
    }
    setParticipantDetailLoading(false);
  }

  function chooseParticipant(item: any, options?: { openDetail?: boolean }) {
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
            groups[0]?.wellness_group_unit_id || groups[0]?.group_name || "",
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
        String(item.wellness_group_unit_id || item.group_name) ===
        targetGroupKey,
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
        nutrition_max_calories: instructionForm.action_nutrition_calories,
        workout_min_calories: instructionForm.action_workout_calories,
        target_weight_kg: instructionForm.action_target_weight,
        follow_up_status: instructionForm.follow_up_status,
        next_follow_up_date: instructionForm.next_follow_up_date,
      }),
    })
      .then((response) => response.json())
      .catch((error) => ({
        ok: false,
        message: error?.message || "Network error",
      }));

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
      .catch((error) => ({
        ok: false,
        message: error?.message || "Network error",
      }));

    if (result.ok) {
      setMessage(result.message || "Target peserta berhasil disimpan.");
      await loadDashboard({ keepSelection: true });
    } else setMessage(result.message || "Gagal menyimpan target peserta.");
    setSaving(false);
  }

  function scrollCoachChatToLatest(behavior: ScrollBehavior = "smooth") {
    if (typeof window === "undefined") return;
    window.setTimeout(() => {
      document.getElementById("coach-member-chat-end")?.scrollIntoView({
        behavior,
        block: "end",
      });
    }, 40);
  }

  async function loadMemberChat(
    participant = selectedParticipant,
    options?: { silent?: boolean; scroll?: boolean },
  ) {
    const participantId = Number(participant?.id || 0);
    if (!participantId) {
      setChatMessages([]);
      return;
    }

    if (!options?.silent) setChatLoading(true);
    const result = await fetch(
      `/api/wellness/coach/notes?participant_id=${participantId}&mode=chat&t=${Date.now()}`,
      { cache: "no-store" },
    )
      .then((response) => response.json())
      .catch((error) => ({
        ok: false,
        message: error?.message || "Network error",
      }));

    if (result.ok) {
      const rows = Array.isArray(result.messages) ? result.messages : [];
      setChatMessages(rows);

      const unreadMemberIds = rows
        .filter((item: any) => item.sender === "participant" && !item.is_read)
        .map((item: any) => Number(item.id))
        .filter(Boolean);

      if (unreadMemberIds.length > 0) {
        const markReadResult = await fetch("/api/wellness/coach/notes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "mark_chat_read",
            participant_id: participantId,
            note_ids: unreadMemberIds,
          }),
        })
          .then((response) => response.json())
          .catch(() => null);

        if (markReadResult?.ok) {
          // WELLNESS_COACH_UNREAD_AUTO_CLEAR_V77E
// WELLNESS_COACH_COMPANY_CHAT_MENU_V78
          // Hilangkan badge langsung setelah server berhasil menandai pesan dibaca.
          const readAt = new Date().toISOString();

          setChatMessages((current) =>
            current.map((item) =>
              unreadMemberIds.includes(Number(item.id))
                ? { ...item, is_read: true, read_at: readAt }
                : item,
            ),
          );

          setSelectedParticipant((current: any) => {
            if (Number(current?.id) !== participantId) return current;

            return {
              ...current,
              unread_chat_count: 0,
              last_chat: current?.last_chat
                ? {
                    ...current.last_chat,
                    is_read: true,
                    read_at: readAt,
                  }
                : current?.last_chat,
            };
          });

          setDashboard((current: any) => {
            if (!current) return current;

            let removedUnread = unreadMemberIds.length;

            const participants = (current.participants || []).map(
              (item: any) => {
                if (Number(item.id) !== participantId) return item;

                const currentUnread = Number(item.unread_chat_count || 0);
                if (currentUnread > 0) removedUnread = currentUnread;

                return {
                  ...item,
                  unread_chat_count: 0,
                  last_chat: item.last_chat
                    ? {
                        ...item.last_chat,
                        is_read: true,
                        read_at: readAt,
                      }
                    : item.last_chat,
                };
              },
            );

            return {
              ...current,
              participants,
              summary: {
                ...(current.summary || {}),
                unread_chat_messages: Math.max(
                  0,
                  Number(current.summary?.unread_chat_messages || 0) -
                    removedUnread,
                ),
              },
            };
          });

          // Rekonsiliasi ringan dengan server tanpa loader/flicker.
          window.setTimeout(
            () =>
              void loadDashboard({
                keepSelection: true,
                silent: true,
              }),
            450,
          );
        }
      }

      if (options?.scroll) scrollCoachChatToLatest("auto");
    } else if (!options?.silent) {
      setMessage(result.message || "Chat member belum dapat dimuat.");
    }

    if (!options?.silent) setChatLoading(false);
  }

  async function sendMemberChat() {
    const participantId = Number(selectedParticipant?.id || 0);
    const chatMessage = clean(chatText);

    if (!participantId) {
      setMessage("Pilih anggota sebelum mengirim chat.");
      return;
    }
    if (!chatMessage || chatSending) return;

    const optimisticId = `coach-pending-${Date.now()}`;
    const optimisticMessage = {
      id: optimisticId,
      sender: "coach",
      message: chatMessage,
      coach_note: chatMessage,
      created_at: new Date().toISOString(),
      is_read: false,
      optimistic: true,
    };

    setChatSending(true);
    setChatText("");
    setChatMessages((current) => [...current, optimisticMessage]);
    scrollCoachChatToLatest();

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
      .catch((error) => ({
        ok: false,
        message: error?.message || "Network error",
      }));

    if (result.ok) {
      const saved = result.chat || {};
      setChatMessages((current) =>
        current.map((item) =>
          item.id === optimisticId
            ? {
                ...saved,
                id: saved.id || optimisticId,
                sender: "coach",
                message: chatMessage,
                coach_note: chatMessage,
                created_at: saved.created_at || optimisticMessage.created_at,
                is_read: false,
                optimistic: false,
              }
            : item,
        ),
      );
      window.setTimeout(
        () => void loadMemberChat(selectedParticipant, { silent: true }),
        900,
      );
      window.setTimeout(
        () => void loadDashboard({ keepSelection: true }),
        1200,
      );
    } else {
      setChatMessages((current) =>
        current.filter((item) => item.id !== optimisticId),
      );
      setChatText((current) => current || chatMessage);
      setMessage(result.message || "Pesan chat gagal dikirim.");
    }

    setChatSending(false);
    scrollCoachChatToLatest();
  }

  useEffect(() => {
    loadDashboard();
  }, []);

  useEffect(() => {
    if (coachView !== "chat" || !selectedParticipant?.id) return;
    void loadMemberChat(selectedParticipant, { scroll: true });
    const intervalId = window.setInterval(() => {
      void loadMemberChat(selectedParticipant, { silent: true });
    }, 12000);
    return () => window.clearInterval(intervalId);
  }, [coachView, selectedParticipant?.id]);

  const participants = dashboard?.participants || [];
  const groups = dashboard?.groups || [];
  const reminderSummary = useMemo(() => {
    return participants.reduce(
      (summary: any, item: any) => {
        const meta = reminderMeta(item);
        if (meta.complete) summary.complete += 1;
        if (meta.nutritionMissing) summary.nutrition += 1;
        if (meta.workoutMissing) summary.workout += 1;
        if (meta.urgent) summary.reminder += 1;
        return summary;
      },
      { complete: 0, nutrition: 0, workout: 0, reminder: 0 },
    );
  }, [participants]);

  const todayCompletionPercent = participants.length
    ? Math.round((reminderSummary.complete / participants.length) * 100)
    : 0;

  const filteredParticipants = useMemo(() => {
    const q = search.toLowerCase();
    return participants
      .filter((item: any) => {
        const meta = reminderMeta(item);
        const byGroup = participantMatchesSelectedCoachGroup(
          item,
          selectedGroup,
        );
        const byFlag = flagFilter === "all" || item.flag === flagFilter;
        const byReminder =
          reminderFilter === "all" ||
          (reminderFilter === "reminder" && meta.urgent) ||
          (reminderFilter === "nutrition" && meta.nutritionMissing) ||
          (reminderFilter === "workout" && meta.workoutMissing) ||
          (reminderFilter === "complete" && meta.complete);
        const haystack = [
          item.name,
          item.code,
          item.group_name,
          item.risk,
          item.status,
          item.flag_reason,
          meta.label,
        ]
          .map((x) => clean(x).toLowerCase())
          .join(" ");
        return byGroup && byFlag && byReminder && (!q || haystack.includes(q));
      })
      .sort((a: any, b: any) => {
        const aMeta = reminderMeta(a);
        const bMeta = reminderMeta(b);
        if (aMeta.priority !== bMeta.priority) {
          return aMeta.priority - bMeta.priority;
        }
        const aDelay = Math.max(
          aMeta.nutritionDays || 0,
          aMeta.workoutDays || 0,
        );
        const bDelay = Math.max(
          bMeta.nutritionDays || 0,
          bMeta.workoutDays || 0,
        );
        if (aDelay !== bDelay) return bDelay - aDelay;
        return clean(a.name).localeCompare(clean(b.name), "id");
      });
  }, [participants, selectedGroup, flagFilter, reminderFilter, search]);


  const priorityParticipants = useMemo(() => {
    const q = search.toLowerCase();

    return participants
      .filter((item: any) => {
        const meta = reminderMeta(item);
        const byGroup = participantMatchesSelectedCoachGroup(
          item,
          selectedGroup,
        );
        const byFlag = flagFilter === "all" || item.flag === flagFilter;
        const haystack = [
          item.name,
          item.code,
          item.group_name,
          item.risk,
          item.status,
          item.flag_reason,
          meta.label,
        ]
          .map((value) => clean(value).toLowerCase())
          .join(" ");

        return (
          byGroup &&
          byFlag &&
          !meta.complete &&
          (!q || haystack.includes(q))
        );
      })
      .sort((left: any, right: any) => {
        const leftMeta = reminderMeta(left);
        const rightMeta = reminderMeta(right);

        if (leftMeta.priority !== rightMeta.priority) {
          return leftMeta.priority - rightMeta.priority;
        }

        const leftDelay = Math.max(
          leftMeta.nutritionDays || 0,
          leftMeta.workoutDays || 0,
        );
        const rightDelay = Math.max(
          rightMeta.nutritionDays || 0,
          rightMeta.workoutDays || 0,
        );

        if (leftDelay !== rightDelay) return rightDelay - leftDelay;

        return clean(left.name).localeCompare(clean(right.name), "id");
      })
      .slice(0, 3);
  }, [participants, selectedGroup, flagFilter, search]);

  function openReminder(item: any) {
    const meta = reminderMeta(item);
    const firstName = clean(item?.name).split(/\s+/)[0] || "Peserta";
    let reminderText = `Halo ${firstName}, jangan lupa melengkapi input Wellness hari ini ya.`;
    if (meta.nutritionMissing && meta.workoutMissing) {
      reminderText = `Halo ${firstName}, jangan lupa melengkapi input nutrisi dan workout hari ini ya. Terima kasih.`;
    } else if (meta.nutritionMissing) {
      reminderText = `Halo ${firstName}, jangan lupa melengkapi input nutrisi hari ini ya. Terima kasih.`;
    } else if (meta.workoutMissing) {
      reminderText = `Halo ${firstName}, jangan lupa melengkapi input workout hari ini ya. Terima kasih.`;
    }

    chooseParticipant(item, { openDetail: false });
    setChatText(reminderText);
    setCoachView("chat");
    setMessage(`Reminder untuk ${item?.name || "peserta"} sudah disiapkan.`);
  }

  const isLoggedIn = !!dashboard?.coach;

  // WELLNESS_COACH_OPENING_LOADING_V114
  // Selama request pengecekan session/dashboard berlangsung, jangan render
  // Login Coach. Setelah loading selesai, existing flow menentukan apakah
  // dashboard atau Login Coach yang ditampilkan.
  if (loading) {
    return <CoachOpeningLoadingScreen />;
  }

  // WELLNESS_COACH_SUPPORT_ISOLATED_V64
  // Chat with Admin memakai workspace yang sama persis dengan Portal Peserta,
  // tanpa card header/status Portal Coach di belakangnya.
  if (isLoggedIn && coachView === "support") {
    return (
      <SupportChatPanel
        actorType="coach"
        onClose={() => setCoachView("monitoring")}
      />
    );
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#fbfefe_0%,#f4f9fb_44%,#f8fafc_100%)] text-slate-900">
      {/* WELLNESS_COACH_UI_REFRESH_V107 */}
      {/* WELLNESS_COACH_COMPACT_DASHBOARD_V109 */}
      {/* WELLNESS_COACH_COMMAND_CENTER_V112 */}
      {/* WELLNESS_COACH_PROFESSIONAL_DASHBOARD_V113: UI/UX only; all existing functions remain unchanged. */}
      <div className="mx-auto max-w-7xl px-3 pb-10 pt-3 sm:px-5 md:px-8 md:pb-12 md:pt-5">
        {/* WELLNESS_COACH_CHAT_DIRECT_HEADER_V77D */}
        {!isLoggedIn || coachView === "monitoring" ? (
          <>
            <section className="overflow-hidden rounded-[1.65rem] border border-slate-200/80 bg-white p-3 shadow-[0_16px_44px_rgba(15,23,42,0.06)] sm:p-4">
              {/* WELLNESS_COACH_PROFESSIONAL_DASHBOARD_V113 */}
              <div className="flex items-center justify-between gap-3 px-1 pb-3">
                <button
                  type="button"
                  onClick={() => setCoachMenuOpen(true)}
                  className="flex min-w-0 items-center gap-3 rounded-xl text-left focus:outline-none focus:ring-2 focus:ring-teal-300"
                  aria-label="Buka menu Coach"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-800">
                    <CoachDashboardIcon name="menu" className="h-5 w-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[9px] font-black uppercase tracking-[0.18em] text-teal-600">
                      Wellness Coach
                    </span>
                    <span className="block truncate text-sm font-black text-slate-950 sm:text-base">
                      Coach Command Center
                    </span>
                  </span>
                </button>

                {isLoggedIn ? (
                  <div className="relative flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setCoachNotificationOpen((previous) => !previous)
                      }
                      className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-teal-200 hover:bg-teal-50 hover:text-teal-700"
                      aria-label="Buka notifikasi Coach"
                    >
                      <CoachDashboardIcon name="bell" className="h-5 w-5" />
                      {Number(dashboard?.summary?.unread_chat_messages || 0) > 0 ? (
                        <span className="absolute -right-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-black text-white ring-2 ring-white">
                          {Number(dashboard?.summary?.unread_chat_messages || 0) > 99
                            ? "99+"
                            : Number(dashboard?.summary?.unread_chat_messages || 0)}
                        </span>
                      ) : null}
                    </button>

                    <WellnessProfileAvatar
                      actorType="coach"
                      name={dashboard?.coach?.name || "Coach Wellness"}
                      size="sm"
                      className="ring-2 ring-teal-100"
                    />

                    {coachNotificationOpen ? (
                      <div className="absolute right-0 top-12 z-[80] w-[min(19rem,calc(100vw-2rem))] rounded-[1.35rem] border border-slate-100 bg-white p-3 text-slate-900 shadow-2xl">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedGroup("all");
                            setSelectedParticipant(null);
                            setChatMessages([]);
                            setCoachView("chat");
                            setCoachNotificationOpen(false);
                          }}
                          className="flex w-full items-center justify-between gap-3 rounded-xl bg-sky-50 px-4 py-3 text-left"
                        >
                          <span className="text-sm font-black text-sky-950">
                            Chat With Member
                          </span>
                          {Number(dashboard?.summary?.unread_chat_messages || 0) > 0 ? (
                            <span className="rounded-full bg-rose-500 px-2.5 py-1 text-xs font-black text-white">
                              {Number(dashboard?.summary?.unread_chat_messages || 0)}
                            </span>
                          ) : null}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setCoachView("support");
                            setCoachNotificationOpen(false);
                          }}
                          className="mt-2 w-full rounded-xl bg-indigo-50 px-4 py-3 text-left text-sm font-black text-indigo-950"
                        >
                          Chat With Admin
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div
                className={`relative overflow-hidden rounded-[1.45rem] p-4 sm:p-5 ${
                  isLoggedIn
                    ? "bg-[linear-gradient(135deg,#064e4b_0%,#08766f_58%,#0f9289_100%)] text-white"
                    : "border border-slate-200 bg-slate-50 text-slate-900"
                }`}
              >
                {isLoggedIn ? (
                  <>
                    <div className="pointer-events-none absolute -right-14 -top-16 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
                    <div className="pointer-events-none absolute -bottom-20 left-1/3 h-44 w-44 rounded-full bg-cyan-200/10 blur-3xl" />
                  </>
                ) : null}

                <div className="relative grid grid-cols-[5.4rem_minmax(0,1fr)] items-center gap-4 sm:grid-cols-[6.7rem_minmax(0,1fr)] sm:gap-5">
                  <CoachCompletionRing value={todayCompletionPercent} />

                  <div className="min-w-0">
                    <div className={`text-[10px] font-black uppercase tracking-[0.15em] ${isLoggedIn ? "text-cyan-100/80" : "text-teal-700"}`}>
                      Selamat datang
                    </div>
                    <h1 className={`mt-1 break-words text-2xl font-black leading-tight sm:text-3xl ${isLoggedIn ? "text-white" : "text-slate-950"}`}>
                      {isLoggedIn
                        ? `Coach ${dashboard?.coach?.name || "Wellness"}`
                        : "Portal Coach"}
                    </h1>
                    <p className={`mt-1.5 text-[11px] font-bold leading-5 sm:text-xs ${isLoggedIn ? "text-white/70" : "text-slate-500"}`}>
                      Kelola peserta dan bantu mereka mencapai target Wellness hari ini.
                    </p>
                  </div>
                </div>

                {isLoggedIn ? (
                  <div className="relative mt-4 grid grid-cols-3 gap-2">
                    <CoachHeroStat
                      icon="users"
                      label="Peserta aktif"
                      value={fmtNumber(participants.length)}
                    />
                    <CoachHeroStat
                      icon="check"
                      label="Lengkap"
                      value={fmtNumber(reminderSummary.complete)}
                    />
                    <CoachHeroStat
                      icon="bell"
                      label="Perlu follow-up"
                      value={fmtNumber(reminderSummary.reminder)}
                    />
                  </div>
                ) : null}
              </div>
            </section>

            {loading || message !== "Portal Coach aktif." ? (
              <section className="mt-3">
                <div
                  className={`rounded-2xl border px-4 py-3 text-sm font-bold leading-6 shadow-sm ${
                    /gagal|wajib|belum|pilih/i.test(message)
                      ? "border-amber-200 bg-amber-50 text-amber-900"
                      : "border-sky-100 bg-sky-50 text-sky-800"
                  }`}
                >
                  {loading ? "Memuat Portal Coach..." : message}
                </div>
              </section>
            ) : null}
          </>
        ) : coachView === "chat" ? (
          <section className="relative flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-1 pb-2 pt-1">
            <div className="min-w-0">
              <div className="text-[9px] font-black uppercase tracking-[0.15em] text-teal-600">
                Member Chat
              </div>
              <h1 className="mt-0.5 text-lg font-black leading-tight text-slate-950">
                Chat With Member
              </h1>
            </div>

            <div className="relative flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  setCoachNotificationOpen((previous) => !previous)
                }
                className="relative flex h-10 w-10 items-center justify-center rounded-full border border-slate-100 bg-white text-lg shadow-sm"
                aria-label="Buka notifikasi Coach"
              >
                🔔
                {Number(dashboard?.summary?.unread_chat_messages || 0) > 0 ? (
                  <span className="absolute -right-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-black text-white ring-2 ring-white">
                    {Number(dashboard?.summary?.unread_chat_messages || 0) > 99
                      ? "99+"
                      : Number(dashboard?.summary?.unread_chat_messages || 0)}
                  </span>
                ) : null}
              </button>

              <button
                type="button"
                onClick={() => setCoachMenuOpen(true)}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-950 text-lg font-black text-white shadow-sm"
                aria-label="Buka menu Coach"
              >
                ☰
              </button>

              {coachNotificationOpen ? (
                <div className="absolute right-0 top-12 z-[80] w-[min(19rem,calc(100vw-2rem))] rounded-[1.4rem] border border-slate-100 bg-white p-3 shadow-2xl">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedGroup("all");
                      setSelectedParticipant(null);
                      setChatMessages([]);
                      setCoachNotificationOpen(false);
                    }}
                    className="flex w-full items-center justify-between rounded-2xl bg-sky-50 px-4 py-3 text-left text-sm font-black text-sky-950"
                  >
                    <span>💬 Semua percakapan</span>
                    <span>{fmtNumber(dashboard?.summary?.unread_chat_messages || 0)}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCoachView("support");
                      setCoachNotificationOpen(false);
                    }}
                    className="mt-2 w-full rounded-2xl bg-indigo-50 px-4 py-3 text-left text-sm font-black text-indigo-950"
                  >
                    🛠️ Chat With Admin
                  </button>
                </div>
              ) : null}
            </div>
          </section>
        ) : (
          <section className="relative flex items-center justify-between gap-3 rounded-[1.1rem] border border-slate-100 bg-white px-3 py-2.5 shadow-sm">
            <div className="min-w-0">
              <div className="text-[9px] font-black uppercase tracking-[0.15em] text-teal-600">
                Wellness Coach
              </div>
              <h1 className="mt-0.5 break-words text-lg font-black leading-tight text-slate-950">
                {coachView === "ranking"
                  ? "Ranking Kelompok"
                  : coachView === "profile"
                    ? "Profil Coach"
                    : "Portal Coach"}
              </h1>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => setCoachMenuOpen(true)}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-950 text-lg font-black text-white shadow-sm"
                aria-label="Buka menu Coach"
              >
                ☰
              </button>
            </div>
          </section>
        )}

        {!isLoggedIn ? (
          <LoginSection
            login={login}
            setLogin={setLogin}
            submitLogin={submitLogin}
            loading={loading}
          />
        ) : (
          <section className={coachView === "chat" ? "mt-2" : "mt-6"}>
            {coachView === "monitoring" ? (
              <div className="space-y-5">
                {/* WELLNESS_COACH_PROFESSIONAL_DASHBOARD_V113 */}
                <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.22fr)_minmax(21rem,0.78fr)]">
                  <div className="space-y-5">
                    <section className="rounded-[1.55rem] border border-slate-200/80 bg-white p-4 shadow-[0_12px_34px_rgba(15,23,42,0.045)] sm:p-5">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-[9px] font-black uppercase tracking-[0.17em] text-teal-600">
                            Ringkasan Harian
                          </div>
                          <h2 className="mt-1 text-lg font-black text-slate-950 sm:text-xl">
                            Status Peserta Hari Ini
                          </h2>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setReminderFilter("all");
                            window.setTimeout(() => {
                              document
                                .getElementById("coach-participant-table")
                                ?.scrollIntoView({ behavior: "smooth", block: "start" });
                            }, 60);
                          }}
                          className="shrink-0 text-[10px] font-black text-teal-700 sm:text-xs"
                        >
                          Lihat semua ›
                        </button>
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                        <ReminderSummaryCard
                          label="Lengkap"
                          value={fmtNumber(reminderSummary.complete)}
                          note="peserta"
                          tone="emerald"
                          active={reminderFilter === "complete"}
                          onClick={() => setReminderFilter("complete")}
                        />
                        <ReminderSummaryCard
                          label="Belum Nutrisi"
                          value={fmtNumber(reminderSummary.nutrition)}
                          note="peserta"
                          tone="orange"
                          active={reminderFilter === "nutrition"}
                          onClick={() => setReminderFilter("nutrition")}
                        />
                        <ReminderSummaryCard
                          label="Belum Workout"
                          value={fmtNumber(reminderSummary.workout)}
                          note="peserta"
                          tone="sky"
                          active={reminderFilter === "workout"}
                          onClick={() => setReminderFilter("workout")}
                        />
                        <ReminderSummaryCard
                          label="Perlu Follow-up"
                          value={fmtNumber(reminderSummary.reminder)}
                          note="peserta"
                          tone="rose"
                          active={reminderFilter === "reminder"}
                          onClick={() => setReminderFilter("reminder")}
                        />
                      </div>
                    </section>

                    <section className="rounded-[1.55rem] border border-slate-200/80 bg-white p-4 shadow-[0_12px_34px_rgba(15,23,42,0.045)] sm:p-5">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-[9px] font-black uppercase tracking-[0.17em] text-teal-600">
                            Progress Kelompok
                          </div>
                          <h2 className="mt-1 text-lg font-black text-slate-950">
                            Penyelesaian Input
                          </h2>
                        </div>
                        <span className="rounded-full bg-slate-50 px-3 py-2 text-[9px] font-black text-slate-500">
                          Hari ini
                        </span>
                      </div>

                      <div className="mt-5 grid grid-cols-3 gap-2 sm:gap-4">
                        <CoachProgressMetric
                          label="Lengkap"
                          value={todayCompletionPercent}
                          tone="emerald"
                        />
                        <CoachProgressMetric
                          label="Nutrisi"
                          value={participants.length
                            ? Math.round(
                                ((participants.length - reminderSummary.nutrition) /
                                  participants.length) *
                                  100,
                              )
                            : 0}
                          tone="orange"
                        />
                        <CoachProgressMetric
                          label="Workout"
                          value={participants.length
                            ? Math.round(
                                ((participants.length - reminderSummary.workout) /
                                  participants.length) *
                                  100,
                              )
                            : 0}
                          tone="sky"
                        />
                      </div>
                    </section>
                  </div>

                  <div className="space-y-5">
                    <section className="overflow-hidden rounded-[1.55rem] border border-slate-200/80 bg-white shadow-[0_12px_34px_rgba(15,23,42,0.045)]">
                      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-5">
                        <div>
                          <div className="text-[9px] font-black uppercase tracking-[0.17em] text-rose-500">
                            Peserta Perlu Perhatian
                          </div>
                          <h2 className="mt-1 text-lg font-black text-slate-950">
                            Prioritas Hari Ini
                          </h2>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setReminderFilter("reminder");
                            window.setTimeout(() => {
                              document
                                .getElementById("coach-participant-table")
                                ?.scrollIntoView({ behavior: "smooth", block: "start" });
                            }, 60);
                          }}
                          className="shrink-0 text-[10px] font-black text-teal-700 sm:text-xs"
                        >
                          Lihat semua ›
                        </button>
                      </div>

                      <div className="divide-y divide-slate-100">
                        {priorityParticipants.length === 0 ? (
                          <div className="px-5 py-10 text-center">
                            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                              <CoachDashboardIcon name="check" className="h-5 w-5" />
                            </div>
                            <div className="mt-3 text-sm font-black text-slate-800">
                              Semua peserta sudah lengkap
                            </div>
                            <p className="mt-1 text-xs font-bold text-slate-400">
                              Belum ada peserta yang membutuhkan follow-up.
                            </p>
                          </div>
                        ) : (
                          priorityParticipants.map((item: any) => (
                            <CoachPriorityParticipantRow
                              key={item.id}
                              item={item}
                              onDetail={() => chooseParticipant(item)}
                              onChat={() => {
                                chooseParticipant(item, { openDetail: false });
                                setCoachView("chat");
                              }}
                              onReminder={() => openReminder(item)}
                            />
                          ))
                        )}
                      </div>
                    </section>

                    <section className="rounded-[1.55rem] border border-slate-200/80 bg-white p-4 shadow-[0_12px_34px_rgba(15,23,42,0.045)] sm:p-5">
                      <div className="text-[9px] font-black uppercase tracking-[0.17em] text-teal-600">
                        Aksi Cepat
                      </div>
                      <h2 className="mt-1 text-lg font-black text-slate-950">
                        Shortcut Coach
                      </h2>

                      <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-2">
                        <CoachQuickAction
                          icon="bell"
                          label="Kirim Pengingat"
                          tone="emerald"
                          onClick={() => {
                            setReminderFilter("reminder");
                            window.setTimeout(() => {
                              document
                                .getElementById("coach-participant-table")
                                ?.scrollIntoView({ behavior: "smooth", block: "start" });
                            }, 60);
                          }}
                        />
                        <CoachQuickAction
                          icon="clipboard"
                          label="Instruksi Grup"
                          tone="sky"
                          onClick={() => openInstruction("group")}
                        />
                        <CoachQuickAction
                          icon="message"
                          label="Chat Member"
                          tone="violet"
                          onClick={() => {
                            setSelectedGroup("all");
                            setSelectedParticipant(null);
                            setChatMessages([]);
                            setCoachView("chat");
                          }}
                        />
                        <CoachQuickAction
                          icon="trophy"
                          label="Ranking"
                          tone="amber"
                          onClick={() => setCoachView("ranking")}
                        />
                        <CoachQuickAction
                          icon="support"
                          label="Chat Admin"
                          tone="rose"
                          onClick={() => setCoachView("support")}
                        />
                        <CoachQuickAction
                          icon="refresh"
                          label="Refresh Data"
                          tone="slate"
                          onClick={() => loadDashboard({ keepSelection: true })}
                        />
                      </div>
                    </section>
                  </div>
                </div>

                <section
                  id="coach-participant-table"
                  className="overflow-hidden rounded-[1.6rem] border border-slate-200/80 bg-white shadow-[0_12px_34px_rgba(15,23,42,0.05)]"
                >
                  <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-5">
                    <div>
                      <h2 className="text-lg font-black text-slate-950 sm:text-xl">
                        Daftar Peserta
                      </h2>
                      <p className="mt-1 text-xs font-bold text-slate-500">
                        Buka peserta untuk melihat grafik, target, dan history.
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openInstruction("group")}
                        className="rounded-full bg-teal-600 px-3 py-2 text-[10px] font-black text-white shadow-sm sm:px-4 sm:text-xs"
                      >
                        + Instruksi
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          loadDashboard({ keepSelection: true })
                        }
                        className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-base font-black text-slate-700 shadow-sm"
                        aria-label="Refresh peserta"
                      >
                        ↻
                      </button>
                    </div>
                  </div>

                  <div className="border-b border-slate-100 px-4 py-4 sm:px-5">
                    <div className="text-sm font-black text-slate-950">
                      Filter Cepat
                    </div>

                    <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                      {[
                        ["all", "Semua"],
                        ["nutrition", "Belum Nutrisi"],
                        ["workout", "Belum Workout"],
                        ["reminder", "Reminder"],
                        ["complete", "Lengkap"],
                      ].map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() =>
                            setReminderFilter(value as ReminderFilter)
                          }
                          className={`shrink-0 rounded-full px-4 py-2 text-xs font-black transition ${
                            reminderFilter === value
                              ? "bg-teal-600 text-white shadow-sm"
                              : "border border-teal-200 bg-white text-teal-700"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>

                    <div className="mt-3 grid gap-2 sm:grid-cols-[210px_1fr]">
                      <select
                        className={`${fieldClass} min-h-[44px] py-2.5`}
                        value={selectedGroup}
                        onChange={(event) =>
                          setSelectedGroup(event.target.value)
                        }
                      >
                        <option value="all">Semua Assigned Group</option>
                        {groups.map((group: any) => (
                          <option
                            key={group.id}
                            value={String(
                              group.wellness_group_unit_id ||
                                group.group_name,
                            )}
                          >
                            {group.group_name} ({group.member_count || 0})
                          </option>
                        ))}
                      </select>

                      <div className="relative">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">
                          🔍
                        </span>
                        <input
                          className={`${fieldClass} min-h-[44px] w-full py-2.5 pl-9`}
                          value={search}
                          onChange={(event) => setSearch(event.target.value)}
                          placeholder="Cari nama, kode, atau kelompok"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3 bg-slate-50/70 px-4 py-2.5 text-[10px] font-black uppercase tracking-wide text-slate-400 sm:px-5">
                    <span>{filteredParticipants.length} peserta</span>
                    <span>
                      {reminderFilter === "all"
                        ? "Semua"
                        : reminderFilter === "reminder"
                          ? "Reminder"
                          : reminderFilter === "nutrition"
                            ? "Belum nutrisi"
                            : reminderFilter === "workout"
                              ? "Belum workout"
                              : "Lengkap"}
                    </span>
                  </div>

                  <div className="divide-y divide-slate-100">
                    {filteredParticipants.length === 0 ? (
                      <div className="px-5 py-12 text-center">
                        <div className="text-sm font-black text-slate-700">
                          Tidak ada peserta
                        </div>
                        <p className="mt-1 text-xs font-bold text-slate-400">
                          Tidak ada peserta yang sesuai dengan filter.
                        </p>
                      </div>
                    ) : (
                      filteredParticipants.map((item: any) => (
                        <CoachParticipantCompactRow
                          key={item.id}
                          item={item}
                          active={
                            Number(selectedParticipant?.id) ===
                            Number(item.id)
                          }
                          onClick={() => chooseParticipant(item)}
                        />
                      ))
                    )}
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
                clearParticipant={() => {
                  setSelectedParticipant(null);
                  setParticipantDetail(null);
                  setChatMessages([]);
                }}
                chatMessages={chatMessages}
                chatText={chatText}
                setChatText={setChatText}
                chatLoading={chatLoading}
                chatSending={chatSending}
                loadChat={() => loadMemberChat()}
                sendChat={sendMemberChat}
              />
            ) : coachView === "ranking" ? (
              <WellnessLeaderboard groups={groups} />
            ) : coachView === "profile" ? (
              <div className="space-y-5">
                <WellnessProfilePanel
                  actorType="coach"
                  actor={dashboard?.coach}
                  title={dashboard?.coach?.name || "Profil Coach"}
                />

                <CoachProfileUsernamePanel
                  coach={dashboard?.coach}
                  onSaved={() =>
                    loadDashboard({
                      keepSelection: true,
                      silent: true,
                    })
                  }
                />
              </div>
            ) : (
              <SupportChatPanel
                actorType="coach"
                onClose={() => setCoachView("monitoring")}
              />
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
                <div className="text-base font-black">
                  📊 Monitoring Peserta
                </div>
                <div className="mt-1 text-sm font-bold text-slate-500">
                  Flag kepatuhan, target, dan instruksi
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSelectedGroup("all");
                  setSelectedParticipant(null);
                  setChatMessages([]);
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
                  <div className="text-base font-black">
                    💬 Chat With Member
                  </div>
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
                  window.location.href = "/wellness/coach/company-chat";
                }}
                className="w-full rounded-3xl border border-slate-100 bg-white p-4 text-left"
              >
                <div className="text-base font-black">🏢 Chat With Company</div>
                <div className="mt-1 text-sm font-bold text-slate-500">
                  Komunikasi dengan PIC perusahaan assigned group
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setCoachView("ranking");
                  setCoachMenuOpen(false);
                }}
                className={`w-full rounded-3xl border p-4 text-left ${
                  coachView === "ranking"
                    ? "border-violet-200 bg-violet-50"
                    : "border-slate-100 bg-white"
                }`}
              >
                <div className="text-base font-black">🏆 Ranking Kelompok</div>
                <div className="mt-1 text-sm font-bold text-slate-500">
                  Top 10 point, kerajinan, workout, nutrisi, dan Health Talk
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setCoachView("profile");
                  setCoachMenuOpen(false);
                }}
                className={`w-full rounded-3xl border p-4 text-left ${
                  coachView === "profile"
                    ? "border-amber-200 bg-amber-50"
                    : "border-slate-100 bg-white"
                }`}
              >
                <div className="text-base font-black">👤 Profil Coach</div>
                <div className="mt-1 text-sm font-bold text-slate-500">
                  Data Coach dan Add Profile Picture
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
  clearParticipant,
  chatMessages,
  chatText,
  setChatText,
  chatLoading,
  chatSending,
  loadChat,
  sendChat,
}: any) {
  // WELLNESS_COACH_CHAT_WHATSAPP_DIRECT_V77D
// WELLNESS_COACH_UNREAD_AUTO_CLEAR_V77E
  const [chatSearch, setChatSearch] = useState("");
  const [memberMenuOpen, setMemberMenuOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);

  const selectedGroupObject = (groups || []).find(
    (group: any) =>
      String(group.wellness_group_unit_id || group.group_name) ===
      String(selectedGroup),
  );
  const groupFilteredParticipants = (participants || []).filter((item: any) =>
    participantMatchesSelectedCoachGroup(item, selectedGroup),
  );

  // Group filtering is fail-closed: an empty group stays empty instead of
  // silently falling back to every assigned participant.
  const availableParticipants = groupFilteredParticipants;

  const conversations = [...availableParticipants].sort(
    (left: any, right: any) => {
      const unreadDifference =
        Number(right.unread_chat_count || 0) -
        Number(left.unread_chat_count || 0);
      if (unreadDifference !== 0) return unreadDifference;

      const rightTime =
        new Date(right.last_chat?.created_at || 0).getTime() || 0;
      const leftTime =
        new Date(left.last_chat?.created_at || 0).getTime() || 0;
      if (rightTime !== leftTime) return rightTime - leftTime;

      return clean(left.name).localeCompare(clean(right.name), "id");
    },
  );

  const normalizedSearch = clean(chatSearch).toLowerCase();
  const filteredConversations = conversations.filter((item: any) => {
    if (!normalizedSearch) return true;
    return [item.name, item.code, item.group_name, item.last_chat?.message]
      .map((value) => clean(value).toLowerCase())
      .join(" ")
      .includes(normalizedSearch);
  });

  function openConversation(item: any) {
    chooseParticipant(item);
    setMemberMenuOpen(false);
  }

  if (!selectedParticipant) {
    return (
      <section className="overflow-hidden border-y border-slate-200 bg-white sm:rounded-[1.25rem] sm:border">
        <div className="sticky top-0 z-20 border-b border-slate-100 bg-white px-3 py-2.5">
          <div className="flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">
                🔍
              </span>
              <input
                value={chatSearch}
                onChange={(event) => setChatSearch(event.target.value)}
                placeholder="Cari percakapan"
                className="h-11 w-full rounded-full border border-slate-200 bg-slate-50 pl-9 pr-4 text-sm font-semibold text-slate-900 outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-100"
              />
            </div>

            <button
              type="button"
              onClick={() => setFilterOpen((previous) => !previous)}
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border text-lg shadow-sm ${
                filterOpen || selectedGroup !== "all"
                  ? "border-teal-200 bg-teal-50 text-teal-700"
                  : "border-slate-200 bg-white text-slate-700"
              }`}
              aria-label="Filter group"
            >
              ☰
            </button>
          </div>

          {filterOpen ? (
            <div className="mt-2 rounded-2xl bg-slate-50 p-2">
              <select
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 outline-none focus:border-teal-400"
                value={selectedGroup}
                onChange={(event) => setSelectedGroup(event.target.value)}
              >
                <option value="all">Semua Assigned Group</option>
                {(groups || []).map((group: any) => (
                  <option
                    key={group.id}
                    value={String(
                      group.wellness_group_unit_id || group.group_name,
                    )}
                  >
                    {group.group_name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>

        <div className="max-h-[calc(100vh-13.5rem)] min-h-[30rem] divide-y divide-slate-100 overflow-y-auto">
          {filteredConversations.length === 0 ? (
            <div className="px-5 py-16 text-center">
              <div className="text-base font-black text-slate-900">
                Belum ada peserta
              </div>
              <div className="mt-2 text-sm font-bold leading-5 text-slate-500">
                Tidak ada peserta yang sesuai dengan pencarian.
              </div>
            </div>
          ) : (
            filteredConversations.map((item: any) => {
              const unread = Number(item.unread_chat_count || 0);
              const lastMessage = clean(item.last_chat?.message);
              const fromCoach = item.last_chat?.sender === "coach";

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => openConversation(item)}
                  className="flex w-full items-center gap-3 px-3 py-3 text-left transition active:bg-slate-100 sm:px-4"
                >
                  <WellnessAvatar
                    name={item.name}
                    src={
                      item.profile_photo_preview_url ||
                      item.profile_photo_url
                    }
                    size="md"
                  />

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div
                        className={`min-w-0 break-words text-[14px] leading-5 text-slate-950 ${
                          unread > 0 ? "font-black" : "font-bold"
                        }`}
                      >
                        {item.name}
                      </div>
                      <div
                        className={`shrink-0 pt-0.5 text-[10px] font-bold ${
                          unread > 0 ? "text-teal-700" : "text-slate-400"
                        }`}
                      >
                        {item.last_chat?.created_at
                          ? formatChatTime(item.last_chat.created_at)
                          : ""}
                      </div>
                    </div>

                    <div className="mt-0.5 flex items-center justify-between gap-3">
                      <div className="min-w-0 truncate text-xs font-semibold text-slate-500">
                        {lastMessage
                          ? `${fromCoach ? "Anda: " : ""}${lastMessage}`
                          : `${item.group_name} · Belum ada pesan`}
                      </div>
                      {unread > 0 ? (
                        <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-teal-600 px-1.5 text-[10px] font-black text-white">
                          {unread > 99 ? "99+" : unread}
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-0.5 text-[10px] font-bold text-slate-400">
                      {item.group_name} · {item.code}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="overflow-hidden border-y border-slate-200 bg-white sm:rounded-[1.25rem] sm:border">
      <div className="sticky top-0 z-20 flex items-center gap-2 border-b border-slate-100 bg-white px-3 py-2.5">
        <button
          type="button"
          onClick={clearParticipant}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-lg font-black text-slate-700"
          aria-label="Kembali ke daftar percakapan"
        >
          ←
        </button>

        <WellnessAvatar
          name={selectedParticipant.name}
          src={
            selectedParticipant.profile_photo_preview_url ||
            selectedParticipant.profile_photo_url
          }
          size="sm"
        />

        <div className="min-w-0 flex-1">
          <div className="break-words text-sm font-black leading-5 text-slate-950">
            {selectedParticipant.name}
          </div>
          <div className="truncate text-[10px] font-bold text-slate-500">
            {selectedParticipant.group_name}
          </div>
        </div>

        <button
          type="button"
          onClick={() => loadChat()}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-base font-black text-slate-700"
          aria-label="Refresh chat"
        >
          ↻
        </button>

        <button
          type="button"
          onClick={() => setMemberMenuOpen((previous) => !previous)}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-950 text-lg font-black text-white"
          aria-label="Pilih peserta lain"
        >
          ☰
        </button>

        {memberMenuOpen ? (
          <div className="absolute right-3 top-[3.6rem] z-40 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-[1.4rem] border border-slate-100 bg-white shadow-2xl">
            <div className="border-b border-slate-100 p-3">
              <div className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400">
                Chat With Member
              </div>
              <input
                className="mt-2 h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold outline-none focus:border-teal-400"
                value={chatSearch}
                onChange={(event) => setChatSearch(event.target.value)}
                placeholder="Cari nama"
              />
            </div>

            <div className="max-h-[22rem] overflow-y-auto p-2">
              {filteredConversations.map((item: any) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => openConversation(item)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left ${
                    Number(item.id) === Number(selectedParticipant.id)
                      ? "bg-teal-50"
                      : "hover:bg-slate-50"
                  }`}
                >
                  <WellnessAvatar
                    name={item.name}
                    src={
                      item.profile_photo_preview_url ||
                      item.profile_photo_url
                    }
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="break-words text-sm font-black leading-5 text-slate-950">
                      {item.name}
                    </div>
                    <div className="truncate text-[10px] font-bold text-slate-500">
                      {item.group_name}
                    </div>
                  </div>
                  {Number(item.unread_chat_count || 0) > 0 ? (
                    <span className="rounded-full bg-rose-600 px-2 py-1 text-[10px] font-black text-white">
                      {Number(item.unread_chat_count)}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="max-h-[calc(100vh-16.5rem)] min-h-[27rem] space-y-2 overflow-y-auto bg-[#efeae2] px-3 py-4">
        {chatLoading ? (
          <div className="py-14 text-center text-sm font-bold text-slate-400">
            Memuat percakapan...
          </div>
        ) : chatMessages.length === 0 ? (
          <div className="mx-auto mt-12 max-w-xs rounded-xl bg-white/80 px-5 py-4 text-center shadow-sm">
            <div className="text-sm font-black text-slate-900">
              Belum ada percakapan
            </div>
            <div className="mt-1 text-xs font-bold text-slate-500">
              Kirim pesan pertama kepada peserta.
            </div>
          </div>
        ) : (
          chatMessages.map((item: any) => {
            const fromCoach = item.sender === "coach";

            return (
              <div
                key={item.id}
                className={`flex ${
                  fromCoach ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-[84%] rounded-lg px-3 py-2 shadow-sm ${
                    fromCoach
                      ? "rounded-br-sm bg-[#d9fdd3] text-slate-950"
                      : "rounded-bl-sm bg-white text-slate-950"
                  } ${item.optimistic ? "opacity-80" : "opacity-100"}`}
                >
                  <div className="whitespace-pre-wrap break-words text-[13px] font-semibold leading-5">
                    {item.message || item.coach_note || "-"}
                  </div>
                  <div className="mt-1 flex items-center justify-end gap-1 text-[9px] font-bold text-slate-400">
                    <span>
                      {formatChatTime(item.created_at || item.session_date)}
                    </span>
                    {fromCoach ? (
                      <span className={item.is_read ? "text-sky-500" : ""}>
                        {item.is_read ? "✓✓" : "✓"}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div id="coach-member-chat-end" className="h-px" aria-hidden="true" />
      </div>

      <div className="flex items-end gap-2 border-t border-slate-100 bg-white p-2.5">
        <textarea
          className="max-h-28 min-h-[44px] flex-1 resize-none rounded-[1.35rem] border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold leading-5 text-slate-900 outline-none focus:border-teal-400"
          value={chatText}
          onChange={(event) => setChatText(event.target.value)}
          placeholder="Tulis pesan..."
          rows={1}
        />
        <button
          type="button"
          onClick={sendChat}
          disabled={chatSending || !clean(chatText)}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-teal-600 text-base font-black text-white shadow-lg shadow-teal-100 disabled:opacity-40"
          aria-label="Kirim pesan"
        >
          {chatSending ? (
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
          ) : (
            "➤"
          )}
        </button>
      </div>
    </section>
  );
}



function CoachOpeningLoadingScreen() {
  return (
    <main className="min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,#e6fffb_0%,transparent_36%),linear-gradient(180deg,#fbfefe_0%,#f3f9fb_52%,#f8fafc_100%)] text-slate-900">
      {/* WELLNESS_COACH_OPENING_LOADING_V114 */}
      <div className="mx-auto flex min-h-screen w-full max-w-xl items-center px-4 py-8 sm:px-6">
        <section className="relative w-full overflow-hidden rounded-[2rem] border border-white/80 bg-white/95 p-5 shadow-[0_26px_80px_rgba(15,23,42,0.12)] backdrop-blur-xl sm:p-7">
          <div
            className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full bg-cyan-100/70 blur-3xl"
            aria-hidden="true"
          />
          <div
            className="pointer-events-none absolute -bottom-20 -left-16 h-48 w-48 rounded-full bg-emerald-100/60 blur-3xl"
            aria-hidden="true"
          />

          <div className="relative">
            <div className="flex items-center gap-3">
              <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-700 to-cyan-600 text-white shadow-lg shadow-teal-100">
                <svg
                  viewBox="0 0 24 24"
                  className="h-7 w-7"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.9"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M4 7h16M4 12h16M4 17h10" />
                </svg>
                <span className="absolute -right-1 -top-1 h-3.5 w-3.5 animate-ping rounded-full bg-emerald-400 opacity-70" />
                <span className="absolute -right-1 -top-1 h-3.5 w-3.5 rounded-full border-2 border-white bg-emerald-500" />
              </div>

              <div className="min-w-0">
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-teal-700">
                  Wellness Coach
                </div>
                <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
                  Membuka Portal Coach
                </h1>
                <p className="mt-1 text-xs font-bold leading-5 text-slate-500 sm:text-sm">
                  Memeriksa sesi dan menyiapkan dashboard Anda.
                </p>
              </div>
            </div>

            <div className="mt-6 rounded-[1.55rem] border border-teal-100 bg-gradient-to-br from-teal-950 via-teal-900 to-cyan-800 p-5 text-white shadow-[0_18px_44px_rgba(13,148,136,0.18)]">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.16em] text-cyan-100/75">
                    Session Check
                  </div>
                  <div className="mt-1 text-lg font-black">
                    Menyiapkan ruang kerja Coach
                  </div>
                </div>

                <div className="relative flex h-14 w-14 shrink-0 items-center justify-center">
                  <div className="absolute inset-0 rounded-full border-4 border-white/15" />
                  <div className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-r-cyan-200 border-t-emerald-300" />
                  <svg
                    viewBox="0 0 24 24"
                    className="h-6 w-6"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.9"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M19 8v6M16 11h6" />
                  </svg>
                </div>
              </div>

              <div className="mt-5 h-2.5 overflow-hidden rounded-full bg-white/15">
                <div className="h-full w-3/4 animate-pulse rounded-full bg-gradient-to-r from-emerald-300 via-cyan-200 to-white" />
              </div>

              <div className="mt-3 flex items-center justify-between gap-3 text-[10px] font-bold text-white/70">
                <span>Mohon tunggu sebentar</span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-emerald-300 [animation-delay:-0.3s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-cyan-200 [animation-delay:-0.15s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white" />
                </span>
              </div>
            </div>

            <div className="mt-5 grid gap-3">
              {[
                {
                  title: "Memeriksa sesi Coach",
                  note: "Memastikan akses masih aktif dan aman.",
                  icon: "shield",
                },
                {
                  title: "Memuat assigned group",
                  note: "Menyiapkan peserta dan status monitoring.",
                  icon: "users",
                },
                {
                  title: "Menyusun dashboard",
                  note: "Menampilkan prioritas, chat, dan reminder terbaru.",
                  icon: "dashboard",
                },
              ].map((item, index) => (
                <div
                  key={item.title}
                  className="flex items-center gap-3 rounded-[1.25rem] border border-slate-100 bg-slate-50/80 px-3.5 py-3"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-teal-700 shadow-sm">
                    {item.icon === "shield" ? (
                      <svg
                        viewBox="0 0 24 24"
                        className="h-5 w-5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.9"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M12 3 5.5 6v5.2c0 4.1 2.7 7.9 6.5 9.1 3.8-1.2 6.5-5 6.5-9.1V6L12 3Z" />
                        <path d="m9.5 12 1.7 1.7 3.5-4" />
                      </svg>
                    ) : item.icon === "users" ? (
                      <svg
                        viewBox="0 0 24 24"
                        className="h-5 w-5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.9"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                      </svg>
                    ) : (
                      <svg
                        viewBox="0 0 24 24"
                        className="h-5 w-5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.9"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <rect x="3" y="3" width="7" height="7" rx="2" />
                        <rect x="14" y="3" width="7" height="7" rx="2" />
                        <rect x="3" y="14" width="7" height="7" rx="2" />
                        <rect x="14" y="14" width="7" height="7" rx="2" />
                      </svg>
                    )}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-black text-slate-800 sm:text-sm">
                      {item.title}
                    </div>
                    <div className="mt-0.5 text-[10px] font-bold leading-4 text-slate-400 sm:text-xs">
                      {item.note}
                    </div>
                  </div>

                  <div
                    className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-teal-500"
                    style={{ animationDelay: `${index * 180}ms` }}
                  />
                </div>
              ))}
            </div>

            <div className="mt-5 flex items-center justify-center gap-2 text-center text-[10px] font-bold text-slate-400 sm:text-xs">
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4 text-teal-600"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="9" />
                <path d="M12 8v4M12 16h.01" />
              </svg>
              Form login hanya ditampilkan apabila sesi Coach sudah tidak aktif.
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}


function LoginSection({ login, setLogin, submitLogin, loading }: any) {
  const legacy = login.use_legacy === true;

  return (
    <section className="mt-6 grid gap-6 lg:grid-cols-[1fr_380px]">
      <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-black">Login Coach</h2>

        <p className="mt-1 text-sm font-bold leading-6 text-slate-500">
          {legacy
            ? "Gunakan email dan access code lama."
            : "Gunakan email dan username Coach."}
        </p>

        <div className="mt-5 grid gap-4">
          <label className="grid gap-2 text-sm font-bold text-slate-700">
            Email Coach
            <input
              type="email"
              className={fieldClass}
              value={login.email}
              onChange={(event) =>
                setLogin((previous: any) => ({
                  ...previous,
                  email: event.target.value,
                }))
              }
              placeholder="coach@inharmony.co.id"
            />
          </label>

          {legacy ? (
            <label className="grid gap-2 text-sm font-bold text-slate-700">
              Access Code Lama
              <input
                className={fieldClass}
                value={login.access_code}
                onChange={(event) =>
                  setLogin((previous: any) => ({
                    ...previous,
                    access_code: event.target.value,
                  }))
                }
                placeholder="Access code akun lama"
              />
            </label>
          ) : (
            <label className="grid gap-2 text-sm font-bold text-slate-700">
              Username
              <input
                className={fieldClass}
                value={login.username}
                onChange={(event) =>
                  setLogin((previous: any) => ({
                    ...previous,
                    username: event.target.value.toLowerCase(),
                  }))
                }
                placeholder="username.coach"
                autoCapitalize="none"
              />
            </label>
          )}

          <button
            type="button"
            onClick={submitLogin}
            disabled={loading}
            className="rounded-2xl bg-teal-600 px-5 py-4 text-sm font-black text-white shadow-lg shadow-teal-100 disabled:opacity-50"
          >
            Masuk Portal Coach
          </button>

          <button
            type="button"
            onClick={() =>
              setLogin((previous: any) => ({
                ...previous,
                username: "",
                access_code: "",
                use_legacy: !legacy,
              }))
            }
            className="rounded-2xl bg-slate-100 px-4 py-3 text-xs font-black text-slate-600"
          >
            {legacy
              ? "Kembali ke login Username"
              : "Gunakan Access Code Lama"}
          </button>
        </div>
      </div>

      <aside className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-black">Akses Coach</h3>

        <div className="mt-4 space-y-3 text-sm font-bold leading-6 text-slate-500">
          <p>
            Coach hanya melihat peserta sesuai group assignment.
          </p>
          <p>
            Username dapat diubah sendiri melalui menu Profil Coach.
          </p>
          <p className="rounded-2xl bg-teal-50 p-4 text-teal-900">
            Login Access Code dipertahankan sementara hanya untuk akun lama
            yang belum mempunyai username.
          </p>
        </div>
      </aside>
    </section>
  );
}


function CoachProfileUsernamePanel({ coach, onSaved }: any) {
  const [username, setUsername] = useState(
    clean(coach?.username),
  );
  const [savingUsername, setSavingUsername] = useState(false);
  const [usernameMessage, setUsernameMessage] = useState("");

  useEffect(() => {
    setUsername(clean(coach?.username));
  }, [coach?.username]);

  async function saveUsername() {
    const normalized = clean(username).toLowerCase();

    if (!normalized) {
      setUsernameMessage("Username wajib diisi.");
      return;
    }

    setSavingUsername(true);
    setUsernameMessage("Menyimpan username...");

    const result = await fetch("/api/wellness/coach/me", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        username: normalized,
      }),
    })
      .then((response) => response.json())
      .catch((error) => ({
        ok: false,
        message: error?.message || "Network error",
      }));

    setSavingUsername(false);

    if (!result.ok) {
      setUsernameMessage(
        result.message || "Gagal memperbarui username.",
      );
      return;
    }

    setUsername(result.coach?.username || normalized);
    setUsernameMessage(
      result.message || "Username berhasil diperbarui.",
    );

    if (onSaved) await onSaved();
  }

  return (
    <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-lg font-black text-slate-950">
        Username Login Coach
      </div>

      <p className="mt-1 text-xs font-bold leading-5 text-slate-500">
        Coach hanya dapat mengubah username miliknya sendiri. Nama, email,
        status, dan assignment tetap dikelola Admin.
      </p>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <input
          value={username}
          onChange={(event) =>
            setUsername(event.target.value.toLowerCase())
          }
          className={`${fieldClass} min-w-0 flex-1`}
          placeholder="username.coach"
          autoCapitalize="none"
        />

        <button
          type="button"
          onClick={saveUsername}
          disabled={savingUsername}
          className="rounded-2xl bg-teal-600 px-5 py-3 text-sm font-black text-white disabled:opacity-50"
        >
          {savingUsername ? "Menyimpan..." : "Simpan Username"}
        </button>
      </div>

      {usernameMessage ? (
        <div className="mt-3 rounded-2xl bg-slate-50 px-4 py-3 text-xs font-bold text-slate-700">
          {usernameMessage}
        </div>
      ) : null}
    </section>
  );
}


function coachCompactStatus(
  label: "Nutrisi" | "Workout",
  missing: boolean,
  days: any,
) {
  if (!missing) return `${label} lengkap`;

  const age = formatDaysWithoutInput(days);

  if (age === "Belum pernah input") {
    return `${label} belum pernah input`;
  }

  if (age === "Data belum tersedia") {
    return `${label} belum tersedia`;
  }

  return `Belum ${label.toLowerCase()} ${age}`;
}


function CoachDashboardIcon({ name, className = "h-5 w-5" }: any) {
  const common = {
    className,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.9,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  if (name === "menu") {
    return (
      <svg {...common}>
        <path d="M4 7h16M4 12h16M4 17h16" />
      </svg>
    );
  }
  if (name === "bell") {
    return (
      <svg {...common}>
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
        <path d="M10 21h4" />
      </svg>
    );
  }
  if (name === "users") {
    return (
      <svg {...common}>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    );
  }
  if (name === "check") {
    return (
      <svg {...common}>
        <path d="m5 12 4 4L19 6" />
      </svg>
    );
  }
  if (name === "nutrition") {
    return (
      <svg {...common}>
        <path d="M7 3v8M4 3v4a3 3 0 0 0 6 0V3M7 11v10M17 3v18M17 3c3 2 3 7 0 9" />
      </svg>
    );
  }
  if (name === "workout") {
    return (
      <svg {...common}>
        <path d="M6 7v10M18 7v10M3 9v6M21 9v6M6 12h12" />
      </svg>
    );
  }
  if (name === "alert") {
    return (
      <svg {...common}>
        <path d="M12 9v4M12 17h.01" />
        <path d="M10.3 3.4 2.4 17a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.4a2 2 0 0 0-3.4 0Z" />
      </svg>
    );
  }
  if (name === "message") {
    return (
      <svg {...common}>
        <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z" />
      </svg>
    );
  }
  if (name === "clipboard") {
    return (
      <svg {...common}>
        <rect x="5" y="4" width="14" height="17" rx="2" />
        <path d="M9 4a3 3 0 0 1 6 0M9 10h6M9 14h6" />
      </svg>
    );
  }
  if (name === "trophy") {
    return (
      <svg {...common}>
        <path d="M8 21h8M12 17v4M7 4h10v4a5 5 0 0 1-10 0Z" />
        <path d="M7 6H4v2a4 4 0 0 0 4 4M17 6h3v2a4 4 0 0 1-4 4" />
      </svg>
    );
  }
  if (name === "support") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="9" />
        <path d="M8.5 9a3.5 3.5 0 0 1 7 0c0 2-3.5 2.5-3.5 5M12 18h.01" />
      </svg>
    );
  }
  if (name === "refresh") {
    return (
      <svg {...common}>
        <path d="M20 11a8 8 0 1 0 2 5M20 4v7h-7" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="9" />
    </svg>
  );
}


function CoachCompletionRing({ value }: any) {
  const safeValue = Math.max(0, Math.min(100, Number(value || 0)));
  return (
    <div
      className="relative flex h-[5.4rem] w-[5.4rem] shrink-0 items-center justify-center rounded-full sm:h-[6.7rem] sm:w-[6.7rem]"
      style={{
        background: `conic-gradient(#d1fae5 ${safeValue * 3.6}deg, rgba(255,255,255,0.18) 0deg)`,
      }}
    >
      <div className="flex h-[4.35rem] w-[4.35rem] flex-col items-center justify-center rounded-full bg-teal-900/85 text-center text-white sm:h-[5.35rem] sm:w-[5.35rem]">
        <div className="text-xl font-black leading-none sm:text-2xl">
          {safeValue}%
        </div>
        <div className="mt-1 text-[7px] font-black uppercase leading-3 tracking-wide text-white/70 sm:text-[8px]">
          Input selesai
        </div>
      </div>
    </div>
  );
}


function CoachHeroStat({ icon, label, value }: any) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/10 px-2.5 py-3 text-center backdrop-blur-sm sm:px-3">
      <div className="mx-auto flex h-7 w-7 items-center justify-center text-cyan-100">
        <CoachDashboardIcon name={icon} className="h-5 w-5" />
      </div>
      <div className="mt-1 text-lg font-black leading-none text-white sm:text-xl">
        {value}
      </div>
      <div className="mt-1 text-[7px] font-black uppercase leading-3 tracking-wide text-white/65 sm:text-[8px]">
        {label}
      </div>
    </div>
  );
}


function CoachProgressMetric({ label, value, tone }: any) {
  const safeValue = Math.max(0, Math.min(100, Number(value || 0)));
  const tones: Record<string, any> = {
    emerald: { ring: "#34d399", text: "text-emerald-700", icon: "check" },
    orange: { ring: "#fb923c", text: "text-orange-600", icon: "nutrition" },
    sky: { ring: "#38bdf8", text: "text-sky-700", icon: "workout" },
  };
  const selected = tones[tone] || tones.emerald;

  return (
    <div className="min-w-0 text-center">
      <div
        className="relative mx-auto flex h-[4.4rem] w-[4.4rem] items-center justify-center rounded-full sm:h-24 sm:w-24"
        style={{
          background: `conic-gradient(${selected.ring} ${safeValue * 3.6}deg, #eef2f7 0deg)`,
        }}
      >
        <div className="flex h-[3.45rem] w-[3.45rem] flex-col items-center justify-center rounded-full bg-white sm:h-[4.7rem] sm:w-[4.7rem]">
          <CoachDashboardIcon name={selected.icon} className={`h-4 w-4 ${selected.text}`} />
          <div className={`mt-0.5 text-base font-black leading-none sm:text-lg ${selected.text}`}>
            {safeValue}%
          </div>
        </div>
      </div>
      <div className="mt-2 truncate text-[10px] font-black text-slate-800 sm:text-xs">
        {label}
      </div>
      <div className="mt-0.5 text-[8px] font-bold text-slate-400 sm:text-[9px]">
        rata-rata penyelesaian
      </div>
    </div>
  );
}


function CoachQuickAction({ icon, label, tone, onClick }: any) {
  const tones: Record<string, string> = {
    emerald: "bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
    sky: "bg-sky-50 text-sky-700 hover:bg-sky-100",
    violet: "bg-violet-50 text-violet-700 hover:bg-violet-100",
    amber: "bg-amber-50 text-amber-700 hover:bg-amber-100",
    rose: "bg-rose-50 text-rose-700 hover:bg-rose-100",
    slate: "bg-slate-50 text-slate-700 hover:bg-slate-100",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-[5.4rem] flex-col items-center justify-center rounded-[1.15rem] px-3 py-3 text-center transition ${tones[tone] || tones.slate}`}
    >
      <CoachDashboardIcon name={icon} className="h-5 w-5" />
      <span className="mt-2 text-[9px] font-black leading-4 sm:text-[10px]">
        {label}
      </span>
    </button>
  );
}


function CoachPriorityParticipantRow({
  item,
  onDetail,
  onChat,
  onReminder,
}: any) {
  const meta = reminderMeta(item);
  const maxDelay = Math.max(meta.nutritionDays || 0, meta.workoutDays || 0);
  const priority =
    meta.neverInput || maxDelay >= 3
      ? { label: "Prioritas Tinggi", className: "bg-rose-50 text-rose-600" }
      : maxDelay >= 2 || (meta.nutritionMissing && meta.workoutMissing)
        ? { label: "Prioritas Sedang", className: "bg-orange-50 text-orange-600" }
        : { label: "Prioritas Rendah", className: "bg-emerald-50 text-emerald-600" };

  const primaryStatus = meta.nutritionMissing
    ? coachCompactStatus(
        "Nutrisi",
        true,
        item.compliance?.days_since_nutrition,
      )
    : meta.workoutMissing
      ? coachCompactStatus(
          "Workout",
          true,
          item.compliance?.days_since_workout,
        )
      : "Input hari ini lengkap";

  return (
    <article className="px-4 py-3.5 transition hover:bg-slate-50/70 sm:px-5">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onDetail}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left focus:outline-none focus:ring-2 focus:ring-teal-300"
        >
          <WellnessAvatar
            name={item.name}
            src={item.profile_photo_preview_url || item.profile_photo_url}
            size="sm"
          />

          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-black text-slate-950">
              {item.name}
            </div>
            <div className="mt-0.5 truncate text-[10px] font-bold text-slate-400">
              {item.group_name} · {primaryStatus}
            </div>
          </div>
        </button>

        <span className={`max-w-[5.6rem] rounded-xl px-2.5 py-2 text-center text-[8px] font-black leading-3 sm:max-w-none sm:text-[9px] ${priority.className}`}>
          {priority.label}
        </span>
      </div>

      <div className="ml-[52px] mt-2.5 flex gap-2">
        <button
          type="button"
          onClick={onChat}
          className="inline-flex min-h-8 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-[9px] font-black text-slate-700 transition hover:border-teal-200 hover:bg-teal-50 hover:text-teal-700"
        >
          <CoachDashboardIcon name="message" className="h-3.5 w-3.5" />
          Chat
        </button>

        {!meta.complete ? (
          <button
            type="button"
            onClick={onReminder}
            className="inline-flex min-h-8 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-[9px] font-black text-slate-700 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
          >
            <CoachDashboardIcon name="bell" className="h-3.5 w-3.5" />
            Ingatkan
          </button>
        ) : (
          <div className="inline-flex min-h-8 items-center justify-center gap-1.5 rounded-lg bg-emerald-50 px-3 text-[9px] font-black text-emerald-700">
            <CoachDashboardIcon name="check" className="h-3.5 w-3.5" />
            Lengkap
          </div>
        )}
      </div>
    </article>
  );
}

function CoachParticipantCompactRow({
  item,
  active,
  onClick,
}: any) {
  const meta = reminderMeta(item);

  const nutritionStatus = coachCompactStatus(
    "Nutrisi",
    meta.nutritionMissing,
    item.compliance?.days_since_nutrition,
  );

  const workoutStatus = coachCompactStatus(
    "Workout",
    meta.workoutMissing,
    item.compliance?.days_since_workout,
  );

  return (
    <button
      type="button"
      onClick={onClick}
      className={`grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3.5 text-left transition sm:px-5 ${
        active
          ? "bg-teal-50"
          : "bg-white hover:bg-slate-50"
      }`}
    >
      <WellnessAvatar
        name={item.name}
        src={
          item.profile_photo_preview_url ||
          item.profile_photo_url
        }
        size="sm"
      />

      <div className="min-w-0">
        <div className="break-words text-sm font-black leading-5 text-slate-950">
          {item.name}
        </div>

        <div className="mt-0.5 text-[10px] font-bold text-slate-400">
          {item.code} · {item.group_name}
        </div>

        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-bold sm:text-[11px]">
          <span
            className={
              meta.nutritionMissing
                ? "text-orange-600"
                : "text-emerald-600"
            }
          >
            {meta.nutritionMissing ? "🍴" : "✓"} {nutritionStatus}
          </span>

          <span
            className={
              meta.workoutMissing
                ? "text-sky-600"
                : "text-emerald-600"
            }
          >
            {meta.workoutMissing ? "🏋" : "✓"} {workoutStatus}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className="hidden rounded-full bg-slate-50 px-2.5 py-1 text-[9px] font-black text-slate-500 sm:inline-flex">
          {fmtNumber(
            item.compliance?.compliance_percent || 0,
          )}%
        </span>

        <span className="text-2xl font-black text-slate-300">
          ›
        </span>
      </div>
    </button>
  );
}


function ReminderSummaryCard({
  label,
  value,
  note,
  tone,
  active,
  onClick,
}: any) {
  const config: Record<string, any> = {
    emerald: {
      icon: "check",
      iconClass: "bg-emerald-50 text-emerald-700",
      valueClass: "text-emerald-700",
      ringClass: "ring-emerald-200",
    },
    orange: {
      icon: "nutrition",
      iconClass: "bg-orange-50 text-orange-600",
      valueClass: "text-orange-600",
      ringClass: "ring-orange-200",
    },
    sky: {
      icon: "workout",
      iconClass: "bg-sky-50 text-sky-700",
      valueClass: "text-sky-700",
      ringClass: "ring-sky-200",
    },
    rose: {
      icon: "alert",
      iconClass: "bg-rose-50 text-rose-600",
      valueClass: "text-rose-600",
      ringClass: "ring-rose-200",
    },
  };
  const selected = config[tone] || config.emerald;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`group min-h-[7.2rem] rounded-[1.15rem] border border-slate-200/80 bg-white p-3 text-center transition sm:min-h-[8rem] ${
        active
          ? `ring-4 ${selected.ringClass}`
          : "hover:-translate-y-0.5 hover:border-teal-200 hover:shadow-sm"
      }`}
    >
      <div className={`mx-auto flex h-10 w-10 items-center justify-center rounded-full ${selected.iconClass}`}>
        <CoachDashboardIcon name={selected.icon} className="h-5 w-5" />
      </div>
      <div className="mt-2 text-[9px] font-black leading-3 text-slate-600 sm:text-[10px]">
        {label}
      </div>
      <div className={`mt-1 text-2xl font-black leading-none ${selected.valueClass}`}>
        {value}
      </div>
      <div className="mt-1 text-[8px] font-bold text-slate-400 sm:text-[9px]">
        {note}
      </div>
    </button>
  );
}

function ReminderStatusBadge({ tone, label }: any) {
  const classes: Record<string, string> = {
    emerald: "bg-emerald-100 text-emerald-800",
    orange: "bg-orange-100 text-orange-800",
    sky: "bg-sky-100 text-sky-800",
    amber: "bg-amber-100 text-amber-800",
    rose: "bg-rose-100 text-rose-800",
  };
  return (
    <span
      className={`inline-flex max-w-[128px] shrink-0 items-center justify-center rounded-full px-2 py-1 text-center text-[9px] font-black leading-3 sm:max-w-[180px] sm:px-3 sm:py-2 sm:text-xs ${
        classes[tone] || "bg-slate-100 text-slate-700"
      }`}
    >
      {label}
    </span>
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
      <div className="text-xs font-black uppercase tracking-wide opacity-70">
        {label}
      </div>
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
        <span className="text-xl font-black md:text-2xl">
          {fmtNumber(count)}
        </span>
      </div>
      <div className="mt-2 truncate text-xs font-black md:text-sm">
        {item.label} Flag
      </div>
      <div className="mt-0.5 truncate text-[10px] font-bold opacity-70 md:text-xs">
        {item.note}
      </div>
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
          <div className="truncate text-base font-black text-slate-950">
            {item.name}
          </div>
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
          <span
            className={`rounded-full px-3 py-2 text-xs font-black ${flagClass[item.flag]}`}
          >
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
      const top = Math.max(0, Number(viewport?.pageTop ?? window.scrollY ?? 0));
      const height = Math.max(
        320,
        Number(viewport?.height ?? window.innerHeight ?? 0),
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
    document.body,
  );
}


function CoachNutritionHistoryItemV105({ item }: { item: any }) {
  const photo = clean(item?.photo_url);
  const calories = Number(item?.calories || item?.total_calories || 0);

  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
      <div className="flex items-center gap-3">
        {photo ? (
          <img
            src={photo}
            alt="Foto makanan"
            className="h-14 w-14 shrink-0 rounded-2xl object-cover"
            onError={(event) => {
              event.currentTarget.style.display = "none";
            }}
          />
        ) : (
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white text-[10px] font-black text-teal-700">
            FOOD
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="break-words text-sm font-black text-slate-950">
            {item?.food_name || item?.meal_text || "-"}
          </div>
          <div className="mt-1 text-[11px] font-bold text-slate-500">
            {clean(item?.log_date || item?.created_at).slice(0, 10) || "-"} · {item?.meal_time || item?.meal_type || "-"}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <span className="rounded-full bg-teal-50 px-3 py-1 text-[10px] font-black text-teal-700">
              {fmtNumber(calories)} kkal
            </span>
            <span className="rounded-full bg-white px-3 py-1 text-[10px] font-black text-slate-500">
              {item?.source === "google_sheet" ? "Google Sheet" : "Supabase"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// WELLNESS_COACH_PARTICIPANT_PROGRESS_BARS_V65
function coachClampProgress(value: number) {
  return Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));
}

function coachPercent(current: number, target: number) {
  if (!(target > 0)) return 0;
  return coachClampProgress((current / target) * 100);
}

function coachWeightProgress(
  current: number,
  baseline: number,
  target: number,
) {
  if (!(current > 0) || !(target > 0)) return 0;
  if (!(baseline > 0) || baseline === target)
    return Math.abs(current - target) <= 0.5 ? 100 : 0;
  const totalDistance = Math.abs(baseline - target);
  const remainingDistance = Math.abs(current - target);
  return coachClampProgress(
    ((totalDistance - remainingDistance) / totalDistance) * 100,
  );
}

function CoachProgressRowV65({
  label,
  value,
  percent,
  note,
  tone = "teal",
}: any) {
  const colors: Record<string, string> = {
    teal: "bg-teal-500",
    sky: "bg-sky-500",
    orange: "bg-orange-500",
    violet: "bg-violet-500",
    rose: "bg-rose-500",
  };
  const safePercent = coachClampProgress(Number(percent || 0));
  return (
    <div className="rounded-2xl border border-slate-100 bg-white px-4 py-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-black text-slate-900">{label}</div>
          {note ? (
            <div className="mt-1 text-xs font-bold text-slate-500">{note}</div>
          ) : null}
        </div>
        <div className="shrink-0 text-right">
          <div className="text-sm font-black text-slate-900">{value}</div>
          <div className="mt-1 text-[11px] font-black text-slate-400">
            {Math.round(safePercent)}%
          </div>
        </div>
      </div>
      <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full transition-all duration-700 ${colors[tone] || colors.teal}`}
          style={{ width: `${safePercent}%` }}
        />
      </div>
    </div>
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
  const nutritionLogs = Array.isArray(detail?.nutrition_logs)
    ? detail.nutrition_logs
    : [];
  const nutritionSources = detail?.nutrition_sources || null;
  const healthtalks = detail?.healthtalks || [];
  const pointRules = detail?.point_rules || {};
  const streak = detail?.streak || {};
  const setTarget = (key: string, value: string) =>
    setTargetForm((previous: any) => ({ ...previous, [key]: value }));
  const latestChartValue = (key: string) => {
    const rows = Array.isArray(charts?.[key]) ? charts[key] : [];
    return Number(rows.length ? rows[rows.length - 1]?.value || 0 : 0);
  };
  const firstChartValue = (key: string) => {
    const rows = Array.isArray(charts?.[key]) ? charts[key] : [];
    return Number(rows.length ? rows[0]?.value || 0 : 0);
  };
  const nutritionTarget = Number(
    targetForm?.nutrition_max_calories ||
      participant?.targets?.nutrition_max_calories ||
      0,
  );
  const workoutTarget = Number(
    targetForm?.workout_min_calories ||
      participant?.targets?.workout_min_calories ||
      0,
  );
  const weightTarget = Number(
    targetForm?.target_weight_kg || participant?.targets?.target_weight_kg || 0,
  );
  const nutritionLatest = latestChartValue("nutrition_calories");
  const workoutLatest = latestChartValue("workout_calories");
  const stepsLatest = latestChartValue("steps");
  const latestWeightValue = Number(
    summary.latest_weight_kg || latestChartValue("weight_kg") || 0,
  );
  const baselineWeightValue = firstChartValue("weight_kg") || latestWeightValue;
  const complianceRate = Number(
    participant?.compliance_rate || participant?.compliance_percentage || 0,
  );
  const stepTarget = Number(
    participant?.daily_step_target || participant?.step_target || 8000,
  );
  const momentumDays: WellnessMomentumDay[] = Array.isArray(streak?.days)
    ? streak.days.map((item: any) => ({
        date: clean(item?.date),
        label: clean(item?.label || item?.day_label || "-").slice(0, 3),
        nutritionCount: Number(item?.nutrition_count || 0),
        nutritionCalories: Number(item?.nutrition_calories || 0),
        workoutCalories: Number(item?.workout_calories || 0),
        steps: Number(item?.steps || 0),
        success: Boolean(item?.success),
      }))
    : [];
  const latestMomentum =
    momentumDays.length > 0 ? momentumDays[momentumDays.length - 1] : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 rounded-3xl bg-gradient-to-br from-teal-50 to-sky-50 p-4 md:flex-row md:items-center md:justify-between md:p-5">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.18em] text-teal-700">
            Detail dan Progress Peserta
          </div>
          <h2 className="mt-2 text-2xl font-black text-slate-950">
            {participant.name}
          </h2>
          <div className="mt-1 text-sm font-bold text-slate-500">
            Kode {participant.code} · {participant.group_name} ·{" "}
            {participant.flag_label}
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
          <div className="text-base font-black text-slate-900">
            Detail belum dimuat
          </div>
          <p className="mt-2 text-sm font-bold text-slate-500">
            Tekan Refresh Data untuk mengambil progress peserta.
          </p>
        </div>
      ) : (
        <>
          <section className="rounded-[1.9rem] border border-slate-100 bg-slate-50/70 p-4">
            <WellnessMomentumDashboard
              days={momentumDays}
              currentStreak={Number(streak?.current_streak || 0)}
              successDates={
                Array.isArray(streak?.success_dates) ? streak.success_dates : []
              }
              nutritionCount={Number(latestMomentum?.nutritionCount || 0)}
              nutritionCalories={Number(
                latestMomentum?.nutritionCalories || nutritionLatest || 0,
              )}
              workoutCalories={Number(
                latestMomentum?.workoutCalories || workoutLatest || 0,
              )}
              steps={Number(latestMomentum?.steps || stepsLatest || 0)}
              nutritionTarget={nutritionTarget}
              workoutTarget={workoutTarget}
              stepsTarget={stepTarget}
              currentWeight={latestWeightValue}
              baselineWeight={baselineWeightValue}
              targetWeight={weightTarget}
              bmi={summary.latest_bmi || null}
              systolic={summary.latest_systolic || null}
              diastolic={summary.latest_diastolic || null}
              totalPoints={Number(summary.total_points || 0)}
              healthTalkCount={Number(summary.healthtalk_count || 0)}
              mode="coach"
            />
          </section>

          <section className="rounded-3xl border border-slate-100 bg-slate-50 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <h3 className="text-lg font-black text-slate-950">
                  Breakdown Point
                </h3>
                <p className="mt-1 text-xs font-bold text-slate-500">
                  Ringkasan sumber point peserta dari data Wellness yang sudah
                  tersedia.
                </p>
              </div>
              <div className="grid grid-cols-4 gap-2 text-center">
                <PointPill label="Nutrisi" value={breakdown.nutrition || 0} />
                <PointPill label="Workout" value={breakdown.activity || 0} />
                <PointPill
                  label="Health Talk"
                  value={breakdown.healthtalk || 0}
                />
                <PointPill label="Lainnya" value={breakdown.other || 0} />
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-amber-100 bg-amber-50/60 p-4">
            <h3 className="text-base font-black text-slate-950">
              Aturan Point Wellness
            </h3>
            <p className="mt-1 text-xs font-bold leading-5 text-slate-500">
              Point dihitung otomatis dari setiap input dan pencapaian harian peserta.
            </p>
            <div className="mt-3 grid gap-2 text-xs font-bold text-slate-700">
              <div className="rounded-2xl bg-white px-3 py-3">
                <span className="font-black text-sky-700">Nutrisi:</span> setiap input makanan = 5 point; total kalori harian tidak melebihi batas coach = bonus 10 point.
              </div>
              <div className="rounded-2xl bg-white px-3 py-3">
                <span className="font-black text-teal-700">Workout:</span>{" "}
                {Number(pointRules.workout_target_calories || 0) > 0
                  ? `mencapai target ${fmtNumber(pointRules.workout_target_calories)} kkal = 10 point; ada aktivitas tetapi belum mencapai target = 5 point; tidak workout = 0 point.`
                  : "target belum ditetapkan; aktivitas yang tercatat = 5 point dan tidak workout = 0 point."}
              </div>
              <div className="rounded-2xl bg-white px-3 py-3">
                <span className="font-black text-violet-700">Health Talk:</span>{" "}
                offline dengan bukti = 20 point; online atau tanpa bukti = 10 point; tidak ikut = 0 point.
              </div>
            </div>
          </section>

          <section>
            <div>
              <h3 className="text-lg font-black text-slate-950">
                Grafik Progress Peserta
              </h3>
              <p className="mt-1 text-xs font-bold text-slate-500">
                Grafik diambil saat nama peserta dipilih, tanpa memuat seluruh
                anggota sekaligus.
              </p>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <CoachTrendChart
                title="Kalori Nutrisi"
                points={charts.nutrition_calories || []}
                suffix="kkal"
              />
              <CoachTrendChart
                title="Kalori Workout"
                points={charts.workout_calories || []}
                suffix="kkal"
              />
              <CoachTrendChart title="Steps" points={charts.steps || []} />
              <CoachTrendChart
                title="Berat Badan"
                points={charts.weight_kg || []}
                suffix="kg"
              />
              <CoachTrendChart title="BMI" points={charts.bmi || []} />
              <CoachTrendChart
                title="Lingkar Pinggang"
                points={charts.waist_cm || []}
                suffix="cm"
              />
              <CoachTrendChart
                title="HbA1c"
                points={charts.hba1c || []}
                suffix="%"
              />
              <CoachTrendChart
                title="Gula Darah"
                points={charts.glucose || []}
                suffix="mg/dL"
              />
              <CoachTrendChart
                title="Tekanan Darah"
                points={charts.blood_pressure || []}
                suffix="mmHg"
                secondaryLabel="Diastolik"
              />
              <CoachTrendChart
                title="Point Harian"
                points={charts.points || []}
                suffix="pt"
              />
            </div>
          </section>


          <section className="rounded-3xl border border-slate-100 bg-white p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h3 className="text-lg font-black text-slate-950">
                  History Nutrisi
                </h3>
                <p className="mt-1 text-xs font-bold text-slate-500">
                  Flow yang sama dengan Portal Peserta: Supabase dan Google Sheet digabung, dinormalisasi, lalu dideduplikasi.
                </p>
              </div>
              <div className="rounded-full bg-teal-50 px-3 py-2 text-[10px] font-black text-teal-700">
                {fmtNumber(nutritionLogs.length)} log
              </div>
            </div>
            {nutritionSources ? (
              <div className="mt-3 rounded-2xl bg-slate-50 px-3 py-2 text-[10px] font-bold text-slate-500">
                Supabase {fmtNumber(nutritionSources.supabase_rows || 0)} row · Google Sheet {fmtNumber(nutritionSources.google_sheet_rows || 0)} row
              </div>
            ) : null}
            <div className="mt-4 max-h-[34rem] space-y-3 overflow-y-auto pr-1">
              {nutritionLogs.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm font-bold text-slate-400">
                  Belum ada history nutrisi yang terbaca.
                </div>
              ) : (
                nutritionLogs.map((item: any, index: number) => (
                  <CoachNutritionHistoryItemV105
                    key={`${item?.id || index}-${index}`}
                    item={item}
                  />
                ))
              )}
            </div>
          </section>

          <section className="rounded-3xl border border-slate-100 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-black text-slate-950">
                  Keikutsertaan Health Talk
                </h3>
                <p className="mt-1 text-xs font-bold text-slate-500">
                  Total {fmtNumber(summary.healthtalk_count || 0)} kegiatan yang
                  tercatat.
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
                      <td
                        colSpan={3}
                        className="px-4 py-8 text-center font-bold text-slate-400"
                      >
                        Belum ada keikutsertaan Health Talk yang tercatat.
                      </td>
                    </tr>
                  ) : (
                    healthtalks.slice(0, 12).map((item: any, index: number) => (
                      <tr key={item.id || `${item.date}-${index}`}>
                        <td className="px-3 py-3 align-top font-bold text-slate-500">
                          {item.date || "-"}
                        </td>
                        <td className="px-3 py-3 align-top">
                          <div className="break-words font-black text-slate-900">
                            {item.title || "Health Talk"}
                          </div>
                          <div className="mt-1 text-[10px] font-bold text-slate-500 sm:text-xs">
                            {item.type || "-"}
                          </div>
                        </td>
                        <td className="px-2 py-3 text-right align-top font-black text-violet-700">
                          {fmtNumber(item.points || 0)}
                        </td>
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
              <input
                type="number"
                min="0"
                className={fieldClass}
                value={targetForm.nutrition_max_calories}
                onChange={(e) =>
                  setTarget("nutrition_max_calories", e.target.value)
                }
                placeholder="Contoh: 1700"
              />
            </label>
            <label className="grid gap-2 text-sm font-bold text-slate-700">
              Target Kalori Terbakar dari Workout (kkal/hari)
              <input
                type="number"
                min="0"
                className={fieldClass}
                value={targetForm.workout_min_calories}
                onChange={(e) =>
                  setTarget("workout_min_calories", e.target.value)
                }
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
                className={`${fieldClass} min-h-[72px]`}
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
                className={`mt-3 inline-flex rounded-full px-3 py-2 text-xs font-black ${latestNote.is_read ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}
              >
                {formatReadAt(latestNote.read_at)}
              </div>
            </div>
          ) : (
            <div className="mt-4 text-sm font-bold text-slate-400">
              Belum ada instruksi.
            </div>
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
    <span
      className={`inline-flex max-w-full items-center justify-center whitespace-normal rounded-full px-2 py-1 text-center text-[9px] font-black leading-3 sm:px-3 sm:py-2 sm:text-xs ${classes[level] || "bg-slate-100 text-slate-700"}`}
    >
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
      <div className="text-[10px] font-black uppercase tracking-wide opacity-60">
        {label}
      </div>
      <div className="mt-1 text-lg font-black">{value}</div>
    </div>
  );
}

function PointPill({ label, value }: any) {
  return (
    <div className="rounded-2xl bg-white px-3 py-2 shadow-sm">
      <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className="mt-1 text-sm font-black text-slate-900">
        {fmtNumber(value)}
      </div>
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
  height: number,
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

function CoachTrendChart({
  title,
  points,
  suffix = "",
  secondaryLabel = "",
}: any) {
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
    ((chartMax - Number(value || 0)) / range) * (height - padTop - padBottom);
  const plotted = rows.map((item: any, index: number) => ({
    row: item,
    x: x(index),
    y: y(item.value),
    secondaryY: Number.isFinite(Number(item.secondary))
      ? y(item.secondary)
      : null,
  }));
  const primary = smoothCoachChartPath(
    plotted.map((item) => ({ x: item.x, y: item.y })),
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
                  {secondaryLabel || "Nilai 2"}:{" "}
                  {fmtNumber(activePoint.row.secondary, 1)} {suffix}
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
      <div className="text-xs font-black uppercase tracking-wide text-slate-400">
        {label}
      </div>
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
    (item: any) =>
      String(item.wellness_group_unit_id || item.group_name) === groupKey,
  );
  const setValue = (key: string, value: string) =>
    setForm((previous: any) => ({ ...previous, [key]: value }));

  useEffect(() => {
    const updateViewportFrame = () => {
      const viewport = window.visualViewport;
      const top = Math.max(0, Number(viewport?.pageTop ?? window.scrollY ?? 0));
      const height = Math.max(
        420,
        Number(viewport?.height ?? window.innerHeight ?? 0),
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
              {scope === "group"
                ? "Instruksi Kelompok"
                : "Instruksi Individual"}
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
                    value={String(
                      item.wellness_group_unit_id || item.group_name,
                    )}
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
              <div className="text-sm font-black text-sky-950">
                Target / Action Plan (Opsional)
              </div>
              <p className="mt-1 text-xs font-bold leading-5 text-sky-800/70">
                Isi hanya target yang ingin ditetapkan atau diubah. Pada
                instruksi kelompok, nilai yang diisi akan disimpan sebagai
                target aktual seluruh anggota kelompok; kolom kosong tidak
                menghapus target lama.
              </p>
              <div className="mt-4 grid gap-3">
                <label className="grid gap-2 text-sm font-bold text-slate-700">
                  Target Kalori Terbakar dari Workout (kkal/hari)
                  <input
                    type="number"
                    min="0"
                    className={fieldClass}
                    value={form.action_workout_calories}
                    onChange={(event) =>
                      setValue("action_workout_calories", event.target.value)
                    }
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
                    onChange={(event) =>
                      setValue("action_nutrition_calories", event.target.value)
                    }
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
                    onChange={(event) =>
                      setValue("action_target_weight", event.target.value)
                    }
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
                  onChange={(event) =>
                    setValue("follow_up_status", event.target.value)
                  }
                >
                  <option value="Open">Open</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Done">Done</option>
                  <option value="Need Medical Review">
                    Need Medical Review
                  </option>
                </select>
              </label>
              <label className="grid gap-2 text-sm font-bold text-slate-700">
                Follow Up Berikutnya
                <input
                  type="date"
                  className={fieldClass}
                  value={form.next_follow_up_date}
                  onChange={(event) =>
                    setValue("next_follow_up_date", event.target.value)
                  }
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
                  ? "Simpan Target & Kirim ke Seluruh Anggota"
                  : "Simpan Target & Kirim ke Peserta"}
            </button>
          </div>
        </div>
      </section>
    </div>,
    document.body,
  );
}
