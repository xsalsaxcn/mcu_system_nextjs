"use client";

import { useEffect, useMemo, useState } from "react";
import AuthGate from "@/components/AuthGate";
import StageProgress from "@/components/StageProgress";
import {
  computeCapaskaDerivedValues,
  isCapaskaValueOrScoreParameter,
  parseCapaskaOptions,
  scoreCapaskaChoice,
} from "@/lib/shared/capaskaScoring2026";

function parseOptions(config: any) {
  return parseCapaskaOptions(config);
}

function scoreFor(param: any, selectedValue: string) {
  return scoreCapaskaChoice(param, selectedValue);
}

function isValueOrScoreParameter(param: any) {
  return isCapaskaValueOrScoreParameter(param);
}

function computeDerivedValues(parameters: any[], inputValues: Record<string, string>) {
  return computeCapaskaDerivedValues(parameters, inputValues);
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

export default function InputCorporatePage() {
  return (
    <AuthGate>
      {(user) => <InputForm user={user} />}
    </AuthGate>
  );
}

function InputForm({ user }: { user: any }) {
  const program = "corporate";
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
        <div className="text-2xl font-black">Input MCU Corporate</div>
        <div className="mt-1 text-sm text-slate-500">Login sebagai {user.post_name}. Operator hanya melihat parameter post masing-masing.</div>
      </section>

      <form onSubmit={search} className="card grid gap-3 p-4 md:grid-cols-[1fr_1fr_auto]">
        <select className="input" value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
          <option value="all">Semua Database Corporate</option>
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
