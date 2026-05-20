"use client";

import { useEffect, useMemo, useState } from "react";
import AuthGate from "@/components/AuthGate";
import StageProgress from "@/components/StageProgress";

function norm(text: any) {
  return String(text || "")
    .toLowerCase()
    .replace(/[\s\n\r\t.,\-_\/\\><:;()]/g, "");
}

function parseOptions(config: any): string[] {
  try {
    const parsed = JSON.parse(config || "[]");
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function scoreByChoice(parameterName: string, selectedValue: string, category?: string): number {
  const key = `${norm(parameterName)}::${norm(selectedValue)}`;

  const exact: Record<string, number> = {
    // Mata
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

    // Gigi
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

    // Penyakit Dalam
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

    // Jantung
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
  const cat = norm(category || "");

  if (selected === norm("Normal")) return 2;
  if (selected === norm("Tidak Normal")) return 0;
  if (selected === norm("Tidak Ada")) return 2;
  if (selected === norm("Ada")) return 0;
  if (selected === norm("Ringan")) return 1;
  if (selected === norm("Sedang")) return 0;
  if (selected === norm("Berat")) return 0;
  if (selected === norm("Sesuai juknis")) return 2;
  if (selected === norm("Tidak sesuai juknis")) return 0;

  if (cat.includes("ortopedi") || cat.includes("gerak") || cat.includes("vertebra")) {
    if (selected === norm("Tidak Ada")) return 2;
    if (selected === norm("Ada")) return 0;
  }

  return 0;
}

function isAutoField(param: any) {
  const name = String(param.name || "").toLowerCase();
  return name.startsWith("value ") || name.startsWith("score ") || name.startsWith("total score");
}

const SPECIAL_VALUE_FIELD: Record<string, string> = {
  [norm("Lensakontak/ kaca mata")]: "Value Lensakontak/ kaca mata",
  [norm("Lensakontak / kaca mata")]: "Value Lensakontak/ kaca mata",
  [norm("Tes buta warna")]: "Value buta warna",
  [norm("Strabismus / Juling")]: "Value Strabismus / Juling",
  [norm("Pemeriksaan Visus OD / OS")]: "Value Pemeriksaan Visus OD  / OS",
  [norm("Pemeriksaan Visus OD  / OS")]: "Value Pemeriksaan Visus OD  / OS",
  [norm("Tindik (selain anting) Wanita : hanya 1 / telinga")]: "Value (selain anting) Wanita : hanya 1 / telinga"
};

function valueFieldName(parameterName: string) {
  return SPECIAL_VALUE_FIELD[norm(parameterName)] || `Value ${parameterName}`;
}

function computeAutoValues(parameters: any[], values: Record<string, string>) {
  const next = { ...values };
  const byName = new Map<string, any>();

  parameters.forEach((p) => {
    byName.set(norm(p.name), p);
  });

  parameters.forEach((p) => {
    if (isAutoField(p)) return;

    const options = parseOptions(p.config_json);
    if (!options.length) return;

    const selected = next[p.id];
    if (!selected) return;

    const valueParam = byName.get(norm(valueFieldName(p.name)));
    if (!valueParam) return;

    next[valueParam.id] = String(scoreByChoice(p.name, selected, p.category));
  });

  const scoreOf = (name: string) => {
    const p = byName.get(norm(name));
    if (!p) return 0;

    const selected = next[p.id];
    if (!selected) return 0;

    return scoreByChoice(p.name, selected, p.category);
  };

  const setTotal = (totalName: string, names: string[]) => {
    const totalParam = byName.get(norm(totalName));
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
    "Dental panoramic",
    "Dental panoramik"
  ]);

  setTotal("Score total Pemeriksaan Kesehatan THT", [
    "Membran timpani",
    "Serumen",
    "Tonsil",
    "Rhinitis Alergi (divide)",
    "Rhinitis Alergi (Bividas)",
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

  const pdTotal = byName.get(norm("Score total Pemeriksaan Penyakit Dalam"));
  if (pdTotal) {
    next[pdTotal.id] = String([
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
    ].reduce((sum, name) => sum + scoreOf(name), 0));
  }

  setTotal("Score total Pemeriksaan Kesehatan Jantung dan Pembuluh Darah", [
    "Kelainan Anatomi Jantung",
    "Kelainan Irama Jantung",
    "Iskemik Miocardial",
    "Kelainan kongenital jantung",
    "Varises Tungkai (insufisiensi vena)",
    "Kelainan Arteri pada ekstremitas"
  ]);

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

  const orthoTotal = byName.get(norm("Score total Pemeriksaan Ortopedi"));
  if (orthoTotal) {
    next[orthoTotal.id] = String([
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
    ].reduce((sum, name) => sum + scoreOf(name), 0));
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
  const auto = isAutoField(param);

  if (options.length && (inputType === "radio" || inputType === "select")) {
    return (
      <select
        className="input"
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">-</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    );
  }

  if (inputType === "textarea") {
    return (
      <textarea
        className="input min-h-24"
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  return (
    <input
      type={inputType === "number" ? "number" : inputType === "date" ? "date" : "text"}
      className={`input ${auto ? "bg-slate-100 font-bold text-slate-700" : ""}`}
      placeholder={auto ? "auto score" : ""}
      value={value || ""}
      readOnly={auto}
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

    setValues(computeAutoValues(nextParameters, initial));
  }

  function updateValue(parameterId: number | string, nextValue: string) {
    const raw = { ...values, [parameterId]: nextValue };
    setValues(computeAutoValues(parameters, raw));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");

    const finalValues = computeAutoValues(parameters, values);
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
