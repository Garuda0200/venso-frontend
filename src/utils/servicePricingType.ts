import { catalogAmountInDollars } from "./catalogCurrency";
/** Persisted codes retain their historical calculation; UI tariff names are separate. */
export type ServicePricingType = "compartido" | "privado";
export type DayServiceMode = ServicePricingType | "mixto";

/** Pricing labels only: package/day names and SIC/PRIV keep their own meaning. */
export function tariffPriceModeLabel(mode: ServicePricingType): string {
  return mode === "compartido" ? "Privado" : "Compartido";
}

export function tariffPriceOptionLabel(mode: ServicePricingType): string {
  return `${tariffPriceModeLabel(mode)} · ${mode === "compartido" ? "total" : "por persona"}`;
}
export function sharedPriceFlag(value: unknown): boolean | undefined {
  if (value == null || value === "") return undefined;
  if (value === "compartido" || value === true) return true;
  if (value === "privado" || value === false) return false;
  return undefined;
}
export function normalizePricingType(value: unknown): ServicePricingType | null | undefined {
  if (value == null) return value as null | undefined;
  return sharedPriceFlag(value) === true ? "compartido" : "privado";
}
export function normalizeDayServiceMode(value: unknown): DayServiceMode {
  return value === "compartido" || value === "privado" ? value : "mixto";
}
export function normalizeServicePricingContract(service: any) {
  if (!service) return service;
  const {
    precioAdultoDividido,
    precio_adulto_dividido,
    assignedPrecioAdultoDividido,
    assigned_precio_adulto_dividido,
    ...rest
  } = service;
  const assignedKey = [
    "assignedTipoPrecio",
    "assigned_tipo_precio",
    "assignedPrecioAdultoDividido",
    "assigned_precio_adulto_dividido",
  ].find(key => Object.prototype.hasOwnProperty.call(service, key));
  return {
    ...rest,
    tipoPrecio: normalizePricingType(
      service.tipoPrecio ?? service.tipo_precio ??
      precioAdultoDividido ?? precio_adulto_dividido,
    ),
    assignedTipoPrecio: normalizePricingType(assignedKey ? service[assignedKey] : undefined),
  };
}

export function tariffPriceOptions(tariff: any, mode: unknown = "mixto", serviceType?: string) {
  const privateTicket = (serviceType || tariff?.tipo_servicio) === "tickets";
  if (privateTicket) mode = "privado";
  return (["compartido", "privado"] as ServicePricingType[])
    .filter(type => normalizeDayServiceMode(mode) === "mixto" || type === mode)
    .filter(type => tariff?.[`precio_${type}`] != null && tariff?.[`precio_${type}`] !== "")
    .filter(type => Number.isFinite(Number(tariff[`precio_${type}`])) && Number(tariff[`precio_${type}`]) >= 0)
    .map(type => ({
      tipoPrecio: type,
      amount: Number(tariff[`precio_${type}`]),
      label: tariffPriceOptionLabel(type),
    }));
}

export function cataloguePricingOptions(service: any, mode: unknown, tariffType?: string | null) {
  const tariffs: any[] = [];
  const collect = (item: any, depth: number) => {
    if (!item || depth > 2) return;
    if (Array.isArray(item.tarifas)) tariffs.push(...item.tarifas);
    if (item.precio_compartido != null || item.precio_privado != null) tariffs.push(item);
    for (const key of [
      "tariff", "childService", "parentService", "habitacion", "movilidad",
      "ruta", "tour", "vagon", "vagones", "ticket", "restaurante", "tipo_vuelo",
    ]) collect(item[key], depth + 1);
  };
  collect(service, 0);
  return tariffs.filter(tariff => !tariffType || !tariff.tipo_tarifa || tariff.tipo_tarifa === tariffType)
    .flatMap(tariff => tariffPriceOptions(tariff, mode, service?.typeService || service?.parentService?.typeService).flatMap(option => {
      const amount = catalogAmountInDollars(option.amount, tariff.moneda, tariff.tasa_cambio);
      return amount == null ? [] : [{ ...option, amount, tariffId: tariff.id_tarifa }];
    }));
}
