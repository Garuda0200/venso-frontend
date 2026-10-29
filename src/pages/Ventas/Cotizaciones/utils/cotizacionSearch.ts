const normalizeSearchValue = (value) =>
  value === undefined || value === null
    ? ""
    : String(value).trim().toLocaleLowerCase();

/**
 * Búsqueda textual por título, ID y códigos de file/voucher.
 * `cotizacion.codigo` dejó de ser parte del modelo persistente.
 */
export const matchesCotizacionSearch = (
  cotizacion = {},
  searchTerm = "",
  _options = {},
) => {
  const normalizedTerm = normalizeSearchValue(searchTerm);
  if (!normalizedTerm) return true;

  return [cotizacion.titulo, cotizacion.id, cotizacion.voucher_code, cotizacion.voucherCode,
    ...(Array.isArray(cotizacion.voucher_codes) ? cotizacion.voucher_codes : []),
  ].some((value) =>
    normalizeSearchValue(value).includes(normalizedTerm),
  );
};

export default matchesCotizacionSearch;
