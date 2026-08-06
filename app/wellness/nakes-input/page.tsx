"use client";

import Image from "next/image";

import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import NakesAuthGate from "@/components/wellness/NakesAuthGate";

// WELLNESS_NAKES_GENERAL_CHECKUP_INPUT_V372_PAGE
// WELLNESS_NAKES_NON_DESTRUCTIVE_SYNC_V126M32_PAGE
// WELLNESS_NAKES_AGE_CAPTURE_V126M42_PAGE
// WELLNESS_NAKES_GUIDED_WORKFLOW_V126M45_PAGE
// WELLNESS_NAKES_POPOUT_EXAM_WORKFLOW_V126M45_2_PAGE
// Wellness-only page for NAKES/company medical team to input any clinical checkpoint.
// Visit labels are generalized: baseline, periodic, final evaluation, follow-up, or custom.
// Data is stored in wellness_checkup_history and feeds dashboard before-after charts.

type VisitType =
  | "baseline_checkup"
  | "periodic_checkup"
  | "final_evaluation"
  | "clinical_follow_up"
  | "custom_checkup";

type ExamMode = "" | "routine" | "mini_mcu" | "notes";
type ParticipantSort = "name_asc" | "code_asc" | "risk_asc";

const PARTICIPANTS_PER_PAGE = 8;

const EXAM_MODE_OPTIONS: Array<{
  value: Exclude<ExamMode, "">;
  label: string;
  helper: string;
  icon: string;
}> = [
  {
    value: "routine",
    label: "Pemeriksaan Rutin",
    helper: "Usia, BB, TB, lingkar perut, tekanan darah, dan nadi.",
    icon: "🩺",
  },
  {
    value: "mini_mcu",
    label: "Mini MCU",
    helper: "HbA1c, gula darah, kolesterol, lipid, asam urat, SGOT, dan SGPT.",
    icon: "🧪",
  },
  {
    value: "notes",
    label: "Tambah Catatan",
    helper: "Kesimpulan risiko, intervensi, monitoring, follow-up, dan alert klinis.",
    icon: "📝",
  },
];

const VISIT_OPTIONS: Array<{
  value: VisitType;
  label: string;
  helper: string;
  defaultLabel: string;
}> = [
  {
    value: "baseline_checkup",
    label: "Pemeriksaan Awal",
    helper: "Baseline atau titik awal program",
    defaultLabel: "Pemeriksaan Awal",
  },
  {
    value: "periodic_checkup",
    label: "Pemeriksaan Berkala",
    helper: "Mingguan/bulanan/sesuai jadwal program",
    defaultLabel: "Pemeriksaan Berkala",
  },
  {
    value: "final_evaluation",
    label: "Evaluasi Akhir",
    helper: "Closing atau pengukuran akhir program",
    defaultLabel: "Evaluasi Akhir",
  },
  {
    value: "clinical_follow_up",
    label: "Follow-up Klinis",
    helper: "Tindak lanjut khusus oleh NAKES",
    defaultLabel: "Follow-up Klinis",
  },
  {
    value: "custom_checkup",
    label: "Custom",
    helper: "Label bebas sesuai kebutuhan lapangan",
    defaultLabel: "Pemeriksaan Custom",
  },
];

function clean(value: any) {
  return String(value ?? "").trim();
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function inputClass(extra = "") {
  return `w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-800 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100 ${extra}`;
}

function participantName(participant: any) {
  return (
    clean(participant?.participant_display_name) ||
    clean(participant?.participant_name) ||
    clean(participant?.name) ||
    `Peserta #${participant?.id || "-"}`
  );
}

function participantLabel(participant: any) {
  const code = clean(participant?.code);
  const name = participantName(participant);
  const participantId = clean(participant?.id);
  const risk = clean(participant?.risk_cluster || participant?.baseline_risk_group);
  const scope = clean(participant?.scope_text);

  return [
    `${code ? `${code} - ` : ""}${name}`,
    participantId ? `ID ${participantId}` : "",
    risk,
    scope,
  ]
    .filter(Boolean)
    .join(" | ");
}

function matchesSearch(participant: any, query: string) {
  const q = clean(query).toLowerCase();
  if (!q) return true;

  const haystack = [
    participant?.code,
    participant?.name,
    participant?.participant_display_name,
    participant?.risk_cluster,
    participant?.baseline_risk_group,
    participant?.company_name,
    participant?.kelompok_name,
    participant?.group_unit_name,
    participant?.scope_text,
  ]
    .map(clean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(q);
}

function uniqueOptions(items: any[], key: string) {
  const map = new Map<string, string>();

  for (const item of items || []) {
    const value = clean(item?.[key]);
    if (value && value !== "-") map.set(value, value);
  }

  return Array.from(map.values()).sort((a, b) => a.localeCompare(b));
}

function participantRisk(participant: any) {
  return clean(participant?.risk_cluster || participant?.baseline_risk_group || "Belum diklasifikasikan");
}

function participantGroupLabel(participant: any) {
  const kelompok = clean(participant?.kelompok_name) || "Tanpa Kelompok";
  const group = clean(participant?.group_unit_name) || "Tanpa Group";
  return `${kelompok} • ${group}`;
}

function compareParticipants(a: any, b: any, sort: ParticipantSort) {
  if (sort === "code_asc") {
    const aCode = clean(a?.code);
    const bCode = clean(b?.code);
    const numericDifference = Number(aCode || 0) - Number(bCode || 0);
    if (Number.isFinite(numericDifference) && numericDifference !== 0) return numericDifference;
    return aCode.localeCompare(bCode, "id", { numeric: true });
  }

  if (sort === "risk_asc") {
    const riskDifference = participantRisk(a).localeCompare(participantRisk(b), "id");
    if (riskDifference !== 0) return riskDifference;
  }

  return participantName(a).localeCompare(participantName(b), "id");
}

function setNumberish(value: any) {
  const text = clean(value);
  if (!text) return "";
  return text.replace(",", ".");
}

function participantAge(participant: any) {
  const direct = Number(
    participant?.age_years || participant?.age || participant?.usia || 0
  );
  if (Number.isFinite(direct) && direct >= 18 && direct <= 119) {
    return String(Math.round(direct));
  }

  const birthDate = clean(
    participant?.birth_date ||
      participant?.date_of_birth ||
      participant?.birthdate ||
      participant?.dob ||
      participant?.tanggal_lahir
  );
  if (!birthDate) return "";

  const parsed = new Date(birthDate);
  if (Number.isNaN(parsed.getTime())) return "";

  const now = new Date();
  let age = now.getFullYear() - parsed.getFullYear();
  const monthDelta = now.getMonth() - parsed.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < parsed.getDate())) {
    age -= 1;
  }

  return age >= 18 && age <= 119 ? String(age) : "";
}

function InfoPill({
  label,
  value,
  tone = "slate",
}: {
  label: string;
  value: any;
  tone?: "slate" | "blue" | "emerald" | "amber" | "rose" | "purple";
}) {
  const toneClass = {
    slate: "border-slate-200 bg-slate-50 text-slate-700",
    blue: "border-blue-100 bg-blue-50 text-blue-700",
    emerald: "border-emerald-100 bg-emerald-50 text-emerald-700",
    amber: "border-amber-100 bg-amber-50 text-amber-800",
    rose: "border-rose-100 bg-rose-50 text-rose-700",
    purple: "border-purple-100 bg-purple-50 text-purple-700",
  }[tone];

  return (
    <div className={`rounded-2xl border px-4 py-3 ${toneClass}`}>
      <div className="text-[10px] font-black uppercase tracking-wide opacity-60">
        {label}
      </div>
      <div className="mt-1 truncate text-sm font-black">{clean(value) || "-"}</div>
    </div>
  );
}

function Field({
  label,
  children,
  helper,
}: {
  label: string;
  children: any;
  helper?: string;
}) {
  return (
    <label className="grid gap-2 text-sm font-bold text-slate-700">
      <span>{label}</span>
      {children}
      {helper ? (
        <span className="text-xs font-bold leading-5 text-slate-500">{helper}</span>
      ) : null}
    </label>
  );
}

export default function WellnessNakesInputPage() {
  return (
    <NakesAuthGate>
      {(user, logout) => (
        <WellnessNakesInput nakesUser={user} onLogout={logout} />
      )}
    </NakesAuthGate>
  );
}

// WELLNESS_NAKES_DEDICATED_AUTH_V92
function WellnessNakesInput({
  nakesUser,
  onLogout,
}: {
  nakesUser: any;
  onLogout: () => Promise<void>;
}) {
  const [participants, setParticipants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [retryingSheet, setRetryingSheet] = useState(false);
  const [message, setMessage] = useState(
    "Input NAKES dibuat general untuk pemeriksaan awal, berkala, evaluasi akhir, follow-up, atau label custom. Data masuk ke grafik before-after Wellness."
  );
  const [lastResult, setLastResult] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  // WELLNESS_COMPANY_NAKES_DIRECT_LINK_V90_1
  const [companyScopeId, setCompanyScopeId] = useState("");
  const [companyScopeName, setCompanyScopeName] = useState("");
  const [kelompokFilter, setKelompokFilter] = useState("");
  const [groupFilter, setGroupFilter] = useState("");
  const [participantSort, setParticipantSort] = useState<ParticipantSort>("name_asc");
  const [participantPage, setParticipantPage] = useState(1);
  const [examMode, setExamMode] = useState<ExamMode>("");
  const [examModalOpen, setExamModalOpen] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  const [form, setForm] = useState<any>({
    checkup_date: today(),
    history_type: "periodic_checkup",
    visit_label: "Pemeriksaan Berkala",
    visit_sequence: "",
    program_status: "",
    exam_mode: "",
  });

  async function load() {
    setLoading(true);

    const data = await fetch("/api/wellness/participants", { cache: "no-store" })
      .then((response) => response.json())
      .catch(() => ({}));

    const list = data.participants || [];
    setParticipants(list);

    const params =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search)
        : new URLSearchParams();
    const requestedCompanyId = clean(params.get("company_id"));
    const requestedCompanyName = clean(params.get("company_name"));
    const scopedParticipant =
      list.find(
        (participant: any) =>
          requestedCompanyId &&
          String(participant.company_id || "") === requestedCompanyId,
      ) ||
      list.find(
        (participant: any) =>
          requestedCompanyName &&
          clean(participant.company_name).toLowerCase() ===
            requestedCompanyName.toLowerCase(),
      ) ||
      null;
    const resolvedCompanyName = clean(
      scopedParticipant?.company_name || requestedCompanyName,
    );
    const scopedList = resolvedCompanyName
      ? list.filter(
          (participant: any) =>
            clean(participant.company_name) === resolvedCompanyName,
        )
      : list;

    setCompanyScopeId(requestedCompanyId);
    setCompanyScopeName(resolvedCompanyName);
    if (resolvedCompanyName) {
      setCompanyFilter(resolvedCompanyName);
      setKelompokFilter("");
      setGroupFilter("");
    }

    setForm((previous: any) =>
      previous.participant_id || !scopedList.length
        ? previous
        : { ...previous, participant_id: scopedList[0].id }
    );

    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const companyOptions = useMemo(
    () => uniqueOptions(participants, "company_name"),
    [participants]
  );

  const kelompokOptions = useMemo(
    () =>
      uniqueOptions(
        participants.filter((participant) => {
          if (!companyFilter) return true;
          return clean(participant.company_name) === companyFilter;
        }),
        "kelompok_name"
      ),
    [participants, companyFilter]
  );

  const groupOptions = useMemo(
    () =>
      uniqueOptions(
        participants.filter((participant) => {
          if (companyFilter && clean(participant.company_name) !== companyFilter) return false;
          if (kelompokFilter && clean(participant.kelompok_name) !== kelompokFilter) return false;
          return true;
        }),
        "group_unit_name"
      ),
    [participants, companyFilter, kelompokFilter]
  );

  const filteredParticipants = useMemo(() => {
    const filtered = participants.filter((participant) => {
      if (companyFilter && clean(participant.company_name) !== companyFilter) return false;
      if (kelompokFilter && clean(participant.kelompok_name) !== kelompokFilter) return false;
      if (groupFilter && clean(participant.group_unit_name) !== groupFilter) return false;
      return matchesSearch(participant, search);
    });

    return [...filtered].sort((a, b) => compareParticipants(a, b, participantSort));
  }, [participants, companyFilter, kelompokFilter, groupFilter, search, participantSort]);

  const participantPageCount = Math.max(
    1,
    Math.ceil(filteredParticipants.length / PARTICIPANTS_PER_PAGE),
  );
  const participantStartIndex = (participantPage - 1) * PARTICIPANTS_PER_PAGE;
  const visibleParticipants = filteredParticipants.slice(
    participantStartIndex,
    participantStartIndex + PARTICIPANTS_PER_PAGE,
  );
  const groupedVisibleParticipants = useMemo(() => {
    const groups = new Map<string, any[]>();
    for (const participant of visibleParticipants) {
      const label = participantGroupLabel(participant);
      const current = groups.get(label) || [];
      current.push(participant);
      groups.set(label, current);
    }
    return [...groups.entries()];
  }, [visibleParticipants]);

  const selectedParticipant = useMemo(
    () =>
      participants.find((participant) => String(participant.id) === String(form.participant_id)) ||
      null,
    [participants, form.participant_id]
  );

  useEffect(() => {
    const resolvedAge = participantAge(selectedParticipant);
    setForm((previous: any) => ({
      ...previous,
      age_years: resolvedAge,
    }));
  }, [selectedParticipant?.id]);

  useEffect(() => {
    if (!filteredParticipants.length) return;

    const stillAvailable = filteredParticipants.some(
      (participant) => String(participant.id) === String(form.participant_id)
    );

    if (!stillAvailable) {
      setForm((previous: any) => ({
        ...previous,
        participant_id: filteredParticipants[0].id,
      }));
    }
  }, [filteredParticipants, form.participant_id]);

  useEffect(() => {
    setParticipantPage(1);
  }, [search, companyFilter, kelompokFilter, groupFilter, participantSort]);

  useEffect(() => {
    if (participantPage > participantPageCount) {
      setParticipantPage(participantPageCount);
    }
  }, [participantPage, participantPageCount]);

  function setValue(key: string, value: any) {
    setForm((previous: any) => ({ ...previous, [key]: value }));
  }

  async function copyPageLink() {
    if (typeof window === "undefined") return;

    const currentUrl = window.location.href;

    try {
      await navigator.clipboard.writeText(currentUrl);
      setLinkCopied(true);
      window.setTimeout(() => setLinkCopied(false), 2200);
    } catch {
      window.prompt("Salin link Form NAKES:", currentUrl);
    }
  }

  function selectVisitType(value: VisitType) {
    const option = VISIT_OPTIONS.find((item) => item.value === value);

    setForm((previous: any) => ({
      ...previous,
      history_type: value,
      visit_label: option?.defaultLabel || previous.visit_label || "Pemeriksaan Berkala",
    }));
  }

  function selectExamMode(value: Exclude<ExamMode, "">) {
    setExamMode(value);
    setForm((previous: any) => ({
      ...previous,
      exam_mode: value,
    }));
  }

  function openParticipantExam(participant: any) {
    const defaultMode: Exclude<ExamMode, ""> = "routine";
    setExamMode(defaultMode);
    setLastResult(null);
    setMessage(
      `Peserta ${participantName(participant)} dipilih. Lengkapi pemeriksaan lalu simpan.`,
    );
    setForm((previous: any) => ({
      ...previous,
      participant_id: participant.id,
      age_years: participantAge(participant) || previous.age_years || "",
      exam_mode: defaultMode,
    }));
    setExamModalOpen(true);
  }

  function closeExamModal() {
    if (saving) return;
    setExamModalOpen(false);
  }

  useEffect(() => {
    if (!examModalOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !saving) {
        setExamModalOpen(false);
      }
    }

    window.addEventListener("keydown", handleEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleEscape);
    };
  }, [examModalOpen, saving]);

  async function submit(event: FormEvent) {
    event.preventDefault();

    if (!form.participant_id) {
      setMessage("Pilih peserta terlebih dahulu.");
      return;
    }

    if (!examMode) {
      setMessage("Pilih area pemeriksaan: Rutin, Mini MCU, atau Tambah Catatan.");
      return;
    }

    const ageYears = Number(form.age_years || 0);
    if (!Number.isFinite(ageYears) || ageYears < 18 || ageYears > 119) {
      setMessage("Usia peserta wajib diisi antara 18 sampai 119 tahun.");
      return;
    }

    setSaving(true);
    setMessage("Menyimpan input NAKES...");
    setLastResult(null);

    const participant = selectedParticipant || {};
    const payload = {
      ...form,
      exam_mode: examMode,
      company_name: clean(participant.company_name),
      employee_code: clean(participant.code),
    };

    // WELLNESS_NAKES_SAVE_SHEET_HISTORY_V91_CLIENT
    const response = await fetch("/api/wellness/nakes-input", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch((error) => null);

    let result: any = {
      ok: false,
      message: "Tidak dapat menghubungi server NAKES.",
    };

    if (response) {
      const responseText = await response.text().catch(() => "");
      try {
        result = responseText ? JSON.parse(responseText) : {
          ok: false,
          message: `Server mengembalikan respons kosong (HTTP ${response.status}).`,
        };
      } catch {
        result = {
          ok: false,
          message:
            responseText ||
            `Respons server NAKES tidak valid (HTTP ${response.status}).`,
        };
      }

      if (!response.ok && result?.ok !== false) {
        result = {
          ...result,
          ok: false,
          message: result?.message || `Gagal menyimpan (HTTP ${response.status}).`,
        };
      }
    };

    setSaving(false);
    setLastResult(result);

    if (result.ok) {
      setMessage(
        result.message ||
          "Input NAKES berhasil disimpan. Dashboard grafik peserta akan membaca data ini sebagai titik pemeriksaan klinis."
      );

      setForm((previous: any) => ({
        participant_id: previous.participant_id,
        checkup_date: today(),
        history_type: previous.history_type || "periodic_checkup",
        visit_label: previous.visit_label || "Pemeriksaan Berkala",
        visit_sequence: previous.visit_sequence || "",
        age_years: previous.age_years,
        height_cm: previous.height_cm,
      }));
    } else {
      setMessage(result.message || "Gagal menyimpan input NAKES.");
    }
  }

  async function retryGoogleSheetSync() {
    const historyId = Number(lastResult?.history?.id || 0);
    const participantId = Number(
      lastResult?.participant?.id || form.participant_id || 0,
    );

    if (!(historyId > 0) || !(participantId > 0)) {
      setMessage("History atau peserta untuk retry Google Sheet tidak ditemukan.");
      return;
    }

    setRetryingSheet(true);
    setMessage("Mencoba sinkronisasi ulang ke Google Sheet...");

    const response = await fetch("/api/wellness/nakes-input", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "retry_google_sheet",
        history_id: historyId,
        participant_id: participantId,
      }),
    }).catch(() => null);

    const result = response
      ? await response.json().catch(() => ({
          ok: false,
          message: `Respons retry tidak valid (HTTP ${response.status}).`,
        }))
      : { ok: false, message: "Tidak dapat menghubungi server NAKES." };

    setRetryingSheet(false);
    setLastResult(result);
    setMessage(
      result.message ||
        (result.ok
          ? "Google Sheet berhasil disinkronkan."
          : "Google Sheet belum berhasil disinkronkan."),
    );
  }

  return (
    <main className="min-h-screen bg-[#f4f8fb] px-4 py-6 text-slate-900 md:px-8 md:py-8">
      <div className="mx-auto max-w-6xl space-y-5">
        <section className="flex flex-col gap-3 rounded-2xl border border-teal-100 bg-white px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="text-[10px] font-black uppercase tracking-[0.14em] text-teal-600">
              Session NAKES
            </div>
            <div className="mt-1 truncate text-sm font-black text-slate-900">
              {nakesUser?.name || nakesUser?.username || "NAKES"}
            </div>
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="rounded-xl bg-rose-50 px-4 py-2.5 text-xs font-black text-rose-700"
          >
            Keluar
          </button>
        </section>
        <header className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-xl shadow-slate-200/60">
          <div className="bg-gradient-to-r from-teal-600 via-cyan-600 to-blue-600 px-5 py-3 text-white md:px-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-[11px] font-black uppercase tracking-[0.2em] text-cyan-50">
                Harmony Health • Form Klinis NAKES
              </div>
              <span className="rounded-full bg-white/15 px-3 py-1.5 text-[10px] font-black uppercase tracking-wide ring-1 ring-white/25">
                Direct Link
              </span>
            </div>
          </div>

          <div className="grid gap-5 p-5 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center md:p-7">
            <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-teal-50 ring-1 ring-teal-100">
              <Image
                src="/wellness-pwa/icon-192.png"
                alt="Harmony Health"
                width={64}
                height={64}
                className="h-14 w-14 object-contain"
                priority
              />
            </div>

            <div>
              <h1 className="text-2xl font-black tracking-tight text-slate-950 md:text-3xl">
                Form Pemeriksaan NAKES
              </h1>
              <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-600">
                Form khusus tenaga kesehatan untuk pemeriksaan awal, berkala, evaluasi akhir,
                follow-up klinis, atau pemeriksaan custom peserta Wellness.
              </p>
              <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-teal-50 px-3 py-2 text-xs font-black text-teal-700 ring-1 ring-teal-100">
                <span className="h-2 w-2 rounded-full bg-teal-500" />
                Tidak ditampilkan di menu aplikasi
              </div>
            </div>

            <button
              type="button"
              onClick={copyPageLink}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-lg shadow-slate-200 transition hover:bg-slate-800"
            >
              <span aria-hidden="true">↗</span>
              {linkCopied ? "Link tersalin" : "Salin Link Form"}
            </button>
          </div>
        </header>

        <section className="rounded-2xl border border-cyan-100 bg-cyan-50/80 px-5 py-4 text-sm font-semibold leading-6 text-cyan-950">
          <div>
            Simpan atau bagikan URL halaman ini kepada NAKES yang berwenang. Akses autentikasi,
            proses simpan, field pemeriksaan, dan sumber data tetap mengikuti sistem Wellness yang sudah berjalan.
          </div>
          {companyScopeName ? (
            <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-white px-3 py-2 text-xs font-black text-teal-800 ring-1 ring-cyan-100">
              <span aria-hidden="true">🏢</span>
              Scope perusahaan: {companyScopeName}
            </div>
          ) : null}
        </section>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
          <form
            onSubmit={submit}
            className="space-y-5 rounded-[2rem] border border-slate-200 bg-white p-4 shadow-xl shadow-slate-200/50 md:p-6"
          >
            <section className="rounded-3xl border border-blue-100 bg-blue-50 p-4">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-black text-slate-900">1. Pilih Peserta</h2>
                  <p className="text-xs font-bold leading-5 text-slate-600">
                    Filter agar tidak salah pilih peserta. Data ditampilkan dengan KODE, nama, risk
                    cluster, dan scope program.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={load}
                  className="rounded-full bg-white px-4 py-2 text-xs font-black text-blue-700 ring-1 ring-blue-100"
                >
                  Refresh Peserta
                </button>
              </div>

              <div className="grid gap-3">
                <input
                  className={inputClass()}
                  placeholder="Cari nama, KODE, risk cluster, kelompok..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <select
                    className={inputClass()}
                    value={companyFilter}
                    disabled={Boolean(companyScopeId || companyScopeName)}
                    onChange={(event) => {
                      setCompanyFilter(event.target.value);
                      setKelompokFilter("");
                      setGroupFilter("");
                    }}
                  >
                    <option value="">Semua perusahaan</option>
                    {companyOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>

                  <select
                    className={inputClass()}
                    value={kelompokFilter}
                    onChange={(event) => {
                      setKelompokFilter(event.target.value);
                      setGroupFilter("");
                    }}
                  >
                    <option value="">Semua kelompok</option>
                    {kelompokOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>

                  <select
                    className={inputClass()}
                    value={groupFilter}
                    onChange={(event) => setGroupFilter(event.target.value)}
                  >
                    <option value="">Semua group</option>
                    {groupOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>

                  <select
                    className={inputClass()}
                    value={participantSort}
                    onChange={(event) => setParticipantSort(event.target.value as ParticipantSort)}
                  >
                    <option value="name_asc">Urutkan: Nama A-Z</option>
                    <option value="code_asc">Urutkan: Kode</option>
                    <option value="risk_asc">Urutkan: Risk Cluster</option>
                  </select>
                </div>

                <div className="overflow-hidden rounded-3xl border border-blue-100 bg-white">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-blue-50 bg-blue-50/70 px-4 py-3">
                    <div>
                      <div className="text-sm font-black text-slate-800">Daftar peserta per kelompok</div>
                      <div className="text-xs font-bold text-slate-500">
                        {filteredParticipants.length
                          ? `Menampilkan ${participantStartIndex + 1}-${Math.min(
                              participantStartIndex + visibleParticipants.length,
                              filteredParticipants.length,
                            )} dari ${filteredParticipants.length} peserta`
                          : "Tidak ada peserta sesuai filter"}
                      </div>
                    </div>
                    <div className="rounded-full bg-white px-3 py-1.5 text-xs font-black text-blue-700 ring-1 ring-blue-100">
                      Halaman {participantPage} / {participantPageCount}
                    </div>
                  </div>

                  <div className="max-h-[34rem] space-y-4 overflow-y-auto p-3">
                    {loading ? (
                      <div className="rounded-2xl bg-slate-50 px-4 py-8 text-center text-sm font-bold text-slate-500">
                        Memuat peserta...
                      </div>
                    ) : groupedVisibleParticipants.length ? (
                      groupedVisibleParticipants.map(([groupLabel, groupParticipants]) => (
                        <div key={groupLabel} className="space-y-2">
                          <div className="sticky top-0 z-10 rounded-xl bg-slate-100 px-3 py-2 text-xs font-black uppercase tracking-wide text-slate-600">
                            {groupLabel}
                          </div>
                          <div className="grid gap-2 md:grid-cols-2">
                            {groupParticipants.map((participant: any) => {
                              const active = String(participant.id) === String(form.participant_id);
                              return (
                                <button
                                  key={participant.id}
                                  type="button"
                                  onClick={() => openParticipantExam(participant)}
                                  className={`rounded-2xl border p-3 text-left transition ${
                                    active
                                      ? "border-blue-400 bg-blue-50 shadow-md shadow-blue-100"
                                      : "border-slate-200 bg-white hover:border-blue-200 hover:bg-blue-50/50"
                                  }`}
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <div>
                                      <div className="text-sm font-black text-slate-900">
                                        {participantName(participant)}
                                      </div>
                                      <div className="mt-1 text-xs font-bold text-blue-700">
                                        Kode {clean(participant.code) || "-"} • Participant ID {participant.id || "-"}
                                      </div>
                                    </div>
                                    <span className={`rounded-full px-2 py-1 text-[10px] font-black ${
                                      active
                                        ? "bg-blue-600 text-white"
                                        : "bg-slate-100 text-slate-600"
                                    }`}>
                                      {active ? "Terpilih" : "Buka Form"}
                                    </span>
                                  </div>
                                  <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-black">
                                    <span className="rounded-full bg-amber-50 px-2 py-1 text-amber-700">
                                      {participantRisk(participant)}
                                    </span>
                                    <span className="rounded-full bg-purple-50 px-2 py-1 text-purple-700">
                                      {clean(participant.kelompok_name) || "Tanpa Kelompok"}
                                    </span>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-2xl bg-slate-50 px-4 py-8 text-center text-sm font-bold text-slate-500">
                        Tidak ada peserta sesuai pencarian dan filter.
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-3 border-t border-blue-50 px-4 py-3">
                    <button
                      type="button"
                      disabled={participantPage <= 1}
                      onClick={() => setParticipantPage((current) => Math.max(1, current - 1))}
                      className="rounded-xl bg-slate-100 px-4 py-2 text-xs font-black text-slate-700 disabled:opacity-40"
                    >
                      Sebelumnya
                    </button>
                    <button
                      type="button"
                      disabled={participantPage >= participantPageCount}
                      onClick={() =>
                        setParticipantPage((current) => Math.min(participantPageCount, current + 1))
                      }
                      className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-black text-white disabled:opacity-40"
                    >
                      Berikutnya
                    </button>
                  </div>
                </div>
              </div>

              {selectedParticipant ? (
                <div className="mt-4 grid gap-3 md:grid-cols-4">
                  <InfoPill
                    label="Peserta"
                    value={`${
                      clean(selectedParticipant.code) ? `${selectedParticipant.code} - ` : ""
                    }${participantName(selectedParticipant)}`}
                    tone="blue"
                  />
                  <InfoPill
                    label="Risk Cluster"
                    value={selectedParticipant.risk_cluster || selectedParticipant.baseline_risk_group}
                    tone="amber"
                  />
                  <InfoPill label="Kelompok" value={selectedParticipant.kelompok_name} tone="purple" />
                  <InfoPill
                    label="Group Upload"
                    value={selectedParticipant.group_unit_name}
                    tone="emerald"
                  />
                </div>
              ) : null}
            </section>

            {examModalOpen ? (
              <div
                className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-950/60 p-3 backdrop-blur-sm md:p-6"
                onMouseDown={closeExamModal}
              >
                <div
                  role="dialog"
                  aria-modal="true"
                  aria-label="Form pemeriksaan NAKES peserta"
                  className="my-auto w-full max-w-[1500px] overflow-hidden rounded-[2rem] border border-white/60 bg-slate-50 shadow-2xl shadow-slate-950/30"
                  onMouseDown={(event) => event.stopPropagation()}
                >
                  <header className="flex flex-col gap-4 border-b border-slate-200 bg-gradient-to-r from-teal-50 via-white to-blue-50 px-5 py-5 md:flex-row md:items-center md:justify-between md:px-7">
                    <div className="flex min-w-0 items-center gap-4">
                      <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-teal-600 to-blue-600 text-xl font-black text-white shadow-lg shadow-teal-100">
                        {participantName(selectedParticipant).slice(0, 1).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="text-[10px] font-black uppercase tracking-[0.18em] text-teal-700">
                          Pemeriksaan NAKES
                        </div>
                        <h2 className="truncate text-xl font-black text-slate-950 md:text-2xl">
                          {participantName(selectedParticipant)}
                        </h2>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs font-bold text-slate-500">
                          <span>Kode {clean(selectedParticipant?.code) || "-"}</span>
                          <span>Participant ID {selectedParticipant?.id || "-"}</span>
                          <span>{participantGroupLabel(selectedParticipant)}</span>
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={closeExamModal}
                      disabled={saving}
                      className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Tutup ×
                    </button>
                  </header>

                  <div className="grid max-h-[calc(100vh-8rem)] gap-5 overflow-y-auto p-4 md:p-6 xl:grid-cols-[minmax(0,1fr)_330px]">
                    <div className="space-y-5">
            <section className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-4">
              <h2 className="text-lg font-black text-slate-900">1. Informasi Kunjungan</h2>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                {VISIT_OPTIONS.map((option) => {
                  const active = form.history_type === option.value;

                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => selectVisitType(option.value)}
                      className={`rounded-3xl border p-4 text-left transition ${
                        active
                          ? "border-blue-200 bg-blue-600 text-white shadow-lg shadow-blue-100"
                          : "border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:bg-blue-50"
                      }`}
                    >
                      <div className="text-sm font-black">{option.label}</div>
                      <div className={`mt-1 text-xs font-bold ${active ? "text-blue-50" : "text-slate-500"}`}>
                        {option.helper}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <Field label="Tanggal pemeriksaan">
                  <input
                    type="date"
                    className={inputClass()}
                    value={form.checkup_date || today()}
                    onChange={(event) => setValue("checkup_date", event.target.value)}
                  />
                </Field>

                <Field
                  label="Nama kunjungan / label pemeriksaan"
                  helper="Bebas. Contoh: Minggu 4, Bulan 2, Recheck TD, Kunjungan Site 1, Evaluasi Tengah Program."
                >
                  <input
                    className={inputClass()}
                    value={form.visit_label || ""}
                    onChange={(event) => setValue("visit_label", event.target.value)}
                    placeholder="Contoh: Minggu 4 / Recheck TD"
                  />
                </Field>

                <Field label="Periode / urutan, opsional">
                  <input
                    className={inputClass()}
                    value={form.visit_sequence || ""}
                    onChange={(event) => setValue("visit_sequence", event.target.value)}
                    placeholder="Contoh: Week 4 / Visit 2"
                  />
                </Field>

                <Field label="No. Lab / kode pemeriksaan">
                  <input
                    className={inputClass()}
                    value={form.lab_no || ""}
                    onChange={(event) => setValue("lab_no", event.target.value)}
                    placeholder="Opsional"
                  />
                </Field>
              </div>
            </section>

            <section className="grid gap-4 rounded-3xl border border-cyan-100 bg-cyan-50 p-4">
              <div>
                <h2 className="text-lg font-black text-slate-900">2. Pilih Pemeriksaan</h2>
                <p className="mt-1 text-xs font-bold leading-5 text-slate-600">
                  Field pemeriksaan baru ditampilkan setelah area dipilih agar form lebih singkat dan fokus.
                </p>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                {EXAM_MODE_OPTIONS.map((option) => {
                  const active = examMode === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => selectExamMode(option.value)}
                      className={`rounded-3xl border p-4 text-left transition ${
                        active
                          ? "border-cyan-500 bg-cyan-700 text-white shadow-lg shadow-cyan-100"
                          : "border-cyan-100 bg-white text-slate-700 hover:border-cyan-300 hover:bg-cyan-50"
                      }`}
                    >
                      <div className="text-2xl" aria-hidden="true">{option.icon}</div>
                      <div className="mt-2 text-sm font-black">{option.label}</div>
                      <div className={`mt-1 text-xs font-bold leading-5 ${active ? "text-cyan-50" : "text-slate-500"}`}>
                        {option.helper}
                      </div>
                    </button>
                  );
                })}
              </div>

              {examMode ? (
                <div className="rounded-2xl border border-cyan-100 bg-white p-4">
                  <Field
                    label="Usia saat pemeriksaan (tahun)"
                    helper="Disimpan pada history NAKES dan otomatis dipakai kalkulator target Coach."
                  >
                    <input
                      type="number"
                      min="18"
                      max="119"
                      step="1"
                      required
                      className={inputClass()}
                      value={form.age_years || ""}
                      onChange={(event) => setValue("age_years", event.target.value)}
                      placeholder="Contoh: 33"
                    />
                  </Field>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-cyan-200 bg-white/70 px-4 py-5 text-center text-sm font-bold text-cyan-800">
                  Pilih satu area pemeriksaan untuk melanjutkan.
                </div>
              )}
            </section>

            {examMode === "routine" ? (
            <section className="grid gap-4 rounded-3xl border border-emerald-100 bg-emerald-50 p-4">
              <h2 className="text-lg font-black text-slate-900">Form Pemeriksaan Rutin</h2>

              <div className="grid gap-4 md:grid-cols-4">
                <Field label="BB saat ini (kg)">
                  <input
                    className={inputClass()}
                    value={form.weight_kg || ""}
                    onChange={(event) => setValue("weight_kg", setNumberish(event.target.value))}
                    placeholder="Contoh: 82.5"
                  />
                </Field>

                <Field label="TB (cm)">
                  <input
                    className={inputClass()}
                    value={form.height_cm || clean(selectedParticipant?.height_cm) || ""}
                    onChange={(event) => setValue("height_cm", setNumberish(event.target.value))}
                    placeholder="Contoh: 165"
                  />
                </Field>

                <Field label="Lingkar perut (cm)">
                  <input
                    className={inputClass()}
                    value={form.waist_cm || ""}
                    onChange={(event) => setValue("waist_cm", setNumberish(event.target.value))}
                    placeholder="Contoh: 96"
                  />
                </Field>

                <Field label="Sistolik">
                  <input
                    className={inputClass()}
                    value={form.systolic || ""}
                    onChange={(event) => setValue("systolic", setNumberish(event.target.value))}
                    placeholder="Contoh: 138"
                  />
                </Field>

                <Field label="Diastolik">
                  <input
                    className={inputClass()}
                    value={form.diastolic || ""}
                    onChange={(event) => setValue("diastolic", setNumberish(event.target.value))}
                    placeholder="Contoh: 88"
                  />
                </Field>

                <Field label="Nadi">
                  <input
                    className={inputClass()}
                    value={form.pulse || ""}
                    onChange={(event) => setValue("pulse", setNumberish(event.target.value))}
                    placeholder="Opsional"
                  />
                </Field>
              </div>
            </section>
            ) : null}

            {examMode === "mini_mcu" ? (
            <section className="grid gap-4 rounded-3xl border border-amber-100 bg-amber-50 p-4">
              <h2 className="text-lg font-black text-slate-900">Form Mini MCU</h2>

              <div className="grid gap-4 md:grid-cols-3">
                <Field label="HbA1c (%)">
                  <input
                    className={inputClass()}
                    value={form.hba1c_percent || ""}
                    onChange={(event) => setValue("hba1c_percent", setNumberish(event.target.value))}
                    placeholder="Contoh: 6.8"
                  />
                </Field>

                <Field label="Gula darah">
                  <input
                    className={inputClass()}
                    value={form.glucose_value || ""}
                    onChange={(event) => setValue("glucose_value", setNumberish(event.target.value))}
                    placeholder="GDP/GDS"
                  />
                </Field>

                <Field label="Kolesterol total">
                  <input
                    className={inputClass()}
                    value={form.cholesterol_total || ""}
                    onChange={(event) =>
                      setValue("cholesterol_total", setNumberish(event.target.value))
                    }
                    placeholder="Opsional"
                  />
                </Field>

                <Field label="LDL">
                  <input
                    className={inputClass()}
                    value={form.ldl || ""}
                    onChange={(event) => setValue("ldl", setNumberish(event.target.value))}
                    placeholder="Opsional"
                  />
                </Field>

                <Field label="HDL">
                  <input
                    className={inputClass()}
                    value={form.hdl || ""}
                    onChange={(event) => setValue("hdl", setNumberish(event.target.value))}
                    placeholder="Opsional"
                  />
                </Field>

                <Field label="Trigliserida">
                  <input
                    className={inputClass()}
                    value={form.triglyceride || ""}
                    onChange={(event) => setValue("triglyceride", setNumberish(event.target.value))}
                    placeholder="Opsional"
                  />
                </Field>

                <Field label="Asam urat">
                  <input
                    className={inputClass()}
                    value={form.uric_acid || ""}
                    onChange={(event) => setValue("uric_acid", setNumberish(event.target.value))}
                    placeholder="Opsional"
                  />
                </Field>

                <Field label="SGOT">
                  <input
                    className={inputClass()}
                    value={form.sgot || ""}
                    onChange={(event) => setValue("sgot", setNumberish(event.target.value))}
                    placeholder="Opsional"
                  />
                </Field>

                <Field label="SGPT">
                  <input
                    className={inputClass()}
                    value={form.sgpt || ""}
                    onChange={(event) => setValue("sgpt", setNumberish(event.target.value))}
                    placeholder="Opsional"
                  />
                </Field>
              </div>
            </section>
            ) : null}

            {examMode === "notes" ? (
            <section className="grid gap-4 rounded-3xl border border-purple-100 bg-purple-50 p-4">
              <h2 className="text-lg font-black text-slate-900">Form Tambah Catatan & Follow-up</h2>

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Risk cluster / kesimpulan risiko">
                  <input
                    className={inputClass()}
                    value={form.risk_cluster || ""}
                    onChange={(event) => setValue("risk_cluster", event.target.value)}
                    placeholder="Kosongkan untuk auto-classification"
                  />
                </Field>

                <Field label="Status program">
                  <input
                    className={inputClass()}
                    value={form.program_status || ""}
                    onChange={(event) => setValue("program_status", event.target.value)}
                    placeholder="Contoh: Perlu monitoring / membaik"
                  />
                </Field>

                <Field label="Fokus intervensi">
                  <textarea
                    className={inputClass("min-h-24")}
                    value={form.intervention_focus || ""}
                    onChange={(event) => setValue("intervention_focus", event.target.value)}
                    placeholder="Contoh: kontrol gula, target BB, edukasi diet rendah gula"
                  />
                </Field>

                <Field label="Rencana monitoring">
                  <textarea
                    className={inputClass("min-h-24")}
                    value={form.monitoring_plan || ""}
                    onChange={(event) => setValue("monitoring_plan", event.target.value)}
                    placeholder="Contoh: cek TD mingguan, BB mingguan, GDS bulan depan"
                  />
                </Field>

                <Field label="Catatan validasi medis">
                  <textarea
                    className={inputClass("min-h-28")}
                    value={form.medical_validation_notes || ""}
                    onChange={(event) => setValue("medical_validation_notes", event.target.value)}
                    placeholder="Catatan dokter/nakes"
                  />
                </Field>

                <div className="grid gap-4">
                  <Field label="Tanggal follow-up berikutnya">
                    <input
                      type="date"
                      className={inputClass()}
                      value={form.follow_up_date || ""}
                      onChange={(event) => setValue("follow_up_date", event.target.value)}
                    />
                  </Field>

                  <Field label="Alert klinis / flag khusus">
                    <input
                      className={inputClass()}
                      value={form.clinical_alert || ""}
                      onChange={(event) => setValue("clinical_alert", event.target.value)}
                      placeholder="Opsional"
                    />
                  </Field>
                </div>
              </div>
            </section>
            ) : null}

            <button
              type="submit"
              disabled={saving || !form.participant_id || !examMode}
              className="w-full rounded-2xl bg-gradient-to-r from-teal-600 to-blue-600 px-5 py-4 text-sm font-black text-white shadow-lg shadow-teal-100 transition hover:from-teal-700 hover:to-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving
                ? "Menyimpan..."
                : `Simpan ${
                    EXAM_MODE_OPTIONS.find((option) => option.value === examMode)?.label ||
                    "Input NAKES"
                  }`}
            </button>
                    </div>

                    <aside className="space-y-4 xl:sticky xl:top-0 xl:self-start">
                      <section className="rounded-3xl border border-teal-100 bg-white p-5 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-[10px] font-black uppercase tracking-wide text-teal-700">
                              Ringkasan Peserta
                            </div>
                            <div className="mt-1 text-lg font-black text-slate-950">
                              {participantName(selectedParticipant)}
                            </div>
                            <div className="text-xs font-bold text-slate-500">
                              Kode {clean(selectedParticipant?.code) || "-"} • ID {selectedParticipant?.id || "-"}
                            </div>
                          </div>
                          <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-[10px] font-black text-emerald-700 ring-1 ring-emerald-100">
                            Terpilih ✓
                          </span>
                        </div>
                        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                          <InfoPill label="Risk Cluster" value={participantRisk(selectedParticipant)} tone="amber" />
                          <InfoPill label="Perusahaan" value={selectedParticipant?.company_name} tone="blue" />
                          <InfoPill label="Kelompok / Group" value={participantGroupLabel(selectedParticipant)} tone="purple" />
                          <InfoPill label="Usia Pemeriksaan" value={form.age_years ? `${form.age_years} tahun` : "Belum diisi"} tone="emerald" />
                        </div>
                      </section>

                      <section className="rounded-3xl border border-blue-100 bg-blue-50 p-5">
                        <div className="text-[10px] font-black uppercase tracking-wide text-blue-700">
                          Pemeriksaan Aktif
                        </div>
                        <div className="mt-2 text-base font-black text-slate-950">
                          {EXAM_MODE_OPTIONS.find((option) => option.value === examMode)?.label ||
                            "Pilih jenis pemeriksaan"}
                        </div>
                        <div className="mt-1 text-xs font-bold leading-5 text-slate-600">
                          {EXAM_MODE_OPTIONS.find((option) => option.value === examMode)?.helper ||
                            "Pilih Rutin, Mini MCU, atau Tambah Catatan."}
                        </div>
                      </section>

                      <section className={`rounded-3xl border p-5 ${
                        lastResult?.partial_success
                          ? "border-amber-200 bg-amber-50"
                          : lastResult?.ok
                            ? "border-emerald-200 bg-emerald-50"
                            : lastResult && !lastResult.ok
                              ? "border-rose-200 bg-rose-50"
                              : "border-slate-200 bg-white"
                      }`}>
                        <div className="text-[10px] font-black uppercase tracking-wide text-slate-500">
                          Status Penyimpanan
                        </div>
                        <div className="mt-2 text-sm font-bold leading-6 text-slate-700">
                          {message}
                        </div>
                        {lastResult?.saved_to_history && lastResult.google_sheet?.ok === false ? (
                          <button
                            type="button"
                            onClick={retryGoogleSheetSync}
                            disabled={retryingSheet}
                            className="mt-4 w-full rounded-2xl bg-amber-600 px-4 py-3 text-xs font-black text-white disabled:opacity-60"
                          >
                            {retryingSheet ? "Menyinkronkan..." : "Coba Sinkronkan Google Sheet"}
                          </button>
                        ) : null}
                      </section>

                      <section className="rounded-3xl border border-amber-100 bg-amber-50 p-5 text-xs font-bold leading-5 text-amber-900">
                        <div className="font-black">Catatan penting</div>
                        <div className="mt-2">
                          Usia dan hasil pemeriksaan NAKES digunakan oleh grafik peserta dan kalkulator target Coach. Pastikan identitas dan tanggal pemeriksaan sudah benar.
                        </div>
                      </section>
                    </aside>
                  </div>
                </div>
              </div>
            ) : null}
          </form>

          <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
            <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-xl shadow-slate-100">
              <h2 className="text-lg font-black">Status</h2>

              <div
                className={`mt-4 rounded-2xl px-4 py-3 text-sm font-bold leading-6 ${
                  lastResult?.partial_success
                    ? "bg-amber-50 text-amber-900"
                    : lastResult?.ok
                      ? "bg-emerald-50 text-emerald-800"
                    : lastResult && !lastResult.ok
                      ? "bg-rose-50 text-rose-700"
                      : "bg-slate-50 text-slate-600"
                }`}
              >
                {message}
              </div>

              {lastResult?.ok ? (
                <div className="mt-4 grid gap-3">
                  <InfoPill
                    label="Peserta tersimpan"
                    value={`${lastResult.participant?.code || "-"} - ${
                      lastResult.participant?.name || "-"
                    } · ID ${lastResult.participant?.id || "-"}`}
                    tone="blue"
                  />
                  <InfoPill label="Visit" value={lastResult.summary?.visit_label} tone="blue" />
                  <InfoPill
                    label="History ID / Revisi"
                    value={`${lastResult.history?.id || "-"} / ${
                      lastResult.summary?.revision || "-"
                    }`}
                    tone="purple"
                  />
                  <InfoPill
                    label="Google Sheet"
                    value={
                      lastResult.google_sheet?.ok
                        ? `Tersinkron · Row ${lastResult.google_sheet?.rowNumber || "-"}`
                        : "Belum tersinkron"
                    }
                    tone={lastResult.google_sheet?.ok ? "emerald" : "amber"}
                  />

                  {lastResult.saved_to_history && lastResult.google_sheet?.ok === false ? (
                    <button
                      type="button"
                      onClick={retryGoogleSheetSync}
                      disabled={retryingSheet}
                      className="rounded-2xl bg-amber-500 px-4 py-3 text-sm font-black text-white disabled:opacity-60"
                    >
                      {retryingSheet ? "Menyinkronkan..." : "Coba Sinkronkan Google Sheet"}
                    </button>
                  ) : null}
                </div>
              ) : null}

              {lastResult && !lastResult.ok && lastResult.detail ? (
                <pre className="mt-3 max-h-48 overflow-auto rounded-2xl bg-rose-50 p-3 text-xs text-rose-700">
                  {String(lastResult.detail)}
                </pre>
              ) : null}
            </section>

            <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-xl shadow-slate-100">
              <h2 className="text-lg font-black">Yang masuk grafik</h2>

              <div className="mt-4 space-y-3 text-sm font-bold leading-6 text-slate-600">
                <p>
                  Data NAKES disimpan sebagai history pemeriksaan. Label pemeriksaan bisa dibuat
                  bebas agar cocok untuk jadwal program apa pun.
                </p>

                <ul className="list-disc space-y-2 pl-5">
                  <li>BB, BMI, lingkar perut</li>
                  <li>Tekanan darah sistolik/diastolik</li>
                  <li>HbA1c dan gula darah</li>
                  <li>Catatan medis, rencana monitoring, status program</li>
                  <li>Label bebas: Minggu 1, Minggu 4, Month 2, Recheck TD, Final, atau lainnya</li>
                </ul>
              </div>
            </section>

            <section className="rounded-[2rem] border border-amber-200 bg-amber-50 p-5">
              <h2 className="text-lg font-black text-amber-900">Catatan teknis</h2>

              <p className="mt-3 text-sm font-bold leading-6 text-amber-900">
                Jika muncul error tabel <code>wellness_checkup_history</code> belum ada, jalankan
                SQL guard v372 di Supabase. SQL ini hanya membuat tabel Wellness dan tidak menyentuh
                MCU/CAPASKA/Vaksinasi.
              </p>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}