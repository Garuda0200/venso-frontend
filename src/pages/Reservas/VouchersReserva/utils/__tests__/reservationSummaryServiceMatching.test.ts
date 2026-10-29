import test from "node:test";
import assert from "node:assert/strict";
import {
  findReservationQuotedService,
  getReservationQuotedIdentity,
  hasReservationQuotedIdentity,
  getReservationSummaryServiceSource,
  markReservationExternalItinerary,
} from "../reservationSummaryServiceMatching";
import { buildReservationSummaryModel } from "../reservationSummaryModel";

const baseTransport = {
  servicioId: 100,
  typeService: "transportes",
  parentService: { id: 10, typeService: "transportes", nombre_transporte: "TRANSPORTES PAUL" },
  tariff: { precio: 25, precio_original: 25 },
};

const externalFlight = {
  servicioId: 200,
  typeService: "vuelos",
  parentService: { id: 20, typeService: "vuelos", nombre: "Vuelos" },
  tariff: { precio: 400, precio_original: 400 },
};

test("serviceIndex de cotizacion_externa se resuelve dentro de su propia fuente", () => {
  const markedExternal = markReservationExternalItinerary([
    { numero: 3, servicios: [externalFlight] },
  ])[0].servicios[0];

  const assignedExternal = {
    ...markedExternal,
    cotizacionServiceRef: { serviceIndex: 0, typeService: "vuelos" },
    isAssigned: true,
    assignedParentService: { id: 30, typeService: "vuelos", nombre: "LATAM AIRLINES" },
  };

  const matched = findReservationQuotedService({
    service: assignedExternal,
    quotedServices: [baseTransport, markedExternal],
  });

  assert.equal(matched.servicioId, 200);
  assert.equal(getReservationSummaryServiceSource(matched), "external");
});

test("un servicio externo nunca cae por índice al primer servicio principal", () => {
  const assignedExternal = {
    servicioId: 200,
    typeService: "vuelos",
    sourceItinerary: "external",
    refTipo: "cotizacion_externa",
    cotizacionServiceRef: { serviceIndex: 0, typeService: "vuelos" },
  };

  const matched = findReservationQuotedService({
    service: assignedExternal,
    quotedServices: [baseTransport],
  });

  assert.equal(matched, null);
});

test("la habitación cotizada se empareja por parent_id y child_id, no por su posición", () => {
  const quotedOtherHotel = {
    servicioId: 410,
    typeService: "hoteles",
    parent_id: 10,
    child_id: 100,
    parentService: { id_hotel: 10, typeService: "hoteles", nombre: "Hotel A" },
    childService: { id_habitacion: 100, tipo_habitacion: "SIMPLE" },
  };
  const quotedHotel = {
    servicioId: 411,
    typeService: "hoteles",
    parent_id: 20,
    child_id: 200,
    parentService: { id_hotel: 20, typeService: "hoteles", nombre: "Hotel B" },
    childService: { id_habitacion: 200, tipo_habitacion: "DOBLE" },
  };
  const assignedService = {
    typeService: "hoteles",
    parent_id: 20,
    child_id: 200,
    assigned_parent_id: 99,
    assigned_child_id: 999,
    assignedParentService: { id_hotel: 99, nombre: "Hotel operativo" },
    assignedChildService: { id_habitacion: 999, tipo_habitacion: "MATRIMONIAL" },
  };

  assert.equal(hasReservationQuotedIdentity(assignedService), true);
  assert.equal(
    getReservationQuotedIdentity(assignedService),
    "hoteles|20|200",
  );
  assert.equal(
    findReservationQuotedService({
      service: assignedService,
      quotedServices: [quotedOtherHotel, quotedHotel],
    }),
    quotedHotel,
  );
});

test("el resumen conserva assigned_parent_id y assigned_child_id como identidad operacional", () => {
  const model = buildReservationSummaryModel({
    quotedItinerary: [{ numero: 1, servicios: [{
      servicioId: 301,
      typeService: "hoteles",
      parentService: { id_hotel: 2, typeService: "hoteles" },
      childService: { id_habitacion: 18, tipo_habitacion: "DOBLE" },
      tariff: { precio: 35, precio_original: 70 },
    }] }],
    assignedItinerary: [{ numero: 1, servicios: [{
      servicioId: 301,
      typeService: "hoteles",
      is_assigned: true,
      assigned_parent_id: 99,
      assigned_child_id: 501,
      assignedParentService: { id_hotel: 99, typeService: "hoteles" },
      assignedTariff: { precio: 26, precio_original: 52 },
    }] }],
  });

  const service = model.days[0].services[0];
  assert.equal(service.assignedServiceData.assignedParentId, 99);
  assert.equal(service.assignedServiceData.assignedChildId, 501);
});
