"use client";

import { useState } from "react";
import AuthGate from "@/components/AuthGate";

export default function ReviewPage() {
  return (
    <AuthGate>
      {(user) => <Review user={user} />}
    </AuthGate>
  );
}

function Review({ user }: { user: any }) {
  const program = user.program_type === "all" ? "capaska" : user.program_type;
  const [keyword, setKeyword] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [participant, setParticipant] = useState<any>(null);
  const [detail, setDetail] = useState<any>(null);
  const [reviewStatus, setReviewStatus] = useState("Sudah Direview");
  const [decision, setDecision] = useState("Menunggu");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");

  async function search(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch(`/api/search/participants?program=${program}&keyword=${encodeURIComponent(keyword)}&limit=50`);
    const json = await res.json();
    setResults(json.participants || []);
  }

  async function selectParticipant(p: any) {
    setParticipant(p);
    setResults([]);
    const res = await fetch(`/api/review?participant_id=${p.id}`);
    const json = await res.json();
    setDetail(json);
    setReviewStatus(json.review?.review_status || "Sudah Direview");
    setDecision(json.review?.final_decision || "Menunggu");
    setNote(json.review?.doctor_note || "");
  }

  async function saveReview(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        participant_id: participant.id,
        review_status: reviewStatus,
        final_decision: decision,
        doctor_note: note
      })
    });
    const json = await res.json();
    setMessage(json.ok ? "Review berhasil disimpan." : json.message || "Gagal menyimpan review.");
  }

  return (
    <div className="space-y-5">
      <section className="card p-5">
        <div className="text-2xl font-black">Review Hasil</div>
        <div className="mt-1 text-sm text-slate-500">Dokter/supervisor dapat melihat semua hasil dan menyimpan keputusan akhir.</div>
      </section>

      <form onSubmit={search} className="card grid gap-3 p-4 md:grid-cols-[1fr_auto]">
        <input className="input" value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="Cari nama / ID / barcode" />
        <button className="btn-primary">Cari Peserta</button>
      </form>

      {!!results.length && (
        <section className="card p-4">
          <div className="grid gap-2">
            {results.map((p) => (
              <button key={p.id} onClick={() => selectParticipant(p)} className="rounded-xl border border-slate-200 p-3 text-left hover:bg-blue-50">
                <div className="font-bold">{p.name}</div>
                <div className="text-sm text-slate-500">{p.mcu_id || "-"} · {p.province || "-"}</div>
              </button>
            ))}
          </div>
        </section>
      )}

      {detail?.ok && participant && (
        <>
          <section className="card p-4">
            <div className="text-xl font-black">{participant.name}</div>
            <div className="text-sm text-slate-500">{participant.mcu_id} · {participant.province || "-"}</div>

            <div className="mobile-table mt-4">
              <table>
                <thead>
                  <tr>
                    <th>Post</th>
                    <th>Parameter</th>
                    <th>Nilai</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.results.map((r: any) => (
                    <tr key={`${r.post_name}-${r.parameter_id}`}>
                      <td>{r.post_name}</td>
                      <td>{r.parameter_name}</td>
                      <td>{r.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <form onSubmit={saveReview} className="card space-y-4 p-5">
            <div className="text-lg font-black">Simpan Review</div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="label">Status Review</label>
                <select className="input" value={reviewStatus} onChange={(e) => setReviewStatus(e.target.value)}>
                  <option>Belum Direview</option>
                  <option>Sudah Direview</option>
                  <option>Perlu Recheck</option>
                </select>
              </div>
              <div>
                <label className="label">Keputusan Akhir</label>
                <select className="input" value={decision} onChange={(e) => setDecision(e.target.value)}>
                  <option>Menunggu</option>
                  <option>Layak</option>
                  <option>Tidak Layak</option>
                  <option>Perlu Pemeriksaan Lanjutan</option>
                </select>
              </div>
            </div>
            <div>
              <label className="label">Catatan</label>
              <textarea className="input min-h-28" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <button className="btn-primary">Simpan Review Hasil</button>
            {message && <div className="rounded-xl bg-blue-50 p-3 text-sm font-semibold text-blue-700">{message}</div>}
          </form>
        </>
      )}
    </div>
  );
}
