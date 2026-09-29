import React from "react";
import "./VoucherHeader.scss";

const VoucherHeader = ({ voucher }) => {
  const voucherCode = voucher.voucherCode || `VR-${voucher.id}`;

  return (
    <div className="voucher-header">
      <div className="voucher-id">
        <span className="id-label">Voucher Reserva:</span>
        <span className="id-value">{voucherCode}</span>
      </div>
    </div>
  );
};

export default VoucherHeader;
