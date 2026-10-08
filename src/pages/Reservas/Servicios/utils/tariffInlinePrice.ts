import type { TariffMode } from "./tariffPriceModes";

export function buildInlineTariffPricePatch(mode: TariffMode, value: string) {
  if (mode !== "compartido" && mode !== "privado") throw new Error("Modalidad inválida.");
  const normalized = value.trim().replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized) || !Number.isFinite(Number(normalized))) {
    throw new Error("Introduce un importe válido, sin negativos y con hasta dos decimales.");
  }
  // Send only the edited field: agency scope, currency, seasons and the other
  // price must not be rebuilt from defaults or stale list data.
  return { [`precio_${mode}`]: Number(normalized) };
}

export async function saveInlineTariffPrice(
  mode: TariffMode, value: string, current: number,
  persist: (patch: Record<string, number>) => Promise<void>,
) {
  const patch = buildInlineTariffPricePatch(mode, value);
  if (patch[`precio_${mode}`] === current) return false;
  await persist(patch);
  return true;
}
