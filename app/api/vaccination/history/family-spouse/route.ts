import { NextRequest } from "next/server";
import { canVaccinationAccess } from "@/lib/vaccination/access";
import { historyNameKey } from "@/lib/vaccination/history";
import { fail, ok, requireUser, supabaseAdmin, toInt } from "../../_utils";

// V6341: spouse is an independent relationship. Never encode spouse as CHILD/GUARDIAN.
// Schema migration is manual and must be verified separately in staging.
export const dynamic = "force-dynamic";
const TABLE = "vaccination_family_spouses_v6341";
const idOf = (v: unknown) => { const n = Number(v); return Number.isSafeInteger(n) && n > 0 ? n : 0; };
function unavailable(e: any) {
  const message = String(e?.message || "");
  return e?.code === "42P01" || (message.includes(TABLE) && /schema cache|could not find|does not exist/i.test(message));
}
function session(req: NextRequest) {
  const user = requireUser(req);
  if (!user) return { error: fail("Unauthorized", 401) };
  if (!canVaccinationAccess(user, "register")) return { error: fail("Akses pengaturan Family ditolak.", 403) };
  return { error: null };
}
export async function GET(req: NextRequest) {
  const auth = session(req);
  if (auth.error) return auth.error;
  const companyId = toInt(req.nextUrl.searchParams.get("company_id"), 0);
  const personId = toInt(req.nextUrl.searchParams.get("person_id"), 0);
  if (!companyId || !personId) return fail("Company dan profil History wajib dipilih.", 400);
  const supabase = supabaseAdmin();
  try {
    const company = await supabase.from("vaccination_history_companies").select("id").eq("id", companyId).eq("active", true).maybeSingle();
    if (company.error) throw company.error;
    if (!company.data) return fail("Perusahaan tidak ditemukan.", 404);
    const person = await supabase.from("vaccination_persons").select("id").eq("id", personId).eq("company_id", companyId).eq("active", true).maybeSingle();
    if (person.error) throw person.error;
    if (!person.data) return fail("Profil bukan anggota perusahaan ini.", 404);
    const rows = await supabase.from(TABLE).select("id,person_a_id,person_b_id,active")
      .eq("company_id", companyId).eq("active", true)
      .or(`person_a_id.eq.${personId},person_b_id.eq.${personId}`).limit(21);
    if (rows.error) {
      if (unavailable(rows.error)) return ok({ schema_ready: false, spouses: [], note: "Migrasi V6341 belum tersedia." });
      throw rows.error;
    }
    if ((rows.data || []).length > 20) return fail("Terlalu banyak relasi. Perlu audit.", 409);
    const others = (rows.data || []).map((r: any) => Number(r.person_a_id) === personId ? Number(r.person_b_id) : Number(r.person_a_id));
    if (!others.length) return ok({ schema_ready: true, spouses: [] });
    const links = await supabase.from("vaccination_persons")
      .select("id,participant_name,employee_id,company_id,active")
      .eq("company_id", companyId).eq("active", true).in("id", others);
    if (links.error) throw links.error;
    return ok({ schema_ready: true, spouses: links.data || [] });
  } catch (e: any) { return fail(String(e?.message || "Gagal membaca hubungan pasangan."), 500); }
}
export async function POST(req: NextRequest) {
  const auth = session(req);
  if (auth.error) return auth.error;
  const body = await req.json().catch(() => null);
  const companyId = idOf(body?.companyId);
  const a = idOf(body?.firstHistoryPersonId);
  const b = idOf(body?.secondHistoryPersonId);
  if (!body?.confirmRelationship || !companyId || !a || !b || a === b ||
      !historyNameKey(body?.firstName) || !historyNameKey(body?.secondName)) {
    return fail("Konfirmasi kedua profil dan hubungan Suami/Istri diperlukan.", 400);
  }
  const supabase = supabaseAdmin();
  try {
    const company = await supabase.from("vaccination_history_companies").select("id").eq("id", companyId).eq("active", true).maybeSingle();
    if (company.error) throw company.error;
    if (!company.data) return fail("Perusahaan History tidak ditemukan.", 404);
    const profiles = await supabase.from("vaccination_persons")
      .select("id,company_id,participant_name,active")
      .eq("company_id", companyId).eq("active", true).in("id", [a,b]);
    if (profiles.error) throw profiles.error;
    if ((profiles.data || []).length !== 2) return fail("Kedua profil belum ada di Master History perusahaan yang sama.", 409);
    const personA = profiles.data.find((r: any) => Number(r.id) === a);
    const personB = profiles.data.find((r: any) => Number(r.id) === b);
    if (historyNameKey(personA?.participant_name) !== historyNameKey(body?.firstName) ||
        historyNameKey(personB?.participant_name) !== historyNameKey(body?.secondName)) {
      return fail("Nama profil berubah; cari ulang dan verifikasi kembali.", 409);
    }
    const lo = Math.min(a,b), hi = Math.max(a,b);
    // A second active partner for either person requires human review;
    // the migration trigger also enforces this under an advisory lock.
    const anyExisting = await supabase.from(TABLE).select("id,person_a_id,person_b_id,active")
      .eq("company_id", companyId).eq("active", true)
      .or(`person_a_id.in.(${a},${b}),person_b_id.in.(${a},${b})`).limit(11);
    if (anyExisting.error) {
      if (unavailable(anyExisting.error)) return fail("Migrasi tabel Spouse V6341 belum terpasang.", 423);
      throw anyExisting.error;
    }
    const conflicting = (anyExisting.data || []).find((link: any) =>
      !(Number(link.person_a_id) === lo && Number(link.person_b_id) === hi));
    if (conflicting) return fail("Salah satu peserta sudah memiliki pasangan aktif. Perlu audit sebelum membuat relasi lain.", 409);
    const prior = await supabase.from(TABLE).select("id,active")
      .eq("company_id", companyId).eq("person_a_id", lo).eq("person_b_id", hi).maybeSingle();
    if (prior.error) {
      if (unavailable(prior.error)) return fail("Migrasi tabel Spouse V6341 belum terpasang. Tidak ada data yang diubah.", 423);
      throw prior.error;
    }
    if (prior.data?.active) return ok({ alreadyLinked: true, message: "Hubungan pasangan sudah ada." });
    if (prior.data) return fail("Hubungan pasangan pernah dinonaktifkan; perlu audit, tidak diaktifkan otomatis.", 409);
    const saved = await supabase.from(TABLE).insert({ company_id: companyId, person_a_id: lo, person_b_id: hi, active: true })
      .select("id").single();
    if (saved.error) {
      if (saved.error?.code === "23505") return fail("Hubungan sudah ditautkan oleh proses lain. Refresh profil.", 409);
      if (unavailable(saved.error)) return fail("Migrasi Spouse V6341 belum tersedia.", 423);
      throw saved.error;
    }
    return ok({ relationshipId: saved.data?.id, message: "Suami/Istri berhasil ditautkan tanpa mengubah status karyawan, Parent/Child, atau riwayat vaksinasi." });
  } catch (e: any) { return fail(String(e?.message || "Gagal menambahkan pasangan."), 500); }
}
