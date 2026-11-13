// AlertNet Service Worker Push & Offline SOS Notification Handler
self.addEventListener('push', (event) => {
  let payload = {
    title: 'AlertNet Emergency Warning',
    body: 'Check AlertNet for urgent flood updates in your registered area.',
    severity: 'CRITICAL',
    url: '/',
    tag: 'alertnet-flood-warning',
  };

  try {
    if (event.data) {
      const parsed = event.data.json();
      payload = { ...payload, ...parsed };
    }
  } catch {
    if (event.data) {
      payload.body = event.data.text();
    }
  }

  const options = {
    body: payload.body,
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: payload.tag || 'alertnet-flood-warning',
    renotify: true,
    requireInteraction: payload.severity === 'CRITICAL' || payload.severity === 'HIGH',
    vibrate: [300, 100, 300, 100, 300],
    data: {
      url: payload.url || '/',
      alertId: payload.alertId,
      severity: payload.severity,
    },
    actions: [
      { action: 'open', title: 'Open AlertNet' },
      { action: 'sos', title: 'Open SOS' },
    ],
  };

  event.waitUntil(self.registration.showNotification(payload.title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl =
    event.action === 'sos'
      ? '/?view=sos'
      : (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus();
          client.postMessage({ type: 'ALERTNET_NOTIFICATION_CLICK', url: targetUrl });
          return;
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
