import type { SupabaseClient } from "@supabase/supabase-js";
import { historyText } from "@/lib/vaccination/history";

export function vaccinationHistoryCompanyToken(value: unknown) {
  return historyText(value).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 160);
}

export async function resolveVaccinationHistoryCompanyPortal(supabase: SupabaseClient, rawToken: unknown) {
  const token = vaccinationHistoryCompanyToken(rawToken);
  if (!token) return null;

  const companyResult = await supabase
    .from("vaccination_history_companies")
    .select("id,company_name,company_key,public_token,active")
    .eq("public_token", token)
    .eq("active", true)
    .maybeSingle();
  if (companyResult.error) throw companyResult.error;
  if (!companyResult.data) return null;

  return {
    company_id: Number(companyResult.data.id),
    public_token: historyText(companyResult.data.public_token),
    company: {
      id: Number(companyResult.data.id),
      company_name: historyText(companyResult.data.company_name),
      company_key: historyText(companyResult.data.company_key),
    },
  };
}
