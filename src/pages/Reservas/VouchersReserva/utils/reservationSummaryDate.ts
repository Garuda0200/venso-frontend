/** Travel dates from PostgreSQL DATE represent a calendar day, not a UTC instant. */
export const formatReservationSummaryDate = (value: string | Date | null | undefined) => {
  if (!value) return "Sin fecha";
  let date: Date;
  const raw = String(value).trim();
  const match = typeof value === "string" && raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    const [, year, month, day] = match.map(Number);
    date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return raw;
  } else {
    date = value instanceof Date ? value : new Date(raw);
  }
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric" });
};
