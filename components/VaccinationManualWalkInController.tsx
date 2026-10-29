"use client";

// VACCINATION_MANUAL_PRODUCT_QUEUE_PRINT_V153_89
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

function saleMode(value: any): "PACKAGE" | "NON_PACKAGE" {
  return String(value || "").trim().toUpperCase() === "PACKAGE" ? "PACKAGE" : "NON_PACKAGE";
}

function offersFor(item: any) {
  const offers = Array.isArray(item?.sales_options) ? item.sales_options : [];
  return offers.filter((offer: any) => offer?.active !== false && Number(offer?.price || 0) > 0);
}

function selectedOffer(item: any, modeInput: any) {
  const mode = saleMode(modeInput);
  const offer = offersFor(item).find((row: any) => saleMode(row?.sale_mode) === mode);
  if (offer) return offer;
  if (mode === "NON_PACKAGE" && Number(item?.vaccine?.price || 0) > 0) {
    return {
      id: null,
      vaccine_id: Number(item?.vaccine_id || item?.vaccine?.id || 0),
      sale_mode: "NON_PACKAGE",
      package_dose_count: 1,
      price: Number(item?.vaccine?.price || 0),
      label: "Non Paket",
    };
  }
  return null;
}

type QueueMode = "HEALTHDAY" | "BAZAR";

type SelectionState = {
  HEALTHDAY: string[];
  BAZAR: string[];
};

type OptionState = {
  HEALTHDAY: any[];
  BAZAR: any[];
};

const EMPTY_SELECTION: SelectionState = { HEALTHDAY: [], BAZAR: [] };
const EMPTY_OPTIONS: OptionState = { HEALTHDAY: [], BAZAR: [] };

export default function VaccinationManualWalkInController({
  form,
  setForm,
  session,
}: {
  form: any;
  setForm: any;
  session?: any;
}) {
  const sessionId = Number(form?.sessionId || form?.session_id || 0);
  const healthdayBazarEnabled =
    String(session?.existing_queue_profile || "LEGACY").toUpperCase() ===
    "HEALTHDAY_BAZAR";
  const serviceMode: QueueMode =
    healthdayBazarEnabled &&
    String(form?.serviceMode || "HEALTHDAY").toUpperCase() === "BAZAR"
      ? "BAZAR"
      : "HEALTHDAY";
  const bazarPaymentMethod = clean(
    form?.paymentMethod || form?.payment_method,
  ).toUpperCase();
  const participantIdentity = `${Number(
    form?.participantId || form?.participant_id || 0,
  )}:${Number(form?.historyPersonId || 0)}`;
  const suggestedVaccineIds = Array.isArray(form?.walkInSuggestedVaccineIds)
    ? form.walkInSuggestedVaccineIds.map(String).filter(Boolean)
    : [];
  const suggestedVaccineKey = suggestedVaccineIds.join(",");

  const [optionSets, setOptionSets] = useState<OptionState>(EMPTY_OPTIONS);
  const [selectedByMode, setSelectedByMode] =
    useState<SelectionState>(EMPTY_SELECTION);
  const [bazarSaleModeByKey, setBazarSaleModeByKey] = useState<Record<string, "PACKAGE" | "NON_PACKAGE">>({});
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setSelectedByMode({ HEALTHDAY: [], BAZAR: [] });
    setBazarSaleModeByKey({});
    setMessage("");
    setError("");

    if (!sessionId) {
      setOptionSets({ HEALTHDAY: [], BAZAR: [] });
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

        const healthdayOptions = Array.isArray(json?.healthdayOptions)
          ? json.healthdayOptions
          : Array.isArray(json?.options)
            ? json.options
            : [];
        const bazarOptions = Array.isArray(json?.bazarOptions)
          ? json.bazarOptions
          : [];

        setOptionSets({
          HEALTHDAY: healthdayOptions,
          BAZAR: healthdayBazarEnabled ? bazarOptions : [],
        });
      } catch (e: any) {
        if (active) {
          setOptionSets({ HEALTHDAY: [], BAZAR: [] });
          setError(String(e?.message || e || "Gagal memuat pilihan produk."));
        }
      } finally {
        if (active) setLoadingOptions(false);
      }
    }

    void loadOptions();
    return () => {
      active = false;
    };
  }, [sessionId, healthdayBazarEnabled]);

  useEffect(() => {
    setSelectedByMode({ HEALTHDAY: [], BAZAR: [] });
    setBazarSaleModeByKey({});
    setMessage("");
    setError("");
  }, [participantIdentity]);

  useEffect(() => {
    if (!suggestedVaccineIds.length || !optionSets.HEALTHDAY.length) return;
    const wanted = new Set(suggestedVaccineIds);
    const chosen: string[] = [];
    const seenVaccines = new Set<string>();
    for (const item of optionSets.HEALTHDAY) {
      const vaccineId = String(item?.vaccine_id || item?.vaccine?.id || "");
      if (!vaccineId || !wanted.has(vaccineId) || seenVaccines.has(vaccineId)) {
        continue;
      }
      chosen.push(optionKey(item));
      seenVaccines.add(vaccineId);
    }
    if (chosen.length) {
      setSelectedByMode((previous) => ({
        ...previous,
        HEALTHDAY: chosen,
      }));
    }
  }, [participantIdentity, suggestedVaccineKey, optionSets.HEALTHDAY]);

  const healthdaySelected = useMemo(() => {
    const keys = new Set(selectedByMode.HEALTHDAY);
    return optionSets.HEALTHDAY.filter((item: any) => keys.has(optionKey(item)));
  }, [optionSets.HEALTHDAY, selectedByMode.HEALTHDAY]);

  const bazarSelected = useMemo(() => {
    const keys = new Set(selectedByMode.BAZAR);
    return optionSets.BAZAR.filter((item: any) => keys.has(optionKey(item)));
  }, [optionSets.BAZAR, selectedByMode.BAZAR]);

  const activeOptions =
    serviceMode === "BAZAR" ? optionSets.BAZAR : optionSets.HEALTHDAY;
  const activeSelectedKeys = selectedByMode[serviceMode];
  const totalSelected = healthdaySelected.length + bazarSelected.length;

  const bazarSubtotal = useMemo(
    () =>
      bazarSelected.reduce((total: number, item: any) => {
        const key = optionKey(item);
        const offer = selectedOffer(item, bazarSaleModeByKey[key] || "NON_PACKAGE");
        const price = Number(offer?.price || 0);
        return total + (Number.isFinite(price) ? price : 0);
      }, 0),
    [bazarSelected, bazarSaleModeByKey],
  );
  const bazarSurcharge =
    bazarPaymentMethod === "CREDIT_CARD"
      ? Math.round(bazarSubtotal * 0.03 * 100) / 100
      : 0;
  const bazarTotal = bazarSubtotal + bazarSurcharge;

  function setMode(mode: QueueMode) {
    setForm((previous: any) => ({
      ...previous,
      serviceMode: mode,
      ...(mode === "HEALTHDAY" && !selectedByMode.BAZAR.length
        ? { paymentMethod: "", paymentPrice: "", paymentNote: "" }
        : {}),
    }));
    setError("");
  }

  function toggle(item: any, mode: QueueMode) {
    const key = optionKey(item);
    setSelectedByMode((previous) => {
      const current = previous[mode];
      const next = current.includes(key)
        ? current.filter((value) => value !== key)
        : [...current, key];
      return { ...previous, [mode]: next } as SelectionState;
    });
    if (mode === "BAZAR") {
      setBazarSaleModeByKey((previous) => ({
        ...previous,
        [key]: previous[key] || "NON_PACKAGE",
      }));
    }
  }

  function popupPlaceholder(track: "A" | "B" | "AB") {
    const ticketWindow = window.open(
      "about:blank",
      "_blank",
      "width=520,height=720",
    );
    if (ticketWindow) {
      ticketWindow.document.open();
      ticketWindow.document.write(
        `<!doctype html><html><head><title>Menyiapkan Tiket Antrian ${track}</title></head><body style='font-family:Arial,sans-serif;padding:20px'><b>Menyiapkan tiket antrian ${track}...</b><br><span style='font-size:12px'>Registrasi sedang diproses.</span></body></html>`,
      );
      ticketWindow.document.close();
    }
    return ticketWindow;
  }

  function showTicketWindowError(ticketWindow: Window | null, message: string) {
    if (!ticketWindow || ticketWindow.closed) return;
    const safeText = message.replace(/[<>&"]/g, "");
    ticketWindow.document.open();
    ticketWindow.document.write(
      `<!doctype html><html><head><title>Tiket Antrian</title></head><body style="font-family:Arial,sans-serif;padding:20px;color:#b91c1c"><b>Tiket tidak dapat dibuka.</b><br><span style="font-size:12px">${safeText}</span></body></html>`,
    );
    ticketWindow.document.close();
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
    if (!totalSelected) {
      setError("Pilih minimal 1 produk / vaksin untuk peserta ini.");
      return;
    }
    if (
      bazarSelected.length &&
      !["QRIS", "DEBIT", "CREDIT_CARD", "TRANSFER"].includes(
        bazarPaymentMethod,
      )
    ) {
      setError(
        "Pilih metode pembayaran Bazar: QRIS, Debit, Credit Card, atau Transfer.",
      );
      return;
    }
    if (
      bazarSelected.some((item: any) => {
        const key = optionKey(item);
        return !selectedOffer(item, bazarSaleModeByKey[key] || "NON_PACKAGE");
      })
    ) {
      setError("Ada layanan Bazar yang belum memiliki harga Paket/Non Paket aktif pada Master Produk.");
      return;
    }

    setSubmitting(true);
    setMessage("");
    setError("");

    // Use ONE print window. For a Combination participant the queue-ticket page
    // renders TWO sheets (A Healthday + B Bazar) in one print job.
    // This avoids browser popup blocking on the second ticket.
    const needATicket = healthdaySelected.length > 0;
    const needBTicket = bazarSelected.length > 0;
    const requestedTicketTrack: "A" | "B" | "AB" =
      needATicket && needBTicket ? "AB" : needATicket ? "A" : "B";
    const ticketWindow = popupPlaceholder(requestedTicketTrack);

    try {
      const healthdayItems = healthdaySelected.map((item: any) => ({
        vaccineId: Number(item?.vaccine_id || item?.vaccine?.id || 0),
        lotId: Number(item?.lot_id || item?.lot?.id || 0) || null,
        doseNumber: Math.max(1, Number(item?.dose_number || 1)),
        priceCategory: clean(item?.vaccine?.price_category) || null,
        price: healthdayBazarEnabled
          ? 0
          : (form?.paymentPrice === "" || form?.paymentPrice == null
              ? undefined
              : Number(form.paymentPrice)),
        serviceMode: "HEALTHDAY",
        paymentMethod: healthdayBazarEnabled
          ? null
          : (clean(form?.paymentMethod || form?.payment_method) || null),
        paymentNote: healthdayBazarEnabled
          ? null
          : (clean(form?.paymentNote || form?.payment_note) || null),
      }));

      const bazarItems = bazarSelected.map((item: any) => {
        const key = optionKey(item);
        const chosenMode = bazarSaleModeByKey[key] || "NON_PACKAGE";
        const offer = selectedOffer(item, chosenMode);
        return {
          vaccineId: Number(item?.vaccine_id || item?.vaccine?.id || 0),
          lotId: Number(item?.lot_id || item?.lot?.id || 0) || null,
          doseNumber: Math.max(1, Number(item?.dose_number || 1)),
          priceCategory: clean(item?.vaccine?.price_category) || null,
          price: Number(offer?.price || 0),
          serviceMode: "BAZAR",
          paymentMethod: bazarPaymentMethod || null,
          paymentNote: clean(form?.paymentNote || form?.payment_note) || null,
          salesOptionId: Number(offer?.id || 0) || null,
          saleMode: saleMode(offer?.sale_mode || chosenMode),
          packageDoseCount: Math.max(1, Number(offer?.package_dose_count || 1)),
          salesPriceSnapshot: Number(offer?.price || 0),
        };
      });

      const items = [...healthdayItems, ...bazarItems];
      const first = items[0];
      const requestedMode: QueueMode =
        healthdayItems.length > 0 ? "HEALTHDAY" : "BAZAR";

      const body = {
        sessionId,
        sourceId: Number(form?.sourceId || form?.source_id || 0) || null,
        participantId:
          Number(form?.participantId || form?.participant_id || 0) || null,
        historyPersonId:
          Number(form?.historyPersonId || form?.history_person_id || 0) || null,
        familyRole:
          String(form?.familyRole || form?.family_role || "PARENT")
            .trim()
            .toUpperCase() === "DEPENDENT"
            ? "DEPENDENT"
            : "PARENT",
        parentHistoryPersonId:
          Number(
            form?.parentHistoryPersonId ||
            form?.parent_history_person_id ||
            0,
          ) || null,
        parentName: clean(form?.parentName || form?.parent_name),
        parentEmployeeId: clean(
          form?.parentEmployeeId || form?.parent_employee_id,
        ),
        parentNik: clean(form?.parentNik || form?.parent_nik),
        parentEmail: clean(form?.parentEmail || form?.parent_email),
        participantName,
        employeeId: clean(form?.employeeId || form?.employee_id),
        nik: clean(form?.nik),
        mcuId: clean(form?.mcuId || form?.mcu_id),
        email: clean(form?.email),
        phone: clean(form?.phone),
        companyName: clean(form?.companyName || form?.company_name),
        department: clean(form?.department),
        moveFromRegistrationId:
          Number(form?.moveFromRegistrationId || 0) || null,
        serviceMode: requestedMode,
        paymentPrice: bazarItems.length
          ? bazarTotal
          : healthdayBazarEnabled
            ? 0
            : (form?.paymentPrice ?? form?.payment_price ?? ""),
        paymentMethod: bazarItems.length
          ? bazarPaymentMethod
          : healthdayBazarEnabled
            ? ""
            : clean(form?.paymentMethod || form?.payment_method),
        paymentNote: bazarItems.length
          ? clean(form?.paymentNote || form?.payment_note)
          : healthdayBazarEnabled
            ? ""
            : clean(form?.paymentNote || form?.payment_note),
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

      const queueNumberA = clean(json?.registration?.queue_number);
      const queueNumberB = clean(json?.registration?.bazar_queue_number);

      const missingTracks = [
        needATicket && !queueNumberA ? "A / Healthday" : "",
        needBTicket && !queueNumberB ? "B / Bazar" : "",
      ].filter(Boolean);

      if (missingTracks.length) {
        showTicketWindowError(
          ticketWindow,
          `Nomor antrean ${missingTracks.join(" + ")} tidak terbentuk. Registrasi tersimpan, tetapi nomor tersebut perlu dicek dari daftar registrasi.`,
        );
      } else {
        const ticketUrl =
          `/vaccination/queue-ticket/${registrationId}` +
          `?track=${requestedTicketTrack}&session_id=${encodeURIComponent(
            String(sessionId),
          )}&autoprint=1`;

        if (ticketWindow && !ticketWindow.closed) {
          ticketWindow.location.replace(ticketUrl);
        } else {
          window.open(ticketUrl, "_blank");
        }
      }

      const queueLabels = [
        healthdayItems.length ? clean(json?.registration?.queue_number) : "",
        bazarItems.length ? clean(json?.registration?.bazar_queue_number) : "",
      ].filter(Boolean);

      setMessage(
        `${json?.movedFrom ? "Pindah lokasi berhasil" : "Registrasi berhasil"} · ${
          queueLabels.join(" + ") || "nomor antrian tersedia"
        } · ${totalSelected} produk.`,
      );
      setSelectedByMode({ HEALTHDAY: [], BAZAR: [] });
      setBazarSaleModeByKey({});

      window.setTimeout(() => {
        window.location.reload();
      }, 900);
    } catch (e: any) {
      const text = String(e?.message || e || "Registrasi ulang gagal.");
      setError(text);

      showTicketWindowError(ticketWindow, text);
    } finally {
      setSubmitting(false);
    }
  }

  const combinationSelected =
    healthdaySelected.length > 0 && bazarSelected.length > 0;

  return (
    <div className="col-span-full rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-sm font-black text-slate-900">
            Pilih Produk / Vaksin & Lot Peserta
          </div>
          <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
            {healthdayBazarEnabled
              ? "Healthday = benefit FREE sesuai session. Bazar = tambahan berbayar dari master produk. Peserta boleh mengambil keduanya."
              : "Pilih produk/lot yang akan diberikan kepada peserta ini."}
          </p>
        </div>
        <div className="rounded-full border border-emerald-200 bg-white px-3 py-1 text-[11px] font-black text-emerald-700">
          {healthdayBazarEnabled
            ? `${totalSelected} dipilih · A ${healthdaySelected.length} · B ${bazarSelected.length}`
            : `${totalSelected} dipilih`}
        </div>
      </div>

      {healthdayBazarEnabled ? (
        <div className="mt-4 rounded-2xl border border-violet-200 bg-violet-50 p-3">
          <div className="text-xs font-black uppercase tracking-wide text-violet-700">
            Jenis Layanan
          </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setMode("HEALTHDAY")}
              className={`rounded-xl border px-4 py-3 text-left text-sm font-black ${
                serviceMode === "HEALTHDAY"
                  ? "border-blue-500 bg-blue-600 text-white"
                  : "border-slate-200 bg-white text-slate-700"
              }`}
            >
              <span className="block">Healthday · FREE</span>
              <span className={`mt-0.5 block text-[11px] font-semibold ${serviceMode === "HEALTHDAY" ? "text-blue-100" : "text-slate-500"}`}>
                Benefit session · {healthdaySelected.length} dipilih
              </span>
            </button>
            <button
              type="button"
              onClick={() => setMode("BAZAR")}
              className={`rounded-xl border px-4 py-3 text-left text-sm font-black ${
                serviceMode === "BAZAR"
                  ? "border-violet-500 bg-violet-600 text-white"
                  : "border-slate-200 bg-white text-slate-700"
              }`}
            >
              <span className="block">Bazar · BERBAYAR</span>
              <span className={`mt-0.5 block text-[11px] font-semibold ${serviceMode === "BAZAR" ? "text-violet-100" : "text-slate-500"}`}>
                Master produk berharga · {bazarSelected.length} dipilih
              </span>
            </button>
          </div>

          {combinationSelected ? (
            <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-800">
              Kombinasi aktif: peserta mendapat antrean A Healthday + antrean B Bazar.
            </div>
          ) : null}
        </div>
      ) : null}

      {serviceMode === "HEALTHDAY" && healthdayBazarEnabled ? (
        <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 p-4">
          <div className="text-xs font-black uppercase tracking-wide text-blue-700">
            Healthday · Benefit Free
          </div>
          <div className="mt-1 text-[11px] font-semibold text-blue-800">
            Hanya vaksin benefit yang aktif pada session ini. Tidak ada harga atau field pembayaran.
          </div>
        </div>
      ) : null}

      {serviceMode === "BAZAR" && healthdayBazarEnabled ? (
        <div className="mt-4 rounded-2xl border border-violet-200 bg-white p-4">
          <div className="text-xs font-black uppercase tracking-wide text-violet-700">
            Bazar · Pembayaran
          </div>
          <div className="mt-1 text-[11px] font-semibold text-slate-500">
            Pilihan Bazar berasal dari master produk aktif yang memiliki harga jual dan lot aktif.
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
            <label className="text-xs font-bold text-slate-700">
              Metode Pembayaran
              <select
                value={bazarPaymentMethod}
                onChange={(e) =>
                  setForm((previous: any) => ({
                    ...previous,
                    paymentMethod: e.target.value,
                  }))
                }
                className="mt-1 block w-full rounded-xl border bg-white px-3 py-2.5 text-sm font-bold"
              >
                <option value="">Pilih metode pembayaran</option>
                <option value="QRIS">QRIS</option>
                <option value="DEBIT">Debit</option>
                <option value="CREDIT_CARD">Credit Card +3%</option>
                <option value="TRANSFER">Transfer</option>
              </select>
            </label>
            <div className="rounded-xl border bg-slate-50 px-4 py-2 text-right text-xs font-bold text-slate-600">
              <div>Subtotal Rp {money(bazarSubtotal)}</div>
              <div>CC +3% Rp {money(bazarSurcharge)}</div>
              <div className="mt-1 text-sm font-black text-violet-700">
                Total Rp {money(bazarTotal)}
              </div>
            </div>
          </div>

          <label className="mt-3 block text-xs font-bold text-slate-700">
            Catatan Payment / Tambahan Vaksin
            <input
              value={form?.paymentNote ?? form?.payment_note ?? ""}
              onChange={(e) =>
                setForm((previous: any) => ({
                  ...previous,
                  paymentNote: e.target.value,
                }))
              }
              placeholder="Opsional"
              className="mt-1 block w-full rounded-xl border bg-white px-3 py-2.5 text-sm font-semibold"
            />
          </label>
        </div>
      ) : null}

      {!healthdayBazarEnabled ? (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-black uppercase tracking-wide text-slate-700">
            Harga / Payment
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label className="text-xs font-bold text-slate-700">
              Harga pribadi / tambahan
              <input
                type="number"
                value={form?.paymentPrice ?? form?.payment_price ?? ""}
                onChange={(e) =>
                  setForm((previous: any) => ({ ...previous, paymentPrice: e.target.value }))
                }
                placeholder="Harga pribadi / tambahan"
                className="mt-1 block w-full rounded-xl border bg-white px-3 py-2.5 text-sm font-semibold"
              />
            </label>
            <label className="text-xs font-bold text-slate-700">
              Metode Payment
              <input
                value={form?.paymentMethod ?? form?.payment_method ?? ""}
                onChange={(e) =>
                  setForm((previous: any) => ({ ...previous, paymentMethod: e.target.value }))
                }
                placeholder="Contoh: QRIS / Cash / Transfer"
                className="mt-1 block w-full rounded-xl border bg-white px-3 py-2.5 text-sm font-semibold"
              />
            </label>
          </div>
          <label className="mt-3 block text-xs font-bold text-slate-700">
            Catatan Payment / Tambahan Vaksin
            <input
              value={form?.paymentNote ?? form?.payment_note ?? ""}
              onChange={(e) =>
                setForm((previous: any) => ({ ...previous, paymentNote: e.target.value }))
              }
              placeholder="Catatan payment / tambahan vaksin"
              className="mt-1 block w-full rounded-xl border bg-white px-3 py-2.5 text-sm font-semibold"
            />
          </label>
        </div>
      ) : null}

      {!sessionId ? (
        <div className="mt-3 rounded-xl border border-dashed border-slate-300 bg-white px-3 py-3 text-xs font-bold text-slate-500">
          Pilih session terlebih dahulu.
        </div>
      ) : loadingOptions ? (
        <div className="mt-3 rounded-xl border bg-white px-3 py-3 text-xs font-bold text-slate-500">
          Memuat produk...
        </div>
      ) : activeOptions.length ? (
        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {activeOptions.map((item: any) => {
            const key = optionKey(item);
            const checked = activeSelectedKeys.includes(key);
            const lot = clean(item?.lot?.lot_number);
            const expiry = clean(item?.lot?.expiry_date);
            const isBazar = serviceMode === "BAZAR";
            const itemSaleMode = bazarSaleModeByKey[key] || "NON_PACKAGE";
            const offer = isBazar ? selectedOffer(item, itemSaleMode) : null;
            const price = isBazar ? Number(offer?.price || 0) : Number(item?.vaccine?.price);
            const availableOffers = offersFor(item);
            const packageOffer = availableOffers.find((row: any) => saleMode(row?.sale_mode) === "PACKAGE");
            const nonPackageOffer = selectedOffer(item, "NON_PACKAGE");

            return (
              <label
                key={key}
                className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${
                  checked
                    ? isBazar
                      ? "border-violet-400 bg-violet-50 shadow-sm"
                      : "border-blue-400 bg-blue-50 shadow-sm"
                    : "border-slate-200 bg-white/80 hover:border-emerald-200"
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(item, serviceMode)}
                  className={`mt-1 h-4 w-4 ${isBazar ? "accent-violet-600" : "accent-blue-600"}`}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-start justify-between gap-2">
                    <span className="block text-sm font-black text-slate-900">
                      {productLabel(item)}
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black ${
                        isBazar
                          ? "bg-violet-100 text-violet-700"
                          : "bg-blue-100 text-blue-700"
                      }`}
                    >
                      {isBazar
                        ? `Rp ${money(price)}`
                        : healthdayBazarEnabled
                          ? "FREE"
                          : Number.isFinite(price)
                            ? `Rp ${money(price)}`
                            : "HEALTHDAY"}
                    </span>
                  </span>
                  <span className="mt-1 block text-[11px] font-semibold text-slate-500">
                    Lot {lot || "-"}
                    {expiry ? ` · exp ${expiry}` : ""}
                    {isBazar
                      ? " · harga master"
                      : healthdayBazarEnabled
                        ? " · benefit Healthday"
                        : ""}
                  </span>
                  {isBazar && checked && packageOffer && nonPackageOffer ? (
                    <span className="mt-2 block" onClick={(event) => event.preventDefault()}>
                      <span className="mb-1 block text-[10px] font-black uppercase text-violet-700">Jenis Harga</span>
                      <select
                        value={itemSaleMode}
                        onChange={(event) =>
                          setBazarSaleModeByKey((previous) => ({
                            ...previous,
                            [key]: event.target.value === "PACKAGE" ? "PACKAGE" : "NON_PACKAGE",
                          }))
                        }
                        className="w-full rounded-lg border border-violet-200 bg-white px-2 py-1.5 text-xs font-black text-violet-800"
                      >
                        <option value="NON_PACKAGE">Harga Non Paket · Rp {money(nonPackageOffer?.price)}</option>
                        <option value="PACKAGE">Harga Paket · Rp {money(packageOffer?.price)} · {Math.max(2, Number(packageOffer?.package_dose_count || 2))}x</option>
                      </select>
                    </span>
                  ) : isBazar && checked && packageOffer && !nonPackageOffer ? (
                    <span className="mt-2 block rounded-lg bg-violet-50 px-2 py-1 text-[10px] font-black text-violet-700">
                      Harga Paket · Rp {money(packageOffer.price)}
                    </span>
                  ) : null}
                </span>
              </label>
            );
          })}
        </div>
      ) : (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-xs font-bold text-amber-800">
          {serviceMode === "BAZAR"
            ? "Belum ada produk Bazar aktif yang memiliki harga jual > 0 dan lot aktif di master."
            : "Belum ada vaksin benefit Healthday aktif untuk session ini."}
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
        disabled={submitting || !sessionId || !totalSelected}
        className="mt-4 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-black text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting
          ? "Memproses Registrasi + Tiket..."
          : combinationSelected
            ? "Registrasi + Rilis Antrian A & B"
            : "Registrasi Ulang + Rilis & Print Nomor Antrian"}
      </button>
    </div>
  );
}
