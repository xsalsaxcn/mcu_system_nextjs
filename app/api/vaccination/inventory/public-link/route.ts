import { NextRequest } from "next/server";
import { canVaccinationAccess } from "@/lib/vaccination/access";
import { getVaccinationInventoryPublicToken } from "@/lib/vaccination/inventoryPublicPortal";
import { fail, ok, requireUser } from "../../_utils";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = requireUser(req);
  if (!user) return fail("Unauthorized", 401);
  if (!canVaccinationAccess(user, "inventory")) {
    return fail("Akses inventory ditolak untuk role ini.", 403);
  }

  try {
    const token = getVaccinationInventoryPublicToken();
    const path = `/vaccination/public/inventory/${encodeURIComponent(token)}`;
    return ok({
      token,
      path,
      url: `${req.nextUrl.origin}${path}`,
      mode: "READ_ONLY",
      capabilities: ["view", "filter", "movement-detail", "export"],
    });
  } catch (error: any) {
    return fail(error?.message || "Gagal membuat link Portal Inventory.", 500);
  }
}
