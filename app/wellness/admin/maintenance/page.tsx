"use client";

import { useEffect, useMemo, useState } from "react";

// WELLNESS_DUMMY_DATA_MAINTENANCE_UI_V109

type Category = "activity" | "points_history" | "reset_all" | "full";

type Participant = {
  id: number;
  code?: string;
  name?: string;
  email?: string;
  phone?: string;
  portal_username?: string;
  portal_email?: string;
  portal_phone?: string;
  portal_registered_at?: string;
  is_active?: any;
  wellness_company_id?: number;
  company_name?: string;
  group_name?: string;
};

function clean(value: any) {
  return String(value ?? "").trim();
}

function fmt(value: any) {
  const number = Number(value);
  return new Intl.NumberFormat("id-ID").format(
    Number.isFinite(number) ? number : 0,
  );
}

function downloadJson(filename: string, payload: any) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

const CATEGORY_META: Record<
  Category,
  { title: string; description: string; icon: string; tone: string }
> = {
  activity: {
    title: "Reset Data Aktivitas",
    description:
      "Nutrisi, workout/steps, Health Talk, berat badan, dan bukti harian.",
    icon: "🏃",
    tone: "border-sky-200 bg-sky-50 text-sky-950",
  },
  points_history: {
    title: "Reset Point & History",
    description:
      "Point logs, Mini MCU, riwayat klinis, dan riwayat pemeriksaan.",
    icon: "📊",
    tone: "border-amber-200 bg-amber-50 text-amber-950",
  },
  reset_all: {
    title: "Reset Total & Akun",
    description:
      "Hapus seluruh data dummy dan kosongkan username, email, serta nomor HP login. Master peserta tetap ada.",
    icon: "♻️",
    tone: "border-violet-200 bg-violet-50 text-violet-950",
  },
  full: {
    title: "Hapus Peserta dari Daftar",
    description:
      "Hapus seluruh data terkait dan master peserta. Gunakan saat daftar peserta program berubah.",
    icon: "🗑️",
    tone: "border-rose-200 bg-rose-50 text-rose-950",
  },
};

export default function WellnessAdminMaintenancePage() {
  const [bootstrap, setBootstrap] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("Memuat Maintenance Wellness...");
  const [category, setCategory] = useState<Category>("activity");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [preview, setPreview] = useState<any>(null);
  const [backupToken, setBackupToken] = useState("");
  const [backupCreatedAt, setBackupCreatedAt] = useState("");
  const [confirmation, setConfirmation] = useState("");

  async function loadPage() {
    setLoading(true);
    const result = await fetch(
      `/api/wellness/admin/maintenance/cleanup?t=${Date.now()}`,
      { cache: "no-store", credentials: "include" },
    )
      .then((response) => response.json())
      .catch((error) => ({ ok: false, message: error?.message || "Network error" }));

    if (result?.ok) {
      setBootstrap(result);
      setMessage("");
    } else {
      setBootstrap(null);
      setMessage(result?.message || "Maintenance Wellness tidak dapat dimuat.");
    }
    setLoading(false);
  }

  useEffect(() => {
    void loadPage();
  }, []);

  function resetPreparedState() {
    setPreview(null);
    setBackupToken("");
    setBackupCreatedAt("");
    setConfirmation("");
  }

  const participants: Participant[] = Array.isArray(bootstrap?.participants)
    ? bootstrap.participants
    : [];

  const visibleParticipants = useMemo(() => {
    const keyword = clean(query).toLowerCase();
    return participants.filter((participant) => {
      const companyMatches =
        companyFilter === "all" ||
        String(participant.wellness_company_id || "") === companyFilter;
      if (!companyMatches) return false;
      if (!keyword) return true;
      return [
        participant.name,
        participant.code,
        participant.company_name,
        participant.group_name,
        participant.email,
        participant.phone,
        participant.portal_username,
        participant.portal_email,
        participant.portal_phone,
      ]
        .map((value) => clean(value).toLowerCase())
        .some((value) => value.includes(keyword));
    });
  }, [participants, companyFilter, query]);

  function toggleParticipant(id: number) {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id].sort((left, right) => left - right),
    );
    resetPreparedState();
  }

  function selectVisible() {
    setSelectedIds(
      Array.from(
        new Set([...selectedIds, ...visibleParticipants.map((item) => Number(item.id))]),
      ).sort((left, right) => left - right),
    );
    resetPreparedState();
  }

  async function postAction(action: "preview" | "backup" | "delete") {
    if (!selectedIds.length) {
      setMessage("Pilih minimal satu peserta dummy.");
      return null;
    }

    setBusy(action);
    setMessage("");

    const result = await fetch("/api/wellness/admin/maintenance/cleanup", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        category,
        participant_ids: selectedIds,
        confirmation,
        backup_token: backupToken,
        backup_acknowledged: Boolean(backupToken),
      }),
    })
      .then((response) => response.json())
      .catch((error) => ({ ok: false, message: error?.message || "Network error" }));

    setBusy("");
    if (!result?.ok) {
      setMessage(result?.message || "Proses Maintenance gagal.");
      return null;
    }
    return result;
  }

  async function runPreview() {
    const result = await postAction("preview");
    if (!result) return;
    setPreview(result.preview);
    setBackupToken("");
    setBackupCreatedAt("");
    setConfirmation("");
    setMessage("Preview selesai. Tidak ada data yang diubah.");
  }

  async function createBackup() {
    const result = await postAction("backup");
    if (!result) return;
    const backup = result.backup;
    const timestamp = clean(backup?.created_at)
      .replace(/[:.]/g, "-")
      .replace("T", "_")
      .replace("Z", "");
    downloadJson(
      `wellness_dummy_backup_${category}_${timestamp || Date.now()}.json`,
      backup,
    );
    setPreview(backup?.preview || preview);
    setBackupToken(clean(result.backup_token));
    setBackupCreatedAt(clean(backup?.created_at));
    setMessage(
      "Backup JSON berhasil dibuat. Token penghapusan berlaku 30 menit.",
    );
  }

  async function executeDelete() {
    const expected = clean(bootstrap?.confirmation_text);
    if (confirmation.trim().toUpperCase() !== expected) {
      setMessage(`Ketik persis: ${expected}`);
      return;
    }

    const approved = window.confirm(
      `Yakin menjalankan "${CATEGORY_META[category].title}" untuk ${selectedIds.length} peserta? Backup JSON harus sudah tersimpan. Aksi ini tidak dapat dibatalkan.`,
    );
    if (!approved) return;

    const result = await postAction("delete");
    if (!result) return;
    const deletedRows = Number(result?.result?.deleted_rows || 0);
    const updatedRows = Number(result?.result?.updated_rows || 0);
    setSelectedIds([]);
    resetPreparedState();
    await loadPage();
    setMessage(
      `Maintenance selesai. ${fmt(deletedRows)} row dihapus dan ${fmt(
        updatedRows,
      )} akun peserta direset.`,
    );
  }

  const expectedConfirmation = clean(bootstrap?.confirmation_text);
  const deleteReady =
    bootstrap?.enabled === true &&
    Boolean(backupToken) &&
    confirmation.trim().toUpperCase() === expectedConfirmation &&
    selectedIds.length > 0 &&
    !busy;

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 p-6 text-slate-900">
        <div className="mx-auto max-w-5xl rounded-3xl bg-white p-8 shadow-sm">
          Memuat Maintenance Wellness...
        </div>
      </main>
    );
  }

  if (!bootstrap) {
    return (
      <main className="min-h-screen bg-slate-50 p-6 text-slate-900">
        <div className="mx-auto max-w-3xl rounded-3xl border border-rose-200 bg-white p-8 shadow-sm">
          <div className="text-2xl font-black">Akses Maintenance ditolak</div>
          <p className="mt-3 text-sm font-bold text-rose-700">{message}</p>
          <a
            href="/wellness/admin"
            className="mt-6 inline-flex rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white"
          >
            Kembali ke Portal Admin
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f8fbfc_0%,#f3f7f9_100%)] px-4 py-5 text-slate-900 md:px-8 md:py-8">
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="flex flex-col gap-4 rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm md:flex-row md:items-center md:justify-between md:p-6">
          <div>
            <a
              href="/wellness/admin"
              className="text-xs font-black uppercase tracking-[0.14em] text-teal-700"
            >
              ← Portal Admin Wellness
            </a>
            <h1 className="mt-2 text-3xl font-black text-slate-950">
              Kelola Data Dummy
            </h1>
            <p className="mt-2 max-w-3xl text-sm font-bold leading-6 text-slate-500">
              Reset data dummy, kosongkan email login, atau hapus peserta yang
              sudah tidak masuk daftar program. Semua tindakan hanya berlaku untuk peserta yang dipilih.
            </p>
          </div>
          <div
            className={`self-start rounded-full px-4 py-2 text-xs font-black ${
              bootstrap.enabled
                ? "bg-rose-100 text-rose-800"
                : "bg-emerald-100 text-emerald-800"
            }`}
          >
            {bootstrap.enabled
              ? "DELETE MODE AKTIF"
              : "SAFE TRIAL · DELETE NONAKTIF"}
          </div>
        </header>

        <section className="rounded-[1.5rem] border border-amber-200 bg-amber-50 p-5 text-sm font-bold leading-6 text-amber-950">
          <div className="text-base font-black">Batas aman versi percobaan</div>
          <p className="mt-1">
            Fitur ini hanya memproses data Supabase Wellness. Google Sheet,
            Google Drive, dan Apps Script existing tidak diubah. Opsi Reset Total
            mengosongkan email/username login portal, tetapi tetap mempertahankan
            email dan nomor HP master peserta. Opsi Hapus Peserta menghapus seluruh
            master peserta terpilih.
          </p>
        </section>

        <section className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <div className="text-xl font-black">1. Pilih tindakan</div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {(Object.keys(CATEGORY_META) as Category[]).map((key) => {
              const item = CATEGORY_META[key];
              const active = category === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setCategory(key);
                    resetPreparedState();
                  }}
                  className={`rounded-[1.35rem] border p-4 text-left transition ${
                    active
                      ? `${item.tone} ring-2 ring-teal-500 ring-offset-2`
                      : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50"
                  }`}
                >
                  <div className="text-2xl">{item.icon}</div>
                  <div className="mt-3 text-base font-black">{item.title}</div>
                  <div className="mt-1 text-xs font-bold leading-5 opacity-75">
                    {item.description}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="text-xl font-black">2. Pilih peserta dummy</div>
              <div className="mt-1 text-sm font-bold text-slate-500">
                {fmt(selectedIds.length)} peserta dipilih
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={selectVisible}
                className="rounded-xl bg-teal-700 px-4 py-2.5 text-xs font-black text-white"
              >
                Pilih yang tampil
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedIds([]);
                  resetPreparedState();
                }}
                className="rounded-xl bg-slate-100 px-4 py-2.5 text-xs font-black text-slate-700"
              >
                Kosongkan pilihan
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-[16rem_1fr]">
            <select
              value={companyFilter}
              onChange={(event) => {
                setCompanyFilter(event.target.value);
                resetPreparedState();
              }}
              className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold outline-none focus:border-teal-500"
            >
              <option value="all">Semua perusahaan</option>
              {(bootstrap.companies || []).map((company: any) => (
                <option key={company.id} value={String(company.id)}>
                  {company.name}
                </option>
              ))}
            </select>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Cari nama, kode, perusahaan, kelompok, atau email login..."
              className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold outline-none focus:border-teal-500"
            />
          </div>

          <div className="mt-4 max-h-[32rem] space-y-2 overflow-y-auto pr-1">
            {visibleParticipants.length ? (
              visibleParticipants.map((participant) => {
                const id = Number(participant.id);
                const checked = selectedIds.includes(id);
                return (
                  <label
                    key={id}
                    className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition ${
                      checked
                        ? "border-teal-300 bg-teal-50"
                        : "border-slate-200 bg-white hover:bg-slate-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleParticipant(id)}
                      className="mt-1 h-5 w-5 accent-teal-700"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="break-words text-sm font-black text-slate-950">
                        {participant.name || `Peserta ${id}`}
                      </div>
                      <div className="mt-1 break-words text-xs font-bold text-slate-500">
                        Kode {participant.code || "-"} · {participant.company_name || "-"} · {participant.group_name || "-"}
                      </div>
                      <div className="mt-1 break-words text-[11px] font-bold text-slate-400">
                        Email master: {participant.email || "-"} · Login portal: {participant.portal_email || participant.portal_username || "belum terdaftar"}
                      </div>
                    </div>
                    <div className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black text-slate-600">
                      ID {id}
                    </div>
                  </label>
                );
              })
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm font-bold text-slate-400">
                Tidak ada peserta yang sesuai filter.
              </div>
            )}
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <div className="text-xl font-black">3. Preview dan backup</div>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={runPreview}
              disabled={Boolean(busy) || !selectedIds.length}
              className="rounded-2xl bg-blue-700 px-5 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy === "preview" ? "Menghitung..." : "Preview Data"}
            </button>
            <button
              type="button"
              onClick={createBackup}
              disabled={Boolean(busy) || !preview || !selectedIds.length}
              className="rounded-2xl bg-emerald-700 px-5 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy === "backup" ? "Membuat backup..." : "Download Backup JSON"}
            </button>
          </div>

          {preview ? (
            <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
              <div className="grid grid-cols-[1fr_auto] gap-3 bg-slate-100 px-4 py-3 text-xs font-black uppercase tracking-wide text-slate-600">
                <span>Data</span>
                <span>Jumlah row</span>
              </div>
              {(preview.tables || []).map((item: any) => (
                <div
                  key={item.table}
                  className="grid grid-cols-[1fr_auto] gap-3 border-t border-slate-100 px-4 py-3 text-sm"
                >
                  <div>
                    <div className="font-black text-slate-800">{item.label}</div>
                    <div className="mt-0.5 text-[10px] font-bold text-slate-400">
                      {item.table}
                      {item.available === false ? " · tidak tersedia" : ""}
                    </div>
                  </div>
                  <div className="font-black text-slate-950">{fmt(item.count)}</div>
                </div>
              ))}
              <div className="grid grid-cols-[1fr_auto] gap-3 border-t border-slate-200 bg-slate-50 px-4 py-4 text-sm font-black">
                <span>Total</span>
                <span>{fmt(preview.total_rows)}</span>
              </div>
            </div>
          ) : null}

          {backupToken ? (
            <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-bold leading-5 text-emerald-900">
              ✓ Backup dibuat {backupCreatedAt || "barusan"}. Simpan file JSON
              tersebut sebelum mengaktifkan penghapusan.
            </div>
          ) : null}
        </section>

        <section className="rounded-[1.75rem] border border-rose-200 bg-white p-5 shadow-sm md:p-6">
          <div className="text-xl font-black text-rose-900">4. Konfirmasi tindakan</div>
          {!bootstrap.enabled ? (
            <div className="mt-3 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold leading-6 text-emerald-900">
              Mode percobaan aktif: tombol hapus dikunci. Preview dan backup dapat
              diuji tanpa risiko mengubah data. Penghapusan baru aktif setelah
              environment <code>ENABLE_WELLNESS_DATA_CLEANUP=true</code> disetel
              pada Vercel Production.
            </div>
          ) : null}

          <label className="mt-4 block text-xs font-black uppercase tracking-[0.12em] text-slate-600">
            Ketik persis: {expectedConfirmation}
          </label>
          <input
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            placeholder={expectedConfirmation}
            className="mt-2 w-full rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-black text-rose-950 outline-none focus:border-rose-500"
          />

          <button
            type="button"
            onClick={executeDelete}
            disabled={!deleteReady}
            className="mt-4 w-full rounded-2xl bg-rose-700 px-5 py-3.5 text-sm font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {busy === "delete"
              ? "Menghapus data..."
              : CATEGORY_META[category].title}
          </button>

          <p className="mt-3 text-xs font-bold leading-5 text-slate-500">
            Tidak ada transaksi database lintas tabel. Bila proses aktif gagal di
            tengah jalan, audit log akan mencatat kegagalan dan backup JSON menjadi
            sumber pemulihan manual.
          </p>
        </section>

        {message ? (
          <div className="sticky bottom-4 rounded-2xl bg-slate-950 px-5 py-4 text-sm font-bold text-white shadow-2xl">
            {message}
          </div>
        ) : null}
      </div>
    </main>
  );
}
