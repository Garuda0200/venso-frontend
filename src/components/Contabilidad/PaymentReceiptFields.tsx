export default function PaymentReceiptFields({
  values,
  onChange,
  disabled = false
}) {
  return <div className="receipt-payment-fields">
    <div className="form-group">
      <label htmlFor="receipt-metodo-pago">Método de pago <small>(opcional)</small></label>
      <input id="receipt-metodo-pago" name="metodo_pago" type="text" value={values.metodo_pago || ""} onChange={onChange} maxLength={50} disabled={disabled} placeholder="Ej.: transferencia, efectivo, tarjeta" />
    </div>
    <div className="form-group">
      <label htmlFor="receipt-referencia-pago">Referencia / código de pago <small>(opcional)</small></label>
      <input id="receipt-referencia-pago" name="referencia_pago" type="text" value={values.referencia_pago || ""} onChange={onChange} maxLength={50} disabled={disabled} placeholder="Código de operación, hasta 50 caracteres" />
    </div>
  </div>;
}
