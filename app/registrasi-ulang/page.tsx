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


type StationPrintOption = {
  key: string;
  label: string;
  shortCode: string;
  defaultCopies: number;
};

type PrintJob = {
  station: StationPrintOption;
  copyIndex: number;
};

const STATION_PRINT_OPTIONS: StationPrintOption[] = [
  { key: "registrasi_ulang", label: "REGISTRASI ULANG", shortCode: "REG", defaultCopies: 1 },
  { key: "pemeriksaan_fisik", label: "PEMERIKSAAN FISIK", shortCode: "FISIK", defaultCopies: 0 },
  { key: "darah", label: "DARAH", shortCode: "DRH", defaultCopies: 0 },
  { key: "urine", label: "URINE", shortCode: "URN", defaultCopies: 0 },
  { key: "dokter", label: "DOKTER", shortCode: "DOK", defaultCopies: 0 },
  { key: "rontgen", label: "RONTGEN", shortCode: "RO", defaultCopies: 0 },
  { key: "ekg_hasil", label: "EKG - HASIL", shortCode: "EKG", defaultCopies: 0 },
  { key: "ekg_nakes", label: "EKG - NAKES", shortCode: "EKG", defaultCopies: 0 },
  { key: "audio", label: "AUDIO", shortCode: "AUD", defaultCopies: 0 },
  { key: "mata", label: "MATA", shortCode: "MATA", defaultCopies: 0 },
  { key: "tht", label: "THT", shortCode: "THT", defaultCopies: 0 },
  { key: "gigi", label: "GIGI", shortCode: "GIGI", defaultCopies: 0 },
  { key: "penyakit_dalam", label: "PENYAKIT DALAM", shortCode: "PD", defaultCopies: 0 },
  { key: "jantung", label: "JANTUNG", shortCode: "JTG", defaultCopies: 0 },
  { key: "radiologi", label: "RADIOLOGI", shortCode: "RAD", defaultCopies: 0 },
  { key: "ortopedi", label: "ORTOPEDI", shortCode: "ORT", defaultCopies: 0 }
];

function createDefaultStationCopies() {
  return Object.fromEntries(
    STATION_PRINT_OPTIONS.map((station) => [station.key, station.defaultCopies])
  ) as Record<string, number>;
}

function createRecommendedStationCopies() {
  return Object.fromEntries(
    STATION_PRINT_OPTIONS.map((station) => {
      if (station.key === "ekg_hasil" || station.key === "ekg_nakes") return [station.key, 1];
      return [station.key, 1];
    })
  ) as Record<string, number>;
}

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


function safeText(value: any, fallback = "-") {
  const text = String(value ?? "").trim();
  return text || fallback;
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


function LiveCameraModal({
  open,
  onClose,
  onCapture
}: {
  open: boolean;
  onClose: () => void;
  onCapture: (dataUrl: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState("");

  async function stopCamera() {
    try {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    } catch {}

    streamRef.current = null;

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }

  async function startCamera() {
    try {
      setStatus("Membuka kamera...");
      await stopCamera();

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "user" },
          width: { ideal: 1280 },
          height: { ideal: 960 }
        }
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute("playsinline", "true");
        await videoRef.current.play();
      }

      setStatus("Kamera aktif. Posisikan wajah peserta lalu klik Ambil Foto.");
    } catch {
      setStatus("Kamera tidak bisa dibuka. Izinkan permission kamera, atau gunakan Upload dari Galeri.");
    }
  }

  async function capture() {
    const video = videoRef.current;
    if (!video) return;

    const width = video.videoWidth || 640;
    const height = video.videoHeight || 480;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, width, height);

    const dataUrl = canvas.toDataURL("image/jpeg", 0.78);
    onCapture(dataUrl);
    await stopCamera();
    onClose();
  }

  useEffect(() => {
    if (!open) return;

    startCamera();

    return () => {
      stopCamera();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-4 md:items-center">
      <div className="w-full max-w-lg rounded-3xl border border-slate-700 bg-slate-950 p-4 text-white shadow-2xl">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <div className="text-lg font-black">Kamera Registrasi Ulang</div>
            <div className="text-xs text-slate-400">Ambil foto peserta langsung dari kamera.</div>
          </div>

          <button
            type="button"
            onClick={async () => {
              await stopCamera();
              onClose();
            }}
            className="rounded-xl bg-slate-800 px-3 py-2 font-bold"
          >
            Tutup
          </button>
        </div>

        <div className="overflow-hidden rounded-2xl bg-black">
          <video ref={videoRef} className="h-96 w-full object-cover" playsInline muted autoPlay />
        </div>

        <div className="mt-3 rounded-xl bg-slate-900 p-3 text-sm text-slate-200">
          {status}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" className="rounded-xl bg-slate-800 px-3 py-3 font-black" onClick={startCamera}>
            Restart Kamera
          </button>
          <button type="button" className="btn-primary" onClick={capture}>
            Ambil Foto
          </button>
        </div>
      </div>
    </div>
  );
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
  const [results, setResults] = useState<Participant[]>([]);
  const [selected, setSelected] = useState<Participant | null>(null);
  const [form, setForm] = useState<Participant | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [printReady, setPrintReady] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [stationCopies, setStationCopies] = useState<Record<string, number>>(() => createDefaultStationCopies());
  const [labelFontSize, setLabelFontSize] = useState(9);
  const [showLabelBorder, setShowLabelBorder] = useState(false);
  const [showLabelQr, setShowLabelQr] = useState(true);
  const [showLabelBarcodeText, setShowLabelBarcodeText] = useState(false);
  const [labelStylePackage, setLabelStylePackage] = useState({
    font_size: 9,
    show_border: 0,
    show_qr: 1,
    show_footer_text: 1
  });

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


  const printJobs = useMemo<PrintJob[]>(() => {
    if (!form) return [];

    const jobs: PrintJob[] = [];

    STATION_PRINT_OPTIONS.forEach((station) => {
      const count = Math.max(0, Math.min(20, Number(stationCopies[station.key] || 0)));

      for (let i = 0; i < count; i += 1) {
        jobs.push({ station, copyIndex: i + 1 });
      }
    });

    return jobs;
  }, [form, stationCopies]);

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
      const nextParticipant = {
        ...p,
        examination_date: p.examination_date || p.exam_date || todayISO(),
        birth_date: p.birth_date || p.date_of_birth || ""
      };

      setForm(nextParticipant);
      setResults([]);
      setKeyword(nextParticipant.name || "");
      await loadPackageLabelSettings(nextParticipant.package_id, nextParticipant.program_type || program);
      setMessage("Data peserta dipilih. Hasil retrieve ditutup otomatis. Silakan lengkapi registrasi ulang lalu klik Save.");
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


  async function loadPackageLabelSettings(packageId?: number | null, programType?: string) {
    if (!packageId) {
      setStationCopies(createDefaultStationCopies());
      return;
    }

    try {
      const params = new URLSearchParams({
        package_id: String(packageId),
        program: programType || program
      });

      const res = await fetch(`/api/package-label-settings?${params.toString()}`, { cache: "no-store" });
      const json = await res.json();

      if (!json.ok || !json.settings?.length) {
        setStationCopies(createDefaultStationCopies());
        return;
      }

      const next = createDefaultStationCopies();

      json.settings.forEach((setting: any) => {
        if (setting.station_key in next) {
          next[setting.station_key] = Math.max(0, Math.min(20, Number(setting.default_copies || 0)));
        }
      });

      setStationCopies(next);

      const style = json.label_style || json.settings?.[0] || {};
      const nextFont = Math.max(7, Math.min(14, Number(style.font_size || 9)));
      const nextBorder = Number(style.show_border || 0) === 1;
      const nextQr = Number(style.show_qr ?? 1) === 1;
      const nextFooter = Number(style.show_footer_text ?? 1) === 1;

      setLabelStylePackage({
        font_size: nextFont,
        show_border: nextBorder ? 1 : 0,
        show_qr: nextQr ? 1 : 0,
        show_footer_text: nextFooter ? 1 : 0
      });

      setLabelFontSize(nextFont);
      setShowLabelBorder(nextBorder);
      setShowLabelQr(nextQr);
      setShowLabelBarcodeText(nextFooter);
    } catch {
      setStationCopies(createDefaultStationCopies());
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


  function setStationCopy(stationKey: string, value: number) {
    const safeValue = Math.max(0, Math.min(20, Number(value || 0)));

    setStationCopies((prev) => ({
      ...prev,
      [stationKey]: safeValue
    }));

    setPrintReady(false);
  }

  function setAllStationCopies(value: number) {
    const safeValue = Math.max(0, Math.min(20, Number(value || 0)));
    const next = Object.fromEntries(
      STATION_PRINT_OPTIONS.map((station) => [station.key, safeValue])
    ) as Record<string, number>;

    setStationCopies(next);
    setPrintReady(false);
  }

  function setEkgTwoCopies() {
    setStationCopies((prev) => ({
      ...prev,
      ekg_hasil: 1,
      ekg_nakes: 1
    }));
    setPrintReady(false);
  }

  function resetStationCopies() {
    setStationCopies(createDefaultStationCopies());
    setPrintReady(false);
  }

  return (
    <div className="space-y-5">
      <LiveCameraModal
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={(dataUrl) => {
          updateField("photo_data_url", dataUrl);
          setMessage("Foto berhasil diambil. Klik Save untuk menyimpan.");
        }}
      />

      <style jsx global>{`
        @page {
          size: 40mm 30mm;
          margin: 0;
        }

        @media print {
          html,
          body {
            width: 40mm;
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
            width: 40mm !important;
            height: 30mm !important;
            page-break-after: always;
            break-after: page;
            box-sizing: border-box;
            overflow: hidden;
            margin: 0 !important;
            background: white !important;
            color: black !important;
            border-radius: 0 !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          .label-page * {
            box-sizing: border-box;
          }
        }
      `}</style>

      <section className="card p-5 no-print">
        <div className="text-2xl font-black">Registrasi Ulang</div>
        <div className="mt-1 text-sm text-slate-500">
          Stage tambahan untuk retrieve data peserta, edit identitas, ambil/upload foto, save, lalu print barcode.
        </div>
        <div className="mt-2 w-fit rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
          Registrasi Ulang v39 · stiker final 40x30
        </div>
      </section>

      <section className="card p-5 no-print">
        <form onSubmit={search} className="grid items-end gap-3 md:grid-cols-2 xl:grid-cols-[180px_1fr_1fr_auto]">
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
              <button type="button" className="btn-secondary" onClick={() => setCameraOpen(true)}>
                Aktifkan Kamera
              </button>
              <button type="button" className="btn-secondary" onClick={() => fileRef.current?.click()}>
                Upload dari Galeri
              </button>
              <button type="button" className="btn-primary" disabled={saving} onClick={save}>
                {saving ? "Menyimpan..." : "Save"}
              </button>
              <button type="button" className="btn-secondary" disabled={!printReady || !printJobs.length} onClick={printBarcode}>
                Print Barcode ({printJobs.length})
              </button>
            </div>
          </div>

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
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
              <button type="button" className="w-full rounded-xl border border-slate-300 px-4 py-2 font-bold" onClick={() => setCameraOpen(true)}>
                Aktifkan Kamera
              </button>
              <button type="button" className="w-full rounded-xl border border-slate-300 px-4 py-2 font-bold" onClick={() => fileRef.current?.click()}>
                Upload dari Galeri
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


      {form && (
        <section className="card p-5 no-print">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xl font-black">Setting Print Barcode / Label Station</div>
              <div className="text-sm text-slate-500">
                Setting stiker final 40x30 mengikuti Setup Label Paket. Default disarankan: font 9, border off, QR kecil on, No MCU footer on.
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-secondary" onClick={() => setAllStationCopies(1)}>
                Semua 1x
              </button>
              <button type="button" className="btn-secondary" onClick={setEkgTwoCopies}>
                EKG 2 Label
              </button>
              <button type="button" className="btn-secondary" onClick={resetStationCopies}>
                Reset
              </button>
            </div>
          </div>

          <div className="mb-5 grid gap-3 md:grid-cols-4">
            <div>
              <label className="label">Ukuran Font Label</label>
              <input
                type="number"
                min={7}
                max={12}
                className="input"
                value={labelFontSize}
                onChange={(e) => setLabelFontSize(Number(e.target.value || 8))}
              />
            </div>

            <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-3 text-sm font-semibold">
              <input
                type="checkbox"
                checked={showLabelBorder}
                onChange={(e) => setShowLabelBorder(e.target.checked)}
              />
              Border Label
            </label>

            <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-3 text-sm font-semibold">
              <input
                type="checkbox"
                checked={showLabelQr}
                onChange={(e) => setShowLabelQr(e.target.checked)}
              />
              QR Kecil
            </label>

            <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-3 text-sm font-semibold">
              <input
                type="checkbox"
                checked={showLabelBarcodeText}
                onChange={(e) => setShowLabelBarcodeText(e.target.checked)}
              />
              No MCU Footer
            </label>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {STATION_PRINT_OPTIONS.map((station) => (
              <div key={station.key} className="rounded-2xl border border-slate-200 bg-white p-3">
                <label className="mb-2 block text-sm font-black text-slate-800">{station.label}</label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="rounded-xl border border-slate-300 px-3 py-2 font-black"
                    onClick={() => setStationCopy(station.key, Number(stationCopies[station.key] || 0) - 1)}
                  >
                    -
                  </button>

                  <input
                    type="number"
                    min={0}
                    max={20}
                    className="input text-center"
                    value={stationCopies[station.key] ?? 0}
                    onChange={(e) => setStationCopy(station.key, Number(e.target.value || 0))}
                  />

                  <button
                    type="button"
                    className="rounded-xl border border-slate-300 px-3 py-2 font-black"
                    onClick={() => setStationCopy(station.key, Number(stationCopies[station.key] || 0) + 1)}
                  >
                    +
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-xl bg-blue-50 p-3 text-sm font-bold text-blue-700">
            Total label yang akan dicetak: {printJobs.length}. Default font/border/QR diambil dari Setup Label Paket.
          </div>
        </section>
      )}

      {form && printReady && (
        <section className="print-only hidden">
          {printJobs.map((job) => (
            <StationPrintLabel
              key={`${job.station.key}-${job.copyIndex}`}
              participant={form}
              station={job.station}
              fontSize={labelFontSize}
              showBorder={showLabelBorder}
              showQr={showLabelQr}
              showBarcodeText={showLabelBarcodeText}
            />
          ))}
        </section>
      )}
    </div>
  );
}



function StationPrintLabel({
  participant,
  station,
  fontSize,
  showBorder,
  showQr,
  showBarcodeText
}: {
  participant: Participant;
  station: StationPrintOption;
  fontSize: number;
  showBorder: boolean;
  showQr: boolean;
  showBarcodeText: boolean;
}) {
  const idText = safeText(participant.mcu_id || participant.external_id || String(participant.id));
  const nameText = safeText(participant.name);
  const nikKaryawanText = safeText(participant.employee_nik || participant.nik);
  const genderText = getGenderShort(participant.gender);
  const birthText = formatDate(participant.birth_date || participant.date_of_birth);
  const ageText = participant.age || calcAge(participant.birth_date || participant.date_of_birth) || "-";
  const examDate = formatDate(participant.examination_date || participant.exam_date || todayISO());
  const departmentText = safeText(participant.department, "");
  const packageText = safeText(participant.package_name || participant.company_name || participant.source_name || "MCU");

  const shortStation =
    station.label === "PENYAKIT DALAM"
      ? "P. DALAM"
      : station.label === "PEMERIKSAAN FISIK"
        ? "FISIK"
        : station.label.replace(" - ", " ");

  const metaFont = Math.max(fontSize - 2, 7);
  const headerFont = Math.max(fontSize - 2, 7);
  const nameFont = Math.max(fontSize + 1, 10);
  const footerFont = Math.max(fontSize - 2, 7);

  return (
    <div
      className="label-page bg-white text-black"
      style={{
        width: "40mm",
        height: "30mm",
        padding: "0.7mm 0.8mm 0.6mm 0.8mm",
        boxSizing: "border-box",
        border: showBorder ? "0.18mm solid #111" : "none",
        overflow: "hidden",
        fontFamily: "Arial, Helvetica, sans-serif",
        WebkitPrintColorAdjust: "exact",
        printColorAdjust: "exact"
      }}
    >
      <div
        className="grid h-full w-full"
        style={{
          gridTemplateRows: "3.6mm 4.3mm 1fr 3.5mm",
          rowGap: "0.25mm"
        }}
      >
        <div
          className="grid items-center"
          style={{
            gridTemplateColumns: "1fr auto auto",
            columnGap: "1mm",
            fontSize: `${headerFont}px`,
            lineHeight: 1,
            whiteSpace: "nowrap",
            overflow: "hidden"
          }}
        >
          <div className="truncate font-black tracking-wide">{shortStation}</div>
          <div className="font-black">{genderText} / {ageText}</div>
          <div className="font-black">{examDate}</div>
        </div>

        <div
          className="truncate font-black uppercase"
          style={{
            fontSize: `${nameFont}px`,
            lineHeight: 1,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis"
          }}
        >
          {nameText}
        </div>

        <div
          className="grid min-h-0"
          style={{
            gridTemplateColumns: showQr ? "1fr 9.6mm" : "1fr",
            columnGap: "0.8mm"
          }}
        >
          <div
            className="grid min-w-0"
            style={{
              gridTemplateRows: "repeat(5, 1fr)",
              rowGap: "0.1mm",
              fontSize: `${metaFont}px`,
              lineHeight: 1,
              overflow: "hidden"
            }}
          >
            {[
              ["No MCU", idText],
              ["NIK K", nikKaryawanText],
              ["Lahir", birthText],
              ["Paket", packageText],
              ["Dept", departmentText || "-"]
            ].map(([label, value]) => (
              <div
                key={label}
                className="grid min-w-0 items-center"
                style={{
                  gridTemplateColumns: "7.6mm 1mm 1fr",
                  columnGap: "0.3mm",
                  whiteSpace: "nowrap",
                  overflow: "hidden"
                }}
              >
                <div className="truncate font-bold">{label}</div>
                <div className="font-bold">:</div>
                <div className="truncate font-bold">{value}</div>
              </div>
            ))}
          </div>

          {showQr && (
            <div className="flex items-start justify-end overflow-hidden">
              <QRCodeImage value={idText} size={34} />
            </div>
          )}
        </div>

        <div
          className="grid min-w-0 items-end"
          style={{
            gridTemplateColumns: "1fr auto",
            columnGap: "1mm",
            fontSize: `${footerFont}px`,
            lineHeight: 1,
            whiteSpace: "nowrap",
            overflow: "hidden"
          }}
        >
          <div
            className="truncate font-mono font-black tracking-[0.06em]"
            style={{ visibility: showBarcodeText ? "visible" : "hidden" }}
          >
            {idText}
          </div>

          <div
            className="font-black"
            style={{
              fontSize: `${Math.max(fontSize + 2, 11)}px`,
              lineHeight: 1
            }}
          >
            {station.shortCode}
          </div>
        </div>
      </div>
    </div>
  );
}
