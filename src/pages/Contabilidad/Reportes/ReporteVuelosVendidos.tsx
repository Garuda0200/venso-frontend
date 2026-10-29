import React, { useEffect, useState } from "react";
import { MdFlight, MdFlightTakeoff, MdFlightLand, MdPerson, MdChildCare, MdRefresh, MdReceiptLong, MdCalendarToday, MdExpandMore, MdInfoOutline, MdCheckCircleOutline, MdGroups } from "react-icons/md";
import axiosInstance from "../../../utils/axiosInstance";
import { flightBeneficiaryLabel, flightMoney, flightOrigin, flightPaymentLabels, flightRoute, flightSource, pricingCaption, reportDate, summarizeFlightCurrencies } from "./utils/soldFlightReport";
import "./ReporteVuelosVendidos.scss";

const initialFilters = { search: "", source: "", origin: "", status: "", date_from: "", date_to: "" };

function Catalog({ catalog = {}, assigned = false, pricing, currency }) {
  return <section className={`sold-flights__catalog${assigned ? " sold-flights__catalog--assigned" : ""}`} aria-label={assigned ? "Vuelo asignado" : "Vuelo cotizado"}>
    <div className="sold-flights__catalog-heading"><span className="sold-flights__catalog-icon"><MdFlight aria-hidden="true" /></span>
      <div><small className="sold-flights__eyebrow">{assigned ? "Asignado al proveedor" : "Vuelo cotizado"}</small><strong>{catalog.provider || (assigned ? "Proveedor sin registrar" : "Vuelo sin proveedor")}</strong></div>
      {pricing && <div className="sold-flights__catalog-price"><small>Total {assigned ? "asignado" : "cotizado"}</small><strong>{flightMoney(pricing.total, currency)}</strong></div>}
    </div>
    <div className="sold-flights__catalog-tags"><span>{flightOrigin(catalog)}</span><span>{catalog.type || "Tipo sin registrar"}</span>{catalog.baggage && <span>Equipaje: {catalog.baggage}</span>}</div>
    <div className="sold-flights__route" aria-label={flightRoute(catalog)}><span><MdFlightTakeoff aria-hidden="true" />{catalog.departure || "Origen sin registrar"}</span><span className="sold-flights__route-arrow" aria-hidden="true">→</span><span><MdFlightLand aria-hidden="true" />{catalog.destination || "Destino sin registrar"}</span></div>
    {(catalog.departure_time || catalog.arrival_time) && <small>{catalog.departure_time || "—"} – {catalog.arrival_time || "—"}</small>}
    {pricing && <div className="sold-flights__catalog-caption"><span>{pricingCaption(pricing, currency)}</span><span>{pricing.count} pax</span></div>}
  </section>;
}

function BeneficiaryChip({ person, people, currency }) {
  const child = person.passenger_type === "child";
  return <span className={`sold-flights__person${child ? " sold-flights__person--child" : ""}`}>
    {child ? <MdChildCare aria-hidden="true" /> : <MdPerson aria-hidden="true" />}
    <span>{flightBeneficiaryLabel(person, people)}{person.tariff === "child_as_adult" && <small>Tarifa adulto</small>}</span>
    <strong>{flightMoney(person.amount, currency)}</strong>
  </span>;
}

function Pricing({ title, pricing, currency, people, igv }) {
  if (!pricing) return <section className="sold-flights__pricing sold-flights__pricing--empty"><h4>{title}</h4><MdInfoOutline aria-hidden="true" /><p>Aún no asignado. No se interpreta como costo cero.</p></section>;
  return <section className="sold-flights__pricing">
    <h4>{title}</h4>
    <div className="sold-flights__price-heading"><strong>{flightMoney(pricing.total, currency)}</strong><span>{pricing.count} beneficiarios</span></div>
    <p>{pricingCaption(pricing, currency)}</p>
    <small>IGV en el registro: {igv ? "Sí" : "No"}. Importes guardados; no se añade fee ni se convierte la moneda.</small>
    <div className="sold-flights__people" role="list" aria-label={`Beneficiarios: ${title}`}>{pricing.beneficiaries.map((p) => <div role="listitem" key={p.id}><BeneficiaryChip person={p} people={people} currency={currency} /><small className="sold-flights__tariff-label">{p.tariff === "child_as_adult" ? "Niño con tarifa adulto" : p.passenger_type === "child" ? "Tarifa niño" : "Adulto"}</small></div>)}</div>
    {!pricing.uniform && pricing.average != null && <small>Promedio informativo: {flightMoney(pricing.average, currency)} / beneficiario. No es una tarifa uniforme.</small>}
    {pricing.warnings?.length > 0 && <div className="sold-flights__warning" role="note">
      {pricing.warnings.map((w) => <p key={w}>{w}</p>)}
      {pricing.difference != null && <span>Total − suma del desglose: {flightMoney(pricing.difference, currency)}</span>}
    </div>}
  </section>;
}

function FlightDetails({ row }) {
  return <details className="sold-flights__detail"><summary><span><MdReceiptLong aria-hidden="true" />Ver beneficiarios y pagos</span><MdExpandMore className="sold-flights__expand" aria-hidden="true" /></summary>
    <div className="sold-flights__detail-grid">
      <Pricing title="Cotizado" pricing={row.quoted_pricing} currency={row.moneda} people={row.people_labels} igv={row.igv} />
      <Pricing title="Asignado al proveedor" pricing={row.assigned_pricing} currency={row.assigned_moneda} people={row.people_labels} igv={row.assigned_igv} />
    </div>
    <section className="sold-flights__payments"><h4>Solicitudes y liquidación al proveedor</h4>
      <p className="sold-flights__note">El costo por pasajero corresponde al desglose asignado de arriba. La liquidación se vincula al servicio, no identifica qué pasajero se pagó primero. Los créditos no equivalen a una salida nueva de dinero.</p>
      {!row.payments.length && <p>No hay solicitud. El vuelo sigue cotizado y se incluye en este reporte.</p>}
      {row.payments.map((p) => <div key={p.id}>
        <strong>{flightPaymentLabels[p.status] || p.status}</strong>
        <span>Solicitado: {flightMoney(p.requested, p.currency)} · Liquidado: {flightMoney(p.settled, p.currency)}</span>
        {p.paid_at && <small>Fecha de liquidación: {reportDate(p.paid_at)}</small>}
        {p.allocations.map((a, index) => <small key={index}>{a.source === "MOVEMENT" ? "Movimiento aplicado" : "Crédito / saldo aplicado"}: {flightMoney(a.amount, a.currency)}</small>)}
        {p.movement_id && <small>Movimiento #{p.movement_id}: {flightMoney(p.movement_amount, p.movement_currency)}. Referencia bancaria; no se suma de nuevo ni se reparte como tarifa de pax.</small>}
        {p.legacy && <small className="sold-flights__warning">Registro histórico sin desglose de liquidación; importe según solicitud{p.status === "paid" && !p.movement_id ? ". Sin movimiento vinculado: requiere revisión" : ""}.</small>}
      </div>)}
    </section>
  </details>;
}

function FlightCard({ row }) {
  const external = row.source === "cotizacion_externa";
  const beneficiaries = row.quoted_pricing.beneficiaries || [];
  const review = row.quoted_pricing.warnings.length > 0 || row.assigned_pricing?.warnings.length > 0;
  return <article className={`sold-flight-card${external ? " sold-flight-card--external" : ""}`} aria-label={`Vuelo ${row.quote_id}, servicio ${row.service_id}`}>
    <div className="sold-flight-card__context"><div><span className="sold-flight-card__quote"><MdReceiptLong aria-hidden="true" />{row.quote_id}</span><span className="sold-flight-card__title">{row.quote_title}</span></div><span><MdCalendarToday aria-hidden="true" />{reportDate(row.travel_start)} · Día {row.day_number}</span></div>
    <div className="sold-flight-card__header"><div className="sold-flight-card__identity"><MdFlight className="sold-flight-card__flight-icon" aria-hidden="true" /><h3>{row.quoted_catalog.provider || "Vuelo sin proveedor"}</h3><span className="sold-flight-card__source">{flightSource(row.source)}</span><span className="sold-flight-card__pax"><MdGroups aria-hidden="true" />{row.quoted_pricing.count} pax cotizados</span></div><span className={`sold-flights__badge sold-flights__badge--${row.payment_status}`}>{row.payment_status === "paid" && <MdCheckCircleOutline aria-hidden="true" />}{flightPaymentLabels[row.payment_status]}</span></div>
    <div className="sold-flight-card__files">{row.vouchers.map((v) => <span key={v.id}>{v.code}{!v.initialized && <small> · Registro inicial</small>}</span>)}</div>
    <div className="sold-flight-card__catalogs"><Catalog catalog={row.quoted_catalog} pricing={row.quoted_pricing} currency={row.moneda} />{row.is_assigned ? <Catalog catalog={row.assigned_catalog} assigned pricing={row.assigned_pricing} currency={row.assigned_moneda} /> : <section className="sold-flights__unassigned"><span className="sold-flights__catalog-icon"><MdFlight aria-hidden="true" /></span><div><strong>Sin asignar</strong><p>El vuelo está cotizado; aún no tiene proveedor operativo ni costo asignado.</p></div></section>}</div>
    {beneficiaries.length > 0 && <div className="sold-flight-card__beneficiaries"><span className="sold-flight-card__beneficiary-label"><MdPerson aria-hidden="true" />Beneficiarios cotizados</span><div className="sold-flight-card__beneficiary-items">{beneficiaries.slice(0,4).map((p) => <BeneficiaryChip key={p.id} person={p} people={row.people_labels} currency={row.moneda} />)}{beneficiaries.length > 4 && <span className="sold-flight-card__more">+{beneficiaries.length - 4} en el detalle</span>}</div></div>}
    <div className="sold-flight-card__audit"><span>Servicio #{row.service_id} · {row.request_count} solicitud(es)</span>{review && <span className="sold-flights__warning"><MdInfoOutline aria-hidden="true" />Desglose por revisar</span>}</div>
    <FlightDetails row={row} />
  </article>;
}

export function ReporteVuelosVendidos({ api = axiosInstance } = {}) {
  const [draft, setDraft] = useState(initialFilters);
  const [filters, setFilters] = useState(initialFilters);
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(""); setData(null);
    api.get("/turismo/reports/sold-flights", { params: { ...filters, page, page_size: 25 }, signal: controller.signal,
      _skipDedup: true, headers: { "Cache-Control": "no-cache, no-store" } })
      .then((response) => { if (!controller.signal.aborted) setData(response.data.data); })
      .catch((err) => { if (!controller.signal.aborted) setError(err.response?.status === 403 ? "No tienes permiso para consultar este reporte de Venso." : "No se pudo cargar el reporte. Intenta actualizarlo."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [api, filters, page, revision]);
  const change = (event) => setDraft((prev) => ({ ...prev, [event.target.name]: event.target.value }));
  const totals = (scope) => {
    const amounts = summarizeFlightCurrencies(data?.totals, scope);
    return amounts.length ? amounts.map((t) => <span key={t.currency}>{flightMoney(t.amount, t.currency)}{t.missing > 0 && <small> · {t.missing} sin importe</small>}</span>) : <span className="sold-flights__no-total">Sin importes registrados</span>;
  };
  return <div className="sold-flights">
    <header className="sold-flights__header"><div className="sold-flights__heading"><span className="sold-flights__heading-icon"><MdFlight aria-hidden="true" /></span><div><h2>Vuelos de cotizaciones vendidas</h2><p>Vuelos de cotizaciones con venta registrada, incluidos los pendientes de asignar o pagar.</p></div></div><button type="button" disabled={loading} onClick={() => setRevision((r) => r + 1)}><MdRefresh aria-hidden="true" />Actualizar</button></header>
    <form className="sold-flights__filters" onSubmit={(e) => { e.preventDefault(); setPage(1); setFilters({ ...draft }); }}>
      <label>Buscar cotización, file, proveedor o ruta<input name="search" value={draft.search} maxLength={150} onChange={change} placeholder="Cotización, lugar de ida o destino…" /></label>
      <label>Procedencia (cotizada o asignada)<select name="origin" value={draft.origin} onChange={change}><option value="">Todas</option><option value="nacional">Nacional</option><option value="internacional">Internacional</option><option value="unknown">Sin procedencia cotizada</option></select></label>
      <label>Ubicación del vuelo<select name="source" value={draft.source} onChange={change}><option value="">Todos</option><option value="cotizacion">Cotización</option><option value="cotizacion_externa">Extras sin fee</option></select></label>
      <label>Estado<select name="status" value={draft.status} onChange={change}><option value="">Todos</option><option value="unassigned">Sin asignar</option><option value="assigned">Asignados</option><option value="no_request">Sin solicitud</option><option value="pending">Pendientes</option><option value="partial">Liquidación parcial</option><option value="paid">Liquidados</option></select></label>
      <label>Inicio del viaje desde<input type="date" name="date_from" value={draft.date_from} onChange={change} /></label>
      <label>Inicio del viaje hasta<input type="date" name="date_to" min={draft.date_from || undefined} value={draft.date_to} onChange={change} /></label>
      <div className="sold-flights__filter-actions"><button type="submit" disabled={loading}>Aplicar filtros</button><button type="button" disabled={loading} onClick={() => { setDraft(initialFilters); setFilters(initialFilters); setPage(1); }}>Limpiar</button></div>
    </form>
    {error && <p className="sold-flights__warning" role="alert">{error}</p>}
    {loading && <p role="status">Cargando vuelos vendidos…</p>}
    {data && <>
      <div className="sold-flights__stats"><div><strong>{data.total}</strong><span>Vuelos · {data.quotes} cotizaciones</span></div><div><strong>{data.unassigned}</strong><span>Sin asignar</span></div><div><strong>{data.assigned}</strong><span>Asignados</span></div><div><strong>{data.paid}</strong><span>Liquidados · {data.partial} parciales</span></div></div>
      <div className="sold-flights__totals"><section><h3><MdFlight aria-hidden="true" />Cotizado</h3>{totals("quoted")}</section><section><h3><MdGroups aria-hidden="true" />Asignado</h3>{totals("assigned")}</section><section><h3><MdCheckCircleOutline aria-hidden="true" />Liquidado</h3>{totals("settled")}</section></div>
      <p className="sold-flights__note">Totales de todos los resultados filtrados, por moneda. No incluyen fee, maletas cotizadas como extras separados ni pagos del cliente. La ruta corresponde al catálogo registrado; no confirma emisión de pasajes.</p>
      {!data.rows.length ? <div className="sold-flights__empty"><MdInfoOutline aria-hidden="true" /><p>No se encontraron vuelos para estos filtros.</p></div> : <div className="sold-flights__cards">{data.rows.map((row) => <FlightCard key={row.service_id} row={row} />)}</div>}
      <nav className="sold-flights__pagination" aria-label="Páginas de vuelos vendidos"><button disabled={loading || page <= 1} onClick={() => setPage((p) => p - 1)}>Anterior</button><span>Página {page} de {Math.max(1, Math.ceil(data.total / 25))}</span><button disabled={loading || page * 25 >= data.total} onClick={() => setPage((p) => p + 1)}>Siguiente</button></nav>
    </>}
  </div>;
}
