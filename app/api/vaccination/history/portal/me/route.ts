import { NextRequest } from "next/server";
import { fail, ok, supabaseAdmin } from "../../../_utils";
import { getVaccinationHistoryPortalPerson } from "@/lib/vaccination/historyPortalAuth";
import { loadVaccinationHistoryPortalData } from "@/lib/vaccination/historyPortalData";
import { resolveVaccinationHistoryCompanyPortal, vaccinationHistoryCompanyToken } from "@/lib/vaccination/historyCompanyPortal";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const supabase = supabaseAdmin();
    const companyToken = vaccinationHistoryCompanyToken(req.nextUrl.searchParams.get("company"));
    if (!companyToken) return fail("Akses harus melalui QR Portal Peserta perusahaan.", 400);
    const portal = await resolveVaccinationHistoryCompanyPortal(supabase, companyToken);
    if (!portal) return fail("QR Portal Peserta tidak aktif atau tidak ditemukan.", 404);

    const person = await getVaccinationHistoryPortalPerson(supabase, req);
    if (!person) return fail("Session portal tidak aktif. Silakan login kembali.", 401);
    if (Number(person.company_id) !== Number(portal.company_id)) return fail("Session portal bukan untuk perusahaan ini.", 403);
    return ok(await loadVaccinationHistoryPortalData(supabase, person));
  } catch (error: any) {
    return fail(error?.message || "Gagal memuat riwayat layanan peserta.", 500);
  }
}
