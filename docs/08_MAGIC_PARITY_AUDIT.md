# 08 — Auditoría frontend Magic → Venso

## Ya estaba en Venso

Venso ya tenía la mayor parte del frontend operacional que Magic usa: reservas/asignaciones, pagos, contabilidad, evidencias/media, SSE, PDF, hoteles y protección `assigned_*`. Esas piezas no se sustituyen.

## Portado/adaptado en este cambio

1. Flujo reactivo de permiso postventa y panel exclusivo de superadmin.
2. Commit de edición one-shot en lugar de reactivar `EDITABLE_ONCE`.
3. Idempotencia en creación/finalización de vouchers.
4. Endpoints estrechos para `datos_pdf` y vuelos.
5. Historial de versiones siempre expandido y simplificado.
6. Composición adulto/niño robusta en snapshots/versiones.
7. SummaryContent con precio adulto/niño por servicio/ocupante.
8. Tests de estado postventa, idempotencia y presentación por pasajero.

## Adaptaciones Venso

- defaults de plataforma continúan en `venso`;
- no se incorporan filtros MIL;
- el editor usa la agencia ya seleccionada de la cotización;
- el diseño puede conservar tokens/branding propios de Venso aunque comparta lógica de Magic.
