import { fail } from "@/lib/server/response";

// WELLNESS_INLINE_IMAGE_SHEET_V366_UPLOAD_DISABLED
// Evidence files are NOT uploaded to Supabase Storage. Use Google Drive/Jotform/WhatsApp/Strava image links.

export async function POST() {
  return fail("Upload file ke Supabase Storage dinonaktifkan. Tempel link gambar bukti dari Google Drive/Jotform/WhatsApp/Strava agar bisa dipreview dan disalin ke Google Sheet.", 410);
}
