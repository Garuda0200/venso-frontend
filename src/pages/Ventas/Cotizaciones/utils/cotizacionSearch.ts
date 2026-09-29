const normalizeSearchValue = (value) =>
  value === undefined || value === null
    ? ""
    : String(value).trim().toLocaleLowerCase();

/**
 * Búsqueda textual de cotizaciones por título o ID.
 * `cotizacion.codigo` dejó de ser parte del modelo persistente.
 */
export const matchesCotizacionSearch = (
  cotizacion = {},
  searchTerm = "",
  _options = {},
) => {
  const normalizedTerm = normalizeSearchValue(searchTerm);
  if (!normalizedTerm) return true;

  return [cotizacion.titulo, cotizacion.id].some((value) =>
    normalizeSearchValue(value).includes(normalizedTerm),
  );
};

export default matchesCotizacionSearch;
