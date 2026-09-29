import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(
  resolve(process.cwd(), "src/pages/Reservas/Calendario/Calendario.tsx"),
  "utf8",
);
const stylesheet = readFileSync(
  resolve(process.cwd(), "src/pages/Reservas/Calendario/Calendario.scss"),
  "utf8",
);
const jpegExport = readFileSync(
  resolve(process.cwd(), "src/pages/Reservas/Calendario/utils/bibliaDayJpegExport.ts"),
  "utf8",
);
const excelExport = readFileSync(
  resolve(process.cwd(), "src/pages/Reservas/Calendario/utils/bibliaDayExcelExport.ts"),
  "utf8",
);
const responsiveMarker = "027 · Capa responsive canónica de la Biblia";
const responsiveStart = stylesheet.indexOf(responsiveMarker);
const tabulationMarker = "La Biblia mantiene la misma hoja operativa de escritorio";
const tabulationStart = stylesheet.indexOf(tabulationMarker);

assert.ok(responsiveStart >= 0, "la Biblia debe tener una única capa final que gobierne la responsividad");
assert.ok(tabulationStart >= 0, "la Biblia debe declarar explícitamente la tabulación compartida para móvil y escritorio");
const responsiveStyles = stylesheet.slice(responsiveStart);
const tabulationStyles = stylesheet.slice(tabulationStart, responsiveStart);

assert.match(
  source,
  /showMobileFilters[\s\S]*?aria-controls="biblia-operational-filters"/,
  "los filtros deben poder plegarse sin desaparecer para lectores de pantalla",
);
assert.match(
  source,
  /activeSelectFilterCount[\s\S]*?clearSelectFilters/,
  "el panel móvil debe mostrar filtros activos y permitir restablecerlos",
);
assert.match(
  source,
  /biblia-sheet-wrap" role="region" aria-label="Tabla completa de la Biblia de actividades\. Desliza horizontalmente para consultar todas las columnas\./,
  "la hoja responsive debe anunciar que conserva todas las columnas y se desplaza localmente",
);
assert.match(
  source,
  /<thead><tr>\{BIBLIA_SHEET_COLUMNS\.map[\s\S]*?BIBLIA_SHEET_COLUMNS\.map\(\(\[field, label\]\)/,
  "encabezado y filas deben usar la misma definición canónica de columnas",
);
assert.doesNotMatch(
  source,
  /data-mobile-secondary|biblia-mobile-details-toggle|is-mobile-expanded/,
  "móvil no debe ocultar columnas ni convertir la hoja en tarjetas expandibles",
);
assert.match(jpegExport, /BIBLIA_SHEET_COLUMNS/, "el JPG debe usar la misma definición de columnas de la hoja");
assert.match(excelExport, /BIBLIA_SHEET_COLUMNS/, "el Excel debe usar la misma definición de columnas de la hoja");
assert.doesNotMatch(
  `${jpegExport}\n${excelExport}`,
  /innerWidth|matchMedia|visualViewport|clientWidth|offsetWidth/,
  "las exportaciones no deben depender del viewport responsive",
);

assert.doesNotMatch(
  stylesheet,
  /min-width:\s*665px/,
  "el calendario mensual no debe forzar un lienzo horizontal fijo en móvil",
);
assert.match(
  responsiveStyles,
  /@media \(max-width: 680px\)[\s\S]*?\.biblia-month-shell[\s\S]*?overflow:\s*hidden[\s\S]*?\.biblia-month-day__events\s*\{\s*display:\s*none/,
  "el mes móvil debe conservar siete columnas compactas y delegar el detalle a la vista diaria",
);
assert.match(
  responsiveStyles,
  /@media \(max-width: 900px\)[\s\S]*?\.biblia-filterbar__mobile-toggle[\s\S]*?\.biblia-filterbar__selects[\s\S]*?&\.is-open/,
  "tablet y móvil deben usar filtros plegables en vez de una fila desbordada",
);
assert.match(
  tabulationStyles,
  /\.biblia-sheet-wrap[\s\S]*?max-height:\s*min\(64dvh, 560px\)[\s\S]*?overflow:\s*auto[\s\S]*?scrollbar-gutter:\s*stable both-edges/,
  "tablet y móvil deben conservar una tabla completa con desplazamiento local",
);
assert.match(
  responsiveStyles,
  /\.biblia-sheet-table__actions[\s\S]*?position:\s*sticky\s*!important[\s\S]*?min-width:\s*280px\s*!important/,
  "la columna de acciones debe seguir fijada en la misma tabulación",
);
assert.match(
  responsiveStyles,
  /\.biblia-add-modal,[\s\S]*?\.biblia-confirm-modal[\s\S]*?max-height:\s*min\(92dvh, 820px\)/,
  "los modales deben quedar contenidos por la altura dinámica del dispositivo",
);
assert.match(
  responsiveStyles,
  /@media \(prefers-reduced-motion: reduce\)/,
  "la pantalla debe respetar la preferencia de movimiento reducido",
);

console.log("bibliaResponsiveSource.test.ts: OK");
