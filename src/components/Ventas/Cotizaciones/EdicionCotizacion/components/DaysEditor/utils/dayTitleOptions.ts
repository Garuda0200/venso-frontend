const normalizeKey = (value = "") =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

export const normalizeDayTitleOptions = (titles = []) => {
  const unique = new Map();

  (Array.isArray(titles) ? titles : []).forEach((title) => {
    if (typeof title !== "string") return;
    const cleaned = title.replace(/\s+/g, " ").trim();
    const key = normalizeKey(cleaned);
    if (!key || unique.has(key)) return;
    unique.set(key, cleaned);
  });

  return [...unique.values()].sort((a, b) =>
    a.localeCompare(b, "es", { sensitivity: "base" }),
  );
};

export const extractDayTitleOptions = (days = []) =>
  normalizeDayTitleOptions(
    (Array.isArray(days) ? days : []).map((day) => day?.titulo),
  );

export const mergeDayTitleOptions = (current = [], incoming = []) => {
  const merged = normalizeDayTitleOptions([...(current || []), ...(incoming || [])]);
  if (
    merged.length === current.length &&
    merged.every((title, index) => title === current[index])
  ) {
    return current;
  }
  return merged;
};
