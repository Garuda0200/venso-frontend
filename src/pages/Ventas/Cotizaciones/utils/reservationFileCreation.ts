/** El alta operativa no sustituye las validaciones comerciales de Ventas. */
export const canCreateReservationFile = (role: unknown, pathname: string) => {
  const normalizedRole = (typeof role === "number" || (typeof role === "string" && role.trim()))
    ? Number(role) : NaN;
  return normalizedRole === 3
    || (normalizedRole === 0 && pathname.startsWith("/reservas/cotizaciones"));
};

export const reservationFileTitle = (quotation: Record<string, any>) =>
  String(quotation.titulo || "").trim()
  || String(quotation.voucher_code || quotation.voucher_codes?.[0] || quotation.id || "").trim();

export const isEmptyReservationFile = (quotation: Record<string, any>) =>
  Number(quotation.cantidadpersonas) === 0
  && quotation.cantidadpersonas != null
  && Number(quotation.num_adults || 0) + Number(quotation.num_children || 0) === 0
  && ![quotation.passengers, quotation.itinerario, quotation.itinerario_externo, quotation.itinerarioExterno,
    quotation.biblia_actividades, quotation.bibliaActividades].some(value => Array.isArray(value) && value.length > 0)
  && Boolean(String(quotation.voucher_code || "").trim());

export interface ReservationFileInput {
  voucher_code: string;
  titulo?: string;
  agency_id?: number;
  media_asset_id?: string;
}

export const buildReservationFileInput = (input: ReservationFileInput): ReservationFileInput => {
  const code = String(input.voucher_code || "").trim();
  if (!code) throw new Error("Ingresa el código de file.");
  return {
    voucher_code: code,
    ...(input.titulo?.trim() ? { titulo: input.titulo.trim() } : {}),
    ...(input.agency_id ? { agency_id: input.agency_id } : {}),
    ...(input.media_asset_id ? { media_asset_id: input.media_asset_id } : {}),
  };
};
