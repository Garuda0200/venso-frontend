import React, { useEffect, useRef, useState } from "react";
import Modal from "../../../../../components/UI/Modal/Modal";
import MovimientoForm from "../../../../../components/Contabilidad/MovimientoForm";
import LiquidacionForm from "../../../../../components/Contabilidad/LiquidacionForm";
import api from "../../../../../utils/axiosInstance";
import { voucherReservaService } from "../../../../../services/voucherReservaService";
import { createLatestRequest } from "../../../../../utils/latestRequest";
import { getPaymentServiceId, normalizePaymentItinerary, enrichPaymentItinerary } from "../../utils/reservationPaymentManagement";
import { ticketDraft, ticketDraftTotal, ticketName, ticketPricingPayload, prepareTicketRequests, ticketMovementPrefill } from "../../utils/ticketPayment";
import { assignedPaymentCurrency, convertPaymentPricing, formatPaymentMoney, sumPaymentCurrencies, formatPaymentTotals } from "../../../../../utils/paymentCurrency";
import "./TicketPaymentModal.scss";

export default function TicketPaymentModal({ voucherId, voucherVentaId, voucherCode, onClose, onPaymentSuccess }) {
  const [services, setServices] = useState<any[]>([]);
  const [drafts, setDrafts] = useState<Record<string, any>>({});
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [paying, setPaying] = useState<any[] | null>(null);
  const session = useRef(createLatestRequest());
  const operation = useRef(false);
  const generation = useRef(0);
  const refresh = async () => {
    const token = session.current.begin();
    setLoading(true); setError("");
    try {
      const [itinerary, requests] = await Promise.all([
        voucherReservaService.getItinerarioByVoucherVenta(voucherVentaId, { skipCache: true }),
        voucherReservaService.getPaymentRequestsByVoucherReservaId(voucherId, { skipCache: true }),
      ]);
      if (!session.current.isCurrent(token)) return;
      const normalized = enrichPaymentItinerary(normalizePaymentItinerary(itinerary), requests);
      const next = normalized.flatMap(day => day.servicios.filter(service => service.typeService === "tickets")
        .map(service => ({ ...service, dayNumber: day.numero, dayTitle: day.titulo })));
      setServices(next); setDrafts(Object.fromEntries(next.map(service => [getPaymentServiceId(service), ticketDraft(service)])));
      setSelected(new Set());
    } catch (err) {
      if (session.current.isCurrent(token)) setError(err?.response?.data?.message || err.message || "No se pudieron verificar las entradas");
    } finally { if (session.current.isCurrent(token)) setLoading(false); }
  };
  useEffect(() => {
    generation.current++;
    operation.current = false; setBusy(false); setPaying(null);
    refresh();
    return () => { generation.current++; session.current.cancel(); };
  }, [voucherId, voucherVentaId]);
  const run = async (action) => {
    if (operation.current) return;
    operation.current = true; setBusy(true); setError("");
    const token = session.current.begin();
    const currentGeneration = generation.current;
    try { await action(() => session.current.isCurrent(token)); }
    catch (err) { if (session.current.isCurrent(token)) setError(err?.response?.data?.message || err.message || "No se completó la operación"); }
    finally { if (generation.current === currentGeneration) { operation.current = false; setBusy(false); } }
  };
  const change = (id, patch) => setDrafts(current => ({ ...current, [id]: { ...current[id], ...patch, dirty: true } }));
  const selectedServices = services.filter(service => selected.has(getPaymentServiceId(service)));
  const ready = selectedServices.length > 0 && selectedServices.every(service => service.isAssigned && !drafts[getPaymentServiceId(service)]?.dirty);
  const requestSelected = (pay = false) => run(async isCurrent => {
    if (pay && new Set(selectedServices.map(assignedPaymentCurrency)).size > 1) {
      throw new Error("Para pagar un lote selecciona entradas de una misma moneda");
    }
    const requests = await prepareTicketRequests({ services: selectedServices, voucherId, api: voucherReservaService, isCurrent });
    if (!requests || !isCurrent()) return;
    if (pay) {
      if (new Set(requests.map(request => request.currency || "USD")).size > 1) throw new Error("Para pagar un lote selecciona entradas de una misma moneda");
      setPaying(requests);
    } else {
      await refresh();
      setBusy(false);
      await onPaymentSuccess?.();
    }
    window.dispatchEvent(new CustomEvent("paymentRequestCreated", { detail: { voucherReservaId: voucherId } }));
  });
  const completed = async () => { setPaying(null); await refresh(); await onPaymentSuccess?.(); };
  return <>
    <Modal isOpen onClose={onClose} title={`Pagos de entradas · ${voucherCode || ""}`} size="large" className="ticket-payment-modal">
      <div className="ticket-payments">
        <div className="ticket-payments__toolbar">
          <span>Conserva la entrada cotizada y ajusta sólo su costo operativo.</span>
          <button type="button" disabled={busy || loading} onClick={refresh}>Actualizar</button>
        </div>
        {error && <p role="alert" className="ticket-payments__error">{error}</p>}
        {loading ? <p role="status">Verificando entradas y solicitudes…</p> : services.length === 0 ? <p>No hay entradas en esta reserva.</p> :
          services.map(service => {
            const id = getPaymentServiceId(service), draft = drafts[id];
            const request = service.paymentRequest, locked = Boolean(request);
            const childOnly = !draft.adults.length && draft.children.length > 0;
            let total = 0; try { total = ticketDraftTotal(service, draft); } catch { /* Invalid drafts are rejected before saving. */ }
            return <article key={id} className={`ticket-payments__card ${selected.has(id) ? "is-selected" : ""}`}>
              <header>
                <input type="checkbox" aria-label={`Seleccionar ${ticketName(service)} día ${service.dayNumber}`}
                  checked={selected.has(id)} disabled={busy || request?.status === "paid"}
                  onChange={event => { setError(""); setSelected(current => { const next = new Set(current); event.target.checked ? next.add(id) : next.delete(id); return next; }); }} />
                <div><small>Día {service.dayNumber} · {service.dayTitle}</small>
                  <h3>{ticketName(service)}</h3>
                  <small>{[service.childService?.procedencia, service.childService?.tipo_usuario].filter(Boolean).join(" · ")}</small>
                </div>
                <strong>{formatPaymentMoney(total, draft.currency)}</strong>
                <span>{request?.status === "paid" ? "Pagado" : request ? "Pendiente" : service.isAssigned ? "Validada" : "Sin validar"}</span>
              </header>
              {service.isAssigned && <fieldset disabled={locked || busy}>
                <legend>Costo operativo · {draft.adults.length} adultos · {draft.children.length} niños</legend>
                <div className="ticket-payments__prices">
                  <div className="ticket-payments__currencies" aria-label="Moneda del costo">
                    {["USD", "PEN"].map(currency => <button type="button" key={currency} aria-pressed={draft.currency === currency}
                      onClick={() => { try {
                        const converted = convertPaymentPricing({ ...draft, childRows: draft.children }, currency, draft.exchangeRate);
                        change(id, { ...converted, children: converted.childRows });
                      } catch (err) { setError(err.message); } }}>{currency}</button>)}
                  </div>
                  <label>TC · PEN por USD<input type="number" min="0.0001" step="0.0001" value={draft.exchangeRate} onChange={event => change(id, { exchangeRate: event.target.value })} /></label>
                  {!childOnly && <label>Precio adulto<input type="number" min="0" step="0.01" value={draft.adultUnitPrice} onChange={event => change(id, { adultUnitPrice: event.target.value })} /></label>}
                  {draft.children.map((child, index) => <label key={child.id}>Niño {index + 1}<input type="number" min="0" step="0.01" value={child.precio ?? child.price ?? 0}
                    onChange={event => change(id, { children: draft.children.map((row, i) => i === index ? { ...row, precio: event.target.value } : row) })} /></label>)}
                </div>
              </fieldset>}
              <footer>
                {!service.isAssigned && <button type="button" disabled={busy} onClick={() => run(async isCurrent => {
                  await voucherReservaService.validateQuotedService(id);
                  if (isCurrent()) { await refresh(); setBusy(false); await onPaymentSuccess?.(); }
                })}>Validar misma entrada</button>}
                {service.isAssigned && !locked && <button type="button" disabled={!draft.dirty || busy} onClick={() => run(async isCurrent => {
                  await api.put(`/turismo/vouchers-reserva/servicio/${id}/ticket-pricing`, ticketPricingPayload(service, draft));
                  if (isCurrent()) { await refresh(); setBusy(false); await onPaymentSuccess?.(); }
                })}>Guardar precios</button>}
                {request?.status === "pending" && <button type="button" disabled={busy} onClick={() => run(async isCurrent => {
                  await voucherReservaService.cancelPendingPaymentRequest(request.id, "Ajuste de entrada");
                  if (isCurrent()) { await refresh(); setBusy(false); await onPaymentSuccess?.(); }
                })}>Cancelar solicitud</button>}
                {request?.status === "paid" && <small>El pago y su evidencia se consultan desde Gestión de pagos.</small>}
              </footer>
            </article>;
          })}
        <div className="ticket-payments__actions">
          <strong>{selectedServices.length} seleccionadas · {formatPaymentTotals(sumPaymentCurrencies(selectedServices,
            service => getAssignedAmount(service), service => drafts[getPaymentServiceId(service)]?.currency || "USD"))}</strong>
          <button type="button" disabled={!ready || busy || loading || !!error} onClick={() => requestSelected(false)}>Solicitar pagos</button>
          <button type="button" disabled={!ready || busy || loading || !!error} onClick={() => requestSelected(true)}>Pagar seleccionadas</button>
        </div>
      </div>
    </Modal>
    {paying?.length === 1 && <div className="ticket-payments__payment-layer"><MovimientoForm tipo="egreso" isOpen onClose={() => setPaying(null)} onSuccess={completed} initialData={ticketMovementPrefill(paying[0], voucherCode)} /></div>}
    {paying && paying.length > 1 && <div className="ticket-payments__payment-layer"><LiquidacionForm isOpen selectedPayments={paying} onClose={() => setPaying(null)} onSuccess={completed} /></div>}
  </>;
}
function getAssignedAmount(service) { return Number(service.assignedPrecioTotal ?? service.assigned_precio_total ?? 0); }
