/* V153.30 SAFE - Vaccination Onsite Queue Web Push Service Worker */
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    try {
      payload = { body: event.data ? event.data.text() : "" };
    } catch {
      payload = {};
    }
  }

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

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const relativeUrl = event.notification?.data?.url || "/vaccination";
  const targetUrl = new URL(relativeUrl, self.location.origin).href;

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      try {
        if (client.url === targetUrl && "focus" in client) return client.focus();
      } catch {}
    }
    if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    return undefined;
  })());
});
