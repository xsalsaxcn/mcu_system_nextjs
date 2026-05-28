import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";

export function clean(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text || ["null", "undefined", "nan", "-", "—"].includes(text.toLowerCase())) return "";
  return text;
}

export function fail(message: string, status = 400, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: false, message, ...extra }, { status });
}

export function ok(payload: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: true, ...payload });
}

export function requireUser(req: NextRequest) {
  return getSessionUser(req);
}

export function supabaseAdmin() {
  return getSupabaseAdmin();
}

export function toInt(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

export function addDays(date: Date, days?: number | null) {
  if (!days || !Number.isFinite(Number(days))) return null;
  const d = new Date(date);
  d.setDate(d.getDate() + Number(days));
  return d.toISOString().slice(0, 10);
}

export function formatQueueNumber(nextNumber: number) {
  return `A-${String(nextNumber).padStart(3, "0")}`;
}
