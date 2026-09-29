import { EXCHANGE_RATE } from "../../../../../utils/constants";

const normalizeCurrency = (currency) =>
  String(currency || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

export const isDollarCurrency = (currency) => {
  const normalized = normalizeCurrency(currency);
  return (
    !normalized ||
    normalized === "usd" ||
    normalized === "$" ||
    normalized.includes("dolar")
  );
};

export const getCurrencySymbol = (currency) =>
  isDollarCurrency(currency) ? "$" : "S/";

export const convertToDollars = (price, currency, exchangeRate) => {
  const numericPrice = Number.parseFloat(price);
  if (!Number.isFinite(numericPrice) || numericPrice <= 0) return 0;
  if (isDollarCurrency(currency)) return numericPrice;

  const parsedRate = Number.parseFloat(exchangeRate);
  const rate = Number.isFinite(parsedRate) && parsedRate > 0
    ? parsedRate
    : EXCHANGE_RATE;

  return numericPrice / rate;
};

const convertOptionalPrice = (price, currency, exchangeRate) => {
  if (price === null || price === undefined || price === "") return price;
  return convertToDollars(price, currency, exchangeRate);
};

/**
 * Normaliza una tarifa a USD para que todos los cálculos de cotización operen
 * en una sola moneda. Los valores originales se conservan como referencia.
 */
export const convertTarifaToDollars = (tariff) => {
  if (!tariff || isDollarCurrency(tariff.moneda)) return tariff;

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
  };
};

export const convertRoomTariffsToDollars = (room, tariffType = null) => ({
  ...room,
  tarifas: (Array.isArray(room?.tarifas) ? room.tarifas : [])
    .filter((tariff) => !tariffType || tariff.tipo_tarifa === tariffType)
    .map(convertTarifaToDollars),
});
