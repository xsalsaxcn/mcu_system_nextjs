import { NextRequest } from "next/server";
import { fail, ok, supabaseAdmin } from "../../../_utils";
import { resolveVaccinationHistoryCompanyPortal } from "@/lib/vaccination/historyCompanyPortal";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const portal = await resolveVaccinationHistoryCompanyPortal(
      supabaseAdmin(),
      req.nextUrl.searchParams.get("token"),
    );
    if (!portal) return fail("QR Portal Peserta tidak aktif atau tidak ditemukan.", 404);

    return ok({
      company: portal.company,
      portal_token: portal.public_token,
    });
  } catch (error: any) {
    return fail(error?.message || "Gagal membaca Portal Peserta perusahaan.", 500);
  }
}
