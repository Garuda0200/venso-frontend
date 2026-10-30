import { catalogCurrency, catalogAmountInDollars, tariffConversionPending } from "../../../../../utils/catalogCurrency";

export const isDollarCurrency = (currency) => catalogCurrency(currency) === "USD";
export const getCurrencySymbol = (currency) => catalogCurrency(currency) === "PEN" ? "S/" : "$";

/** Missing or invalid conversion input stays pending; no fallback rate or zero. */
export const convertToDollars = catalogAmountInDollars;
export { tariffConversionPending };

const convertOptionalPrice = (price, currency, exchangeRate) => {
  if (price === null || price === undefined || price === "") return price;
  return convertToDollars(price, currency, exchangeRate);
};

/**
 * Normaliza una tarifa a USD para que todos los cálculos de cotización operen
 * en una sola moneda. Los valores originales se conservan como referencia.
 */
export const convertTarifaToDollars = (tariff) => {
  if (!tariff) return tariff;
  if (tariffConversionPending(tariff)) return {
    ...tariff,
    moneda_original: tariff.moneda_original ?? tariff.moneda,
    tasa_cambio_original: tariff.tasa_cambio_original ?? tariff.tasa_cambio,
    precio_compartido_original: tariff.precio_compartido_original ?? tariff.precio_compartido,
    precio_privado_original: tariff.precio_privado_original ?? tariff.precio_privado,
    precio_original_moneda: tariff.precio_original_moneda ?? tariff.precio,
    precio_compartido: null, precio_privado: null,
    ...(tariff.precio !== undefined ? { precio: null } : {}),
    conversionPending: true,
    conversionPendingReason: "Completa una tasa de cambio válida en la tarifa para cotizar en USD.",
  };
  if (isDollarCurrency(tariff.moneda)) return { ...tariff, conversionPending: false };

  const originalCurrency = tariff.moneda;
  const originalExchangeRate = tariff.tasa_cambio;

  return {
    ...tariff,
    moneda_original: tariff.moneda_original ?? originalCurrency,
    tasa_cambio_original:
      tariff.tasa_cambio_original ?? originalExchangeRate,
    precio_compartido_original:
      tariff.precio_compartido_original ?? tariff.precio_compartido,
    precio_privado_original:
      tariff.precio_privado_original ?? tariff.precio_privado,
    ...(tariff.precio !== undefined
      ? { precio_original_moneda: tariff.precio_original_moneda ?? tariff.precio }
      : {}),
    precio_compartido: convertOptionalPrice(
      tariff.precio_compartido,
      originalCurrency,
      originalExchangeRate,
    ),
    precio_privado: convertOptionalPrice(
      tariff.precio_privado,
      originalCurrency,
      originalExchangeRate,
    ),
    ...(tariff.precio !== undefined
      ? {
          precio: convertOptionalPrice(
            tariff.precio,
            originalCurrency,
            originalExchangeRate,
          ),
        }
      : {}),
    moneda: "dolares",
    conversionPending: false,
  };
};

export const convertRoomTariffsToDollars = (room, tariffType = null) => ({
  ...room,
  tarifas: (Array.isArray(room?.tarifas) ? room.tarifas : [])
    .filter((tariff) => !tariffType || tariff.tipo_tarifa === tariffType)
    .map(convertTarifaToDollars),
});
