export const normalizeSmartComboBoxText = (value = "") =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const getMatchRank = (normalizedOption, normalizedSearch, tokens) => {
  if (!normalizedSearch) return 3;
  if (normalizedOption === normalizedSearch) return 0;
  if (normalizedOption.startsWith(normalizedSearch)) return 1;
  if (normalizedOption.includes(normalizedSearch)) return 2;
  if (tokens.every((token) => normalizedOption.includes(token))) return 3;
  return Number.POSITIVE_INFINITY;
};

/**
 * Filtra opciones de un SmartComboBox sin distinguir mayúsculas ni tildes.
 * Prioriza coincidencia exacta, prefijo, contenido y finalmente coincidencia
 * por todas las palabras escritas aunque no estén juntas.
 */
export const filterSmartComboBoxOptions = (options = [], searchValue = "") => {
  const normalizedSearch = normalizeSmartComboBoxText(searchValue);
  const tokens = normalizedSearch.split(" ").filter(Boolean);

  return (Array.isArray(options) ? options : [])
    .map((option, originalIndex) => ({
      option,
      originalIndex,
      normalized: normalizeSmartComboBoxText(option),
    }))
    .map((entry) => ({
      ...entry,
      rank: getMatchRank(entry.normalized, normalizedSearch, tokens),
    }))
    .filter((entry) => Number.isFinite(entry.rank))
    .sort((a, b) => a.rank - b.rank || a.originalIndex - b.originalIndex)
    .map((entry) => entry.option);
};
