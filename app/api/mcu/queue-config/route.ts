import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { fail, ok } from "@/lib/server/response";
import { getMcuCorporateSession } from "@/lib/server/mcuCorporateSession";
import { cleanQueueName, ensureMcuQueueSession } from "@/lib/server/mcuQueue";

export const dynamic = "force-dynamic";

function relativePublicUrl(token: string) {
  return `/mcu/public/queue/${encodeURIComponent(token)}`;
}

export async function GET(req: NextRequest) {
  const user = getSessionUser(req);
  if (!user) return fail("Unauthorized", 401);

  const selected = getMcuCorporateSession(req);
  if (!selected) return fail("Aktifkan Session MCU Corporate terlebih dahulu.", 400);

  try {
    const supabase = getSupabaseAdmin();
    const queueSession = await ensureMcuQueueSession(supabase, {
      companyId: selected.company_id,
      packageId: selected.package_id,
    });

    return ok({
      queue_session: queueSession,
      public_url: relativePublicUrl(queueSession.public_token),
    });
  } catch (error: any) {
    return fail(error?.message || "Gagal memuat setting Antrian MCU.", 500);
  }
}

export async function POST(req: NextRequest) {
  const user = getSessionUser(req);
  if (!user) return fail("Unauthorized", 401);

  const selected = getMcuCorporateSession(req);
  if (!selected) return fail("Aktifkan Session MCU Corporate terlebih dahulu.", 400);

  const body = await req.json().catch(() => ({}));
  const trackAName = cleanQueueName(body.track_a_name, "Lab Darah");
  const trackBName = cleanQueueName(body.track_b_name, "Rontgen");

  if (!trackAName || !trackBName) return fail("Nama Antrian A dan B wajib diisi.", 400);
  if (trackAName.toLowerCase() === trackBName.toLowerCase()) {
    return fail("Nama Antrian A dan B harus berbeda.", 400);
  }

  try {
    const supabase = getSupabaseAdmin();
    const queueSession = await ensureMcuQueueSession(supabase, {
      companyId: selected.company_id,
      packageId: selected.package_id,
      trackAName,
      trackBName,
    });

    return ok({
      message: "Penamaan Antrian MCU berhasil disimpan.",
      queue_session: queueSession,
      public_url: relativePublicUrl(queueSession.public_token),
    });
  } catch (error: any) {
    return fail(error?.message || "Gagal menyimpan setting Antrian MCU.", 500);
  }
}
