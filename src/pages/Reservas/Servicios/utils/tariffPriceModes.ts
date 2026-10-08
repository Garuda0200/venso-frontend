export type TariffMode = "compartido" | "privado";
export const TARIFF_MODES: TariffMode[] = ["compartido", "privado"];

export function initialTariffModes(tariff: any) {
  return {
    compartido: tariff ? tariff.precio_compartido != null : false,
    privado: tariff ? tariff.precio_privado != null : true,
  };
}

export function validateTariffModePrices(prices: any, enabled: Record<TariffMode, boolean>) {
  const errors: Record<string, string> = {};
  if (!TARIFF_MODES.some(mode => enabled[mode])) errors.modalidades = "Activa al menos una modalidad.";
  for (const mode of TARIFF_MODES) {
    if (!enabled[mode]) continue;
    const value = prices[`precio_${mode}`];
    if (value == null || String(value).trim() === "" || !Number.isFinite(Number(value)) || Number(value) < 0) {
      errors[`precio_${mode}`] = "Ingresa un importe válido, igual o mayor a cero.";
    }
  }
  return errors;
}

export function buildTariffModePrices(prices: any, enabled: Record<TariffMode, boolean>) {
  const errors = validateTariffModePrices(prices, enabled);
  if (Object.keys(errors).length) throw new Error(Object.values(errors)[0]);
  return {
    precio_compartido: enabled.compartido ? Number(prices.precio_compartido) : null,
    precio_privado: enabled.privado ? Number(prices.precio_privado) : null,
  };
}
