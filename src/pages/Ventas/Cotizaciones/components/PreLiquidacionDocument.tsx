import React from "react";
import {
  calculatePreLiquidacionTotal,
  normalizePreLiquidacion,
  type PreLiquidacionData,
} from "../utils/preliquidacion";

const MONTHS_ES = [
  "ENE",
  "FEB",
  "MAR",
  "ABR",
  "MAY",
  "JUN",
  "JUL",
  "AGO",
  "SEP",
  "OCT",
  "NOV",
  "DIC",
];

const parseDateParts = (value: unknown) => {
  const raw = String(value || "").trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  return match
    ? { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) }
    : null;
};

export const formatPreLiquidacionHeaderDate = (value: unknown) => {
  const parts = parseDateParts(value);
  if (!parts) return String(value || "");
  return `${String(parts.day).padStart(2, "0")} / ${String(parts.month).padStart(2, "0")} / ${parts.year}`;
};

export const formatPreLiquidacionBirthDate = (value: unknown) => {
  const parts = parseDateParts(value);
  if (!parts) return String(value || "");
  return `${String(parts.day).padStart(2, "0")} ${MONTHS_ES[parts.month - 1]} ${parts.year}`;
};

const moneyParts = (value: unknown, currency: "USD" | "PEN") => ({
  symbol: currency === "PEN" ? "S/" : "$",
  amount: Number(value || 0).toFixed(2),
});

const splitLines = (value: unknown) =>
  String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

const passengerLabel = (count: number) => `${String(count).padStart(2, "0")} PAX`;

const LabeledBlock = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="preliq-doc__operation-row">
    <strong>{label}:</strong>
    <div>{children}</div>
  </div>
);

const paymentParagraph = (label: string, value: string) => (
  <p>
    <strong>{label}:</strong> {value}
  </p>
);

export interface PreLiquidacionDocumentProps {
  data: PreLiquidacionData | any;
}

const PreLiquidacionDocument = React.forwardRef<HTMLDivElement, PreLiquidacionDocumentProps>(
  ({ data }, ref) => {
    const normalized = normalizePreLiquidacion(data);
    const passengers = Array.isArray(normalized.passengersSnapshot)
      ? normalized.passengersSnapshot
      : [];
    const total = calculatePreLiquidacionTotal(normalized);
    const totalMoney = moneyParts(total, normalized.currency);
    const notes = splitLines(normalized.notes);

    return (
      <div className="preliq-document" ref={ref}>
        <section className="preliq-document-page preliq-document-page--one" data-preliquidacion-page="1">
          <img
            className="preliq-doc__logo"
            src="/brand/logo-principal-color.webp"
            alt="Venso Tours"
          />

          <h1>LIQUIDACIÓN:</h1>

          <div className="preliq-doc__meta">
            <div className="preliq-doc__meta-row"><strong>FECHA</strong><span>: {formatPreLiquidacionHeaderDate(normalized.date)}</span></div>
            <div className="preliq-doc__meta-row"><strong>CODIGO</strong><span>: {normalized.code}</span></div>
            <div className="preliq-doc__meta-row preliq-doc__meta-row--program"><strong>PROGRAMA</strong><span>: {normalized.program}</span></div>
            <div className="preliq-doc__meta-row"><strong>AGENCIA</strong><span>: {normalized.agency}</span></div>
            <div className="preliq-doc__meta-row"><strong>COUNTER</strong><span>: {normalized.counter}</span></div>
          </div>

          <table className="preliq-doc__passengers">
            <thead>
              <tr>
                <th>Nº PAX</th>
                <th>NOMBRES</th>
                <th>DNI / PASSPORT</th>
                <th>NACIONALIDAD</th>
                <th>FECHA DE<br />NACIMIENTO</th>
              </tr>
            </thead>
            <tbody>
              {passengers.length ? (
                passengers.map((passenger: any, index: number) => (
                  <tr key={`${passenger.document || passenger.name}-${index}`}>
                    {index === 0 && (
                      <td rowSpan={passengers.length} className="preliq-doc__pax-count">
                        {passengerLabel(passengers.length)}
                      </td>
                    )}
                    <td>{String(passenger.name || "").toUpperCase()}</td>
                    <td>{[passenger.documentType, passenger.document].filter(Boolean).join(" ")}</td>
                    <td>{String(passenger.nationality || "").toUpperCase()}</td>
                    <td>{formatPreLiquidacionBirthDate(passenger.birthDate)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="preliq-doc__pax-count">00 PAX</td>
                  <td colSpan={4}>PASAJEROS DE LA COTIZACIÓN</td>
                </tr>
              )}
            </tbody>
          </table>

          <div className="preliq-doc__operation">
            <LabeledBlock label="TRASLADOS">{normalized.transfers}</LabeledBlock>
            <LabeledBlock label="HOTEL"><div className="preliq-doc__multiline">{normalized.hotel}</div></LabeledBlock>
            <LabeledBlock label="TIPO HABITACIÓN"><div className="preliq-doc__multiline">{normalized.roomType}</div></LabeledBlock>
            <LabeledBlock label="ALIMENTACIÓN"><div className="preliq-doc__multiline">{normalized.meals}</div></LabeledBlock>
            <LabeledBlock label="SERVICIOS"><div className="preliq-doc__multiline preliq-doc__services">{normalized.services}</div></LabeledBlock>
            <LabeledBlock label="NO INCLUYE"><div className="preliq-doc__multiline">{normalized.notIncluded}</div></LabeledBlock>
          </div>

          <table className="preliq-doc__liquidation">
            <thead>
              <tr className="preliq-doc__liquidation-title"><th colSpan={4}>LIQUIDACION</th></tr>
              <tr>
                <th>DESCRIPCION</th>
                <th>CANT.</th>
                <th>COSTO</th>
                <th>TOTAL</th>
              </tr>
            </thead>
            <tbody>
              {normalized.lineItems.length ? (
                normalized.lineItems.map((item) => {
                  const cost = moneyParts(item.unitCost, normalized.currency);
                  const rowTotal = moneyParts(item.total, normalized.currency);
                  return (
                    <tr key={item.id}>
                      <td>{item.description}</td>
                      <td>{String(item.quantity).padStart(2, "0")}</td>
                      <td>{cost.symbol} {cost.amount}</td>
                      <td>{rowTotal.symbol} {rowTotal.amount}</td>
                    </tr>
                  );
                })
              ) : (
                <tr><td colSpan={4}>SIN CONCEPTOS REGISTRADOS</td></tr>
              )}
              <tr className="preliq-doc__total-row">
                <td colSpan={2} />
                <td>TOTAL, A PAGAR</td>
                <td>{totalMoney.symbol} {totalMoney.amount} {normalized.currency}</td>
              </tr>
            </tbody>
          </table>

          <div className="preliq-doc__notices">
            {notes.map((line, index) => <span key={`${line}-${index}`}>{line}</span>)}
          </div>

          <div className="preliq-doc__deadline">
            FECHA DE PAGO TOTAL: {normalized.paymentDeadline || "POR DEFINIR"}
          </div>
        </section>

        <section className="preliq-document-page preliq-document-page--two" data-preliquidacion-page="2">
          <img
            className="preliq-doc__logo"
            src="/brand/logo-principal-color.webp"
            alt="Venso Tours"
          />

          <div className="preliq-doc__payments">
            <h2>PAGOS: Vía Depósito Bancario</h2>
            <div className="preliq-doc__bank-row">
              <div className="preliq-doc__bank-logo-wrap">
                {/\bbcp\b/i.test(normalized.paymentTerms.bankName || "BCP") ? (
                  <img src="/brand/bcp-logo.png" alt={normalized.paymentTerms.bankName || "BCP"} />
                ) : (
                  <span className="preliq-doc__bank-name">
                    {String(normalized.paymentTerms.bankName || "BANCO").toUpperCase()}
                  </span>
                )}
              </div>
              <div className="preliq-doc__bank-box">
                <strong>{normalized.paymentTerms.accountHolder}</strong>
                <b>CUENTA CORRIENTE EN DOLARES:</b>
                <span>{normalized.paymentTerms.usdAccount}</span>
                <b>CCI: {normalized.paymentTerms.cci}</b>
              </div>
            </div>

            <div className="preliq-doc__deposit-note">
              Nota: {normalized.paymentTerms.depositNote}
            </div>

            <h2>PAGOS: Tarjetas de crédito-No presencial.</h2>

            <h3>TARJETAS DE CREDITO VISA:</h3>
            <div className="preliq-doc__payment-copy">
              {paymentParagraph("REQUERIMIENTO", normalized.paymentTerms.visaRequirements)}
              {paymentParagraph("PROCEDIMIENTO", normalized.paymentTerms.visaProcedure)}
              <p className="preliq-doc__plain"><strong>RECARGO:</strong> {normalized.paymentTerms.cardSurchargePercent}%.</p>
              {paymentParagraph("Restricción", normalized.paymentTerms.visaRestriction)}
            </div>

            <h3>TARJETAS VISA, MASTER CARD O AMERICAN EXPRESS:</h3>
            <div className="preliq-doc__payment-copy">
              {paymentParagraph("REQUERIMIENTO", normalized.paymentTerms.cardBrandsRequirements)}
              {paymentParagraph("PROCEDIMIENTO", normalized.paymentTerms.cardBrandsProcedure)}
              <p className="preliq-doc__plain"><strong>RECARGO:</strong> {normalized.paymentTerms.cardSurchargePercent}%.</p>
              {paymentParagraph("Información", normalized.paymentTerms.cardBrandsInformation)}
              {paymentParagraph("Restricción", normalized.paymentTerms.cardBrandsRestriction)}
            </div>
          </div>
        </section>
      </div>
    );
  },
);

PreLiquidacionDocument.displayName = "PreLiquidacionDocument";
export default PreLiquidacionDocument;
