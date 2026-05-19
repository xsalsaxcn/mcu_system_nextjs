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

  if (mode === "mapping") {
    const packageId = Number(body.package_id);
    const parameterIds = Array.isArray(body.parameter_ids)
      ? body.parameter_ids.map((id: any) => Number(id)).filter(Boolean)
      : [];

    if (!packageId) return fail("Pilih paket/instansi dulu.");

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

  if (!["capaska", "corporate"].includes(programType)) {
    return fail("Program harus capaska atau corporate.");
  }

  if (!postId) return fail("Post pemeriksaan wajib dipilih.");
  if (!name) return fail("Nama parameter wajib diisi.");

  const options = normalizeOptions(body.options_text);

  const payload = {
    name,
    category: String(body.category || "").trim(),
    post_id: postId,
    unit: String(body.unit || "").trim(),
    input_type: String(body.input_type || "text").trim(),
    normal_value: String(body.normal_value || "").trim(),
    reference_text: String(body.reference_text || "").trim(),
    reference_image_path: "",
    config_json: JSON.stringify(options),
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
