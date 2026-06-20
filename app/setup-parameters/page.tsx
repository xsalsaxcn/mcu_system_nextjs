"use client";

import { useEffect, useMemo, useState } from "react";
import AuthGate from "@/components/AuthGate";
import { parseCapaskaScoringConfig, scoreCapaskaDirectChoice } from "@/lib/shared/capaskaDirectScoring2026";

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
  include_in_progress?: boolean;
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

type ScoringOptionForm = {
  label: string;
  value: string;
  score: string;
  is_critical: boolean;
  note: string;
  // CAPASKA_SETUP_RULE_METADATA_V326
  option_key: string;
  status_level: string;
  is_normal: boolean;
  is_note: boolean;
  is_redflag: boolean;
};

const emptyForm = {
  id: "",
  post_id: "",
  name: "",
  // CAPASKA_SETUP_RULE_METADATA_V326
  parameter_key: "",
  category: "",
  unit: "",
  input_type: "text",
  normal_value: "",
  reference_text: "",
  options_text: "",
  max_score: "",
  scoring_type: "by_option",
  include_in_total_score: true,
  include_in_progress: true,
  scoring_options: [] as ScoringOptionForm[],
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

// CAPASKA_SETUP_RULE_METADATA_V326
function makeRuleKeyV326(value: any) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

function readConfigObjectV326(configJson?: string) {
  try {
    const parsed = JSON.parse(configJson || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function statusFromOptionV326(option: any) {
  if (option?.status_level) return String(option.status_level);
  if (option?.is_redflag || option?.is_critical) return "tidak_direkomendasikan";
  if (option?.is_note) return "dengan_catatan";
  if (option?.is_normal) return "normal";
  return "";
}

function getParameterScoringForm(param: Parameter) {
  const configRawV326 = readConfigObjectV326(param.config_json);
  const config = parseCapaskaScoringConfig(param.config_json);
  const options = config.options.map((option) => {
    const fallbackScore = scoreCapaskaDirectChoice(param, option.label);
    const score = typeof option.score === "number" ? option.score : fallbackScore;

    return {
      label: option.label,
      value: option.value || option.label,
      score: Number.isFinite(score) ? String(score) : "0",
      is_critical: !!((option as any).is_redflag || option.is_critical),
      note: option.note || "",
      // CAPASKA_SETUP_RULE_METADATA_V326
      option_key: (option as any).option_key || makeRuleKeyV326(option.value || option.label),
      status_level: statusFromOptionV326(option),
      is_normal: !!(option as any).is_normal,
      is_note: !!(option as any).is_note,
      is_redflag: !!((option as any).is_redflag || option.is_critical),
    };
  });

  const maxScore = typeof config.max_score === "number"
    ? config.max_score
    : Math.max(0, ...options.map((option) => Number(option.score || 0)).filter((score) => Number.isFinite(score)));

  return {
    // CAPASKA_SETUP_RULE_METADATA_V326
    parameter_key: configRawV326.parameter_key || makeRuleKeyV326(param.name || ""),
    options_text: options.map((option) => option.label).join("\n"),
    max_score: maxScore ? String(maxScore) : "",
    scoring_type: config.scoring_type || "by_option",
    include_in_total_score: config.include_in_total_score !== false,
    include_in_progress: (config as any).include_in_progress !== false,
    scoring_options: options,
  };
}

function parsePlainOptions(configJson?: string) {
  try {
    const parsed = JSON.parse(configJson || "[]");
    return Array.isArray(parsed) ? parsed.join("\n") : "";
  } catch {
    return "";
  }
}

function createBlankOption(): ScoringOptionForm {
  return {
    label: "",
    value: "",
    score: "0",
    is_critical: false,
    note: "",
    // CAPASKA_SETUP_RULE_METADATA_V326
    option_key: "",
    status_level: "",
    is_normal: false,
    is_note: false,
    is_redflag: false,
  };
}

function normalizeFormScoringOptions(options: ScoringOptionForm[]) {
  return options
    .map((option) => {
      const label = String(option.label || "").trim();
      if (!label) return null;

      const value = String(option.value || label).trim() || label;
      const score = Number(String(option.score ?? "0").replace(",", "."));
      const statusLevel = String(option.status_level || "").trim();
      const isRedflag = !!option.is_redflag || !!option.is_critical || statusLevel === "tidak_direkomendasikan";
      const isNormal = !!option.is_normal || statusLevel === "normal";
      const isNote = !!option.is_note || statusLevel === "dengan_catatan" || isRedflag;

      return {
        label,
        value,
        score: Number.isFinite(score) ? score : 0,
        is_critical: isRedflag,
        note: String(option.note || "").trim(),
        // CAPASKA_SETUP_RULE_METADATA_V326
        option_key: makeRuleKeyV326(option.option_key || value || label),
        status_level: statusLevel || (isRedflag ? "tidak_direkomendasikan" : isNormal ? "normal" : isNote ? "dengan_catatan" : ""),
        is_normal: isNormal,
        is_note: isNote,
        is_redflag: isRedflag,
      };
    })
    .filter(Boolean);
}



// CAPASKA_SETUP_RULE_VALIDATION_V327
const RULE_STATUS_OPTIONS_V327 = new Set(["normal", "dengan_catatan", "tidak_direkomendasikan"]);

function isRuleInputTypeV327(inputType: any) {
  const value = String(inputType || "").toLowerCase();
  return value === "radio" || value === "select";
}

function numberFromRuleV327(value: any) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(String(value).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function validateCapaskaRuleFormV327(form: any) {
  const errors: string[] = [];
  const parameterKey = makeRuleKeyV326(form.parameter_key || form.name);
  if (!parameterKey) errors.push("Stable Parameter Key wajib diisi.");

  if (!isRuleInputTypeV327(form.input_type)) return errors;

  const options = Array.isArray(form.scoring_options) ? form.scoring_options : [];
  if (!options.length) {
    errors.push("Opsi jawaban wajib diisi untuk radio/select.");
    return errors;
  }

  const seenKeys = new Set<string>();
  options.forEach((option: ScoringOptionForm, index: number) => {
    const row = index + 1;
    const label = String(option.label || "").trim();
    const optionKey = makeRuleKeyV326(option.option_key || option.value || option.label);
    const status = String(option.status_level || "").trim();
    const score = numberFromRuleV327(option.score);
    const labelText = label || "tanpa label";

    if (!label) errors.push("Opsi baris " + row + ": label wajib diisi.");
    if (!optionKey) errors.push("Opsi baris " + row + ": Option Key wajib diisi.");
    if (optionKey && seenKeys.has(optionKey)) errors.push("Opsi baris " + row + ": Option Key '" + optionKey + "' duplikat.");
    if (optionKey) seenKeys.add(optionKey);
    if (!RULE_STATUS_OPTIONS_V327.has(status)) errors.push("Opsi baris " + row + " (" + labelText + "): Status Rule wajib dipilih.");
    if (score === null) errors.push("Opsi baris " + row + " (" + labelText + "): skor wajib angka.");

    if (status === "normal") {
      if (option.is_redflag || option.is_critical) errors.push("Opsi baris " + row + " (" + labelText + "): Normal tidak boleh ditandai Tidak Direkomendasikan.");
    }
    if (status === "dengan_catatan" && score !== null && score <= -10) {
      errors.push("Opsi baris " + row + " (" + labelText + "): skor <= -10 harus Status Rule Tidak Direkomendasikan.");
    }
    if (status === "tidak_direkomendasikan" && score !== null && score > -10) {
      errors.push("Opsi baris " + row + " (" + labelText + "): Tidak Direkomendasikan harus memakai skor -10 atau lebih rendah.");
    }
  });

  return errors;
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
  const [draggedParamIdV237, setDraggedParamIdV237] = useState<number | null>(null);

  const activeParameters = useMemo(() => {
    return parameters.filter((p) => Number(p.is_active ?? 1) === 1);
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
      ...(programType === "capaska"
        ? getParameterScoringForm(param)
        : {
            options_text: parsePlainOptions(param.config_json),
            max_score: "",
            scoring_type: "by_option",
            include_in_total_score: true,
            include_in_progress: true,
            scoring_options: [],
          }),
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

    // CAPASKA_SETUP_RULE_VALIDATION_V327_SAVE
    if (programType === "capaska") {
      const validationErrors = validateCapaskaRuleFormV327(form);
      if (validationErrors.length) {
        setMessage(validationErrors.slice(0, 5).join(" "));
        setLoading(false);
        return;
      }
    }

    try {
      const scoringOptions = normalizeFormScoringOptions(form.scoring_options || []);

      const res = await fetch("/api/setup/parameters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          program_type: programType,
          post_id: Number(form.post_id),
          id: form.id ? Number(form.id) : null,
          scoring_options: scoringOptions,
          max_score: form.max_score,
          scoring_type: form.scoring_type,
          include_in_total_score: form.include_in_total_score,
          include_in_progress: form.include_in_progress !== false
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

  function addScoringOption() {
    setForm({
      ...form,
      scoring_options: [...(form.scoring_options || []), createBlankOption()]
    });
  }

  function updateScoringOption(index: number, field: keyof ScoringOptionForm, value: string | boolean) {
    const options = [...(form.scoring_options || [])];
    options[index] = { ...options[index], [field]: value };

    if (field === "label" && !options[index].value) {
      options[index].value = String(value || "");
    }
    // CAPASKA_SETUP_RULE_METADATA_V326
    if (field === "label" && !options[index].option_key) {
      options[index].option_key = makeRuleKeyV326(value);
    }
    // CAPASKA_SETUP_RULE_VALIDATION_V327_OPTION_SYNC
    if (field === "status_level") {
      const status = String(value || "");
      options[index].status_level = status;
      options[index].is_normal = status === "normal";
      options[index].is_note = status === "dengan_catatan" || status === "tidak_direkomendasikan";
      options[index].is_redflag = status === "tidak_direkomendasikan";
      options[index].is_critical = status === "tidak_direkomendasikan";
      if (status === "tidak_direkomendasikan") {
        const score = numberFromRuleV327(options[index].score);
        if (score === null || score > -10) options[index].score = "-10";
      }
    }
    if (field === "is_critical" || field === "is_redflag") {
      options[index].is_redflag = Boolean(value);
      options[index].is_critical = Boolean(value);
      if (value) {
        options[index].status_level = "tidak_direkomendasikan";
        options[index].is_note = true;
        options[index].is_normal = false;
        const score = numberFromRuleV327(options[index].score);
        if (score === null || score > -10) options[index].score = "-10";
      } else if (options[index].status_level === "tidak_direkomendasikan") {
        options[index].status_level = "dengan_catatan";
        options[index].is_note = true;
        options[index].is_normal = false;
      }
    }

    setForm({
      ...form,
      scoring_options: options,
      options_text: options.map((option) => option.label).filter(Boolean).join("\n")
    });
  }

  function removeScoringOption(index: number) {
    const options = [...(form.scoring_options || [])];
    options.splice(index, 1);

    setForm({
      ...form,
      scoring_options: options,
      options_text: options.map((option) => option.label).filter(Boolean).join("\n")
    });
  }

  async function moveParameterByDragV237(targetParam: Parameter) {
    if (!draggedParamIdV237 || draggedParamIdV237 === targetParam.id) return;
    const draggedParam = parameters.find((param) => Number(param.id) === Number(draggedParamIdV237));
    if (!draggedParam || Number(draggedParam.post_id) !== Number(targetParam.post_id)) {
      setDraggedParamIdV237(null);
      return;
    }

    const samePost = parameters
      .filter((param) => Number(param.post_id) === Number(targetParam.post_id))
      .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0) || Number(a.id) - Number(b.id));

    const fromIndex = samePost.findIndex((param) => Number(param.id) === Number(draggedParam.id));
    const toIndex = samePost.findIndex((param) => Number(param.id) === Number(targetParam.id));
    if (fromIndex < 0 || toIndex < 0) return;

    const nextPostOrder = [...samePost];
    const [moved] = nextPostOrder.splice(fromIndex, 1);
    nextPostOrder.splice(toIndex, 0, moved);

    const orderMap = new Map<number, number>();
    nextPostOrder.forEach((param, index) => orderMap.set(Number(param.id), (index + 1) * 10));

    setParameters((prev) => prev
      .map((param) => orderMap.has(Number(param.id)) ? { ...param, sort_order: orderMap.get(Number(param.id)) } : param)
      .sort((a, b) => Number(a.post_id) - Number(b.post_id) || Number(a.sort_order || 0) - Number(b.sort_order || 0) || Number(a.id) - Number(b.id))
    );
    setDraggedParamIdV237(null);

    try {
      const res = await fetch("/api/setup/parameters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "reorder",
          post_id: Number(targetParam.post_id),
          parameter_ids: nextPostOrder.map((param) => Number(param.id)),
        }),
      });
      const json = await res.json();
      if (!json.ok) {
        setMessage(json.message || "Gagal menyimpan urutan parameter.");
        await loadData(programType);
        return;
      }
      setMessage("Urutan pertanyaan berhasil disimpan.");
      await loadData(programType);
    } catch (error: any) {
      setMessage(error?.message || "Gagal menyimpan urutan parameter.");
      await loadData(programType);
    }
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
            <div className="mt-3 rounded-2xl border border-cyan-100 bg-cyan-50 p-3 text-xs text-cyan-800">
              <b>Rule engine aktif:</b> pilih Post Pemeriksaan, isi Stable Parameter Key, lalu atur Option Key, Skor, dan Status Rule. Label dan urutan boleh berubah, tetapi key sebaiknya tetap stabil.
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
              <label className="label">Stable Parameter Key</label>
              <input
                className="input"
                value={form.parameter_key || ""}
                onChange={(e) => setForm({ ...form, parameter_key: makeRuleKeyV326(e.target.value) })}
                onBlur={() => setForm((prev: any) => ({ ...prev, parameter_key: prev.parameter_key || makeRuleKeyV326(prev.name) }))}
                placeholder="contoh: caries_dentis"
              />
              <div className="mt-1 text-[11px] text-slate-500">Key stabil untuk rule engine. Label boleh berubah, key sebaiknya tetap.</div>
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
                <option value="radio">Radio Button</option>
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

          {programType === "capaska" ? (
            <>
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <label className="label">Skor Maksimal</label>
              <input
                type="number"
                step="any"
                className="input"
                value={form.max_score}
                onChange={(e) => setForm({ ...form, max_score: e.target.value })}
                placeholder="Contoh: 1, 2, 3"
              />
            </div>

            <div>
              <label className="label">Tipe Skoring</label>
              <select className="input" value={form.scoring_type} onChange={(e) => setForm({ ...form, scoring_type: e.target.value })}>
                <option value="by_option">By Option</option>
                <option value="manual">Manual</option>
                <option value="none">No Score</option>
              </select>
            </div>

            <label className="mt-7 flex items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                checked={form.include_in_total_score}
                onChange={(e) => setForm({ ...form, include_in_total_score: e.target.checked })}
              />
              Hitung ke total skor
            </label>

            <label className="mt-7 flex items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                checked={form.include_in_progress !== false}
                onChange={(e) => setForm({ ...form, include_in_progress: e.target.checked })}
              />
              Masuk ke progress bar?
            </label>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <label className="label">Opsi Jawaban & Skoring</label>
                <div className="text-xs text-slate-500">
                  Isi skor per opsi. Centang Tidak Direkomendasikan untuk temuan merah seperti hernia ada, tidak sesuai juknis, atau buta warna.
                </div>
              </div>
              <button type="button" className="btn-secondary" onClick={addScoringOption}>
                + Tambah Opsi
              </button>
            </div>

            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              {/* CAPASKA_SETUP_RULE_VALIDATION_V327_PREVIEW */}
              <b>Validasi aturan:</b> Status Rule wajib dipilih untuk setiap opsi. Normal tidak masuk catatan, Dengan Catatan masuk ringkasan catatan, dan Tidak Direkomendasikan otomatis menjadi temuan merah dengan skor minimal -10.
            </div>

            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-500">
                    <th className="p-2">Opsi Jawaban</th>
                    <th className="p-2">Value</th>
                    <th className="p-2">Option Key</th>
                    <th className="p-2">Skor</th>
                    <th className="p-2">Status Rule <span className="text-red-600">*</span>{/* CAPASKA_SETUP_RULE_VALIDATION_V327_STATUS_HEADER */}</th>
                    <th className="p-2">Tidak Direkomendasikan</th>
                    <th className="p-2">Catatan</th>
                    <th className="p-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {(form.scoring_options || []).map((option: ScoringOptionForm, index: number) => (
                    <tr key={index} className="border-t border-slate-200">
                      <td className="p-2">
                        <input
                          className="input"
                          value={option.label}
                          onChange={(e) => updateScoringOption(index, "label", e.target.value)}
                          placeholder="Tidak ada / Ada"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          className="input"
                          value={option.value}
                          onChange={(e) => updateScoringOption(index, "value", e.target.value)}
                          placeholder="auto sama dengan opsi"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          className="input"
                          value={option.option_key || ""}
                          onChange={(e) => updateScoringOption(index, "option_key", makeRuleKeyV326(e.target.value))}
                          placeholder="normal / tidak_normal"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="number"
                          step="any"
                          className="input"
                          value={option.score}
                          onChange={(e) => updateScoringOption(index, "score", e.target.value)}
                          placeholder="1 / -10"
                        />
                      </td>
                      <td className="p-2">
                        <select
                          className="input"
                          value={option.status_level || ""}
                          onChange={(e) => updateScoringOption(index, "status_level", e.target.value)}
                        >
                          <option value="">- pilih -</option>
                          <option value="normal">Normal</option>
                          <option value="dengan_catatan">Dengan Catatan</option>
                          <option value="tidak_direkomendasikan">Tidak Direkomendasikan</option>
                        </select>
                      </td>
                      <td className="p-2 text-center">
                        <input
                          type="checkbox"
                          checked={option.is_critical}
                          onChange={(e) => updateScoringOption(index, "is_critical", e.target.checked)}
                        />
                      </td>
                      <td className="p-2">
                        <input
                          className="input"
                          value={option.note}
                          onChange={(e) => updateScoringOption(index, "note", e.target.value)}
                          placeholder="Opsional"
                        />
                      </td>
                      <td className="p-2">
                        <button type="button" className="rounded-xl bg-red-600 px-3 py-2 text-xs font-bold text-white" onClick={() => removeScoringOption(index)}>
                          Hapus
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!(form.scoring_options || []).length && (
                    <tr>
                      <td colSpan={8} className="p-4 text-center text-xs text-slate-500">
                        Belum ada opsi. Klik Tambah Opsi untuk parameter radio/dropdown.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

            </>
          ) : (
            <div>
              <label className="label">Opsi Dropdown</label>
              <textarea
                className="input min-h-24"
                value={form.options_text}
                onChange={(e) => setForm({ ...form, options_text: e.target.value })}
                placeholder={"Isi satu opsi per baris, contoh:\nNormal\nAbnormal\nPerlu Review"}
              />
            </div>
          )}

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

        <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto_auto_auto]">
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
          {programType === "capaska" && (
            <a href="/setup-parameters/staff" className="rounded-xl bg-indigo-600 px-4 py-3 text-center text-sm font-bold text-white shadow-sm hover:bg-indigo-700">Edit Data Petugas</a>
          )}
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Object.entries(groupedParameters).map(([postName, params]) => (
            <div key={postName} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="mb-3 font-black">{postName}</div>
              <div className="space-y-2">
                {(params as Parameter[]).map((param) => (
                  <div
                    key={param.id}
                    draggable
                    onDragStart={() => setDraggedParamIdV237(param.id)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => { e.preventDefault(); void moveParameterByDragV237(param); }}
                    className="flex cursor-grab items-start gap-2 rounded-xl bg-slate-50 p-2 text-sm active:cursor-grabbing"
                    title="Drag untuk mengatur urutan. Klik nama pertanyaan untuk edit."
                  >
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={!!selectedParamIds[param.id]}
                      onChange={(e) => setSelectedParamIds({ ...selectedParamIds, [param.id]: e.target.checked })}
                    />
                    <button type="button" className="flex-1 text-left" onClick={() => editParameter(param)}>
                      <span className="font-bold">☰ {param.name}</span>
                      <span className="block text-xs text-slate-500">
                        {param.input_type || "text"} {param.unit ? `· ${param.unit}` : ""} {param.is_required ? "· wajib" : ""} {(() => { try { const cfg = typeof param.config_json === "string" ? JSON.parse(param.config_json || "{}") : param.config_json; return cfg?.include_in_progress === false ? "· tidak masuk progress" : "· masuk progress"; } catch { return "· masuk progress"; } })()}
                      </span>
                    </button>
                  </div>
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
