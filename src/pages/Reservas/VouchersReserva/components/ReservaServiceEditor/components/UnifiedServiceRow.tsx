/**
 * UnifiedServiceRow - A single row pairing cotizacion service with its assignment
 * Replaces the old two-column layout with a clear 1:1 visual mapping
 */
import { useState } from "react";
import {
  MdCheck,
  MdClose,
  MdDelete,
  MdModeEdit,
  MdCalendarToday,
  MdSchedule,
  MdArrowForward,
  MdExpandMore,
  MdExpandLess,
  MdDescription,
  MdPeople,
} from "react-icons/md";
import { FaChild } from "react-icons/fa";
import ServiceDetailedInfo from "../../../../../../components/Ventas/Cotizaciones/EdicionCotizacion/components/DaysEditor/components/ServiceDetailedInfo/ServiceDetailedInfo";
import ChildrenPanel from "../../../../../../components/Ventas/Cotizaciones/EdicionCotizacion/components/DaysEditor/components/SortableService/ChildrenPanel";
import { formatCurrency } from "../../../../../../components/Ventas/Cotizaciones/EdicionCotizacion/utils/formatters";
import {
  buildRuntimePassengerSelection,
  getServiceBeneficiarySnapshot,
  getServicePassengerPricingState,
} from "../../../../../../components/Ventas/Cotizaciones/EdicionCotizacion/utils/passengerPricingState";
import { getServiceName } from "../../../../../../components/Ventas/Cotizaciones/EdicionCotizacion/components/DaysEditor/utils/serviceTypeMapper";
import {
  getAssignedChildService,
  getAssignedParentService,
  getAssignedTariff,
} from "../../../utils/serviceAssignment";
import {
  formatTicketPassengerLabel,
  getTicketEntrada,
  getTicketProcedencia,
  getTicketTipoUsuario,
  normalizeTicketProcedencia,
} from "../../../../../../components/Ventas/Cotizaciones/EdicionCotizacion/utils/ticketBeneficiaries";
import {
  getTariffBreakdown,
  getServiceDisplayName,
  formatPaymentDeadline,
  shouldShowPaymentDeadline,
  getPaymentStatusColor,
  getAssignedPassengerSelectionForService,
} from "../utils/editorHelpers";

const UnifiedServiceRow = ({
  service,
  serviceIndex,
  dayIndex,
  cotService,
  // Price editing
  editingPrice,
  onTogglePriceAdjustment,
  onAdjustmentValueChange,
  onApplyAdjustment,
  preventWheelChange,
  preventArrowChange,
  // Children pricing
  onUpdateChildPrice,
  onConvertChildToAdult,
  onRevertAdultToChild,
  onAssignedBeneficiariesChange,
  // Time
  onServiceTimeChange,
  // Validation actions
  onValidateService,
  isValidating = false,
  validationBusy = false,
  onRemoveAssignment,
  // Payment deadline
  editingPaymentDeadline,
  onPaymentDeadlineChange,
  onApplyPaymentDeadline,
  onTogglePaymentDeadlineEdit,
  peopleDetails = {},
  onOpenReservationRequest = null,
}) => {
  const [showChildPanel, setShowChildPanel] = useState(false);
  const [showBeneficiaries, setShowBeneficiaries] = useState(false);

  const cotTariff =
    cotService?.tariff || (cotService ? getAssignedTariff(cotService) : null);
  const cotPassengerSelection = cotService
    ? buildRuntimePassengerSelection(
        cotService.passengerSelection || {},
        getServicePassengerPricingState(
          {
            ...cotService,
            tariff: cotTariff || cotService.tariff || {},
          },
          cotService.passengerSelection || undefined,
        ),
      )
    : null;
  const cotBreakdown = cotTariff
    ? getTariffBreakdown(cotTariff, cotPassengerSelection)
    : null;

  const liveAssignedTariff =
    service?.assignedTariff ||
    service?.assignedService?.assignedTariff ||
    service?.assignedService?.tariff ||
    (service?.isCustomService ? service?.tariff : null);
  const assignedTariff =
    liveAssignedTariff &&
    (liveAssignedTariff.precio != null ||
      liveAssignedTariff.precio_original != null)
      ? liveAssignedTariff
      : getAssignedTariff({
          ...service,
          tariff: null,
          precioServicio: null,
        });
  const assignedPaxSel = getAssignedPassengerSelectionForService(service);
  const assignedParentService = getAssignedParentService({
    ...service,
    parentService: null,
  });
  const assignedChildService = getAssignedChildService({
    ...service,
    childService: null,
  });
  const assignedDetailService = {
    typeService:
      service?.assignedService?.typeService ||
      assignedParentService?.typeService ||
      assignedChildService?.typeService ||
      service?.typeService,
    parentService: assignedParentService,
    childService: assignedChildService,
    tariff: assignedTariff || {},
  };
  const hasAssignedDetail =
    service?.isAssigned === true &&
    Boolean(
      service?.assignedService ||
        assignedParentService ||
        assignedChildService,
    );
  const assignedBreakdown = assignedTariff
    ? getTariffBreakdown(assignedTariff, assignedPaxSel)
    : null;

  const assignedBeneficiarySnapshot = getServiceBeneficiarySnapshot(
    {
      ...service,
      tariff: assignedTariff || {},
      passengerSelection: assignedPaxSel,
      assignedPassengerIds:
        assignedPaxSel?.selectedIds || service.assignedPassengerIds,
      assignedChildExplicitPriceMap:
        assignedPaxSel?.assignedChildExplicitPriceMap ||
        service.assignedChildExplicitPriceMap,
      convertedChildToAdultMap:
        assignedPaxSel?.convertedChildToAdultMap ||
        service.convertedChildToAdultMap,
      children: undefined,
    },
    assignedPaxSel,
  );
  const quotedBeneficiarySnapshot = cotService
    ? getServiceBeneficiarySnapshot(
        {
          ...cotService,
          tariff: cotTariff || cotService.tariff || {},
          passengerSelection: cotPassengerSelection || {},
          assignedPassengerIds: cotPassengerSelection?.selectedIds,
        },
        cotPassengerSelection || {},
      )
    : null;
  // El conjunto elegible sale de la cotización original cuando está disponible.
  // La mutación posterior solo conserva una parte de la asignación actual.
  const assignableBeneficiaryIds =
    quotedBeneficiarySnapshot?.selectedIds?.length > 0
      ? quotedBeneficiarySnapshot.selectedIds
      : assignedBeneficiarySnapshot.selectedIds;
  const assignedBeneficiaryIds = assignedBeneficiarySnapshot.selectedIds;
  const assignedBeneficiaryIdSet = new Set(assignedBeneficiaryIds);

  const childIds = assignedBeneficiarySnapshot.childIds;
  const convertedEntries = assignedBeneficiarySnapshot.convertedEntries;
  const convertedCount = convertedEntries.length;
  const childCount = childIds.length;
  const childManagementCount = childCount + convertedCount;
  const childPricingMode =
    assignedPaxSel?.pricingMode ||
    (assignedPaxSel?.treatChildrenAsAdults ? "adult" : "fixed");
  const treatChildrenAsAdults = assignedPaxSel?.treatChildrenAsAdults === true;
  const effectiveChildPricingMode =
    !treatChildrenAsAdults && childPricingMode === "adult"
      ? "percentage"
      : childPricingMode;
  const uniformPercentage = parseFloat(assignedPaxSel?.uniformPercentage || 0);
  const assignedChildCount =
    assignedPaxSel?.assignedChildExplicitCount ?? childCount;
  const childPriceMap = assignedBeneficiarySnapshot.childPriceMap;
  const effectiveChildCount = Math.max(
    assignedChildCount,
    childCount,
    Object.keys(childPriceMap).length,
  );
  const adultUnitPrice = assignedTariff
    ? parseFloat(assignedTariff.precio || 0)
    : 0;
  const totalPrice = assignedTariff
    ? parseFloat(
        assignedTariff.precio_original_with_child_extras ??
          assignedTariff.precio_original ??
          assignedBreakdown?.total ??
          adultUnitPrice,
      ) || 0
    : (assignedBreakdown?.total ?? adultUnitPrice);
  const hasChildrenInService =
    effectiveChildCount > 0 ||
    childCount > 0 ||
    Object.keys(childPriceMap).length > 0;
  const childModeLabel = treatChildrenAsAdults
    ? "Niños cobran como adultos"
    : effectiveChildPricingMode === "percentage"
      ? uniformPercentage > 0
        ? `${uniformPercentage}% del adulto`
        : "Porcentaje por niño"
      : effectiveChildPricingMode === "fixed"
        ? "Monto fijo por niño"
        : "Tarifa editable por niño";

  const typeService =
    (service.assignedChildService?.servicio_extra ||
    service.assignedService?.childService?.servicio_extra ||
    service.childService?.servicio_extra
      ? "extras"
      : null) ||
    service.assignedService?.typeService ||
    service.assignedService?.parentService?.typeService ||
    service.assignedService?.childService?.typeService ||
    service.typeService ||
    service.parentService?.typeService ||
    service.cotizacionServiceRef?.typeService ||
    cotService?.typeService ||
    cotService?.parentService?.typeService ||
    "Servicio";

  const rowClassName = [
    "service-unified-row",
    String(typeService).toLowerCase() === "tickets" ? "service-unified-row--ticket" : "",
    service.isAssigned ? "assigned" : "pending",
    service.paymentRequest?.status === "paid"
      ? "paid"
      : service.paymentRequest?.status === "pending"
        ? "pending-payment"
        : "",
  ]
    .filter(Boolean)
    .join(" ");

  const isEditingPrice =
    editingPrice.dayIndex === dayIndex &&
    editingPrice.serviceIndex === serviceIndex;
  const isEditingDeadline =
    editingPaymentDeadline.dayIndex === dayIndex &&
    editingPaymentDeadline.serviceIndex === serviceIndex;

  const isTicketRow =
    String(typeService).toLowerCase() === "tickets" ||
    Boolean(
      service?.assignedService?.childService?.ticket ||
        service?.childService?.ticket ||
        cotService?.childService?.ticket,
    );
  const ticketReference =
    service?.assignedService?.childService ||
    service?.assignedService ||
    service?.childService ||
    cotService?.childService ||
    cotService ||
    service;
  const ticketProcedencia = normalizeTicketProcedencia(
    getTicketProcedencia(ticketReference),
  );
  const ticketTipoUsuario = getTicketTipoUsuario(ticketReference);

  const hasActivePayment = !!(
    service.paymentRequest?.id &&
    (service.paymentRequest.status === "pending" ||
      service.paymentRequest.status === "paid")
  );
  const getChildDisplayName = (id, fallbackIndex = -1) => {
    const childIndex = childIds.indexOf(id);
    const index = childIndex >= 0 ? childIndex : fallbackIndex;
    const childFromPeople =
      Array.isArray(peopleDetails?.children) && index >= 0
        ? peopleDetails.children[index]
        : null;
    const name = [
      childFromPeople?.nombres || childFromPeople?.nombre,
      childFromPeople?.apellidos || childFromPeople?.apellido,
    ]
      .filter(Boolean)
      .join(" ")
      .trim();

    return name || (index >= 0 ? `Niño ${index + 1}` : `${id}`);
  };
  const getPassengerDisplayName = (id) => {
    const [kind, rawIndex] = String(id || "").split(":");
    const index = Number.parseInt(rawIndex, 10);
    const isChild = kind === "child";
    const person = Number.isInteger(index)
      ? isChild
        ? peopleDetails?.children?.[index]
        : peopleDetails?.adults?.[index]
      : null;
    const name = [
      person?.nombres || person?.nombre,
      person?.apellidos || person?.apellido,
    ]
      .filter(Boolean)
      .join(" ")
      .trim();

    if (name) return name;
    const position = Number.isInteger(index) ? ` ${index + 1}` : "";
    return `${isChild ? "Niño" : "Adulto"}${position}`;
  };

  const handleBeneficiaryToggle = (beneficiaryId, checked) => {
    const nextIds = checked
      ? [...assignedBeneficiaryIds, beneficiaryId]
      : assignedBeneficiaryIds.filter((id) => id !== beneficiaryId);
    if (nextIds.length === 0) return;
    onAssignedBeneficiariesChange?.(dayIndex, serviceIndex, nextIds);
  };

  return (
    <div className={rowClassName}>
      {/* --- Left: Cotización service --- */}
      <div className="row-cotizacion">
        <div className="row-type-badge">{typeService}</div>
        {service.isExternalItinerary && (
          <div className="row-external-badge">Itinerario externo</div>
        )}
        {cotService && !service.isCustomService ? (
          <>
            <div className="row-cot-name">
              {getServiceName(cotService) || "Servicio"}
            </div>
            <ServiceDetailedInfo
              service={cotService}
              className="compact"
              categoryId={cotService.parentService?.categoria_id}
            />
            {cotBreakdown && (
              <div className="row-cot-price">
                <span className="cot-price-label">Venta:</span>
                <span className="cot-price-value">
                  {formatCurrency(cotBreakdown.total)}
                </span>
              </div>
            )}
          </>
        ) : service.isCustomService ? (
          <div className="row-cot-name">Servicio adicional</div>
        ) : (
          <div className="row-cot-name">Sin cotización origen</div>
        )}
      </div>

      {/* Arrow connector */}
      <div className="row-connector">
        <MdArrowForward className="connector-arrow" />
      </div>

      {/* --- Right: Assignment side --- */}
      <div className="row-assignment">
        {hasAssignedDetail ? (
          <div className="row-assigned-content">
            {/* Header */}
            <div className="row-assigned-header">
              <MdCheck className="assigned-icon-mini" />
              <span className="row-assigned-name">
                {isTicketRow ? getTicketEntrada(ticketReference) : getServiceDisplayName(service)}
              </span>
              {isTicketRow && (
                <span className={`ticket-row-badge ticket-row-badge--${ticketProcedencia || "none"}`}>
                  {ticketProcedencia || "sin procedencia"} · {ticketTipoUsuario}
                </span>
              )}
              {service.paymentRequest?.status === "paid" && (
                <span className="paid-badge">
                  <MdCheck /> PAGADO
                </span>
              )}
              {service.paymentRequest?.status === "pending" && (
                <span className="pending-badge">
                  <MdSchedule /> PENDIENTE
                </span>
              )}
            </div>

            {/* Detailed info */}
            <ServiceDetailedInfo
              service={assignedDetailService}
              className="compact"
              categoryId={assignedDetailService.typeService}
            />

            {assignableBeneficiaryIds.length > 0 && (
              <div className="assigned-beneficiary-block">
                <button
                  type="button"
                  className={`assigned-beneficiary-toggle ${showBeneficiaries ? "active" : ""}`}
                  onClick={() => setShowBeneficiaries((visible) => !visible)}
                  aria-expanded={showBeneficiaries}
                  disabled={hasActivePayment}
                  title={
                    hasActivePayment
                      ? "Los beneficiarios no se pueden cambiar con un pago activo"
                      : "Elegir los beneficiarios operativos del servicio"
                  }
                >
                  <MdPeople />
                  <span>Beneficiarios</span>
                  <small>
                    {assignedBeneficiarySnapshot.adultIds.length} adultos · {assignedBeneficiarySnapshot.childIds.length} niños
                  </small>
                  {showBeneficiaries ? <MdExpandLess /> : <MdExpandMore />}
                </button>

                {showBeneficiaries && !hasActivePayment && (
                  <div className="assigned-beneficiary-panel">
                    <p>
                      Retire únicamente a quien no recibirá este servicio. La
                      asignación conserva el mismo proveedor y servicio cotizados.
                    </p>
                    <div className="assigned-beneficiary-options">
                      {assignableBeneficiaryIds.map((beneficiaryId) => {
                        const isSelected = assignedBeneficiaryIdSet.has(beneficiaryId);
                        const isChild = String(beneficiaryId).startsWith("child:");
                        return (
                          <label
                            key={beneficiaryId}
                            className={`assigned-beneficiary-option ${isChild ? "is-child" : "is-adult"}`}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              disabled={
                                !isSelected || assignedBeneficiaryIds.length === 1
                              }
                              onChange={(event) =>
                                handleBeneficiaryToggle(
                                  beneficiaryId,
                                  event.target.checked,
                                )
                              }
                            />
                            <span>{getPassengerDisplayName(beneficiaryId)}</span>
                            <small>{isChild ? "Niño" : "Adulto"}</small>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {isTicketRow && (
              <div className="ticket-row-beneficiaries">
                {assignedBeneficiarySnapshot.adultIds.map((id) => (
                  <span key={id} className="ticket-row-pax ticket-row-pax--adult">
                    {formatTicketPassengerLabel(id)}
                  </span>
                ))}
                {assignedBeneficiarySnapshot.childIds.map((id) => (
                  <span key={id} className="ticket-row-pax ticket-row-pax--child">
                    {formatTicketPassengerLabel(id)}
                  </span>
                ))}
                {assignedBeneficiarySnapshot.selectedIds.length === 0 && (
                  <span className="ticket-row-pax ticket-row-pax--empty">
                    Sin beneficiarios por procedencia
                  </span>
                )}
              </div>
            )}

            {/* Price row */}
            <div className="row-assigned-price-row">
              {isEditingPrice ? (
                <div className="price-edit-inline">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={editingPrice.value}
                    onChange={onAdjustmentValueChange}
                    placeholder="Precio"
                    className="price-input"
                    autoFocus
                    onWheel={preventWheelChange}
                    onKeyDown={(e) => {
                      preventArrowChange(e);
                      if (e.key === "Enter") onApplyAdjustment();
                      if (e.key === "Escape")
                        onTogglePriceAdjustment(
                          dayIndex,
                          serviceIndex,
                          false,
                          true,
                        );
                    }}
                  />
                  <div className="price-edit-actions">
                    <button
                      className="apply-small"
                      onClick={onApplyAdjustment}
                      disabled={!editingPrice.value}
                    >
                      <MdCheck />
                    </button>
                    <button
                      className="cancel-small"
                      onClick={() =>
                        onTogglePriceAdjustment(
                          dayIndex,
                          serviceIndex,
                          false,
                          true,
                        )
                      }
                    >
                      <MdClose />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="price-display-row">
                  {!hasActivePayment ? (
                    <span
                      className="assigned-price-clickable"
                      onClick={() =>
                        onTogglePriceAdjustment(
                          dayIndex,
                          serviceIndex,
                          false,
                          true,
                        )
                      }
                      title="Click para editar precio"
                    >
                      {formatCurrency(adultUnitPrice)}
                      <small className="assigned-price-unit">/adulto</small>
                      <MdModeEdit className="price-edit-icon-mini" />
                    </span>
                  ) : (
                    <span className="assigned-price">
                      {formatCurrency(adultUnitPrice)}
                      <small className="assigned-price-unit">/adulto</small>
                    </span>
                  )}
                  {(() => {
                    const explicitChildEntries = Object.entries(
                      childPriceMap,
                    ).filter(([id]) => childIds.includes(id));
                    const nonConvertedTotal = explicitChildEntries.reduce(
                      (sum, [, price]) => sum + (parseFloat(price) || 0),
                      0,
                    );
                    const childPricePerChild =
                      explicitChildEntries.length > 0
                        ? nonConvertedTotal / explicitChildEntries.length
                        : 0;
                    return (
                      <>
                        {childPricePerChild > 0 && (
                          <span className="assigned-price-child">
                            {formatCurrency(childPricePerChild)}
                            <small>/niño</small>
                          </span>
                        )}
                        {convertedCount > 0 && adultUnitPrice > 0 && (
                          <span className="assigned-price-child assigned-price-child--adult">
                            {formatCurrency(adultUnitPrice)}
                            <small>/niño c/a</small>
                          </span>
                        )}
                      </>
                    );
                  })()}
                  <span className="assigned-total-label">
                    Total: {formatCurrency(totalPrice)}
                  </span>
                  {childManagementCount > 0 && (
                    <span
                      className={`assigned-child-tag ${showChildPanel ? "active" : ""}`}
                      onClick={() => setShowChildPanel((p) => !p)}
                      title="Gestionar precio de niños"
                    >
                      <FaChild /> {childManagementCount}
                      {showChildPanel ? <MdExpandLess /> : <MdExpandMore />}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Children price sub-panel - using AssignedChildrenPanel component */}
            {showChildPanel &&
              !hasActivePayment &&
              childManagementCount > 0 && (
                <ChildrenPanel
                  className="assigned-child-panel"
                  childIds={childIds}
                  convertedEntries={convertedEntries}
                  childPriceMap={childPriceMap}
                  adultPrice={adultUnitPrice}
                  getDisplayName={getChildDisplayName}
                  onApplyUniform={(type, value) =>
                    onUpdateChildPrice?.(dayIndex, serviceIndex, type, value)
                  }
                  onConvertChild={(childId) =>
                    onConvertChildToAdult?.(dayIndex, serviceIndex, childId)
                  }
                  onRevertChild={(revertKey) =>
                    onRevertAdultToChild?.(dayIndex, serviceIndex, revertKey)
                  }
                  onApplyIndividual={(childId, type, value) =>
                    onUpdateChildPrice?.(
                      dayIndex,
                      serviceIndex,
                      "individual",
                      type,
                      childId,
                      value,
                    )
                  }
                />
              )}

            {/* Time + action controls */}
            <div className="row-assigned-controls">
              <div className="service-time-header">
                <MdSchedule className="time-icon-header" />
                <input
                  type="time"
                  value={service.assignedService.hora || ""}
                  onChange={(e) =>
                    onServiceTimeChange(dayIndex, serviceIndex, e.target.value)
                  }
                  className="time-input-header"
                />
              </div>
              <div className="header-actions">
                <button
                  className="btn-header-request"
                  onClick={() =>
                    onOpenReservationRequest?.({
                      dayIndex,
                      serviceIndex,
                      service,
                      cotService,
                    })
                  }
                  title="Generar solicitud de reserva"
                >
                  <MdDescription />
                </button>
                {/* Ocultar cambiar/quitar si el servicio tiene pago pendiente o pagado */}
                {!hasActivePayment && (
                  <>
                    <button
                      className="btn-header-edit btn-header-validate"
                      onClick={() => onValidateService?.(dayIndex, serviceIndex)}
                      title="Revalidar tarifa operativa"
                      disabled={isValidating}
                    >
                      <MdCheck />
                    </button>
                    <button
                      className="btn-header-remove"
                      onClick={() => onRemoveAssignment(dayIndex, serviceIndex)}
                      title="Desvalidar"
                    >
                      <MdDelete />
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Payment deadline */}
            {shouldShowPaymentDeadline(service) && (
              <div
                className={`payment-deadline-section ${getPaymentStatusColor(service)}`}
              >
                {isEditingDeadline ? (
                  <div className="deadline-edit-controls">
                    <div className="deadline-input-group">
                      <MdCalendarToday className="calendar-icon" />
                      <input
                        type="datetime-local"
                        value={editingPaymentDeadline.value}
                        onChange={onPaymentDeadlineChange}
                        className="deadline-input"
                        autoFocus
                      />
                    </div>
                    <div className="deadline-actions">
                      <button
                        className="apply-btn"
                        onClick={onApplyPaymentDeadline}
                        disabled={!editingPaymentDeadline.value}
                      >
                        <MdCheck />
                      </button>
                      <button
                        className="cancel-btn"
                        onClick={() =>
                          onTogglePaymentDeadlineEdit(dayIndex, serviceIndex)
                        }
                      >
                        <MdClose />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="payment-deadline-display">
                    <MdSchedule className="deadline-icon" />
                    <span className="deadline-label">Limite:</span>
                    <span className="deadline-value">
                      {formatPaymentDeadline(
                        service.assignedService?.payment_deadline ||
                          service.payment_deadline ||
                          service.paymentRequest?.payment_deadline,
                      )}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          /* Not assigned yet */
          <button
            className="btn-assign btn-validate"
            onClick={() => onValidateService?.(dayIndex, serviceIndex)}
            disabled={validationBusy || isValidating}
          >
            <MdCheck /> {isValidating ? "Validando..." : "Validar servicio"}
          </button>
        )}
      </div>
    </div>
  );
};

export default UnifiedServiceRow;
