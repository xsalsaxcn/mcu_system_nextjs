import { NextRequest } from "next/server";
import { buildVaccinationInventoryReport } from "@/lib/vaccination/inventoryReport";
import { canVaccinationAccess } from "@/lib/vaccination/access";
import { fail, ok, requireUser } from "../../_utils";

export const dynamic = "force-dynamic";

function ids(value: string | null) {
  return String(value || "").split(",").map(Number).filter(Boolean);
}

export async function GET(req: NextRequest) {
  const user = requireUser(req);
  if (!user) return fail("Unauthorized", 401);
  if (!canVaccinationAccess(user, "inventory") && !canVaccinationAccess(user, "dashboard")) {
    return fail("Akses inventory ditolak untuk role ini.", 403);
  }

  try {
    const report = await buildVaccinationInventoryReport({
      vaccineIds: ids(req.nextUrl.searchParams.get("vaccine_ids")),
      from: req.nextUrl.searchParams.get("from") || "",
      to: req.nextUrl.searchParams.get("to") || "",
    });
    return ok(report);
  } catch (error: any) {
    return fail(error?.message || "Gagal mengambil report inventory.", 500);
  }
}
