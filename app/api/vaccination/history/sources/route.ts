import { NextRequest } from "next/server";
import { fail, ok, requireUser, supabaseAdmin } from "../../_utils";
import { historyCompanyKey, historyText } from "@/lib/vaccination/history";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = requireUser(req);
  if (!user) return fail("Unauthorized", 401);
  const role = String((user as any)?.role || "").trim().toLowerCase();
  if (!["admin", "vaccination_admin", "vaccination_supervisor"].includes(role)) {
    return fail("Daftar perusahaan History hanya untuk Admin/Supervisor Vaksinasi.", 403);
  }

  try {
    const supabase = supabaseAdmin();
    const result = await supabase
      .from("participant_sources")
      .select("id,name,institution_name,description,program_type,created_at")
      .eq("program_type", "vaccination")
      .order("created_at", { ascending: false })
      .limit(1000);

    if (result.error) throw new Error(result.error.message);

    const grouped = new Map<string, any>();
    let skippedWithoutInstitution = 0;

    // Company selector is institution-based, not database-name based.
    // participant_sources is ordered newest-first, so the first row in each group
    // becomes a representative source_id used only for server-side validation/audit.
    for (const row of result.data || []) {
      const institutionName = historyText(row?.institution_name);
      if (!institutionName) {
        skippedWithoutInstitution += 1;
        continue;
      }

      const key = historyCompanyKey(institutionName);
      const sourceId = Number(row?.id || 0);
      if (!sourceId) continue;

      const existing = grouped.get(key);
      if (!existing) {
        grouped.set(key, {
          id: sourceId,
          name: historyText(row?.name),
          institutionName,
          companyName: institutionName,
          programType: historyText(row?.program_type),
          label: institutionName,
          databaseCount: 1,
        });
        continue;
      }

      existing.databaseCount += 1;
    }

    const sources = Array.from(grouped.values())
      .sort((a: any, b: any) => a.companyName.localeCompare(b.companyName, "id"));

    return ok({ sources, skippedWithoutInstitution });
  } catch (error: any) {
    return fail(String(error?.message || error || "Gagal memuat daftar perusahaan vaksinasi."), 500);
  }
}
