"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import AuthGate from "@/components/AuthGate";
import StageProgress from "@/components/StageProgress";

type LoadMode = "blank" | "edit";
type ListTab = "belum" | "selesai";

function norm(text: any) {
  return String(text || "")
    .toLowerCase()
    .replace(/[\s\n\r\t.,\-_\/\\><:;()]/g, "");
}

function parseOptions(config: any): string[] {
  try {
    if (Array.isArray(config)) return config.map(String);
    if (!config) return [];
    const parsed = typeof config === "string" ? JSON.parse(config) : config;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function hasChoiceOptions(param: any) {
  return parseOptions(param.config_json).length > 0;
}

function isValueField(param: any) {
  return String(param.name || "").toLowerCase().trim().startsWith("value ");
}

function isScoreField(param: any) {
  const name = String(param.name || "").toLowerCase().trim();
  return name.startsWith("score ") || name.startsWith("total score") || name.includes("score total");
}

function isAutoField(param: any) {
  return isValueField(param) || isScoreField(param);
}

function scoreByChoice(parameterName: string, selectedValue: string): number {
  const key = `${norm(parameterName)}::${norm(selectedValue)}`;

  const exact: Record<string, number> = {
    // MATA
    [`${norm("Lensakontak/ kaca mata")}::${norm("Tidak menggunakan")}`]: 2,
    [`${norm("Lensakontak/ kaca mata")}::${norm("Menggunakan")}`]: 1,
    [`${norm("Lensakontak / kaca mata")}::${norm("Tidak menggunakan")}`]: 2,
    [`${norm("Lensakontak / kaca mata")}::${norm("Menggunakan")}`]: 1,
    [`${norm("Tes buta warna")}::${norm("Tidak buta warna")}`]: 2,
    [`${norm("Tes buta warna")}::${norm("Buta warna parsial")}`]: 1,
    [`${norm("Tes buta warna")}::${norm("Buta warna total")}`]: 0,
    [`${norm("Strabismus / Juling")}::${norm("(+) / (-)")}`]: 1,
    [`${norm("Strabismus / Juling")}::${norm("(-) / (+)")}`]: 1,
    [`${norm("Strabismus / Juling")}::${norm("(+) / (+)")}`]: 0,
    [`${norm("Strabismus / Juling")}::${norm("(-) / (-)")}`]: 2,
    [`${norm("Strabismus / Juling")}::${norm("(+)/(-)")}`]: 1,
    [`${norm("Strabismus / Juling")}::${norm("(-)/(+)")}`]: 1,
    [`${norm("Strabismus / Juling")}::${norm("(+)/(+)")}`]: 0,
    [`${norm("Strabismus / Juling")}::${norm("(-)/(-)")}`]: 2,
    [`${norm("Pemeriksaan Visus OD / OS")}::${norm("Normal 6/6")}`]: 2,
    [`${norm("Pemeriksaan Visus OD / OS")}::${norm("<6/6 - 6/12")}`]: 1,
    [`${norm("Pemeriksaan Visus OD / OS")}::${norm("<6/12")}`]: 0,
    [`${norm("Pemeriksaan Visus OD  / OS")}::${norm("Normal 6/6")}`]: 2,
    [`${norm("Pemeriksaan Visus OD  / OS")}::${norm("<6/6 - 6/12")}`]: 1,
    [`${norm("Pemeriksaan Visus OD  / OS")}::${norm("<6/12")}`]: 0,

    // GIGI
    [`${norm("Karang Gigi")}::${norm("Negative")}`]: 2,
    [`${norm("Karang Gigi")}::${norm("Positive")}`]: 0,
    [`${norm("Caries Dentis")}::${norm("0 caries")}`]: 2,
    [`${norm("Caries Dentis")}::${norm("1 caries")}`]: 1,
    [`${norm("Caries Dentis")}::${norm("2 caries")}`]: 1,
    [`${norm("Caries Dentis")}::${norm("3 caries")}`]: 0,
    [`${norm("Caries Dentis")}::${norm(">3 caries")}`]: 0,
    [`${norm("Tumpatan Gigi")}::${norm("0 tumpatan")}`]: 2,
    [`${norm("Tumpatan Gigi")}::${norm("<3 tumpatan")}`]: 1,
    [`${norm("Tumpatan Gigi")}::${norm(">3 tumpatan")}`]: 0,
    [`${norm("Tumpatan Gigi")}::${norm("<5 tumpatan")}`]: 1,
    [`${norm("Tumpatan Gigi")}::${norm(">5 tumpatan")}`]: 0,
    [`${norm("Impaksi gigi")}::${norm("0 gigi")}`]: 2,
    [`${norm("Impaksi gigi")}::${norm("1 gigi")}`]: 1,
    [`${norm("Impaksi gigi")}::${norm("2 gigi")}`]: 0,
    [`${norm("Impaksi gigi")}::${norm(">2 gigi")}`]: 0,
    [`${norm("Kehilangan Gigi (Baik depan maupun belakang)")}::${norm("0 gigi")}`]: 2,
    [`${norm("Kehilangan Gigi (Baik depan maupun belakang)")}::${norm("1 gigi")}`]: 1,
    [`${norm("Kehilangan Gigi (Baik depan maupun belakang)")}::${norm("2 gigi")}`]: 0,
    [`${norm("Kehilangan Gigi (Baik depan maupun belakang)")}::${norm(">2 gigi")}`]: 0,
    [`${norm("Infeksi Gusi")}::${norm("Negative")}`]: 2,
    [`${norm("Infeksi Gusi")}::${norm("Positive")}`]: 0,
    [`${norm("Dental panoramic")}::${norm("Normal")}`]: 2,
    [`${norm("Dental panoramic")}::${norm("ditemukan kelainan")}`]: 0,
    [`${norm("Dental panoramik")}::${norm("Normal")}`]: 2,
    [`${norm("Dental panoramik")}::${norm("ditemukan kelainan")}`]: 0,

    // THT
    [`${norm("Membran timpani")}::${norm("Intak")}`]: 2,
    [`${norm("Membran timpani")}::${norm("Tidak Intak")}`]: 0,
    [`${norm("Serumen")}::${norm("Tidak ada")}`]: 2,
    [`${norm("Serumen")}::${norm("Ada serumen")}`]: 0,
    [`${norm("Tonsil")}::${norm("T0 - T1")}`]: 2,
    [`${norm("Tonsil")}::${norm("T0 - T2a")}`]: 1,
    [`${norm("Tonsil")}::${norm("T0 - T2b")}`]: 1,
    [`${norm("Tonsil")}::${norm("T2 - T3")}`]: 0,
    [`${norm("Rhinitis Alergi (divide)")}::${norm("Negative")}`]: 2,
    [`${norm("Rhinitis Alergi (divide)")}::${norm("Positive")}`]: 0,
    [`${norm("Rhinitis Alergi (Bividas)")}::${norm("Negative")}`]: 2,
    [`${norm("Rhinitis Alergi (Bividas)")}::${norm("Positive")}`]: 0,
    [`${norm("Epistaksis 1 tahun terakhir")}::${norm("Tidak Ada")}`]: 2,
    [`${norm("Epistaksis 1 tahun terakhir")}::${norm("Ada")}`]: 0,
    [`${norm("Tes Garputala (Weber) 512 Hz")}::${norm("Normal")}`]: 2,
    [`${norm("Tes Garputala (Weber) 512 Hz")}::${norm("Tidak Normal")}`]: 0,

    // PENYAKIT DALAM
    [`${norm("Berat Badan (Kg)")}::${norm("Sesuai juknis")}`]: 2,
    [`${norm("Berat Badan (Kg)")}::${norm("Tidak sesuai juknis")}`]: 0,
    [`${norm("TB. (Cm)")}::${norm("Sesuai juknis")}`]: 2,
    [`${norm("TB. (Cm)")}::${norm("Tidak sesuai juknis")}`]: 0,
    [`${norm("Tanda Vital")}::${norm("Normal")}`]: 2,
    [`${norm("Tanda Vital")}::${norm("Tidak Normal")}`]: 0,
    [`${norm("Tato kulit")}::${norm("Tidak ada tato")}`]: 2,
    [`${norm("Tato kulit")}::${norm("Ada tato")}`]: 0,
    [`${norm("Tindik (selain anting) Wanita : hanya 1 / telinga")}::${norm("Tidak ada")}`]: 2,
    [`${norm("Tindik (selain anting) Wanita : hanya 1 / telinga")}::${norm("Ada (pria) Wanita >1)")}`]: 0,
    [`${norm("Pemeriksaan Fisik Jantung")}::${norm("Normal")}`]: 2,
    [`${norm("Pemeriksaan Fisik Jantung")}::${norm("Tidak Normal")}`]: 0,
    [`${norm("Pemeriksaan Fisik Paru")}::${norm("Normal")}`]: 2,
    [`${norm("Pemeriksaan Fisik Paru")}::${norm("Tidak Normal")}`]: 0,

    // JANTUNG
    [`${norm("Kelainan Anatomi Jantung")}::${norm("Tidak Ada")}`]: 2,
    [`${norm("Kelainan Anatomi Jantung")}::${norm("Ada")}`]: 0,
    [`${norm("Kelainan Irama Jantung")}::${norm("Tidak Ada")}`]: 2,
    [`${norm("Kelainan Irama Jantung")}::${norm("Ada")}`]: 0,
    [`${norm("Iskemik Miocardial")}::${norm("Tidak Ada")}`]: 2,
    [`${norm("Iskemik Miocardial")}::${norm("Ada")}`]: 0,
    [`${norm("Kelainan kongenital jantung")}::${norm("Tidak Ada")}`]: 2,
    [`${norm("Kelainan kongenital jantung")}::${norm("Ada")}`]: 0,
    [`${norm("Varises Tungkai (insufisiensi vena)")}::${norm("Tidak Ada")}`]: 2,
    [`${norm("Varises Tungkai (insufisiensi vena)")}::${norm("Ada")}`]: 0,
    [`${norm("Kelainan Arteri pada ekstremitas")}::${norm("Tidak Ada")}`]: 2,
    [`${norm("Kelainan Arteri pada ekstremitas")}::${norm("Ada")}`]: 0
  };

  if (typeof exact[key] === "number") return exact[key];

  const selected = norm(selectedValue);
  if (selected === norm("Normal")) return 2;
  if (selected === norm("Tidak Normal")) return 0;
  if (selected === norm("Tidak Ada")) return 2;
  if (selected === norm("Ada")) return 0;
  if (selected === norm("Ringan")) return 1;
  if (selected === norm("Sedang")) return 0;
  if (selected === norm("Berat")) return 0;
  if (selected === norm("Sesuai juknis")) return 2;
  if (selected === norm("Tidak sesuai juknis")) return 0;
  if (selected === norm("Positive")) return 0;
  if (selected === norm("Negative")) return 2;

  return 0;
}

function computeValues(parameters: any[], rawValues: Record<string, string>) {
  const computed: Record<string, string> = { ...rawValues };
  const scores: Record<string, number> = {};

  parameters.forEach((p) => {
    if (isAutoField(p)) return;
    if (!hasChoiceOptions(p)) return;
    const selected = computed[p.id];
    if (!selected) return;
    scores[String(p.id)] = scoreByChoice(p.name, selected);
  });

  parameters.forEach((p) => {
    if (isAutoField(p)) computed[p.id] = "";
  });

  parameters.forEach((p, idx) => {
    if (!isValueField(p)) return;
    for (let i = idx - 1; i >= 0; i--) {
      const prev = parameters[i];
      if (isAutoField(prev)) continue;
      if (!hasChoiceOptions(prev)) continue;
      const score = scores[String(prev.id)];
      computed[p.id] = typeof score === "number" ? String(score) : "";
      break;
    }
  });

  parameters.forEach((p, idx) => {
    if (!isScoreField(p)) return;
    const pName = String(p.name || "").toLowerCase();
    const pCat = norm(p.category);
    const totalAll = pName.includes("total");

    let total = 0;
    let hasAny = false;

    parameters.forEach((candidate, candidateIdx) => {
      if (candidateIdx >= idx) return;
      if (isAutoField(candidate)) return;
      if (!hasChoiceOptions(candidate)) return;

      const score = scores[String(candidate.id)];
      if (typeof score !== "number") return;

      if (totalAll || norm(candidate.category) === pCat) {
        total += score;
        hasAny = true;
      }
    });

    computed[p.id] = hasAny ? String(total) : "";
  });

  return computed;
}

function findCurrentStage(detail: any, postName: string) {
  const stages = Array.isArray(detail?.stages) ? detail.stages : [];
  const target = norm(postName);

  return stages.find((stage: any) => {
    return norm(stage?.name || stage?.post_name || stage?.post || stage?.title || stage?.label) === target;
  }) || stages.find((stage: any) => {
    return JSON.stringify(stage || {}).toLowerCase().includes(String(postName || "").toLowerCase());
  });
}

function stageIsDone(stage: any) {
  if (!stage) return false;

  const text = JSON.stringify(stage).toLowerCase();
  if (text.includes('"done"') || text.includes("selesai") || text.includes("complete")) return true;

  if (stage.done === true || stage.completed === true || stage.is_done === true || stage.is_completed === true) return true;

  const doneCount = Number(stage.done_count ?? stage.completed_count ?? stage.filled_count ?? stage.completed ?? NaN);
  const totalCount = Number(stage.total_count ?? stage.total ?? stage.parameter_count ?? NaN);
  if (Number.isFinite(doneCount) && Number.isFinite(totalCount) && totalCount > 0 && doneCount >= totalCount) return true;

  return false;
}

function ParameterInput({
  param,
  value,
  onChange
}: {
  param: any;
  value: string;
  onChange: (value: string) => void;
}) {
  const options = parseOptions(param.config_json);
  const inputType = String(param.input_type || "text").toLowerCase();
  const auto = isAutoField(param);

  if (options.length && (inputType === "radio" || inputType === "select")) {
    return (
      <>
        <select className="input" value={value || ""} onChange={(e) => onChange(e.target.value)}>
          <option value="">-- Pilih --</option>
          {options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
        </select>
        {value && (
          <div className="mt-1 text-xs font-semibold text-blue-700">
            Skor pilihan: {scoreByChoice(param.name, value)}
          </div>
        )}
      </>
    );
  }

  if (inputType === "textarea") {
    return <textarea className="input min-h-24" value={value || ""} onChange={(e) => onChange(e.target.value)} />;
  }

  return (
    <input
      type={inputType === "number" ? "number" : inputType === "date" ? "date" : "text"}
      className={`input ${auto ? "bg-blue-50 font-bold text-blue-800" : ""}`}
      placeholder={auto ? "auto score" : ""}
      value={value || ""}
      readOnly={auto}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}



function ScannerModal({
  open,
  onClose,
  onDetected
}: {
  open: boolean;
  onClose: () => void;
  onDetected: (code: string) => void;
}) {
  const scannerId = "mcu-html5-qrcode-reader";
  const scannerRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [manualCode, setManualCode] = useState("");
  const [status, setStatus] = useState("");
  const [isStarting, setIsStarting] = useState(false);
  const [scanMode, setScanMode] = useState<"camera" | "manual">("camera");

  async function stopScanner() {
    try {
      await scannerRef.current?.stop?.();
    } catch {}

    try {
      await scannerRef.current?.clear?.();
    } catch {}

    scannerRef.current = null;
  }

  function finishDetected(code: string) {
    const clean = String(code || "").trim();
    if (!clean) return;

    stopScanner();
    onDetected(clean);
    onClose();
  }

  async function startScanner() {
    if (!open) return;

    setIsStarting(true);
    setStatus("Membuka kamera dan scanner sensitif...");
    setScanMode("camera");

    try {
      await stopScanner();

      const mod = await import("html5-qrcode");
      const Html5Qrcode = mod.Html5Qrcode;
      const Html5QrcodeSupportedFormats = mod.Html5QrcodeSupportedFormats;

      const scanner = new Html5Qrcode(scannerId, {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.ITF
        ],
        verbose: false
      });

      scannerRef.current = scanner;

      const config = {
        fps: 15,
        qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
          const width = Math.floor(viewfinderWidth * 0.92);
          const height = Math.max(110, Math.floor(viewfinderHeight * 0.28));
          return { width, height };
        },
        aspectRatio: 1.7777778,
        disableFlip: false,
        videoConstraints: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30 },
          focusMode: "continuous"
        }
      };

      await scanner.start(
        { facingMode: "environment" },
        config,
        (decodedText: string) => {
          finishDetected(decodedText);
        },
        () => {
          // ignore frame scan failures; continuous scanner will retry
        }
      );

      setStatus("Scanner aktif. Letakkan barcode/QR di dalam kotak. Tahan 1-2 detik.");
    } catch (err: any) {
      const msg = String(err?.message || err || "");
      if (msg.toLowerCase().includes("permission") || msg.toLowerCase().includes("notallowed")) {
        setStatus("Izin kamera ditolak. Aktifkan camera permission atau input barcode manual.");
      } else if (msg.toLowerCase().includes("notfound")) {
        setStatus("Kamera tidak ditemukan. Gunakan input barcode manual.");
      } else {
        setStatus("Scanner kamera tidak berhasil dibuka. Coba Chrome Android, refresh halaman, atau input barcode manual.");
      }
    } finally {
      setIsStarting(false);
    }
  }

  async function scanUploadedImage(file: File) {
    if (!file) return;

    setStatus("Membaca barcode dari foto...");
    setScanMode("manual");

    try {
      await stopScanner();

      const mod = await import("html5-qrcode");
      const Html5Qrcode = mod.Html5Qrcode;
      const scanner = new Html5Qrcode(scannerId, { verbose: false });
      scannerRef.current = scanner;

      const decodedText = await scanner.scanFile(file, true);
      finishDetected(decodedText);
    } catch {
      setStatus("Barcode dari foto belum terbaca. Coba foto lebih dekat/terang atau input manual.");
    }
  }

  useEffect(() => {
    if (!open) return;

    const timer = setTimeout(() => {
      startScanner();
    }, 250);

    return () => {
      clearTimeout(timer);
      stopScanner();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 p-4 md:items-center">
      <div className="w-full max-w-lg rounded-3xl border border-slate-700 bg-slate-950 p-4 text-white shadow-2xl">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <div className="text-lg font-black">Scan Barcode / QR</div>
            <div className="text-xs text-slate-400">Scanner v19 pakai html5-qrcode, lebih sensitif di mobile.</div>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl bg-slate-800 px-3 py-2 font-bold">
            Tutup
          </button>
        </div>

        <div className="overflow-hidden rounded-2xl bg-black">
          <div id={scannerId} className="min-h-80 w-full" />
        </div>

        <div className="mt-3 grid gap-2 rounded-xl bg-slate-900 p-3 text-sm text-slate-200">
          <div>{isStarting ? "Menyiapkan scanner..." : status}</div>
          <div className="text-xs text-slate-400">
            Tips: pakai Chrome Android, landscape untuk barcode panjang, jarak 10-25 cm, cahaya cukup, tahan 1-2 detik.
            Untuk label kecil, QR code lebih mudah terbaca daripada barcode garis.
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            className="rounded-xl bg-slate-800 px-3 py-2 font-black"
            onClick={startScanner}
            disabled={isStarting}
          >
            Scan Ulang
          </button>

          <button
            type="button"
            className="rounded-xl bg-slate-800 px-3 py-2 font-black"
            onClick={() => fileInputRef.current?.click()}
          >
            Scan dari Foto
          </button>
        </div>

        <input
          ref={fileInputRef}
          className="hidden"
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) scanUploadedImage(file);
            e.currentTarget.value = "";
          }}
        />

        <div className="mt-3 grid gap-2">
          <input
            className="input bg-white text-slate-900"
            placeholder="Input barcode manual jika scanner belum terbaca"
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value)}
          />
          <button
            type="button"
            className="btn-primary"
            onClick={() => finishDetected(manualCode)}
          >
            Gunakan Kode Manual
          </button>
        </div>
      </div>
    </div>
  );
}


export default function InputPage() {
  return (
    <AuthGate>
      {(user) => <InputForm user={user} />}
    </AuthGate>
  );
}

function InputForm({ user }: { user: any }) {
  const program = user.program_type === "all" ? "capaska" : user.program_type;
  const [sources, setSources] = useState<any[]>([]);
  const [sourceId, setSourceId] = useState("all");
  const [keyword, setKeyword] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [participant, setParticipant] = useState<any>(null);
  const [detail, setDetail] = useState<any>(null);
  const [parameters, setParameters] = useState<any[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [listTab, setListTab] = useState<ListTab>("belum");
  const [loadingList, setLoadingList] = useState(false);
  const [doneParticipants, setDoneParticipants] = useState<any[]>([]);
  const [pendingParticipants, setPendingParticipants] = useState<any[]>([]);

  const groupedParameters = useMemo(() => {
    const groups: { category: string; params: any[] }[] = [];

    parameters.forEach((param) => {
      const category = param.category || user.post_name || "Pemeriksaan";
      const last = groups[groups.length - 1];

      if (!last || last.category !== category) {
        groups.push({ category, params: [param] });
      } else {
        last.params.push(param);
      }
    });

    return groups;
  }, [parameters, user.post_name]);

  useEffect(() => {
    fetch(`/api/sources?program=${program}`)
      .then((r) => r.json())
      .then((d) => setSources(d.sources || []));
  }, [program]);

  async function search(e?: React.FormEvent, overrideKeyword?: string) {
    e?.preventDefault();
    setParticipant(null);
    setDetail(null);
    setMessage("");

    const activeKeyword = typeof overrideKeyword === "string" ? overrideKeyword : keyword;

    const res = await fetch(`/api/search/participants?program=${program}&source_id=${sourceId}&keyword=${encodeURIComponent(activeKeyword)}&limit=50`);
    const json = await res.json();

    setResults(json.participants || []);

    if (!json.participants?.length) {
      setMessage("Peserta tidak ditemukan.");
    }
  }

  async function loadParticipant(p: any, mode: LoadMode) {
    setParticipant(p);
    setResults([]);
    setMessage("");

    const detailRes = await fetch(`/api/participant?id=${p.id}`);
    const detailJson = await detailRes.json();
    setDetail(detailJson);

    const paramRes = await fetch(`/api/parameters?participant_id=${p.id}&package_id=${p.package_id}&post_id=${user.post_id}`);
    const paramJson = await paramRes.json();
    const nextParameters = paramJson.parameters || [];
    setParameters(nextParameters);

    const nextValues: Record<string, string> = {};
    nextParameters.forEach((x: any) => {
      if (mode === "edit") {
        nextValues[x.id] = x.current_value || "";
      } else {
        nextValues[x.id] = "";
      }
    });

    setValues(computeValues(nextParameters, nextValues));
  }

  function updateValue(parameterId: number | string, nextValue: string) {
    setValues((prev) => computeValues(parameters, { ...prev, [parameterId]: nextValue }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");

    const finalValues = computeValues(parameters, values);

    const res = await fetch("/api/results/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        participant_id: participant.id,
        post_id: user.post_id,
        values: finalValues
      })
    });

    const json = await res.json();
    setMessage(json.ok ? "Hasil berhasil disimpan." : json.message || "Gagal menyimpan.");
    if (json.ok) {
      setValues(finalValues);
      await refreshLists(false);
    }
  }

  async function refreshLists(showMessage = true) {
    setLoadingList(true);
    if (showMessage) setMessage("Memuat daftar selesai/belum selesai...");

    try {
      const res = await fetch(`/api/search/participants?program=${program}&source_id=${sourceId}&keyword=&limit=200`);
      const json = await res.json();
      const list = json.participants || [];

      const loaded = await Promise.all(
        list.map(async (p: any) => {
          try {
            const d = await fetch(`/api/participant?id=${p.id}`).then((r) => r.json());
            const stage = findCurrentStage(d, user.post_name);
            return { ...p, stage, is_done_for_operator: stageIsDone(stage) };
          } catch {
            return { ...p, stage: null, is_done_for_operator: false };
          }
        })
      );

      setDoneParticipants(loaded.filter((x: any) => x.is_done_for_operator));
      setPendingParticipants(loaded.filter((x: any) => !x.is_done_for_operator));

      if (showMessage) {
        setMessage(`Daftar dimuat. Selesai: ${loaded.filter((x: any) => x.is_done_for_operator).length}, Belum: ${loaded.filter((x: any) => !x.is_done_for_operator).length}.`);
      }
    } catch {
      setMessage("Gagal memuat daftar peserta.");
    } finally {
      setLoadingList(false);
    }
  }

  const displayedList = listTab === "selesai" ? doneParticipants : pendingParticipants;

  return (
    <div className="space-y-5">
      <ScannerModal
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onDetected={(code) => {
          setKeyword(code);
          search(undefined, code);
        }}
      />

      <section className="card p-5">
        <div className="text-2xl font-black">Input CAPASKA</div>
        <div className="mt-1 text-sm text-slate-500">Login sebagai {user.post_name}. Operator hanya melihat parameter post masing-masing.</div>
        <div className="mt-2 w-fit rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
          AutoScore v19 aktif · html5-qrcode scanner · edit hasil · daftar status
        </div>
      </section>

      <form onSubmit={(e) => search(e)} className="card grid gap-3 p-4 md:grid-cols-[1fr_1fr_auto_auto]">
        <select className="input" value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
          <option value="all">Semua Database Instansi</option>
          {sources.map((s) => <option key={s.id} value={s.id}>{s.name} - {s.institution_name || "-"}</option>)}
        </select>

        <div className="flex gap-2">
          <input className="input flex-1" value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="Cari nama / scan barcode / ID" />
          <button
            type="button"
            onClick={() => setScannerOpen(true)}
            className="rounded-2xl border border-slate-300 px-4 py-3 text-xl font-black shadow-sm"
            title="Scan barcode"
          >
            📷
          </button>
        </div>

        <button className="btn-primary">Cari Peserta</button>

        <button
          type="button"
          className="rounded-2xl border border-slate-300 px-5 py-3 font-black text-slate-700"
          onClick={() => refreshLists(true)}
          disabled={loadingList}
        >
          {loadingList ? "Memuat..." : "Muat Daftar"}
        </button>
      </form>

      {message && <div className="rounded-xl bg-blue-50 p-3 text-sm font-semibold text-blue-700">{message}</div>}

      <section className="card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="font-black">Daftar Peserta Operator Ini</div>
            <div className="text-sm text-slate-500">Filter status berdasarkan progress stage {user.post_name}.</div>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setListTab("belum")}
              className={`rounded-2xl px-4 py-2 font-black ${listTab === "belum" ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-700"}`}
            >
              Belum ({pendingParticipants.length})
            </button>
            <button
              type="button"
              onClick={() => setListTab("selesai")}
              className={`rounded-2xl px-4 py-2 font-black ${listTab === "selesai" ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-700"}`}
            >
              Selesai ({doneParticipants.length})
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-2">
          {!displayedList.length && (
            <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">
              Belum ada daftar. Klik <b>Muat Daftar</b> dulu.
            </div>
          )}

          {displayedList.map((p: any) => (
            <div key={`${listTab}-${p.id}`} className="rounded-2xl border border-slate-200 bg-white p-3">
              <div className="font-black">{p.name}</div>
              <div className="text-sm text-slate-500">{p.mcu_id || "-"} · {p.province || "-"} · {p.source_name || "-"}</div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-black text-white" onClick={() => loadParticipant(p, "blank")}>
                  Input Baru
                </button>
                <button type="button" className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-black text-white" onClick={() => loadParticipant(p, "edit")}>
                  Edit Hasil
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {!!results.length && (
        <section className="card p-4">
          <div className="mb-3 font-black">Hasil Pencarian</div>
          <div className="grid gap-2">
            {results.map((p) => (
              <div key={p.id} className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="font-bold">{p.name}</div>
                <div className="text-sm text-slate-500">{p.mcu_id || "-"} · {p.province || "-"} · {p.source_name || "-"}</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={() => loadParticipant(p, "blank")} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-black text-white">
                    Input Baru
                  </button>
                  <button type="button" onClick={() => loadParticipant(p, "edit")} className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-black text-white">
                    Edit Hasil
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {participant && detail?.ok && (
        <section className="card space-y-4 p-5">
          <div>
            <div className="text-xl font-black">{participant.name}</div>
            <div className="text-sm text-slate-500">{participant.mcu_id} · {participant.province || "-"} · {detail.participant.source_name || "-"}</div>
          </div>
          <StageProgress stages={detail.stages} />
        </section>
      )}

      {participant && (
        <form onSubmit={save} className="card space-y-6 p-5">
          <div className="text-lg font-black">Form {user.post_name}</div>
          {!parameters.length && <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-700">Tidak ada parameter untuk post ini. Jalankan SQL reference dan cek mapping package.</div>}

          {groupedParameters.map((group) => (
            <div key={group.category} className="space-y-5">
              <div className="border-b border-slate-200 pb-2 text-base font-black text-slate-900">
                {group.category}
              </div>

              {group.params.map((param) => (
                <div key={param.id}>
                  <label className="label">{param.name}{param.unit ? ` (${param.unit})` : ""}</label>
                  {param.reference_text && <div className="mb-2 text-xs text-slate-500">{param.reference_text}</div>}
                  <ParameterInput
                    param={param}
                    value={values[param.id] || ""}
                    onChange={(nextValue) => updateValue(param.id, nextValue)}
                  />
                </div>
              ))}
            </div>
          ))}

          <button className="btn-primary" disabled={!parameters.length}>Simpan Hasil Pemeriksaan</button>
          {message && <div className="rounded-xl bg-blue-50 p-3 text-sm font-semibold text-blue-700">{message}</div>}
        </form>
      )}
    </div>
  );
}
