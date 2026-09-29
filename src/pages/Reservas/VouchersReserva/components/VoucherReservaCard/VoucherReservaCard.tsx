import React from "react";
import "./VoucherReservaCard.scss";
import QuotationVersionHistory from "../QuotationVersionHistory/QuotationVersionHistory";

// Import fragmented components (SOLID principles & Hexagonal Architecture)
import VoucherHeader from "./components/VoucherHeader";
import VoucherBasicInfo from "./components/VoucherBasicInfo";
import VoucherPaymentInfo from "./components/VoucherPaymentInfo";
import VoucherServiceInfo from "./components/VoucherServiceInfo";
import VoucherActions from "./components/VoucherActions";
import {
  getAssignedTariff,
  hasAssignedService,
  mergeItineraryDaysByNumber,
} from "../../utils/serviceAssignment";

const VoucherReservaCard = ({
  voucher,
  onAssignServices,
  onViewServicesSummary,
  onUnlinkServices,
  onViewVoucher,
  onVoucherMedia,
  onAgencyPayment,
  onManagePayments,
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

  const formatCurrency = (amount) => {
    if (amount === undefined || amount === null) return "$0.00";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  // ============================================
  // COMPUTED VALUES
  // ============================================

  const servicesAssigned = Boolean(
    voucher.hasAssignedServices ||
      voucher.reservationVoucher?.hasAssignedServices,
  );

  // Calcular el costo total de los servicios del itinerario asignado
  const calculateTotalServicesCost = () => {
    if (!servicesAssigned || !voucher.reservationVoucher?.assignedItinerary) {
      return null;
    }

    try {
      let totalCost = 0;

      const itinerary = mergeItineraryDaysByNumber(
        voucher.reservationVoucher.assignedItinerary,
      );

      itinerary.forEach((day) => {
        if (day.servicios && Array.isArray(day.servicios)) {
          day.servicios.forEach((service) => {
            if (!service.isAssigned) return;
            if (!hasAssignedService(service)) return;
            // Usar tarifa asignada (assignedTariff) con fallback a tariff de cotización
            const tariff = getAssignedTariff(service);
            const price = parseFloat(
              tariff?.precio_original_with_child_extras ||
                tariff?.precio_original ||
                0,
            );
            const quantity = parseInt(service.cantidad || 1);
            const serviceCost = price * quantity;

            if (serviceCost > 0) {
              totalCost += serviceCost;
            }
          });
        }
      });

      return totalCost > 0 ? totalCost : null;
    } catch (error) {
      console.error("Error calculando el costo total de los servicios:", error);
      return null;
    }
  };

  const totalServicesCost = calculateTotalServicesCost();
  const totalPaid = calculateTotalPaid();
  const pendingPaymentsCount = countPendingPayments();
  const paymentPercentage =
    totalServicesCost > 0
      ? Math.min(100, (totalPaid / totalServicesCost) * 100)
      : 0;
  const paymentCompleted =
    totalPaid >= totalServicesCost && totalServicesCost > 0;

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
        {servicesAssigned && totalServicesCost > 0 ? (
          <VoucherPaymentInfo
            totalServicesCost={totalServicesCost}
            totalPaid={totalPaid}
            paymentPercentage={paymentPercentage}
            formatCurrency={formatCurrency}
          />
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
          onManageDocuments={onManageDocuments}
          userRole={userRole}
          paymentCompleted={paymentCompleted}
        />
        <QuotationVersionHistory voucher={voucher} variant="card" />
      </section>
    </article>
  );

  // ============================================
  // HELPER FUNCTIONS (extracted for reusability)
  // ============================================

  function calculateTotalPaid() {
    if (!servicesAssigned || !voucher.reservationVoucher?.assignedItinerary) {
      return 0;
    }

    let totalPaid = 0;
    const itinerary = mergeItineraryDaysByNumber(
      voucher.reservationVoucher.assignedItinerary,
    );

    itinerary.forEach((day) => {
      if (day.servicios && Array.isArray(day.servicios)) {
        day.servicios.forEach((service) => {
          const status = String(service.paymentRequest?.status || "").toLowerCase();
          const isPaid =
            ["paid", "approved", "completed", "pagado", "aprobado"].includes(
              status,
            ) || Boolean(service.paymentRequest?.paid_at);

          if (isPaid) {
            totalPaid += parseFloat(service.paymentRequest.amount) || 0;
          }
        });
      }
    });

    return totalPaid;
  }

  function countPendingPayments() {
    if (!servicesAssigned || !voucher.reservationVoucher?.assignedItinerary) {
      return 0;
    }

    let pendingCount = 0;
    const itinerary = mergeItineraryDaysByNumber(
      voucher.reservationVoucher.assignedItinerary,
    );

    itinerary.forEach((day) => {
      if (day.servicios && Array.isArray(day.servicios)) {
        day.servicios.forEach((service) => {
          const hasAssignment = hasAssignedService(service);
          if (hasAssignment) {
            const status = String(
              service.paymentRequest?.status || "",
            ).toLowerCase();
            const isPaid =
              ["paid", "approved", "completed", "pagado", "aprobado"].includes(
                status,
              ) || Boolean(service.paymentRequest?.paid_at);
            if (!isPaid) {
              pendingCount++;
            }
          }
        });
      }
    });

    return pendingCount;
  }
};

export default React.memo(VoucherReservaCard);
