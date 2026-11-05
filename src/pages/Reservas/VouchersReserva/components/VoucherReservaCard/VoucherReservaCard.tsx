import React from "react";
import "./VoucherReservaCard.scss";
import QuotationVersionHistory from "../QuotationVersionHistory/QuotationVersionHistory";

// Import fragmented components (SOLID principles & Hexagonal Architecture)
import VoucherHeader from "./components/VoucherHeader";
import VoucherBasicInfo from "./components/VoucherBasicInfo";
import VoucherPaymentInfo from "./components/VoucherPaymentInfo";
import VoucherServiceInfo from "./components/VoucherServiceInfo";
import VoucherActions from "./components/VoucherActions";
import { buildReservationVoucherPaymentSummary } from "../../utils/reservationVoucherRender";

const VoucherReservaCard = ({
  voucher,
  onAssignServices,
  onViewServicesSummary,
  onUnlinkServices,
  onViewVoucher,
  onVoucherMedia,
  onAgencyPayment,
  onManagePayments,
  onManageQuotationPayments,
  onEditPassengers,
  onManageDocuments,
  onPreviewPDF,
  userRole = 1,
  allVouchers = [],
  viewMode = "grid", // Support for grid/list view
}) => {
  // ============================================
  // UTILITY FUNCTIONS
  // ============================================

  const parseLocalDate = (dateInput) => {
    if (!dateInput) return null;
    if (dateInput instanceof Date) {
      return Number.isNaN(dateInput.getTime()) ? null : dateInput;
    }
    const value = String(dateInput).trim();
    if (!value) return null;

    const isoDateOnly = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoDateOnly && !value.includes("T")) {
      const [, year, month, day] = isoDateOnly;
      return new Date(Number(year), Number(month) - 1, Number(day));
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  const formatDate = (dateString, showWeekday = false) => {
    if (!dateString) return "N/A";

    try {
      const date = parseLocalDate(dateString);
      if (!date) return "Fecha inválida";

      const options = {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      };

      if (showWeekday) {
        options.weekday = "short";
      }

      return date.toLocaleDateString("es-ES", options);
    } catch (error) {
      console.error("Error formatting date:", error);
      return "Fecha inválida";
    }
  };

  // ============================================
  // COMPUTED VALUES
  // ============================================

  const servicesAssigned = Boolean(
    voucher.hasAssignedServices ||
      voucher.reservationVoucher?.hasAssignedServices,
  );

  const paymentSummary = buildReservationVoucherPaymentSummary(voucher.reservationVoucher?.assignedItinerary || []);
  const { pendingPaymentsCount, paymentCompleted } = paymentSummary;

  // ============================================
  // RENDER
  // ============================================

  return (
    <article
      className={`voucher-reserva-card voucher-styled-row ${viewMode} ${servicesAssigned ? "has-services" : ""}`}
    >
      <section className="voucher-list-section voucher-list-section--identity">
        <VoucherHeader voucher={voucher} />
      </section>

      <section className="voucher-list-section voucher-list-section--travel">
        <VoucherBasicInfo voucher={voucher} formatDate={formatDate} />
      </section>

      <section className="voucher-list-section voucher-list-section--services">
        <VoucherServiceInfo
          voucher={voucher}
          servicesAssigned={servicesAssigned}
          pendingPaymentsCount={pendingPaymentsCount}
        />
      </section>

      <section className="voucher-list-section voucher-list-section--payment">
        {servicesAssigned ? (
          <VoucherPaymentInfo rows={paymentSummary.rows} unknownCosts={paymentSummary.unknownCosts} />
        ) : (
          <div className="voucher-list-empty-payment">
            <span>Pagos</span>
            <strong>Sin servicios asignados</strong>
          </div>
        )}
      </section>

      <section className="voucher-list-section voucher-list-section--controls">
        <VoucherActions
          voucher={voucher}
          servicesAssigned={servicesAssigned}
          onViewVoucher={onViewVoucher}
          onVoucherMedia={onVoucherMedia}
          onAgencyPayment={onAgencyPayment}
          onPreviewPDF={onPreviewPDF}
          onAssignServices={onAssignServices}
          onViewServicesSummary={onViewServicesSummary}
          onUnlinkServices={onUnlinkServices}
          onManagePayments={onManagePayments}
          onManageQuotationPayments={onManageQuotationPayments}
          onEditPassengers={onEditPassengers}
          onManageDocuments={onManageDocuments}
          userRole={userRole}
          paymentCompleted={paymentCompleted}
        />
        <QuotationVersionHistory voucher={voucher} variant="card" />
      </section>
    </article>
  );

};

export default React.memo(VoucherReservaCard);
