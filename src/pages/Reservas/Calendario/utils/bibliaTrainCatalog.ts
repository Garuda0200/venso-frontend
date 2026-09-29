import type { BibliaActivity } from "./bibliaActivityMapper";

export type BibliaTrainDirection = "outbound" | "return";

const text = (...values: unknown[]) => {
  for (const value of values) {
    const normalized = String(value ?? "").trim();
    if (normalized) return normalized;
  }
  return "";
};

const normalize = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");

const isMapi = (value: unknown) => {
  const normalized = normalize(value);
  return normalized.includes("machupicchu") || normalized.includes("machu picchu") || normalized.includes("mapi");
};

/**
 * Reduce solo los nombres de estación que sobrecargan las celdas operativas.
 * No cambia el servicio, empresa, vagón ni horario que identifica el tren.
 */
export const compactBibliaTrainText = (value: unknown) =>
  text(value)
    .replace(/machu\s*picchu/gi, "MAPI")
    .replace(/ollanta\s*y?\s*tambo/gi, "OLLANTA");

export const formatBibliaTrainTime = (value: unknown) => {
  const raw = text(value);
  if (!raw) return "";
  const match = raw.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return raw;
  return `${match[1].padStart(2, "0")}:${match[2]}`;
};

const unwrapWagon = (row: any) => row?.vagon || row || {};

const providerId = (provider: any) => String(provider?.id_tren ?? provider?.tren_id ?? provider?.id ?? "");
const wagonProviderId = (wagon: any) => String(wagon?.id_tren ?? wagon?.tren_id ?? "");

export const buildBibliaTrainOption = (provider: any, wagonRow: any) => {
  const wagon = unwrapWagon(wagonRow);
  const company = text(provider?.nombre_empresa, provider?.empresa, provider?.nombre, provider?.name, "Tren");
  const service = text(wagon?.tipo_tren, wagon?.tipo_vagon, "Servicio");
  const origin = compactBibliaTrainText(text(wagon?.lugar_salida, "Origen"));
  const destination = compactBibliaTrainText(text(wagon?.lugar_destino, "Destino"));
  const departure = formatBibliaTrainTime(wagon?.hora_salida);
  const arrival = formatBibliaTrainTime(wagon?.hora_llegada);
  const originWithTime = [origin, departure].filter(Boolean).join(" ");
  const destinationWithTime = [destination, arrival].filter(Boolean).join(" ");
  return `${company} · ${service} · ${originWithTime} → ${destinationWithTime}`;
};

const directionRank = (wagonRow: any, direction: BibliaTrainDirection) => {
  const wagon = unwrapWagon(wagonRow);
  if (direction === "outbound") {
    if (isMapi(wagon?.lugar_destino) && !isMapi(wagon?.lugar_salida)) return 0;
    if (isMapi(wagon?.lugar_salida)) return 2;
    return 1;
  }
  if (isMapi(wagon?.lugar_salida) && !isMapi(wagon?.lugar_destino)) return 0;
  if (isMapi(wagon?.lugar_destino)) return 2;
  return 1;
};

export const buildBibliaTrainOptions = (
  trains: any[],
  wagonRows: any[],
  direction: BibliaTrainDirection,
): string[] => {
  const providers = new Map(
    (Array.isArray(trains) ? trains : [])
      .filter((train) => train?.mostrar_en_servicepicker !== false)
      .map((train) => [providerId(train), train]),
  );

  const rows = (Array.isArray(wagonRows) ? wagonRows : [])
    .filter((row) => unwrapWagon(row)?.mostrar_en_servicepicker !== false)
    .filter((row) => {
      const state = normalize(unwrapWagon(row)?.estado);
      return !state || !["inactivo", "deshabilitado", "eliminado"].includes(state);
    })
    .map((row) => ({ row, wagon: unwrapWagon(row), provider: providers.get(wagonProviderId(unwrapWagon(row))) }))
    .filter((item) => item.provider)
    .sort((a, b) => {
      const rank = directionRank(a.row, direction) - directionRank(b.row, direction);
      if (rank !== 0) return rank;
      const aDeparture = formatBibliaTrainTime(a.wagon?.hora_salida);
      const bDeparture = formatBibliaTrainTime(b.wagon?.hora_salida);
      const byTime = aDeparture.localeCompare(bDeparture, "es", { numeric: true });
      if (byTime !== 0) return byTime;
      return buildBibliaTrainOption(a.provider, a.row).localeCompare(
        buildBibliaTrainOption(b.provider, b.row),
        "es",
        { numeric: true },
      );
    });

  return [...new Set(rows.map((item) => buildBibliaTrainOption(item.provider, item.row)))];
};

export const getHistoricalBibliaTrainOptions = (
  activities: BibliaActivity[],
  field: "trainOutbound" | "trainReturn",
): string[] =>
  [...new Set(
    (Array.isArray(activities) ? activities : [])
      .map((activity) => compactBibliaTrainText(activity?.[field]))
      .filter((value) => value && value !== "—"),
  )].sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
