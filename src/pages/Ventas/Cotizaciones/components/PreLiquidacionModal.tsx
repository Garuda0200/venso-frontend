import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MdAdd,
  MdClose,
  MdDelete,
  MdDescription,
  MdPictureAsPdf,
  MdSave,
  MdSync,
} from "react-icons/md";
import {
  calculatePreLiquidacionTotal,
  normalizePreLiquidacion,
} from "../utils/preliquidacion";
import {
  exportPreLiquidacionPdf,
  exportPreLiquidacionWord,
  preparePreLiquidacionExports,
} from "../utils/preliquidacionExport";
import PreLiquidacionDocument from "./PreLiquidacionDocument";
import { buildPreLiquidacionQuotationSummary } from "../utils/preliquidacionQuotation";
import "./styles/PreLiquidacionModal.scss";

const money = (value: any, currency = "USD") =>
  `${currency === "PEN" ? "S/" : "$"} ${Number(value || 0).toFixed(2)}`;
const makeId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const normalizeDocumentType = (value: unknown) => {
  const text = String(value || "").trim();
  if (/pasaport/i.test(text)) return "PA";
  if (/dni/i.test(text)) return "DNI";
  return text;
};

const flattenPassengers = (peopleDetails: any) => {
  if (!peopleDetails) return [];
  const raw = Array.isArray(peopleDetails)
    ? peopleDetails
    : [
        ...(Array.isArray(peopleDetails.adults) ? peopleDetails.adults : []),
        ...(Array.isArray(peopleDetails.children) ? peopleDetails.children : []),
      ];
  return raw.map((p: any) => ({
    id: String(
      p.id ||
        p.pasajero_id ||
        p.passengerId ||
        p.numero_documento ||
        p.documentNumber ||
        makeId("pax"),
    ),
    name: [p.nombres || p.nombre, p.apellidos || p.apellido]
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim(),
    documentType: normalizeDocumentType(
      p.tipo_documento || p.documentType || p.tipoDocumento,
    ),
    document:
      p.numero_documento || p.documentNumber || p.dni || p.pasaporte || "",
    nationality: p.nacionalidad || p.nationality || "",
    birthDate: p.fecha_nacimiento || p.birthDate || "",
  }));
};

const PreLiquidacionModal = ({
  isOpen,
  onClose,
  value,
  onSave,
  defaults = {},
  peopleDetails,
  quotation,
  readOnly = false,
}: any) => {
  const [draft, setDraft] = useState(() => normalizePreLiquidacion(value, defaults));
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingWord, setExportingWord] = useState(false);
  const [prepared, setPrepared] = useState(false);
  const [exportError, setExportError] = useState("");
  const documentRef = useRef<HTMLDivElement | null>(null);
  const quotePassengers = useMemo(() => flattenPassengers(peopleDetails), [peopleDetails]);
  const defaultsFingerprint = JSON.stringify(defaults || {});

  useEffect(() => {
    if (isOpen) {
      const normalized = normalizePreLiquidacion(value, defaults);
      normalized.code ||= String(defaults.code || "");
      normalized.program ||= String(defaults.program || "");
      setDraft(
        normalizePreLiquidacion(
          normalized.passengersSnapshot.length
            ? normalized
            : { ...normalized, passengersSnapshot: quotePassengers },
          defaults,
        ),
      );
      setPrepared(false);
      setExportError("");
    }
  // `defaults` se construye inline desde EdicionCotizacion. Dependemos de su
  // contenido serializado para no resetear el editor por identidad de objeto.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultsFingerprint, isOpen, quotePassengers, value]);

  const quotationSummary = useMemo(
    () => quotation ? buildPreLiquidacionQuotationSummary(quotation) : null,
    [quotation],
  );
  const documentData = useMemo(
    () => normalizePreLiquidacion(quotationSummary ? { ...draft, quotationSummary, currency: "USD" } : draft, defaults),
    [draft, defaults, quotationSummary],
  );
  const total = useMemo(() => calculatePreLiquidacionTotal(documentData), [documentData]);

  const getDocumentPages = useCallback(
    () =>
      Array.from(
        documentRef.current?.querySelectorAll<HTMLElement>("[data-preliquidacion-page]") ||
          [],
      ),
    [],
  );

  useEffect(() => {
    if (!isOpen || !documentRef.current) return undefined;
    setPrepared(false);
    let active = true;
    let timeoutId: number | null = null;
    let idleId: number | null = null;
    const requestIdle =
      window.requestIdleCallback || ((callback: any) => window.setTimeout(callback, 1));
    const cancelIdle = window.cancelIdleCallback || window.clearTimeout;

    timeoutId = window.setTimeout(() => {
      idleId = requestIdle(
        () => {
          if (!active) return;
          preparePreLiquidacionExports(documentData, getDocumentPages)
            .then(() => active && setPrepared(true))
            .catch((error) => {
              if (active) console.warn("No fue posible precalentar la preliquidación.", error);
            });
        },
        { timeout: 1600 },
      ) as number;
    }, 700);

    return () => {
      active = false;
      if (timeoutId != null) window.clearTimeout(timeoutId);
      if (idleId != null) cancelIdle(idleId);
    };
  }, [documentData, getDocumentPages, isOpen]);

  if (!isOpen) return null;

  const set = (key: string, next: any) =>
    setDraft((current: any) => ({ ...current, [key]: next }));
  const setPaymentTerm = (key: string, next: any) =>
    setDraft((current: any) => ({
      ...current,
      paymentTerms: { ...current.paymentTerms, [key]: next },
    }));
  const updateLine = (index: number, key: string, next: any) =>
    setDraft((current: any) => ({
      ...current,
      lineItems: current.lineItems.map((item: any, i: number) => {
        if (i !== index) return item;
        const updated = { ...item, [key]: next };
        if (key === "quantity" || key === "unitCost") {
          updated.total =
            Number(key === "quantity" ? next : item.quantity || 0) *
            Number(key === "unitCost" ? next : item.unitCost || 0);
        }
        return updated;
      }),
    }));
  const updatePayment = (index: number, key: string, next: any) =>
    setDraft((current: any) => ({
      ...current,
      paymentSchedule: current.paymentSchedule.map((item: any, i: number) =>
        i === index ? { ...item, [key]: next } : item,
      ),
    }));
  const updatePassenger = (index: number, key: string, next: any) =>
    setDraft((current: any) => ({
      ...current,
      passengersSnapshot: current.passengersSnapshot.map((item: any, i: number) =>
        i === index ? { ...item, [key]: next } : item,
      ),
    }));

  const save = () => { if (!readOnly) onSave?.(documentData); };

  const runExport = async (format: "pdf" | "word") => {
    if (exportingPdf || exportingWord) return;
    setExportError("");
    format === "pdf" ? setExportingPdf(true) : setExportingWord(true);
    try {
      const pages = getDocumentPages();
      if (!pages.length) throw new Error("La vista previa todavía no está lista");
      if (format === "pdf") {
        await exportPreLiquidacionPdf(documentData, getDocumentPages);
      } else {
        await exportPreLiquidacionWord(documentData, getDocumentPages);
      }
      setPrepared(true);
    } catch (error: any) {
      console.error(`Error exportando preliquidación ${format}:`, error);
      setExportError(error?.message || "No se pudo generar el documento.");
    } finally {
      format === "pdf" ? setExportingPdf(false) : setExportingWord(false);
    }
  };

  return (
    <div className="preliq__overlay">
      <div className="preliq__modal">
        <header className="preliq__header">
          <div>
            <span className="preliq__eyebrow">VENSO TOURS · PRELIQUIDACIÓN</span>
            <h3>{readOnly ? "Preliquidación de cotización" : "Editor de preliquidación"}</h3>
            <p>
              Total cotizado {money(total, documentData.currency)}
              {prepared ? " · exportación preparada" : ""}
            </p>
          </div>
          <button className="preliq__close" type="button" onClick={onClose} aria-label="Cerrar">
            <MdClose />
          </button>
        </header>

        <div className="preliq__workspace">
          <div className="preliq__editor">
            <fieldset className="preliq__fields" disabled={readOnly}>
            <section className="preliq__panel">
              <div className="preliq__panel-title">
                <div><span>01</span><h4>Cabecera</h4></div>
                <small>Campos superiores de la página 1</small>
              </div>
              <div className="preliq__grid">
                {[
                  ["date", "Fecha", "date"],
                  ["code", "Código", "text"],
                  ["program", "Programa", "text"],
                  ["agency", "Agencia", "text"],
                  ["counter", "Counter", "text"],
                  ["paymentDeadline", "Fecha de pago total", "text"],
                ].map(([key, label, type]) => (
                  <label key={key}>
                    {label}
                    <input
                      type={type}
                      value={(draft as any)[key] || ""}
                      onChange={(e) => set(key, e.target.value)}
                    />
                  </label>
                ))}
                <label>
                  Moneda
                  <select value={documentData.currency} disabled={Boolean(documentData.quotationSummary)} onChange={(e) => set("currency", e.target.value)}>
                    <option value="USD">USD</option>
                    <option value="PEN">PEN</option>
                  </select>
                </label>
              </div>
            </section>

            <section className="preliq__panel">
              <div className="preliq__section-title">
                <div className="preliq__panel-title preliq__panel-title--inline">
                  <div><span>02</span><h4>Pasajeros</h4></div>
                  <small>Snapshot editable que se imprimirá en la liquidación</small>
                </div>
                <div className="preliq__section-actions">
                  <button
                    type="button"
                    disabled={!quotePassengers.length}
                    onClick={() =>
                      setDraft((current: any) => ({
                        ...current,
                        passengersSnapshot: quotePassengers.map((passenger: any) => ({ ...passenger })),
                      }))
                    }
                    title="Reemplazar el snapshot por los pasajeros actuales de la cotización"
                  >
                    <MdSync /> Sincronizar pax
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setDraft((current: any) => ({
                        ...current,
                        passengersSnapshot: [
                          ...current.passengersSnapshot,
                          {
                            id: makeId("pax"),
                            name: "",
                            documentType: "",
                            document: "",
                            nationality: "",
                            birthDate: "",
                          },
                        ],
                      }))
                    }
                  >
                    <MdAdd /> Pasajero
                  </button>
                </div>
              </div>
              <div className="preliq__passenger-head">
                <span>Nombres</span><span>Tipo</span><span>Documento</span><span>Nacionalidad</span><span>Nacimiento</span><span />
              </div>
              {draft.passengersSnapshot.map((passenger: any, index: number) => (
                <div className="preliq__passenger-row" key={passenger.id || index}>
                  <input
                    placeholder="Nombres y apellidos"
                    value={passenger.name || ""}
                    onChange={(e) => updatePassenger(index, "name", e.target.value)}
                  />
                  <input
                    placeholder="PA / DNI"
                    value={passenger.documentType || ""}
                    onChange={(e) => updatePassenger(index, "documentType", e.target.value)}
                  />
                  <input
                    placeholder="Documento"
                    value={passenger.document || ""}
                    onChange={(e) => updatePassenger(index, "document", e.target.value)}
                  />
                  <input
                    placeholder="Nacionalidad"
                    value={passenger.nationality || ""}
                    onChange={(e) => updatePassenger(index, "nationality", e.target.value)}
                  />
                  <input
                    type="date"
                    value={String(passenger.birthDate || "").slice(0, 10)}
                    onChange={(e) => updatePassenger(index, "birthDate", e.target.value)}
                  />
                  <button
                    className="icon"
                    type="button"
                    aria-label={`Eliminar pasajero ${index + 1}`}
                    onClick={() =>
                      setDraft((current: any) => ({
                        ...current,
                        passengersSnapshot: current.passengersSnapshot.filter(
                          (_: any, i: number) => i !== index,
                        ),
                      }))
                    }
                  >
                    <MdDelete />
                  </button>
                </div>
              ))}
              {!draft.passengersSnapshot.length && (
                <div className="preliq__empty-row">No hay pasajeros en el snapshot de esta preliquidación.</div>
              )}
            </section>

            <section className="preliq__panel">
              <div className="preliq__panel-title">
                <div><span>03</span><h4>Operación</h4></div>
                <small>Mismo orden del documento de referencia</small>
              </div>
              {[
                ["transfers", "Traslados", 2],
                ["hotel", "Hotel", 3],
                ["roomType", "Tipo habitación", 3],
                ["meals", "Alimentación", 2],
                ["services", "Servicios", 7],
                ["notIncluded", "No incluye", 2],
                ["notes", "Notas resaltadas", 4],
              ].map(([key, label, rows]) => (
                <label className="preliq__wide" key={String(key)}>
                  {label}
                  <textarea
                    rows={Number(rows)}
                    value={(draft as any)[key] || ""}
                    onChange={(e) => set(String(key), e.target.value)}
                  />
                </label>
              ))}
            </section>

            {documentData.quotationSummary ? (
              <section className="preliq__panel">
                <div className="preliq__panel-title"><div><span>04</span><h4>Cotizado por día</h4></div></div>
                <table className="preliq__daily-summary">
                  <thead><tr><th>Día</th><th>Itinerario</th><th>Total</th></tr></thead>
                  <tbody>
                    {documentData.quotationSummary.days.map((day) => (
                      <tr key={day.id}><td>{day.dayNumber}</td><td>{day.title || "Sin título"}</td><td>{money(day.total)}</td></tr>
                    ))}
                  </tbody>
                  <tfoot><tr><th colSpan={2}>Total final de la cotización</th><th>{money(total)}</th></tr></tfoot>
                </table>
                {!documentData.quotationSummary.days.length && <p>La cotización aún no tiene días registrados.</p>}
              </section>
            ) : <section className="preliq__panel">
              <div className="preliq__section-title">
                <div className="preliq__panel-title preliq__panel-title--inline">
                  <div><span>04</span><h4>Liquidación</h4></div>
                  <small>Descripción, cantidad, costo y total</small>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setDraft((current: any) => ({
                      ...current,
                      lineItems: [
                        ...current.lineItems,
                        { id: makeId("liq"), description: "", quantity: 1, unitCost: 0, total: 0 },
                      ],
                    }))
                  }
                >
                  <MdAdd /> Concepto
                </button>
              </div>
              <div className="preliq__line-head">
                <span>Descripción</span><span>Cant.</span><span>Costo</span><span>Total</span><span />
              </div>
              {draft.lineItems.map((item: any, index: number) => (
                <div className="preliq__row" key={item.id}>
                  <input
                    className="grow"
                    placeholder="Descripción"
                    value={item.description}
                    onChange={(e) => updateLine(index, "description", e.target.value)}
                  />
                  <input
                    type="number"
                    min="0"
                    value={item.quantity}
                    onChange={(e) => updateLine(index, "quantity", e.target.value)}
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.unitCost}
                    onChange={(e) => updateLine(index, "unitCost", e.target.value)}
                  />
                  <strong>{money(item.total, draft.currency)}</strong>
                  <button
                    className="icon"
                    type="button"
                    onClick={() =>
                      setDraft((current: any) => ({
                        ...current,
                        lineItems: current.lineItems.filter((_: any, i: number) => i !== index),
                      }))
                    }
                  >
                    <MdDelete />
                  </button>
                </div>
              ))}
            </section>}

            <section className="preliq__panel">
              <div className="preliq__panel-title">
                <div><span>05</span><h4>Pagos y tarjetas</h4></div>
                <small>Condiciones del documento</small>
              </div>
              <div className="preliq__grid preliq__grid--bank">
                {[
                  ["bankName", "Banco"],
                  ["accountHolder", "Titular"],
                  ["usdAccount", "Cuenta USD"],
                  ["cci", "CCI"],
                  ["cardSurchargePercent", "Recargo tarjeta (%)"],
                ].map(([key, label]) => (
                  <label key={key}>
                    {label}
                    <input
                      type={key === "cardSurchargePercent" ? "number" : "text"}
                      step={key === "cardSurchargePercent" ? "0.1" : undefined}
                      value={(draft.paymentTerms as any)[key] ?? ""}
                      onChange={(e) => setPaymentTerm(key, e.target.value)}
                    />
                  </label>
                ))}
              </div>
              {[
                ["depositNote", "Nota depósito"],
                ["visaRequirements", "Visa · Requerimiento"],
                ["visaProcedure", "Visa · Procedimiento"],
                ["visaRestriction", "Visa · Restricción"],
                ["cardBrandsRequirements", "Visa / MasterCard / Amex · Requerimiento"],
                ["cardBrandsProcedure", "Visa / MasterCard / Amex · Procedimiento"],
                ["cardBrandsInformation", "Visa / MasterCard / Amex · Información"],
                ["cardBrandsRestriction", "Visa / MasterCard / Amex · Restricción"],
              ].map(([key, label]) => (
                <label className="preliq__wide" key={key}>
                  {label}
                  <textarea
                    rows={key.includes("Procedure") ? 4 : 2}
                    value={(draft.paymentTerms as any)[key] || ""}
                    onChange={(e) => setPaymentTerm(key, e.target.value)}
                  />
                </label>
              ))}
            </section>

            <details className="preliq__panel preliq__internal">
              <summary>
                <strong>Cronograma interno del pax</strong>
                <span>No se imprime en el documento</span>
              </summary>
              <div className="preliq__section-title">
                <p>Se conserva para el flujo de cobranzas del voucher.</p>
                <button
                  type="button"
                  onClick={() =>
                    setDraft((current: any) => ({
                      ...current,
                      paymentSchedule: [
                        ...current.paymentSchedule,
                        {
                          id: makeId("pay"),
                          dueDate: "",
                          amount: 0,
                          currency: "USD",
                          method: "Depósito bancario",
                          notes: "",
                        },
                      ],
                    }))
                  }
                >
                  <MdAdd /> Pago
                </button>
              </div>
              {draft.paymentSchedule.map((item: any, index: number) => (
                <div className="preliq__row payment" key={item.id}>
                  <input type="date" value={item.dueDate} onChange={(e) => updatePayment(index, "dueDate", e.target.value)} />
                  <input type="number" min="0" step="0.01" value={item.amount} onChange={(e) => updatePayment(index, "amount", e.target.value)} />
                  <select value={item.currency} onChange={(e) => updatePayment(index, "currency", e.target.value)}><option>USD</option><option>PEN</option></select>
                  <input className="grow" value={item.method} onChange={(e) => updatePayment(index, "method", e.target.value)} />
                  <input className="grow" placeholder="Observación" value={item.notes} onChange={(e) => updatePayment(index, "notes", e.target.value)} />
                  <button className="icon" type="button" onClick={() => setDraft((current: any) => ({ ...current, paymentSchedule: current.paymentSchedule.filter((_: any, i: number) => i !== index) }))}><MdDelete /></button>
                </div>
              ))}
            </details>
            </fieldset>
          </div>

          <aside className="preliq__preview-pane">
            <div className="preliq__preview-head">
              <div><span>VISTA PREVIA</span><strong>Formato A4 · paginación automática</strong></div>
              <small>La descarga PDF y Word usa exactamente estas páginas.</small>
            </div>
            <div className="preliq__preview-scroll">
              <PreLiquidacionDocument ref={documentRef} data={documentData} />
            </div>
          </aside>
        </div>

        {exportError && <div className="preliq__error" role="alert">{exportError}</div>}

        <footer className="preliq__footer">
          <div className="preliq__footer-copy">
            <strong>{money(total, documentData.currency)}</strong>
            <span>{documentData.passengersSnapshot.length} pasajero{documentData.passengersSnapshot.length === 1 ? "" : "s"} en el documento</span>
          </div>
          <div className="preliq__footer-actions">
            <button className="preliq__download preliq__download--pdf" type="button" disabled={exportingPdf || exportingWord} onClick={() => runExport("pdf")}>
              <MdPictureAsPdf /> {exportingPdf ? "Generando PDF..." : "Descargar PDF"}
            </button>
            <button className="preliq__download preliq__download--word" type="button" disabled={exportingPdf || exportingWord} onClick={() => runExport("word")}>
              <MdDescription /> {exportingWord ? "Generando Word..." : "Descargar Word"}
            </button>
            {!readOnly && <button className="preliq__save" type="button" onClick={() => { save(); onClose?.(); }}>
              <MdSave /> Guardar preliquidación
            </button>}
          </div>
        </footer>
      </div>
    </div>
  );
};

export default PreLiquidacionModal;
