import { normalizeAttributes, normalizeCode } from "./utils";

export const BATCH_CREATE_LIMIT = 100;

/** Columnas fijas de la grilla; los atributos se agregan después de estas. */
export const BASE_COLUMNS = [
  { key: "codigo", label: "Código" },
  { key: "nombre", label: "Nombre" },
  { key: "serie", label: "N° de serie" },
];

export const emptyRow = () => ({ codigo: "", nombre: "", atributos: {} });

export const resizeRows = (rows, count) => {
  const size = Math.min(Math.max(Number(count) || 1, 1), BATCH_CREATE_LIMIT);
  if (rows.length === size) return rows;
  if (rows.length > size) return rows.slice(0, size);
  return [...rows, ...Array.from({ length: size - rows.length }, emptyRow)];
};

/**
 * Códigos previstos para las filas sin código manual, a partir del siguiente
 * código sugerido por el backend (por ejemplo "PT-07"). Los códigos manuales
 * se respetan y no se reutilizan.
 */
export const previewCodes = (rows, nextCode) => {
  const manual = new Set(rows.map((row) => normalizeCode(row.codigo)).filter(Boolean));
  const match = String(nextCode || "").match(/^([A-Z0-9]+)-(\d+)$/);
  if (!match) return rows.map((row) => normalizeCode(row.codigo) || "");

  const [, prefix, start] = match;
  let counter = Number(start) - 1;
  return rows.map((row) => {
    const own = normalizeCode(row.codigo);
    if (own) return own;
    let candidate;
    do {
      counter += 1;
      candidate = `${prefix}-${String(counter).padStart(2, "0")}`;
    } while (manual.has(candidate));
    return candidate;
  });
};

/** Celdas copiadas de Excel/Sheets: filas por salto de línea, columnas por tabulador. */
export const parseClipboardGrid = (text) => {
  const lines = String(text || "").replace(/\r\n?/g, "\n").replace(/\n$/, "").split("\n");
  return lines.map((line) => line.split("\t"));
};

export const isGridPaste = (text) => /[\t\n]/.test(String(text || "").replace(/\r?\n$/, ""));

const getCell = (row, key) =>
  key === "codigo" || key === "nombre" ? row[key] : row.atributos?.[key] ?? "";

const setCell = (row, key, value) =>
  key === "codigo" || key === "nombre"
    ? { ...row, [key]: value }
    : { ...row, atributos: { ...row.atributos, [key]: value } };

export { getCell, setCell };

/** Pega una grilla desde la celda (rowIndex, columnKey), agregando filas si hace falta. */
export const pasteGrid = (rows, columns, rowIndex, columnKey, text) => {
  const grid = parseClipboardGrid(text);
  const startColumn = columns.findIndex((column) => column.key === columnKey);
  if (startColumn < 0) return rows;

  const needed = Math.min(rowIndex + grid.length, BATCH_CREATE_LIMIT);
  const next = resizeRows(rows, Math.max(rows.length, needed));
  grid.forEach((cells, offset) => {
    const target = rowIndex + offset;
    if (target >= next.length) return;
    cells.forEach((value, cellOffset) => {
      const column = columns[startColumn + cellOffset];
      if (column) next[target] = setCell(next[target], column.key, value.trim());
    });
  });
  return next;
};

/** Payload para POST /items/batch. Las filas solo envían lo que sobrescriben. */
export const buildBatchPayload = (shared, rows) => {
  const responsible = {
    nombre: shared.responsable_nombre.trim() || null,
    dni: shared.responsable_dni.trim() || null,
  };
  return {
    categoria: shared.categoria.trim(),
    responsable_actual: responsible.nombre || responsible.dni ? responsible : null,
    info: {
      nombre: shared.nombre.trim() || shared.categoria.trim(),
      estado: shared.estado,
      ubicacion: shared.ubicacion.trim() || undefined,
      descripcion: shared.descripcion.trim() || undefined,
      atributos: normalizeAttributes(shared.atributos),
    },
    items: rows.map((row) => {
      const attributes = normalizeAttributes(row.atributos);
      const info = {
        nombre: row.nombre.trim() || undefined,
        atributos: Object.keys(attributes).length ? attributes : undefined,
      };
      return {
        codigo: normalizeCode(row.codigo) || null,
        info: JSON.parse(JSON.stringify(info)),
      };
    }),
  };
};
