"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import AuthGate from "@/components/AuthGate";
import QRCodeImage from "@/components/QRCodeImage";

type Participant = {
  id: number;
  name: string;
  mcu_id?: string;
  external_id?: string;
  nik?: string;
  employee_nik?: string;
  gender?: string;
  birth_date?: string;
  date_of_birth?: string;
  age?: number | string;
  examination_date?: string;
  exam_date?: string;
  department?: string;
  province?: string;
  phone?: string;
  source_id?: number;
  source_name?: string;
  package_id?: number;
  package_name?: string;
  company_name?: string;
  photo_data_url?: string;
  photo_url?: string;
  registrasi_ulang_done?: number | boolean;
  registrasi_ulang_at?: string;
  program_type?: string;
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(value?: string) {
  if (!value) return "-";
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
    const [y, m, d] = value.slice(0, 10).split("-");
    return `${d}-${m}-${y}`;
  }
  return value;
}

function calcAge(birthDate?: string) {
  if (!birthDate) return "";
  const date = new Date(birthDate);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  let age = now.getFullYear() - date.getFullYear();
  const mdiff = now.getMonth() - date.getMonth();
  if (mdiff < 0 || (mdiff === 0 && now.getDate() < date.getDate())) age -= 1;
  return age > 0 ? String(age) : "";
}

function getGenderShort(value?: string) {
  const text = String(value || "").toLowerCase();
  if (text.startsWith("l") || text.includes("male") || text.includes("pria")) return "L";
  if (text.startsWith("p") || text.includes("female") || text.includes("wanita")) return "P";
  return value ? value.slice(0, 1).toUpperCase() : "-";
}

async function resizeImageToDataUrl(file: File, maxWidth = 640, quality = 0.72): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = dataUrl;
  });

  const scale = Math.min(1, maxWidth / img.width);
  const width = Math.round(img.width * scale);
  const height = Math.round(img.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;

  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", quality);
}

export default function RegistrasiUlangPage() {
  return (
    <AuthGate>
      {(user) => <RegistrasiUlang user={user} />}
    </AuthGate>
  );
}

function RegistrasiUlang({ user }: { user: any }) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [program, setProgram] = useState(user.program_type === "all" ? "capaska" : user.program_type || "capaska");
  const [sources, setSources] = useState<any[]>([]);
  const [sourceId, setSourceId] = useState("all");
  const [keyword, setKeyword] = useState("");
  const [mcuDateSearch, setBirthDateSearch] = useState("");
  const [results, setResults] = useState<Participant[]>([]);
  const [selected, setSelected] = useState<Participant | null>(null);
  const [form, setForm] = useState<Participant | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [printReady, setPrintReady] = useState(false);

  const canUse = user.role === "admin";
  const photoPreview = form?.photo_data_url || form?.photo_url || "";

  useEffect(() => {
    fetch(`/api/sources?program=${program}`)
      .then((r) => r.json())
      .then((d) => setSources(d.sources || []));
  }, [program]);

  const ageValue = useMemo(() => {
    return form?.age ? String(form.age) : calcAge(form?.birth_date || form?.date_of_birth);
  }, [form?.age, form?.birth_date, form?.date_of_birth]);

  if (!canUse) {
    return <div className="card p-5 text-red-700">Hanya admin yang dapat mengakses Registrasi Ulang.</div>;
  }

  async function search(e?: React.FormEvent) {
    e?.preventDefault();
    setLoading(true);
    setMessage("Retrieve data peserta...");
    setSelected(null);
    setForm(null);
    setPrintReady(false);

    try {
      const params = new URLSearchParams({
        program,
        source_id: sourceId,
        keyword: keyword.trim(),
        exam_date: mcuDateSearch,
        limit: "25"
      });

      const res = await fetch(`/api/registrasi-ulang/search?${params.toString()}`, { cache: "no-store" });
      const json = await res.json();

      if (!json.ok) {
        setResults([]);
        setMessage(json.message || "Gagal retrieve data.");
        return;
      }

      setResults(json.participants || []);
      setMessage(json.participants?.length ? `Ditemukan ${json.participants.length} peserta.` : "Peserta tidak ditemukan.");
    } catch (err: any) {
      setResults([]);
      setMessage(err?.message || "Gagal retrieve data.");
    } finally {
      setLoading(false);
    }
  }

  async function loadDetail(participant: Participant) {
    setSelected(participant);
    setMessage("Memuat detail peserta...");
    setPrintReady(false);

    try {
      const res = await fetch(`/api/registrasi-ulang/participant?id=${participant.id}`, { cache: "no-store" });
      const json = await res.json();

      if (!json.ok) {
        setMessage(json.message || "Gagal memuat detail peserta.");
        return;
      }

      const p = json.participant || participant;
      setForm({
        ...p,
        examination_date: p.examination_date || p.exam_date || todayISO(),
        birth_date: p.birth_date || p.date_of_birth || ""
      });
      setMessage("Data peserta siap diedit.");
    } catch (err: any) {
      setMessage(err?.message || "Gagal memuat detail.");
    }
  }

  function updateField(field: keyof Participant, value: any) {
    setForm((prev) => {
      if (!prev) return prev;
      const next = { ...prev, [field]: value };
      if (field === "birth_date" || field === "date_of_birth") {
        next.age = calcAge(value);
      }
      return next;
    });
    setPrintReady(false);
  }

  async function handlePhoto(file?: File) {
    if (!file) return;

    try {
      setMessage("Memproses foto...");
      const dataUrl = await resizeImageToDataUrl(file);
      updateField("photo_data_url", dataUrl);
      setMessage("Foto berhasil dimuat. Klik Save untuk menyimpan.");
    } catch {
      setMessage("Gagal memproses foto.");
    }
  }

  async function save() {
    if (!form) return;

    setSaving(true);
    setMessage("Menyimpan registrasi ulang...");

    try {
      const payload = {
        id: form.id,
        name: form.name,
        mcu_id: form.mcu_id,
        external_id: form.external_id,
        nik: form.nik,
        employee_nik: form.employee_nik,
        gender: form.gender,
        birth_date: form.birth_date || form.date_of_birth || null,
        date_of_birth: form.birth_date || form.date_of_birth || null,
        age: ageValue ? Number(ageValue) : null,
        examination_date: form.examination_date || form.exam_date || todayISO(),
        exam_date: form.examination_date || form.exam_date || todayISO(),
        department: form.department,
        province: form.province,
        phone: form.phone,
        photo_data_url: form.photo_data_url || "",
        program_type: form.program_type || program
      };

      const res = await fetch("/api/registrasi-ulang/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const json = await res.json();

      if (!json.ok) {
        setMessage(json.message || "Gagal menyimpan registrasi ulang.");
        return;
      }

      setForm(json.participant || form);
      setSelected(json.participant || form);
      setPrintReady(true);
      setMessage("Registrasi ulang berhasil disimpan. Silakan print barcode/label.");
    } catch (err: any) {
      setMessage(err?.message || "Gagal menyimpan.");
    } finally {
      setSaving(false);
    }
  }

  function printBarcode() {
    setPrintReady(true);
    setTimeout(() => window.print(), 300);
  }

  return (
    <div className="space-y-5">
      <style jsx global>{`
        @page {
          size: 50mm 30mm;
          margin: 0;
        }

        @media print {
          html,
          body {
            width: 50mm;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
            color: black !important;
          }

          header,
          nav,
          .no-print {
            display: none !important;
          }

          main {
            max-width: none !important;
            padding: 0 !important;
            margin: 0 !important;
          }

          .print-only {
            display: block !important;
          }

          .label-page {
            width: 50mm !important;
            height: 30mm !important;
            page-break-after: always;
            break-after: page;
            box-sizing: border-box;
            overflow: hidden;
            margin: 0 !important;
            background: white !important;
            color: black !important;
          }
        }
      `}</style>

      <section className="card p-5 no-print">
        <div className="text-2xl font-black">Registrasi Ulang</div>
        <div className="mt-1 text-sm text-slate-500">
          Stage tambahan untuk retrieve data peserta, edit identitas, ambil/upload foto, save, lalu print barcode.
        </div>
        <div className="mt-2 w-fit rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
          Registrasi Ulang v26 · Tanggal MCU · retrieve data · foto · edit data
        </div>
      </section>

      <section className="card p-5 no-print">
        <form onSubmit={search} className="grid items-end gap-3 md:grid-cols-2 xl:grid-cols-[180px_1fr_1fr_1fr_auto]">
          <div>
            <label className="label">Program</label>
            <select className="input" value={program} onChange={(e) => setProgram(e.target.value)}>
              <option value="capaska">CAPASKA</option>
              <option value="corporate">Corporate</option>
              <option value="all">Semua Program</option>
            </select>
          </div>

          <div>
            <label className="label">Database / Instansi</label>
            <select className="input" value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
              <option value="all">Semua Database</option>
              {sources.map((s) => (
                <option key={s.id} value={s.id}>{s.name} - {s.institution_name || s.company_name || "-"}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Cari Peserta</label>
            <input
              className="input"
              placeholder="Nama / No MCU / NIK"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
          </div>

          <div>
            <label className="label">Tanggal MCU</label>
            <input
              className="input"
              type="date"
              value={mcuDateSearch}
              onChange={(e) => setBirthDateSearch(e.target.value)}
              title="Tanggal MCU / Tanggal Pemeriksaan"
            />
          </div>

          <button className="btn-primary" disabled={loading}>
            {loading ? "Retrieve..." : "Retrieve Data"}
          </button>
        </form>

        {message && (
          <div className="mt-4 rounded-xl bg-blue-50 p-3 text-sm font-semibold text-blue-700">
            {message}
          </div>
        )}
      </section>

      {!!results.length && (
        <section className="card p-4 no-print">
          <div className="mb-3 font-black">Hasil Retrieve Data</div>
          <div className="grid gap-2">
            {results.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => loadDetail(p)}
                className="rounded-xl border border-slate-200 bg-white p-3 text-left hover:bg-blue-50"
              >
                <div className="font-black">{p.name}</div>
                <div className="text-sm text-slate-500">
                  {p.mcu_id || p.external_id || "-"} · NIK {p.employee_nik || p.nik || "-"} · MCU {formatDate(p.examination_date || p.exam_date)} · Lahir {formatDate(p.birth_date || p.date_of_birth)} · {p.source_name || "-"}
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {form && (
        <section className="card p-5 no-print">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xl font-black">Edit Data Registrasi Ulang</div>
              <div className="text-sm text-slate-500">
                Update data identitas peserta dan foto onsite.
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-secondary" onClick={() => fileRef.current?.click()}>
                Ambil / Upload Foto
              </button>
              <button type="button" className="btn-primary" disabled={saving} onClick={save}>
                {saving ? "Menyimpan..." : "Save"}
              </button>
              <button type="button" className="btn-secondary" disabled={!printReady} onClick={printBarcode}>
                Print Barcode
              </button>
            </div>
          </div>

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              handlePhoto(e.target.files?.[0]);
              e.currentTarget.value = "";
            }}
          />

          <div className="grid gap-5 lg:grid-cols-[220px_1fr]">
            <div className="space-y-3">
              <div className="aspect-[3/4] overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
                {photoPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photoPreview} alt="Foto peserta" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center p-4 text-center text-sm font-semibold text-slate-500">
                    Belum ada foto
                  </div>
                )}
              </div>
              <button type="button" className="w-full rounded-xl border border-slate-300 px-4 py-2 font-bold" onClick={() => fileRef.current?.click()}>
                Ambil Foto
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="label">Nama Lengkap</label>
                <input className="input" value={form.name || ""} onChange={(e) => updateField("name", e.target.value)} />
              </div>

              <div>
                <label className="label">Nomor MCU</label>
                <input className="input" value={form.mcu_id || ""} onChange={(e) => updateField("mcu_id", e.target.value)} />
              </div>

              <div>
                <label className="label">NIK Karyawan</label>
                <input className="input" value={form.employee_nik || ""} onChange={(e) => updateField("employee_nik", e.target.value)} />
              </div>

              <div>
                <label className="label">NIK / Identitas</label>
                <input className="input" value={form.nik || ""} onChange={(e) => updateField("nik", e.target.value)} />
              </div>

              <div>
                <label className="label">Jenis Kelamin</label>
                <select className="input" value={form.gender || ""} onChange={(e) => updateField("gender", e.target.value)}>
                  <option value="">-</option>
                  <option value="Laki-laki">Laki-laki</option>
                  <option value="Perempuan">Perempuan</option>
                </select>
              </div>

              <div>
                <label className="label">Tanggal Lahir</label>
                <input className="input" type="date" value={(form.birth_date || form.date_of_birth || "").slice(0, 10)} onChange={(e) => updateField("birth_date", e.target.value)} />
              </div>

              <div>
                <label className="label">Usia</label>
                <input className="input" value={ageValue || ""} onChange={(e) => updateField("age", e.target.value)} />
              </div>

              <div>
                <label className="label">Tanggal Pemeriksaan</label>
                <input className="input" type="date" value={(form.examination_date || form.exam_date || todayISO()).slice(0, 10)} onChange={(e) => updateField("examination_date", e.target.value)} />
              </div>

              <div>
                <label className="label">Department Karyawan <span className="text-xs text-slate-400">(opsional)</span></label>
                <input className="input" value={form.department || ""} onChange={(e) => updateField("department", e.target.value)} />
              </div>

              <div>
                <label className="label">Provinsi / Lokasi</label>
                <input className="input" value={form.province || ""} onChange={(e) => updateField("province", e.target.value)} />
              </div>
            </div>
          </div>
        </section>
      )}

      {form && printReady && (
        <section className="print-only hidden">
          <RegistrationLabel participant={form} />
        </section>
      )}
    </div>
  );
}

function RegistrationLabel({ participant }: { participant: Participant }) {
  const idText = participant.mcu_id || participant.external_id || String(participant.id);
  const birthText = formatDate(participant.birth_date || participant.date_of_birth);
  const age = participant.age || calcAge(participant.birth_date || participant.date_of_birth) || "-";
  const examDate = formatDate(participant.examination_date || participant.exam_date || todayISO());

  return (
    <div
      className="label-page bg-white text-black"
      style={{
        width: "50mm",
        height: "30mm",
        padding: "1.8mm",
        boxSizing: "border-box",
        border: "0.25mm solid #111",
        overflow: "hidden",
        fontFamily: "Arial, Helvetica, sans-serif"
      }}
    >
      <div className="grid h-full" style={{ gridTemplateRows: "5mm 1fr", gap: "1mm" }}>
        <div className="flex items-center justify-between border-b border-black pb-[0.5mm] text-[8px] font-black">
          <div>REGISTRASI ULANG</div>
          <div>{getGenderShort(participant.gender)} / {age} &nbsp; {examDate}</div>
        </div>

        <div className="grid min-h-0 grid-cols-[1fr_13mm] gap-[1mm]">
          <div className="min-w-0 text-[8px] leading-tight">
            <div className="truncate text-[10px] font-black uppercase">{participant.name || "-"}</div>
            <div className="mt-[0.8mm] grid grid-cols-[13mm_1fr] gap-x-1">
              <div className="font-bold">No. MCU</div>
              <div className="truncate font-black">: {idText}</div>
              <div className="font-bold">NIK Kary</div>
              <div className="truncate">: {participant.employee_nik || "-"}</div>
              <div className="font-bold">NIK</div>
              <div className="truncate">: {participant.nik || "-"}</div>
              <div className="font-bold">Tgl Lahir</div>
              <div className="truncate">: {birthText}</div>
              <div className="font-bold">Dept</div>
              <div className="truncate">: {participant.department || "-"}</div>
            </div>
            <div className="mt-[1mm] truncate font-mono text-[7px] font-black tracking-[0.12em]">
              ||||| {idText} |||||
            </div>
          </div>

          <div className="flex items-start justify-end">
            <QRCodeImage value={idText} size={44} />
          </div>
        </div>
      </div>
    </div>
  );
}
