export const QUOTATION_FOCUS_PARAM = "focus_cotizacion";

export function quotationFocusHref(quotationId: unknown, role: unknown) {
  const id = String(quotationId ?? "").trim();
  if (!id) return null;
  const module = Number(role) === 3 ? "reservas" : "ventas";
  return `/${module}/cotizaciones?${new URLSearchParams({ [QUOTATION_FOCUS_PARAM]: id })}`;
}

/** El ID, no el texto del file, identifica inequívocamente la cotización. */
export function quotationFocusList(quotationId: string, quotation: any, fallback: any[]) {
  if (!quotationId) return fallback;
  return quotation && quotation.is_active === true && String(quotation.id) === quotationId
    ? [quotation] : [];
}