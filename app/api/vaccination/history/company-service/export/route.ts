import { NextRequest } from "next/server";
import { deflateRawSync } from "zlib";
import { requireUser, supabaseAdmin, toInt } from "../../../_utils";
import { canVaccinationAccess } from "@/lib/vaccination/access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CHUNK = 200;

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function dateOnly(value: unknown) {
  const text = clean(value);
  if (!text) return "";
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return text.slice(0, 10);
  return parsed.toISOString().slice(0, 10);
}

function xmlText(value: unknown) {
  return clean(value)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function serviceLabel(row: any) {
  const service = clean(row?.service_name);
  const brand = clean(row?.product_brand);
  if (service && brand && !service.toLowerCase().includes(brand.toLowerCase())) {
    return `${service} · ${brand}`;
  }
  return service || brand || "Layanan";
}

function chunks<T>(values: T[], size = CHUNK) {
  const output: T[][] = [];
  for (let i = 0; i < values.length; i += size) output.push(values.slice(i, i + size));
  return output;
}

async function loadAllPersons(supabase: any, companyId: number) {
  const rows: any[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const result = await supabase
      .from("vaccination_persons")
      .select("id,company_id,participant_type,participant_name,employee_id,nik,email,phone,birth_date,gender,active")
      .eq("company_id", companyId)
      .eq("active", true)
      .order("participant_name", { ascending: true })
      .range(from, from + pageSize - 1);

    if (result.error) throw new Error(result.error.message);
    const batch = result.data || [];
    rows.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

async function loadHistoryByPerson(supabase: any, companyId: number, personIds: number[]) {
  const map = new Map<number, any[]>();

  for (const ids of chunks(personIds)) {
    const result = await supabase
      .from("vaccination_service_history")
      .select("id,person_id,service_date,service_name,product_brand")
      .eq("company_id", companyId)
      .in("person_id", ids)
      .order("service_date", { ascending: false, nullsFirst: false })
      .order("id", { ascending: false });

    if (result.error) throw new Error(result.error.message);

    for (const row of result.data || []) {
      const personId = Number(row.person_id);
      if (!map.has(personId)) map.set(personId, []);
      map.get(personId)!.push(row);
    }
  }

  return map;
}

async function loadParentMap(supabase: any, dependentIds: number[]) {
  const map = new Map<number, any>();

  for (const ids of chunks(dependentIds)) {
    const result = await supabase
      .from("vaccination_person_relationships")
      .select(
        "dependent_person_id,parent:vaccination_persons!vaccination_person_relationships_parent_person_id_fkey(id,participant_name,employee_id,nik,email,phone,birth_date)",
      )
      .in("dependent_person_id", ids)
      .eq("active", true);

    if (result.error) throw new Error(result.error.message);

    for (const relation of result.data || []) {
      const parent = Array.isArray(relation.parent)
        ? relation.parent[0]
        : relation.parent;
      if (parent) map.set(Number(relation.dependent_person_id), parent);
    }
  }

  return map;
}

function columnName(index: number) {
  let value = index + 1;
  let result = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}

function inlineCell(ref: string, value: unknown, style = 2) {
  return `<c r="${ref}" t="inlineStr" s="${style}"><is><t xml:space="preserve">${xmlText(value)}</t></is></c>`;
}

function numberCell(ref: string, value: number, style = 2) {
  const safe = Number.isFinite(value) ? value : 0;
  return `<c r="${ref}" s="${style}"><v>${safe}</v></c>`;
}

let crcTable: number[] | null = null;

function getCrcTable() {
  if (crcTable) return crcTable;
  crcTable = [];
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    crcTable[n] = c >>> 0;
  }
  return crcTable;
}

function crc32(buffer: Buffer) {
  const table = getCrcTable();
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    crc = table[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeZip(files: Array<{ name: string; data: string | Buffer }>) {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const name = Buffer.from(file.name, "utf8");
    const raw = Buffer.isBuffer(file.data)
      ? file.data
      : Buffer.from(file.data, "utf8");
    const compressed = deflateRawSync(raw, { level: 6 });
    const crc = crc32(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);

    localParts.push(local, name, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);

    centralParts.push(central, name);
    offset += local.length + name.length + compressed.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, end]);
}

function buildWorkbook(rows: any[][]) {
  const headerCount = rows[0]?.length || 1;
  const lastColumn = columnName(headerCount - 1);
  const lastRow = rows.length;

  const widths = [
    7, 28, 28, 18, 24, 20, 30, 18, 16, 14,
    28, 24, 20, 30, 18, 48, 14, 35, 20,
  ];

  const colsXml = widths
    .map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`)
    .join("");

  const rowXml = rows.map((row, rowIndex) => {
    const excelRow = rowIndex + 1;
    const isHeader = rowIndex === 0;
    const cells = row.map((value, colIndex) => {
      const ref = `${columnName(colIndex)}${excelRow}`;
      const numericColumn = !isHeader && (colIndex === 0 || colIndex === 16);
      if (numericColumn) return numberCell(ref, Number(value || 0), 2);
      return inlineCell(ref, value, isHeader ? 1 : 2);
    }).join("");

    return `<row r="${excelRow}"${isHeader ? ' ht="30" customHeight="1"' : ""}>${cells}</row>`;
  }).join("");

  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:${lastColumn}${lastRow}"/>
  <sheetViews>
    <sheetView workbookViewId="0">
      <pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>
    </sheetView>
  </sheetViews>
  <sheetFormatPr defaultRowHeight="18"/>
  <cols>${colsXml}</cols>
  <sheetData>${rowXml}</sheetData>
  <autoFilter ref="A1:${lastColumn}${lastRow}"/>
</worksheet>`;

  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2">
    <font><sz val="11"/><name val="Calibri"/><family val="2"/></font>
    <font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/><family val="2"/></font>
  </fonts>
  <fills count="3">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF0F766E"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"><color rgb="FFE2E8F0"/></left>
      <right style="thin"><color rgb="FFE2E8F0"/></right>
      <top style="thin"><color rgb="FFE2E8F0"/></top>
      <bottom style="thin"><color rgb="FFE2E8F0"/></bottom>
      <diagonal/>
    </border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="3">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center" wrapText="1"/>
    </xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1">
      <alignment vertical="top" wrapText="1"/>
    </xf>
  </cellXfs>
  <cellStyles count="1">
    <cellStyle name="Normal" xfId="0" builtinId="0"/>
  </cellStyles>
</styleSheet>`;

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Data Peserta" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`;

  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

  return makeZip([
    { name: "[Content_Types].xml", data: contentTypes },
    { name: "_rels/.rels", data: rootRels },
    { name: "xl/workbook.xml", data: workbookXml },
    { name: "xl/_rels/workbook.xml.rels", data: workbookRels },
    { name: "xl/styles.xml", data: stylesXml },
    { name: "xl/worksheets/sheet1.xml", data: sheetXml },
  ]);
}

export async function GET(req: NextRequest) {
  const user = requireUser(req);
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!canVaccinationAccess(user, "dashboard")) {
    return new Response("Akses export History Company ditolak.", { status: 403 });
  }

  const companyId = toInt(req.nextUrl.searchParams.get("company_id"), 0);
  if (!companyId) return new Response("company_id wajib diisi.", { status: 400 });

  const supabase = supabaseAdmin();

  try {
    const companyResult = await supabase
      .from("vaccination_history_companies")
      .select("id,company_name,active")
      .eq("id", companyId)
      .eq("active", true)
      .maybeSingle();

    if (companyResult.error) throw new Error(companyResult.error.message);
    const company = companyResult.data;
    if (!company) return new Response("Perusahaan History tidak ditemukan.", { status: 404 });

    const persons = await loadAllPersons(supabase, companyId);
    const personIds = persons.map((row: any) => Number(row.id)).filter(Boolean);
    const dependentIds = persons
      .filter((row: any) => String(row.participant_type || "").toUpperCase() === "DEPENDENT")
      .map((row: any) => Number(row.id))
      .filter(Boolean);

    const [historyByPerson, parentMap] = await Promise.all([
      loadHistoryByPerson(supabase, companyId, personIds),
      loadParentMap(supabase, dependentIds),
    ]);

    const rows: any[][] = [[
      "No",
      "Perusahaan",
      "Nama Peserta",
      "Tipe Peserta",
      "BINUSIAN ID / NIP / Employee ID",
      "NIK",
      "Email",
      "No HP",
      "Tanggal Lahir",
      "Gender",
      "Parent",
      "Parent BINUSIAN ID / NIP",
      "Parent NIK",
      "Parent Email",
      "Parent No HP",
      "Benefit / Layanan Diambil",
      "Total Benefit",
      "Layanan Terakhir",
      "Tanggal Layanan Terakhir",
    ]];

    persons.forEach((person: any, index: number) => {
      const history = historyByPerson.get(Number(person.id)) || [];
      const uniqueBenefits = Array.from(
        new Set(history.map(serviceLabel).filter(Boolean)),
      );
      const latest = history[0] || null;
      const parent = parentMap.get(Number(person.id)) || null;

      rows.push([
        index + 1,
        company.company_name,
        person.participant_name,
        String(person.participant_type || "").toUpperCase() === "DEPENDENT"
          ? "ANAK / TANGGUNGAN"
          : "KARYAWAN",
        clean(person.employee_id),
        clean(person.nik),
        clean(person.email),
        clean(person.phone),
        dateOnly(person.birth_date),
        clean(person.gender),
        clean(parent?.participant_name),
        clean(parent?.employee_id),
        clean(parent?.nik),
        clean(parent?.email),
        clean(parent?.phone),
        uniqueBenefits.join(" | "),
        history.length,
        latest ? serviceLabel(latest) : "",
        latest ? dateOnly(latest.service_date) : "",
      ]);
    });

    const workbook = buildWorkbook(rows);
    const safeCompany = clean(company.company_name)
      .replace(/[^A-Za-z0-9_-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 80) || "COMPANY";

    return new Response(workbook, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${safeCompany}_HISTORY_PESERTA_LENGKAP.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error: any) {
    return new Response(
      `Gagal export Excel History Company: ${String(error?.message || error || "Unknown error")}`,
      { status: 500 },
    );
  }
}
