# 01 — Notificaciones en tiempo real

## Inicio

`NotificationProvider` recibe DNI/rol desde la sesión. Primero puede hidratar la lista/contador por REST y luego solicita `/notifications/sse-ticket`. Con el ticket abre `EventSource` a `/notifications/stream?ticket=...`.

## Reconexión

Si SSE falla, el contexto marca backend/SSE como no disponible y reintenta con backoff exponencial hasta el máximo configurado. El timeout se guarda en `ref` y se limpia al desmontar/desconectar.

## Caches

Lista y unread-count usan caches locales cortas. Cuando llega un evento visible para el rol:

- se invalida la cache de notificaciones;
- se agrega/actualiza/elimina el item local;
- se invalidan queries relacionadas cuando el contexto identifica cotización/voucher/pago;
- para post-sale se despacha `postSaleEditRequestUpdated` y se invalidan las queries de requests.

## Visibilidad

La UI vuelve a filtrar con `isNotificationVisibleForRole`; no confía en mostrar todo lo recibido. El control de seguridad real sigue en backend.

## UX

`useSSENotifications` añade filtros, conteos por tipo, marcado de lectura, sonido opcional y desktop notifications. El sistema realtime es mejora de UX, no fuente de verdad: después de refresh se consulta REST.
