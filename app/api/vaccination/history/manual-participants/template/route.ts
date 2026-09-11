import { NextRequest, NextResponse } from "next/server";
import { canVaccinationAccess } from "@/lib/vaccination/access";
import { historyText } from "@/lib/vaccination/history";
import { buildManualHistoryParticipantTemplate } from "@/lib/vaccination/historyManualParticipant";
import { fail, requireUser, supabaseAdmin, toInt } from "../../../_utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeFileName(value: unknown) {
  return historyText(value).replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "") || "Perusahaan";
}

export async function GET(req: NextRequest) {
  const user = requireUser(req);
  if (!user || !canVaccinationAccess(user, "dashboard")) return fail("Akses template History ditolak.", 403);

  const companyId = toInt(req.nextUrl.searchParams.get("company_id"), 0);
  let companyName = "Perusahaan";
  if (companyId) {
    const result = await supabaseAdmin()
      .from("vaccination_history_companies")
      .select("company_name")
      .eq("id", companyId)
      .eq("active", true)
      .maybeSingle();
    if (result.error) return fail(result.error.message, 500);
    if (result.data?.company_name) companyName = result.data.company_name;
  }

  const workbook = buildManualHistoryParticipantTemplate();
  const filename = `Template_Tambah_Peserta_History_${safeFileName(companyName)}.xlsx`;
  return new NextResponse(new Uint8Array(workbook), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename=\"${filename}\"`,
      "Cache-Control": "no-store",
    },
  });
}
