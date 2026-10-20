import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { fail, ok } from "@/lib/server/response";

function normalizeOptions(value: any) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }

  return String(value || "")
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}


function parseNumber(value: any) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(String(value).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

// CAPASKA_SETUP_RULE_METADATA_API_V326
function normalizeRuleKeyV326(value: any) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

function normalizeScoringOptions(value: any, fallbackText: any) {
  const source = Array.isArray(value)
    ? value
    : normalizeOptions(fallbackText).map((label) => ({ label, value: label, score: 0, is_critical: false, note: "" }));

  return source
    .map((item: any) => {
      const label = String(item?.label ?? item?.option_label ?? item?.text ?? item?.value ?? "").trim();
      if (!label) return null;

      const optionValue = String(item?.value ?? item?.option_value ?? label).trim() || label;
      const score = parseNumber(item?.score);

      const statusLevel = String(item?.status_level ?? item?.status ?? "").trim();
      const isRedflag = Boolean(item?.is_redflag ?? item?.is_critical ?? item?.critical ?? statusLevel === "tidak_direkomendasikan");
      const isNormal = Boolean(item?.is_normal ?? statusLevel === "normal");
      const isNote = item?.is_note !== undefined ? Boolean(item.is_note) : (statusLevel === "dengan_catatan" || isRedflag);

      return {
        label,
        value: optionValue,
        score: score ?? 0,
        is_critical: isRedflag,
        note: String(item?.note ?? item?.recommendation_text ?? "").trim(),
        // CAPASKA_SETUP_RULE_METADATA_API_V326
        option_key: normalizeRuleKeyV326(item?.option_key ?? item?.key ?? optionValue ?? label),
        status_level: statusLevel || (isRedflag ? "tidak_direkomendasikan" : isNormal ? "normal" : isNote ? "dengan_catatan" : ""),
        is_normal: isNormal,
        is_note: isNote || isRedflag,
        is_redflag: isRedflag
      };
    })
    .filter(Boolean);
}


// CAPASKA_SETUP_RULE_VALIDATION_API_V327
const RULE_STATUS_OPTIONS_API_V327 = new Set(["normal", "dengan_catatan", "tidak_direkomendasikan"]);

function validateScoringOptionsApiV327(options: any[], inputType: any) {
  const type = String(inputType || "").toLowerCase();
  if (!(type === "radio" || type === "select")) return [];

  const errors: string[] = [];
  const seen = new Set<string>();
  if (!options.length) errors.push("Opsi jawaban wajib diisi untuk radio/select.");

  for (let index = 0; index < options.length; index += 1) {
    const option: any = options[index] || {};
    const row = index + 1;
    const label = String(option.label || option.value || "").trim();
    const optionKey = normalizeRuleKeyV326(option.option_key || option.value || option.label);
    const status = String(option.status_level || "").trim();
    const score = parseNumber(option.score);

    if (!label) errors.push("Opsi baris " + row + ": label wajib diisi.");
    if (!optionKey) errors.push("Opsi baris " + row + ": Option Key wajib diisi.");
    if (optionKey && seen.has(optionKey)) errors.push("Opsi baris " + row + ": Option Key duplikat.");
    if (optionKey) seen.add(optionKey);
    if (!RULE_STATUS_OPTIONS_API_V327.has(status)) errors.push("Opsi baris " + row + ": Status Rule wajib dipilih.");
    if (score === null) errors.push("Opsi baris " + row + ": skor wajib angka.");
    if (status === "normal" && (option.is_redflag || option.is_critical)) errors.push("Opsi baris " + row + ": Normal tidak boleh Tidak Direkomendasikan.");
    if (status === "dengan_catatan" && score !== null && score <= -10) errors.push("Opsi baris " + row + ": skor <= -10 harus Tidak Direkomendasikan.");
    if (status === "tidak_direkomendasikan" && score !== null && score > -10) errors.push("Opsi baris " + row + ": Tidak Direkomendasikan harus memakai skor -10 atau lebih rendah.");
  }

  return errors;
}

export async function GET(req: NextRequest) {
  const user = getSessionUser(req);

  if (!user || user.role !== "admin") {
    return fail("Unauthorized", 401);
  }

  const supabase = getSupabaseAdmin();
  const programType = req.nextUrl.searchParams.get("program_type") || "capaska";

  if (!["capaska", "corporate"].includes(programType)) {
    return fail("Program harus capaska atau corporate.");
  }

  const [postsRes, packagesRes, companiesRes, parametersRes, mappingsRes] = await Promise.all([
    supabase
      .from("posts")
      .select("*")
      .eq("program_type", programType)
      .eq("is_active", 1)
      .order("id", { ascending: true }),
    supabase
      .from("packages")
      .select("*")
      .eq("program_type", programType)
      .eq("is_active", 1)
      .order("name", { ascending: true }),
    supabase
      .from("companies")
      .select("id,name")
      .order("name", { ascending: true }),
    supabase
      .from("parameters")
      .select("*")
      .eq("program_type", programType)
      .order("post_id", { ascending: true })
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true }),
    supabase
      .from("package_parameters")
      .select("*")
      .order("package_id", { ascending: true })
      .order("sort_order", { ascending: true })
  ]);

  if (postsRes.error) return fail(postsRes.error.message, 500);
  if (packagesRes.error) return fail(packagesRes.error.message, 500);
  if (companiesRes.error) return fail(companiesRes.error.message, 500);
  if (parametersRes.error) return fail(parametersRes.error.message, 500);
  if (mappingsRes.error) return fail(mappingsRes.error.message, 500);

  const companyMap = new Map((companiesRes.data || []).map((c: any) => [c.id, c.name]));
  const postMap = new Map((postsRes.data || []).map((p: any) => [p.id, p.name]));

  const packages = (packagesRes.data || []).map((pkg: any) => ({
    ...pkg,
    company_name: companyMap.get(pkg.company_id) || "-"
  }));

  const parameters = (parametersRes.data || []).map((param: any) => ({
    ...param,
    post_name: postMap.get(param.post_id) || "-"
  }));

  return ok({
    posts: postsRes.data || [],
    packages,
    companies: companiesRes.data || [],
    parameters,
    mappings: mappingsRes.data || []
  });
}

export async function POST(req: NextRequest) {
  const user = getSessionUser(req);

  if (!user || user.role !== "admin") {
    return fail("Unauthorized", 401);
  }

  const body = await req.json().catch(() => ({}));
  const mode = String(body.mode || "parameter");

  const supabase = getSupabaseAdmin();


  if (mode === "reorder") {
    const postId = Number(body.post_id || 0);
    const parameterIds = Array.isArray(body.parameter_ids)
      ? body.parameter_ids.map((id: any) => Number(id)).filter(Boolean)
      : [];

    if (!postId) return fail("post_id wajib untuk reorder.");
    if (!parameterIds.length) return fail("parameter_ids wajib untuk reorder.");

    for (let index = 0; index < parameterIds.length; index += 1) {
      const { error } = await supabase
        .from("parameters")
        .update({ sort_order: (index + 1) * 10 })
        .eq("id", parameterIds[index])
        .eq("post_id", postId);
      if (error) return fail(error.message, 500);
    }

    await supabase.from("audit_logs").insert({
      user_id: user.id,
      action: "REORDER_PARAMETERS",
      participant_id: null,
      parameter_id: null,
      old_value: null,
      new_value: `post_id=${postId}; parameter_count=${parameterIds.length}`
    });

    return ok({ reordered: parameterIds.length });
  }

  if (mode === "mapping") {
    const packageId = Number(body.package_id);
    const parameterIds = Array.isArray(body.parameter_ids)
      ? body.parameter_ids.map((id: any) => Number(id)).filter(Boolean)
      : [];

    if (!packageId) return fail("Pilih paket/instansi dulu.");
    if (!parameterIds.length && body.allow_empty !== true) {
      return fail("Mapping kosong tidak disimpan untuk mencegah paket kehilangan semua parameter. Pilih minimal satu parameter.");
    }

    const deleteRes = await supabase
      .from("package_parameters")
      .delete()
      .eq("package_id", packageId);

    if (deleteRes.error) return fail(deleteRes.error.message, 500);

    if (parameterIds.length) {
      const rows = parameterIds.map((parameterId: number, index: number) => ({
        package_id: packageId,
        parameter_id: parameterId,
        sort_order: index + 1
      }));

      const insertRes = await supabase.from("package_parameters").insert(rows);

      if (insertRes.error) return fail(insertRes.error.message, 500);
    }

    await supabase.from("audit_logs").insert({
      user_id: user.id,
      action: "UPDATE_PACKAGE_PARAMETERS",
      participant_id: null,
      parameter_id: null,
      old_value: null,
      new_value: `package_id=${packageId}; parameter_count=${parameterIds.length}`
    });

    return ok({ mapped: parameterIds.length });
  }

  const id = body.id ? Number(body.id) : null;
  const programType = String(body.program_type || "capaska").trim();
  const postId = Number(body.post_id);
  const name = String(body.name || "").trim();
  // CAPASKA_SETUP_RULE_VALIDATION_API_V327_PARAMETER_KEY
  const parameterKey = normalizeRuleKeyV326(body.parameter_key || name);

  if (!["capaska", "corporate"].includes(programType)) {
    return fail("Program harus capaska atau corporate.");
  }

  if (!postId) return fail("Post pemeriksaan wajib dipilih.");
  if (!name) return fail("Nama parameter wajib diisi.");

  const plainOptions = normalizeOptions(body.options_text);
  const scoringOptions = normalizeScoringOptions(body.scoring_options, body.options_text);
  const maxScore = parseNumber(body.max_score);
  const scoringType = String(body.scoring_type || "by_option").trim() || "by_option";

  // CAPASKA_SETUP_RULE_VALIDATION_API_V327_VALIDATE
  if (programType === "capaska") {
    if (!parameterKey) return fail("Stable Parameter Key wajib diisi.");
    const ruleErrors = validateScoringOptionsApiV327(scoringOptions, body.input_type);
    if (ruleErrors.length) return fail(ruleErrors.slice(0, 5).join(" "));
  }

  const configJson = programType === "capaska"
    ? {
        // CAPASKA_SETUP_RULE_VALIDATION_API_V327_CONFIG
        parameter_key: parameterKey,
        options: scoringOptions,
        max_score: maxScore,
        scoring_type: scoringType,
        include_in_total_score: body.include_in_total_score === false ? false : true,
        include_in_progress: body.include_in_progress === false ? false : true
      }
    : plainOptions;

  const payload = {
    name,
    category: String(body.category || "").trim(),
    post_id: postId,
    unit: String(body.unit || "").trim(),
    input_type: String(body.input_type || "text").trim(),
    normal_value: String(body.normal_value || "").trim(),
    reference_text: String(body.reference_text || "").trim(),
    reference_image_path: "",
    config_json: JSON.stringify(configJson),
    is_required: body.is_required ? 1 : 0,
    is_active: body.is_active === false ? 0 : 1,
    sort_order: Number(body.sort_order || 0),
    program_type: programType
  };

  if (id) {
    const { error } = await supabase
      .from("parameters")
      .update(payload)
      .eq("id", id);

    if (error) return fail(error.message, 500);

    await supabase.from("audit_logs").insert({
      user_id: user.id,
      action: "UPDATE_PARAMETER",
      participant_id: null,
      parameter_id: id,
      old_value: null,
      new_value: name
    });

    return ok({ parameter_id: id, mode: "updated" });
  }

  const { data, error } = await supabase
    .from("parameters")
    .insert(payload)
    .select("id")
    .single();

  if (error) return fail(error.message, 500);

  await supabase.from("audit_logs").insert({
    user_id: user.id,
    action: "CREATE_PARAMETER",
    participant_id: null,
    parameter_id: data.id,
    old_value: null,
    new_value: name
  });

  return ok({ parameter_id: data.id, mode: "created" });
}

export async function DELETE(req: NextRequest) {
  const user = getSessionUser(req);

  if (!user || user.role !== "admin") {
    return fail("Unauthorized", 401);
  }

  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!id) return fail("Parameter ID wajib.");

  const supabase = getSupabaseAdmin();

  const mapDelete = await supabase
    .from("package_parameters")
    .delete()
    .eq("parameter_id", id);

  if (mapDelete.error) return fail(mapDelete.error.message, 500);

  const paramDelete = await supabase
    .from("parameters")
    .delete()
    .eq("id", id);

  if (paramDelete.error) return fail(paramDelete.error.message, 500);

  await supabase.from("audit_logs").insert({
    user_id: user.id,
    action: "DELETE_PARAMETER",
    participant_id: null,
    parameter_id: id,
    old_value: null,
    new_value: null
  });

  return ok({ deleted: id });
}
