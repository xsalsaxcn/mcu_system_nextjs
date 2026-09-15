"use client";

// VACCINATION_MANUAL_PRODUCT_QUEUE_PRINT_V153_1
import { useEffect, useMemo, useState } from "react";

function clean(value: any) {
  return String(value ?? "").trim();
}

function money(value: any) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  return new Intl.NumberFormat("id-ID").format(number);
}

function optionKey(item: any) {
  return String(
    item?.id ||
      `${item?.vaccine_id || 0}:${item?.lot_id || 0}:${item?.dose_number || 1}`,
  );
}

function productLabel(item: any) {
  const vaccine = item?.vaccine || {};
  const name = clean(vaccine?.name) || clean(item?.vaccine_name) || "Vaksin";
  const brand = clean(vaccine?.brand);
  return brand && !name.toLowerCase().includes(brand.toLowerCase())
    ? `${name} · ${brand}`
    : name;
}

export default function VaccinationManualWalkInController({
  form,
  setForm,
}: {
  form: any;
  setForm: any;
}) {
  const sessionId = Number(form?.sessionId || form?.session_id || 0);
  const participantIdentity = `${Number(
    form?.participantId || form?.participant_id || 0,
  )}:${Number(form?.historyPersonId || 0)}`;

  const [options, setOptions] = useState<any[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setSelectedKeys([]);
    setMessage("");
    setError("");

    if (!sessionId) {
      setOptions([]);
      return;
    }

    async function loadOptions() {
      setLoadingOptions(true);
      try {
        const response = await fetch(
          `/api/vaccination/register-product-options?session_id=${encodeURIComponent(
            String(sessionId),
          )}`,
          { cache: "no-store" },
        );
        const json = await response.json().catch(() => ({}));
        if (!response.ok || json?.ok === false) {
          throw new Error(
            json?.message || json?.error || `HTTP ${response.status}`,
          );
        }
        if (!active) return;
        setOptions(Array.isArray(json?.options) ? json.options : []);
      } catch (e: any) {
        if (active) {
          setOptions([]);
          setError(
            String(e?.message || e || "Gagal memuat pilihan produk."),
          );
        }
      } finally {
        if (active) setLoadingOptions(false);
      }
    }

    void loadOptions();
    return () => {
      active = false;
    };
  }, [sessionId]);

  useEffect(() => {
    setSelectedKeys([]);
    setMessage("");
    setError("");
  }, [participantIdentity]);

  const selected = useMemo(() => {
    const keys = new Set(selectedKeys);
    return options.filter((item: any) => keys.has(optionKey(item)));
  }, [options, selectedKeys]);

  function toggle(item: any) {
    const key = optionKey(item);
    setSelectedKeys((previous) =>
      previous.includes(key)
        ? previous.filter((value) => value !== key)
        : [...previous, key],
    );
  }

  function popupPlaceholder() {
    const ticketWindow = window.open(
      "about:blank",
      "_blank",
      "width=520,height=720",
    );
    if (ticketWindow) {
      ticketWindow.document.open();
      ticketWindow.document.write(
        "<!doctype html><html><head><title>Menyiapkan Tiket Antrian</title></head><body style='font-family:Arial,sans-serif;padding:20px'><b>Menyiapkan tiket antrian...</b><br><span style='font-size:12px'>Registrasi sedang diproses.</span></body></html>",
      );
      ticketWindow.document.close();
      ticketWindow.focus();
    }
    return ticketWindow;
  }

  async function submitManualRegistration() {
    if (submitting) return;

    const participantName = clean(
      form?.participantName || form?.participant_name || form?.name,
    );

    if (!sessionId) {
      setError("Pilih session terlebih dahulu.");
      return;
    }
    if (!participantName) {
      setError("Nama peserta wajib diisi.");
      return;
    }
    if (!selected.length) {
      setError("Pilih minimal 1 produk / vaksin untuk peserta ini.");
      return;
    }

    setSubmitting(true);
    setMessage("");
    setError("");

    // Open synchronously from click so the browser does not block the print popup.
    const ticketWindow = popupPlaceholder();

    try {
      const items = selected.map((item: any) => ({
        vaccineId: Number(item?.vaccine_id || item?.vaccine?.id || 0),
        lotId: Number(item?.lot_id || item?.lot?.id || 0) || null,
        doseNumber: Math.max(1, Number(item?.dose_number || 1)),
        priceCategory: clean(item?.vaccine?.price_category) || null,
        paymentMethod:
          clean(form?.paymentMethod || form?.payment_method) || null,
        paymentNote: clean(form?.paymentNote || form?.payment_note) || null,
      }));

      const first = items[0];

      const body = {
        sessionId,
        sourceId: Number(form?.sourceId || form?.source_id || 0) || null,
        participantId:
          Number(form?.participantId || form?.participant_id || 0) || null,
        participantName,
        employeeId: clean(form?.employeeId || form?.employee_id),
        nik: clean(form?.nik),
        mcuId: clean(form?.mcuId || form?.mcu_id),
        email: clean(form?.email),
        phone: clean(form?.phone),
        companyName: clean(form?.companyName || form?.company_name),
        department: clean(form?.department),
        paymentPrice: form?.paymentPrice ?? form?.payment_price ?? "",
        paymentMethod: clean(form?.paymentMethod || form?.payment_method),
        paymentNote: clean(form?.paymentNote || form?.payment_note),
        vaccineId: first?.vaccineId || null,
        lotId: first?.lotId || null,
        items,
      };

      const response = await fetch("/api/vaccination/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const json = await response.json().catch(() => ({}));
      if (!response.ok || json?.ok === false) {
        throw new Error(
          json?.message || json?.error || `HTTP ${response.status}`,
        );
      }

      const registrationId = Number(json?.registration?.id || 0);
      if (!registrationId) {
        throw new Error(
          "Registrasi berhasil tetapi registration ID tidak ditemukan.",
        );
      }

      const ticketUrl =
        `/vaccination/queue-ticket/${registrationId}` +
        `?session_id=${encodeURIComponent(String(sessionId))}&autoprint=1`;

      if (ticketWindow && !ticketWindow.closed) {
        ticketWindow.location.replace(ticketUrl);
        ticketWindow.focus();
      } else {
        window.open(ticketUrl, "_blank");
      }

      setMessage(
        `Registrasi berhasil · ${
          clean(json?.registration?.queue_number) || "nomor antrian tersedia"
        } · ${selected.length} produk.`,
      );
      setSelectedKeys([]);

      // Reload only this Register page so the new queue row appears.
      window.setTimeout(() => {
        window.location.reload();
      }, 900);
    } catch (e: any) {
      const text = String(e?.message || e || "Registrasi ulang gagal.");
      setError(text);

      if (ticketWindow && !ticketWindow.closed) {
        const safeText = text.replace(/[<>&"]/g, "");
        ticketWindow.document.open();
        ticketWindow.document.write(
          `<!doctype html><html><head><title>Registrasi Gagal</title></head><body style="font-family:Arial,sans-serif;padding:20px;color:#b91c1c"><b>Registrasi gagal.</b><br><span style="font-size:12px">${safeText}</span></body></html>`,
        );
        ticketWindow.document.close();
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="col-span-full rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-sm font-black text-slate-900">
            Pilih Produk / Vaksin Peserta
          </div>
          <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
            Produk default session di atas tidak otomatis dipilih untuk
            registrasi manual. Centang hanya produk yang akan diberikan kepada
            peserta ini.
          </p>
        </div>
        <div className="rounded-full border border-emerald-200 bg-white px-3 py-1 text-[11px] font-black text-emerald-700">
          {selected.length} dipilih
        </div>
      </div>

      {!sessionId ? (
        <div className="mt-3 rounded-xl border border-dashed border-slate-300 bg-white px-3 py-3 text-xs font-bold text-slate-500">
          Pilih session terlebih dahulu.
        </div>
      ) : loadingOptions ? (
        <div className="mt-3 rounded-xl border bg-white px-3 py-3 text-xs font-bold text-slate-500">
          Memuat produk session...
        </div>
      ) : options.length ? (
        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {options.map((item: any) => {
            const key = optionKey(item);
            const checked = selectedKeys.includes(key);
            const lot = clean(item?.lot?.lot_number);
            const expiry = clean(item?.lot?.expiry_date);
            const price = item?.vaccine?.price;

            return (
              <label
                key={key}
                className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${
                  checked
                    ? "border-emerald-400 bg-white shadow-sm"
                    : "border-slate-200 bg-white/80 hover:border-emerald-200"
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(item)}
                  className="mt-1 h-4 w-4 accent-emerald-600"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-black text-slate-900">
                    {productLabel(item)}
                  </span>
                  <span className="mt-1 block text-[11px] font-semibold text-slate-500">
                    Lot {lot || "-"}
                    {expiry ? ` · exp ${expiry}` : ""}
                    {Number.isFinite(Number(price))
                      ? ` · Rp ${money(price)}`
                      : ""}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      ) : (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-xs font-bold text-amber-800">
          Belum ada produk aktif untuk session ini.
        </div>
      )}

      {error ? (
        <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">
          {error}
        </div>
      ) : null}

      {message ? (
        <div className="mt-3 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs font-bold text-emerald-800">
          {message}
        </div>
      ) : null}

      <button
        type="button"
        onClick={submitManualRegistration}
        disabled={submitting || !sessionId || !selected.length}
        className="mt-4 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-black text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting
          ? "Memproses Registrasi + Tiket..."
          : "Registrasi Ulang + Rilis & Print Nomor Antrian"}
      </button>
    </div>
  );
}
