import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";
import { compactBibliaTransportText } from "../bibliaTransportDisplay";
import { buildBibliaActivitiesFromSnapshots, materializeBibliaOverride, materializeQuotationBibliaRecords } from "../bibliaActivityMapper";
import { BIBLIA_SHEET_COLUMNS, buildBibliaDayExportMatrix } from "../bibliaDayJpegExport";
import { createBibliaDayExcelWorkbook, createBibliaMonthExcelWorkbook } from "../bibliaDayExcelExport";

const quotation = () => ({
  id: "COT-TRANSPORT-DISPLAY", voucher_code: "TRANSPORT-DISPLAY", fechainicio: "2026-11-05", titulo: "Nombre de transporte",
  itinerario: [{ numero: 1, titulo: "Valle Sagrado", servicios: [
    { typeService: "transportes", parentService: { nombre_transporte: "Transportes Paul" },
      assignedParentService: { nombre_transporte: "Otro transporte asignado" },
      childService: { tipo_auto: "Camioneta", ruta: "Hotel - Estación Ollantaytambo" } },
    { typeService: "transportes", parentService: { nombre_transporte: "Marco" },
      childService: { tipo_auto: "Van", ruta: "Hotel - Aeropuerto" } },
  ] }], biblia_actividades: [],
});

const activities = () => {
  const quote = quotation();
  const records = materializeQuotationBibliaRecords(quote);
  return { quote, records, rows: buildBibliaActivitiesFromSnapshots([{ ...quote, biblia_actividades: records }]) };
};

test("el nombre del transporte es corto para selecciones explícitas y conserva nombres escritos", () => {
  assert.equal(compactBibliaTransportText("Transportes Paul · Hotel - Estación Ollantaytambo · Auto"), "Transportes Paul");
  assert.equal(compactBibliaTransportText("Paul · Hotel / Estación · Auto"), "Paul");
  assert.equal(compactBibliaTransportText("Paul / Venso · Ruta · Camioneta"), "Paul / Venso");
  assert.equal(compactBibliaTransportText("Paul · Ruta · Auto / Marco · Otra ruta · Van"), "Paul / Marco");
  assert.equal(compactBibliaTransportText("Paul · Ruta · Auto / Paul · Otra ruta · Van"), "Paul");
  for (const name of ["JONATHAN VENSO", "Paul / Marco", "Traslado por cuenta del pasajero", "Ruta - Proveedor", "Paul / Auto / Ruta sin identidad"]) {
    assert.equal(compactBibliaTransportText(name), name);
  }
  assert.equal(compactBibliaTransportText(null), "—");
  assert.equal(compactBibliaTransportText(" — "), "—");
});

test("las filas vinculadas derivan todos sus proveedores desde su día sin cambiar el contrato completo", () => {
  const { quote, records, rows } = activities();
  const before = JSON.stringify({ quote, records });
  const row = rows[0];
  assert.equal(row.transport, "Transportes Paul / Camioneta / Hotel - Estación Ollantaytambo / Marco / Van / Hotel - Aeropuerto");
  assert.equal(row.transportDisplayName, "Transportes Paul / Marco");
  assert.equal(compactBibliaTransportText(row.transport, row), "Transportes Paul / Marco");
  const saved = materializeBibliaOverride(row, { observations: "Nota del día" });
  assert.equal(saved.transport, row.transport);
  assert.equal("transportDisplayName" in saved, false);
  assert.equal(JSON.stringify({ quote, records }), before);
  assert.equal(quote.itinerario[0].servicios[0].childService.ruta, "Hotel - Estación Ollantaytambo");
});

test("el nombre transitorio no se reutiliza al cambiar transporte y nunca se recupera de un snapshot", () => {
  const { quote, records, rows } = activities();
  const row = rows[0];
  assert.equal(compactBibliaTransportText("Nuevo proveedor · Nueva ruta · Van", row), "Nuevo proveedor");
  assert.equal(compactBibliaTransportText("Proveedor manual", row), "Proveedor manual");
  const stored = { ...records[0], transport: "Proveedor operativo · Ruta · Auto", transportDisplayName: "Nombre obsoleto" };
  const reloaded = buildBibliaActivitiesFromSnapshots([{ ...quote, biblia_actividades: [stored] }])[0];
  assert.equal(compactBibliaTransportText(reloaded.transport, reloaded), "Proveedor operativo");
  assert.equal("transportDisplayName" in materializeBibliaOverride(reloaded), false);
});

test("los snapshots standalone vinculados también derivan el nombre del día y preservan el valor operativo", () => {
  const { quote, records } = activities();
  const source = { id: "transport-source", cotizacion_id: quote.id, actividad: { ...records[0], id: "transport-source", quotationOrigin: "linked" } };
  const before = JSON.stringify(source);
  const row = buildBibliaActivitiesFromSnapshots([quote], [source])[0];
  assert.equal(row.transportDisplayName, "Transportes Paul / Marco");
  assert.equal(compactBibliaTransportText(row.transport, row), "Transportes Paul / Marco");
  assert.equal(materializeBibliaOverride(row).transport, records[0].transport);
  assert.equal(JSON.stringify(source), before);
});

test("Excel de día y mes y matriz JPG usan solo proveedor aunque exista texto enriquecido de transporte", async () => {
  const { rows } = activities();
  const row = { ...rows[0], sourceExcel: { rowColor: "#E6B8AF", cellColors: { transport: "#D9EAD3" },
    richText: { transport: [{ text: rows[0].transport, font: { bold: true, color: "#000000" } }] } } };
  const before = JSON.stringify(row);
  const column = BIBLIA_SHEET_COLUMNS.findIndex(([field]) => field === "transport");
  assert.equal(buildBibliaDayExportMatrix([row]).rows[0][column], "Transportes Paul / Marco");
  const day = createBibliaDayExcelWorkbook({ date: row.date, activities: [row] });
  const month = createBibliaMonthExcelWorkbook({ month: row.date, activities: [row] });
  for (const workbook of [day.workbook, month.workbook]) {
    const restored = new ExcelJS.Workbook();
    await restored.xlsx.load(await workbook.xlsx.writeBuffer());
    const cell = restored.worksheets[0].getRow(4).getCell(column + 1);
    assert.equal(cell.value, "Transportes Paul / Marco");
    assert.equal((cell.fill as ExcelJS.FillPattern).fgColor?.argb, "FFD9EAD3");
  }
  assert.equal(JSON.stringify(row), before);
});

test("Excel conserva el texto multilínea completo y amplía la fila según su columna más estrecha", async () => {
  const { rows } = activities();
  const longText = "Jop Inversiones Quechua - Jaime\n" + Array.from({ length: 8 }, (_, index) => `Punto ${index + 1} de coordinación`).join("\n");
  const row = { ...rows[0], transport: longText, transportDisplayName: longText, observations: "", sourceExcel: null };
  const { workbook } = createBibliaDayExcelWorkbook({ date: row.date, activities: [row] });
  const restored = new ExcelJS.Workbook();
  await restored.xlsx.load(await workbook.xlsx.writeBuffer());
  const sheet = restored.worksheets[0];
  const column = BIBLIA_SHEET_COLUMNS.findIndex(([field]) => field === "transport") + 1;
  assert.equal(sheet.getRow(4).getCell(column).text, longText);
  assert.equal(sheet.getRow(4).getCell(column).alignment.wrapText, true);
  assert.ok(sheet.getRow(4).height >= 9 * 14 + 8, "la altura debe incluir cada línea, sin el tope previo de 72 puntos");
});