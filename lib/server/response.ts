import { NextResponse } from "next/server";

export function ok(data: any = {}) {
  return NextResponse.json({ ok: true, ...data });
}

export function fail(message: string, status = 400, extra: Record<string, any> = {}) {
  return NextResponse.json({ ok: false, message, ...extra }, { status });
}
