"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

// WELLNESS_COACH_USERNAME_ACCOUNTS_V117A

type TabKey = "nakes" | "coach";

type NakesRow = {
  id: number;
  name: string;
  username: string;
  role: string;
  program_type: string;
  is_active: number | boolean;
};

type CoachRow = {
  id: number;
  name: string;
  email: string;
  username?: string | null;
  is_active: number | boolean;
};

const emptyNakes = {
  id: 0,
  name: "",
  username: "",
  password: "",
  is_active: 1,
};

const emptyCoach = {
  id: 0,
  name: "",
  email: "",
  username: "",
  is_active: 1,
};

function isActive(value: any) {
  return ![false, 0, "0", "false"].includes(value);
}

export default function WellnessUsersAdminPage() {
  const [tab, setTab] = useState<TabKey>("nakes");
  const [nakesUsers, setNakesUsers] = useState<NakesRow[]>([]);
  const [coachUsers, setCoachUsers] = useState<CoachRow[]>([]);
  const [nakesForm, setNakesForm] = useState<any>(emptyNakes);
  const [coachForm, setCoachForm] = useState<any>(emptyCoach);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function loadNakes() {
    setLoading(true);

    const result: any = await fetch(
      "/api/wellness/admin/nakes-users",
      {
        cache: "no-store",
        credentials: "include",
      },
    )
      .then(async (response) => ({
        ...(await response.json().catch(() => ({}))),
        http_status: response.status,
      }))
      .catch((err) => ({
        ok: false,
        message: err?.message || "Network error",
      }));

    if (!result.ok) {
      setError(result.message || "Gagal memuat User NAKES.");
    } else {
      setNakesUsers(result.users || []);
      setError("");
    }

    setLoading(false);
  }

  async function loadCoaches() {
    setLoading(true);

    const result: any = await fetch(
      "/api/wellness/admin/coach-users",
      {
        cache: "no-store",
        credentials: "include",
      },
    )
      .then(async (response) => ({
        ...(await response.json().catch(() => ({}))),
        http_status: response.status,
      }))
      .catch((err) => ({
        ok: false,
        message: err?.message || "Network error",
      }));

    if (!result.ok) {
      setError(
        result.message ||
          "Gagal memuat User Coach. Jalankan SQL username Coach.",
      );
    } else {
      setCoachUsers(result.coaches || []);
      setError("");
    }

    setLoading(false);
  }

  useEffect(() => {
    setMessage("");
    setError("");

    if (tab === "nakes") {
      void loadNakes();
    } else {
      void loadCoaches();
    }
  }, [tab]);

  async function saveNakes(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");

    const result: any = await fetch(
      "/api/wellness/admin/nakes-users",
      {
        method: nakesForm.id ? "PATCH" : "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(nakesForm),
      },
    )
      .then((response) => response.json().catch(() => ({})))
      .catch((err) => ({
        ok: false,
        message: err?.message || "Network error",
      }));

    if (!result.ok) {
      setError(result.message || "Gagal menyimpan User NAKES.");
    } else {
      setMessage(
        result.message || "User NAKES berhasil disimpan.",
      );
      setNakesForm(emptyNakes);
      await loadNakes();
    }

    setSaving(false);
  }

  async function saveCoach(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");

    const result: any = await fetch(
      "/api/wellness/admin/coach-users",
      {
        method: coachForm.id ? "PATCH" : "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(coachForm),
      },
    )
      .then((response) => response.json().catch(() => ({})))
      .catch((err) => ({
        ok: false,
        message: err?.message || "Network error",
      }));

    if (!result.ok) {
      setError(result.message || "Gagal menyimpan User Coach.");
    } else {
      setMessage(
        result.message || "User Coach berhasil disimpan.",
      );
      setCoachForm(emptyCoach);
      await loadCoaches();
    }

    setSaving(false);
  }

  async function removeNakes(user: NakesRow) {
    if (
      !window.confirm(
        `Hapus User NAKES ${user.name || user.username}?`,
      )
    ) {
      return;
    }

    const result: any = await fetch(
      "/api/wellness/admin/nakes-users",
      {
        method: "DELETE",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id: user.id }),
      },
    ).then((response) =>
      response.json().catch(() => ({})),
    );

    if (!result.ok) {
      setError(result.message || "Gagal menghapus User NAKES.");
    } else {
      setMessage(result.message);
      await loadNakes();
    }
  }

  async function deactivateCoach(user: CoachRow) {
    if (
      !window.confirm(
        `Nonaktifkan Coach ${user.name || user.email}?`,
      )
    ) {
      return;
    }

    const result: any = await fetch(
      "/api/wellness/admin/coach-users",
      {
        method: "DELETE",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id: user.id }),
      },
    ).then((response) =>
      response.json().catch(() => ({})),
    );

    if (!result.ok) {
      setError(
        result.message || "Gagal menonaktifkan User Coach.",
      );
    } else {
      setMessage(result.message);
      await loadCoaches();
    }
  }

  function editNakes(user: NakesRow) {
    setNakesForm({
      id: user.id,
      name: user.name || "",
      username: user.username || "",
      password: "",
      is_active: isActive(user.is_active) ? 1 : 0,
    });
    setMessage("");
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function editCoach(user: CoachRow) {
    setCoachForm({
      id: user.id,
      name: user.name || "",
      email: user.email || "",
      username: user.username || "",
      is_active: isActive(user.is_active) ? 1 : 0,
    });
    setMessage("");
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const isCoach = tab === "coach";

  return (
    <main className="min-h-screen bg-[#f4f8fb] px-4 py-6 text-slate-950 md:px-8">
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-xl shadow-slate-200/50">
          <div className="bg-gradient-to-r from-slate-950 via-blue-900 to-teal-600 p-5 text-white md:p-6">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl bg-white/15">
                  <Image
                    src="/wellness-pwa/icon-192.png"
                    alt="Harmony Health"
                    width={56}
                    height={56}
                    className="h-12 w-12 object-contain"
                  />
                </div>

                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.16em] text-white/65">
                    Harmony Health Admin
                  </div>
                  <h1 className="mt-1 text-2xl font-black">
                    Manajemen User Wellness
                  </h1>
                  <p className="mt-1 text-xs font-bold text-white/75">
                    Kelola akses NAKES dan Coach secara terpisah.
                  </p>
                </div>
              </div>

              <a
                href="/wellness/admin"
                className="rounded-2xl bg-white/15 px-4 py-3 text-xs font-black text-white ring-1 ring-white/20"
              >
                ← Portal Admin
              </a>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 p-3">
            <button
              type="button"
              onClick={() => setTab("nakes")}
              className={`rounded-2xl px-4 py-3 text-sm font-black ${
                tab === "nakes"
                  ? "bg-slate-950 text-white"
                  : "bg-slate-100 text-slate-600"
              }`}
            >
              NAKES
            </button>

            <button
              type="button"
              onClick={() => setTab("coach")}
              className={`rounded-2xl px-4 py-3 text-sm font-black ${
                tab === "coach"
                  ? "bg-teal-600 text-white"
                  : "bg-slate-100 text-slate-600"
              }`}
            >
              Coach
            </button>
          </div>
        </header>

        <div className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
          {isCoach ? (
            <form
              onSubmit={saveCoach}
              className="h-fit rounded-[2rem] border border-slate-200 bg-white p-5 shadow-lg shadow-slate-200/50 lg:sticky lg:top-5"
            >
              <div className="text-lg font-black">
                {coachForm.id
                  ? "Edit User Coach"
                  : "Tambah User Coach"}
              </div>

              <p className="mt-1 text-xs font-bold leading-5 text-slate-500">
                Login utama Coach menggunakan email dan username.
              </p>

              <div className="mt-5 space-y-4">
                <label className="grid gap-2 text-sm font-black text-slate-700">
                  Nama Coach
                  <input
                    value={coachForm.name}
                    onChange={(event) =>
                      setCoachForm((previous: any) => ({
                        ...previous,
                        name: event.target.value,
                      }))
                    }
                    className="h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold"
                    placeholder="Nama lengkap Coach"
                  />
                </label>

                <label className="grid gap-2 text-sm font-black text-slate-700">
                  Email
                  <input
                    type="email"
                    value={coachForm.email}
                    onChange={(event) =>
                      setCoachForm((previous: any) => ({
                        ...previous,
                        email: event.target.value,
                      }))
                    }
                    className="h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold"
                    placeholder="coach@perusahaan.com"
                  />
                </label>

                <label className="grid gap-2 text-sm font-black text-slate-700">
                  Username
                  <input
                    value={coachForm.username}
                    onChange={(event) =>
                      setCoachForm((previous: any) => ({
                        ...previous,
                        username: event.target.value.toLowerCase(),
                      }))
                    }
                    className="h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold"
                    placeholder="username.coach"
                    autoCapitalize="none"
                  />
                </label>

                <label className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm font-black">
                  <span>Status aktif</span>
                  <input
                    type="checkbox"
                    checked={Boolean(coachForm.is_active)}
                    onChange={(event) =>
                      setCoachForm((previous: any) => ({
                        ...previous,
                        is_active: event.target.checked ? 1 : 0,
                      }))
                    }
                    className="h-5 w-5 accent-teal-600"
                  />
                </label>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3">
                {coachForm.id ? (
                  <button
                    type="button"
                    onClick={() => setCoachForm(emptyCoach)}
                    className="h-12 rounded-2xl bg-slate-100 text-sm font-black text-slate-700"
                  >
                    Batal
                  </button>
                ) : (
                  <div />
                )}

                <button
                  type="submit"
                  disabled={saving}
                  className="h-12 rounded-2xl bg-teal-600 text-sm font-black text-white disabled:opacity-60"
                >
                  {saving
                    ? "Menyimpan..."
                    : coachForm.id
                      ? "Simpan"
                      : "Tambah Coach"}
                </button>
              </div>
            </form>
          ) : (
            <form
              onSubmit={saveNakes}
              className="h-fit rounded-[2rem] border border-slate-200 bg-white p-5 shadow-lg shadow-slate-200/50 lg:sticky lg:top-5"
            >
              <div className="text-lg font-black">
                {nakesForm.id
                  ? "Edit User NAKES"
                  : "Tambah User NAKES"}
              </div>

              <p className="mt-1 text-xs font-bold leading-5 text-slate-500">
                Login NAKES menggunakan username dan password.
              </p>

              <div className="mt-5 space-y-4">
                <label className="grid gap-2 text-sm font-black text-slate-700">
                  Nama Lengkap
                  <input
                    value={nakesForm.name}
                    onChange={(event) =>
                      setNakesForm((previous: any) => ({
                        ...previous,
                        name: event.target.value,
                      }))
                    }
                    className="h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold"
                  />
                </label>

                <label className="grid gap-2 text-sm font-black text-slate-700">
                  Username
                  <input
                    value={nakesForm.username}
                    onChange={(event) =>
                      setNakesForm((previous: any) => ({
                        ...previous,
                        username: event.target.value,
                      }))
                    }
                    className="h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold"
                    autoCapitalize="none"
                  />
                </label>

                <label className="grid gap-2 text-sm font-black text-slate-700">
                  {nakesForm.id
                    ? "Password Baru (opsional)"
                    : "Password"}
                  <input
                    type="password"
                    value={nakesForm.password}
                    onChange={(event) =>
                      setNakesForm((previous: any) => ({
                        ...previous,
                        password: event.target.value,
                      }))
                    }
                    className="h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold"
                  />
                </label>

                {nakesForm.id ? (
                  <label className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm font-black">
                    <span>Status aktif</span>
                    <input
                      type="checkbox"
                      checked={Boolean(nakesForm.is_active)}
                      onChange={(event) =>
                        setNakesForm((previous: any) => ({
                          ...previous,
                          is_active: event.target.checked ? 1 : 0,
                        }))
                      }
                      className="h-5 w-5 accent-teal-600"
                    />
                  </label>
                ) : null}
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3">
                {nakesForm.id ? (
                  <button
                    type="button"
                    onClick={() => setNakesForm(emptyNakes)}
                    className="h-12 rounded-2xl bg-slate-100 text-sm font-black text-slate-700"
                  >
                    Batal
                  </button>
                ) : (
                  <div />
                )}

                <button
                  type="submit"
                  disabled={saving}
                  className="h-12 rounded-2xl bg-slate-950 text-sm font-black text-white disabled:opacity-60"
                >
                  {saving
                    ? "Menyimpan..."
                    : nakesForm.id
                      ? "Simpan"
                      : "Tambah NAKES"}
                </button>
              </div>
            </form>
          )}

          <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-lg shadow-slate-200/50">
            {error ? (
              <div className="mb-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
                {error}
              </div>
            ) : null}

            {message ? (
              <div className="mb-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">
                {message}
              </div>
            ) : null}

            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-lg font-black">
                  Daftar User {isCoach ? "Coach" : "NAKES"}
                </div>
                <div className="mt-1 text-xs font-bold text-slate-500">
                  {isCoach
                    ? coachUsers.length
                    : nakesUsers.length}{" "}
                  user terdaftar
                </div>
              </div>

              <button
                type="button"
                onClick={() =>
                  isCoach
                    ? void loadCoaches()
                    : void loadNakes()
                }
                className="rounded-2xl bg-teal-50 px-4 py-2.5 text-xs font-black text-teal-700"
              >
                Refresh
              </button>
            </div>

            {loading ? (
              <div className="py-12 text-center text-sm font-black text-slate-500">
                Memuat User...
              </div>
            ) : isCoach ? (
              coachUsers.length ? (
                <div className="mt-5 grid gap-3">
                  {coachUsers.map((user) => (
                    <article
                      key={user.id}
                      className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                    >
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="truncate text-base font-black">
                              {user.name}
                            </div>
                            <span
                              className={`rounded-full px-2.5 py-1 text-[10px] font-black ${
                                isActive(user.is_active)
                                  ? "bg-emerald-100 text-emerald-700"
                                  : "bg-slate-200 text-slate-600"
                              }`}
                            >
                              {isActive(user.is_active)
                                ? "Aktif"
                                : "Nonaktif"}
                            </span>
                          </div>

                          <div className="mt-1 break-all text-sm font-bold text-slate-500">
                            {user.email}
                          </div>

                          <div className="mt-1 text-sm font-black text-teal-700">
                            {user.username
                              ? `@${user.username}`
                              : "Username belum diatur"}
                          </div>
                        </div>

                        <div className="flex shrink-0 gap-2">
                          <button
                            type="button"
                            onClick={() => editCoach(user)}
                            className="rounded-xl bg-blue-50 px-4 py-2.5 text-xs font-black text-blue-700"
                          >
                            Edit
                          </button>

                          {isActive(user.is_active) ? (
                            <button
                              type="button"
                              onClick={() =>
                                deactivateCoach(user)
                              }
                              className="rounded-xl bg-rose-50 px-4 py-2.5 text-xs font-black text-rose-700"
                            >
                              Nonaktifkan
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="mt-5 rounded-2xl border border-dashed border-slate-200 px-5 py-12 text-center text-sm font-bold text-slate-500">
                  Belum ada User Coach.
                </div>
              )
            ) : nakesUsers.length ? (
              <div className="mt-5 grid gap-3">
                {nakesUsers.map((user) => (
                  <article
                    key={user.id}
                    className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="truncate text-base font-black">
                            {user.name}
                          </div>
                          <span
                            className={`rounded-full px-2.5 py-1 text-[10px] font-black ${
                              isActive(user.is_active)
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-slate-200 text-slate-600"
                            }`}
                          >
                            {isActive(user.is_active)
                              ? "Aktif"
                              : "Nonaktif"}
                          </span>
                        </div>

                        <div className="mt-1 text-sm font-bold text-slate-500">
                          @{user.username}
                        </div>
                      </div>

                      <div className="flex shrink-0 gap-2">
                        <button
                          type="button"
                          onClick={() => editNakes(user)}
                          className="rounded-xl bg-blue-50 px-4 py-2.5 text-xs font-black text-blue-700"
                        >
                          Edit
                        </button>

                        <button
                          type="button"
                          onClick={() => removeNakes(user)}
                          className="rounded-xl bg-rose-50 px-4 py-2.5 text-xs font-black text-rose-700"
                        >
                          Hapus
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="mt-5 rounded-2xl border border-dashed border-slate-200 px-5 py-12 text-center text-sm font-bold text-slate-500">
                Belum ada User NAKES.
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
