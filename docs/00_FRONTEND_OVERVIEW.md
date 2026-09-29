# 00 — Arquitectura frontend

## Capas principales

```text
router/layouts
  -> pages
      -> domain components
          -> hooks/services
              -> axios / React Query
                  -> backend
```

`AuthContext` mantiene identidad/sesión; `NotificationContext` concentra notificaciones/SSE; React Query mantiene caches de listados/detalles. Las mutaciones importantes invalidan el grafo de cotización/vouchers correspondiente.

## Dominios

- Ventas/Cotizaciones: creación, edición, itinerario, hoteles, pasajeros, pricing, PDF, historial.
- Ventas/VouchersVenta: cierre, pasajeros, datos PDF, vuelos, documentos.
- Reservas/VouchersReserva: operación/asignaciones y solicitudes de pago.
- Contabilidad: movimientos, saldos, liquidaciones/reportes.
- Admin: usuarios/logs/comisiones y permisos postventa.

## Convención Venso

La cotización ya contiene `agency_id`; componentes de servicio/hotel usan ese contexto. La UI debe ser minimalista y no replicar visualmente Magic aunque comparta invariantes.
