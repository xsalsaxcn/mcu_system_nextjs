"use client";

import { useEffect, useMemo, useState } from "react";

// WELLNESS_COACH_PORTAL_MVP_V1

type CoachDashboard = {
  ok: boolean;
  message?: string;
  coach?: any;
  groups?: any[];
  summary?: any;
  participants?: any[];
  notes?: any[];
  today?: string;
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

const fieldClass =
  "rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-teal-400 focus:ring-4 focus:ring-teal-100";

export default function WellnessCoachPortalPage() {
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("Masuk menggunakan akun coach.");
  const [login, setLogin] = useState({
    email: "",
    access_code: "",
  });

  const [dashboard, setDashboard] = useState<CoachDashboard | null>(null);
  const [selectedGroup, setSelectedGroup] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedParticipant, setSelectedParticipant] = useState<any>(null);
  const [savingNote, setSavingNote] = useState(false);

  const [noteForm, setNoteForm] = useState({
    session_date: todayDate(),
    topic: "Weekly coaching",
    main_issue: "",
    coach_note: "",
    action_plan: "",
    follow_up_status: "Open",
    next_follow_up_date: "",
  });

  async function loadDashboard() {
    setLoading(true);

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
      setMessage("Portal Coach aktif.");
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
      .catch((error) => ({
        ok: false,
        message: error?.message || "Network error",
      }));

    if (result.ok) {
      setMessage("Login berhasil. Memuat dashboard...");
      await loadDashboard();
    } else {
      setMessage(result.message || "Login gagal.");
    }

    setLoading(false);
  }

  async function logout() {
    await fetch("/api/wellness/coach/me", {
      method: "DELETE",
    }).catch(() => null);

    setDashboard(null);
    setSelectedParticipant(null);
    setMessage("Coach logout berhasil.");
  }

  async function saveNote() {
    if (!selectedParticipant) {
      setMessage("Pilih peserta terlebih dahulu.");
      return;
    }

    setSavingNote(true);
    setMessage("Menyimpan catatan coach...");

    const result = await fetch("/api/wellness/coach/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        participant_id: selectedParticipant.id,
        wellness_group_unit_id:
          selectedParticipant.raw?.wellness_group_unit_id ||
          selectedParticipant.raw?.group_unit_id ||
          null,
        group_name: selectedParticipant.group_name,
        ...noteForm,
      }),
    })
      .then((response) => response.json())
      .catch((error) => ({
        ok: false,
        message: error?.message || "Network error",
      }));

    if (result.ok) {
      setMessage(result.message || "Catatan coach berhasil disimpan.");
      setNoteForm((previous) => ({
        ...previous,
        main_issue: "",
        coach_note: "",
        action_plan: "",
        next_follow_up_date: "",
      }));
      await loadDashboard();
    } else {
      setMessage(result.message || "Gagal menyimpan catatan coach.");
    }

    setSavingNote(false);
  }

  useEffect(() => {
    loadDashboard();
  }, []);

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

      const haystack = [
        item.name,
        item.code,
        item.group_name,
        item.risk,
        item.status,
      ]
        .map((x) => clean(x).toLowerCase())
        .join(" ");

      const bySearch = !q || haystack.includes(q);

      return byGroup && bySearch;
    });
  }, [participants, selectedGroup, search]);

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

              <h1 className="mt-2 text-3xl font-black md:text-4xl">
                Portal Coach
              </h1>

              <p className="mt-2 max-w-3xl text-sm font-bold leading-6 text-white/90">
                Coach hanya dapat melihat peserta dari kelompok yang sudah di-assign oleh admin.
              </p>
            </div>

            {isLoggedIn ? (
              <button
                type="button"
                onClick={logout}
                className="rounded-full bg-white/20 px-5 py-3 text-xs font-black text-white backdrop-blur"
              >
                Logout
              </button>
            ) : null}
          </div>
        </section>

        <section className="mt-5 rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
          <div
            className={`rounded-2xl px-4 py-3 text-sm font-bold leading-6 ${
              message.toLowerCase().includes("gagal") ||
              message.toLowerCase().includes("wajib") ||
              message.toLowerCase().includes("belum")
                ? "bg-amber-50 text-amber-900"
                : "bg-sky-50 text-sky-800"
            }`}
          >
            {loading ? "Memuat Portal Coach..." : message}
          </div>
        </section>

        {!isLoggedIn ? (
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
                    onChange={(e) =>
                      setLogin((previous) => ({
                        ...previous,
                        email: e.target.value,
                      }))
                    }
                    placeholder="coach@inharmony.co.id"
                  />
                </label>

                <label className="grid gap-2 text-sm font-bold text-slate-700">
                  Access Code
                  <input
                    className={fieldClass}
                    value={login.access_code}
                    onChange={(e) =>
                      setLogin((previous) => ({
                        ...previous,
                        access_code: e.target.value,
                      }))
                    }
                    placeholder="Contoh: INA2026"
                  />
                </label>

                <button
                  type="button"
                  onClick={submitLogin}
                  className="rounded-2xl bg-teal-600 px-5 py-4 text-sm font-black text-white shadow-lg shadow-teal-100"
                >
                  Masuk Portal Coach
                </button>
              </div>
            </div>

            <aside className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-lg font-black">Akses Coach</h3>

              <div className="mt-4 space-y-3 text-sm font-bold leading-6 text-slate-500">
                <p>Coach hanya melihat peserta sesuai group assignment.</p>
                <p>Data peserta lain tidak ditampilkan di dashboard coach.</p>
                <p className="rounded-2xl bg-teal-50 p-4 text-teal-900">
                  MVP ini fokus pada monitoring group, detail peserta, dan catatan coaching.
                </p>
              </div>
            </aside>
          </section>
        ) : (
          <section className="mt-6 space-y-6">
            <div className="grid gap-4 md:grid-cols-4">
              <SummaryCard
                label="Total Peserta"
                value={fmtNumber(dashboard?.summary?.total_participants || 0)}
                note="peserta dalam group coach"
                tone="teal"
              />

              <SummaryCard
                label="Aktif Hari Ini"
                value={fmtNumber(dashboard?.summary?.active_today || 0)}
                note="memiliki steps hari ini"
                tone="sky"
              />

              <SummaryCard
                label="Perlu Follow Up"
                value={fmtNumber(dashboard?.summary?.need_follow_up || 0)}
                note="belum aktif / perlu dipantau"
                tone="amber"
              />

              <SummaryCard
                label="Medical Review"
                value={fmtNumber(dashboard?.summary?.need_medical_review || 0)}
                note="ditandai perlu review medis"
                tone="rose"
              />
            </div>

            <div className="grid gap-5 lg:grid-cols-[1fr_420px]">
              <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
                <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                  <div>
                    <h2 className="text-xl font-black">Monitoring Peserta</h2>
                    <p className="mt-1 text-sm font-bold text-slate-500">
                      Coach: {dashboard?.coach?.name || "-"}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={loadDashboard}
                    className="rounded-full bg-slate-100 px-4 py-2 text-xs font-black text-slate-700"
                  >
                    Refresh
                  </button>
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
                        value={
                          group.wellness_group_unit_id
                            ? String(group.wellness_group_unit_id)
                            : group.group_name
                        }
                      >
                        {group.group_name}
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

                <div className="mt-5 grid gap-3">
                  {filteredParticipants.length === 0 ? (
                    <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm font-bold text-slate-400">
                      Belum ada peserta dalam assignment coach ini.
                    </div>
                  ) : (
                    filteredParticipants.map((item: any) => (
                      <ParticipantCard
                        key={item.id}
                        item={item}
                        active={selectedParticipant?.id === item.id}
                        onClick={() => setSelectedParticipant(item)}
                      />
                    ))
                  )}
                </div>
              </section>

              <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
                {!selectedParticipant ? (
                  <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
                    <h3 className="text-lg font-black text-slate-900">
                      Pilih Peserta
                    </h3>
                    <p className="mt-2 text-sm font-bold leading-6 text-slate-500">
                      Klik salah satu peserta untuk melihat detail dan membuat catatan coaching.
                    </p>
                  </div>
                ) : (
                  <ParticipantDetail
                    participant={selectedParticipant}
                    noteForm={noteForm}
                    setNoteForm={setNoteForm}
                    saveNote={saveNote}
                    savingNote={savingNote}
                  />
                )}
              </section>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

function SummaryCard({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note: string;
  tone: "teal" | "sky" | "amber" | "rose";
}) {
  const toneClass: Record<string, string> = {
    teal: "border-teal-100 bg-teal-50 text-teal-800",
    sky: "border-sky-100 bg-sky-50 text-sky-800",
    amber: "border-amber-100 bg-amber-50 text-amber-900",
    rose: "border-rose-100 bg-rose-50 text-rose-800",
  };

  return (
    <div className={`rounded-3xl border p-5 shadow-sm ${toneClass[tone]}`}>
      <div className="text-xs font-black uppercase tracking-wide opacity-70">
        {label}
      </div>
      <div className="mt-2 text-2xl font-black">{value}</div>
      <div className="mt-1 text-xs font-bold opacity-70">{note}</div>
    </div>
  );
}

function ParticipantCard({
  item,
  active,
  onClick,
}: {
  item: any;
  active: boolean;
  onClick: () => void;
}) {
  const statusClass =
    item.status === "Active today"
      ? "bg-teal-50 text-teal-700"
      : item.status === "Need Medical Review"
        ? "bg-rose-50 text-rose-700"
        : "bg-amber-50 text-amber-700";

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
        <div>
          <div className="text-base font-black text-slate-950">
            {item.name}
          </div>
          <div className="mt-1 text-xs font-bold text-slate-500">
            Kode {item.code} - {item.group_name}
          </div>
          <div className="mt-2 text-xs font-black text-slate-400">
            Risk: {item.risk || "-"}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-white px-3 py-2 text-xs font-black text-slate-700">
            Steps {fmtNumber(item.today?.steps || 0)}
          </span>
          <span className="rounded-full bg-white px-3 py-2 text-xs font-black text-slate-700">
            {fmtNumber(item.today?.calories || 0)} kkal
          </span>
          <span className={`rounded-full px-3 py-2 text-xs font-black ${statusClass}`}>
            {item.status}
          </span>
        </div>
      </div>
    </button>
  );
}

function ParticipantDetail({
  participant,
  noteForm,
  setNoteForm,
  saveNote,
  savingNote,
}: {
  participant: any;
  noteForm: any;
  setNoteForm: (value: any) => void;
  saveNote: () => void;
  savingNote: boolean;
}) {
  const clinical = participant.clinical || {};
  const latestNote = participant.latest_note || null;

  function setValue(key: string, value: string) {
    setNoteForm((previous: any) => ({
      ...previous,
      [key]: value,
    }));
  }

  return (
    <div>
      <div className="rounded-3xl bg-gradient-to-br from-teal-50 to-sky-50 p-5">
        <div className="text-xs font-black uppercase tracking-[0.18em] text-teal-700">
          Detail Peserta
        </div>

        <h2 className="mt-2 text-2xl font-black text-slate-950">
          {participant.name}
        </h2>

        <div className="mt-2 text-sm font-bold leading-6 text-slate-500">
          Kode {participant.code} - {participant.group_name}
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <MiniInfo label="Steps Hari Ini" value={fmtNumber(participant.today?.steps || 0)} />
          <MiniInfo label="Workout Calories" value={`${fmtNumber(participant.today?.calories || 0)} kkal`} />
          <MiniInfo label="BMI" value={clinical?.bmi ? fmtNumber(clinical.bmi, 1) : "-"} />
          <MiniInfo
            label="Tensi"
            value={
              clinical?.systolic
                ? `${clinical.systolic}/${clinical.diastolic || "-"}`
                : "-"
            }
          />
        </div>
      </div>

      {latestNote ? (
        <div className="mt-5 rounded-3xl border border-slate-100 bg-slate-50 p-4">
          <div className="text-sm font-black text-slate-900">
            Catatan Terakhir
          </div>
          <div className="mt-2 text-xs font-bold leading-5 text-slate-500">
            {latestNote.coach_note || "-"}
          </div>
          <div className="mt-3 rounded-full bg-white px-3 py-2 text-xs font-black text-slate-600">
            Status: {latestNote.follow_up_status || "Open"}
          </div>
        </div>
      ) : null}

      <div className="mt-5 rounded-3xl border border-slate-100 bg-white p-4">
        <h3 className="text-lg font-black">Catatan Coaching</h3>

        <div className="mt-4 grid gap-3">
          <label className="grid gap-2 text-sm font-bold text-slate-700">
            Tanggal
            <input
              type="date"
              className={fieldClass}
              value={noteForm.session_date}
              onChange={(e) => setValue("session_date", e.target.value)}
            />
          </label>

          <label className="grid gap-2 text-sm font-bold text-slate-700">
            Topik
            <input
              className={fieldClass}
              value={noteForm.topic}
              onChange={(e) => setValue("topic", e.target.value)}
              placeholder="Contoh: Weekly coaching"
            />
          </label>

          <label className="grid gap-2 text-sm font-bold text-slate-700">
            Masalah Utama
            <textarea
              className={`${fieldClass} min-h-[80px]`}
              value={noteForm.main_issue}
              onChange={(e) => setValue("main_issue", e.target.value)}
              placeholder="Contoh: belum rutin jalan kaki, pola makan masih tinggi gula"
            />
          </label>

          <label className="grid gap-2 text-sm font-bold text-slate-700">
            Catatan Coach
            <textarea
              className={`${fieldClass} min-h-[100px]`}
              value={noteForm.coach_note}
              onChange={(e) => setValue("coach_note", e.target.value)}
              placeholder="Catatan hasil coaching"
            />
          </label>

          <label className="grid gap-2 text-sm font-bold text-slate-700">
            Action Plan
            <textarea
              className={`${fieldClass} min-h-[100px]`}
              value={noteForm.action_plan}
              onChange={(e) => setValue("action_plan", e.target.value)}
              placeholder="Target minggu ini"
            />
          </label>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-2 text-sm font-bold text-slate-700">
              Status Follow Up
              <select
                className={fieldClass}
                value={noteForm.follow_up_status}
                onChange={(e) => setValue("follow_up_status", e.target.value)}
              >
                <option value="Open">Open</option>
                <option value="In Progress">In Progress</option>
                <option value="Done">Done</option>
                <option value="Need Medical Review">Need Medical Review</option>
              </select>
            </label>

            <label className="grid gap-2 text-sm font-bold text-slate-700">
              Next Follow Up
              <input
                type="date"
                className={fieldClass}
                value={noteForm.next_follow_up_date}
                onChange={(e) => setValue("next_follow_up_date", e.target.value)}
              />
            </label>
          </div>

          <button
            type="button"
            onClick={saveNote}
            disabled={savingNote}
            className="rounded-2xl bg-teal-600 px-5 py-4 text-sm font-black text-white shadow-lg shadow-teal-100 disabled:opacity-50"
          >
            {savingNote ? "Menyimpan..." : "Simpan Catatan Coach"}
          </button>
        </div>
      </div>
    </div>
  );
}

function MiniInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white p-4">
      <div className="text-xs font-black uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className="mt-1 text-sm font-black text-slate-900">
        {value}
      </div>
    </div>
  );
}
