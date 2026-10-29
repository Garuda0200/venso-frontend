// movimientos.fecha is a PostgreSQL DATE, not a UTC instant.
export const parseMovementDate = (value) => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
  if (typeof value !== "string") return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T)/);
  if (!match) return null;
  const [, year, month, day] = match.map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
};

export const movementDateValue = (value) => {
  const date = parseMovementDate(value);
  if (!date) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

export const buildMovementDatePatch = (original, next) => {
  const expected = movementDateValue(original);
  const fecha = movementDateValue(next);
  if (!expected || !fecha) throw new Error("Selecciona una fecha de movimiento válida.");
  if (expected.slice(0, 4) !== fecha.slice(0, 4)) throw new Error("La fecha debe permanecer en el mismo año contable. Un cambio de año requiere corregir la caja por separado.");
  return expected === fecha ? null : { fecha, expected_fecha: expected };
};
