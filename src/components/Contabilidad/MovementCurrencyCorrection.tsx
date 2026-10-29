import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "react-toastify";
import Modal from "../UI/Modal/Modal";
import contabilidadService from "../../services/contabilidadService";
import { paymentCurrency, formatPaymentMoney } from "../../utils/paymentCurrency";
import { accountingSaldoTypeLabel } from "../../utils/accountingBalances";
import "./MovementCurrencyCorrection.scss";

const errorMessage = error => error?.response?.data?.message || error?.message || "No se pudo verificar el ajuste";
const money = (amount, currency) => formatPaymentMoney(amount, currency);

export default function MovementCurrencyCorrection({ movement, role, disabled = false, onSuccess }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [currency, setCurrency] = useState("");
  const [fund, setFund] = useState("");
  const [rate, setRate] = useState("3");
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const generation = useRef(0);
  const inFlight = useRef(false);
  const attempt = useRef(null);
  useEffect(() => {
    if (!open || Number(role) !== 0 || !movement?.id) return;
    let active = true;
    ++generation.current;
    setData(null); setCurrency(""); setFund(""); setReason(""); setPreview(null); setError(""); setUncertain(false);
    attempt.current = null;
    setBusy(true);
    contabilidadService.getMovementCurrencyCorrection(movement.id).then(result => {
      if (!active) return;
      if (!result?.success || !result.data?.movement?.id) throw new Error("No se pudo cargar el estado actual");
      setData(result.data);
      setRate(String(result.data.movement.contexto_pago?.conversion?.tipo_cambio || 3));
    }).catch(err => { if (active) setError(errorMessage(err)); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; ++generation.current; };
  }, [open, movement?.id, role]);
  if (Number(role) !== 0 || !movement?.id) return null;

  const current = data?.movement;
  const currentCurrency = current ? paymentCurrency(current.moneda) : null;
  const funds = (data?.funds || []).filter(item => currency && paymentCurrency(item.moneda) === currency && !(current?.tipo_movimiento === "ingreso" && item.tipo === "cuenta_credito"));
  const needsRate = Boolean(currency && data?.obligation && currency !== data.obligation.currency);
  const locked = busy || uncertain;
  const invalidate = () => { ++generation.current; setPreview(null); setError(""); attempt.current = null; };
  const payload = () => ({ saldo_id: Number(fund), ...(needsRate ? { tasa_cambio: rate } : {}) });
  const close = () => { if (!inFlight.current && !busy) setOpen(false); };
  const calculate = async () => {
    if (inFlight.current || !fund || !data?.eligible) return;
    const version = ++generation.current;
    inFlight.current = true; setBusy(true); setError(""); setPreview(null);
    try {
      const result = await contabilidadService.previewMovementCurrencyCorrection(movement.id, payload());
      if (version !== generation.current) return;
      if (!result?.success || !result.data?.expected_hash) throw new Error("La vista previa no está confirmada");
      setPreview(result.data); attempt.current = null;
    } catch (err) { if (version === generation.current) setError(errorMessage(err)); }
    finally { inFlight.current = false; if (version === generation.current) setBusy(false); }
  };
  const confirm = async () => {
    if (inFlight.current || !preview || reason.trim().length < 5) return;
    // Keep this exact body/key after an uncertain response; retries cannot debit twice.
    if (!attempt.current) attempt.current = { ...payload(), motivo: reason.trim(), expected_hash: preview.expected_hash, idempotency_key: crypto.randomUUID() };
    inFlight.current = true; setBusy(true); setError("");
    try {
      const result = await contabilidadService.correctMovementCurrency(movement.id, attempt.current);
      if (!result?.success || !result.data?.movement?.id) throw new Error("El servidor no confirmó la corrección");
      setUncertain(false); setOpen(false); setPreview(null); attempt.current = null;
      toast.success("Moneda y fondo corregidos");
      try { await onSuccess?.(result.data); }
      catch { toast.warning?.("El ajuste se guardó. Vuelve a abrir el listado para actualizarlo."); }
    } catch (err) {
      const status = err?.response?.status;
      if (status && status >= 400 && status < 500) {
        attempt.current = null; setPreview(null); setUncertain(false);
        setError(errorMessage(err) + " Vuelve a revisar el ajuste antes de confirmar.");
      } else {
        setUncertain(true);
        setError("No se pudo confirmar el resultado. Reintenta la confirmación; se conservará la misma operación.");
      }
    } finally { inFlight.current = false; setBusy(false); }
  };

  const dialog = open && <Modal isOpen onClose={close} title={`Corregir moneda · #${movement.id}`} size="medium" className="movement-currency-correction" actions={[
    { label: "Cerrar", variant: "secondary", onClick: close, disabled: busy },
    ...(data?.eligible ? [{ label: preview ? (uncertain ? "Reintentar confirmación" : "Confirmar corrección") : "Revisar ajuste", onClick: preview ? confirm : calculate,
      disabled: busy || !fund || (needsRate && !(Number(rate) > 0)) || (preview && reason.trim().length < 5) }] : []),
  ]}>
    {busy && !data && <p role="status">Cargando movimiento…</p>}
    {error && <p role="alert" className="mcc-error">{error}</p>}
    {current && <>
      <div className="mcc-current"><span>Registrado</span><strong>{money(current.monto, current.moneda)}</strong><span>{accountingSaldoTypeLabel(current.tipo_cuenta)} · {current.fecha}</span></div>
      {data.obligation && <p className="mcc-obligation">Base del pago <strong>{money(data.obligation.amount, data.obligation.currency)}</strong></p>}
      {!data.eligible && <p role="alert" className="mcc-error">{data.eligibility_reason}</p>}
      {data.eligible && <>
        <fieldset disabled={locked} className="mcc-fields"><legend>Moneda y fondo correctos</legend>
          <div className="mcc-currencies">{[["USD", "$ Dólares"], ["PEN", "S/ Soles"]].map(([value, label]) => <button type="button" key={value} aria-pressed={currency === value} disabled={locked || value === currentCurrency}
            onClick={() => { invalidate(); setCurrency(value); setFund(""); }}>{label}</button>)}</div>
          <label htmlFor="mcc-fund">Fondo de destino</label>
          <select id="mcc-fund" value={fund} disabled={!currency || locked} onChange={event => { invalidate(); setFund(event.target.value); }}>
            <option value="">Selecciona el fondo utilizado</option>
            {funds.map(item => <option key={item.id} value={item.id}>{accountingSaldoTypeLabel(item.tipo)} · {paymentCurrency(item.moneda)} · {item.year_saldo}</option>)}
          </select>
          {currency && funds.length === 0 && <p role="alert">No hay fondos de esa moneda para el año y plataforma del movimiento.</p>}
          {needsRate && <><label htmlFor="mcc-rate">Tipo de cambio · PEN por 1 USD</label><input id="mcc-rate" type="number" min="0.0001" max="999999.9999" step="0.0001" value={rate} onChange={event => { invalidate(); setRate(event.target.value); }} /></>}
          <label htmlFor="mcc-reason">Motivo de la corrección</label><textarea id="mcc-reason" rows={2} minLength={5} maxLength={500} value={reason} onChange={event => setReason(event.target.value)} placeholder="Describe el error registrado" />
        </fieldset>
        {preview && <section aria-label="Vista previa de corrección" className="mcc-preview">
          <div><span>Importe corregido</span><strong>{money(preview.destination.amount, preview.destination.moneda)}</strong></div>
          <div><span>{accountingSaldoTypeLabel(preview.origin_fund.tipo)} · {paymentCurrency(preview.origin_fund.moneda)}</span><strong>{money(preview.origin_fund.saldo_actual, preview.origin_fund.moneda)} → {money(preview.origin_balance_after, preview.origin_fund.moneda)}</strong></div>
          <div><span>{accountingSaldoTypeLabel(preview.destination_fund.tipo)} · {paymentCurrency(preview.destination_fund.moneda)}</span><strong>{money(preview.destination_fund.saldo_actual, preview.destination_fund.moneda)} → {money(preview.destination_balance_after, preview.destination_fund.moneda)}</strong></div>
          <p>Se conservarán la fecha, las referencias y los comprobantes.</p>
        </section>}
      </>}
      {data.history?.length > 0 && <details className="mcc-history"><summary>Historial de correcciones ({data.history.length})</summary>{data.history.map(item => <article key={item.id}>
        <strong>{money(item.before.monto, item.before.moneda)} → {money(item.after.monto, item.after.moneda)}</strong><p>{item.motivo}</p><small>{new Date(item.created_at).toLocaleString("es-PE")} · {item.actor_id}</small>
      </article>)}</details>}
    </>}
  </Modal>;
  return <>
    <button type="button" className="mcc-launch" disabled={disabled} onClick={() => setOpen(true)}>Corregir moneda y fondo</button>
    {dialog && createPortal(dialog, document.body)}
  </>;
}
