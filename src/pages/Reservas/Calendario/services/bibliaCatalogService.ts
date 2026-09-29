import { createApiInstance } from "../../../../utils/apiUtils";
import type { BibliaActivity } from "../utils/bibliaActivityMapper";
import { buildBibliaTrainOptions } from "../utils/bibliaTrainCatalog";

export type BibliaCatalogField =
  | "hotelCusco" | "tickets" | "hotelValle" | "hotelMapi" | "restaurant" | "endorse"
  | "transport" | "guide" | "trainOutbound" | "trainReturn" | "agency";

const ENDPOINTS: Record<BibliaCatalogField, string> = {
  hotelCusco: "/turismo/hoteles",
  tickets: "/turismo/tickets",
  hotelValle: "/turismo/hoteles",
  hotelMapi: "/turismo/hoteles",
  restaurant: "/turismo/restaurantes",
  endorse: "/turismo/endoses",
  transport: "/turismo/transportes",
  guide: "/turismo/guias",
  trainOutbound: "/turismo/trenes",
  trainReturn: "/turismo/trenes",
  agency: "/turismo/agencias",
};

const fieldCache = new Map<string, string[]>();
const fieldRequests = new Map<string, Promise<string[]>>();
let trainCatalogCache: { outbound: string[]; return: string[] } | null = null;
let trainCatalogRequest: Promise<{ outbound: string[]; return: string[] }> | null = null;

const text = (...values: unknown[]) => {
  for (const value of values) {
    const normalized = String(value ?? "").trim();
    if (normalized) return normalized;
  }
  return "";
};

const normalize = (value: unknown) => String(value ?? "")
  .trim()
  .toLocaleLowerCase("es")
  .normalize("NFD")
  .replace(/\p{Diacritic}/gu, "");

const personName = (value: any) => {
  const person = value?.persona || value || {};
  return text(
    person.nombre_completo,
    [person.nombres || person.nombre, person.apellidos || [person.apellidopaterno, person.apellidomaterno].filter(Boolean).join(" ")].filter(Boolean).join(" "),
    value?.nombre,
  );
};

const labelFor = (field: BibliaCatalogField, item: any) => {
  if (field.startsWith("hotel")) return text(item?.nombre_hotel, item?.nombre, item?.name);
  if (field === "tickets") return text(item?.entrada, item?.ticket?.entrada, item?.nombre, item?.name);
  if (field === "transport") return text(item?.nombre_transporte, item?.nombre, item?.razon_social, item?.name);
  if (field === "guide") return text(personName(item), item?.nombre, item?.name);
  if (field === "restaurant") return text(item?.nombre_restaurante, item?.nombre, item?.razon_social, item?.name);
  if (field === "endorse") return text(item?.nombre_agencia, item?.nombre, item?.razon_social, item?.name);
  if (field === "agency") return text(item?.name, item?.nombre, item?.agency_name);
  return text(item?.nombre, item?.name);
};

const isHotelInField = (field: BibliaCatalogField, item: any) => {
  if (!field.startsWith("hotel")) return true;
  const location = normalize([
    item?.ciudad,
    item?.city,
    item?.ubicacion,
    item?.direccion,
    item?.nombre_hotel,
    item?.nombre,
  ].filter(Boolean).join(" "));
  const isMapi = /machu|mapi|aguas calientes/.test(location);
  const isValle = /valle|urubamba|ollanta|yucay|calca|pisac/.test(location);
  if (field === "hotelMapi") return isMapi;
  if (field === "hotelValle") return isValle && !isMapi;
  return !isMapi && !isValle;
};

const normalizeResponse = (response: any) => {
  const data = response?.data?.data ?? response?.data ?? [];
  return Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
};

const isTrainField = (field: BibliaCatalogField) => field === "trainOutbound" || field === "trainReturn";

const loadTrainCatalog = async () => {
  if (trainCatalogCache) return trainCatalogCache;
  if (trainCatalogRequest) return trainCatalogRequest;

  const api = createApiInstance(true);
  trainCatalogRequest = Promise.all([
    api.get("/turismo/trenes"),
    api.get("/turismo/vagones"),
  ])
    .then(([trainsResponse, wagonsResponse]) => {
      const trains = normalizeResponse(trainsResponse);
      const wagons = normalizeResponse(wagonsResponse);
      trainCatalogCache = {
        outbound: buildBibliaTrainOptions(trains, wagons, "outbound"),
        return: buildBibliaTrainOptions(trains, wagons, "return"),
      };
      return trainCatalogCache;
    })
    .finally(() => {
      trainCatalogRequest = null;
    });

  return trainCatalogRequest;
};

const loadTrainOptions = async (field: "trainOutbound" | "trainReturn") => {
  const catalog = await loadTrainCatalog();
  return field === "trainOutbound" ? catalog.outbound : catalog.return;
};

export const isBibliaCatalogField = (field: keyof BibliaActivity): field is BibliaCatalogField =>
  Object.prototype.hasOwnProperty.call(ENDPOINTS, String(field));

export const bibliaCatalogService = {
  async getOptions(field: BibliaCatalogField): Promise<string[]> {
    // La clave es el campo, no sólo el endpoint: ida y retorno comparten datos
    // pero necesitan priorizar sentidos de viaje diferentes.
    const cacheKey = field;
    const cached = fieldCache.get(cacheKey);
    if (cached) return cached;
    const pending = fieldRequests.get(cacheKey);
    if (pending) return pending;

    const request = (isTrainField(field)
      ? loadTrainOptions(field as "trainOutbound" | "trainReturn")
      : createApiInstance(true)
          .get(ENDPOINTS[field], field.startsWith("hotel") ? { params: { activo: true } } : undefined)
          .then((response) => {
            const labels = normalizeResponse(response)
              .filter((item) => isHotelInField(field, item))
              .map((item) => labelFor(field, item))
              .filter(Boolean);
            return [...new Set(labels)].sort((a, b) => a.localeCompare(b, "es"));
          }))
      .then((options) => {
        fieldCache.set(cacheKey, options);
        return options;
      })
      .finally(() => fieldRequests.delete(cacheKey));

    fieldRequests.set(cacheKey, request);
    return request;
  },

  clear() {
    fieldCache.clear();
    fieldRequests.clear();
    trainCatalogCache = null;
    trainCatalogRequest = null;
  },
};
