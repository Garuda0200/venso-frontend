import React from "react";
import {
  MdAssignment,
  MdAttachMoney,
  MdCheckCircle,
  MdSchedule,
} from "react-icons/md";
import {
  hasAssignedService,
  mergeItineraryDaysByNumber,
} from "../../../utils/serviceAssignment";
import "./VoucherServiceInfo.scss";

const PAID_STATUSES = new Set([
  "paid",
  "approved",
  "completed",
  "pagado",
  "aprobado",
]);

const isPaymentPaid = (paymentRequest) => {
  const status = String(paymentRequest?.status || "").toLowerCase();
  return (
    PAID_STATUSES.has(status) ||
    Boolean(paymentRequest?.paid_at || paymentRequest?.paidAt)
  );
};

const VoucherServiceInfo = ({
  voucher,
  servicesAssigned,
  pendingPaymentsCount,
}) => {
  const countServiceStats = () => {
    if (!servicesAssigned || !voucher.reservationVoucher?.assignedItinerary) {
      return { total: 0, assigned: 0, paid: 0, pending: 0 };
    }

    let total = 0;
    let assigned = 0;
    let paid = 0;
    let pending = 0;

    const itinerary = mergeItineraryDaysByNumber(
      voucher.reservationVoucher.assignedItinerary,
    );

    itinerary.forEach((day) => {
      (day.servicios || []).forEach((service) => {
        total += 1;

        if (!hasAssignedService(service)) return;

        assigned += 1;
        if (isPaymentPaid(service.paymentRequest)) {
          paid += 1;
        } else {
          pending += 1;
        }
      });
    });

    return {
      total,
      assigned,
      paid,
      pending: pending || pendingPaymentsCount || 0,
    };
  };

  if (!servicesAssigned) return null;

  const stats = countServiceStats();
  const progress =
    stats.total > 0 ? Math.min(100, Math.round((stats.assigned / stats.total) * 100)) : 0;

  const statItems = [
    {
      key: "total",
      label: "Servicios",
      value: stats.total,
      icon: MdAssignment,
    },
    {
      key: "assigned",
      label: "Asignados",
      value: stats.assigned,
      icon: MdCheckCircle,
    },
    {
      key: "paid",
      label: "Pagados",
      value: stats.paid,
      icon: MdAttachMoney,
    },
    {
      key: "pending",
      label: "Pendientes",
      value: stats.pending,
      icon: MdSchedule,
    },
  ];

  return (
    <section className="voucher-service-info" aria-label="Estado de servicios">
      <div className="service-overview">
        <div className="service-overview__title">
          <MdAssignment />
          <span>Estado de servicios</span>
        </div>
        <strong>{progress}%</strong>
      </div>

      <div className="service-progress" aria-hidden="true">
        <span style={{ width: `${progress}%` }} />
      </div>

      <div className="service-stat-grid">
        {statItems.map(({ key, label, value, icon: Icon }) => (
          <div className={`service-stat service-stat--${key}`} key={key}>
            <Icon className="service-stat__icon" />
            <div>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

export default VoucherServiceInfo;
