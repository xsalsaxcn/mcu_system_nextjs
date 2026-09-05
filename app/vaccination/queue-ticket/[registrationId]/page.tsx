"use client";

// VACCINATION_QUEUE_TICKET_PRINT_V147_1
import { useEffect, useMemo, useState } from "react";

function clean(value: any) {
  return String(value ?? "").trim();
}

function serviceName(item: any) {
  const vaccine = item?.vaccine || {};
  return (
    clean(vaccine?.name) ||
    clean(item?.vaccine_name) ||
    clean(item?.product_name) ||
    clean(item?.name) ||
    (item?.vaccine_id ? `Vaksin #${item.vaccine_id}` : "Vaksin")
  );
}

async function getJson(url: string) {
  return fetch(url, { cache: "no-store" })
    .then((response) => response.json())
    .catch((error) => ({ ok: false, message: error?.message || "Network error" }));
}

export default function VaccinationQueueTicketPage({ params }: { params: { registrationId: string } }) {
  const registrationId = Number(params?.registrationId || 0);
  const [registration, setRegistration] = useState<any>(null);
  const [session, setSession] = useState<any>(null);
  const [message, setMessage] = useState("Menunggu nomor antrian dirilis...");
  const [readyToPrint, setReadyToPrint] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadTicket() {
      if (!registrationId) {
        if (active) setMessage("Registration ID tidak valid.");
        return;
      }

      let snapshot: any = null;
      let sessionId = 0;

      // Window ini sengaja dibuka SEBELUM request rilis antrian selesai.
      // Karena itu halaman tiket polling data registrasi sampai queue_number tersedia.
      for (let attempt = 0; attempt < 24 && active; attempt += 1) {
        const registerJson = await getJson(`/api/vaccination/register?t=${Date.now()}`);
        snapshot = (registerJson?.registrations || []).find(
          (item: any) => Number(item?.id || 0) === registrationId,
        );

        sessionId = Number(snapshot?.session_id || 0);
        if (snapshot && clean(snapshot?.queue_number) && sessionId) break;

        await new Promise((resolve) => window.setTimeout(resolve, 250));
      }

      if (!active) return;
      if (!snapshot) {
        setMessage("Data peserta tidak ditemukan. Tutup window ini lalu coba Rilis Antrian lagi.");
        return;
      }
      if (!clean(snapshot?.queue_number)) {
        setRegistration(snapshot);
        setMessage("Nomor antrian belum tersedia. Jika proses rilis gagal, tutup window ini lalu coba lagi.");
        return;
      }
      if (!sessionId) {
        setRegistration(snapshot);
        setMessage("Session peserta tidak ditemukan.");
        return;
      }

      const queueJson = await getJson(
        `/api/vaccination/queue?session_id=${encodeURIComponent(String(sessionId))}&t=${Date.now()}`,
      );

      if (!active) return;

      const queueRow = (queueJson?.registrations || []).find(
        (item: any) => Number(item?.id || 0) === registrationId,
      );

      setRegistration(queueRow || snapshot);
      setSession(queueJson?.session || null);
      setMessage("");
      setReadyToPrint(true);
    }

    void loadTicket();
    return () => {
      active = false;
    };
  }, [registrationId]);

  const services = useMemo(() => {
    const items = Array.isArray(registration?.items) ? registration.items : [];
    const activeItems = items.filter((item: any) => item?.active !== false);
    const names = activeItems.map(serviceName).filter(Boolean);
    return Array.from(new Set(names));
  }, [registration]);

  useEffect(() => {
    if (!readyToPrint || !registration) return;
    const query = new URLSearchParams(window.location.search);
    if (query.get("autoprint") !== "1") return;

    const timer = window.setTimeout(() => {
      window.focus();
      window.print();
    }, 650);
    return () => window.clearTimeout(timer);
  }, [readyToPrint, registration]);

  const queueNumber = clean(registration?.queue_number) || "-";
  const participantName = clean(registration?.participant_name) || "-";
  const location = clean(session?.location) || clean(registration?.location) || "-";
  const serviceCount = Math.max(1, services.length);

  return (
    <main className="ticket-page">
      <button type="button" className="no-print print-button" onClick={() => window.print()}>
        Print Tiket Antrian
      </button>

      {message ? <div className="ticket-message">{message}</div> : null}

      {registration ? (
        <section className={`ticket-card services-${Math.min(serviceCount, 4)}`}>
          <div className="ticket-head">
            <div>
              <div className="brand">HARMONY HEALTH · VACCINATION</div>
              <div className="ticket-label">NOMOR ANTRIAN</div>
            </div>
            <div className="queue-number">{queueNumber}</div>
          </div>

          <div className="divider" />
          <div className="participant-name">{participantName}</div>

          <div className="detail-grid">
            <div className="detail-block service-block">
              <div className="caption">LAYANAN</div>
              <div className="services">
                {services.length ? (
                  services.map((name, index) => (
                    <div className="service-line" key={`${name}-${index}`}>
                      {services.length > 1 ? `${index + 1}. ` : ""}{String(name)}
                    </div>
                  ))
                ) : (
                  <div className="service-line">-</div>
                )}
              </div>
            </div>

            <div className="detail-block location-block">
              <div className="caption">LOKASI</div>
              <div className="location">{location}</div>
            </div>
          </div>
        </section>
      ) : null}

      <style jsx global>{`
        @page { size: 50.8mm 30mm; margin: 0; }
        html, body { margin: 0; padding: 0; background: white; color: #000; font-family: Arial, Helvetica, sans-serif; }
        * { box-sizing: border-box; }
        .ticket-page { width: 50.8mm; min-height: 30mm; margin: 0; padding: 0; background: #fff; }
        .print-button { margin: 12px; border: 0; border-radius: 10px; background: #2563eb; color: white; padding: 9px 14px; font-weight: 800; cursor: pointer; }
        .ticket-message { margin: 12px; font-size: 13px; font-weight: 700; }
        .ticket-card { width: 50.8mm; height: 30mm; overflow: hidden; padding: 1.2mm 1.6mm 1mm; background: #fff; display: flex; flex-direction: column; }
        .ticket-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 1.4mm; }
        .brand { font-size: 5.4pt; line-height: 1; font-weight: 900; white-space: nowrap; }
        .ticket-label { margin-top: 0.6mm; font-size: 5.2pt; line-height: 1; font-weight: 800; letter-spacing: 0.04em; }
        .queue-number { font-size: 18pt; line-height: 0.9; font-weight: 950; letter-spacing: -0.04em; white-space: nowrap; }
        .divider { margin-top: 0.7mm; border-top: 0.28mm solid #000; }
        .participant-name { margin-top: 0.7mm; font-size: 10.4pt; line-height: 0.96; font-weight: 950; letter-spacing: -0.025em; max-height: 7.6mm; overflow: hidden; }
        .detail-grid { margin-top: 0.7mm; display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(0, 0.8fr); gap: 1.2mm; min-height: 0; flex: 1; }
        .caption { font-size: 4.8pt; line-height: 1; font-weight: 900; letter-spacing: 0.04em; }
        .services { margin-top: 0.35mm; }
        .service-line, .location { font-size: 7.2pt; line-height: 1.02; font-weight: 900; overflow-wrap: anywhere; }
        .location { margin-top: 0.35mm; text-align: right; }
        .location-block .caption { text-align: right; }
        .services-2 .service-line { font-size: 6.7pt; }
        .services-3 .service-line { font-size: 5.9pt; line-height: 0.98; }
        .services-4 .service-line { font-size: 5.2pt; line-height: 0.95; }
        @media print {
          html, body, .ticket-page { width: 50.8mm !important; height: 30mm !important; min-height: 30mm !important; overflow: hidden !important; }
          .no-print, .ticket-message { display: none !important; }
          .ticket-card { width: 50.8mm !important; height: 30mm !important; page-break-after: avoid !important; break-after: avoid-page !important; }
        }
      `}</style>
    
      <style jsx global>{`
        /* V147_4_1_QUEUE_NUMBER_FIT */
        .ticket-head {
          position: relative !important;
          min-height: 7mm !important;
          padding-right: 19mm !important;
          display: block !important;
        }

        .ticket-head > div:first-child {
          min-width: 0 !important;
        }

        .queue-number {
          position: absolute !important;
          top: 0 !important;
          right: 0 !important;
          width: 18mm !important;
          max-width: 18mm !important;
          min-width: 18mm !important;
          font-size: 14pt !important;
          line-height: 0.9 !important;
          font-weight: 950 !important;
          letter-spacing: -0.04em !important;
          text-align: right !important;
          white-space: nowrap !important;
          overflow: visible !important;
        }
      `}</style>

      <style jsx global>{`
        /* V147_6_QUEUE_TICKET_LAYOUT */
        .ticket-card {
          padding: 1.15mm 1.4mm 0.9mm !important;
        }

        .ticket-head {
          position: relative !important;
          display: grid !important;
          grid-template-columns: minmax(0, 1fr) 17mm !important;
          align-items: start !important;
          gap: 1mm !important;
          min-height: 6.2mm !important;
          padding-right: 0 !important;
        }

        .ticket-head > div:first-child {
          min-width: 0 !important;
          overflow: hidden !important;
        }

        .brand {
          font-size: 4.7pt !important;
          line-height: 1 !important;
          letter-spacing: 0 !important;
          white-space: nowrap !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
        }

        .ticket-label {
          margin-top: 0.45mm !important;
          font-size: 4.6pt !important;
          line-height: 1 !important;
          letter-spacing: 0.03em !important;
        }

        .queue-number {
          position: static !important;
          width: auto !important;
          min-width: 0 !important;
          max-width: none !important;
          font-size: 13.2pt !important;
          line-height: 0.9 !important;
          letter-spacing: -0.03em !important;
          text-align: right !important;
          white-space: nowrap !important;
          overflow: visible !important;
          align-self: start !important;
        }

        .divider {
          margin-top: 0.45mm !important;
          border-top-width: 0.22mm !important;
        }

        .participant-name {
          margin-top: 0.6mm !important;
          margin-bottom: 0 !important;
          font-size: 8.3pt !important;
          line-height: 0.94 !important;
          letter-spacing: -0.015em !important;
          max-height: 5.5mm !important;
          overflow: hidden !important;
          display: -webkit-box !important;
          -webkit-box-orient: vertical !important;
          -webkit-line-clamp: 2 !important;
        }

        .detail-grid {
          margin-top: 0.55mm !important;
          display: grid !important;
          grid-template-columns: minmax(0, 1.7fr) minmax(11mm, 0.75fr) !important;
          gap: 1mm !important;
          align-items: start !important;
          min-height: 0 !important;
        }

        .service-block,
        .location-block {
          min-width: 0 !important;
        }

        .caption {
          font-size: 4.25pt !important;
          line-height: 1 !important;
          letter-spacing: 0.035em !important;
        }

        .services {
          margin-top: 0.3mm !important;
        }

        .service-line,
        .location {
          font-size: 6.4pt !important;
          line-height: 1.02 !important;
          font-weight: 900 !important;
          overflow-wrap: anywhere !important;
        }

        .location {
          margin-top: 0.3mm !important;
          text-align: right !important;
        }

        .location-block .caption {
          text-align: right !important;
        }

        .services-2 .service-line {
          font-size: 6.0pt !important;
        }

        .services-3 .service-line {
          font-size: 5.5pt !important;
          line-height: 0.98 !important;
        }

        .services-4 .service-line {
          font-size: 5.0pt !important;
          line-height: 0.95 !important;
        }

        @media print {
          .ticket-card {
            width: 50.8mm !important;
            height: 30mm !important;
            overflow: hidden !important;
          }
        }
      `}</style>
</main>
  );
}
