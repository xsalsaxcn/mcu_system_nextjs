// WELLNESS_SYSTEM_AUDIT_WORKFLOW_API_V126M37
// Audit checks remain read-only for production Wellness/clinical data.
// POST only stores administrative issue workflow status in a dedicated table.

import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { runWellnessSystemAudit } from "@/lib/wellness/systemAudit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const STATUS_TABLE = "wellness_system_audit_issue_status";
const ADMIN_ROLES = new Set([
  "admin",
  "super_admin",
  "supervisor",
  "doctor",
  "wellness_admin",
]);

const ACTION_STATUS: Record<string, string> = {
  start: "in_progress",
  mark_fixed: "fixed_pending_verification",
  reopen: "reopened",
  reset_open: "open",
};

function clean(value: any) {
  return String(value ?? "").trim();
}

function numberValue(value: any) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function adminUser(request: NextRequest) {
  const user: any = getSessionUser(request);
  if (!user) return { user: null, error: "Session Admin belum aktif.", status: 401 };
  const role = clean(user.role).toLowerCase();
  if (!ADMIN_ROLES.has(role)) {
    return {
      user: null,
      error: "Akun ini tidak memiliki akses System Audit.",
      status: 403,
    };
  }
  return { user, error: "", status: 200 };
}

function actorName(user: any) {
  return clean(
    user?.name ||
      user?.full_name ||
      user?.email ||
      user?.username ||
      user?.id ||
      "Admin Wellness",
  );
}

function tableUnavailable(error: any) {
  const message = clean(error?.message).toLowerCase();
  const code = clean(error?.code).toLowerCase();
  return (
    code === "42p01" ||
    message.includes("does not exist") ||
    message.includes("could not find the table") ||
    message.includes("schema cache")
  );
}

function defaultWorkflow() {
  return {
    status: "open",
    resolution_note: "",
    action_by: "",
    fixed_at: null,
    verified_at: null,
    updated_at: null,
    verification_result: "not_verified",
  };
}

async function loadWorkflowMap(supabase: any, fingerprints: string[]) {
  const map = new Map<string, any>();
  if (!fingerprints.length) {
    return { available: true, message: "", map };
  }

  for (let index = 0; index < fingerprints.length; index += 200) {
    const chunk = fingerprints.slice(index, index + 200);
    const result = await supabase
      .from(STATUS_TABLE)
      .select("*")
      .in("fingerprint", chunk);

    if (result?.error) {
      return {
        available: false,
        message: tableUnavailable(result.error)
          ? "Tabel status audit belum dipasang. Jalankan SQL V126M37 di Supabase."
          : clean(result.error.message || "Status workflow tidak dapat dibaca."),
        map: new Map<string, any>(),
      };
    }

    for (const row of result?.data || []) {
      map.set(clean(row?.fingerprint), row);
    }
  }

  return { available: true, message: "", map };
}

function workflowSummary(issues: any[]) {
  const counts: Record<string, number> = {
    open: 0,
    in_progress: 0,
    fixed_pending_verification: 0,
    solved: 0,
    reopened: 0,
  };
  for (const issue of issues) {
    const status = clean(issue?.workflow?.status || "open");
    counts[status] = (counts[status] || 0) + 1;
  }
  return counts;
}

function issueSnapshot(issue: any) {
  return {
    fingerprint: clean(issue?.fingerprint),
    issue_id: clean(issue?.id),
    issue_code: clean(issue?.code),
    check_key: clean(issue?.check_key),
    module: clean(issue?.module),
    severity: clean(issue?.severity),
    participant_id: numberValue(issue?.participant_id) || null,
    participant_code: clean(issue?.participant_code),
    participant_name: clean(issue?.participant_name),
    issue_date: clean(issue?.date) || null,
    title: clean(issue?.title),
    finding: clean(issue?.finding),
    expected: clean(issue?.expected),
    actual: clean(issue?.actual),
    recommendation: clean(issue?.recommendation),
  };
}

async function upsertWorkflow(params: {
  supabase: any;
  issue: any;
  status: string;
  note: string;
  actor: string;
  verificationResult?: string;
}) {
  const now = new Date().toISOString();
  const snapshot = issueSnapshot(params.issue);
  if (!/^WAF-[A-Z0-9]+$/.test(snapshot.fingerprint)) {
    throw new Error("Fingerprint temuan tidak valid.");
  }

  const row: any = {
    fingerprint: snapshot.fingerprint,
    issue_id: snapshot.issue_id,
    issue_code: snapshot.issue_code,
    check_key: snapshot.check_key,
    module: snapshot.module,
    severity: snapshot.severity,
    participant_id: snapshot.participant_id,
    participant_code: snapshot.participant_code,
    participant_name: snapshot.participant_name,
    issue_date: snapshot.issue_date,
    status: params.status,
    resolution_note: params.note,
    action_by: params.actor,
    verification_result: params.verificationResult || "not_verified",
    issue_snapshot: snapshot,
    updated_at: now,
  };

  if (params.status === "fixed_pending_verification") {
    row.fixed_at = now;
    row.verified_at = null;
  } else if (params.status === "solved") {
    row.verified_at = now;
  } else if (params.status === "reopened" || params.status === "open") {
    row.verified_at = null;
  }

  const result = await params.supabase
    .from(STATUS_TABLE)
    .upsert(row, { onConflict: "fingerprint" })
    .select("*")
    .single();

  if (result?.error) {
    if (tableUnavailable(result.error)) {
      throw new Error("Tabel status audit belum dipasang. Jalankan SQL V126M37 di Supabase.");
    }
    throw new Error(clean(result.error.message || "Status temuan gagal disimpan."));
  }

  return result.data;
}

export async function GET(request: NextRequest) {
  try {
    const auth = adminUser(request);
    if (!auth.user) {
      return NextResponse.json(
        { ok: false, message: auth.error },
        { status: auth.status },
      );
    }

    const days = numberValue(request.nextUrl.searchParams.get("days")) || 14;
    const participantId =
      numberValue(request.nextUrl.searchParams.get("participant_id")) || 0;
    const maxIssues =
      numberValue(request.nextUrl.searchParams.get("max_issues")) || 500;

    const supabase = getSupabaseAdmin();
    const audit: any = await runWellnessSystemAudit({
      supabase,
      days,
      participantId: participantId || undefined,
      maxIssues,
    });

    const workflowState = await loadWorkflowMap(
      supabase,
      (audit?.issues || []).map((issue: any) => clean(issue?.fingerprint)).filter(Boolean),
    );

    audit.issues = (audit?.issues || []).map((issue: any) => ({
      ...issue,
      workflow: workflowState.map.get(clean(issue?.fingerprint)) || defaultWorkflow(),
    }));
    audit.workflow = {
      available: workflowState.available,
      message: workflowState.message,
      summary: workflowSummary(audit.issues),
    };

    return NextResponse.json(
      { ok: true, audit },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
          "X-Wellness-Audit-Data-Mode": "read-only",
          "X-Wellness-Audit-Workflow": "status-enabled",
        },
      },
    );
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        message: error?.message || "System Audit Wellness gagal dijalankan.",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = adminUser(request);
    if (!auth.user) {
      return NextResponse.json(
        { ok: false, message: auth.error },
        { status: auth.status },
      );
    }

    const body = await request.json().catch(() => ({}));
    const action = clean(body?.action).toLowerCase();
    const issue = body?.issue || {};
    const note = clean(body?.resolution_note);
    const days = Math.min(90, Math.max(7, numberValue(body?.days) || 14));
    const supabase = getSupabaseAdmin();
    const actor = actorName(auth.user);

    if (action === "verify") {
      const fingerprint = clean(issue?.fingerprint);
      if (!/^WAF-[A-Z0-9]+$/.test(fingerprint)) {
        return NextResponse.json(
          { ok: false, message: "Fingerprint temuan tidak valid." },
          { status: 400 },
        );
      }

      const audit: any = await runWellnessSystemAudit({
        supabase,
        days,
        participantId: numberValue(issue?.participant_id) || undefined,
        maxIssues: 1000,
      });
      const detectedIssue = (audit?.issues || []).find(
        (item: any) => clean(item?.fingerprint) === fingerprint,
      );
      const stillDetected = Boolean(detectedIssue);
      const workflow = await upsertWorkflow({
        supabase,
        issue: detectedIssue || issue,
        status: stillDetected ? "reopened" : "solved",
        note,
        actor,
        verificationResult: stillDetected ? "still_detected" : "not_detected",
      });

      return NextResponse.json({
        ok: true,
        workflow,
        verification: {
          still_detected: stillDetected,
          status: stillDetected ? "reopened" : "solved",
          message: stillDetected
            ? "Temuan masih terdeteksi dan otomatis dibuka kembali."
            : "Temuan tidak lagi terdeteksi dan terverifikasi solved.",
        },
      });
    }

    const status = ACTION_STATUS[action];
    if (!status) {
      return NextResponse.json(
        { ok: false, message: "Action status audit tidak dikenali." },
        { status: 400 },
      );
    }

    const workflow = await upsertWorkflow({
      supabase,
      issue,
      status,
      note,
      actor,
    });

    return NextResponse.json({
      ok: true,
      workflow,
      message:
        status === "fixed_pending_verification"
          ? "Temuan ditandai fixed dan menunggu verifikasi ulang."
          : status === "in_progress"
            ? "Temuan masuk proses tindak lanjut."
            : "Status temuan diperbarui.",
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        message: error?.message || "Status temuan gagal diperbarui.",
      },
      { status: 500 },
    );
  }
}
