import assert from "node:assert/strict";
import test from "node:test";
import {
  formatPendingPaymentAmount,
  matchesPendingPaymentSearch,
  resolvePendingPaymentAssignment,
} from "../pendingPayments";

const request = {
  voucher_code: "VNS-204",
  amount: "84.5",
  service_data: {
    isAssigned: true,
    assignedService: {
      typeService: "hoteles",
      parentService: { nombre_empresa: "Hotel Operativo" },
      childService: { nombre: "Noche doble" },
    },
    assigned_parent_id: 91,
    moneda: "PEN",
  },
};

test("resuelve el snapshot operativo asignado para el egreso", () => {
  const assignment = resolvePendingPaymentAssignment(request);
  assert.equal(assignment.service.parentService.nombre_empresa, "Hotel Operativo");
  assert.equal(assignment.assignedParentId, 91);
  assert.equal(matchesPendingPaymentSearch(request, "operativo vns"), true);
  assert.equal(formatPendingPaymentAmount(request), "$ 84.50");
});

test("el importe de la solicitud no hereda la moneda de la tarifa cotizada", () => {
  assert.equal(formatPendingPaymentAmount({ ...request, currency: "USD" }), "$ 84.50");
  assert.equal(formatPendingPaymentAmount({ ...request, currency: "PEN" }), "S/ 84.50");
});
