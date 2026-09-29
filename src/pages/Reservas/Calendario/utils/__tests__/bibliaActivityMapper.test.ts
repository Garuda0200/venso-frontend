import assert from "node:assert/strict";
import test from "node:test";
import {
  BIBLIA_EXCEL_PALETTE,
  BIBLIA_SCHEMA_VERSION,
  buildBibliaActivitiesFromSnapshots,
  buildStandaloneBibliaRecord,
  filterBibliaActivities,
  getBibliaEndorseOptions,
  getBibliaQuotationLinkLabel,
  getBibliaReservationOptions,
  getBibliaTrainProviderOptions,
  getBibliaTransportOptions,
  hasBibliaActiveFilters,
  isQuotationBibliaMaterialized,
  materializeBibliaOverride,
  materializeQuotationBibliaRecords,
  matchesBibliaQuotationLinkQuery,
  matchesBibliaTrainProvider,
  matchesBibliaTransport,
  resolveBibliaVoucherTarget,
} from "../bibliaActivityMapper";
import { BIBLIA_SHEET_COLUMNS, buildBibliaDayExportMatrix, buildBibliaDayJpegFilename, renderBibliaDayJpegBlob } from "../bibliaDayJpegExport";
import {
  buildBibliaDayExcelFilename,
  buildBibliaMonthExcelFilename,
  createBibliaDayExcelWorkbook,
  createBibliaMonthExcelWorkbook,
} from "../bibliaDayExcelExport";
import { buildBibliaTrainOptions, compactBibliaTrainText, formatBibliaTrainTime, getHistoricalBibliaTrainOptions } from "../bibliaTrainCatalog";

const quotation: Record<string, any> = {
  id: "COT-1",
  fechainicio: "2026-06-23",
  titulo: "DIEGO CARO",
  packagetype: "compartido",
  idioma: "es",
  agency_id: 7,
  agency_name: "Villacré Mundo Viajes",
  creator_name: "Sarela Quispe Huamán",
  source_voucher: { url: "source.pdf" },
  voucher_reserva_media: { url: "reservation.pdf", mediaAssetId: "m1" },
  passengers: [
    { nombres: "Diego", apellidos: "Caro", nacionalidad: "España" },
    { nombres: "Ana", apellidos: "Caro", nacionalidad: "España" },
    { nombres: "Leo", apellidos: "Caro", nacionalidad: "España" },
  ],
  itinerario: [
    {
      id: 10,
      numero: 1,
      titulo: "VALLE SAGRADO",
      servicios: [
        {
          id: 101, typeService: "transportes",
          parentService: { nombre_transporte: "TRANSPORTE COTIZADO" },
          assignedParentService: { nombre_transporte: "TRANSPORTE ASIGNADO" },
        },
        { id: 102, typeService: "guias", parentService: { nombre: "GUIA COTIZADO" } },
        { id: 103, typeService: "tickets", childService: { entrada: "BOLETO TURISTICO" } },
        { id: 104, typeService: "hoteles", parentService: { nombre_hotel: "HOTEL CUSCO" } },
      ],
    },
    {
      id: 11,
      numero: 2,
      titulo: "MACHU PICCHU",
      servicios: [
        { id: 105, typeService: "hoteles", parentService: { nombre_hotel: "HOTEL MAPI AGUAS CALIENTES" } },
        { id: 106, typeService: "restaurantes", childService: { nombre: "RESTAURANTE MAPI" } },
      ],
    },
  ],
  itinerario_externo: [
    {
      id: 20,
      numero: 1,
      servicios: [
        {
          id: 201, typeService: "trenes", parentService: { nombre_empresa: "PERURAIL" },
          childService: { tipo_tren: "EXPEDITION", lugar_salida: "OLLANTAYTAMBO", lugar_destino: "MACHU PICCHU" },
        },
        { id: 202, typeService: "endoses", parentService: { nombre_agencia: "AGENCIA ENDOSADA" } },
      ],
    },
    {
      id: 21,
      numero: 2,
      servicios: [
        {
          id: 203, typeService: "trenes", parentService: { nombre_empresa: "PERURAIL" },
          childService: { tipo_tren: "EXPEDITION RETORNO", lugar_salida: "MACHU PICCHU", lugar_destino: "OLLANTAYTAMBO" },
        },
      ],
    },
  ],
  biblia_actividades: [],
};

const records = materializeQuotationBibliaRecords(quotation);
assert.equal(records.length, 2, "debe existir exactamente una fila por día del file, no una por servicio");
assert.ok(records.every((record) => record.schemaVersion === BIBLIA_SCHEMA_VERSION));
assert.equal(records[0].transport, "TRANSPORTE COTIZADO", "debe priorizar el servicio cotizado sobre assigned*");
assert.equal(records[0].guide, "GUIA COTIZADO");
assert.match(records[0].trainOutbound, /PERURAIL/i);
assert.match(records[0].trainOutbound, /OLLANTA → MAPI/);
assert.equal(records[0].endorse, "AGENCIA ENDOSADA");
assert.equal(records[0].tickets, "BOLETO TURISTICO", "los ingresos/tickets se completan desde el servicio cotizado");
assert.equal(records[0].agency, "Villacré Mundo Viajes", "la agencia viene automáticamente de la cotización");
assert.match(records[1].hotelMapi, /HOTEL MAPI/i);
assert.match(records[1].trainReturn, /PERURAIL/i);
assert.match(records[1].trainReturn, /MAPI → OLLANTA/);
assert.equal(resolveBibliaVoucherTarget(quotation).kind, "reservation", "voucher-media de reserva debe tener prioridad");

const recordsWithFileCode = materializeQuotationBibliaRecords({ ...quotation, voucher_code: "DK0450C" });
assert.equal(recordsWithFileCode[0].file, "DK0450C", "la Biblia muestra el código de file de la cotización, no su título");

const snapshots = buildBibliaActivitiesFromSnapshots([{ ...quotation, biblia_actividades: records }], []);
assert.equal(snapshots.length, 2);
assert.equal(snapshots[0].sourceServiceId, "");
assert.equal(snapshots[0].dayNumber, 1);
assert.equal(snapshots[0].sourceVoucherMedia?.url, "reservation.pdf");
assert.equal(isQuotationBibliaMaterialized({ ...quotation, biblia_actividades: records }), true);

const edited = materializeBibliaOverride(snapshots[0], { transport: "TRANSPORTE OPERATIVO", color: "#FFE599" });
assert.equal(edited.schemaVersion, BIBLIA_SCHEMA_VERSION);
assert.equal(edited.transport, "TRANSPORTE OPERATIVO");
assert.equal(edited.color, "#FFE599");
assert.equal(edited.dayNumber, 1);

const legacy = {
  ...quotation,
  biblia_actividades: [
    { schemaVersion: 2, id: "service:101", dateKey: "2026-06-23", transport: "TRANSPORTE EDITADO", observations: "CAMBIO" },
    { schemaVersion: 2, id: "manual:2", dateKey: "2026-06-25", excursion: "DIA EXTRA DESDE RESERVAS", observations: "NO PERDER" },
  ],
};
const migrated = materializeQuotationBibliaRecords(legacy);
assert.equal(migrated.length, 3, "una fecha legacy fuera del itinerario debe conservarse como día del file");
assert.equal(migrated[0].transport, "TRANSPORTE EDITADO");
assert.ok(migrated.some((row) => row.dateKey === "2026-06-25" && row.observations === "NO PERDER"));

const v3Snapshot = {
  ...quotation,
  biblia_actividades: records.map((record) => ({ ...record, schemaVersion: 3, tickets: "—" })),
};
const migratedV3 = materializeQuotationBibliaRecords(v3Snapshot);
assert.ok(migratedV3.every((record) => record.schemaVersion === BIBLIA_SCHEMA_VERSION));
assert.equal(migratedV3[0].tickets, "BOLETO TURISTICO", "la transición v3 conserva ediciones y completa ingresos antes vacíos");
assert.equal(isQuotationBibliaMaterialized(v3Snapshot), false, "v3 se rematerializa una vez para completar los campos operativos");

const deletedQuote = {
  ...quotation,
  biblia_actividades: [
    { ...records[0], isDeleted: true, deletedAt: "2026-08-27T10:00:00Z" },
    records[1],
  ],
};
const keptDeleted = materializeQuotationBibliaRecords(deletedQuote);
assert.equal(keptDeleted.length, 2, "materializar no debe eliminar ni duplicar un soft-delete");
assert.equal(keptDeleted.filter((row) => row.isDeleted).length, 1);
const renderedDeleted = buildBibliaActivitiesFromSnapshots([deletedQuote], []);
assert.equal(renderedDeleted.length, 1, "un soft-delete no se renderiza");

const standalone = buildBibliaActivitiesFromSnapshots([], [{
  id: "standalone-1", cotizacion_id: null, is_active: true,
  actividad: {
    schemaVersion: BIBLIA_SCHEMA_VERSION, id: "standalone-entry:1", dayNumber: 1, order: 1,
    dateKey: "2026-06-26", excursion: "OPERACION SIN COTIZACION", color: "#FF9900",
  },
}]);
assert.equal(standalone.length, 1);
assert.equal(standalone[0].sourceType, "standalone");

const linkedStandalone = buildBibliaActivitiesFromSnapshots([{ ...quotation, biblia_actividades: records }], [{
  id: "standalone-linked", cotizacion_id: "COT-1", is_active: true,
  actividad: {
    schemaVersion: BIBLIA_SCHEMA_VERSION, id: "standalone-entry:linked", dayNumber: 1, order: 3,
    dateKey: "2026-06-26", excursion: "OPERACION VINCULADA", color: "#CFE2F3",
    quotationOrigin: "linked", syncQuotation: false,
  },
}]);
assert.equal(linkedStandalone.length, 3);
const linkedRow = linkedStandalone.find((item) => item.standaloneRecordId === "standalone-linked");
assert.equal(linkedRow?.sourceQuotationId, "COT-1");
assert.equal(linkedRow?.sourceVoucherMedia?.url, "reservation.pdf", "un vínculo debe heredar el voucher visible de la cotización");



const quickRecord = buildStandaloneBibliaRecord({ dateKey: "2026-08-31", order: 4, localId: "quick-1" });
assert.equal(quickRecord.schemaVersion, BIBLIA_SCHEMA_VERSION);
assert.equal(quickRecord.id, "standalone-entry:quick-1");
assert.equal(quickRecord.dateKey, "2026-08-31");
assert.equal(quickRecord.order, 4);
assert.equal(quickRecord.quotationOrigin, "standalone");
assert.equal(quickRecord.syncQuotation, false);
assert.equal(quickRecord.transport, "—");

const transportActivities = [
  ...snapshots,
  { ...snapshots[0], id: "t2", transport: "TRANSPORTE OPERATIVO" },
  { ...snapshots[0], id: "t3", transport: "—" },
];
const transportOptions = getBibliaTransportOptions(transportActivities);
assert.ok(transportOptions.includes("TRANSPORTE COTIZADO"));
assert.ok(transportOptions.includes("TRANSPORTE OPERATIVO"));
assert.equal(transportOptions.includes("—"), false, "el filtro solo debe listar transportes reales");
assert.equal(matchesBibliaTransport(transportActivities[0], "TRANSPORTE COTIZADO"), true);
assert.equal(matchesBibliaTransport(transportActivities[0], "TRANSPORTE OPERATIVO"), false);
assert.equal(matchesBibliaTransport(transportActivities[0], "all"), true);

const filteredByTickets = filterBibliaActivities(snapshots, { search: "boleto turistico" });
assert.equal(filteredByTickets.length, 1, "la búsqueda cubre ingresos/tickets y no deja vacía la vista diaria cuando hay coincidencia");
assert.equal(filterBibliaActivities(snapshots, { agency: "villacré mundo viajes", transport: "TRANSPORTE COTIZADO" }).length, 1);
assert.equal(filterBibliaActivities(snapshots, { serviceMode: "sic", language: "español" }).length, 2, "los filtros comparan sin depender de mayúsculas o acentos");
assert.equal(hasBibliaActiveFilters({ search: "boleto" }), true);
assert.equal(hasBibliaActiveFilters({}), false);

const operationalFilterActivities = [
  snapshots[0],
  {
    ...snapshots[1],
    id: "operational-filter-2",
    reservationName: "MARIA FLORES",
    endorse: "ENDOSE SUR",
    trainOutbound: "Inca Rail · Voyager · OLLANTA 08:00 → MAPI 09:30",
    trainReturn: "—",
  },
];
assert.deepEqual(getBibliaEndorseOptions(operationalFilterActivities), ["AGENCIA ENDOSADA", "ENDOSE SUR"]);
assert.deepEqual(getBibliaReservationOptions(operationalFilterActivities), ["Diego Caro", "MARIA FLORES"]);
assert.deepEqual(getBibliaTrainProviderOptions(operationalFilterActivities), ["Inca Rail", "PERURAIL"]);
assert.equal(matchesBibliaTrainProvider(operationalFilterActivities[1], "inca rail"), true);
assert.equal(matchesBibliaTrainProvider(operationalFilterActivities[1], "PERURAIL"), false);
assert.equal(filterBibliaActivities(operationalFilterActivities, { endorse: "ENDOSE SUR" }).length, 1);
assert.equal(filterBibliaActivities(operationalFilterActivities, { reservationName: "maria flores" }).length, 1);
assert.equal(filterBibliaActivities(operationalFilterActivities, { trainProvider: "PERURAIL" }).length, 1, "el filtro de tren usa exclusivamente el proveedor");
assert.equal(hasBibliaActiveFilters({ trainProvider: "PERURAIL" }), true);

const quotationWithVoucher = { ...quotation, source_sales_voucher_code: "V-2026-0098" };
assert.match(getBibliaQuotationLinkLabel(quotationWithVoucher), /V-2026-0098/);
assert.equal(matchesBibliaQuotationLinkQuery(quotationWithVoucher, "COT-1"), true);
assert.equal(matchesBibliaQuotationLinkQuery(quotationWithVoucher, "DIEGO CARO"), true);
assert.equal(matchesBibliaQuotationLinkQuery(quotationWithVoucher, "V-2026-0098"), true);
assert.equal(matchesBibliaQuotationLinkQuery(quotationWithVoucher, "NO EXISTE"), false);

assert.ok(BIBLIA_EXCEL_PALETTE.includes("#CFE2F3"));
assert.ok(BIBLIA_EXCEL_PALETTE.includes("#FF9900"));


const catalogTrains = [
  { id_tren: 1, nombre_empresa: "Peru Rail", mostrar_en_servicepicker: true },
  { id_tren: 2, nombre_empresa: "Inca Rail", mostrar_en_servicepicker: true },
];
const catalogWagons = [
  { id_vagon: 81, id_tren: 1, tipo_tren: "EXPEDITION 81", lugar_salida: "Wanchaq", lugar_destino: "Machupicchu", hora_salida: "03:20:00", hora_llegada: "07:40:00", estado: "disponible", mostrar_en_servicepicker: true },
  { id_vagon: 301, id_tren: 1, tipo_tren: "VISTADOME 301", lugar_salida: "Ollanta", lugar_destino: "Machupicchu", hora_salida: "07:05:00", hora_llegada: "08:27:00", estado: "disponible", mostrar_en_servicepicker: true },
  { id_vagon: 504, id_tren: 1, tipo_tren: "VISTADOME 504", lugar_salida: "Machupicchu", lugar_destino: "Wanchaq", hora_salida: "16:22:00", hora_llegada: "21:20:00", estado: "disponible", mostrar_en_servicepicker: true },
  { id_vagon: 999, id_tren: 2, tipo_tren: "NO MOSTRAR", lugar_salida: "Ollanta", lugar_destino: "Machupicchu", hora_salida: "10:00:00", hora_llegada: "12:00:00", estado: "disponible", mostrar_en_servicepicker: false },
];
const outboundTrainOptions = buildBibliaTrainOptions(catalogTrains, catalogWagons, "outbound");
const returnTrainOptions = buildBibliaTrainOptions(catalogTrains, catalogWagons, "return");
assert.match(outboundTrainOptions[0], /Peru Rail · EXPEDITION 81 · Wanchaq 03:20 → MAPI 07:40/);
assert.match(returnTrainOptions[0], /Peru Rail · VISTADOME 504 · MAPI 16:22 → Wanchaq 21:20/);
assert.equal(outboundTrainOptions.some((item) => item.includes("NO MOSTRAR")), false);
assert.equal(formatBibliaTrainTime("07:05:00"), "07:05");
assert.equal(compactBibliaTrainText("Machu Picchu → Ollantaytambo"), "MAPI → OLLANTA");
assert.equal(compactBibliaTrainText("Wanchaq → Poroy"), "Wanchaq → Poroy");

const historicalOutbound = getHistoricalBibliaTrainOptions([
  { ...snapshots[0], trainOutbound: "EXPEDITION 75 OLLANTAYTAMBO 19:04 MACHU PICCHU 20:45" },
  { ...snapshots[0], id: "historical-2", trainOutbound: "—" },
] as any, "trainOutbound");
assert.deepEqual(historicalOutbound, ["EXPEDITION 75 OLLANTA 19:04 MAPI 20:45"]);

const jpegMatrix = buildBibliaDayExportMatrix([
  { ...snapshots[0], trainOutbound: "Peru Rail · EXPEDITION 81 · Wanchaq 03:20 → Machupicchu 07:40" },
] as any);
assert.equal(BIBLIA_SHEET_COLUMNS.length, 23, "la descarga diaria debe conservar las 23 columnas operativas");
assert.equal(jpegMatrix.headers.length, 23);
assert.equal(jpegMatrix.headers.includes("ACCIONES"), false, "el JPG no debe incluir botones/acciones");
assert.equal(jpegMatrix.rows[0].length, 23);
assert.equal(jpegMatrix.rows[0][4], "—", "las nacionalidades detalladas no se exportan");
assert.ok(jpegMatrix.rows[0].some((value) => value.includes("EXPEDITION 81")));
assert.ok(jpegMatrix.rows[0].some((value) => value.includes("MAPI 07:40")));
assert.equal(buildBibliaDayJpegFilename("2026-09-01"), "biblia_actividades_2026-09-01.jpg");
assert.equal(buildBibliaDayExcelFilename("2026-09-01"), "biblia_actividades_2026-09-01.xlsx");

test("Biblia Excel conserva las 23 columnas, registros, colores por celda y texto enriquecido", async () => {
  const activity = {
    ...snapshots[0],
    dateKey: "2026-09-01",
    color: "#FF0000",
    pax: 3,
    sourceExcel: {
      cellColors: { agency: "#00FF00" },
      richText: {
        excursion: [
          { text: "MACHU ", font: { bold: true, color: "#FF0000" } },
          { text: "PICCHU", font: { italic: true, color: "#0000FF" } },
        ],
      },
    },
  } as any;
  const { workbook, worksheet, filename } = createBibliaDayExcelWorkbook({
    date: new Date(2026, 8, 1),
    activities: [activity],
  });

  assert.equal(filename, "biblia_actividades_2026-09-01.xlsx");
  assert.equal(worksheet.columnCount, 23);
  assert.equal(worksheet.getRow(3).getCell(1).value, "FECHA");
  assert.equal(worksheet.getRow(4).getCell(4).value, "3");
  assert.equal((worksheet.getRow(4).getCell(1).fill as any).fgColor.argb, "FFFF0000");
  assert.equal((worksheet.getRow(4).getCell(1).font as any).color.argb, "FFFFFFFF");
  assert.equal((worksheet.getRow(4).getCell(23).fill as any).fgColor.argb, "FF00FF00");
  assert.deepEqual((worksheet.getRow(4).getCell(9).value as any).richText.map((run: any) => run.text), ["MACHU ", "PICCHU"]);
  assert.equal(((worksheet.getRow(4).getCell(9).value as any).richText[0].font.color as any).argb, "FFFF0000");
  assert.equal(worksheet.autoFilter?.from, "A3");
  assert.equal(worksheet.autoFilter?.to, "W4");

  const buffer = await workbook.xlsx.writeBuffer();
  assert.ok(buffer.byteLength > 0, "debe generar un archivo XLSX descargable");
});

test("Biblia Excel mensual crea una pestaña diaria con el mismo formato y colores", async () => {
  const firstDay = { ...snapshots[0], date: new Date(2026, 8, 1), dateKey: "2026-09-01", color: "#FF0000" } as any;
  const secondDay = { ...snapshots[1], date: new Date(2026, 8, 2), dateKey: "2026-09-02", color: "#00FF00" } as any;
  const { workbook, worksheets, filename } = createBibliaMonthExcelWorkbook({
    month: new Date(2026, 8, 1),
    activities: [secondDay, firstDay],
  });

  assert.equal(filename, buildBibliaMonthExcelFilename(new Date(2026, 8, 1)));
  assert.equal(filename, "biblia_actividades_2026-09.xlsx");
  assert.equal(worksheets.length, 2);
  assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), ["Biblia 2026-09-01", "Biblia 2026-09-02"]);
  assert.equal(workbook.worksheets[0].getRow(3).getCell(1).value, "FECHA");
  assert.equal((workbook.worksheets[1].getRow(4).getCell(1).fill as any).fgColor.argb, "FF00FF00");
  assert.equal(workbook.worksheets[0].autoFilter?.to, "W4");

  const buffer = await workbook.xlsx.writeBuffer();
  assert.ok(buffer.byteLength > 0, "el libro mensual debe ser descargable");
});

test("Biblia JPG renders directly to a JPEG blob without DOM table capture", async () => {
  const previousDocument = (globalThis as any).document;
  let canvasCount = 0;
  const context = {
    font: "", fillStyle: "", strokeStyle: "", lineWidth: 1,
    measureText: (value: unknown) => ({ width: String(value ?? "").length * 9 }),
    fillRect: () => undefined,
    fillText: () => undefined,
    strokeRect: () => undefined,
  };

  (globalThis as any).document = {
    createElement(tag: string) {
      assert.equal(tag, "canvas");
      canvasCount += 1;
      return {
        width: 0,
        height: 0,
        getContext: () => context,
        toBlob: (callback: (blob: Blob | null) => void, type: string) =>
          callback(new Blob(["jpeg"], { type })),
      };
    },
  };

  try {
    const result = await renderBibliaDayJpegBlob({
      date: new Date(2026, 8, 1),
      activities: [{ ...snapshots[0], dateKey: "2026-09-01" } as any],
    });
    assert.equal(result.blob.type, "image/jpeg");
    assert.ok(result.blob.size > 0);
    assert.ok(result.width > 4000, "debe contener las 23 columnas en una sola imagen horizontal");
    assert.ok(result.height > 200);
    assert.equal(canvasCount, 2, "usa canvas directo: uno para medir y otro para renderizar");
  } finally {
    (globalThis as any).document = previousDocument;
  }
});

console.log("bibliaActivityMapper.test.ts: PASS");
