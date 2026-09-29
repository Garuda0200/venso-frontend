import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const calendarioSource = readFileSync(
  resolve(process.cwd(), "src/pages/Reservas/Calendario/Calendario.tsx"),
  "utf8",
);
const sheetStart = calendarioSource.indexOf("const renderDaySheet =");
const actionsStart = calendarioSource.indexOf('className="biblia-sheet-table__actions"', sheetStart);
const sheetEnd = calendarioSource.indexOf("const renderDay =", actionsStart);

assert.ok(sheetStart >= 0 && actionsStart > sheetStart && sheetEnd > actionsStart);
const fileCellsSource = calendarioSource.slice(sheetStart, actionsStart);
const actionsSource = calendarioSource.slice(actionsStart, sheetEnd);

assert.match(
  fileCellsSource,
  /field === "file"\s*&&\s*activity\.sourceType === "standalone"\s*&&\s*!activity\.sourceQuotationId[\s\S]*?biblia-file-cell[\s\S]*?renderQuotationLinkPopover\(activity\)/,
  "el gestor debe vivir en FILE únicamente mientras la fila independiente no esté vinculada",
);
assert.doesNotMatch(
  actionsSource,
  /renderQuotationLinkPopover\(activity\)/,
  "la columna ACCIONES no debe volver a renderizar el gestor de vínculo",
);
assert.match(
  calendarioSource,
  /<MdLink\s*\/?>\s*<span>Vincular<\/span>/,
  "el botón conserva una etiqueta estable sin mostrar el ID de cotización",
);
assert.doesNotMatch(
  calendarioSource,
  /Dejar sin cotización|biblia-link-popover__unlink/,
  "una fila vinculada no debe ofrecer nuevamente el gestor ni la desvinculación",
);

for (const exportFile of ["bibliaDayExcelExport.ts", "bibliaDayJpegExport.ts"]) {
  const exportSource = readFileSync(
    resolve(process.cwd(), `src/pages/Reservas/Calendario/utils/${exportFile}`),
    "utf8",
  );
  assert.doesNotMatch(
    exportSource,
    /biblia-link|renderQuotationLinkPopover|Vincular file/,
    `${exportFile} debe exportar solo los datos de FILE, nunca controles de interfaz`,
  );
}

console.log("bibliaFileLinkPlacementSource.test.ts: OK");
