"use client";

import { useEffect, useState } from "react";
import AuthGate from "@/components/AuthGate";

export default function CleanupPage() {
  return <AuthGate>{(user) => <Cleanup user={user} />}</AuthGate>;
}

function Cleanup({ user }: { user: any }) {
  const [program, setProgram] = useState("all");
  const [sources, setSources] = useState<any[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<any>(null);

  const selectedSource = sources.find((s) => String(s.id) === String(selectedSourceId));

  async function loadSources() {
    setLoading(true);
    setMessage("");
    setResult(null);

    try {
      const res = await fetch(`/api/cleanup/sources?program=${program}`);
      const json = await res.json();
      if (!json.ok) {
        setMessage(json.message || "Gagal memuat database.");
        setSources([]);
        return;
      }
      setSources(json.sources || []);
    } catch (error: any) {
      setMessage(error?.message || "Gagal memuat database.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (user?.role === "admin") loadSources();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [program]);

  async function deleteSource() {
    if (!selectedSourceId) {
      setMessage("Pilih database yang akan dihapus.");
      return;
    }
    if (confirm.trim().toUpperCase() !== "HAPUS") {
      setMessage("Konfirmasi salah. Ketik HAPUS.");
      return;
    }

    const yes = window.confirm(
      `Yakin hapus database "${selectedSource?.name}" dan semua peserta/hasil/review terkait? Aksi ini tidak bisa dibatalkan.`
    );
    if (!yes) return;

    setLoading(true);
    setMessage("");
    setResult(null);

    try {
      const res = await fetch("/api/cleanup/sources", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source_id: Number(selectedSourceId), confirm })
      });
      const json = await res.json();
      if (!json.ok) {
        setMessage(json.message || "Gagal hapus database.");
        return;
      }
      setResult(json.deleted);
      setMessage("Database berhasil dihapus.");
      setSelectedSourceId("");
      setConfirm("");
      await loadSources();
    } catch (error: any) {
      setMessage(error?.message || "Gagal hapus database.");
    } finally {
      setLoading(false);
    }
  }

  if (user.role !== "admin") return <div className="card p-5 text-red-700">Hanya admin yang dapat hapus database.</div>;

  return (
    <div className="space-y-5">
      <section className="card p-5">
        <div className="text-2xl font-black">Cleansing / Hapus Database</div>
        <div className="mt-1 text-sm text-slate-500">
          Fitur ini menghapus database/source peserta, peserta, hasil pemeriksaan, review, dan audit terkait. Aksi tidak bisa dibatalkan.
        </div>
      </section>

      <section className="card space-y-4 p-5">
        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <div>
            <label className="label">Filter Program</label>
            <select className="input" value={program} onChange={(e) => setProgram(e.target.value)}>
              <option value="all">Semua Program</option>
              <option value="capaska">CAPASKA</option>
              <option value="corporate">Corporate</option>
            </select>
          </div>
          <div className="flex items-end">
            <button className="btn-secondary" onClick={loadSources} disabled={loading}>{loading ? "Memuat..." : "Refresh"}</button>
          </div>
        </div>

        <div>
          <label className="label">Pilih Database yang Akan Dihapus</label>
          <select className="input" value={selectedSourceId} onChange={(e) => setSelectedSourceId(e.target.value)}>
            <option value="">- Pilih Database -</option>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} - {s.institution_name || "-"} | {s.program_type || "-"} | Peserta: {s.participants_count || 0} | Source ID: {s.id}
              </option>
            ))}
          </select>
        </div>

        {selectedSource && (
          <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">
            <div className="font-black">Database yang akan dihapus:</div>
            <div>{selectedSource.name}</div>
            <div>Instansi: {selectedSource.institution_name || "-"}</div>
            <div>Program: {selectedSource.program_type || "-"}</div>
            <div>Peserta: {selectedSource.participants_count || 0}</div>
          </div>
        )}

        <div>
          <label className="label">Ketik HAPUS untuk konfirmasi</label>
          <input className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="HAPUS" />
        </div>

        <button
          className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-red-700 disabled:opacity-50"
          onClick={deleteSource}
          disabled={loading || !selectedSourceId}
        >
          {loading ? "Memproses..." : "Hapus Database"}
        </button>

        {message && (
          <div className={`rounded-xl p-3 text-sm font-semibold ${message.includes("berhasil") ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
            {message}
          </div>
        )}

        {result && <pre className="max-h-80 overflow-auto rounded-xl bg-slate-900 p-4 text-xs text-white">{JSON.stringify(result, null, 2)}</pre>}
      </section>

      <section className="mobile-table">
        <table>
          <thead>
            <tr>
              <th>Source ID</th>
              <th>Database</th>
              <th>Instansi</th>
              <th>Program</th>
              <th>Peserta</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((s) => (
              <tr key={s.id}>
                <td>{s.id}</td>
                <td className="font-bold">{s.name}</td>
                <td>{s.institution_name || "-"}</td>
                <td>{s.program_type || "-"}</td>
                <td>{s.participants_count || 0}</td>
                <td>{s.created_at ? new Date(s.created_at).toLocaleString("id-ID") : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
