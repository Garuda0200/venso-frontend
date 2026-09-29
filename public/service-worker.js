(() => {
  // src/workers/service-worker.ts
  var CACHE_VERSION = "v1";
  var TIGRIS_IMAGE_CACHE = `tigris-images-${CACHE_VERSION}`;
  var TIGRIS_PROXY_PATH = "/api/upload/tigris/proxy";
  var isTigrisProxyRequest = (url) => url.pathname.includes(TIGRIS_PROXY_PATH) || url.pathname.includes("/upload/tigris/proxy");
  var isReferenceImageRequest = (url) => {
    const query = url.searchParams.get("url") || "";
    return query.includes("pdf-reference-images/");
  };
  var isUserUploadedImageRequest = (url) => {
    const query = url.searchParams.get("url") || "";
    return query.includes("pdf_media/");
  };
  self.addEventListener("install", (event) => {
    event.waitUntil(self.skipWaiting());
  });
  self.addEventListener("activate", (event) => {
    event.waitUntil(
      caches.keys().then(
        (cacheNames) => Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName.startsWith("tigris-images-") && cacheName !== TIGRIS_IMAGE_CACHE) {
              return caches.delete(cacheName);
            }
            return Promise.resolve();
          })
        )
      ).then(() => self.clients.claim())
    );
  });
  self.addEventListener("fetch", (event) => {
    const { request } = event;
    const url = new URL(request.url);
    if (request.method !== "GET" || !isTigrisProxyRequest(url)) {
      return;
    }
    if (isReferenceImageRequest(url)) {
      event.respondWith(staleWhileRevalidate(request));
    } else if (isUserUploadedImageRequest(url)) {
      event.respondWith(networkFirst(request));
    }
  });
  async function staleWhileRevalidate(request) {
    const cache = await caches.open(TIGRIS_IMAGE_CACHE);
    const cached = await cache.match(request);
    const networkFetch = fetch(request).then((response) => {
      if (response && response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    }).catch(() => null);
    if (cached) {
      networkFetch.then(() => {
      });
      return cached;
    }
    const networkResponse = await networkFetch;
    if (networkResponse) return networkResponse;
    return new Response("Imagen no disponible", { status: 504 });
  }
  async function networkFirst(request) {
    const cache = await caches.open(TIGRIS_IMAGE_CACHE);
    try {
      const networkResponse = await fetch(request);
      if (networkResponse && networkResponse.ok) {
        await cache.put(request, networkResponse.clone());
      }
      return networkResponse;
    } catch (error) {
      const cached = await cache.match(request);
      if (cached) return cached;
      return new Response("Imagen no disponible", { status: 504 });
    }
  }
  self.addEventListener("message", (event) => {
    const { type, url, clearAll } = event.data || {};
    if (type === "INVALIDATE_TIGRIS_CACHE") {
      if (clearAll) {
        event.waitUntil(clearAllTigrisCaches());
      } else if (url) {
        event.waitUntil(invalidateTigrisUrl(url));
      }
    }
  });
  async function clearAllTigrisCaches() {
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames.filter((name) => name.startsWith("tigris-images-")).map((name) => caches.delete(name))
    );
  }
  async function invalidateTigrisUrl(url) {
    const cache = await caches.open(TIGRIS_IMAGE_CACHE);
    await cache.delete(new Request(url, { method: "GET" }));
    try {
      const parsed = new URL(url, self.location.origin);
      const rawUrl = parsed.searchParams.get("url");
      if (rawUrl) {
        const encoded = encodeURIComponent(rawUrl);
        await cache.delete(
          new Request(
            `${parsed.origin}${parsed.pathname}?url=${encoded}`,
            { method: "GET" }
          )
        );
      }
    } catch {
    }
  }
  self.addEventListener("push", (event) => {
    const data = event.data ? event.data.json() : {};
    event.waitUntil(
      self.registration.showNotification(data.title || "Venso Tours", {
        body: data.body || "Nueva notificaci\xF3n",
        icon: "/logo192.webp",
        badge: "/logo192.webp",
        data: data.data
      })
    );
  });
  self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    event.waitUntil(clients.openWindow(event.notification.data?.url || "/"));
  });
  console.log("[SW] Service Worker loaded successfully");
})();
