import { catalogueBase } from "./catalogueFilters";

export const trainPickerDetails = (
  item: Record<string, any> = {},
  provider: Record<string, any> = {},
) => {
  const wagon = catalogueBase(item, "trenes");
  const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
  const rawBimodal = wagon.es_bimodal;
  return {
    type: text(wagon.tipo_tren || wagon.tipo_vagon),
    // Frequency belongs to the train provider; support embedded legacy rows too.
    frequency: text(provider?.frecuencia) || text(item?.tren?.frecuencia) ||
      text(item?.parentService?.frecuencia) || text(wagon.tren?.frecuencia) ||
      text(wagon.frecuencia) || text(item?.frecuencia),
    origin: text(wagon.lugar_salida), destination: text(wagon.lugar_destino),
    departure: text(wagon.hora_salida).slice(0, 5), arrival: text(wagon.hora_llegada).slice(0, 5),
    extras: text(wagon.serv_add), status: text(wagon.estado),
    bimodal: rawBimodal == null ? null : [true, 1, "1", "true", "si", "sí"].includes(typeof rawBimodal === "string" ? rawBimodal.toLowerCase() : rawBimodal),
  };
};
