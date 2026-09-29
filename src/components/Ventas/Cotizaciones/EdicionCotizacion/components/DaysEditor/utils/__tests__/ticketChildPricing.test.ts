import test from "node:test";
import assert from "node:assert/strict";

import {
  calculateDaySubtotalDetailed,
  calculateGeneralTotalsDetailed,
} from "../priceCalculations";
import { getServicePricingSnapshot } from "../../../../utils/servicePricingRuntime";

const adultIds = ["adult:0:ana", "adult:1:bruno", "adult:2:carla"];
const childIds = ["child:0:diego", "child:1:elena"];

const buildTicket = ({ targetGroup, unitPrice, ids }) => ({
  parentService: { typeService: "tickets" },
  childService: {
    entrada: "BTG",
    procedencia: "extranjero",
    tipo_usuario: targetGroup === "child" ? "estudiante" : "adulto",
  },
  ticketProcedenciaFilter: "extranjero",
  ticketPassengerTargetGroup: targetGroup,
  ticketChildPricingMode: targetGroup === "child" ? "student_tariff" : "none",
  ticketChildrenUseStudentTariffAsAdult: targetGroup === "child",
  pricingMode: "fixed",
  treatChildrenAsAdults: targetGroup === "child",
  assignedPassengerIds: ids,
  convertedChildToAdultMap:
    targetGroup === "child"
      ? Object.fromEntries(ids.map((id) => [id, true]))
      : {},
  passengerSelection: {
    selectedIds: ids,
    ticketProcedenciaFilter: "extranjero",
    ticketPassengerTargetGroup: targetGroup,
    pricingMode: "fixed",
    treatChildrenAsAdults: targetGroup === "child",
  },
  tariff: {
    precio: unitPrice,
    precio_original: unitPrice * ids.length,
  },
});

const peopleDetails = {
  adults: adultIds.map((id) => ({ passenger_key: id, tipo_pasajero: "adult" })),
  children: childIds.map((id) => ({ passenger_key: id, tipo_pasajero: "child" })),
};

test("ticket estudiante conserva su tarifa infantil en el resumen del día", () => {
  const adultTicket = buildTicket({
    targetGroup: "adult",
    unitPrice: 40.63,
    ids: adultIds,
  });
  const studentTicket = buildTicket({
    targetGroup: "child",
    unitPrice: 21.9,
    ids: childIds,
  });

  const studentPricing = getServicePricingSnapshot(studentTicket);
  const totals = calculateDaySubtotalDetailed(
    [adultTicket, studentTicket],
    peopleDetails,
  );

  assert.equal(studentPricing.isTicketStudentTariff, true);
  assert.equal(studentPricing.precioAdult, 21.9);
  assert.equal(studentPricing.total, 43.8);
  assert.equal(totals.subtotalPerPerson, 40.63);
  assert.equal(totals.subtotalNinos, 43.8);
  assert.equal(totals.baseConvertedChildTotal, 43.8);
  assert.deepEqual(totals.baseConvertedChildTotalsById, {
    "child:0:diego": 21.9,
    "child:1:elena": 21.9,
  });
});

test("el consolidado no reemplaza una entrada estudiante por el precio adulto", () => {
  const totals = calculateGeneralTotalsDetailed(
    [
      {
        servicios: [
          buildTicket({ targetGroup: "adult", unitPrice: 40.63, ids: adultIds }),
          buildTicket({ targetGroup: "child", unitPrice: 21.9, ids: childIds }),
        ],
      },
    ],
    peopleDetails,
  );

  assert.equal(totals.totalPerPerson, 40.63);
  assert.equal(totals.subtotalNinos, 43.8);
  assert.equal(totals.baseConvertedChildTotal, 43.8);
});
