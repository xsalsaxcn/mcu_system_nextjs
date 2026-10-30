import { NextRequest, NextResponse } from "next/server";
import { buildVaccinationInventoryReport } from "@/lib/vaccination/inventoryReport";
import { buildVaccinationInventorySnapshot } from "@/lib/vaccination/inventorySnapshot";
import { verifyVaccinationInventoryPublicToken } from "@/lib/vaccination/inventoryPublicPortal";

export const dynamic = "force-dynamic";

function clean(value: any) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function ids(value: string | null) {
  return String(value || "").split(",").map(Number).filter(Boolean);
}

function csv(value: any) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function normalized(value: any) {
  return clean(value).toLowerCase();
}

function filterDetailRows(rows: any[], req: NextRequest) {
  const company = normalized(req.nextUrl.searchParams.get("company"));
  const session = normalized(req.nextUrl.searchParams.get("session"));
  const service = clean(req.nextUrl.searchParams.get("service_mode")).toUpperCase();
  const q = normalized(req.nextUrl.searchParams.get("q"));

  return (rows || []).filter((row: any) => {
    if (company && normalized(row?.company) !== company) return false;
    if (session && normalized(row?.session) !== session && normalized(row?.location) !== session) return false;
    if (service && service !== "ALL" && clean(row?.service_mode).toUpperCase() !== service) return false;
    if (q) {
      const haystack = normalized([
        row?.vaccine,
        row?.brand,
        row?.lot,
        row?.participant,
        row?.employee_id,
        row?.mcu_id,
        row?.company,
        row?.session,
        row?.location,
        row?.movement_type,
        row?.sale_mode,
      ].filter(Boolean).join(" "));
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

function detailSummary(rows: any[]) {
  const participantRows = rows.filter((row: any) => clean(row?.movement_type).toLowerCase().startsWith("terpakai") && clean(row?.participant));
  return {
    rows: rows.length,
    participantRows: participantRows.length,
    healthday: participantRows.filter((row: any) => clean(row?.service_mode).toUpperCase() === "HEALTHDAY").length,
    bazar: participantRows.filter((row: any) => clean(row?.service_mode).toUpperCase() === "BAZAR").length,
    package: participantRows.filter((row: any) => clean(row?.sale_mode).toUpperCase() === "PACKAGE").length,
    nonPackage: participantRows.filter((row: any) => clean(row?.sale_mode).toUpperCase() === "NON_PACKAGE").length,
  };
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  try {
    if (!verifyVaccinationInventoryPublicToken(token)) {
      return NextResponse.json({ ok: false, message: "Link Portal Inventory tidak valid." }, { status: 403 });
    }

    const action = clean(req.nextUrl.searchParams.get("action") || "snapshot").toLowerCase();
    if (action === "snapshot") {
      const payload = await buildVaccinationInventorySnapshot();
      return NextResponse.json({ ok: true, readOnly: true, ...payload }, { headers: { "Cache-Control": "no-store" } });
    }

    const report = await buildVaccinationInventoryReport({
      vaccineIds: ids(req.nextUrl.searchParams.get("vaccine_ids")),
      lotIds: ids(req.nextUrl.searchParams.get("lot_ids") || req.nextUrl.searchParams.get("lot_id")),
      from: req.nextUrl.searchParams.get("from") || "",
      to: req.nextUrl.searchParams.get("to") || "",
    });
    const details = filterDetailRows(report.details || [], req);

    if (action === "export") {
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
        "LAYANAN",
        "JENIS_HARGA",
        "DOSIS_PAKET",
        "HARGA_SNAPSHOT",
        "DOSE",
        "DOKTER_PETUGAS",
        "QTY",
        "PRINT_STATUS",
        "VALIDATION_STATUS",
        "REFERENSI",
        "CATATAN",
      ];
      const lines = [headers.join(",")];
      for (const row of details) {
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
          row.service_mode || "",
          row.sale_mode || "",
          row.package_dose_count || "",
          row.sales_price_snapshot ?? "",
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
          "Content-Disposition": `attachment; filename="vaccination_inventory_public_${stamp}.csv"`,
          "Cache-Control": "no-store",
        },
      });
    }

    if (action !== "report") {
      return NextResponse.json({ ok: false, message: "Action tidak dikenali." }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      readOnly: true,
      filters: report.filters,
      products: report.products,
      summary: detailSummary(details),
      lotSummaries: report.lotSummaries,
      details,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: any) {
    return NextResponse.json({ ok: false, message: error?.message || "Portal Inventory gagal memuat data." }, { status: 500 });
  }
}
