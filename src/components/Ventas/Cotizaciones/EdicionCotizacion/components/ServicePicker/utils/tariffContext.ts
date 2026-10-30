const normalizeAgencyId = (value) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

export const normalizeTariffYear = (value) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 2000 && parsed <= 2100
    ? parsed
    : null;
};

export const getTariffAgencyIds = (tariff) => {
  const ids = Array.isArray(tariff?.agency_ids) ? tariff.agency_ids : [];
  return ids.map(Number).filter((id) => Number.isInteger(id) && id > 0);
};

export const tariffMatchesAgency = (tariff, agencyId) => {
  const normalizedAgencyId = normalizeAgencyId(agencyId);
  return (
    !normalizedAgencyId || getTariffAgencyIds(tariff).includes(normalizedAgencyId)
  );
};

/**
 * Filtra las tarifas que puede presentar ServicePicker.
 *
 * El administrador puede consultar todas las agencias. Los selectores de una
 * cotización siempre proporcionan su agencia y conservan únicamente sus precios.
 */
export const filterTariffsForContext = (
  data,
  agencyId,
  tariffType,
  tariffYear,
) => {
  if (!Array.isArray(data)) return data;

  const normalizedTariffType = String(tariffType || "")
    .trim()
    .toLowerCase();
  const normalizedAgencyId = normalizeAgencyId(agencyId);
  const normalizedYear = normalizeTariffYear(tariffYear);
  const currentYear = new Date().getFullYear();

  return data.flatMap((item) => {
    if (!Array.isArray(item?.tarifas)) return [item];

    const tarifas = item.tarifas.filter((tarifa) => {
      const matchesAgency = tariffMatchesAgency(tarifa, normalizedAgencyId);
      const matchesTariffType =
        !normalizedTariffType ||
        String(tarifa?.tipo_tarifa || "")
          .trim()
          .toLowerCase() === normalizedTariffType;
      // Durante un despliegue progresivo, una fila legacy sin `anio` se
      // considera del año actual. El backend nuevo siempre devuelve `anio`.
      const tariffRowYear = normalizeTariffYear(tarifa?.anio) || currentYear;
      const matchesYear = !normalizedYear || tariffRowYear === normalizedYear;
      return matchesAgency && matchesTariffType && matchesYear;
    });

    if (tarifas.length === 0) return [];
    if (tarifas.length === 1) {
      return [{ ...item, tarifas }];
    }

    // Cada tarifa mantiene su modalidad y moneda aunque comparta agencia;
    // no se pierde su agency_ids ni se fusionan precios de agencias distintas.
    return tarifas.map((tarifa, index) => ({
      ...item,
      tarifas: [tarifa],
      _tariff_variant_key: `${tarifa.id_tarifa || index}`,
      _tariff_agency_ids: getTariffAgencyIds(tarifa),
    }));
  });
};


export const buildServicePickerTariffRequestParams = (agencyId, tariffYear) => {
  const normalizedAgencyId = normalizeAgencyId(agencyId);
  const normalizedYear = normalizeTariffYear(tariffYear);
  return {
    ...(normalizedAgencyId ? { agency_id: normalizedAgencyId } : {}),
    ...(normalizedYear ? { anio: normalizedYear } : {}),
  };
};

const normalizedTariffType = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();

const uniqueTariffTypes = (tariffs) =>
  [...new Set(
    (Array.isArray(tariffs) ? tariffs : [])
      .map((tariff) => normalizedTariffType(tariff?.tipo_tarifa))
      .filter(Boolean),
  )];

/**
 * Prepara el catálogo operativo de ServicePicker sin confundir visibilidad del
 * servicio con disponibilidad de una tarifa exacta.
 *
 * Regla importante: una tarifa de otro tipo NO se reutiliza como precio de la
 * cotización. Ejemplo: si una habitación importada sólo tiene tarifa `interna`
 * y la cotización pide `externa`, la habitación sigue visible pero queda con
 * `tarifas: []`. Así puede agregarse al itinerario con precio provisional 0 sin
 * exponer el costo interno como si fuera precio de venta.
 */
export const prepareServicePickerCatalogRows = (
  data,
  agencyId,
  preferredTariffType,
  tariffYear,
) => {
  if (!Array.isArray(data)) return data;

  const preferredType = normalizedTariffType(preferredTariffType);
  const normalizedAgencyId = normalizeAgencyId(agencyId);
  const normalizedYear = normalizeTariffYear(tariffYear);
  const currentYear = new Date().getFullYear();

  return data.flatMap((item) => {
    const rawTariffs = Array.isArray(item?.tarifas) ? item.tarifas : [];
    const contextualTariffs = rawTariffs.filter((tariff) => {
      const matchesAgency = tariffMatchesAgency(tariff, normalizedAgencyId);
      const rowYear = normalizeTariffYear(tariff?.anio) || currentYear;
      const matchesYear = !normalizedYear || rowYear === normalizedYear;
      return matchesAgency && matchesYear;
    });

    const selectedTariffs = preferredType
      ? contextualTariffs.filter(
          (tariff) => normalizedTariffType(tariff?.tipo_tarifa) === preferredType,
        )
      : contextualTariffs;
    const alternateTariffs = preferredType
      ? contextualTariffs.filter(
          (tariff) => normalizedTariffType(tariff?.tipo_tarifa) !== preferredType,
        )
      : [];
    const alternateTypes = uniqueTariffTypes(alternateTariffs);

    const decorate = (tarifas, index = null) => ({
      ...item,
      tarifas,
      _servicepicker_tariff_missing: tarifas.length === 0,
      _servicepicker_preferred_tariff_type: preferredType || null,
      _servicepicker_alternate_tariff_types: alternateTypes,
      _servicepicker_has_alternate_tariff: tarifas.length === 0 && alternateTypes.length > 0,
      ...(index === null
        ? {}
        : {
            _tariff_variant_key: `${tarifas[0]?.id_tarifa || index}`,
            _tariff_agency_ids: getTariffAgencyIds(tarifas[0]),
          }),
    });

    // El servicio siempre permanece en el catálogo aunque no tenga la tarifa
    // exacta. La ausencia de precio se resuelve visualmente en ChildServicePanel.
    if (selectedTariffs.length === 0) return [decorate([])];
    if (selectedTariffs.length === 1) {
      return [decorate(selectedTariffs)];
    }

    // Cada tarifa exacta conserva su contexto, moneda y modalidad por separado
    // como una opción independiente para no fusionar precios distintos.
    return selectedTariffs.map((tariff, index) => decorate([tariff], index));
  });
};
