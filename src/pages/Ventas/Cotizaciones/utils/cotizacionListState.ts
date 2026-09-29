const normalizeIdentifier = (value: unknown) =>
  value === undefined || value === null ? "" : String(value).trim();

export interface CotizacionPostSaveListStateInput {
  isReservationFlow: boolean;
  currentSellerDni?: string | null;
  savedSellerDni?: string | null;
  currentSellerScope: string;
  currentSellerFilter?: string;
  hasVoucher?: boolean;
}

/**
 * Mantiene visible la cotización que acaba de guardarse.
 *
 * Reservas puede iniciar en `others` automáticamente cuando todavía no tiene
 * cotizaciones propias. Si luego crea su primera cotización, conservar ese scope
 * oculta el registro recién guardado y da la impresión de que el listado está
 * desactualizado hasta recargar la página.
 */
export const resolveCotizacionPostSaveListState = ({
  isReservationFlow,
  currentSellerDni,
  savedSellerDni,
  currentSellerScope,
  currentSellerFilter = "",
  hasVoucher = false,
}: CotizacionPostSaveListStateInput) => {
  const currentSeller = normalizeIdentifier(currentSellerDni);
  const savedSeller = normalizeIdentifier(savedSellerDni);
  const isOwnSavedQuotation =
    Boolean(currentSeller) && currentSeller === savedSeller;

  let sellerScope = currentSellerScope;
  let vendedor = currentSellerFilter;

  if (isReservationFlow && isOwnSavedQuotation) {
    sellerScope = "mine";

    if (vendedor && normalizeIdentifier(vendedor) !== currentSeller) {
      vendedor = "";
    }
  }

  return {
    sellerScope,
    vendedor,
    quotationStatus: hasVoucher ? "sold" : "open",
  };
};

export default resolveCotizacionPostSaveListState;
