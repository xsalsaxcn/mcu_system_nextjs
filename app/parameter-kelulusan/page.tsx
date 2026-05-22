"use client";

import { useEffect, useState } from "react";
import AuthGate from "@/components/AuthGate";

type RuleRow = {
  package_id: number;
  package_name: string;
  program_type: string;
  pass_min_score: number;
  pass_max_score: number;
  description?: string;
};

export default function ParameterKelulusanPage() {
  return (
    <AuthGate>
      {(user) => <ParameterKelulusan user={user} />}
    </AuthGate>
  );
}

function ParameterKelulusan({ user }: { user: any }) {
  const [program, setProgram] = useState(user.program_type === "all" ? "capaska" : user.program_type || "capaska");
  const [rules, setRules] = useState<RuleRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const canEdit = user.role === "admin";

  useEffect(() => {
    loadRules();
  }, [program]);

  async function loadRules() {
    setLoading(true);
    setMessage("Memuat parameter kelulusan...");

    try {
      const res = await fetch(`/api/graduation-rules?program=${program}`, { cache: "no-store" });
      const json = await res.json();

      if (!json.ok) {
        setRules([]);
        setMessage(json.message || "Gagal memuat parameter kelulusan.");
        return;
      }

      setRules(json.rules || []);
      setMessage("Parameter kelulusan siap diedit.");
    } catch (err: any) {
      setRules([]);
      setMessage(err?.message || "Gagal memuat parameter kelulusan.");
    } finally {
      setLoading(false);
    }
  }

  function updateRule(index: number, field: keyof RuleRow, value: any) {
    setRules((prev) => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        [field]: field === "pass_min_score" || field === "pass_max_score" ? Number(value || 0) : value
      };
      return next;
    });
  }

  async function saveRules() {
    if (!canEdit) {
      setMessage("Hanya admin yang bisa menyimpan parameter kelulusan.");
      return;
    }

    setSaving(true);
    setMessage("Menyimpan parameter kelulusan...");

    try {
      const res = await fetch("/api/graduation-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ program_type: program, rules })
      });

      const json = await res.json();

      if (!json.ok) {
        setMessage(json.message || "Gagal menyimpan parameter kelulusan.");
        return;
      }

      setMessage("Parameter kelulusan berhasil disimpan.");
    } catch (err: any) {
      setMessage(err?.message || "Gagal menyimpan parameter kelulusan.");
    } finally {
      setSaving(false);
    }
  }

  if (user.role !== "admin") {
    return (
      <div className="card p-5 text-red-700">
        Hanya admin yang dapat mengubah Parameter Kelulusan.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="text-2xl font-black">Parameter Kelulusan</div>
        <div className="mt-1 text-sm text-slate-500">
          Atur range total score untuk menentukan LULUS / TIDAK LULUS. Peserta baru dinilai lulus/tidak lulus setelah seluruh stage pemeriksaan selesai.
        </div>
        <div className="mt-2 w-fit rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
          Parameter Kelulusan v33 · range total score
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid items-end gap-3 md:grid-cols-[240px_auto_auto]">
          <div>
            <label className="label">Program</label>
            <select className="input" value={program} onChange={(e) => setProgram(e.target.value)}>
              <option value="capaska">CAPASKA</option>
              <option value="corporate">Corporate</option>
            </select>
          </div>

          <button type="button" className="btn-secondary" onClick={loadRules} disabled={loading}>
            {loading ? "Memuat..." : "Refresh"}
          </button>

          <button type="button" className="btn-primary" onClick={saveRules} disabled={saving}>
            {saving ? "Menyimpan..." : "Save Parameter"}
          </button>
        </div>

        {message && (
          <div className="mt-4 rounded-xl bg-blue-50 p-3 text-sm font-semibold text-blue-700">
            {message}
          </div>
        )}
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-3 text-xl font-black">Range Lulus per Paket</div>
        <div className="mb-4 rounded-2xl bg-amber-50 p-4 text-sm font-semibold text-amber-800">
          Logika: peserta dianggap <b>LULUS</b> jika sudah <b>Selesai semua stage</b> dan total score berada di antara Min Score dan Max Score. Jika selesai tapi score di luar range, masuk <b>TIDAK LULUS</b>.
        </div>

        <div className="mobile-table">
          <table>
            <thead>
              <tr>
                <th>Paket Pemeriksaan</th>
                <th>Min Score Lulus</th>
                <th>Max Score Lulus</th>
                <th>Keterangan</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule, index) => (
                <tr key={rule.package_id}>
                  <td className="font-bold">{rule.package_name}</td>
                  <td>
                    <input
                      type="number"
                      className="input"
                      value={rule.pass_min_score}
                      onChange={(e) => updateRule(index, "pass_min_score", e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      className="input"
                      value={rule.pass_max_score}
                      onChange={(e) => updateRule(index, "pass_max_score", e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      className="input"
                      value={rule.description || ""}
                      onChange={(e) => updateRule(index, "description", e.target.value)}
                      placeholder="Contoh: Lulus jika score 0-10"
                    />
                  </td>
                </tr>
              ))}
              {!rules.length && (
                <tr>
                  <td colSpan={4} className="p-5 text-center text-slate-500">Belum ada paket.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
