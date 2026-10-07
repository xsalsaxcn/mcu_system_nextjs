"use client";

// V153.57_SESSION_QUEUE_FORM_CONFIG

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  onsiteQueueFormRecoveryField,
  sanitizeOnsiteQueueFormConfig,
  type OnsiteQueueFormField,
} from "@/lib/vaccination/onsiteQueueForm";

function inputType(field: OnsiteQueueFormField) {
  if (field.kind === "email") return "email";
  if (field.kind === "whatsapp") return "tel";
  if (field.kind === "custom_number") return "number";
  if (field.kind === "custom_date") return "date";
  return "text";
}

export default function VaccinationOnsiteQueueJoinPage({
  params,
}: {
  params: { token: string };
}) {
  const [event, setEvent] = useState<any>(null);
  const [joinToken, setJoinToken] = useState("");
  const [fields, setFields] = useState<OnsiteQueueFormField[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [showRecovery, setShowRecovery] = useState(false);
  const [recoveryValue, setRecoveryValue] = useState("");

  const whatsappEnabled = useMemo(
    () => fields.some((field) => field.kind === "whatsapp"),
    [fields],
  );

  const recoveryField = useMemo(
    () => onsiteQueueFormRecoveryField(fields),
    [fields],
  );

  function ticketStorageKey() {
    // One-time namespace bump after the shared-ticket incident.
    // Existing DB tickets and queue numbers are NOT changed. On rescan, a
    // participant submits the configured Recovery Key; the compatibility
    // guard returns the same valid queue number when it already belongs to them.
    return `vaccination_onsite_ticket_v2_${params.token}`;
  }

  function saveTicketToken(ticketToken: string) {
    try {
      window.localStorage.setItem(ticketStorageKey(), ticketToken);
    } catch {}
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const storedTicket = (() => {
        try {
          return window.localStorage.getItem(ticketStorageKey()) || "";
        } catch {
          return "";
        }
      })();

      if (storedTicket) {
        try {
          const ticketJson = await fetch(
            `/api/vaccination/onsite-queue/public?ticket_token=${encodeURIComponent(
              storedTicket
            )}&t=${Date.now()}`,
            { cache: "no-store" }
          ).then((r) => r.json());

          if (
            ticketJson?.ok &&
            String(ticketJson?.event?.public_token || "") === String(params.token) &&
            String(ticketJson?.entry?.queue_status || "").toUpperCase() !== "DONE"
          ) {
            window.location.replace(
              `/vaccination/public/onsite-ticket/${encodeURIComponent(storedTicket)}`
            );
            return;
          }

          if (!ticketJson?.ok || String(ticketJson?.entry?.queue_status || "").toUpperCase() === "DONE") {
            try {
              window.localStorage.removeItem(ticketStorageKey());
            } catch {}
          }
        } catch {
          // Local ticket recovery is best-effort; continue with the scanned QR.
        }
      }

      const query = new URLSearchParams(window.location.search);
      const slot = query.get("slot") || "";
      const sig = query.get("sig") || "";

      try {
        const json = await fetch(
          `/api/vaccination/onsite-queue/public?event_token=${encodeURIComponent(
            params.token
          )}&slot=${encodeURIComponent(slot)}&sig=${encodeURIComponent(sig)}&t=${Date.now()}`,
          { cache: "no-store" }
        ).then((r) => r.json());

        if (cancelled) return;
        if (!json.ok) {
          setError(json.message || "QR tidak valid.");
          return;
        }

        const nextFields = sanitizeOnsiteQueueFormConfig(
          json?.event?.queue_form_config,
        );
        setEvent(json.event);
        setFields(nextFields);
        setValues(
          Object.fromEntries(nextFields.map((field) => [field.id, ""])),
        );
        setJoinToken(json.join_token || "");
      } catch {
        if (!cancelled) setError("Gagal memvalidasi QR onsite.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [params.token]);

  function setFieldValue(field: OnsiteQueueFormField, value: string) {
    let nextValue = value;
    if (field.kind === "whatsapp") {
      nextValue = value.replace(/\D/g, "").slice(0, 15);
    } else if (field.kind === "employee_id" && field.exactLength) {
      nextValue = value
        .replace(/[^A-Za-z0-9]/g, "")
        .slice(0, field.exactLength);
    }
    setValues((prev) => ({ ...prev, [field.id]: nextValue }));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      const json = await fetch("/api/vaccination/onsite-queue/public", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventToken: params.token,
          joinToken,
          formData: values,
        }),
      }).then((r) => r.json());

      if (!json.ok) {
        setError(json.message || "Gagal membuat antrean.");
        return;
      }

      const ticketToken = json?.entry?.public_token;
      if (!ticketToken) {
        setError("Tiket antrean tidak tersedia.");
        return;
      }

      saveTicketToken(ticketToken);
      window.location.href = `/vaccination/public/onsite-ticket/${encodeURIComponent(
        ticketToken
      )}`;
    } catch {
      setError("Gagal menghubungi server antrean.");
    } finally {
      setSubmitting(false);
    }
  }


  async function recoverQueue() {
    if (!recoveryField || !recoveryValue.trim()) {
      setError(
        recoveryField
          ? `${recoveryField.label} wajib diisi untuk cek antrean.`
          : "Session ini belum memiliki Recovery Key."
      );
      return;
    }

    setRecovering(true);
    setError("");

    try {
      const json = await fetch("/api/vaccination/onsite-queue/public", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "recover",
          eventToken: params.token,
          joinToken,
          recoveryValue,
        }),
      }).then((r) => r.json());

      if (!json.ok) {
        setError(json.message || "Antrean tidak ditemukan.");
        return;
      }

      const ticketToken = json?.entry?.public_token;
      if (!ticketToken) {
        setError("Tiket antrean tidak tersedia.");
        return;
      }

      saveTicketToken(ticketToken);
      window.location.href = `/vaccination/public/onsite-ticket/${encodeURIComponent(
        ticketToken
      )}`;
    } catch {
      setError("Gagal memulihkan antrean.");
    } finally {
      setRecovering(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-white">
      <div className="mx-auto max-w-lg rounded-3xl border border-white/15 bg-slate-900 p-6 shadow-2xl">
        <div className="text-center">
          <div className="text-xs font-black uppercase tracking-[0.3em] text-violet-300">
            Onsite Queue
          </div>
          <h1 className="mt-3 text-3xl font-black">
            {event?.session_name || "Antrian Vaksinasi"}
          </h1>
          <p className="mt-2 text-sm font-semibold text-slate-300">
            {[event?.company_name, event?.location].filter(Boolean).join(" · ")}
          </p>
        </div>

        {loading ? (
          <div className="mt-6 rounded-2xl bg-white/10 p-5 text-center font-bold">
            Memvalidasi QR onsite...
          </div>
        ) : null}

        {error ? (
          <div className="mt-6 rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-sm font-bold text-red-200">
            {error}
          </div>
        ) : null}

        {!loading && joinToken && recoveryField ? (
          <div className="mt-6 rounded-3xl border border-violet-400/30 bg-violet-500/10 p-4">
            <button
              type="button"
              onClick={() => setShowRecovery((value) => !value)}
              className="w-full rounded-xl border border-violet-300/30 bg-white/10 px-4 py-3 text-sm font-black text-white"
            >
              Sudah punya antrean? Cek antrean saya
            </button>

            {showRecovery ? (
              <div className="mt-3 rounded-2xl bg-white p-4 text-slate-950">
                <label className="text-xs font-black uppercase tracking-wide text-slate-500">
                  {recoveryField.label}
                </label>
                <input
                  type={inputType(recoveryField)}
                  inputMode={
                    recoveryField.kind === "whatsapp" ||
                    recoveryField.kind === "custom_number"
                      ? "numeric"
                      : undefined
                  }
                  value={recoveryValue}
                  minLength={
                    recoveryField.kind === "employee_id"
                      ? recoveryField.exactLength
                      : undefined
                  }
                  maxLength={
                    recoveryField.kind === "employee_id"
                      ? recoveryField.exactLength
                      : undefined
                  }
                  onChange={(e) =>
                    setRecoveryValue(
                      recoveryField.kind === "whatsapp"
                        ? e.target.value.replace(/\D/g, "").slice(0, 15)
                        : recoveryField.kind === "employee_id" && recoveryField.exactLength
                          ? e.target.value
                              .replace(/[^A-Za-z0-9]/g, "")
                              .slice(0, recoveryField.exactLength)
                          : e.target.value
                    )
                  }
                  className="mt-1 w-full rounded-xl border px-3 py-3 font-semibold"
                  placeholder={`Masukkan ${recoveryField.label}`}
                />
                <p className="mt-2 text-xs text-slate-500">
                  Gunakan data yang sama seperti saat pertama mengambil nomor antrean.
                </p>
                <button
                  type="button"
                  disabled={recovering}
                  onClick={recoverQueue}
                  className="mt-3 w-full rounded-xl bg-violet-600 px-4 py-3 font-black text-white disabled:opacity-50"
                >
                  {recovering ? "Mencari antrean..." : "Pulihkan Antrean"}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        {!loading && joinToken ? (
          <form
            onSubmit={submit}
            className="mt-6 space-y-4 rounded-3xl bg-white p-5 text-slate-950"
          >
            {whatsappEnabled ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <div className="text-sm font-black text-emerald-800">
                  Pengingat antrean via WhatsApp aktif
                </div>
                <p className="mt-1 text-xs font-semibold leading-relaxed text-emerald-700">
                  Isi field WhatsApp di bawah. Sistem akan mengirim pengingat otomatis
                  saat tinggal 1 antrean lagi sebelum giliran Anda.
                </p>
              </div>
            ) : null}

            {fields.map((field) => (
              <div key={field.id}>
                <label className="text-xs font-black uppercase tracking-wide text-slate-500">
                  {field.label}
                  {field.required ? " *" : ""}
                </label>
                <input
                  required={field.required}
                  type={inputType(field)}
                  inputMode={field.kind === "whatsapp" || field.kind === "custom_number" ? "numeric" : undefined}
                  minLength={field.kind === "employee_id" ? field.exactLength : undefined}
                  maxLength={field.kind === "employee_id" ? field.exactLength : undefined}
                  value={values[field.id] || ""}
                  onChange={(e) => setFieldValue(field, e.target.value)}
                  className="mt-1 w-full rounded-xl border px-3 py-3 font-semibold"
                  placeholder={field.placeholder || undefined}
                />
                {field.kind === "employee_id" ? (
                  <div className="mt-1 text-xs text-slate-500">
                    ID ini dipakai untuk mencegah peserta mengambil nomor antrean ganda pada event yang sama.
                    {field.exactLength ? ` Wajib tepat ${field.exactLength} karakter huruf/angka.` : ""}
                  </div>
                ) : null}
                {field.recoveryKey ? (
                  <div className="mt-1 text-xs font-semibold text-violet-600">
                    Simpan data ini. Field ini adalah identitas utama antrean dan dipakai untuk memulihkan tiket jika browser tertutup.
                  </div>
                ) : null}
              </div>
            ))}

            {!fields.length ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-600">
                Session ini tidak meminta data tambahan. Klik tombol di bawah untuk mengambil nomor antrean.
              </div>
            ) : null}

            <button
              disabled={submitting}
              className="w-full rounded-xl bg-violet-600 px-4 py-3 font-black text-white disabled:opacity-50"
            >
              {submitting ? "Membuat antrean..." : "Ambil Nomor Antrean"}
            </button>
          </form>
        ) : null}

        <p className="mt-5 text-center text-xs text-slate-400">
          Jika browser tertutup, scan QR lagi. Device yang sama akan membuka tiket otomatis; device lain dapat memakai Cek Antrean Saya.
        </p>
      </div>
    </main>
  );
}
