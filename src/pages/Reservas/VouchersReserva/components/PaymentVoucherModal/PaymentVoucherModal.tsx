import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  MdCheck,
  MdNote,
  MdCalendarToday,
  MdAttachMoney,
  MdLayers,
  MdSchedule,
} from "react-icons/md";
import { toast } from "react-toastify";
import DatePicker from "react-datepicker";
import { es } from "date-fns/locale";
import "react-datepicker/dist/react-datepicker.css";
import Modal from "../../../../../components/UI/Modal/Modal";
import PaymentRequestManager from "../PaymentRequestManager/PaymentRequestManager";
import voucherReservaService from "../../../../../services/voucherReservaService";
import {
  getAssignedParentService,
  getAssignedChildService,
  getAssignedTariff,
  resolveServiceType,
} from "../../utils/serviceAssignment";
import "./PaymentVoucherModal.scss";
import { getPaymentServiceId, getAssignedPaymentAmount } from "../../utils/reservationPaymentManagement";

const TYPE_LABELS = {
  hoteles: "Hotel",
  hotel: "Hotel",
  transportes: "Transporte",
  transporte: "Transporte",
  trenes: "Tren",
  tren: "Tren",
  vuelos: "Vuelo",
  vuelo: "Vuelo",
  restaurantes: "Restaurante",
  restaurante: "Restaurante",
  tickets: "Ticket",
  ticket: "Ticket",
  entradas: "Entrada",
  entrada: "Entrada",
  guias: "Guía",
  guia: "Guía",
  endoses: "Endose",
  endose: "Endose",
  extras: "Extra",
  extra: "Extra",
  rutas: "Ruta",
  ruta: "Ruta",
  tours: "Tour",
  tour: "Tour",
};

const getServiceId = getPaymentServiceId;
const getServiceAmount = getAssignedPaymentAmount;

const getServiceName = (service = {}) => {
  const parent = getAssignedParentService(service);
  const child = getAssignedChildService(service);
  return (
    parent?.nombre_empresa ||
    parent?.nombreEmpresa ||
    parent?.nombre_transporte ||
    parent?.nombreTransporte ||
    parent?.nombre ||
    parent?.tour_nombre ||
    parent?.tourNombre ||
    child?.ticket?.entrada ||
    child?.servicio_extra?.nombre ||
    child?.nombre ||
    "Servicio asignado"
  );
};

const getTypeLabel = (service = {}) => {
  const type = String(resolveServiceType(service) || "servicio").toLowerCase();
  return TYPE_LABELS[type] || type;
};

const PaymentVoucherModal = ({
  show = false,
  onClose,
  onSubmitted,
  service = {},
  items = [],
  voucherReservaId = "",
  voucherReservaCode = "",
  dayIndex = 0,
  serviceIndex = 0,
}) => {
  const requestItems = useMemo(() => {
    if (Array.isArray(items) && items.length > 0) {
      return items.map((item, index) => ({
        service: item.service || item,
        dayIndex: item.dayIndex ?? index,
        serviceIndex: item.serviceIndex ?? index,
        dayNumber: item.dayNumber ?? null,
      }));
    }

    return [{ service, dayIndex, serviceIndex, dayNumber: null }];
  }, [items, service, dayIndex, serviceIndex]);

  const enrichedItems = useMemo(
    () =>
      requestItems.map((item) => ({
        ...item,
        serviceId: getServiceId(item.service),
        amount: getServiceAmount(item.service),
        name: getServiceName(item.service),
        typeLabel: getTypeLabel(item.service),
      })),
    [requestItems],
  );

  const isBatch = enrichedItems.length > 1;
  const primaryItem = enrichedItems[0];
  const totalAmount = enrichedItems.reduce(
    (sum, item) => sum + (Number.isFinite(item.amount) ? item.amount : 0),
    0,
  );

  const parentService = getAssignedParentService(primaryItem?.service);
  const childService = getAssignedChildService(primaryItem?.service);
  const tariff = getAssignedTariff(primaryItem?.service);
  const deadline =
    primaryItem?.service?.payment_deadline ||
    primaryItem?.service?.assignedService?.payment_deadline ||
    null;

  const handleClose = () => {
    window.dispatchEvent(
      new CustomEvent("paymentModalClosed", {
        detail: {
          voucherReservaId,
          dayIndex: primaryItem?.dayIndex,
          serviceIndex: primaryItem?.serviceIndex,
        },
      }),
    );
    onClose();
  };

  const paymentManagerRef = useRef(null);
  const prevServiceIdRef = useRef(null);
  const [hasPaymentRequest, setHasPaymentRequest] = useState(
    isBatch ? false : null,
  );
  const [observaciones, setObservaciones] = useState("");
  const [paymentDeadline, setPaymentDeadline] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!show) return;

    setPaymentDeadline(deadline ? new Date(deadline) : null);
    setObservaciones("");

    if (isBatch) {
      setHasPaymentRequest(false);
      return;
    }

    const currentServiceId = primaryItem?.serviceId;
    const serviceChanged = prevServiceIdRef.current !== currentServiceId;
    prevServiceIdRef.current = currentServiceId;

    if (serviceChanged) {
      setHasPaymentRequest(null);
    }

    paymentManagerRef.current?.refresh?.();
  }, [show, isBatch, primaryItem?.serviceId, deadline]);

  const handleStatusLoaded = useCallback((paymentRequest) => {
    setHasPaymentRequest(paymentRequest === undefined ? null : !!paymentRequest);
  }, []);

  const handleSubmitPayment = async () => {
    if (isSubmitting || hasPaymentRequest !== false) return;
    if (!voucherReservaId || enrichedItems.length > 100) {
      toast.error("Verifica la reserva y selecciona como máximo 100 servicios");
      return;
    }
    const invalidItem = enrichedItems.find(
      (item) => !item.serviceId || !Number.isFinite(item.amount) || item.amount <= 0,
    );

    if (invalidItem) {
      toast.error(
        !invalidItem.serviceId
          ? `No se encontró el ID de ${invalidItem.name}`
          : `El monto de ${invalidItem.name} debe ser mayor a 0`,
      );
      return;
    }

    setIsSubmitting(true);
    try {
      let response;

      if (isBatch) {
        response = await voucherReservaService.requestPaymentsBatch({
          voucher_reserva_id: voucherReservaId,
          requests: enrichedItems.map((item) => ({
            itinerario_servicio_id: item.serviceId,
            amount: item.amount,
            observaciones: observaciones || null,
            payment_deadline: paymentDeadline
              ? paymentDeadline.toISOString()
              : null,
          })),
        });
      } else {
        const serviceData = {
          parentService,
          childService,
          tariff,
          typeService: resolveServiceType(primaryItem.service),
          payment_deadline: deadline,
        };

        response = await voucherReservaService.requestPayment({
          voucher_reserva_id: voucherReservaId,
          voucher_reserva_code: voucherReservaCode,
          itinerario_servicio_id: primaryItem.serviceId,
          amount: primaryItem.amount,
          currency: "USD",
          moneda: "dolares",
          observaciones: observaciones || null,
          service_data: serviceData,
          payment_deadline: paymentDeadline
            ? paymentDeadline.toISOString()
            : null,
        });
      }

      if (response?.success) {
        toast.success(
          isBatch
            ? `${enrichedItems.length} solicitudes de pago enviadas`
            : "Solicitud de pago enviada",
        );
        setHasPaymentRequest(true);
        paymentManagerRef.current?.refresh?.();

        const detail = {
          voucherReservaId,
          voucher_reserva_id: voucherReservaId,
          serviceIds: enrichedItems.map((item) => item.serviceId),
          dayIndex: primaryItem?.dayIndex,
          serviceIndex: primaryItem?.serviceIndex,
        };
        window.dispatchEvent(
          new CustomEvent("paymentRequestCreated", { detail }),
        );
        onSubmitted?.(detail);
        onClose();
      }
    } catch (error) {
      console.error("Error al solicitar pago:", error);
      toast.error(
        error.response?.data?.message ||
          (isBatch
            ? "No se pudieron crear las solicitudes de pago"
            : "Error al enviar la solicitud de pago"),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!show) return null;

  return (
    <Modal
      isOpen={show}
      onClose={handleClose}
      title={isBatch ? "Solicitar pagos" : "Solicitud de pago"}
      size="small"
      className="payment-voucher-modal"
    >
      <div className="pvm-overview">
        <div className="pvm-overview__icon">
          {isBatch ? <MdLayers /> : <MdAttachMoney />}
        </div>
        <div className="pvm-overview__copy">
          <span>{isBatch ? `${enrichedItems.length} servicios` : primaryItem.typeLabel}</span>
          <strong>{isBatch ? "Solicitud agrupada" : primaryItem.name}</strong>
        </div>
        <div className="pvm-overview__total">
          <span>Total</span>
          <strong>$ {totalAmount.toFixed(2)}</strong>
        </div>
      </div>

      {isBatch && (
        <div className="pvm-selection-list" aria-label="Servicios seleccionados">
          {enrichedItems.map((item) => (
            <div key={item.serviceId} className="pvm-selection-item">
              <div>
                <span>
                  {item.dayNumber ? `Día ${item.dayNumber} · ` : ""}
                  {item.typeLabel}
                </span>
                <strong>{item.name}</strong>
              </div>
              <b>$ {item.amount.toFixed(2)}</b>
            </div>
          ))}
        </div>
      )}

      {!isBatch && (
        <div className={`pvm-status-wrap${hasPaymentRequest === false ? " hidden" : ""}`}>
          <PaymentRequestManager
            ref={paymentManagerRef}
            voucherReservaId={voucherReservaId}
            voucherReservaCode={voucherReservaCode}
            servicioId={primaryItem.serviceId}
            service={primaryItem.service}
            onStatusLoaded={handleStatusLoaded}
            onRequestPayment={() => {}}
          />
        </div>
      )}

      {hasPaymentRequest === false && (
        <div className="pvm-form">
          <div className="pvm-row">
            <div className="pvm-field pvm-field--deadline">
              <label>
                <MdCalendarToday /> Fecha límite
              </label>
              <DatePicker
                selected={paymentDeadline}
                onChange={(date) => setPaymentDeadline(date)}
                showTimeSelect
                timeFormat="HH:mm"
                timeIntervals={30}
                dateFormat="dd/MM/yyyy HH:mm"
                placeholderText="Sin fecha límite"
                minDate={new Date()}
                locale={es}
                className="pvm-datepicker"
                isClearable
                timeCaption="Hora"
              />
            </div>
          </div>

          <div className="pvm-field pvm-field--obs">
            <label>
              <MdNote /> Observaciones
            </label>
            <textarea
              rows={2}
              value={observaciones}
              onChange={(event) => setObservaciones(event.target.value)}
              placeholder="Opcional: nota común para contabilidad"
            />
          </div>

          <div className="pvm-actions">
            <button type="button" className="pvm-cancel" onClick={handleClose}>
              Cerrar
            </button>
            <button
              type="button"
              className="pvm-submit"
              onClick={handleSubmitPayment}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                "Enviando..."
              ) : (
                <>
                  <MdCheck />
                  {isBatch
                    ? `Solicitar ${enrichedItems.length} pagos`
                    : "Solicitar pago"}
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {hasPaymentRequest && !isBatch && (
        <div className="pvm-existing-note">
          <MdSchedule /> La solicitud ya fue registrada para este servicio.
        </div>
      )}
    </Modal>
  );
};

export default PaymentVoucherModal;
