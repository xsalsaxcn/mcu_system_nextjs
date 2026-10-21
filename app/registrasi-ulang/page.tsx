"use client";

// MCU_CORPORATE_VACCINATION_STRUCTURE_V452

// MCU_STICKER_LAYOUT_ROLLBACK_ONLY_V450

// MCU_REG_AUTOLOCK_QUEUE_STICKER_V449

// MCU_REG_UI_COMPACT_V436
// MCU_REG_ONSPOT_SESSION_V440
// MCU_REG_LIST_QUEUE_LABEL_V447

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
  company_id?: number;
  company_name?: string;
  photo_data_url?: string;
  photo_url?: string;
  registrasi_ulang_done?: number | boolean;
  registrasi_ulang_at?: string;
  session_registered?: boolean;
  session_registered_at?: string | null;
  queue_session_id?: number;
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

function apiStationsToOptions(rows: any[]): StationPrintOption[] {
  return (rows || [])
    .map((row: any) => ({
      key: String(row.station_key || row.key || ""),
      label: String(row.station_label || row.label || "").trim(),
      shortCode: String(row.short_code || row.shortCode || ""),
      defaultCopies: Math.max(0, Math.min(20, Number(row.default_copies ?? row.defaultCopies ?? 1)))
    }))
    .filter((station: StationPrintOption) => station.key && station.label);
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
  const [mcuSessionOptions, setMcuSessionOptions] = useState<{
    companies: any[];
    packages: any[];
    queue_sessions: any[];
    session: any | null;
  }>({
    companies: [],
    packages: [],
    queue_sessions: [],
    session: null,
  });
  const [sourceId, setSourceId] = useState("all");
  const [sessionLocked, setSessionLocked] = useState(false);
  const autoRetrieveKeyRef = useRef("");
  const restoredLockRef = useRef(false);
  const [keyword, setKeyword] = useState("");
  const [resultFilter, setResultFilter] = useState("");
  const [results, setResults] = useState<Participant[]>([]);
  const [selected, setSelected] = useState<Participant | null>(null);
  const [form, setForm] = useState<Participant | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState("");
  const [printReady, setPrintReady] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [stationCopies, setStationCopies] = useState<Record<string, number>>(() => createDefaultStationCopies());
  const [packageStationOptions, setPackageStationOptions] = useState<StationPrintOption[]>(STATION_PRINT_OPTIONS);
  const [labelFontSize, setLabelFontSize] = useState(9);
  const [showLabelBorder, setShowLabelBorder] = useState(false);
  const [showLabelQr, setShowLabelQr] = useState(true);
  const [showLabelBarcodeText, setShowLabelBarcodeText] = useState(false);
  const [queueInfo, setQueueInfo] = useState<any | null>(null);
  const [labelStylePackage, setLabelStylePackage] = useState({
    font_size: 9,
    show_border: 0,
    show_qr: 1,
    show_footer_text: 1
  });

  const canUse = user.role === "admin";
  const photoPreview = form?.photo_data_url || form?.photo_url || "";

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/sources?program=${program}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setSources(d.sources || []);
      })
      .catch(() => {
        if (!cancelled) setSources([]);
      });

    if (program === "corporate") {
      fetch("/api/mcu/session", { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => {
          if (!cancelled && d?.ok) {
            setMcuSessionOptions({
              companies: d.companies || [],
              packages: d.packages || [],
              queue_sessions: d.queue_sessions || [],
              session: d.session || null,
            });
          }
        })
        .catch(() => {
          if (!cancelled)
            setMcuSessionOptions({
              companies: [],
              packages: [],
              queue_sessions: [],
              session: null,
            });
        });
    } else {
      setMcuSessionOptions({
        companies: [],
        packages: [],
        queue_sessions: [],
        session: null,
      });
      if (String(sourceId).startsWith("session:") || String(sourceId).startsWith("mcu-session:")) setSourceId("all");
    }

    return () => { cancelled = true; };
  }, [program]);

  const sessionSourceOptions = useMemo(() => {
    const companiesById = new Map<number, any>(
      (mcuSessionOptions.companies || []).map((company: any) => [
        Number(company.id),
        company,
      ]),
    );
    const packagesById = new Map<number, any>(
      (mcuSessionOptions.packages || []).map((pkg: any) => [
        Number(pkg.id),
        pkg,
      ]),
    );

    return (mcuSessionOptions.queue_sessions || [])
      .filter((row: any) => Number(row.is_active || 0) === 1)
      .map((row: any) => {
        const company = companiesById.get(Number(row.company_id));
        const pkg = packagesById.get(Number(row.package_id));
        return {
          value: `mcu-session:${Number(row.id)}`,
          queue_session_id: Number(row.id),
          company_id: Number(row.company_id),
          company_name: String(row.company_name || company?.name || ""),
          package_id: Number(row.package_id),
          package_name: String(row.package_name || pkg?.name || ""),
          session_name: String(row.session_name || ""),
          location: String(row.location || "").trim() || "Legacy / belum diatur",
          session_date: String(row.session_date || "").trim(),
          track_a_name: String(row.track_a_name || "Lab Darah"),
          track_b_name: String(row.track_b_name || "Rontgen"),
        };
      })
      .sort((a: any, b: any) => {
        const ak = `${a.company_name} ${a.session_date || "9999"} ${a.location}`;
        const bk = `${b.company_name} ${b.session_date || "9999"} ${b.location}`;
        return ak.localeCompare(bk);
      });
  }, [mcuSessionOptions]);

  function sessionDateLabel(value?: string) {
    if (!value) return "Tanggal belum diatur";
    try {
      return new Intl.DateTimeFormat("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(new Date(`${value}T00:00:00`));
    } catch {
      return value;
    }
  }


  useEffect(() => {
    if (program !== "corporate" || typeof window === "undefined") return;

    if (!restoredLockRef.current) {
      restoredLockRef.current = true;
      const locked = window.localStorage.getItem("mcu_reg_session_locked") === "1";
      const lockedSource = String(window.localStorage.getItem("mcu_reg_locked_source") || "").trim();
      if (locked && lockedSource) {
        if (lockedSource.startsWith("mcu-session:")) {
          setSourceId(lockedSource);
          setSessionLocked(true);
          return;
        }
        window.localStorage.removeItem("mcu_reg_session_locked");
        window.localStorage.removeItem("mcu_reg_locked_source");
      }
    }

    if (sessionLocked || sourceId !== "all") return;
    const active = mcuSessionOptions.session;
    const preferred =
      sessionSourceOptions.find(
        (item: any) =>
          Number(item.company_id) === Number(active?.company_id || 0) &&
          Number(item.package_id) === Number(active?.package_id || 0),
      ) || sessionSourceOptions[0];
    if (preferred?.value) setSourceId(preferred.value);
  }, [program, sessionLocked, sourceId, mcuSessionOptions.session, sessionSourceOptions]);

  function toggleRegistrationSessionLock() {
    if (program !== "corporate") {
      setMessage("Kunci Session hanya digunakan untuk MCU Corporate.");
      return;
    }
    if (sessionLocked) {
      if (typeof window !== "undefined") {
        window.localStorage.removeItem("mcu_reg_session_locked");
        window.localStorage.removeItem("mcu_reg_locked_source");
      }
      setSessionLocked(false);
      setMessage("Session Registrasi dibuka. Lokasi/tanggal MCU dapat dipilih kembali.");
      return;
    }
    if (!sourceId || sourceId === "all" || !String(sourceId).startsWith("mcu-session:")) {
      setMessage("Pilih Session MCU lokasi/tanggal terlebih dahulu, lalu klik Kunci Session.");
      return;
    }
    if (typeof window !== "undefined") {
      window.localStorage.setItem("mcu_reg_session_locked", "1");
      window.localStorage.setItem("mcu_reg_locked_source", sourceId);
    }
    setSessionLocked(true);
    setMessage("Session Registrasi dikunci di browser ini.");
  }

  function getSelectedSessionContext() {
    return (
      sessionSourceOptions.find((item: any) => item.value === sourceId) || null
    );
  }


  const ageValue = useMemo(() => {
    return form?.age ? String(form.age) : calcAge(form?.birth_date || form?.date_of_birth);
  }, [form?.age, form?.birth_date, form?.date_of_birth]);

  const filteredResults = useMemo(() => {
    const q = resultFilter.trim().toLowerCase();
    if (!q) return results;
    return results.filter((p) =>
      [p.name, p.mcu_id, p.external_id, p.employee_nik, p.nik, p.source_name, p.company_name, p.package_name]
        .some((value) => String(value || "").toLowerCase().includes(q))
    );
  }, [results, resultFilter]);

  function isRegisteredForSelectedSession(participant?: Participant | null) {
    if (!participant) return false;
    if (program === "corporate" && getSelectedSessionContext()?.queue_session_id) {
      return Boolean(participant.session_registered);
    }
    return Boolean(participant.registrasi_ulang_done);
  }

  async function loadQueueInfo(
    participantId?: number,
    queueSessionId?: number,
  ) {
    const id = Number(participantId || 0);
    const context = getSelectedSessionContext();
    const sessionId = Number(queueSessionId || context?.queue_session_id || 0);
    if (!id || program !== "corporate" || !sessionId) {
      setQueueInfo(null);
      return null;
    }
    try {
      const params = new URLSearchParams({
        participant_id: String(id),
        queue_session_id: String(sessionId),
      });
      const res = await fetch(
        `/api/mcu/queue/participant?${params.toString()}`,
        { cache: "no-store" },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        setQueueInfo(null);
        return null;
      }
      const entry = json?.queue_entry || json?.entry || null;
      const session = json?.queue_session || null;
      const aSequence = Number(entry?.a_queue_sequence || json?.a_queue_sequence || 0);
      const bSequence = Number(entry?.b_queue_sequence || json?.b_queue_sequence || 0);
      const merged = {
        ...(entry || {}),
        a_queue_number:
          entry?.a_queue_number || json?.a_queue_number || json?.queueA ||
          (aSequence > 0 ? `A-${String(aSequence).padStart(3, "0")}` : null),
        b_queue_number:
          entry?.b_queue_number || json?.b_queue_number || json?.queueB ||
          (bSequence > 0 ? `B-${String(bSequence).padStart(3, "0")}` : null),
        a_queue_sequence: aSequence || null,
        b_queue_sequence: bSequence || null,
        queue_label:
          json?.queue_label ||
          [entry?.a_queue_number || json?.a_queue_number || json?.queueA,
           entry?.b_queue_number || json?.b_queue_number || json?.queueB]
            .filter(Boolean).join(" / ") || null,
        track_a_name: session?.track_a_name || json?.track_a_name || "Lab Darah",
        track_b_name: session?.track_b_name || json?.track_b_name || "Rontgen",
      };
      setQueueInfo(merged);
      return merged;
    } catch {
      setQueueInfo(null);
      return null;
    }
  }

  // MCU_QUEUE_BINDING_PRINT100_V456
  useEffect(() => {
    const participantId = Number(form?.id || selected?.id || 0);
    if (program !== "corporate" || !participantId) {
      setQueueInfo(null);
      return;
    }
    void loadQueueInfo(participantId);
  }, [form?.id, selected?.id, program, sourceId]);



  const activeStationPrintOptions = useMemo<StationPrintOption[]>(() => {
    return packageStationOptions;
  }, [packageStationOptions]);

  const printJobs = useMemo<PrintJob[]>(() => {
    if (!form) return [];

    const jobs: PrintJob[] = [];

    activeStationPrintOptions.forEach((station) => {
      const count = Math.max(0, Math.min(20, Number(stationCopies[station.key] || 0)));

      for (let i = 0; i < count; i += 1) {
        jobs.push({ station, copyIndex: i + 1 });
      }
    });

    return jobs;
  }, [form, stationCopies, activeStationPrintOptions]);

  useEffect(() => {
    if (!canUse || program !== "corporate") return;
    if (!sourceId || sourceId === "all") {
      setResults([]);
      autoRetrieveKeyRef.current = "";
      return;
    }
    const key = `${program}|${sourceId}`;
    if (autoRetrieveKeyRef.current === key) return;
    autoRetrieveKeyRef.current = key;
    const timer = window.setTimeout(() => {
      void search();
    }, 180);
    return () => window.clearTimeout(timer);
  }, [program, sourceId, canUse]);

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

  async function startOnSpotRegistration() {
    const context = getSelectedSessionContext();
    if (!context) {
      setMessage("Pilih instansi dari bagian Session MCU terlebih dahulu untuk Registrasi On The Spot.");
      return;
    }

    const draft: Participant = {
      id: 0,
      name: "",
      mcu_id: "",
      external_id: "",
      nik: "",
      employee_nik: "",
      gender: "",
      birth_date: "",
      date_of_birth: "",
      age: "",
      examination_date: todayISO(),
      exam_date: todayISO(),
      department: "",
      province: "",
      phone: "",
      company_id: context.company_id,
      company_name: context.company_name,
      package_id: context.package_id,
      package_name: context.package_name,
      source_name: `Session MCU · ${context.location} · ${sessionDateLabel(context.session_date)}`,
      program_type: "corporate",
      registrasi_ulang_done: false
    };

    setSelected(null);
    setKeyword("");
    setQueueInfo(null);
    setForm(draft);
    setPrintReady(false);
    await loadPackageLabelSettings(context.package_id, "corporate");
    setMessage(`Registrasi On The Spot · ${context.company_name} · ${context.location} · ${sessionDateLabel(context.session_date)}. Isi data peserta lalu klik Simpan Data.`);
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
        session_registered: participant.session_registered,
        session_registered_at: participant.session_registered_at,
        queue_session_id: participant.queue_session_id,
        examination_date: p.examination_date || p.exam_date || todayISO(),
        birth_date: p.birth_date || p.date_of_birth || ""
      };

      setForm(nextParticipant);
      await Promise.all([
        loadPackageLabelSettings(nextParticipant.package_id, nextParticipant.program_type || program),
        loadQueueInfo(nextParticipant.id),
      ]);
      setMessage("Data peserta dipilih. Daftar peserta tetap tersedia di sebelah kiri. Silakan lengkapi registrasi ulang lalu klik Save.");
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
      setPackageStationOptions(STATION_PRINT_OPTIONS);
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

      const apiStations = programType === "corporate" && Array.isArray(json.available_stations)
        ? apiStationsToOptions(json.available_stations)
        : STATION_PRINT_OPTIONS;
      const nextStations = apiStations.length ? apiStations : STATION_PRINT_OPTIONS;

      setPackageStationOptions(nextStations);

      if (!json.ok || !json.settings?.length) {
        setStationCopies(
          Object.fromEntries(nextStations.map((station) => [station.key, station.defaultCopies])) as Record<string, number>
        );
        return;
      }

      const next = Object.fromEntries(
        nextStations.map((station) => [station.key, station.defaultCopies])
      ) as Record<string, number>;

      json.settings.forEach((setting: any) => {
        if (setting.station_key in next) {
          next[setting.station_key] = Math.max(0, Math.min(20, Number(setting.default_copies ?? 0)));
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
      setPackageStationOptions(STATION_PRINT_OPTIONS);
      setStationCopies(createDefaultStationCopies());
    }
  }

  async function save() {
    if (!form) return;
    if (!String(form.name || "").trim()) {
      setMessage("Nama Lengkap wajib diisi.");
      return;
    }

    const selectedSessionContext =
      program === "corporate" ? getSelectedSessionContext() : null;

    if (program === "corporate" && !selectedSessionContext?.queue_session_id) {
      setMessage("Pilih Session MCU lokasi/tanggal terlebih dahulu. Registrasi Ulang Corporate tidak boleh disimpan tanpa Session.");
      return;
    }

    if (!form.id && (!form.company_id || !form.package_id)) {
      setMessage("Registrasi On The Spot harus memiliki perusahaan dan paket dari Session MCU.");
      return;
    }

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
        source_id: form.source_id || null,
        company_id: form.company_id || null,
        package_id: form.package_id || null,
        photo_data_url: form.photo_data_url || "",
        program_type: form.program_type || program,
        queue_session_id:
          program === "corporate"
            ? Number(selectedSessionContext?.queue_session_id || 0)
            : null,
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

      const savedParticipant = {
        ...form,
        ...(json.participant || {}),
        session_registered:
          program === "corporate" ? true : form.session_registered,
        session_registered_at:
          json.registration_binding?.registered_at ||
          form.session_registered_at ||
          null,
        queue_session_id:
          Number(json.queue_session?.id || 0) || form.queue_session_id,
      };
      setForm(savedParticipant);
      setSelected(savedParticipant);
      setResults((prev) => {
        const next = prev.filter((item) => Number(item.id) !== Number(savedParticipant.id));
        return [savedParticipant, ...next];
      });
      await loadQueueInfo(
        savedParticipant.id,
        Number(selectedSessionContext?.queue_session_id || 0),
      );
      setPrintReady(true);
      setMessage(
        json.message ||
          "Registrasi ulang berhasil disimpan ke Session MCU dan nomor antrean dirilis. Silakan print barcode/label.",
      );
    } catch (err: any) {
      setMessage(err?.message || "Gagal menyimpan.");
    } finally {
      setSaving(false);
    }
  }


  /* DELETE_SELECTED_PARTICIPANT_V271
     Admin-only UI action. No data changes happen automatically; deletion only runs
     after the admin clicks Hapus Peserta and confirms by typing HAPUS.
  */
  async function deleteSelectedParticipantV271() {
    if (!form?.id) return;

    const label = String(form.name || form.mcu_id || form.external_id || form.id || 'Peserta');
    const okFirst = window.confirm('Hapus peserta "' + label + '"? Tindakan ini akan menghapus data peserta terpilih dan hasil pemeriksaannya.');
    if (!okFirst) return;

    const typed = window.prompt('Ketik HAPUS untuk konfirmasi penghapusan peserta terpilih.');
    if (typed !== 'HAPUS') {
      setMessage('Hapus peserta dibatalkan. Konfirmasi tidak sesuai.');
      return;
    }

    setDeleting(true);
    setMessage('Menghapus peserta terpilih...');

    try {
      const res = await fetch('/api/registrasi-ulang/participant?id=' + encodeURIComponent(String(form.id)), {
        method: 'DELETE',
        cache: 'no-store'
      });
      const json = await res.json().catch(() => ({}));

      if (!res.ok || !json.ok) {
        setMessage(json.message || 'Gagal menghapus peserta.');
        return;
      }

      const deletedId = Number(form.id);
      setForm(null);
      setSelected(null);
      setResults((prev) => prev.filter((item) => Number(item.id) !== deletedId));
      setQueueInfo(null);
      setPrintReady(false);
      setMessage(json.message || 'Peserta berhasil dihapus.');
    } catch (err: any) {
      setMessage(err?.message || 'Gagal menghapus peserta.');
    } finally {
      setDeleting(false);
    }
  }

  async function printBarcode() {
    // MCU_QUEUE_BINDING_AUTHORITATIVE_V457
    if (program === "corporate" && Number(form?.id || 0)) {
      await loadQueueInfo(Number(form?.id));
      // Give React one render frame so StationPrintLabel receives the fresh queue state.
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
    setPrintReady(true);
    setTimeout(() => window.print(), 350);
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
      activeStationPrintOptions.map((station) => [station.key, safeValue])
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
    setStationCopies(
      Object.fromEntries(activeStationPrintOptions.map((station) => [station.key, station.defaultCopies])) as Record<string, number>
    );
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

          /* MCU_PRINT_WRAPPER_100_PERCENT_V459
             Outer wrapper only. Inner sticker layout intentionally untouched. */
          .print-only {
            display: block !important;
            width: 40mm !important;
            margin: 0 !important;
            padding: 0 !important;
            position: static !important;
          }

          .label-page {
            width: 40mm !important;
            height: 30mm !important;
            page-break-after: always;
            break-after: page;
            page-break-inside: avoid;
            break-inside: avoid-page;
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

          .print-only > .label-page:last-child {
            page-break-after: auto !important;
            break-after: auto !important;
          }
        }
      `}</style>

      <section className="card overflow-hidden p-0 no-print">
        <div className="flex items-center gap-4 p-5 md:p-6">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-2xl">📋</div>
          <div>
            <div className="text-2xl font-black text-slate-900">Registrasi Ulang</div>
            <div className="mt-1 text-sm text-slate-500">
              Pilih perusahaan/session untuk memuat peserta otomatis, edit identitas, simpan registrasi, lalu cetak barcode.
            </div>
          </div>
        </div>
      </section>

      <section className="card p-5 no-print">
        <form onSubmit={search} className="grid items-end gap-3 md:grid-cols-2 xl:grid-cols-[170px_minmax(320px,1.35fr)_auto_minmax(260px,1fr)_auto_auto]">
          <div>
            <label className="label">Program</label>
            <select className="input" value={program} disabled={sessionLocked} onChange={(e) => { autoRetrieveKeyRef.current = ""; setProgram(e.target.value); }}>
              <option value="capaska">CAPASKA</option>
              <option value="corporate">Corporate</option>
              <option value="all">Semua Program</option>
            </select>
          </div>

          <div>
            <label className="label">Database / Session Lokasi</label>
            <select className="input" value={sourceId} disabled={sessionLocked} onChange={(e) => { autoRetrieveKeyRef.current = ""; setSourceId(e.target.value); }}>
              <option value="all">Semua Database</option>
              {!!sources.length && (
                <optgroup label="Database Existing">
                  {sources.map((s) => (
                    <option key={`source-${s.id}`} value={String(s.id)}>{s.name} - {s.institution_name || s.company_name || "-"}</option>
                  ))}
                </optgroup>
              )}
              {program === "corporate" && !!sessionSourceOptions.length && (
                <optgroup label="Session MCU · Lokasi / Tanggal">
                  {sessionSourceOptions.map((item: any) => (
                    <option key={item.value} value={item.value}>
                      {item.company_name} · {item.location} · {sessionDateLabel(item.session_date)} · {item.package_name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>

          <button
            type="button"
            className={`btn-secondary whitespace-nowrap ${sessionLocked ? "border-emerald-300 bg-emerald-50 text-emerald-700" : ""}`}
            onClick={toggleRegistrationSessionLock}
          >
            {sessionLocked ? "🔒 Session Terkunci" : "🔓 Kunci Session"}
          </button>

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
            {loading ? "Memuat..." : "Refresh Data"}
          </button>

          {program === "corporate" && (
            <button type="button" className="btn-secondary whitespace-nowrap" onClick={startOnSpotRegistration}>
              + On The Spot
            </button>
          )}
        </form>

        {program === "corporate" && getSelectedSessionContext() ? (
          <div className="mt-4 grid gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm sm:grid-cols-4">
            <div><div className="text-xs font-black uppercase text-emerald-700">Perusahaan</div><div className="mt-1 font-black text-slate-900">{getSelectedSessionContext()?.company_name}</div></div>
            <div><div className="text-xs font-black uppercase text-emerald-700">Lokasi</div><div className="mt-1 font-black text-slate-900">{getSelectedSessionContext()?.location}</div></div>
            <div><div className="text-xs font-black uppercase text-emerald-700">Tanggal</div><div className="mt-1 font-black text-slate-900">{sessionDateLabel(getSelectedSessionContext()?.session_date)}</div></div>
            <div><div className="text-xs font-black uppercase text-emerald-700">Paket</div><div className="mt-1 font-black text-slate-900">{getSelectedSessionContext()?.package_name}</div></div>
          </div>
        ) : null}

        {message && (
          <div className="mt-4 rounded-xl bg-blue-50 p-3 text-sm font-semibold text-blue-700">
            {message}
          </div>
        )}
      </section>

      {true && (
        <section className="grid items-start gap-4 no-print xl:grid-cols-[390px_minmax(0,1fr)]">
          <aside className="card flex min-h-[690px] min-w-0 flex-col p-4 xl:sticky xl:top-4 xl:self-start">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-lg font-black text-slate-900">Hasil Retrieve Data</div>
                <div className="text-xs font-semibold text-slate-500">{results.length} peserta ditemukan</div>
              </div>
              <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">{results.length} peserta</span>
            </div>

            <div className="relative mt-3">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">⌕</span>
              <input
                className="input pl-9"
                placeholder="Cari nama, NIK, atau No MCU..."
                value={resultFilter}
                onChange={(e) => setResultFilter(e.target.value)}
              />
            </div>

            <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
              {!filteredResults.length && (
                <div className="flex min-h-[500px] items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-6 text-center">
                  <div>
                    <div className="text-base font-black text-slate-700">Belum ada data peserta</div>
                    <div className="mt-1 text-xs font-semibold leading-5 text-slate-400">Pilih perusahaan/session di atas untuk memuat data otomatis, atau gunakan + On The Spot untuk peserta tambahan.</div>
                  </div>
                </div>
              )}
              {filteredResults.map((p) => {
                  const active = selected?.id === p.id;
                  const registered = isRegisteredForSelectedSession(p);
                  const initials = String(p.name || "?")
                    .split(/\s+/)
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((part) => part.slice(0, 1).toUpperCase())
                    .join("") || "?";

                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => loadDetail(p)}
                      className={`w-full rounded-2xl border p-3 text-left transition ${
                        active
                          ? "border-blue-400 bg-blue-50 shadow-sm"
                          : "border-slate-200 bg-white hover:border-blue-200 hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-black ${active ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"}`}>
                          {initials}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-black text-slate-900">{p.name}</div>
                          <div className="mt-0.5 truncate text-xs font-semibold text-slate-500">
                            NIK {p.employee_nik || p.nik || "-"} · MCU {p.mcu_id || p.external_id || "-"}
                          </div>
                          <div className="mt-1 truncate text-[11px] text-slate-400">{p.source_name || "-"}</div>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <span className={`rounded-full px-2 py-1 text-[10px] font-black ${registered ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700"}`}>
                            {registered ? "Sudah Registrasi" : "Belum Registrasi"}
                          </span>
                          <span className="text-lg text-slate-400">›</span>
                        </div>
                      </div>
                    </button>
                  );
                })}
            </div>
          </aside>

          <div className="min-w-0">
            {form ? (
              <section className="card p-5">
                <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-xl font-black text-slate-900">Detail Peserta</div>
                      <span className={`rounded-full px-3 py-1 text-xs font-black ${form.id ? (isRegisteredForSelectedSession(form) ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700") : "bg-amber-100 text-amber-800"}`}>
                        {form.id ? (isRegisteredForSelectedSession(form) ? "Sudah Registrasi Session Ini" : "Belum Registrasi Session Ini") : "On The Spot"}
                      </span>
                    </div>
                    <div className="mt-1 text-sm text-slate-500">{form.id ? "Edit identitas peserta dan foto onsite tanpa meninggalkan daftar peserta." : "Peserta tambahan / dadakan. Nomor MCU akan dibuat otomatis jika dikosongkan."}</div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="btn-secondary" onClick={() => setCameraOpen(true)}>Kamera</button>
                    <button type="button" className="btn-secondary" onClick={() => fileRef.current?.click()}>Upload Foto</button>
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

                <div className="grid gap-5 lg:grid-cols-[170px_minmax(0,1fr)]">
                  <div className="space-y-3">
                    <div className="aspect-[3/4] overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
                      {photoPreview ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={photoPreview} alt="Foto peserta" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center p-4 text-center text-sm font-semibold text-slate-500">Belum ada foto</div>
                      )}
                    </div>
                    <div className="rounded-xl bg-slate-50 px-3 py-2 text-center text-xs font-semibold text-slate-500">
                      {form.mcu_id || form.external_id || "No MCU belum tersedia"}
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    <div className="md:col-span-2">
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
                    <div>
                      <label className="label">No HP / WhatsApp <span className="text-xs text-slate-400">(opsional)</span></label>
                      <input className="input" value={form.phone || ""} onChange={(e) => updateField("phone", e.target.value)} placeholder="08xxxxxxxxxx" />
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 md:col-span-2">
                      <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Instansi / Perusahaan</div>
                      <div className="mt-1 truncate font-black text-slate-700">{form.company_name || form.source_name || "-"}</div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                      <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Paket Pemeriksaan</div>
                      <div className="mt-1 truncate font-black text-slate-700">{form.package_name || "-"}</div>
                    </div>
                    {queueInfo?.a_queue_number || queueInfo?.b_queue_number ? (
                      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 md:col-span-2 xl:col-span-3">
                        <div className="text-xs font-bold uppercase tracking-wide text-emerald-600">Nomor Antrian Dirilis</div>
                        <div className="mt-1 font-black text-emerald-800">
                          {queueInfo?.a_queue_number ? `${queueInfo.track_a_name || "Antrian A"}: ${queueInfo.a_queue_number}` : ""}
                          {queueInfo?.a_queue_number && queueInfo?.b_queue_number ? " · " : ""}
                          {queueInfo?.b_queue_number ? `${queueInfo.track_b_name || "Antrian B"}: ${queueInfo.b_queue_number}` : ""}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <button
                    type="button"
                    className="rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-black text-red-700 hover:bg-red-50 disabled:opacity-50"
                    disabled={saving || deleting || !form?.id}
                    onClick={deleteSelectedParticipantV271}
                  >
                    {deleting ? "Menghapus..." : "Hapus Peserta"}
                  </button>

                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="btn-primary" disabled={saving} onClick={save}>
                      {saving ? "Menyimpan..." : "Simpan Data"}
                    </button>
                    <button type="button" className="btn-secondary" disabled={!printReady || !printJobs.length} onClick={printBarcode}>
                      Print Barcode ({printJobs.length})
                    </button>
                  </div>
                </div>
              </section>
            ) : (
              <section className="card flex min-h-[690px] items-center justify-center p-8 text-center">
                <div className="max-w-md">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-2xl">👤</div>
                  <div className="mt-4 text-xl font-black text-slate-800">Belum ada peserta dipilih</div>
                  <div className="mt-2 text-sm font-semibold leading-6 text-slate-500">Pilih peserta dari daftar di kiri, lakukan Retrieve Data, atau klik + On The Spot untuk registrasi peserta tambahan.</div>
                </div>
              </section>
            )}
          </div>
        </section>
      )}

      {form && (
        <section className="card p-5 no-print">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xl font-black">Setting Print Barcode / Label Station</div>
              <div className="text-sm text-slate-500">
                Jumlah print dan style label otomatis mengikuti Setup Label Paket. Pengaturan di bawah bisa override sementara sebelum print.
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
              Tampilkan NIK Karyawan Footer
            </label>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {activeStationPrintOptions.map((station) => (
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
              form={form}
              station={job.station}
              fontSize={labelFontSize}
              showBorder={showLabelBorder}
              showQr={showLabelQr}
              showBarcodeText={showLabelBarcodeText}
              queueInfo={queueInfo}
            />
          ))}
        </section>
      )}
    </div>
  );
}



function StationPrintLabel({
  station,
  form,
  fontSize,
  showBorder,
  showQr,
  showBarcodeText,
  queueInfo
}: {
  station: StationPrintOption;
  form: any;
  fontSize: number;
  showBorder: boolean;
  showQr: boolean;
  showBarcodeText: boolean;
  queueInfo?: any;
}) {
  const legacyMcuId = String(form?.mcu_id || form?.external_id || form?.nomor_mcu || form?.id || "").trim();
  const employeeNik = String(form?.employee_nik || form?.nik || "").trim();
  const nameText = String(form?.name || form?.nama || form?.full_name || "-").trim().toUpperCase();
  const isCorporate = String(form?.program_type || "").toLowerCase() === "corporate" || Number(form?.company_id || 0) > 0;
  const institution = String(
    isCorporate
      ? (form?.company_name || form?.institution_name || form?.company || form?.source_name || "-")
      : (form?.company_name || form?.institution_name || form?.company || "BPIP / CAPASKA")
  ).trim();
  const birthDate = String(form?.date_of_birth || form?.birth_date || form?.tanggal_lahir || form?.dob || "").trim();
  const provinceText = String(form?.province || form?.provinsi || form?.location || form?.lokasi || "").trim();
  const stationText =
    station.label === "PENYAKIT DALAM"
      ? "PENYAKIT DALAM"
      : station.label === "PEMERIKSAAN FISIK"
        ? "FISIK"
        : station.label.replace(" - ", " ");

  const safeFont = Number(fontSize || 10);
  const nameFont =
    nameText.length > 34 ? Math.max(12, safeFont + 2) :
    nameText.length > 24 ? Math.max(14, safeFont + 4) :
    Math.max(16, safeFont + 6);

  const queueASequence = Number(queueInfo?.a_queue_sequence || form?.a_queue_sequence || 0);
  const queueBSequence = Number(queueInfo?.b_queue_sequence || form?.b_queue_sequence || 0);
  const queueA = String(
    queueInfo?.a_queue_number || queueInfo?.queue_a_number || queueInfo?.queueA ||
    form?.a_queue_number || form?.queue_a_number || form?.queueA ||
    (queueASequence > 0 ? `A-${String(queueASequence).padStart(3, "0")}` : "")
  ).trim();
  const queueB = String(
    queueInfo?.b_queue_number || queueInfo?.queue_b_number || queueInfo?.queueB ||
    form?.b_queue_number || form?.queue_b_number || form?.queueB ||
    (queueBSequence > 0 ? `B-${String(queueBSequence).padStart(3, "0")}` : "")
  ).trim();
  const combinedQueueLabel = String(
    queueInfo?.queue_label || queueInfo?.queue_number ||
    form?.queue_label || form?.queue_number || form?.nomor_antrian || ""
  ).trim();
  const stageUpper = `${station.key} ${stationText}`.toUpperCase();
  const isLabStage = /(DARAH|LAB|HBSAG|ANTI[ _-]?HBS|HIV|HEMATO|URIC|GLUCO|CHOLESTEROL)/.test(stageUpper);
  const isRadiologyStage = /(RONTGEN|RADIOLOGI|THORAX|XRAY|X-RAY)/.test(stageUpper);
  const queueText =
    isLabStage ? (queueA || combinedQueueLabel) :
    isRadiologyStage ? (queueB || combinedQueueLabel) :
    ([queueA, queueB].filter(Boolean).join(" / ") || combinedQueueLabel);

  const qrPx = 54;
  const qrValue = employeeNik || legacyMcuId || nameText;

  if (isCorporate) {
    const queueDisplay = queueText || "-";
    const queueFont = queueDisplay.length > 11 ? Math.max(7, safeFont - 2) : queueDisplay.length > 8 ? Math.max(8, safeFont - 1) : Math.max(13, safeFont + 4);
    const stageFont = stationText.length > 18 ? Math.max(6, safeFont - 3) : stationText.length > 12 ? Math.max(7, safeFont - 2) : Math.max(8, safeFont - 1);
    const participantFont = nameText.length > 32 ? Math.max(9, safeFont) : nameText.length > 22 ? Math.max(10, safeFont + 1) : nameText.length > 16 ? Math.max(11, safeFont + 2) : Math.max(12, safeFont + 3);

    return (
      <section
      className="label-page bg-white text-black"
      style={{
        position: "relative",
        overflow: "hidden",
        border: showBorder ? "1px solid #d4d4d8" : undefined,
        borderRadius: showBorder ? "18px" : undefined,
        WebkitPrintColorAdjust: "exact",
        printColorAdjust: "exact"
      }}
    >
        {/* MCU_CORPORATE_VACCINATION_STRUCTURE_V455
            Reference only: Vaccination ticket-head / queue-number / divider / participant/detail-grid.
            Physical MCU canvas, @page, QR size, and Vaccination source are untouched. */}
        <div
          style={{
            width: "100%",
            height: "100%",
            boxSizing: "border-box",
            padding: "3px 6px 2px",
            display: "grid",
            gridTemplateRows: "34px 1px minmax(0, 1fr)",
            rowGap: "2px",
            overflow: "hidden",
            background: "#ffffff",
            color: "#000000"
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 60%) minmax(0, 40%)",
              columnGap: "6px",
              alignItems: "start",
              minWidth: 0,
              overflow: "hidden"
            }}
          >
            <div
              style={{
                minWidth: 0,
                fontSize: `${participantFont}px`,
                lineHeight: 0.92,
                fontWeight: 900,
                letterSpacing: "-0.015em",
                whiteSpace: "normal",
                overflowWrap: "normal",
                wordBreak: "normal",
                maxHeight: "1.9em",
                overflow: "hidden"
              }}
            >
              {nameText || "-"}
            </div>

            <div
              style={{
                minWidth: 0,
                textAlign: "right",
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-end",
                overflow: "hidden"
              }}
            >
              <div
                style={{
                  fontSize: `${Math.max(5, safeFont - 4)}px`,
                  lineHeight: 1,
                  fontWeight: 900,
                  letterSpacing: "0.02em",
                  whiteSpace: "nowrap"
                }}
              >
                NOMOR ANTRIAN
              </div>
              <div
                style={{
                  marginTop: "1px",
                  width: "100%",
                  fontSize: `${queueFont}px`,
                  lineHeight: 0.9,
                  fontWeight: 900,
                  letterSpacing: "-0.035em",
                  whiteSpace: "nowrap",
                  overflow: "visible",
                  textOverflow: "clip"
                }}
              >
                {queueDisplay}
              </div>
              <div
                style={{
                  marginTop: "2px",
                  width: "100%",
                  fontSize: `${stageFont}px`,
                  lineHeight: 0.95,
                  fontWeight: 900,
                  whiteSpace: "normal",
                  wordBreak: "normal",
                  overflowWrap: "normal",
                  display: "-webkit-box",
                  WebkitBoxOrient: "vertical",
                  WebkitLineClamp: 2,
                  overflow: "hidden"
                }}
              >
                {stationText}
              </div>
            </div>
          </div>

          <div style={{ width: "100%", height: "1px", background: "#111111" }} />

          <div
            style={{
              minHeight: 0,
              display: "grid",
              gridTemplateColumns: showQr ? "minmax(0, 1fr) 54px" : "minmax(0, 1fr)",
              columnGap: "7px",
              overflow: "hidden",
              alignItems: "start"
            }}
          >
            <div
              style={{
                minWidth: 0,
                minHeight: 0,
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
                paddingTop: "1px"
              }}
            >
              <div style={{ fontSize: `${Math.max(6, safeFont - 3)}px`, lineHeight: 1, fontWeight: 900 }}>
                NIK KARYAWAN
              </div>
              <div
                style={{
                  marginTop: "1px",
                  fontSize: `${Math.max(9, safeFont)}px`,
                  lineHeight: 1,
                  fontWeight: 900,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis"
                }}
              >
                {employeeNik || "-"}
              </div>

              <div
                style={{
                  marginTop: "5px",
                  fontSize: `${Math.max(7, safeFont - 2)}px`,
                  lineHeight: 0.98,
                  fontWeight: 900,
                  whiteSpace: "normal",
                  wordBreak: "normal",
                  overflowWrap: "normal",
                  display: "-webkit-box",
                  WebkitBoxOrient: "vertical",
                  WebkitLineClamp: 2,
                  overflow: "hidden"
                }}
              >
                {institution || "-"}
              </div>
            </div>

            {showQr ? (
              <div
                style={{
                  minWidth: 0,
                  minHeight: 0,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "flex-start",
                  overflow: "hidden"
                }}
              >
                <div
                  style={{
                    width: `${qrPx}px`,
                    height: `${qrPx}px`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "#ffffff",
                    flex: "0 0 auto"
                  }}
                >
                  <QRCodeImage value={qrValue} size={qrPx} />
                </div>
                {showBarcodeText ? (
                  <div
                    style={{
                      marginTop: "2px",
                      width: "100%",
                      textAlign: "center",
                      fontSize: "9px",
                      lineHeight: 1,
                      fontWeight: 800,
                      color: "#111827",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis"
                    }}
                  >
                    {employeeNik || "-"}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      className="label-page bg-white text-black"
      style={{
        position: "relative",
        overflow: "hidden",
        border: showBorder ? "1px solid #d4d4d8" : undefined,
        borderRadius: showBorder ? "18px" : undefined,
        WebkitPrintColorAdjust: "exact",
        printColorAdjust: "exact"
      }}
    >
      <div
        style={{
          position: "absolute",
          left: "8%",
          top: "7%",
          right: "8%",
          zIndex: 2
        }}
      >
        <div
          style={{
            fontSize: `${nameFont}px`,
            lineHeight: 1.03,
            fontWeight: 900,
            color: "#000000",
            whiteSpace: "normal",
            wordBreak: "break-word",
            overflowWrap: "anywhere",
            letterSpacing: "-0.03em",
            maxHeight: "34%",
            overflow: "hidden"
          }}
        >
          {nameText || "-"}
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: "8%",
          top: "39%",
          right: showQr ? "34%" : "8%",
          zIndex: 2,
          fontSize: `${Math.max(9, safeFont)}px`,
          lineHeight: 1.12,
          fontWeight: 700,
          color: "#111827",
          whiteSpace: "normal",
          wordBreak: "break-word",
          overflowWrap: "anywhere"
        }}
      >
        <div>NIK Karyawan: {employeeNik || "-"}</div>
        <div style={{ marginTop: "4px" }}>Stage: {stationText}</div>
        {queueText ? <div>Antrian: {queueText}</div> : null}
        {!isCorporate && birthDate ? <div style={{ marginTop: "4px" }}>TTL: {birthDate}</div> : null}
        {!isCorporate && provinceText ? <div style={{ marginTop: "4px", color: "#4b5563" }}>Provinsi: {provinceText}</div> : null}
        <div style={{ marginTop: "4px", fontWeight: 900 }}>{institution || "-"}</div>
      </div>

      {showQr && (
        <div
          style={{
            position: "absolute",
            right: "2%",
            bottom: showBarcodeText ? "12%" : "5%",
            width: `${qrPx}px`,
            height: `${qrPx}px`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#ffffff",
            zIndex: 1
          }}
        >
          <QRCodeImage value={qrValue} size={qrPx} />
        </div>
      )}

      {showQr && showBarcodeText && (
        <div
          style={{
            position: "absolute",
            right: "1%",
            bottom: "3%",
            width: "34%",
            textAlign: "center",
            fontSize: "9px",
            lineHeight: 1,
            fontWeight: 800,
            color: "#111827",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis"
          }}
        >
          {employeeNik || "-"}
        </div>
      )}
    </section>
  );
}
