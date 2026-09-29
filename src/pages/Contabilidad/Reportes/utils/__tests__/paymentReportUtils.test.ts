import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAgencyPaymentRows,
  buildProviderPaymentGroups,
  flattenQuoteServices,
  groupPaymentRowsByDay,
  resolveProviderId,
  summarizeFileCollection,
  summarizeServiceRequests,
} from "../paymentReportUtils";

test("provider identity uses the operational provider with quotation fallback", () => {
  assert.equal(resolveProviderId({ parentId: 7, assignedParentId: 91 }), 91);
  assert.equal(resolveProviderId({ parentId: 7 }), 7);
});

test("whole quotation services are materialized even without payment requests", () => {
  const rows = flattenQuoteServices({
    id: "C-1",
    fechainicio: "2026-01-10",
    cantidadpersonas: 2,
    itinerario: [
      {
        numero: 2,
        servicios: [
          {
            id: 11,
            parentId: 7,
            typeService: "transportes",
            precioServicio: 20,
            precioTotal: 40,
            moneda: "USD",
            parentService: { nombre_transporte: "Kelly" },
            childService: { nombre: "City Tour" },
            assignedParentId: 99,
          },
        ],
      },
    ],
  }, { id: 1, name: "Venso Tours", is_primary: true });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].providerId, 99);
  assert.equal(rows[0].providerName, "Kelly");
  assert.equal(rows[0].serviceDate, "2026-01-11");
});

test("agency report follows SummaryContent day and itinerary service order", () => {
  const rows = flattenQuoteServices({
    id: "C-ORDER",
    fechainicio: "2026-08-18",
    cantidadpersonas: 4,
    itinerario: [
      {
        numero: 2,
        titulo: "Segundo día",
        servicios: [
          { id: 22, orden: 2, parentId: 2, typeService: "tickets", precioTotal: 40 },
          { id: 21, orden: 1, parentId: 2, typeService: "tickets", precioTotal: 20 },
        ],
      },
      {
        numero: 1,
        titulo: "Primer día",
        servicios: [
          { id: 12, orden: 2, parentId: 1, typeService: "guias", precioTotal: 80 },
          { id: 11, orden: 1, parentId: 1, typeService: "guias", precioTotal: 60 },
        ],
      },
    ],
    itinerario_externo: [
      {
        numero: 1,
        servicios: [
          { id: 13, orden: 1, parentId: 3, typeService: "externo", precioTotal: 30 },
        ],
      },
    ],
  });

  assert.deepEqual(rows.map((row) => row.serviceId), [11, 12, 13, 21, 22]);
  assert.deepEqual(rows.map((row) => row.dayNumber), [1, 1, 1, 2, 2]);
  assert.deepEqual(rows.map((row) => row.daySource), ["main", "main", "external", "main", "main"]);
  assert.deepEqual(rows.map((row) => row.serviceOrder), [1, 2, 1, 1, 2]);
  assert.deepEqual(rows.map((row) => row.serviceDate), [
    "2026-08-18",
    "2026-08-18",
    "2026-08-18",
    "2026-08-19",
    "2026-08-19",
  ]);

  const groups = groupPaymentRowsByDay(rows);
  assert.deepEqual(groups.map((group) => group.dayNumber), [1, 2]);
  assert.deepEqual(groups[0].rows.map((row) => row.serviceId), [11, 12, 13]);
  assert.deepEqual(groups[1].rows.map((row) => row.serviceId), [21, 22]);
});

test("request summary distinguishes unrequested, pending and paid", () => {
  assert.equal(summarizeServiceRequests([]).status, "unrequested");
  assert.equal(summarizeServiceRequests([{ amount: 20, status: "pending" }]).status, "pending");
  assert.equal(summarizeServiceRequests([{ amount: 20, status: "paid" }]).status, "paid");
});

test("agency percentage commission is applied per service preserving totals", () => {
  const rows = buildAgencyPaymentRows({
    id: "C-2",
    cantidadpersonas: 2,
    additionalcosts: { fee: 10, feeMode: "percentage" },
    itinerario: [{ numero: 1, servicios: [
      { id: 1, parentId: 1, typeService: "guias", precioServicio: 50, precioTotal: 100, parentService: { nombres: "A" } },
      { id: 2, parentId: 2, typeService: "tickets", precioServicio: 25, precioTotal: 50, parentService: { entrada: "B" } },
    ] }],
  });
  assert.deepEqual(rows.map((row) => row.exactTotalWithCommission), [110, 55]);
  assert.deepEqual(rows.map((row) => row.exactUnitWithCommission), [55, 27.5]);
  assert.deepEqual(rows.map((row) => row.totalWithCommission), [110, 56]);
  assert.deepEqual(rows.map((row) => row.unitWithCommission), [55, 28]);
});


test("agency report exposes commission per passenger and reconciles divided service totals", () => {
  const rows = buildAgencyPaymentRows({
    id: "C-4",
    cantidadpersonas: 5,
    additionalcosts: { fee: 10, feeMode: "percentage" },
    itinerario: [{ numero: 1, servicios: [
      {
        id: 1,
        parentId: 1,
        typeService: "transportes",
        precioServicio: 80,
        precioTotal: 80,
        precioAdultoDividido: true,
        beneficiariosAdultos: [1, 2, 3, 4, 5],
      },
      {
        id: 2,
        parentId: 2,
        typeService: "tickets",
        precioServicio: 15,
        precioTotal: 60,
        beneficiariosAdultos: [1, 2, 3, 4],
      },
    ] }],
  });

  assert.equal(rows[0].quotedUnit, 16);
  assert.equal(rows[0].commissionPerPerson, 1.6);
  assert.equal(rows[0].exactUnitWithCommission, 17.6);
  assert.equal(rows[0].unitWithCommission, 18);
  assert.equal(rows[0].commissionAmount, 8);
  assert.equal(rows[0].totalWithCommission, 90);

  assert.equal(rows[1].quotedUnit, 15);
  assert.equal(rows[1].commissionPerPerson, 1.5);
  assert.equal(rows[1].exactUnitWithCommission, 16.5);
  assert.equal(rows[1].unitWithCommission, 17);
  assert.equal(rows[1].commissionAmount, 6);
  assert.equal(rows[1].totalWithCommission, 68);
});

test("fixed commission is distributed across services instead of duplicated", () => {
  const rows = buildAgencyPaymentRows({
    id: "C-3",
    cantidadpersonas: 2,
    additionalcosts: { fee: 10, feeMode: "fixed" },
    itinerario: [{ numero: 1, servicios: [
      { id: 1, parentId: 1, typeService: "guias", precioServicio: 50, precioTotal: 100 },
      { id: 2, parentId: 2, typeService: "tickets", precioServicio: 25, precioTotal: 50 },
    ] }],
  });
  const commission = rows.reduce((sum, row) => sum + row.commissionAmount, 0);
  assert.equal(Math.round(commission * 100) / 100, 20);
});


test("file collection counts only commercial PagoCotizacion income and converts PEN to USD", () => {
  const summary = summarizeFileCollection({
    voucherCode: "VEN-001",
    voucherVentaId: 55,
    quoteTotal: 100,
    movements: [
      {
        tipo_movimiento: "ingreso",
        voucher_code: "VEN-001",
        moneda: "USD",
        monto: 40,
        contexto_pago: { tipo: "PagoCotizacion" },
      },
      {
        tipo_movimiento: "ingreso",
        referencia_voucher_venta: "55",
        moneda: "PEN",
        monto: 120,
        contexto_pago: { tipo: "PagoCotizacion", conversion: { tipo_cambio: 4 } },
      },
      {
        tipo_movimiento: "egreso",
        voucher_code: "VEN-001",
        moneda: "USD",
        monto: 20,
        contexto_pago: { tipo: "LiquidacionServicioProveedor" },
      },
    ],
  });

  assert.equal(summary.paid, 70);
  assert.equal(summary.remaining, 30);
  assert.equal(summary.status, "partial");
});

test("agency report reproduces quotation fee per service from the screenshot case", () => {
  const rows = buildAgencyPaymentRows({
    id: "C-FEE-SCREENSHOT",
    cantidadpersonas: 3,
    additionalcosts: {
      operationalCosts: 0,
      operationalMode: "percentage",
      fee: 25,
      feeMode: "percentage",
      extraFee: 0,
    },
    itinerario: [{ numero: 1, servicios: [
      {
        id: 101,
        parentId: 10,
        typeService: "transportes",
        precioServicio: 85,
        precioTotal: 85,
        precioAdultoDividido: true,
        moneda: "USD",
        beneficiariosAdultos: [
          { id: "adult:0:1" },
          { id: "adult:1:adult-1" },
          { id: "adult:2:adult-2" },
        ],
      },
    ] }],
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].quotedTotal, 85);
  assert.equal(rows[0].quotedUnit, 28.33);
  assert.equal(rows[0].commercialBaseTotal, 84.99);
  assert.equal(rows[0].commissionPerPerson, 7.08);
  assert.equal(rows[0].commissionAmount, 21.24);
  assert.equal(rows[0].exactUnitWithCommission, 35.41);
  assert.equal(rows[0].exactTotalWithCommission, 106.23);
  assert.equal(rows[0].unitWithCommission, 36);
  assert.equal(rows[0].totalWithCommission, 108);
  assert.equal(rows[0].displayQuotedUnit, 29);
  assert.equal(rows[0].displayCommissionPerPerson, 7);
  assert.equal(rows[0].displayQuotedUnit + rows[0].displayCommissionPerPerson, 36);
});

test("administrative percentage and fee percentage both use the same service base", () => {
  const rows = buildAgencyPaymentRows({
    id: "C-ADMIN-FEE",
    cantidadpersonas: 2,
    additionalcosts: {
      operationalCosts: 10,
      operationalMode: "percentage",
      fee: 25,
      feeMode: "percentage",
      extraFee: 0,
    },
    itinerario: [{ numero: 1, servicios: [
      {
        id: 201,
        parentId: 20,
        typeService: "guias",
        precioServicio: 50,
        precioTotal: 100,
        moneda: "USD",
        beneficiariosAdultos: [{ id: "adult-1" }, { id: "adult-2" }],
      },
    ] }],
  });

  assert.equal(rows[0].quotedUnit, 50);
  assert.equal(rows[0].administrativePerPerson, 5);
  assert.equal(rows[0].commissionPerPerson, 12.5);
  assert.equal(rows[0].additionalPerPerson, 17.5);
  assert.equal(rows[0].exactUnitWithCommission, 67.5);
  assert.equal(rows[0].exactTotalWithCommission, 135);
  assert.equal(rows[0].unitWithCommission, 68);
  assert.equal(rows[0].totalWithCommission, 136);
  assert.equal(rows[0].displayQuotedUnit, 50);
  assert.equal(rows[0].displayAdministrativePerPerson, 5);
  assert.equal(rows[0].displayCommissionPerPerson, 13);
});

test("hotel with a Peruvian beneficiary applies IGV before administrative percentage and fee", () => {
  const rows = buildAgencyPaymentRows({
    id: "C-HOTEL-PE",
    cantidadpersonas: 2,
    peopleDetails: {
      adults: [
        { passenger_key: "adult-1", nacionalidad: "Perú" },
        { passenger_key: "adult-2", nacionalidad: "Chile" },
      ],
      children: [],
    },
    additionalcosts: {
      operationalCosts: 10,
      operationalMode: "percentage",
      fee: 20,
      feeMode: "percentage",
      extraFee: 0,
    },
    itinerario: [{ numero: 1, servicios: [
      {
        id: 301,
        parentId: 30,
        typeService: "hotel",
        precioServicio: 100,
        precioTotal: 100,
        precioAdultoDividido: true,
        moneda: "USD",
        beneficiariosAdultos: [{ id: "adult-1" }, { id: "adult-2" }],
        childService: { tipo_habitacion: "Doble" },
      },
    ] }],
  });

  assert.equal(rows[0].hasIgv, true);
  assert.equal(rows[0].igvAmount, 18);
  assert.equal(rows[0].quotedTotal, 118);
  assert.equal(rows[0].quotedUnit, 59);
  assert.equal(rows[0].administrativePerPerson, 5.9);
  assert.equal(rows[0].commissionPerPerson, 11.8);
  assert.equal(rows[0].exactUnitWithCommission, 76.7);
  assert.equal(rows[0].exactTotalWithCommission, 153.4);
  assert.equal(rows[0].unitWithCommission, 77);
  assert.equal(rows[0].totalWithCommission, 154);
  assert.equal(rows[0].displayQuotedUnit, 59);
  assert.equal(rows[0].displayAdministrativePerPerson, 6);
  assert.equal(rows[0].displayCommissionPerPerson, 12);
  assert.equal(rows[0].displayIgvPerPerson, 9);
});

test("external itinerary remains without fee or administrative costs like ExportVentaJpg", () => {
  const rows = buildAgencyPaymentRows({
    id: "C-EXTERNAL-NO-FEE",
    cantidadpersonas: 2,
    additionalcosts: {
      operationalCosts: 10,
      operationalMode: "percentage",
      fee: 25,
      feeMode: "percentage",
      extraFee: 5,
    },
    itinerario_externo: [{ numero: 1, servicios: [
      {
        id: 401,
        parentId: 40,
        typeService: "externo",
        precioServicio: 40,
        precioTotal: 80,
        moneda: "USD",
        beneficiariosAdultos: [{ id: "adult-1" }, { id: "adult-2" }],
      },
    ] }],
  });

  assert.equal(rows[0].daySource, "external");
  assert.equal(rows[0].quotedUnit, 40);
  assert.equal(rows[0].administrativeAmount, 0);
  assert.equal(rows[0].commissionAmount, 0);
  assert.equal(rows[0].extraAmount, 0);
  assert.equal(rows[0].unitWithCommission, 40);
  assert.equal(rows[0].totalWithCommission, 80);
});


test("integer service prices reconcile to total_final without inflating independent ceilings", () => {
  const rows = buildAgencyPaymentRows({
    id: "C-ROUND-RECONCILE",
    cantidadpersonas: 2,
    total_final: 62,
    additionalcosts: {},
    itinerario: [{ numero: 1, servicios: [
      {
        id: 501,
        parentId: 50,
        typeService: "guias",
        precioTotal: 21.6,
        beneficiariosAdultos: [{ id: "adult-1" }, { id: "adult-2" }],
      },
      {
        id: 502,
        parentId: 51,
        typeService: "tickets",
        precioTotal: 40.4,
        beneficiariosAdultos: [{ id: "adult-1" }, { id: "adult-2" }],
      },
    ] }],
  });

  assert.deepEqual(rows.map((row) => row.exactUnitWithCommission), [10.8, 20.2]);
  // Ceil independiente daría 11*2 + 21*2 = 64 y sobrecobraría el file.
  assert.deepEqual(rows.map((row) => row.unitWithCommission), [11, 20]);
  assert.deepEqual(rows.map((row) => row.totalWithCommission), [22, 40]);
  assert.equal(rows.reduce((sum, row) => sum + row.totalWithCommission, 0), 62);
  assert.ok(rows.every((row) => Number.isInteger(row.unitWithCommission)));
  assert.ok(rows.every((row) => Number.isInteger(row.totalWithCommission)));
  assert.ok(rows.every((row) => row.unitWithCommission * row.pax === row.totalWithCommission));
});

test("CSV persistence semantics keep fee-applied commercial amount in Venso provider report", () => {
  const quote = {
    id: "COT260825-928",
    cantidadpersonas: 3,
    total_final: 108,
    precio_it_adulto: 28.33,
    additionalcosts: {
      fee: "25",
      feeMode: "percentage",
      operationalCosts: "0",
      operationalMode: "fixed",
      extraFee: 0,
      applyFeeToChildren: true,
    },
    itinerario: [
      {
        id: 10,
        numero: 1,
        servicios: [
          {
            id: 12,
            dia_id: 10,
            tipo_servicio: "transportes",
            parent_id: 9301001,
            child_id: 9401003,
            moneda: "dolares",
            precio_servicio: 85,
            precio_total: 85,
            precio_adulto_dividido: true,
            beneficiarios_adultos: [
              { id: "adult:0:1" },
              { id: "adult:1:adult-1" },
              { id: "adult:2:adult-2" },
            ],
            beneficiarios_ninos: [],
            parentService: { nombre_transporte: "Movilidad Andina Demo VENSO" },
            childService: { nombre: "Cusco - Ollantaytambo" },
          },
        ],
      },
    ],
  };

  const rows = buildAgencyPaymentRows(quote, { id: 1, is_primary: true });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].quotedTotal, 85);
  assert.equal(rows[0].quotedUnit, 28.33);
  assert.equal(rows[0].commissionPerPerson, 7.08);
  assert.equal(rows[0].exactUnitWithCommission, 35.41);
  assert.equal(rows[0].exactTotalWithCommission, 106.23);
  assert.equal(rows[0].unitWithCommission, 36);
  assert.equal(rows[0].totalWithCommission, 108);

  const groups = buildProviderPaymentGroups(
    quote,
    { id: 1, name: "Venso Tours", is_primary: true },
    [],
  );
  assert.equal(groups.length, 1);
  assert.equal(groups[0].rows[0].quotedTotal, 85);
  assert.equal(groups[0].rows[0].exactTotalWithCommission, 106.23);
  assert.equal(groups[0].rows[0].totalWithCommission, 108);
  assert.equal(groups[0].totals.dolares.supplier, 85);
  assert.equal(groups[0].totals.dolares.commercial, 108);
  assert.equal(groups[0].status, "unrequested");
  // total_final=108 is authoritative: US$36 rounded per pax × 3 pax.
  assert.equal(groups[0].totals.dolares.commercial, quote.total_final);
});

test("Venso provider payment status still reconciles against supplier amount, not commercial fee", () => {
  const quote = {
    id: "COT-PAID",
    cantidadpersonas: 3,
    additionalcosts: { fee: 25, feeMode: "percentage" },
    itinerario: [{
      numero: 1,
      servicios: [{
        id: 12,
        parentId: 9301001,
        typeService: "transportes",
        precioServicio: 85,
        precioTotal: 85,
        precioAdultoDividido: true,
        beneficiariosAdultos: [{ id: "adult:1" }, { id: "adult:2" }, { id: "adult:3" }],
      }],
    }],
  };

  const groups = buildProviderPaymentGroups(
    quote,
    { id: 1, is_primary: true },
    [{
      cotizacion_id: "COT-PAID",
      itinerario_servicio_id: 12,
      amount: 85,
      status: "paid",
    }],
  );

  assert.equal(groups[0].rows[0].exactTotalWithCommission, 106.23);
  assert.equal(groups[0].totals.dolares.commercial, 108);
  assert.equal(groups[0].totals.dolares.supplier, 85);
  assert.equal(groups[0].totals.dolares.paid, 85);
  assert.equal(groups[0].totals.dolares.pending, 0);
  assert.equal(groups[0].status, "paid");
});
