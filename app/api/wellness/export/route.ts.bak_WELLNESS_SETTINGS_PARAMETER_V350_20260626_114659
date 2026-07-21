import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { fail } from "@/lib/server/response";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { getAllowedWellnessParticipants } from "@/app/api/wellness/_utils";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const user = getSessionUser(req);
  if (!user) return fail("Unauthorized", 401);

  try {
    const supabase = getSupabaseAdmin();
    const participants = await getAllowedWellnessParticipants(supabase, user);
    const ids = participants.map((p: any) => Number(p.id)).filter(Boolean);

    const [weights, foods, activities] = ids.length ? await Promise.all([
      supabase.from("wellness_weight_logs").select("*").in("participant_id", ids).order("log_date", { ascending: false }),
      supabase.from("wellness_food_logs").select("*").in("participant_id", ids).order("log_date", { ascending: false }),
      supabase.from("wellness_activity_logs").select("*").in("participant_id", ids).order("log_date", { ascending: false }),
    ]) : [{ data: [] }, { data: [] }, { data: [] }] as any;

    const nameMap = new Map(participants.map((p: any) => [Number(p.id), p.name]));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(participants.map((p: any) => ({
      Nama: p.name,
      Kode: p.code || "",
      Gender: p.gender || "",
      Kelompok: p.group_id || "",
      Tinggi_cm: p.height_cm || "",
      BB_Awal_kg: p.initial_weight_kg || "",
      Target_BB_kg: p.target_weight_kg || "",
      Tanggal_Mulai: p.program_start_date || "",
    }))), "Peserta");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet((weights.data || []).map((row: any) => ({ Nama: nameMap.get(Number(row.participant_id)), Tanggal: row.log_date, BB_kg: row.weight_kg, Lingkar_Perut_cm: row.waist_cm, BMI: row.bmi, Interpretasi: row.bmi_status, Catatan: row.notes || "" }))), "BB_BMI");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet((foods.data || []).map((row: any) => ({ Nama: nameMap.get(Number(row.participant_id)), Tanggal: row.log_date, Waktu_Makan: row.meal_time, Input_Makanan: row.meal_text, Makanan_Terdeteksi: row.detected_foods, Total_Kalori: row.total_calories, Foto: row.photo_url || "" }))), "Makanan");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet((activities.data || []).map((row: any) => ({ Nama: nameMap.get(Number(row.participant_id)), Tanggal: row.log_date, Aktivitas: row.activity_type, Durasi_menit: row.duration_minutes, Jarak_km: row.distance_km, Kalori: row.calories, Sumber: row.source, Catatan: row.notes || "" }))), "Aktivitas");

    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="wellness-export-${new Date().toISOString().slice(0, 10)}.xlsx"`,
      },
    });
  } catch (error: any) {
    return fail(error?.message || "Gagal export Wellness.", 500);
  }
}
