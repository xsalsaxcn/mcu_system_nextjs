import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { fail, ok } from "@/lib/server/response";

function isActive(value: any) {
  return value === 1 || value === true || value === "1" || value === null || value === undefined;
}

export async function GET(req: NextRequest) {
  const user = getSessionUser(req);
  if (!user) return fail("Unauthorized", 401);

  const supabase = getSupabaseAdmin();
  const program = req.nextUrl.searchParams.get("program") || "capaska";

  const [packages, rules] = await Promise.all([
    supabase
      .from("packages")
      .select("id,name,program_type,is_active")
      .eq("program_type", program)
      .order("name", { ascending: true }),
    supabase
      .from("graduation_rules")
      .select("*")
      .eq("program_type", program)
  ]);

  if (packages.error) return fail(packages.error.message, 500);
  if (rules.error) return fail(rules.error.message, 500);

  const ruleByPackage = new Map((rules.data || []).map((rule: any) => [Number(rule.package_id), rule]));

  const rows = (packages.data || [])
    .filter((pkg: any) => isActive(pkg.is_active))
    .map((pkg: any) => {
      const rule = ruleByPackage.get(Number(pkg.id));

      return {
        package_id: Number(pkg.id),
        package_name: pkg.name,
        program_type: pkg.program_type || program,
        pass_min_score: Number(rule?.pass_min_score ?? 0),
        pass_max_score: Number(rule?.pass_max_score ?? 999999),
        description: rule?.description || "",
        is_active: rule?.is_active ?? 1
      };
    });

  return ok({ rules: rows });
}

export async function POST(req: NextRequest) {
  const user = getSessionUser(req);
  if (!user || user.role !== "admin") return fail("Unauthorized", 401);

  const body = await req.json();
  const supabase = getSupabaseAdmin();

  const program = String(body.program_type || "capaska");
  const rules = Array.isArray(body.rules) ? body.rules : [];

  const rows = rules
    .filter((rule: any) => Number(rule.package_id))
    .map((rule: any) => ({
      package_id: Number(rule.package_id),
      program_type: program,
      pass_min_score: Number(rule.pass_min_score ?? 0),
      pass_max_score: Number(rule.pass_max_score ?? 999999),
      description: String(rule.description || ""),
      is_active: 1,
      updated_at: new Date().toISOString()
    }));

  const { error } = await supabase
    .from("graduation_rules")
    .upsert(rows, { onConflict: "package_id" });

  if (error) return fail(error.message, 500);

  return ok({
    message: "Parameter kelulusan berhasil disimpan.",
    count: rows.length
  });
}
