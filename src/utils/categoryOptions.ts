// Categorías de texto libre: se sugieren a partir de los valores ya existentes
// en la tabla y el usuario puede escribir una nueva.

const categoryKey = (value: unknown) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

/** Une listas de categorías sin duplicados (ignorando mayúsculas, tildes y espacios). */
export const mergeCategoryOptions = (...lists: unknown[][]): string[] => {
  const byKey = new Map<string, string>();
  lists.flat().forEach((raw) => {
    const value = String(raw ?? "").trim().replace(/\s+/g, " ");
    const key = categoryKey(value);
    if (key && !byKey.has(key)) byKey.set(key, value);
  });
  return [...byKey.values()].sort((a, b) =>
    a.localeCompare(b, "es", { sensitivity: "base" }),
  );
};

/** Devuelve la categoría existente equivalente, o el valor limpio si es nueva. */
export const canonicalCategory = (value: unknown, options: string[] = []): string => {
  const cleaned = String(value ?? "").trim().replace(/\s+/g, " ");
  const key = categoryKey(cleaned);
  return options.find((option) => categoryKey(option) === key) ?? cleaned;
};

export const isNewCategory = (value: unknown, options: string[] = []): boolean => {
  const key = categoryKey(value);
  return Boolean(key) && !options.some((option) => categoryKey(option) === key);
};
