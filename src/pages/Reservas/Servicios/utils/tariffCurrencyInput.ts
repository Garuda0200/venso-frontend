import { catalogCurrency, identifiedCatalogRate } from "../../../../utils/catalogCurrency";

/** A catalogue amount stays in its chosen currency; the rate is explicit metadata. */
export function buildTariffCurrencyInput(input: { moneda?: unknown; tasa_cambio?: unknown }) {
  const currency = catalogCurrency(input.moneda);
  if (input.moneda == null || input.moneda === "" || !currency) {
    throw new Error("Selecciona soles o dólares para la tarifa.");
  }
  const rate = identifiedCatalogRate(input.tasa_cambio);
  if (rate == null) throw new Error("Ingresa el tipo de cambio: soles por dólar.");
  return { moneda: currency === "PEN" ? "soles" : "dolares", tasa_cambio: rate };
}
