"use client";

import { useEffect, useMemo, useState } from "react";
import AuthGate from "@/components/AuthGate";

type Parameter = {
  id: number;
  name: string;
  category?: string;
  post_id: number;
  post_name?: string;
  unit?: string;
  input_type?: string;
  normal_value?: string;
  reference_text?: string;
  config_json?: string;
  is_required?: number;
  is_active?: number;
  sort_order?: number;
  program_type?: string;
};

type Post = {
  id: number;
  name: string;
};

type Package = {
  id: number;
  name: string;
  company_name?: string;
  program_type?: string;
};

const emptyForm = {
  id: "",
  post_id: "",
  name: "",
  category: "",
  unit: "",
  input_type: "text",
  normal_value: "",
  reference_text: "",
  options_text: "",
  is_required: false,
  is_active: true,
  sort_order: 0
};

export default function SetupParametersPage() {
  return (
    <AuthGate>
      {(user) => <SetupParameters user={user} />}
    </AuthGate>
  );
}

function parseOptions(configJson?: string) {
  try {
    const parsed = JSON.parse(configJson || "[]");
    return Array.isArray(parsed) ? parsed.join("\n") : "";
  } catch {
    return "";
  }
}

function SetupParameters({ user }: { user: any }) {
  const [programType, setProgramType] = useState("capaska");
  const [posts, setPosts] = useState<Post[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [parameters, setParameters] = useState<Parameter[]>([]);
  const [mappings, setMappings] = useState<any[]>([]);
  const [selectedPackageId, setSelectedPackageId] = useState("");
  const [selectedParamIds, setSelectedParamIds] = useState<Record<number, boolean>>({});
  const [form, setForm] = useState<any>(emptyForm);
  const [packageForm, setPackageForm] = useState({
    company_name: "BPIP / CAPASKA",
    package_name: "CAPASKA 2025/2026",
    description: ""
  });
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const activeParameters = useMemo(() => {
    return parameters.filter((p) => p.is_active === 1 || p.is_active === true);
  }, [parameters]);

  const groupedParameters = useMemo(() => {
    const groups: Record<string, Parameter[]> = {};

    activeParameters.forEach((param) => {
      const key = param.post_name || "Tanpa Post";
      if (!groups[key]) groups[key] = [];
      groups[key].push(param);
    });

    return groups;
  }, [activeParameters]);

  if (user.role !== "admin") {
    return <div className="card p-5 text-red-700">Hanya admin yang dapat setup parameter.</div>;
  }

  async function loadData(nextProgram = programType) {
    setLoading(true);
    setMessage("");

    try {
      const res = await fetch(`/api/setup/parameters?program_type=${nextProgram}`);
      const json = await res.json();

      if (!json.ok) {
        setMessage(json.message || "Gagal memuat data setup parameter.");
        return;
      }

      setPosts(json.posts || []);
      setPackages(json.packages || []);
      setParameters(json.parameters || []);
      setMappings(json.mappings || []);

      if (json.packages?.length && !selectedPackageId) {
        setSelectedPackageId(String(json.packages[0].id));
      }
    } catch (error: any) {
      setMessage(error?.message || "Gagal memuat data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData(programType);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [programType]);

  useEffect(() => {
    const next: Record<number, boolean> = {};

    mappings
      .filter((m) => String(m.package_id) === String(selectedPackageId))
      .forEach((m) => {
        next[Number(m.parameter_id)] = true;
      });

    setSelectedParamIds(next);
  }, [selectedPackageId, mappings]);

  function changeProgram(next: string) {
    setProgramType(next);
    setSelectedPackageId("");
    setSelectedParamIds({});
    setForm(emptyForm);

    if (next === "corporate") {
      setPackageForm({
        company_name: "Corporate",
        package_name: "MCU Corporate Basic",
        description: ""
      });
    } else {
      setPackageForm({
        company_name: "BPIP / CAPASKA",
        package_name: "CAPASKA 2025/2026",
        description: ""
      });
    }
  }

  function editParameter(param: Parameter) {
    setForm({
      id: String(param.id),
      post_id: String(param.post_id),
      name: param.name || "",
      category: param.category || "",
      unit: param.unit || "",
      input_type: param.input_type || "text",
      normal_value: param.normal_value || "",
      reference_text: param.reference_text || "",
      options_text: parseOptions(param.config_json),
      is_required: !!param.is_required,
      is_active: param.is_active !== 0,
      sort_order: param.sort_order || 0
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function saveParameter(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const res = await fetch("/api/setup/parameters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          program_type: programType,
          post_id: Number(form.post_id),
          id: form.id ? Number(form.id) : null
        })
      });

      const json = await res.json();

      if (!json.ok) {
        setMessage(json.message || "Gagal menyimpan parameter.");
        return;
      }

      setMessage(form.id ? "Parameter berhasil diupdate." : "Parameter berhasil dibuat.");
      setForm(emptyForm);
      await loadData(programType);
    } catch (error: any) {
      setMessage(error?.message || "Gagal menyimpan parameter.");
    } finally {
      setLoading(false);
    }
  }

  async function deleteParameter(param: Parameter) {
    const yes = window.confirm(`Hapus parameter "${param.name}"? Mapping ke paket juga ikut dihapus.`);
    if (!yes) return;

    setLoading(true);
    setMessage("");

    try {
      const res = await fetch(`/api/setup/parameters?id=${param.id}`, { method: "DELETE" });
      const json = await res.json();

      if (!json.ok) {
        setMessage(json.message || "Gagal hapus parameter.");
        return;
      }

      setMessage("Parameter berhasil dihapus.");
      await loadData(programType);
    } catch (error: any) {
      setMessage(error?.message || "Gagal hapus parameter.");
    } finally {
      setLoading(false);
    }
  }

  async function createPackage(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const res = await fetch("/api/setup/packages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...packageForm,
          program_type: programType
        })
      });

      const json = await res.json();

      if (!json.ok) {
        setMessage(json.message || "Gagal membuat paket pemeriksaan.");
        return;
      }

      setMessage(json.mode === "updated" ? "Paket berhasil diupdate." : "Paket berhasil dibuat.");
      await loadData(programType);
      setSelectedPackageId(String(json.package_id));
    } catch (error: any) {
      setMessage(error?.message || "Gagal membuat paket.");
    } finally {
      setLoading(false);
    }
  }

  async function saveMapping() {
    if (!selectedPackageId) {
      setMessage("Pilih paket pemeriksaan/instansi dulu.");
      return;
    }

    const parameterIds = Object.entries(selectedParamIds)
      .filter(([, checked]) => checked)
      .map(([id]) => Number(id));

    setLoading(true);
    setMessage("");

    try {
      const res = await fetch("/api/setup/parameters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "mapping",
          package_id: Number(selectedPackageId),
          parameter_ids: parameterIds
        })
      });

      const json = await res.json();

      if (!json.ok) {
        setMessage(json.message || "Gagal menyimpan mapping parameter.");
        return;
      }

      setMessage(`Mapping berhasil disimpan. Total parameter aktif untuk paket ini: ${json.mapped}.`);
      await loadData(programType);
    } catch (error: any) {
      setMessage(error?.message || "Gagal menyimpan mapping.");
    } finally {
      setLoading(false);
    }
  }

  function selectAllProgram(checked: boolean) {
    const next: Record<number, boolean> = {};

    activeParameters.forEach((param) => {
      next[param.id] = checked;
    });

    setSelectedParamIds(next);
  }

  return (
    <div className="space-y-5">
      <section className="card p-5">
        <div className="text-2xl font-black">Setup Parameter Pemeriksaan</div>
        <div className="mt-1 text-sm text-slate-500">
          Admin dapat membuat parameter pemeriksaan dan memilih parameter mana yang dipakai untuk paket/instansi CAPASKA maupun Corporate.
        </div>

        <div className="mt-4 max-w-sm">
          <label className="label">Program</label>
          <select className="input" value={programType} onChange={(e) => changeProgram(e.target.value)}>
            <option value="capaska">CAPASKA / BPIP</option>
            <option value="corporate">Corporate MCU</option>
          </select>
        </div>

        {message && (
          <div className="mt-4 rounded-xl bg-blue-50 p-3 text-sm font-semibold text-blue-700">
            {message}
          </div>
        )}
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <form onSubmit={createPackage} className="card space-y-4 p-5">
          <div>
            <div className="text-xl font-black">1. Buat Paket / Instansi</div>
            <div className="mt-1 text-sm text-slate-500">
              Paket ini yang akan dipilih saat import peserta. Parameter operator mengikuti mapping paket ini.
            </div>
          </div>

          <div>
            <label className="label">Nama Instansi / Perusahaan</label>
            <input
              className="input"
              value={packageForm.company_name}
              onChange={(e) => setPackageForm({ ...packageForm, company_name: e.target.value })}
              placeholder="BPIP / CAPASKA atau Nama Perusahaan"
            />
          </div>

          <div>
            <label className="label">Nama Paket Pemeriksaan</label>
            <input
              className="input"
              value={packageForm.package_name}
              onChange={(e) => setPackageForm({ ...packageForm, package_name: e.target.value })}
              placeholder="CAPASKA 2025/2026 atau MCU Corporate Basic"
            />
          </div>

          <div>
            <label className="label">Deskripsi</label>
            <textarea
              className="input min-h-24"
              value={packageForm.description}
              onChange={(e) => setPackageForm({ ...packageForm, description: e.target.value })}
            />
          </div>

          <button className="btn-primary" disabled={loading}>
            Simpan Paket
          </button>
        </form>

        <form onSubmit={saveParameter} className="card space-y-4 p-5">
          <div>
            <div className="text-xl font-black">2. Tambah / Edit Parameter</div>
            <div className="mt-1 text-sm text-slate-500">
              Parameter akan tampil di form operator sesuai post pemeriksaan.
            </div>
          </div>

          <div>
            <label className="label">Post Pemeriksaan</label>
            <select
              className="input"
              value={form.post_id}
              onChange={(e) => setForm({ ...form, post_id: e.target.value })}
              required
            >
              <option value="">- Pilih Post -</option>
              {posts.map((post) => (
                <option key={post.id} value={post.id}>{post.name}</option>
              ))}
            </select>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="label">Nama Parameter</label>
              <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>

            <div>
              <label className="label">Kategori</label>
              <input className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Opsional" />
            </div>

            <div>
              <label className="label">Tipe Input</label>
              <select className="input" value={form.input_type} onChange={(e) => setForm({ ...form, input_type: e.target.value })}>
                <option value="text">Text</option>
                <option value="number">Number</option>
                <option value="select">Dropdown / Select</option>
                <option value="textarea">Textarea</option>
                <option value="date">Tanggal</option>
              </select>
            </div>

            <div>
              <label className="label">Unit</label>
              <input className="input" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="kg, cm, mmHg, mg/dL" />
            </div>

            <div>
              <label className="label">Normal Value</label>
              <input className="input" value={form.normal_value} onChange={(e) => setForm({ ...form, normal_value: e.target.value })} />
            </div>

            <div>
              <label className="label">Sort Order</label>
              <input type="number" className="input" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value || 0) })} />
            </div>
          </div>

          <div>
            <label className="label">Opsi Dropdown</label>
            <textarea
              className="input min-h-24"
              value={form.options_text}
              onChange={(e) => setForm({ ...form, options_text: e.target.value })}
              placeholder={"Isi satu opsi per baris, contoh:\nNormal\nAbnormal\nPerlu Review"}
            />
          </div>

          <div>
            <label className="label">Reference / Catatan Panduan</label>
            <textarea className="input min-h-20" value={form.reference_text} onChange={(e) => setForm({ ...form, reference_text: e.target.value })} />
          </div>

          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input type="checkbox" checked={form.is_required} onChange={(e) => setForm({ ...form, is_required: e.target.checked })} />
              Wajib diisi
            </label>
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
              Aktif
            </label>
          </div>

          <div className="flex gap-2">
            <button className="btn-primary" disabled={loading}>{form.id ? "Update Parameter" : "Tambah Parameter"}</button>
            {form.id && (
              <button type="button" className="btn-secondary" onClick={() => setForm(emptyForm)}>
                Batal Edit
              </button>
            )}
          </div>
        </form>
      </section>

      <section className="card p-5">
        <div className="mb-4">
          <div className="text-xl font-black">3. Pilih Parameter untuk Paket / Instansi</div>
          <div className="mt-1 text-sm text-slate-500">
            Checklist parameter yang digunakan untuk paket ini. Saat peserta diimport memakai paket tersebut, operator hanya melihat parameter yang dichecklist.
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto_auto]">
          <select className="input" value={selectedPackageId} onChange={(e) => setSelectedPackageId(e.target.value)}>
            <option value="">- Pilih Paket Pemeriksaan -</option>
            {packages.map((pkg) => (
              <option key={pkg.id} value={pkg.id}>
                {pkg.name} - {pkg.company_name || "-"}
              </option>
            ))}
          </select>

          <button type="button" className="btn-secondary" onClick={() => selectAllProgram(true)}>Pilih Semua</button>
          <button type="button" className="btn-secondary" onClick={() => selectAllProgram(false)}>Kosongkan</button>
          <button type="button" className="btn-primary" onClick={saveMapping} disabled={loading || !selectedPackageId}>Simpan Mapping</button>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Object.entries(groupedParameters).map(([postName, params]) => (
            <div key={postName} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="mb-3 font-black">{postName}</div>
              <div className="space-y-2">
                {params.map((param) => (
                  <label key={param.id} className="flex items-start gap-2 rounded-xl bg-slate-50 p-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={!!selectedParamIds[param.id]}
                      onChange={(e) => setSelectedParamIds({ ...selectedParamIds, [param.id]: e.target.checked })}
                    />
                    <span>
                      <span className="font-bold">{param.name}</span>
                      <span className="block text-xs text-slate-500">
                        {param.input_type || "text"} {param.unit ? `· ${param.unit}` : ""} {param.is_required ? "· wajib" : ""}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="card p-5">
        <div className="mb-4 text-xl font-black">Daftar Parameter</div>
        <div className="mobile-table">
          <table>
            <thead>
              <tr>
                <th>Post</th>
                <th>Parameter</th>
                <th>Tipe</th>
                <th>Unit</th>
                <th>Required</th>
                <th>Status</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {parameters.map((param) => (
                <tr key={param.id}>
                  <td>{param.post_name}</td>
                  <td className="font-bold">{param.name}</td>
                  <td>{param.input_type || "text"}</td>
                  <td>{param.unit || "-"}</td>
                  <td>{param.is_required ? "Ya" : "Tidak"}</td>
                  <td>{param.is_active ? "Aktif" : "Nonaktif"}</td>
                  <td>
                    <div className="flex gap-2">
                      <button className="btn-secondary" onClick={() => editParameter(param)}>Edit</button>
                      <button className="rounded-xl bg-red-600 px-3 py-2 text-xs font-bold text-white" onClick={() => deleteParameter(param)}>Hapus</button>
                    </div>
                  </td>
                </tr>
              ))}
              {!parameters.length && (
                <tr>
                  <td colSpan={7} className="text-center text-slate-500">Belum ada parameter.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
