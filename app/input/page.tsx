"use client";

import { useEffect, useState } from "react";
import AuthGate from "@/components/AuthGate";
import StageProgress from "@/components/StageProgress";

export default function InputPage() {
  return (
    <AuthGate>
      {(user) => <InputForm user={user} />}
    </AuthGate>
  );
}

function parseOptions(config: any) {
  try {
    const parsed = JSON.parse(config || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
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

  useEffect(() => {
    fetch(`/api/sources?program=${program}`)
      .then((r) => r.json())
      .then((d) => setSources(d.sources || []));
  }, [program]);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    setParticipant(null);
    setDetail(null);
    const res = await fetch(`/api/search/participants?program=${program}&source_id=${sourceId}&keyword=${encodeURIComponent(keyword)}&limit=50`);
    const json = await res.json();
    setResults(json.participants || []);
  }

  async function selectParticipant(p: any) {
    setParticipant(p);
    setResults([]);
    const detailRes = await fetch(`/api/participant?id=${p.id}`);
    const detailJson = await detailRes.json();
    setDetail(detailJson);

    const paramRes = await fetch(`/api/parameters?participant_id=${p.id}&package_id=${p.package_id}&post_id=${user.post_id}`);
    const paramJson = await paramRes.json();
    setParameters(paramJson.parameters || []);

    const initial: Record<string, string> = {};
    (paramJson.parameters || []).forEach((x: any) => (initial[x.id] = x.current_value || ""));
    setValues(initial);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");

    const res = await fetch("/api/results/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        participant_id: participant.id,
        post_id: user.post_id,
        values
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
        <form onSubmit={save} className="card space-y-4 p-5">
          <div className="text-lg font-black">Form {user.post_name}</div>
          {!parameters.length && <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-700">Tidak ada parameter untuk post ini. Klik Seed Defaults di Master Users atau cek mapping package.</div>}

          {parameters.map((param) => {
            const options = parseOptions(param.config_json);
            return (
              <div key={param.id}>
                <label className="label">{param.name}</label>
                {param.reference_text && <div className="mb-2 text-xs text-slate-500">{param.reference_text}</div>}
                {param.input_type === "select" || options.length ? (
                  <select className="input" value={values[param.id] || ""} onChange={(e) => setValues({ ...values, [param.id]: e.target.value })}>
                    {(options.length ? options : ["", "Done", "Belum", "Normal", "Abnormal"]).map((opt: string) => <option key={opt} value={opt}>{opt || "-"}</option>)}
                  </select>
                ) : param.input_type === "textarea" ? (
                  <textarea className="input min-h-24" value={values[param.id] || ""} onChange={(e) => setValues({ ...values, [param.id]: e.target.value })} />
                ) : (
                  <input className="input" value={values[param.id] || ""} onChange={(e) => setValues({ ...values, [param.id]: e.target.value })} />
                )}
              </div>
            );
          })}

          <button className="btn-primary" disabled={!parameters.length}>Simpan Hasil Pemeriksaan</button>
          {message && <div className="rounded-xl bg-blue-50 p-3 text-sm font-semibold text-blue-700">{message}</div>}
        </form>
      )}
    </div>
  );
}
