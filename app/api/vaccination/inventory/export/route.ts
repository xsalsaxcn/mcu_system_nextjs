import { NextRequest, NextResponse } from "next/server";
import { buildVaccinationInventoryReport } from "@/lib/vaccination/inventoryReport";
import { canVaccinationAccess } from "@/lib/vaccination/access";
import { requireUser } from "../../_utils";

export const dynamic = "force-dynamic";

function csv(value: any) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function ids(value: string | null) {
  return String(value || "").split(",").map(Number).filter(Boolean);
}

export async function GET(req: NextRequest) {
  const user = requireUser(req);
  if (!user) return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  if (!canVaccinationAccess(user, "export")) {
    return NextResponse.json({ ok: false, message: "Akses export ditolak untuk role ini." }, { status: 403 });
  }

  try {
    const report = await buildVaccinationInventoryReport({
      vaccineIds: ids(req.nextUrl.searchParams.get("vaccine_ids")),
      from: req.nextUrl.searchParams.get("from") || "",
      to: req.nextUrl.searchParams.get("to") || "",
    });

    const headers = [
      "TANGGAL",
      "ARAH",
      "TIPE",
      "PERUSAHAAN_SUMBER_TUJUAN",
      "NAMA_PESERTA",
      "EMPLOYEE_ID",
      "MCU_ID",
      "SESSION",
      "LOKASI",
      "VAKSIN",
      "BRAND",
      "LOT",
      "DOSE",
      "DOKTER_PETUGAS",
      "QTY",
      "PRINT_STATUS",
      "VALIDATION_STATUS",
      "REFERENSI",
      "CATATAN",
    ];

    const lines = [headers.join(",")];
    for (const row of report.details) {
      lines.push([
        row.date,
        row.direction,
        row.movement_type,
        row.company,
        row.participant,
        row.employee_id,
        row.mcu_id,
        row.session,
        row.location,
        row.vaccine,
        row.brand,
        row.lot,
        row.dose,
        row.doctor,
        row.qty,
        row.print_status,
        row.validation_status,
        row.reference,
        row.note,
      ].map(csv).join(","));
    }

    const body = "\ufeff" + lines.join("\r\n");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="vaccination_inventory_${stamp}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error: any) {
    return NextResponse.json({ ok: false, message: error?.message || "Export gagal." }, { status: 500 });
  }
}
