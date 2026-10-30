import React from "react";
import { MdCheck, MdWarning, MdInfoOutline } from "react-icons/md";
import { formatPaymentMoney } from "../../../../../../utils/paymentCurrency";
import "./VoucherPaymentInfo.scss";

const VoucherPaymentInfo = ({rows = [], unknownCosts = 0}) => (
  <div className="voucher-payment-info">
    {unknownCosts > 0 && <small role="status">{unknownCosts} costo(s) por confirmar</small>}
    {rows.map(({currency,total,paid,percentage}) => {
      const completed=total===0?paid===0:paid>=total;
      const status=total===0&&paid>0 ? {label:"Revisar moneda",className:"pending",icon:<MdWarning />} :
        completed ? {label:total===0?"Sin saldo":"Completado",className:"completed",icon:<MdCheck />} :
        paid>0 ? {label:"Parcial",className:"partial",icon:<MdWarning />} :
        {label:"Pendiente",className:"pending",icon:<MdInfoOutline />};
      return <div className="payment-progress" key={currency} aria-label={`Pagos en ${currency}`}>
        <div className="progress-header">
          <div className={`progress-status ${status.className}`}>{status.icon}<span>{status.label} · {currency}</span></div>
          <div className="progress-percentage">{percentage.toFixed(0)}%</div>
        </div>
        <div className="progress-bar-container"><div className="progress-bar" style={{width:`${percentage}%`}} /></div>
        <div className="progress-amounts">
          <div className="amount-item"><span className="amount-label">Pagado:</span><span className="paid-amount">{formatPaymentMoney(paid,currency)}</span></div>
          <div className="amount-item"><span className="amount-label">Total:</span><span className="total-amount">{formatPaymentMoney(total,currency)}</span></div>
        </div>
      </div>;
    })}
  </div>
);

export default VoucherPaymentInfo;
