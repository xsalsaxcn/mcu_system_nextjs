"use client";

import { useEffect, useMemo, useState } from "react";
import AuthGate from "@/components/AuthGate";
import StageProgress from "@/components/StageProgress";

const SCORE_RULES: Record<string, number> = {
  "Lensakontak/ kaca mata::Tidak menggunakan": 2,
  "Lensakontak/ kaca mata::Menggunakan": 1,
  "Tes buta warna::Tidak buta warna": 2,
  "Tes buta warna::Buta warna parsial": 1,
  "Tes buta warna::Buta warna total": 0,
  "Strabismus / Juling::(-) / (-)": 2,
  "Strabismus / Juling::(+) / (-)": 1,
  "Strabismus / Juling::(-) / (+)": 1,
  "Strabismus / Juling::(+) / (+)": 0,
  "Pemeriksaan Visus OD  / OS::Normal 6/6": 2,
  "Pemeriksaan Visus OD  / OS::<6/6 - 6/12": 1,
  "Pemeriksaan Visus OD  / OS::<6/12": 0,

  "Karang Gigi::Negative": 2,
  "Karang Gigi::Positive": 0,
  "Caries Dentis::0 caries": 2,
  "Caries Dentis::1 caries": 1,
  "Caries Dentis::2 caries": 1,
  "Caries Dentis::3 caries": 0,
  "Caries Dentis::>3 caries": 0,
  "Tumpatan Gigi::0 tumpatan": 2,
  "Tumpatan Gigi::<3 tumpatan": 1,
  "Tumpatan Gigi::>3 tumpatan": 0,
  "Impaksi gigi::0 gigi": 2,
  "Impaksi gigi::1 gigi": 1,
  "Impaksi gigi::2 gigi": 0,
  "Impaksi gigi::>2 gigi": 0,
  "Kehilangan Gigi (Baik depan maupun belakang)::0 gigi": 2,
  "Kehilangan Gigi (Baik depan maupun belakang)::1 gigi": 1,
  "Kehilangan Gigi (Baik depan maupun belakang)::2 gigi": 0,
  "Kehilangan Gigi (Baik depan maupun belakang)::>2 gigi": 0,
  "Infeksi Gusi::Negative": 2,
  "Infeksi Gusi::Positive": 0,
  "Dental panoramic::Normal": 2,
  "Dental panoramic::ditemukan kelainan": 0,

  "Membran timpani::Intak": 2,
  "Membran timpani::Tidak Intak": 0,
  "Serumen::Tidak ada": 2,
  "Serumen::Ada serumen": 0,
  "Tonsil::T0 - T1": 2,
  "Tonsil::T0 - T2a": 1,
  "Tonsil::T0 - T2b": 1,
  "Tonsil::T2 - T3": 0,
  "Rhinitis Alergi (divide)::Negative": 2,
  "Rhinitis Alergi (divide)::Positive": 0,
  "Epistaksis 1 tahun terakhir::Tidak Ada": 2,
  "Epistaksis 1 tahun terakhir::Ada": 0,
  "Tes Garputala (Weber) 512 Hz::Normal": 2,
  "Tes Garputala (Weber) 512 Hz::Tidak Normal": 0,

  "Berat Badan (Kg)::Sesuai juknis": 2,
  "Berat Badan (Kg)::Tidak sesuai juknis": 0,
  "TB. (Cm)::Sesuai juknis": 2,
  "TB. (Cm)::Tidak sesuai juknis": 0,
  "Tanda Vital::Normal": 2,
  "Tanda Vital::Tidak Normal": 0,
  "Tato kulit::Tidak ada tato": 2,
  "Tato kulit::Ada tato": 0,
  "Tindik (selain anting) Wanita : hanya 1 / telinga::Tidak ada": 2,
  "Tindik (selain anting) Wanita : hanya 1 / telinga::Ada (pria) Wanita >1)": 0,
  "Pemeriksaan Fisik Jantung::Normal": 2,
  "Pemeriksaan Fisik Jantung::Tidak Normal": 0,
  "Pemeriksaan Fisik Paru::Normal": 2,
  "Pemeriksaan Fisik Paru::Tidak Normal": 0,

  "Kelainan Anatomi Jantung::Tidak Ada": 2,
  "Kelainan Anatomi Jantung::Ada": 0,
  "Kelainan Irama Jantung::Tidak Ada": 2,
  "Kelainan Irama Jantung::Ada": 0,
  "Iskemik Miocardial::Tidak Ada": 2,
  "Iskemik Miocardial::Ada": 0,
  "Kelainan kongenital jantung::Tidak Ada": 2,
  "Kelainan kongenital jantung::Ada": 0,
  "Varises Tungkai (insufisiensi vena)::Tidak Ada": 2,
  "Varises Tungkai (insufisiensi vena)::Ada": 0,
  "Kelainan Arteri pada ekstremitas::Tidak Ada": 2,
  "Kelainan Arteri pada ekstremitas::Ada": 0
};

const GENERIC_SCORE_RULES: Record<string, Record<string, number>> = {
  penyakit_dalam: {
    "Normal": 2,
    "Tidak Normal": 0,
    "Sesuai juknis": 2,
    "Tidak sesuai juknis": 0,
    "Tidak ada tato": 2,
    "Ada tato": 0,
    "Tidak ada": 2,
    "Ada": 0,
    "Ada (pria) Wanita >1)": 0
  },
  ortopedi: {
    "Tidak Ada": 2,
    "Ada": 0,
    "Ringan": 1
  },
  radiologi: {
    "Tidak Ada": 2,
    "Ringan": 1,
    "Sedang": 0,
    "Berat": 0
  }
};


function normalizeKey(text: any) {
  return String(text || "")
    .toLowerCase()
    .replace(/[\s\n\r\t.,\-_\/\\><:;()]/g, "");
}

function parseOptions(config: any) {
  try {
    const parsed = JSON.parse(config || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function scoreFor(param: any, selectedValue: string) {
  const name = String(param.name || "");
  const category = String(param.category || "").toLowerCase();

  const exact = SCORE_RULES[`${name}::${selectedValue}`];

  if (typeof exact === "number") return exact;

  if (category.includes("penyakit dalam") || category.includes("abdomen") || category.includes("rektum") || category.includes("urogenitalia")) {
    return GENERIC_SCORE_RULES.penyakit_dalam[selectedValue] ?? 0;
  }

  if (category.includes("ortopedi") || category.includes("gerak") || category.includes("vertebra")) {
    return GENERIC_SCORE_RULES.ortopedi[selectedValue] ?? 0;
  }

  if (category.includes("radiologi") || category.includes("rontgen")) {
    return GENERIC_SCORE_RULES.radiologi[selectedValue] ?? 0;
  }

  return 0;
}

const VALUE_FIELD_BY_PARAMETER: Record<string, string> = {
  [normalizeKey("Lensakontak/ kaca mata")]: "Value Lensakontak/ kaca mata",
  [normalizeKey("Tes buta warna")]: "Value buta warna",
  [normalizeKey("Strabismus / Juling")]: "Value Strabismus / Juling",
  [normalizeKey("Pemeriksaan Visus OD  / OS")]: "Value Pemeriksaan Visus OD  / OS",
  [normalizeKey("Tindik (selain anting) Wanita : hanya 1 / telinga")]: "Value (selain anting) Wanita : hanya 1 / telinga"
};

function getValueFieldName(parameterName: string) {
  return VALUE_FIELD_BY_PARAMETER[normalizeKey(parameterName)] || `Value ${parameterName}`;
}

function isValueOrScoreParameter(param: any) {
  const name = String(param.name || "").toLowerCase();
  return name.startsWith("value ") || name.startsWith("score ") || name.startsWith("total score");
}

function computeDerivedValues(parameters: any[], inputValues: Record<string, string>) {
  const next = { ...inputValues };
  const byName = new Map<string, any>();

  parameters.forEach((p) => {
    byName.set(normalizeKey(p.name), p);
  });

  parameters.forEach((p) => {
    if (String(p.input_type || "").toLowerCase() !== "radio") return;

    const selected = next[p.id];

    if (!selected) return;

    const score = scoreFor(p, selected);
    const valueFieldName = getValueFieldName(String(p.name || ""));
    const valueParam = byName.get(normalizeKey(valueFieldName));

    if (valueParam) {
      next[valueParam.id] = String(score);
    }
  });

  const scoreOf = (name: string) => {
    const p = byName.get(normalizeKey(name));
    if (!p) return 0;
    const selected = next[p.id];
    if (!selected) return 0;
    return scoreFor(p, selected);
  };

  const setTotal = (totalName: string, names: string[]) => {
    const totalParam = byName.get(normalizeKey(totalName));
    if (!totalParam) return;

    const total = names.reduce((sum, name) => sum + scoreOf(name), 0);
    next[totalParam.id] = String(total);
  };

  setTotal("Total Score Kesehatan mata", [
    "Lensakontak/ kaca mata",
    "Tes buta warna",
    "Strabismus / Juling",
    "Pemeriksaan Visus OD  / OS"
  ]);

  setTotal("Score total Pemeriksaan Kesehatan Gigi dan Mulut", [
    "Karang Gigi",
    "Caries Dentis",
    "Tumpatan Gigi",
    "Impaksi gigi",
    "Kehilangan Gigi (Baik depan maupun belakang)",
    "Infeksi Gusi",
    "Dental panoramic"
  ]);

  setTotal("Score total Pemeriksaan Kesehatan THT", [
    "Membran timpani",
    "Serumen",
    "Tonsil",
    "Rhinitis Alergi (divide)",
    "Epistaksis 1 tahun terakhir",
    "Tes Garputala (Weber) 512 Hz"
  ]);

  setTotal("Score Abdomen", [
    "Hernia",
    "NT Epigastrum",
    "Benjolan",
    "Liver",
    "Bising Usus",
    "Bekas Operasi (>6Bulan)"
  ]);

  setTotal("Score Pemeriksaan Anus & Rektum (Colok Dubur)", [
    "Hemoroid eksterna",
    "Hemoroid interna",
    "Fisura ani",
    "Struktur/Prolaps recti"
  ]);

  setTotal("Score Urogenitalia", [
    "Hidronefrosis",
    "Kelainan kongenital",
    "Hipospadia",
    "Hidrokel",
    "Undescensus testis",
    "Batu sal kemih",
    "Cystitis akut / kronis",
    "Post operasi varikokel",
    "Phimosis"
  ]);

  const pdTotal = byName.get(normalizeKey("Score total Pemeriksaan Penyakit Dalam"));
  if (pdTotal) {
    const simpleNames = [
      "Berat Badan (Kg)",
      "TB. (Cm)",
      "Tanda Vital",
      "Tato kulit",
      "Tindik (selain anting) Wanita : hanya 1 / telinga",
      "Pemeriksaan Fisik Jantung",
      "Pemeriksaan Fisik Paru",
      "Hernia",
      "NT Epigastrum",
      "Benjolan",
      "Liver",
      "Bising Usus",
      "Bekas Operasi (>6Bulan)",
      "Hemoroid eksterna",
      "Hemoroid interna",
      "Fisura ani",
      "Struktur/Prolaps recti",
      "Hidronefrosis",
      "Kelainan kongenital",
      "Hipospadia",
      "Hidrokel",
      "Undescensus testis",
      "Batu sal kemih",
      "Cystitis akut / kronis",
      "Post operasi varikokel",
      "Phimosis"
    ];
    next[pdTotal.id] = String(simpleNames.reduce((sum, name) => sum + scoreOf(name), 0));
  }

  setTotal("Score Anggota Gerak Atas", [
    "sindaktili",
    "polidaktili",
    "spina bifida",
    "mallet finger",
    "Hiperekstensi lengan"
  ]);

  setTotal("Score Anggota Gerak Bawah", [
    "Hammer toe",
    "Hallux valgus",
    "Webbed toe",
    "O/X bean",
    "Pes planus / kaki datar",
    "Polidactily",
    "Hiperekstensi kaki",
    "General Laxity"
  ]);

  setTotal("Score Vertebra / Tulang Belakang", [
    "Skoliosis",
    "Kifosis",
    "Lordosis"
  ]);

  const orthoTotal = byName.get(normalizeKey("Score total Pemeriksaan Ortopedi"));
  if (orthoTotal) {
    const names = [
      "sindaktili",
      "polidaktili",
      "spina bifida",
      "mallet finger",
      "Hiperekstensi lengan",
      "Hammer toe",
      "Hallux valgus",
      "Webbed toe",
      "O/X bean",
      "Pes planus / kaki datar",
      "Polidactily",
      "Hiperekstensi kaki",
      "General Laxity",
      "Skoliosis",
      "Kifosis",
      "Lordosis"
    ];
    next[orthoTotal.id] = String(names.reduce((sum, name) => sum + scoreOf(name), 0));
  }

  setTotal("Score Rontgen Whole Spine AP Lateral", [
    "Rontgen Whole Spine AP Lateral >> Skoliosis",
    "Rontgen Whole Spine AP Lateral >> Kifosis",
    "Rontgen Whole Spine AP Lateral >> Lordosis"
  ]);

  setTotal("Score total Pemeriksaan Penunjang Radiologi", [
    "Rontgen Whole Spine AP Lateral >> Skoliosis",
    "Rontgen Whole Spine AP Lateral >> Kifosis",
    "Rontgen Whole Spine AP Lateral >> Lordosis"
  ]);

  return next;
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
  const calculated = isValueOrScoreParameter(param);

  if (inputType === "radio") {
    return (
      <div className="mt-2 space-y-1">
        {options.map((opt: string) => (
          <label key={opt} className="flex w-fit cursor-pointer items-center gap-2 text-sm text-slate-800">
            <input
              type="radio"
              name={`param-${param.id}`}
              value={opt}
              checked={value === opt}
              onChange={(e) => onChange(e.target.value)}
            />
            <span>{opt}</span>
          </label>
        ))}
      </div>
    );
  }

  if (inputType === "select") {
    return (
      <select className="input" value={value || ""} onChange={(e) => onChange(e.target.value)}>
        <option value="">-</option>
        {options.map((opt: string) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    );
  }

  if (inputType === "textarea") {
    return <textarea className="input min-h-24" value={value || ""} onChange={(e) => onChange(e.target.value)} />;
  }

  return (
    <input
      type={inputType === "number" ? "number" : inputType === "date" ? "date" : "text"}
      className={`input ${calculated ? "bg-slate-50 font-bold text-slate-600" : ""}`}
      placeholder={String(param.name || "").toLowerCase().startsWith("value") ? "auto score" : ""}
      value={value || ""}
      readOnly={calculated}
      onChange={(e) => onChange(e.target.value)}
    />
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

  async function search(e: React.FormEvent) {
    e.preventDefault();
    setParticipant(null);
    setDetail(null);
    setMessage("");

    const res = await fetch(`/api/search/participants?program=${program}&source_id=${sourceId}&keyword=${encodeURIComponent(keyword)}&limit=50`);
    const json = await res.json();

    setResults(json.participants || []);

    if (!json.participants?.length) {
      setMessage("Peserta tidak ditemukan.");
    }
  }

  async function selectParticipant(p: any) {
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

    const initial: Record<string, string> = {};
    nextParameters.forEach((x: any) => {
      initial[x.id] = x.current_value || "";
    });
    setValues(computeDerivedValues(nextParameters, initial));
  }

  function updateValue(parameterId: string | number, nextValue: string) {
    const raw = { ...values, [parameterId]: nextValue };
    setValues(computeDerivedValues(parameters, raw));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");

    const finalValues = computeDerivedValues(parameters, values);
    setValues(finalValues);

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
    if (json.ok) await selectParticipant(participant);
  }

  return (
    <div className="space-y-5">
      <section className="card p-5">
        <div className="text-2xl font-black">Input CAPASKA</div>
        <div className="mt-1 text-sm text-slate-500">Login sebagai {user.post_name}. Operator hanya melihat parameter post masing-masing.</div>
      </section>

      <form onSubmit={search} className="card grid gap-3 p-4 md:grid-cols-[1fr_1fr_auto]">
        <select className="input" value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
          <option value="all">Semua Database Instansi</option>
          {sources.map((s) => <option key={s.id} value={s.id}>{s.name} - {s.institution_name || "-"}</option>)}
        </select>
        <input className="input" value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="Cari nama / scan barcode / ID" />
        <button className="btn-primary">Cari Peserta</button>
      </form>

      {message && <div className="rounded-xl bg-blue-50 p-3 text-sm font-semibold text-blue-700">{message}</div>}

      {!!results.length && (
        <section className="card p-4">
          <div className="mb-3 font-black">Hasil Pencarian</div>
          <div className="grid gap-2">
            {results.map((p) => (
              <button key={p.id} onClick={() => selectParticipant(p)} className="rounded-xl border border-slate-200 bg-white p-3 text-left hover:bg-blue-50">
                <div className="font-bold">{p.name}</div>
                <div className="text-sm text-slate-500">{p.mcu_id || "-"} · {p.province || "-"} · {p.source_name || "-"}</div>
              </button>
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
