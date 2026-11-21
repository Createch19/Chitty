/* Chitty service worker. Keeps the app installable and shows a friendly page when offline.
   It never caches member pages or API data: money and auction state must always be live. */
const CACHE = "chitty-v2";
const OFFLINE = "/offline.html";

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll([OFFLINE, "/pwa-icon/192"])).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || req.mode !== "navigate") return; // only page loads; SSE/API go straight to the network
  e.respondWith(fetch(req).catch(() => caches.match(OFFLINE)));
});

/* Web Push (BUSINESS-CONCEPT §12). The payload is built on the server in the member's language. */
self.addEventListener("push", (e) => {
  let p = {};
  try {
    p = e.data ? e.data.json() : {};
  } catch {
    p = { title: "Chitty", body: e.data ? e.data.text() : "" };
  }
  e.waitUntil(
    self.registration.showNotification(p.title || "Chitty", {
      body: p.body || "",
      tag: p.tag,
      renotify: Boolean(p.tag),
      icon: "/pwa-icon/192",
      badge: "/pwa-icon/192",
      data: { url: p.url || "/open" },
    }),
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || "/open", self.location.origin).href;
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.startsWith(self.location.origin) && "navigate" in c) return c.focus().then(() => c.navigate(url));
      }
      return self.clients.openWindow(url);
    }),
  );
});
