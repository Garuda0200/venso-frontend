import assert from "node:assert/strict";
import test from "node:test";
import {
  buildReservationVoucherMap,
  mapReservationVoucherRelation,
} from "../reservationVoucherRender";

test("render usa assigned_itinerary batch y conserva paymentRequest completo", () => {
  const mapped = mapReservationVoucherRelation({
    id: "VR-1",
    voucher_id: 12,
    assigned_itinerary: [{
      numero: 1,
      servicios: [{
        id: 91,
        isAssigned: true,
        assignedParentId: 5,
        paymentRequest: {
          status: "paid",
          amount: "120.50",
          movimiento_id: 44,
          pagado_por: "contabilidad",
        },
      }],
    }],
  });
  assert.equal(mapped.assignedItinerary[0].servicios[0].paymentRequest.movimiento_id, 44);
  assert.equal(mapped.hasAssignedServices, true);
});

test("render prioriza media resuelto entregado por backend", () => {
  const mapped = mapReservationVoucherRelation({
    id: "VR-2",
    voucher_id: 13,
    resolved_voucher_media: { url: "voucher-media/file.pdf", origin: "voucher_reserva_media" },
    voucher_media: { url: "voucher-media/file.pdf" },
    assigned_itinerary: [],
  });
  assert.equal(mapped.resolvedVoucherMedia.url, "voucher-media/file.pdf");
  assert.equal(mapped.voucherMedia.url, "voucher-media/file.pdf");
});

test("map omite reservas recientemente eliminadas", () => {
  const map = buildReservationVoucherMap(
    [
      { id: "VR-1", voucher_id: 1, assigned_itinerary: [] },
      { id: "VR-2", voucher_id: 2, assigned_itinerary: [] },
    ],
    new Set(["VR-2"]),
  );
  assert.ok(map["1"]);
  assert.equal(map["2"], undefined);
});
