"use client";

import { useEffect, useMemo, useState } from "react";

type EditRow = {
  id: string;
  name: string;
  nomcu: string;
  nik: string;
  gender: string;
  age: string;
  company: string;
  department: string;
  bb: string;
  tb: string;
  bmi: string;
  tensi: string;
  sgot: string;
  sgpt: string;
  conclusion: string;
  suggestion: string;
  fitStatus: string;
};

type EditResponse = {
  ok: boolean;
  message?: string;
  rows?: EditRow[];
};

const FIT_STATUS_OPTIONS = [
  "FIT",
  "FIT WITH NOTE",
  "TEMPORARY UNFIT",
  "UNFIT",
];

export default function AiMcuEditPage() {
  const [rows, setRows] = useState<EditRow[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [form, setForm] = useState<EditRow | null>(null);
  const [keyword, setKeyword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function loadRows() {
    setLoading(true);
    setMessage("");

    try {
      const res = await fetch("/api/ai-mcu/edit", {
        cache: "no-store",
      });

      const json: EditResponse = await res.json();

      if (!res.ok || !json.ok) {
        setMessage(json.message || "Gagal memuat data edit.");
        return;
      }

      const nextRows = json.rows || [];
      setRows(nextRows);

      if (nextRows.length && !selectedId) {
        setSelectedId(nextRows[0].id);
        setForm(nextRows[0]);
      }

      setMessage(json.message || "Data edit berhasil dimuat.");
    } catch (error: any) {
      setMessage(error?.message || "Gagal memuat data edit.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredRows = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    if (!q) return rows;

    return rows.filter((row) =>
      [row.name, row.nomcu, row.nik, row.company, row.department, row.fitStatus]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [rows, keyword]);

  function selectRow(row: EditRow) {
    setSelectedId(row.id);
    setForm({ ...row });
    setMessage("");
  }

  function updateField(key: keyof EditRow, value: string) {
    setForm((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        [key]: value,
      };
    });
  }

  async function saveEdit() {
    if (!form) {
      setMessage("Pilih peserta terlebih dahulu.");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const res = await fetch("/api/ai-mcu/edit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          row: form,
        }),
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        setMessage(json.message || "Gagal menyimpan edit.");
        return;
      }

      setRows((prev) =>
        prev.map((row) => (row.id === form.id ? { ...form } : row))
      );

      setMessage(json.message || "Edit berhasil disimpan sementara.");
    } catch (error: any) {
      setMessage(error?.message || "Gagal menyimpan edit.");
    } finally {
      setLoading(false);
    }
  }

  function cancelEdit() {
    const original = rows.find((row) => row.id === selectedId);
    if (original) {
      setForm({ ...original });
      setMessage("Perubahan dibatalkan.");
    }
  }

  return (
    <main className="p-6">
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Edit Data AI MCU</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              Halaman ini digunakan untuk memperbaiki data peserta, hasil
              parameter, kesimpulan, saran, dan status sebelum generate PDF.
              Tahap ini masih menggunakan sample data.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <a
              href="/ai-mcu/preview"
              className="rounded-xl border px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Preview
            </a>
            <a
              href="/ai-mcu"
              className="rounded-xl border px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Kembali
            </a>
          </div>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[360px_1fr]">
          <section className="rounded-2xl border bg-slate-50 p-5">
            <h2 className="text-lg font-bold">Daftar Peserta</h2>

            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              className="mt-4 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm"
              placeholder="Cari nama / No MCU / NIK..."
            />

            <button
              type="button"
              onClick={loadRows}
              disabled={loading}
              className="mt-3 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              {loading ? "Memuat..." : "Refresh Data"}
            </button>

            <div className="mt-4 max-h-[620px] space-y-2 overflow-y-auto pr-1">
              {filteredRows.map((row) => {
                const active = row.id === selectedId;

                return (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => selectRow(row)}
                    className={[
                      "w-full rounded-xl border p-3 text-left transition",
                      active
                        ? "border-blue-500 bg-blue-50"
                        : "border-slate-200 bg-white hover:bg-slate-50",
                    ].join(" ")}
                  >
                    <div className="font-bold text-slate-900">{row.name}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {row.nomcu} · {row.nik}
                    </div>
                    <div className="mt-2">
                      <span
                        className={[
                          "rounded-full px-2 py-1 text-xs font-bold",
                          row.fitStatus === "FIT"
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-amber-50 text-amber-700",
                        ].join(" ")}
                      >
                        {row.fitStatus}
                      </span>
                    </div>
                  </button>
                );
              })}

              {!filteredRows.length ? (
                <div className="rounded-xl border bg-white p-4 text-center text-sm text-slate-500">
                  Tidak ada peserta.
                </div>
              ) : null}
            </div>
          </section>

          <section className="rounded-2xl border bg-white p-5">
            <h2 className="text-lg font-bold">Form Edit</h2>

            {!form ? (
              <div className="mt-4 rounded-xl border bg-slate-50 p-5 text-sm text-slate-500">
                Pilih peserta terlebih dahulu.
              </div>
            ) : (
              <div className="mt-4 space-y-6">
                <div>
                  <h3 className="font-bold text-slate-900">Identitas Peserta</h3>

                  <div className="mt-3 grid gap-4 md:grid-cols-2">
                    <Field
                      label="Nama"
                      value={form.name}
                      onChange={(v) => updateField("name", v)}
                    />
                    <Field
                      label="No MCU"
                      value={form.nomcu}
                      onChange={(v) => updateField("nomcu", v)}
                    />
                    <Field
                      label="NIK / ID"
                      value={form.nik}
                      onChange={(v) => updateField("nik", v)}
                    />
                    <Field
                      label="Jenis Kelamin"
                      value={form.gender}
                      onChange={(v) => updateField("gender", v)}
                    />
                    <Field
                      label="Usia"
                      value={form.age}
                      onChange={(v) => updateField("age", v)}
                    />
                    <Field
                      label="Perusahaan"
                      value={form.company}
                      onChange={(v) => updateField("company", v)}
                    />
                    <Field
                      label="Departemen"
                      value={form.department}
                      onChange={(v) => updateField("department", v)}
                    />
                  </div>
                </div>

                <div>
                  <h3 className="font-bold text-slate-900">
                    Parameter Pemeriksaan
                  </h3>

                  <div className="mt-3 grid gap-4 md:grid-cols-3">
                    <Field
                      label="BB"
                      value={form.bb}
                      onChange={(v) => updateField("bb", v)}
                    />
                    <Field
                      label="TB"
                      value={form.tb}
                      onChange={(v) => updateField("tb", v)}
                    />
                    <Field
                      label="BMI"
                      value={form.bmi}
                      onChange={(v) => updateField("bmi", v)}
                    />
                    <Field
                      label="Tensi"
                      value={form.tensi}
                      onChange={(v) => updateField("tensi", v)}
                    />
                    <Field
                      label="SGOT"
                      value={form.sgot}
                      onChange={(v) => updateField("sgot", v)}
                    />
                    <Field
                      label="SGPT"
                      value={form.sgpt}
                      onChange={(v) => updateField("sgpt", v)}
                    />
                  </div>
                </div>

                <div>
                  <h3 className="font-bold text-slate-900">
                    Kesimpulan, Saran, Status
                  </h3>

                  <div className="mt-3 grid gap-4">
                    <TextAreaField
                      label="Kesimpulan"
                      value={form.conclusion}
                      onChange={(v) => updateField("conclusion", v)}
                    />

                    <TextAreaField
                      label="Saran"
                      value={form.suggestion}
                      onChange={(v) => updateField("suggestion", v)}
                    />

                    <div>
                      <label className="mb-2 block text-sm font-bold text-slate-700">
                        Fit Status
                      </label>
                      <select
                        value={form.fitStatus}
                        onChange={(e) =>
                          updateField("fitStatus", e.target.value)
                        }
                        className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm"
                      >
                        {FIT_STATUS_OPTIONS.map((item) => (
                          <option key={item} value={item}>
                            {item}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {message ? (
                  <div className="rounded-xl border bg-slate-50 p-4 text-sm font-semibold text-slate-700">
                    {message}
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={saveEdit}
                    disabled={loading}
                    className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60"
                  >
                    {loading ? "Menyimpan..." : "Simpan Edit"}
                  </button>

                  <button
                    type="button"
                    onClick={cancelEdit}
                    className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50"
                  >
                    Batalkan Perubahan
                  </button>

                  <a
                    href="/ai-mcu/generate"
                    className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-700"
                  >
                    Lanjut Generate PDF
                  </a>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-bold text-slate-700">
        {label}
      </label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm"
      />
    </div>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-bold text-slate-700">
        {label}
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-28 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm"
      />
    </div>
  );
}