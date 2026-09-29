# 05 — Voucher Venta y Voucher Reserva en frontend

## Idempotencia

`createIdempotencyKey` genera una clave por intento. En VoucherModal se conservan refs/promesas en vuelo para que doble clic o re-render reutilicen el intento y no creen un segundo voucher.

Voucher Reserva aplica el mismo patrón en `VouchersReserva`: metadata estable por voucher/cotización y promesa en vuelo.

## Servicios

`voucherVentaService`:

- create/update con `Idempotency-Key`;
- `updateDatosPdf` usa endpoint `/datos-pdf`;
- `updateVuelosExternos` usa `/vuelos-externos`;
- invalida/parchea caches tras respuesta.

`voucherReservaService.createVoucherReserva` también admite `options.idempotencyKey`.

## Motivo de endpoints estrechos

Editar vuelos o metadata PDF no debe mandar el voucher financiero completo ni depender del `created_by` del PUT general. Las mutaciones estrechas reducen superficie de autorización y riesgo de carreras.
