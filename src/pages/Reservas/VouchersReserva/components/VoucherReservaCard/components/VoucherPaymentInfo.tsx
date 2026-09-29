import React from "react";
import { MdCheck, MdWarning, MdInfoOutline } from "react-icons/md";
import "./VoucherPaymentInfo.scss";

const VoucherPaymentInfo = ({
  totalServicesCost,
  totalPaid,
  paymentPercentage,
  formatCurrency,
}) => {
  // Determinar estado de pago
  const getPaymentStatus = () => {
    if (!totalServicesCost || totalServicesCost === 0) {
      return {
        label: "Sin servicios",
        icon: <MdInfoOutline />,
        className: "no-services",
      };
    }

    if (totalPaid >= totalServicesCost) {
      return { label: "Completado", icon: <MdCheck />, className: "completed" };
    } else if (totalPaid > 0) {
      return { label: "Parcial", icon: <MdWarning />, className: "partial" };
    } else {
      return {
        label: "Pendiente",
        icon: <MdInfoOutline />,
        className: "pending",
      };
    }
  };

  const paymentStatus = getPaymentStatus();

  return (
    <div className="voucher-payment-info">
      <div className="payment-progress">
        <div className="progress-header">
          <div className={`progress-status ${paymentStatus.className}`}>
            {paymentStatus.icon}
            <span>{paymentStatus.label}</span>
          </div>
          <div className="progress-percentage">
            {paymentPercentage.toFixed(0)}%
          </div>
        </div>

        <div className="progress-bar-container">
          <div
            className="progress-bar"
            style={{ width: `${paymentPercentage}%` }}
          />
        </div>

        <div className="progress-amounts">
          <div className="amount-item">
            <span className="amount-label">Pagado:</span>
            <span className="paid-amount">{formatCurrency(totalPaid)}</span>
          </div>
          <div className="amount-item">
            <span className="amount-label">Total:</span>
            <span className="total-amount">
              {formatCurrency(totalServicesCost)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VoucherPaymentInfo;
