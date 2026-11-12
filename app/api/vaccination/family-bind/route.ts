import { NextRequest } from "next/server";
import { canVaccinationAccess } from "@/lib/vaccination/access";
import {
  historyCompanyKey,
  historyEmailKey,
  historyIdentityKey,
  historyNameKey,
  historyText,
} from "@/lib/vaccination/history";
import { fail, ok, requireUser, supabaseAdmin } from "../_utils";

// V582 - Add-only family binding for two existing search identities.
// Does not write registrations, queue, validation, stock, movement or history services.
export const dynamic = "force-dynamic";

type Choice = { historyPersonId?: unknown; participantId?: unknown; registrationId?: unknown; name?: unknown };
type Role = "PARENT" | "DEPENDENT";

function positiveId(value: unknown) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : 0;
}

function first(...values: unknown[]) {
  for (const value of values) {
    const text = historyText(value);
    if (text) return text;
  }
  return "";
}

function sameIdentity(a: any, b: any) {
  if (!historyNameKey(a?.name) || historyNameKey(a?.name) !== historyNameKey(b?.name)) return false;
  const strongA = [historyIdentityKey(a?.employeeId), historyIdentityKey(a?.nik), historyEmailKey(a?.email)];
  const strongB = [historyIdentityKey(b?.employeeId), historyIdentityKey(b?.nik), historyEmailKey(b?.email)];
  // Shared family ID is not enough when distinct personal identity fields conflict.
  if (strongA[1] && strongB[1] && strongA[1] !== strongB[1]) return false;
  return strongA.some((key, i) => Boolean(key && key === strongB[i]));
}

function historyIdentity(row: any) {
  return {
    name: row.participant_name,
    employeeId: row.employee_id,
    nik: row.nik,
    email: row.email,
  };
}

function operationalIdentity(row: any) {
  return {
    name: first(row.name, row.participant_name),
    employeeId: first(row.employee_id, row.employee_nik, row.external_id, row.mcu_id, row.barcode_value),
    nik: first(row.nik, row.ktp, row.nik_ktp),
    email: first(row.email, row.email_company, row.company_email),
    phone: first(row.phone, row.no_hp, row.mobile, row.phone_number),
    birthDate: row.birth_date || null,
  };
}

function throwIfError(result: any) {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

async function resolveSelection(supabase: any, company: any, choice: Choice, role: Role) {
  const historyId = positiveId(choice?.historyPersonId);
  const participantId = positiveId(choice?.participantId);
  const registrationId = positiveId(choice?.registrationId);
  const assertedName = historyNameKey(choice?.name);
  if ((!historyId && !participantId && !registrationId) || !assertedName) {
    throw new Error("Pilih profil existing dari hasil pencarian; nama dan ID internal wajib ada.");
  }

  let operational: any = null;
  if (participantId) {
    operational = throwIfError(await supabase
      .from("participants")
      .select("*")
      .eq("id", participantId)
      .maybeSingle());
    if (!operational) throw new Error("Profil Database tidak ditemukan.");
    const explicitRole = historyText(operational.participant_type || operational.employee_type).toUpperCase();
    if (role === "PARENT" && ["DEPENDENT", "CHILD", "FAMILY"].includes(explicitRole)) {
      throw new Error("Profil Database yang dipilih sudah berstatus Child/Family, bukan Parent.");
    }

    const source = throwIfError(await supabase
      .from("participant_sources")
      .select("id,name,institution_name,program_type")
      .eq("id", operational.source_id)
      .maybeSingle());
    if (!source || historyCompanyKey(first(source.institution_name, source.name)) !== company.company_key) {
      throw new Error("Profil Database bukan dari perusahaan yang dipilih.");
    }
  }

  // New Bazar participant may not yet have a participants/vaccination_persons row.
  // Resolve only an EXACT selected registration and confirm its Session company.
  let registrationIdentityRow: any = null;
  if (registrationId) {
    const registration = throwIfError(await supabase
      .from("vaccination_registrations")
      .select("*,session:vaccination_sessions(id,company_name)")
      .eq("id", registrationId).maybeSingle());
    if (!registration) throw new Error("Registrasi calon anggota keluarga tidak ditemukan.");
    const session = Array.isArray(registration.session) ? registration.session[0] : registration.session;
    if (historyCompanyKey(session?.company_name) !== company.company_key) {
      throw new Error("Registrasi kandidat bukan dari perusahaan yang dipilih.");
    }
    const regName = historyNameKey(registration.participant_name);
    if (!regName || regName !== assertedName) {
      throw new Error("Nama pada registrasi telah berubah. Cari ulang calon anggota keluarga.");
    }
    const regRole = historyText(registration.family_role).toUpperCase();
    if (role === "PARENT" && ["DEPENDENT", "CHILD", "FAMILY"].includes(regRole)) {
      throw new Error("Registrasi ini berstatus Child, bukan Parent.");
    }
    registrationIdentityRow = {
      name: registration.participant_name,
      employeeId: registration.employee_id,
      nik: registration.nik,
      email: registration.email,
      phone: registration.phone,
      birthDate: registration.birth_date || null,
    };
  }

  let person: any = null;
  if (historyId) {
    person = throwIfError(await supabase
      .from("vaccination_persons")
      .select("*")
      .eq("id", historyId)
      .eq("company_id", company.id)
      .eq("active", true)
      .maybeSingle());
    if (!person) throw new Error("Profil History tidak ditemukan pada perusahaan yang dipilih.");
  }

  const operationalRow = operational ? operationalIdentity(operational) : registrationIdentityRow;
  if (person && operationalRow && !sameIdentity(historyIdentity(person), operationalRow)) {
    throw new Error("ID Database dan ID History tidak terbukti milik orang yang sama. Periksa profilnya.");
  }

  const authoritative = person ? historyIdentity(person) : operationalRow;
  if (!authoritative || historyNameKey(authoritative.name) !== assertedName) {
    throw new Error("Identitas berubah sejak hasil pencarian. Cari ulang peserta.");
  }

  if (!person && operationalRow) {
    const matches = throwIfError(await supabase
      .from("vaccination_persons")
      .select("*")
      .eq("company_id", company.id)
      .eq("active", true)
      .eq("name_key", historyNameKey(operationalRow.name))
      .limit(100));
    const exact = (matches || []).filter((row: any) => sameIdentity(historyIdentity(row), operationalRow));
    if (exact.length > 1) {
      throw new Error("Ada beberapa profil History dengan identitas sama. Pilih profil History yang tepat.");
    }
    person = exact[0] || null;
    // Different people can share BINUSIAN ID; never reuse by that ID alone.
    if (!person && ![operationalRow.employeeId, operationalRow.nik, operationalRow.email].some(Boolean)) {
      throw new Error("Profil Database belum memiliki identitas pembeda yang cukup untuk binding aman.");
    }
  }

  if (person && role === "PARENT" && person.participant_type !== "EMPLOYEE") {
    throw new Error("Profil yang dipilih adalah Child/Family, bukan Parent.");
  }
  return { person, operationalRow };
}

export async function POST(req: NextRequest) {
  const user = requireUser(req);
  if (!user) return fail("Unauthorized", 401);
  if (!canVaccinationAccess(user, "register")) return fail("Akses registrasi vaksinasi ditolak.", 403);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return fail("Data permintaan tidak valid.");
  }
  const key = historyCompanyKey(body?.companyKey);
  if (!key || key === "unknown-company") return fail("Pilih perusahaan terlebih dahulu.");

  const supabase = supabaseAdmin();
  const createdPersonIds: number[] = [];
  let convertedPersonId = 0;
  let insertedRelationId = 0;
  try {
    const company = throwIfError(await supabase
      .from("vaccination_history_companies")
      .select("id,company_name,company_key,active")
      .eq("company_key", key)
      .eq("active", true)
      .maybeSingle());
    if (!company) throw new Error("Perusahaan History belum tersedia. Tidak ada data yang diubah.");

    const dependent = await resolveSelection(supabase, company, body?.dependent || {}, "DEPENDENT");
    const parent = await resolveSelection(supabase, company, body?.parent || {}, "PARENT");
    if (dependent.person?.id && dependent.person.id === parent.person?.id) {
      throw new Error("Peserta tidak boleh menjadi Parent dirinya sendiri.");
    }
    if (dependent.operationalRow && parent.operationalRow &&
      sameIdentity(dependent.operationalRow, parent.operationalRow)) {
      throw new Error("Profil Child dan Parent mengarah pada identitas yang sama.");
    }

    const now = new Date().toISOString();
    if (!parent.person) {
      const row = parent.operationalRow;
      if (!row) throw new Error("Profil Parent tidak valid.");
      const inserted = throwIfError(await supabase.from("vaccination_persons").insert({
        company_id: company.id,
        participant_type: "EMPLOYEE",
        participant_name: row.name,
        name_key: historyNameKey(row.name),
        employee_id: row.employeeId || null,
        employee_key: historyIdentityKey(row.employeeId) || null,
        nik: row.nik || null,
        nik_key: historyIdentityKey(row.nik) || null,
        email: row.email || null,
        email_key: historyEmailKey(row.email) || null,
        phone: row.phone || null,
        birth_date: row.birthDate || null,
        active: true,
        updated_at: now,
      }).select("*").single());
      parent.person = inserted;
      createdPersonIds.push(Number(inserted.id));
    }

    if (!dependent.person) {
      const row = dependent.operationalRow;
      if (!row) throw new Error("Profil Child tidak valid.");
      const inserted = throwIfError(await supabase.from("vaccination_persons").insert({
        company_id: company.id,
        participant_type: "DEPENDENT",
        participant_name: row.name,
        name_key: historyNameKey(row.name),
        employee_id: row.employeeId || null,
        employee_key: historyIdentityKey(row.employeeId) || null,
        nik: row.nik || null,
        nik_key: historyIdentityKey(row.nik) || null,
        email: row.email || null,
        email_key: historyEmailKey(row.email) || null,
        phone: row.phone || null,
        birth_date: row.birthDate || null,
        active: true,
        updated_at: now,
      }).select("*").single());
      dependent.person = inserted;
      createdPersonIds.push(Number(inserted.id));
    }

    const parentId = Number(parent.person.id);
    const childId = Number(dependent.person.id);
    if (parentId === childId) throw new Error("Peserta tidak boleh menjadi Parent dirinya sendiri.");
    if (dependent.person.participant_type !== "DEPENDENT") {
      const ownChildren = throwIfError(await supabase
        .from("vaccination_person_relationships")
        .select("id")
        .eq("parent_person_id", childId)
        .eq("active", true)
        .limit(1));
      if (ownChildren?.length) {
        throw new Error("Peserta ini sudah menjadi Parent bagi anggota lain. Hubungan lama tidak boleh diubah.");
      }
    }

    const activeRelations = throwIfError(await supabase
      .from("vaccination_person_relationships")
      .select("id,parent_person_id,dependent_person_id,active")
      .eq("dependent_person_id", childId)
      .eq("active", true));
    const conflicting = (activeRelations || []).find((row: any) => Number(row.parent_person_id) !== parentId);
    if (conflicting) throw new Error("Peserta sudah terikat ke Parent lain. Binding dibatalkan tanpa memindahkan keluarga.");
    const sameExisting = (activeRelations || []).find((row: any) => Number(row.parent_person_id) === parentId);

    if (sameExisting && dependent.person.participant_type !== "DEPENDENT") {
      throw new Error("Hubungan Family existing tidak konsisten dengan profil Child. Perlu review manual.");
    }
    if (!sameExisting) {
      if (dependent.person.participant_type !== "DEPENDENT") {
        const update = throwIfError(await supabase
          .from("vaccination_persons")
          .update({ participant_type: "DEPENDENT", updated_at: now })
          .eq("id", childId)
          .eq("company_id", company.id)
          .eq("participant_type", "EMPLOYEE")
          .select("id")
          .single());
        if (!update?.id) throw new Error("Status profil Child berubah. Binding dibatalkan.");
        convertedPersonId = childId;
      }
      const inactiveSame = throwIfError(await supabase.from("vaccination_person_relationships")
        .select("id")
        .eq("company_id", company.id)
        .eq("parent_person_id", parentId)
        .eq("dependent_person_id", childId)
        .eq("active", false)
        .limit(1));
      if (inactiveSame?.length) throw new Error("Hubungan Family ini pernah dinonaktifkan. Perlu review manual, tidak diaktifkan otomatis.");
      const relation = throwIfError(await supabase.from("vaccination_person_relationships").insert({
        company_id: company.id,
        parent_person_id: parentId,
        dependent_person_id: childId,
        relationship_type: "CHILD",
        active: true,
        updated_at: now,
      }).select("id").single());
      insertedRelationId = Number(relation.id);
    }

    return ok({
      parentHistoryPersonId: parentId,
      childHistoryPersonId: childId,
      alreadyLinked: Boolean(sameExisting),
      message: sameExisting ? "Hubungan Family sudah terpasang." : "Hubungan Family berhasil disimpan.",
    });
  } catch (error: any) {
    // Best-effort compensation only for records created by THIS request.
    // Never delete/reassign any pre-existing participant or service history.
    if (insertedRelationId) {
      await supabase.from("vaccination_person_relationships").delete().eq("id", insertedRelationId);
    }
    if (convertedPersonId) {
      await supabase.from("vaccination_persons")
        .update({ participant_type: "EMPLOYEE" })
        .eq("id", convertedPersonId)
        .eq("participant_type", "DEPENDENT");
    }
    for (const id of createdPersonIds.reverse()) {
      await supabase.from("vaccination_persons")
        .delete().eq("id", id);
    }
    return fail(String(error?.message || "Gagal menyimpan hubungan Family."), 409);
  }
}
