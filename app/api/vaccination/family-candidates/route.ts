import { NextRequest } from "next/server";
import { canVaccinationAccess } from "@/lib/vaccination/access";
import { historyCompanyKey, historyIdentityKey, historyNameKey, historyText } from "@/lib/vaccination/history";
import { fail, ok, requireUser, supabaseAdmin } from "../_utils";

// V597: READ ONLY. Find candidate relatives across import sources under the
// SAME master company. Shared Employee ID is a discovery hint, not a binding.
// Relationship is saved only via existing explicit /family-bind endpoint.
export const dynamic = "force-dynamic";

const clean = (value: unknown) => historyText(value);
const id = (value: unknown) => {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : 0;
};
const first = (...values: unknown[]) => values.map(clean).find(Boolean) || "";

function candidateIdentity(row: any) {
  return first(row.employee_id, row.employee_nik, row.external_id, row.mcu_id, row.barcode_value);
}

export async function GET(req: NextRequest) {
  const user = requireUser(req);
  if (!user) return fail("Unauthorized", 401);
  if (!canVaccinationAccess(user, "register")) return fail("Akses registrasi vaksinasi ditolak.", 403);

  const companyKey = historyCompanyKey(req.nextUrl.searchParams.get("company_key"));
  const rawEmployee = clean(req.nextUrl.searchParams.get("employee_id"));
  const employeeKey = historyIdentityKey(rawEmployee);
  const selectedParticipantId = id(req.nextUrl.searchParams.get("participant_id"));
  const selectedHistoryId = id(req.nextUrl.searchParams.get("history_person_id"));
  if (!companyKey || companyKey === "unknown-company" || !employeeKey ||
      !/^[a-zA-Z0-9_-]{3,48}$/.test(rawEmployee) ||
      (!selectedParticipantId && !selectedHistoryId)) {
    return fail("Pilih profil existing, perusahaan, dan Employee ID yang valid.");
  }

  const supabase = supabaseAdmin();
  try {
    // Only Vaccination-compatible sources with EXACT same normalized company.
    const sourceRes = await supabase.from("participant_sources")
      .select("id,name,institution_name,program_type")
      .order("id", { ascending: false }).limit(2000);
    if (sourceRes.error) throw new Error(sourceRes.error.message);
    const sources = (sourceRes.data || []).filter((source: any) => {
      const program = clean(source.program_type).toLowerCase();
      return (!program || ["vaccination", "corporate", "all"].includes(program)) &&
        historyCompanyKey(first(source.institution_name, source.name)) === companyKey;
    });
    const sourceIds = sources.map((source: any) => Number(source.id)).filter(Boolean);
    const sourceLabels = new Map(sources.map((source: any) => [Number(source.id), clean(source.name)]));

    // The columns below are confirmed search columns in register-master-search.
    // Search the Employee ID in all documented imported-ID fields; server-side
    // exact identity filtering below prevents fuzzy/cross-company suggestions.
    const knownIdSearch = ["mcu_id", "external_id", "barcode_value", "nik"]
      .map((column) => `${column}.ilike.${rawEmployee}`).join(",");
    const operationalRes = sourceIds.length
      ? await supabase.from("participants").select("*")
          .in("source_id", sourceIds).or(knownIdSearch).limit(200)
      : { data: [], error: null };
    if (operationalRes.error) throw new Error(operationalRes.error.message);

    // The same ID may have another representation in employee_id/employee_nik.
    // Search by source-scoped participant IDs only when needed, never scan or
    // guess another company's participants. Read-only and bounded.
    let operationalRows = operationalRes.data || [];
    if (operationalRows.length === 0 && sourceIds.length) {
      const extraRes = await supabase.from("participants").select("*")
        .in("source_id", sourceIds).order("id", { ascending: false }).limit(1000);
      if (extraRes.error) throw new Error(extraRes.error.message);
      operationalRows = extraRes.data || [];
    }

    const results: any[] = [];
    const seen = new Set<string>();
    for (const row of operationalRows) {
      const employeeId = candidateIdentity(row);
      if (historyIdentityKey(employeeId) !== employeeKey) continue;
      const participantId = id(row.id);
      if (!participantId || participantId === selectedParticipantId) continue;
      const name = first(row.name, row.participant_name);
      if (!historyNameKey(name)) continue;
      const key = `db:${participantId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push({
        sourceType: "DATABASE", participantId, historyPersonId: null,
        name, employeeId,
        nik: first(row.nik, row.ktp, row.nik_ktp),
        participantType: first(row.participant_type, row.employee_type, "EMPLOYEE"),
        sourceLabel: sourceLabels.get(Number(row.source_id)) || "Database peserta",
      });
    }

    const companyRes = await supabase.from("vaccination_history_companies")
      .select("id").eq("company_key", companyKey).eq("active", true).maybeSingle();
    if (companyRes.error) throw new Error(companyRes.error.message);
    if (companyRes.data) {
      const historyRes = await supabase.from("vaccination_persons")
        .select("id,participant_name,employee_id,nik,participant_type")
        .eq("company_id", companyRes.data.id).eq("active", true)
        .eq("employee_key", employeeKey).limit(200);
      if (historyRes.error) throw new Error(historyRes.error.message);
      for (const row of historyRes.data || []) {
        const historyPersonId = id(row.id);
        if (!historyPersonId || historyPersonId === selectedHistoryId) continue;
        const name = clean(row.participant_name);
        if (!historyNameKey(name) || historyIdentityKey(row.employee_id) !== employeeKey) continue;
        const key = `history:${historyPersonId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        results.push({
          sourceType: "HISTORY_COMPANY", participantId: null, historyPersonId,
          name, employeeId: clean(row.employee_id), nik: clean(row.nik),
          participantType: clean(row.participant_type), sourceLabel: "History Company",
        });
      }
    }

    // Return candidates only. Never infer Parent/Child from import type,
    // shared BINUSIAN ID, matching name or location.
    return ok({ candidates: results.slice(0, 100), companyKey, searchedEmployeeId: rawEmployee });
  } catch (error: any) {
    return fail(String(error?.message || "Gagal mencari kandidat Family lintas import."), 500);
  }
}
