/* V153.33 SAFE - Vaccination Onsite Queue Web Push + Device Diagnostics */

const DIAG_CACHE = "vaccination-onsite-diagnostics-v1";
const DIAG_KEY = "/__vaccination_onsite_push_diag__";

async function writeDiagnostic(payload) {
  try {
    const cache = await caches.open(DIAG_CACHE);
    const response = new Response(
      JSON.stringify({
        ...payload,
        writtenAt: new Date().toISOString(),
      }),
      {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      }
    );
    await cache.put(DIAG_KEY, response);
  } catch {}
}

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  event.waitUntil((async () => {
    let payload = {};
    let parseError = "";

    try {
      payload = event.data ? event.data.json() : {};
    } catch (error) {
      parseError = String(error?.message || error || "");
      try {
        payload = { body: event.data ? event.data.text() : "" };
      } catch {
        payload = {};
      }
    }

    const receivedAt = new Date().toISOString();
    const title = payload.title || "Giliran Antrean Vaksinasi";
    const options = {
      body: payload.body || "Giliran Anda dipanggil. Silakan menuju area vaksinasi.",
      tag: payload.tag || "vaccination-onsite-called",
      renotify: true,
      requireInteraction: true,
      silent: false,
      vibrate: [700, 200, 700, 200, 1000],
      data: {
        url: payload.url || "/vaccination",
        queueNumber: payload.queueNumber || "",
        status: payload.status || "CALLED",
      },
    };

    await writeDiagnostic({
      receivedAt,
      parseError,
      notificationResult: "pending",
      tag: options.tag,
      status: options.data.status,
      queueNumber: options.data.queueNumber,
    });

    try {
      await self.registration.showNotification(title, options);
      await writeDiagnostic({
        receivedAt,
        parseError,
        notificationResult: "resolved",
        notificationResolvedAt: new Date().toISOString(),
        tag: options.tag,
        status: options.data.status,
        queueNumber: options.data.queueNumber,
      });
    } catch (error) {
      await writeDiagnostic({
        receivedAt,
        parseError,
        notificationResult: "failed",
        error: String(error?.message || error || ""),
        tag: options.tag,
        status: options.data.status,
        queueNumber: options.data.queueNumber,
      });
      throw error;
    }
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const relativeUrl = event.notification?.data?.url || "/vaccination";
  const targetUrl = new URL(relativeUrl, self.location.origin).href;

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({
      type: "window",
      includeUncontrolled: true,
    });

    for (const client of windows) {
      try {
        if (client.url === targetUrl && "focus" in client) {
          return client.focus();
        }
      } catch {}
    }

    if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    return undefined;
  })());
});
