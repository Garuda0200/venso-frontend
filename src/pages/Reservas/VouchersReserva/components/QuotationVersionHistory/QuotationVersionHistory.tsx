import { useMemo, useState } from "react";
import { MdHistory, MdLockOutline } from "react-icons/md";
import SecureStorage from "../../../../../utils/secureStorage";
import PredecesoresExpander from "../../../../Ventas/Cotizaciones/components/PredecesoresExpander";
import "./QuotationVersionHistory.scss";

const firstDefined = (...values) =>
  values.find((value) => value !== undefined && value !== null && value !== "");

export const buildClosedSaleQuotation = (voucher = {}) => {
  const quotation =
    voucher.cotizacionData ||
    voucher.cotizacion_data ||
    voucher.cotizacion ||
    voucher.quotation ||
    {};

  const quotationId = firstDefined(
    voucher.cotizacionId,
    voucher.cotizacion_id,
    quotation.id,
    quotation.cotizacion_id,
  );
  const voucherVentaId = firstDefined(
    voucher.voucherVentaId,
    voucher.voucher_venta_id,
    voucher.voucherId,
    voucher.voucher_id,
    voucher.id,
  );

  // Este componente solo representa el historial comercial posterior al cierre.
  // Sin una cotización y un voucher de venta vinculados no debe exponer backups
  // de la etapa de borrador.
  if (!quotationId || !voucherVentaId) return null;

  return {
    ...quotation,
    id: quotationId,
    titulo: firstDefined(
      quotation.titulo,
      quotation.title,
      voucher.titulo,
      voucher.title,
      voucher.voucherCode,
      voucher.voucher_code,
      `Cotización ${quotationId}`,
    ),
    tiene_voucher: true,
    tieneVoucher: true,
    current_version: firstDefined(
      quotation.current_version,
      quotation.currentVersion,
      voucher.current_version,
      voucher.currentVersion,
    ),
    sale_baseline_version_id: firstDefined(
      quotation.sale_baseline_version_id,
      quotation.saleBaselineVersionId,
      voucher.sale_baseline_version_id,
      voucher.saleBaselineVersionId,
    ),
  };
};

const QuotationVersionHistory = ({
  voucher,
  variant = "card",
  label = "Versiones de la venta",
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const quotation = useMemo(() => buildClosedSaleQuotation(voucher), [voucher]);
  const userRole = Number(SecureStorage.getItem("userRole") ?? 1);

  if (!quotation) return null;

  return (
    <>
      <button
        type="button"
        className={`quotation-version-trigger quotation-version-trigger--${variant}`}
        onClick={() => setIsOpen(true)}
        title="Ver la base de venta y las modificaciones posteriores"
      >
        <span className="quotation-version-trigger__icon">
          <MdHistory />
        </span>
        <span className="quotation-version-trigger__copy">
          <strong>{label}</strong>
          {variant === "card" && (
            <small>Base de venta y cambios posteriores</small>
          )}
        </span>
        {variant === "card" && (
          <span className="quotation-version-trigger__phase">
            <MdLockOutline /> Venta cerrada
          </span>
        )}
      </button>

      {isOpen && (
        <PredecesoresExpander
          cotizacion={quotation}
          modalMode
          onClose={() => setIsOpen(false)}
          userRole={userRole}
          allowRestore={false}
        />
      )}
    </>
  );
};

export default QuotationVersionHistory;
