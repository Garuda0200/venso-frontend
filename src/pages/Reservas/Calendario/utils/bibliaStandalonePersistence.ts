/** El backend puede resolver el vínculo por código aunque se enviara null. */
export const savedStandaloneBibliaRecord = (
  previous: Record<string, any>,
  result: Record<string, any> | undefined,
  activity: Record<string, any>,
  requestedQuotationId: string | null,
) => {
  const quotationId = result && Object.prototype.hasOwnProperty.call(result, "cotizacion_id")
    ? result.cotizacion_id : requestedQuotationId;
  return {
    ...previous,
    cotizacion_id: quotationId ? String(quotationId) : null,
    actividad: result?.actividad || activity,
  };
};
