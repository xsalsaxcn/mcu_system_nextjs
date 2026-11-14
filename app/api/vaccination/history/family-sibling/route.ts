import { NextRequest } from "next/server";
import { canVaccinationAccess } from "@/lib/vaccination/access";
import { historyNameKey } from "@/lib/vaccination/history";
import { fail, ok, requireUser, supabaseAdmin, toInt } from "../../_utils";

// V6342: Sibling is independent of Parent/Child and Spouse. A shared parent may
// prove a derived sibling relation; an explicit Sibling link requires migration.
// NO creation of people or writes to registration, vaccination or inventory.
export const dynamic = "force-dynamic";
const TABLE = "vaccination_family_siblings_v6342";
const idOf = (v: unknown) => {
  const n = Number(v);
  return Number.isSafeInteger(n) && n > 0 ? n : 0;
};
function unavailable(error: any) {
  const m = String(error?.message || "");
  return error?.code === "42P01" || (m.includes(TABLE) && /schema cache|could not find|does not exist/i.test(m));
}
function authorized(req: NextRequest) {
  const user = requireUser(req);
  if (!user) return fail("Unauthorized", 401);
  if (!canVaccinationAccess(user, "register")) return fail("Akses pengaturan Family ditolak.", 403);
  return null;
}
async function verifiedPeople(db: any, companyId: number, personIds: number[]) {
  const rows = await db.from("vaccination_persons")
    .select("id,company_id,participant_name,employee_id,nik,email,active")
    .eq("company_id", companyId).eq("active", true).in("id", personIds);
  if (rows.error) throw rows.error;
  return rows.data || [];
}
export async function GET(req: NextRequest) {
  const error = authorized(req);
  if (error) return error;
  const companyId = toInt(req.nextUrl.searchParams.get("company_id"), 0);
  const personId = toInt(req.nextUrl.searchParams.get("person_id"), 0);
  if (!companyId || !personId) return fail("Pilih perusahaan dan peserta History.", 400);
  const db = supabaseAdmin();
  try {
    const subject = await verifiedPeople(db, companyId, [personId]);
    if (subject.length !== 1) return fail("Profil History tidak ditemukan pada perusahaan ini.", 404);
    const ownParentLinks = await db.from("vaccination_person_relationships")
      .select("parent_person_id").eq("company_id", companyId).eq("dependent_person_id", personId).eq("active", true).limit(10);
    if (ownParentLinks.error) throw ownParentLinks.error;
    const parentIds = Array.from(new Set<number>((ownParentLinks.data || []).map((r: any) => Number(r.parent_person_id)).filter(Boolean)));
    const derivedIds = new Set<number>();
    if (parentIds.length) {
      const related = await db.from("vaccination_person_relationships")
        .select("dependent_person_id").eq("company_id", companyId).eq("active", true)
        .in("parent_person_id", parentIds).limit(250);
      if (related.error) throw related.error;
      for (const row of related.data || []) {
        const id = Number(row.dependent_person_id);
        if (id > 0 && id !== personId) derivedIds.add(id);
      }
    }
    const explicit = await db.from(TABLE).select("person_a_id,person_b_id")
      .eq("company_id", companyId).eq("active", true)
      .or(`person_a_id.eq.${personId},person_b_id.eq.${personId}`).limit(250);
    if (explicit.error && !unavailable(explicit.error)) throw explicit.error;
    const schemaReady = !explicit.error;
    const explicitIds = new Set<number>();
    if (schemaReady) for (const row of explicit.data || []) {
      const other = Number(row.person_a_id) === personId ? Number(row.person_b_id) : Number(row.person_a_id);
      if (other > 0 && other !== personId) explicitIds.add(other);
    }
    const allIds = Array.from(new Set<number>([...derivedIds, ...explicitIds]));
    const people = allIds.length ? await verifiedPeople(db, companyId, allIds) : [];
    return ok({ schema_ready: schemaReady, siblings: people.map((p: any) => ({
      id: p.id, participant_name: p.participant_name, employee_id: p.employee_id,
      source: explicitIds.has(Number(p.id)) ? "EXPLICIT" : "SHARED_PARENT",
    })) });
  } catch (error: any) { return fail(String(error?.message || "Gagal membaca hubungan Sibling."), 500); }
}
export async function POST(req: NextRequest) {
  const authError = authorized(req);
  if (authError) return authError;
  const body = await req.json().catch(() => null);
  const companyId = idOf(body?.companyId);
  const a = idOf(body?.firstHistoryPersonId), b = idOf(body?.secondHistoryPersonId);
  if (!body?.confirmRelationship || !companyId || !a || !b || a === b ||
      !historyNameKey(body?.firstName) || !historyNameKey(body?.secondName)) {
    return fail("Pilih dua profil History berbeda dan konfirmasi identitas.", 400);
  }
  const db = supabaseAdmin();
  try {
    const profiles = await verifiedPeople(db, companyId, [a, b]);
    if (profiles.length !== 2) return fail("Kedua profil History harus aktif pada perusahaan yang sama.", 409);
    const first = profiles.find((p: any) => Number(p.id) === a);
    const second = profiles.find((p: any) => Number(p.id) === b);
    if (historyNameKey(first?.participant_name) !== historyNameKey(body.firstName) ||
        historyNameKey(second?.participant_name) !== historyNameKey(body.secondName)) {
      return fail("Nama berubah. Periksa profil dan cari ulang.", 409);
    }
    // Same normalized name with shared family ID is ambiguous across sources.
    // We refuse it rather than accidentally declaring one person their own sibling.
    if (historyNameKey(first.participant_name) === historyNameKey(second.participant_name)) {
      return fail("Nama kedua profil sama; perlu verifikasi identitas manual terpisah.", 409);
    }
    const direct = await db.from("vaccination_person_relationships").select("id")
      .eq("company_id", companyId).eq("active", true)
      .or(`and(parent_person_id.eq.${a},dependent_person_id.eq.${b}),and(parent_person_id.eq.${b},dependent_person_id.eq.${a})`).limit(1);
    if (direct.error) throw direct.error;
    if ((direct.data || []).length) return fail("Masih ada relasi Parent–Child antara dua peserta. Koreksi relasi lama dulu.", 409);
    const lo = Math.min(a, b), hi = Math.max(a, b);
    const prior = await db.from(TABLE).select("id,active")
      .eq("company_id", companyId).eq("person_a_id", lo).eq("person_b_id", hi).maybeSingle();
    if (prior.error) {
      if (unavailable(prior.error)) return fail("Migrasi Sibling V6342 belum disetujui atau belum terpasang.", 423);
      throw prior.error;
    }
    if (prior.data?.active) return ok({ alreadyLinked: true, message: "Hubungan Sibling sudah tersimpan." });
    if (prior.data) return fail("Hubungan ini pernah dinonaktifkan. Audit sebelum mengaktifkannya kembali.", 409);
    const result = await db.from(TABLE).insert({ company_id: companyId, person_a_id: lo, person_b_id: hi, active: true })
      .select("id").single();
    if (result.error) {
      if (unavailable(result.error)) return fail("Migrasi Sibling V6342 belum tersedia.", 423);
      if (result.error.code === "23505") return fail("Hubungan ini baru saja dibuat oleh operator lain. Refresh halaman.", 409);
      throw result.error;
    }
    return ok({ relationId: result.data.id, message: "Hubungan saudara tersimpan tanpa mengubah Parent, vaksinasi atau stok." });
  } catch (error: any) { return fail(String(error?.message || "Gagal menyimpan hubungan Sibling."), 500); }
}
