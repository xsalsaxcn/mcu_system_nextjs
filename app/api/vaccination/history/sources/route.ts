import { NextRequest } from "next/server";
import { fail, ok, requireUser, supabaseAdmin } from "../../_utils";
import { historyText } from "@/lib/vaccination/history";

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
      .or("program_type.eq.vaccination,program_type.eq.corporate,program_type.eq.all,program_type.is.null")
      .order("created_at", { ascending: false })
      .limit(1000);

    if (result.error) throw new Error(result.error.message);

    const sources = (result.data || [])
      .map((row: any) => {
        const name = historyText(row?.name);
        const institutionName = historyText(row?.institution_name);
        const companyName = institutionName || name;
        const label = companyName && name && companyName.toLowerCase() !== name.toLowerCase()
          ? `${companyName} · ${name}`
          : companyName || name;
        return {
          id: Number(row?.id || 0),
          name,
          institutionName,
          companyName,
          programType: historyText(row?.program_type),
          label,
        };
      })
      .filter((row: any) => row.id && row.companyName)
      .sort((a: any, b: any) => a.label.localeCompare(b.label, "id"));

    return ok({ sources });
  } catch (error: any) {
    return fail(String(error?.message || error || "Gagal memuat database perusahaan vaksinasi."), 500);
  }
}
