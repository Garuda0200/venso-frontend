import { normalizePreLiquidacionQuotationSummary, type PreLiquidacionQuotationSummary } from "./preliquidacionMoney";

export interface PreLiquidacionLineItem {
  id: string;
  description: string;
  quantity: number;
  unitCost: number;
  total: number;
}

export interface PreLiquidacionPayment {
  id: string;
  dueDate: string;
  amount: number;
  currency: "USD" | "PEN";
  method: string;
  notes: string;
}

export interface PreLiquidacionPassenger {
  id: string;
  name: string;
  documentType: string;
  document: string;
  nationality: string;
  birthDate: string;
}

export interface PreLiquidacionData {
  version: number;
  code: string;
  date: string;
  program: string;
  agency: string;
  counter: string;
  transfers: string;
  hotel: string;
  roomType: string;
  meals: string;
  services: string;
  notIncluded: string;
  notes: string;
  paymentDeadline: string;
  currency: "USD" | "PEN";
  lineItems: PreLiquidacionLineItem[];
  quotationSummary?: PreLiquidacionQuotationSummary | null;
  paymentSchedule: PreLiquidacionPayment[];
  passengersSnapshot: PreLiquidacionPassenger[];
  paymentTerms: {
    bankName: string;
    accountHolder: string;
    usdAccount: string;
    cci: string;
    depositNote: string;
    visaRequirements: string;
    visaProcedure: string;
    visaRestriction: string;
    cardBrandsRequirements: string;
    cardBrandsProcedure: string;
    cardBrandsInformation: string;
    cardBrandsRestriction: string;
    cardSurchargePercent: number;
  };
}

const text = (value: unknown) => String(value ?? "").trim();
const number = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
};
const nonNegativeNumber = (value: unknown) => Math.max(0, number(value));
const array = <T = any>(value: unknown): T[] => (Array.isArray(value) ? value : []);
const documentType = (value: unknown) => {
  const normalized = text(value);
  if (/pasaport/i.test(normalized)) return "PA";
  if (/dni/i.test(normalized)) return "DNI";
  return normalized;
};

const stableId = (prefix: string, index: number, value?: string) =>
  text(value) || `${prefix}-${index + 1}`;

export const defaultPreLiquidacion = (
  defaults: Partial<PreLiquidacionData> = {},
): PreLiquidacionData => ({
  version: 2,
  code: text(defaults.code),
  date: text(defaults.date) || new Date().toISOString().slice(0, 10),
  program: text(defaults.program),
  agency: text(defaults.agency) || "VENSO TOURS",
  counter: text(defaults.counter),
  transfers: text(defaults.transfers) || "IN - OUT",
  hotel: text(defaults.hotel),
  roomType: text(defaults.roomType),
  meals: text(defaults.meals) || "DESAYUNO POR NOCHE DE PERNOCTE",
  services: text(defaults.services),
  notIncluded: text(defaults.notIncluded) || "EXTRAS",
  notes:
    text(defaults.notes) ||
    "ENVIAR DOCUMENTOS DE IDENTIDAD LO MÁS LEGIBLE POSIBLE Y VIGENTE A LA FECHA DE VIAJE.\nNO SE ACEPTAN DOCUMENTOS CADUCADOS.\nNÚMERO DE CONTACTO DE UNO DE LOS PASAJEROS.",
  paymentDeadline: text(defaults.paymentDeadline),
  currency: normalizePreLiquidacionQuotationSummary(defaults.quotationSummary) ? "USD" : defaults.currency === "PEN" ? "PEN" : "USD",
  lineItems: array<PreLiquidacionLineItem>(defaults.lineItems),
  quotationSummary: normalizePreLiquidacionQuotationSummary(defaults.quotationSummary),
  paymentSchedule: array<PreLiquidacionPayment>(defaults.paymentSchedule),
  passengersSnapshot: array<PreLiquidacionPassenger>(defaults.passengersSnapshot),
  paymentTerms: {
    bankName: text(defaults.paymentTerms?.bankName) || "BCP",
    accountHolder: text(defaults.paymentTerms?.accountHolder) || "VENSO TOURS EIRL",
    usdAccount: text(defaults.paymentTerms?.usdAccount) || "285-1534246-1-30",
    cci: text(defaults.paymentTerms?.cci) || "002-28500153424613056",
    depositNote:
      text(defaults.paymentTerms?.depositNote) ||
      "Enviar voucher de depósito escaneado",
    visaRequirements:
      text(defaults.paymentTerms?.visaRequirements) ||
      "Número tarjeta de crédito / Fecha de vencimiento de tarjeta / pasaporte o DNI escaneado del titular de la tarjeta",
    visaProcedure:
      text(defaults.paymentTerms?.visaProcedure) ||
      "Venso Tours se encarga de descargar la tarjeta online y una vez realizada la transacción, se envía un comprobante de la operación.",
    visaRestriction:
      text(defaults.paymentTerms?.visaRestriction) ||
      "No aplica para tarjetas de débito / No aplica para pagos en soles (solo USD).",
    cardBrandsRequirements:
      text(defaults.paymentTerms?.cardBrandsRequirements) ||
      "Datos del titular de la tarjeta (Nombres, apellido, pasaporte o DNI y Nacionalidad).",
    cardBrandsProcedure:
      text(defaults.paymentTerms?.cardBrandsProcedure) ||
      "Venso Tours gira un formato de pago que será enviado por correo electrónico, en el cual estará cargado el monto a cobrar y es el mismo pasajero quien deberá llenar la información solicitada. Si la transacción se realiza con éxito nos llegará un mensaje de aprobación automática.",
    cardBrandsInformation:
      text(defaults.paymentTerms?.cardBrandsInformation) ||
      "Aplicable para tarjeta crédito o débito.",
    cardBrandsRestriction:
      text(defaults.paymentTerms?.cardBrandsRestriction) ||
      "No aplica para pagos en soles (solo USD).",
    cardSurchargePercent: nonNegativeNumber(
      defaults.paymentTerms?.cardSurchargePercent ?? 5.5,
    ),
  },
});

export const normalizePreLiquidacion = (
  value: any,
  defaults: Partial<PreLiquidacionData> = {},
): PreLiquidacionData => {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const sourcePaymentTerms =
    source.paymentTerms && typeof source.paymentTerms === "object"
      ? source.paymentTerms
      : source.payment_terms && typeof source.payment_terms === "object"
        ? source.payment_terms
        : {};
  const base = defaultPreLiquidacion({ ...defaults, ...source });
  const lineItemsSource = array<any>(source.lineItems ?? source.line_items);
  const paymentScheduleSource = array<any>(
    source.paymentSchedule ?? source.payment_schedule,
  );
  const passengersSource = array<any>(
    source.passengersSnapshot ?? source.passengers_snapshot ?? base.passengersSnapshot,
  );

  return {
    ...base,
    version: Math.max(1, Math.trunc(number(source.version || base.version || 1))),
    code: text(source.code ?? source.codigo ?? base.code),
    date: text(source.date ?? source.fecha ?? base.date),
    program: text(source.program ?? source.programa ?? base.program),
    agency: text(source.agency ?? source.agencia ?? base.agency),
    counter: text(source.counter ?? base.counter),
    transfers: text(source.transfers ?? source.traslados ?? base.transfers),
    hotel: text(source.hotel ?? base.hotel),
    roomType: text(source.roomType ?? source.tipo_habitacion ?? base.roomType),
    meals: text(source.meals ?? source.alimentacion ?? base.meals),
    services: text(source.services ?? source.servicios ?? base.services),
    notIncluded: text(source.notIncluded ?? source.no_incluye ?? base.notIncluded),
    notes: text(source.notes ?? source.nota ?? base.notes),
    paymentDeadline: text(
      source.paymentDeadline ?? source.fecha_pago_total ?? base.paymentDeadline,
    ),
    currency: base.quotationSummary ? "USD" : String(source.currency ?? source.moneda ?? base.currency).toUpperCase() === "PEN"
      ? "PEN"
      : "USD",
    lineItems: lineItemsSource.map((item: any, index: number) => {
      const quantity = nonNegativeNumber(item?.quantity ?? item?.cantidad);
      const unitCost = nonNegativeNumber(
        item?.unitCost ?? item?.unit_cost ?? item?.costo,
      );
      const calculatedTotal = number(quantity * unitCost);
      return {
        id: stableId("liq", index, item?.id),
        description: text(item?.description ?? item?.descripcion),
        quantity,
        unitCost,
        total: calculatedTotal,
      };
    }),
    paymentSchedule: paymentScheduleSource.map((item: any, index: number) => ({
      id: stableId("pay", index, item?.id),
      dueDate: text(item?.dueDate ?? item?.due_date ?? item?.fecha),
      amount: nonNegativeNumber(item?.amount ?? item?.monto),
      currency:
        String(item?.currency ?? item?.moneda).toUpperCase() === "PEN" ? "PEN" : "USD",
      method: text(item?.method ?? item?.metodo) || "Depósito bancario",
      notes: text(item?.notes ?? item?.observaciones),
    })),
    passengersSnapshot: passengersSource.map((passenger: any, index: number) => ({
      id: stableId(
        "pax",
        index,
        passenger?.id ?? passenger?.passengerId ?? passenger?.pasajero_id,
      ),
      name: text(
        passenger?.name ??
          passenger?.nombre_completo ??
          [passenger?.nombres ?? passenger?.nombre, passenger?.apellidos ?? passenger?.apellido]
            .filter(Boolean)
            .join(" "),
      ),
      documentType: documentType(
        passenger?.documentType ?? passenger?.document_type ?? passenger?.tipo_documento,
      ),
      document: text(
        passenger?.document ??
          passenger?.documentNumber ??
          passenger?.numero_documento ??
          passenger?.dni ??
          passenger?.pasaporte,
      ),
      nationality: text(
        passenger?.nationality ?? passenger?.nacionalidad,
      ),
      birthDate: text(
        passenger?.birthDate ?? passenger?.birth_date ?? passenger?.fecha_nacimiento,
      ),
    })),
    paymentTerms: {
      bankName:
        text(sourcePaymentTerms.bankName ?? sourcePaymentTerms.bank_name) ||
        base.paymentTerms.bankName,
      accountHolder:
        text(
          sourcePaymentTerms.accountHolder ?? sourcePaymentTerms.account_holder,
        ) || base.paymentTerms.accountHolder,
      usdAccount:
        text(sourcePaymentTerms.usdAccount ?? sourcePaymentTerms.usd_account) ||
        base.paymentTerms.usdAccount,
      cci: text(sourcePaymentTerms.cci) || base.paymentTerms.cci,
      depositNote:
        text(sourcePaymentTerms.depositNote ?? sourcePaymentTerms.deposit_note) ||
        base.paymentTerms.depositNote,
      visaRequirements:
        text(sourcePaymentTerms.visaRequirements ?? sourcePaymentTerms.visa_requirements) ||
        base.paymentTerms.visaRequirements,
      visaProcedure:
        text(sourcePaymentTerms.visaProcedure ?? sourcePaymentTerms.visa_procedure) ||
        base.paymentTerms.visaProcedure,
      visaRestriction:
        text(sourcePaymentTerms.visaRestriction ?? sourcePaymentTerms.visa_restriction) ||
        base.paymentTerms.visaRestriction,
      cardBrandsRequirements:
        text(
          sourcePaymentTerms.cardBrandsRequirements ??
            sourcePaymentTerms.card_brands_requirements,
        ) || base.paymentTerms.cardBrandsRequirements,
      cardBrandsProcedure:
        text(
          sourcePaymentTerms.cardBrandsProcedure ??
            sourcePaymentTerms.card_brands_procedure,
        ) || base.paymentTerms.cardBrandsProcedure,
      cardBrandsInformation:
        text(
          sourcePaymentTerms.cardBrandsInformation ??
            sourcePaymentTerms.card_brands_information,
        ) || base.paymentTerms.cardBrandsInformation,
      cardBrandsRestriction:
        text(
          sourcePaymentTerms.cardBrandsRestriction ??
            sourcePaymentTerms.card_brands_restriction,
        ) || base.paymentTerms.cardBrandsRestriction,
      cardSurchargePercent: nonNegativeNumber(
        sourcePaymentTerms.cardSurchargePercent ??
          sourcePaymentTerms.card_surcharge_percent ??
          base.paymentTerms.cardSurchargePercent,
      ),
    },
  };
};

export const calculatePreLiquidacionTotal = (value: any) =>
  normalizePreLiquidacion(value).quotationSummary?.total ?? Math.round(
    normalizePreLiquidacion(value).lineItems.reduce(
      (sum, item) => sum + nonNegativeNumber(item.total),
      0,
    ) * 100,
  ) / 100;

export const calculateScheduledPaymentsByCurrency = (value: any) =>
  normalizePreLiquidacion(value).paymentSchedule.reduce(
    (totals, payment) => {
      totals[payment.currency] =
        Math.round((totals[payment.currency] + nonNegativeNumber(payment.amount)) * 100) /
        100;
      return totals;
    },
    { USD: 0, PEN: 0 } as Record<"USD" | "PEN", number>,
  );

const getMovementExtra = (movement: any) =>
  movement?.datos_extra ||
  movement?.datosExtra ||
  movement?.originalData?.datos_extra ||
  movement?.originalData?.datosExtra ||
  {};

export const getRegisteredPreLiquidacionPaymentIds = (movements: any[] = []) =>
  new Set(
    array<any>(movements)
      .map((movement) => text(getMovementExtra(movement)?.preliquidacion_payment_id))
      .filter(Boolean),
  );

export const isPreLiquidacionPaymentRegistered = (
  paymentId: string,
  movements: any[] = [],
) =>
  Boolean(
    text(paymentId) &&
      getRegisteredPreLiquidacionPaymentIds(movements).has(text(paymentId)),
  );
