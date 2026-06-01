import { NextRequest } from "next/server";
import { clean, fail, ok, requireUser, supabaseAdmin, toInt } from "../_utils";

export const dynamic = "force-dynamic";

type LocationGroup = {
  key: string;
  locationName: string;
  sessionDate: string;
  timeSlot: string;
  timeSlots: Set<string>;
  batchName: string;
  batchNames: Set<string>;
  timeAreaName: string;
  participantCount: number;
  rawRowCount: number;
  participantKeys: Set<string>;
  sessionName: string;
};

function normalize(value: any) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function makeFallbackKey(sourceId: number, locationName: string, sessionDate: string) {
  return [sourceId, normalize(locationName) || "lokasi belum ditentukan", sessionDate || "tanpa tanggal"].join("|");
}

function participantKey(row: any) {
  return clean(row.nik) || clean(row.external_id) || clean(row.mcu_id) || clean(row.email) || `${normalize(row.participant_name)}|${normalize(row.location_name)}`;
}

function formatSessionName(sourceName: string, group: LocationGroup) {
  const parts = [sourceName, group.locationName, group.sessionDate].map(clean).filter(Boolean);
  return parts.join(" - ");
}

export async function GET(req: NextRequest) {
  const user = requireUser(req);
  if (!user) return fail("Unauthorized", 401);

  const sourceId = toInt(req.nextUrl.searchParams.get("source_id"), 0);
  if (!sourceId) return fail("source_id wajib diisi.");

  const supabase = supabaseAdmin();

  const sourceResult = await supabase
    .from("participant_sources")
    .select("id,name,institution_name")
    .eq("id", sourceId)
    .maybeSingle();

  const sourceName = clean(sourceResult.data?.name) || clean(sourceResult.data?.institution_name) || `Database ${sourceId}`;

  const result = await supabase
    .from("vaccination_import_rows")
    .select("id,source_id,mcu_id,external_id,participant_name,nik,email,batch_name,time_area_name,time_name,location_name,session_date,time_slot,import_location_key")
    .eq("source_id", sourceId)
    .order("session_date", { ascending: true })
    .order("location_name", { ascending: true })
    .order("time_slot", { ascending: true })
    .limit(10000);

  if (result.error) {
    return ok({
      locations: [],
      message: "Metadata lokasi vaksinasi belum tersedia. Jalankan SQL v55 dan re-import database vaksinasi agar TimeAreaName/TimeName terbaca.",
      error: result.error.message,
    });
  }

  const grouped = new Map<string, LocationGroup>();

  for (const row of result.data || []) {
    const locationName = clean(row.location_name) || clean(row.time_area_name) || "Lokasi belum ditentukan";
    const sessionDate = clean(row.session_date);
    const timeSlot = clean(row.time_slot) || clean(row.time_name) || "Belum ditentukan";
    const key = makeFallbackKey(sourceId, locationName, sessionDate);

    if (!grouped.has(key)) {
      grouped.set(key, {
        key,
        locationName,
        sessionDate,
        timeSlot: "Gabungan semua jam",
        timeSlots: new Set<string>(),
        batchName: clean(row.batch_name),
        batchNames: new Set<string>(),
        timeAreaName: clean(row.time_area_name),
        participantCount: 0,
        rawRowCount: 0,
        participantKeys: new Set<string>(),
        sessionName: "",
      });
    }

    const item = grouped.get(key)!;
    item.rawRowCount += 1;
    if (timeSlot) item.timeSlots.add(timeSlot);
    const pKey = participantKey(row);
    if (pKey) item.participantKeys.add(pKey);
    if (clean(row.batch_name)) item.batchNames.add(clean(row.batch_name));
    if (!item.batchName && clean(row.batch_name)) item.batchName = clean(row.batch_name);
    if (!item.timeAreaName && clean(row.time_area_name)) item.timeAreaName = clean(row.time_area_name);
  }

  const locations = Array.from(grouped.values()).map((item) => {
    const batchNames = Array.from(item.batchNames.values());
    return {
      key: item.key,
      locationName: item.locationName,
      sessionDate: item.sessionDate,
      timeSlot: Array.from(item.timeSlots.values()).join(", ") || item.timeSlot,
      batchName: item.batchName,
      batchNames,
      vaccineCount: batchNames.length,
      timeAreaName: item.timeAreaName,
      participantCount: item.participantKeys.size || item.rawRowCount,
      rawRowCount: item.rawRowCount,
      sessionName: formatSessionName(sourceName, item),
    };
  });

  return ok({ locations, source: sourceResult.data || null });
}
