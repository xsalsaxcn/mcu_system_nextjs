import { NextRequest } from "next/server";
import { fail, ok } from "@/lib/server/response";
import { getSessionUser } from "@/lib/server/session";
import { getWellnessNakesUser } from "@/lib/wellness/nakesSession";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { canManageWellness, isWellnessParticipant } from "@/lib/wellness/auth";
import { calculateBmi, interpretBmi, toNumber } from "@/lib/wellness/bmi";
import { getAllowedWellnessParticipants } from "@/app/api/wellness/_utils";


// WELLNESS_INPUT_PRO_SELECTOR_V359_API

function cleanText(value: any) {
  return String(value ?? "").trim();
}

function looksLikeRiskCluster(value: any) {
  const text = cleanText(value).toLowerCase();
  if (!text) return false;
  return /^grup\s+[a-z0-9]+\s*[-–]/i.test(text)
    || text.includes("triple risk")
    || text.includes("glucose + hypertension")
    || text.includes("glucose + obesity")
    || text.includes("obesity + hypertension")
    || text.includes("hypertension dominant")
    || text.includes("risk cluster");
}

async function safeSelectByIds(supabase: any, table: string, ids: number[]) {
  const filtered = Array.from(new Set(ids.map(Number).filter(Boolean)));
  if (!filtered.length) return [];
  try {
    const { data, error } = await supabase.from(table).select("*").in("id", filtered);
    if (error) return [];
    return data || [];
  } catch {
    return [];
  }
}

function makeScopeText(companyName: string, kelompokName: string, groupUnitName: string, oldGroupName: string) {
  const parts = [companyName, kelompokName, groupUnitName].filter((item) => item && item !== "-");
  if (!parts.length && oldGroupName && oldGroupName !== "-") parts.push(oldGroupName);
  return parts.join(" > ");
}

function makeParticipantDisplay(participant: any, riskFromName: boolean) {
  const rawName = cleanText(participant?.name);
  if (!riskFromName && rawName) return rawName;
  const code = cleanText(participant?.code);
  return code ? `KODE ${code} - nama peserta perlu diperbaiki` : `Peserta #${participant?.id || "-"} - nama perlu diperbaiki`;
}

export async function GET(req: NextRequest) {
  const user = getWellnessNakesUser(req) || getSessionUser(req);
  if (!user) return fail("Unauthorized", 401);

  try {
    const supabase = getSupabaseAdmin();
    const participants = await getAllowedWellnessParticipants(supabase, user);
    const companyIds = participants.map((item: any) => Number(item.wellness_company_id)).filter(Boolean);
    const unitIds = participants
      .flatMap((item: any) => [Number(item.wellness_kelompok_id), Number(item.wellness_group_unit_id)])
      .filter(Boolean);
    const oldGroupIds = participants.map((item: any) => Number(item.group_id)).filter(Boolean);

    const [companies, groupUnits, oldGroups] = await Promise.all([
      safeSelectByIds(supabase, "wellness_companies", companyIds),
      safeSelectByIds(supabase, "wellness_group_units", unitIds),
      safeSelectByIds(supabase, "wellness_groups", oldGroupIds),
    ]);

    const companyName = new Map<number, string>((companies || []).map((item: any) => [Number(item.id), cleanText(item.name) || "-"]));
    const groupUnitName = new Map<number, string>((groupUnits || []).map((item: any) => [Number(item.id), cleanText(item.name) || "-"]));
    const oldGroupName = new Map<number, string>((oldGroups || []).map((item: any) => [Number(item.id), cleanText(item.name) || "-"]));

    const enriched = (participants || []).map((participant: any) => {
      const nameIsRisk = looksLikeRiskCluster(participant?.name);
      const riskCluster = cleanText(participant?.baseline_risk_group) || (nameIsRisk ? cleanText(participant?.name) : "");
      const company = companyName.get(Number(participant.wellness_company_id)) || "-";
      const kelompok = groupUnitName.get(Number(participant.wellness_kelompok_id)) || "-";
      const groupUnit = groupUnitName.get(Number(participant.wellness_group_unit_id)) || "-";
      const legacyGroup = oldGroupName.get(Number(participant.group_id)) || "-";
      const displayName = makeParticipantDisplay(participant, nameIsRisk);
      const scopeText = makeScopeText(company, kelompok, groupUnit, legacyGroup);
      const code = cleanText(participant?.code);
      const optionLabel = [
        `${code ? `${code} - ` : ""}${displayName}`,
        riskCluster,
        scopeText,
      ].filter(Boolean).join(" | ");

      return {
        ...participant,
        participant_display_name: displayName,
        participant_name: displayName,
        risk_cluster: riskCluster,
        company_name: company,
        kelompok_name: kelompok,
        group_unit_name: groupUnit,
        old_group_name: legacyGroup,
        scope_text: scopeText,
        option_label: optionLabel,
        name_warning: nameIsRisk ? "Nama peserta terlihat sebagai risk cluster, kemungkinan berasal dari import lama yang salah mapping." : "",
      };
    }).sort((a: any, b: any) => String(a.participant_display_name || a.name || "").localeCompare(String(b.participant_display_name || b.name || "")));

    return ok({ participants: enriched });
  } catch (error: any) {
    return fail(error?.message || "Gagal memuat peserta Wellness.", 500);
  }
}


export async function POST(req: NextRequest) {
  const user = getSessionUser(req);
  if (!user) return fail("Unauthorized", 401);
  if (!canManageWellness(user) && !isWellnessParticipant(user)) return fail("Akses ditolak.", 403);

  const body = await req.json().catch(() => ({}));
  const participantId = Number(body.id || body.participant_id || 0);
  const name = String(body.name || "").trim();

  if (!name) return fail("Nama peserta wajib diisi.");

  try {
    const supabase = getSupabaseAdmin();
    const height = toNumber(body.height_cm);
    const initialWeight = toNumber(body.initial_weight_kg);
    const payload: any = {
      name,
      code: String(body.code || "").trim() || null,
      gender: String(body.gender || "").trim() || null,
      phone: String(body.phone || "").trim() || null,
      email: String(body.email || "").trim() || null,
      height_cm: height,
      initial_weight_kg: initialWeight,
      target_weight_kg: toNumber(body.target_weight_kg),
      program_start_date: body.program_start_date || null,
      group_id: body.group_id ? Number(body.group_id) : null,
      coach_id: body.coach_id ? Number(body.coach_id) : null,
      updated_at: new Date().toISOString(),
    };

    if (isWellnessParticipant(user)) payload.user_id = user.id;
    else if (body.user_id) payload.user_id = Number(body.user_id);

    let result;
    if (participantId) {
      result = await supabase.from("wellness_participants").update(payload).eq("id", participantId).select("*").single();
    } else {
      result = await supabase.from("wellness_participants").insert({ ...payload, is_active: 1 }).select("*").single();
    }

    if (result.error) throw result.error;

    if (!participantId && initialWeight && height) {
      const bmi = calculateBmi(initialWeight, height);
      await supabase.from("wellness_weight_logs").insert({
        participant_id: result.data.id,
        log_date: new Date().toISOString().slice(0, 10),
        weight_kg: initialWeight,
        bmi,
        bmi_status: interpretBmi(bmi),
        notes: "Berat awal program",
        created_by: user.id,
      });
    }

    return ok({ participant: result.data });
  } catch (error: any) {
    return fail(error?.message || "Gagal menyimpan peserta Wellness.", 500);
  }
}
