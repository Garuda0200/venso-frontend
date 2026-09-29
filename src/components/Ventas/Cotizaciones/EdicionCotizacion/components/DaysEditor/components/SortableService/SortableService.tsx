// components/SortableService.jsx - Excel-like table row design
import React, { useState } from "react";
import {
  MdDelete,
  MdDragIndicator,
  MdCheck,
  MdClose,
  MdExpandMore,
  MdExpandLess,
  MdModeEdit,
  MdFlight,
  MdRestaurant,
  MdConfirmationNumber,
  MdFlashOn,
  MdLock,
  MdSwapHoriz,
  MdEventSeat,
  MdLuggage,
  MdDirections,
  MdGroup,
  MdBed,
  MdStar,
  MdLocationOn,
  MdSchedule,
  MdMap,
  MdLanguage,
  MdDescription,
  MdPerson,
} from "react-icons/md";
import {
  FaUser,
  FaChild,
  FaHotel,
  FaBus,
  FaTrain,
  FaUserTie,
  FaBullseye,
} from "react-icons/fa";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { formatCurrency } from "../../../../utils/formatters";
import { serviceHasPeruvianBeneficiary } from "../../../../utils/igvUtils";
import { getServiceBeneficiarySnapshot } from "../../../../utils/passengerPricingState";
import { isOperationallyAssignedService } from "../../../../utils/assignmentProtection";
import {
  resolveServiceExchangeRate,
  serviceNeedsQuotationExchangeRate,
} from "../../../../utils/serviceExchangeRate";
import { getServicePricingSnapshot } from "../../../../utils/servicePricingRuntime";
import {
  formatTicketPassengerLabel,
  getTicketEntrada,
  getTicketProcedencia,
  getTicketTipoUsuario,
  normalizeTicketProcedencia,
  normalizeTicketText,
} from "../../../../utils/ticketBeneficiaries";
import {
  detectServiceType,
  getServiceName,
} from "../../utils/serviceTypeMapper";

import ChildrenPanel from "./ChildrenPanel";
import { getServiceObservations } from "../../utils/serviceObservations";
import "./SortableService.scss";

// ================================
// React Icons map for service types.
// ================================
const SERVICE_ICON_MAP = {
  hoteles: <FaHotel />,
  transportes: <FaBus />,
  trenes: <FaTrain />,
  guias: <FaUserTie />,
  endoses: <FaBullseye />,
  vuelos: <MdFlight />,
  restaurantes: <MdRestaurant />,
  tickets: <MdConfirmationNumber />,
  extras: <MdFlashOn />,
  default: <MdConfirmationNumber />,
};

// ================================
// Helpers
// ================================
const validateServiceStructure = (service) =>
  service?.parentService && service?.childService && service?.tariff;

const getServicePrice = (service) => {
  if (!service) return 0;
  if (validateServiceStructure(service)) {
    return parseFloat(
      service.tariff?.precio_original || service.tariff?.precio || 0,
    );
  }
  return parseFloat(service.precio || 0);
};

const shouldShowIGV = (service, passengers = []) => {
  if (!service) return false;
  const category = (
    service.parentService?.typeService ||
    service.typeService ||
    ""
  ).toLowerCase();
  if (category !== "hoteles" && category !== "hotel") return false;
  const roomHasPeruvian = serviceHasPeruvianBeneficiary(
    service,
    passengers,
    service?.passengerSelection,
  );
  return (
    (service.tariff?.tieneIgv || service.tariff?.igvIncluido) &&
    roomHasPeruvian
  );
};

const getDivisionCountsForService = (service, fallbackTotal) => {
  const assignedIds = Array.isArray(service.assignedPassengerIds)
    ? service.assignedPassengerIds
    : null;
  const paxAssigned = assignedIds
    ? assignedIds.length
    : Math.max(1, fallbackTotal);
  const childMap = service.assignedChildExplicitPriceMap || {};
  const explicitChildCount = Object.values(childMap).filter(
    (v) => v != null && !isNaN(parseFloat(v)),
  ).length;
  const paxForDivision = Math.max(1, paxAssigned - explicitChildCount);
  const childExtrasTotal =
    Number(
      service.tariff?.childExtrasTotal ??
        service.assignedChildExplicitPriceSum ??
        0,
    ) || 0;
  return { paxAssigned, explicitChildCount, paxForDivision, childExtrasTotal };
};

const calculateServicePrice = (service, totalPassengers, passengers) => {
  if (!service?.tariff) {
    return {
      precio: 0,
      hasIGV: false,
      total: 0,
      pricePerPerson: 0,
      totalPrice: 0,
    };
  }
  const pricing = getServicePricingSnapshot(service);
  const category = (
    service.parentService?.typeService ||
    service.typeService ||
    ""
  ).toLowerCase();
  let hasIGV = false;
  if (category === "hoteles" || category === "hotel") {
    const roomHasPeruvian = serviceHasPeruvianBeneficiary(
      service,
      passengers,
      service?.passengerSelection,
    );
    if (roomHasPeruvian && service.tariff.tieneIgv) hasIGV = true;
  }
  return {
    precio: pricing.precioAdult,
    hasIGV,
    total: pricing.total,
    totalPrice: pricing.total,
    pricePerPerson: pricing.precioAdult,
  };
};

// ================================
// Extra details per service type
// ================================
export const getServiceDetails = (service, serviceType) => {
  const cs = service?.childService || {};
  const ps = service?.parentService || {};
  const mov = cs.movilidad || cs;
  const tour = cs.tour || cs;
  const ticket = cs.ticket || cs;
  const details = [];
  const add = (text, icon = null) => {
    if (text) details.push({ text, icon });
  };

  switch (serviceType) {
    case "trenes":
      if (cs.lugar_salida || cs.lugar_destino)
        add(
          `${cs.lugar_salida || "?"} → ${cs.lugar_destino || "?"}`,
          MdDirections,
        );
      if (cs.hora_salida) add(cs.hora_salida, MdSchedule);
      if (cs.tipo_tren) add(cs.tipo_tren, null);
      break;
    case "hoteles":
      if (cs.tipo_habitacion) add(cs.tipo_habitacion, MdBed);
      if (ps.categoria) add(`${ps.categoria}`, MdStar);
      if (ps.ciudad) add(ps.ciudad, MdLocationOn);
      break;
    case "transportes":
      if (mov.ruta || cs.ruta) add(mov.ruta || cs.ruta, MdDirections);
      if (mov.tipo_auto || cs.tipo_auto)
        add(mov.tipo_auto || cs.tipo_auto, FaBus);
      {
        const cap = mov.nro_pasajeros || cs.nro_pasajeros;
        if (cap) add(`Cap: ${cap} pax`, MdGroup);
      }
      break;
    case "guias":
      if (cs.tour_nombre || tour.tour_nombre)
        add(cs.tour_nombre || tour.tour_nombre, MdMap);
      if (ps.zona) add(ps.zona, MdLocationOn);
      break;
    case "endoses":
      if (cs.tipo_guiado || tour.tipo_guiado)
        add(cs.tipo_guiado || tour.tipo_guiado, MdMap);
      if (cs.idioma || tour.idioma) add(cs.idioma || tour.idioma, MdLanguage);
      if (ps.tipo_tour) add(ps.tipo_tour, null);
      break;
    case "vuelos":
      if (cs.lugar_ida || cs.lugar_vuelta)
        add(`${cs.lugar_ida || "?"} → ${cs.lugar_vuelta || "?"}`, MdFlight);
      if (cs.tipovuelo) add(cs.tipovuelo, MdEventSeat);
      if (cs.equipaje) add(cs.equipaje, MdLuggage);
      break;
    case "restaurantes":
      if (cs.direccion) add(cs.direccion, MdLocationOn);
      if (ps.ciudad) add(ps.ciudad, MdLocationOn);
      break;
    case "tickets":
      if (ticket.procedencia || cs.procedencia)
        add(ticket.procedencia || cs.procedencia, MdLocationOn);
      if (ticket.tipo_usuario || cs.tipo_usuario)
        add(ticket.tipo_usuario || cs.tipo_usuario, MdPerson);
      break;
    case "extras": {
      const extra = cs.servicio_extra || cs;
      if (extra.descripcion) add(extra.descripcion, MdDescription);
      break;
    }
    default:
      break;
  }
  return details.filter(({ text }) => Boolean(text)).slice(0, 3);
};

// ================================
// SortableService - Minimal table row
// ================================
const SortableService = React.memo(({
  service,
  serviceIndex,
  dayIndex,
  totalPassengers,
  passengers = [],
  getAllPassengers = [],
  removeService,
  togglePriceAdjustment,
  editingPrice,
  handleAdjustmentValueChange,
  applyAdjustment,
  onEditChildPrice,
  editingChildPrice,
  setEditingChildPrice,
  applyChildPrice,
  cancelChildPriceEdit,
  onConvertChildToAdult,
  onRevertAdultToChild,
  applyUniformChildPrice,
  applyIndividualChildPrice,
  onChangeService,
  days = [],
  hideServiceTotal = false,
  quotationExchangeRate = null,
  onApplyQuotationExchangeRate,
}) => {
  const [showChildPanel, setShowChildPanel] = useState(false);

  const isVoucherLinked = isOperationallyAssignedService(service);
  const serviceExchangeRate = resolveServiceExchangeRate(service);
  const needsQuotationExchangeRate =
    !isVoucherLinked &&
    serviceNeedsQuotationExchangeRate(service, quotationExchangeRate);

  const exchangeRateAction = needsQuotationExchangeRate ? (
    <button
      type="button"
      className="sr__tc-btn"
      onClick={() => onApplyQuotationExchangeRate?.(dayIndex, serviceIndex)}
      title={`Precio actual con TC ${serviceExchangeRate.toFixed(2)}. Aplicar TC ${Number(quotationExchangeRate).toFixed(2)} de la cotización`}
      aria-label={`Aplicar tasa de cambio ${Number(quotationExchangeRate).toFixed(2)}`}
    >
      TC
    </button>
  ) : null;

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: service.id || `service-${dayIndex}-${serviceIndex}`,
    data: { type: "service", service, dayIndex, serviceIndex },
    disabled: isVoucherLinked,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  // Derived data
  const calculatedPrice = calculateServicePrice(
    service,
    totalPassengers,
    getAllPassengers,
  );
  const pricingSnapshot = getServicePricingSnapshot(service);
  const serviceType = detectServiceType(service);
  const serviceObservations = getServiceObservations(service, serviceType);
  const serviceName = getServiceName(service);
  const serviceIcon = SERVICE_ICON_MAP[serviceType] || SERVICE_ICON_MAP.default;
  const typeLabel = serviceType.charAt(0).toUpperCase() + serviceType.slice(1);

  const hasIGV = validateServiceStructure(service)
    ? shouldShowIGV(service, getAllPassengers)
    : calculatedPrice.hasIGV;

  const beneficiarySnapshot = getServiceBeneficiarySnapshot(service);

  const assignedIds =
    beneficiarySnapshot.selectedIds.length > 0
      ? beneficiarySnapshot.selectedIds
      : pricingSnapshot.assignedIds.length > 0
        ? pricingSnapshot.assignedIds
        : service.assignedPassengerIds || [];
  const adultIds =
    beneficiarySnapshot.adultIds.length > 0
      ? beneficiarySnapshot.adultIds
      : pricingSnapshot.actualAdultIds.length > 0
        ? pricingSnapshot.actualAdultIds
        : assignedIds.filter((id) => id.startsWith("adult:"));
  const allChildIds = beneficiarySnapshot.allChildIds;
  const convertedEntries = beneficiarySnapshot.convertedEntries;
  const childIds = beneficiarySnapshot.childIds;
  const convertedCount = convertedEntries.length;
  const convertedChildIds = convertedEntries.map((entry) => entry.childId).filter(Boolean);
  const ticketProcedenciaFilter =
    serviceType === "tickets"
      ? service.ticketProcedenciaFilter ||
        service.passengerSelection?.ticketProcedenciaFilter ||
        ""
      : "";
  const ticketTargetGroup =
    serviceType === "tickets"
      ? service.ticketPassengerTargetGroup ||
        service.passengerSelection?.ticketPassengerTargetGroup ||
        service.childService?.ticketPassengerTargetGroup ||
        ""
      : "";
  const rawTicketTipoUsuario =
    serviceType === "tickets" ? getTicketTipoUsuario(service) : "";
  const normalizedTicketTipoUsuario = normalizeTicketText(rawTicketTipoUsuario);
  const isTicketStudentRow =
    serviceType === "tickets" &&
    (ticketTargetGroup === "child" ||
      normalizedTicketTipoUsuario.includes("estudiante") ||
      normalizedTicketTipoUsuario.includes("student") ||
      normalizedTicketTipoUsuario.includes("nino") ||
      normalizedTicketTipoUsuario.includes("nina") ||
      normalizedTicketTipoUsuario.includes("menor") ||
      normalizedTicketTipoUsuario.includes("child"));
  const ticketUnitSuffix = isTicketStudentRow ? "estudiante" : "adulto";
  const adultPrice =
    pricingSnapshot.precioAdult || parseFloat(service.tariff?.precio || 0);
  // Fallback to package passenger counts when service has no explicit assignment.
  // Tickets with procedencia use an explicit nationality filter; when it returns
  // zero passengers, keep the count at 0 instead of falling back to all pax.
  const childCount = childIds.length;
  const adultCount =
    adultIds.length > 0
      ? adultIds.length
      : ticketProcedenciaFilter
        ? 0
        : Math.max(0, totalPassengers - childCount);
  const childPriceMap = beneficiarySnapshot.childPriceMap;
  const ticketStudentChildIds = isTicketStudentRow
    ? Array.from(
        new Set(
          [
            ...convertedChildIds,
            ...childIds,
            ...allChildIds.filter((id) => String(id).startsWith("child:")),
          ].filter(Boolean),
        ),
      )
    : [];
  const ticketManagedChildIds = isTicketStudentRow ? [] : childIds;
  const ticketAllManagedChildIds = isTicketStudentRow ? [] : allChildIds;
  const displayTicketAdultIds = isTicketStudentRow
    ? ticketStudentChildIds
    : serviceType === "tickets"
      ? [...adultIds, ...convertedChildIds]
      : adultIds;
  const displayAdultIds = serviceType === "tickets"
    ? displayTicketAdultIds
    : adultIds;
  const ticketDisplayChildPriceMap = isTicketStudentRow ? {} : childPriceMap;

  const unitPrice = calculatedPrice.pricePerPerson || 0;
  const totalPrice =
    pricingSnapshot.total ||
    parseFloat(
      service.tariff?.precio_original_with_child_extras ??
        service.tariff?.precio_original ??
        service.tariff?.precio ??
        service.precio_original ??
        service.precio ??
        0,
    );

  const isEditing =
    !isVoucherLinked &&
    editingPrice.dayIndex === dayIndex &&
    editingPrice.serviceIndex === serviceIndex;

  // Extra details per service type
  const details = getServiceDetails(service, serviceType);
  const displayDetails =
    ticketProcedenciaFilter && serviceType === "tickets"
      ? [
          ...details,
          {
            text: `${ticketProcedenciaFilter === "nacional" ? "Nacional" : "Extranjero"}: ${displayAdultIds.length} beneficiario${displayAdultIds.length === 1 ? "" : "s"}`,
            icon: MdPerson,
          },
        ].slice(0, 4)
      : details;

  // Bimodal train info
  const isBimodal =
    serviceType === "trenes" && Boolean(service?.childService?.es_bimodal);
  const isReturnOnly = Boolean(service?.isReturnOnly);

  // ── Compact bimodal return annotation ──
  if (isReturnOnly) {
    return (
      <div ref={setNodeRef} style={style} className="sr sr--return-compact">
        <div className="sr__return-row">
          <span className="sr__return-icon"></span>
          <span className="sr__return-label">
            Retorno bimodal — {serviceName}
          </span>
          <button
            className="sr__return-delete"
            onClick={() => removeService(dayIndex, serviceIndex)}
            title="Quitar retorno"
          >
            <MdClose />
          </button>
        </div>
      </div>
    );
  }


  const ticketEntrada = serviceType === "tickets" ? getTicketEntrada(service) : "";
  const ticketProcedencia = serviceType === "tickets"
    ? normalizeTicketProcedencia(getTicketProcedencia(service))
    : "";
  const ticketTipoUsuario = rawTicketTipoUsuario;
  const renderTicketBeneficiaryTags = (ids = [], kind = "adult") =>
    ids.length > 0 ? (
      <div className={`sr-ticket__beneficiary-group sr-ticket__beneficiary-group--${kind}`}>
        {ids.map((id) => (
          <span
            key={id}
            className={`sr__pax-tag sr__pax-tag--${kind === "child" ? "child" : "adult"}`}
            title={id}
          >
            {kind === "child" ? <FaChild /> : <FaUser />}
            {formatTicketPassengerLabel(id)}
          </span>
        ))}
      </div>
    ) : null;

  const ticketChildPriceEntries = isTicketStudentRow
    ? []
    : Object.entries(pricingSnapshot.children || {}).filter(
        ([childId, childData]) =>
          !childData?.asAdult && ticketManagedChildIds.includes(childId),
      );
  const ticketChildAmounts = ticketChildPriceEntries.map(
    ([, childData]) => parseFloat(childData?.amount) || 0,
  );
  const ticketChildUniqueAmounts = Array.from(
    new Set(ticketChildAmounts.map((amount) => amount.toFixed(2))),
  ).map((amount) => parseFloat(amount));
  const ticketChildUnitLabel =
    ticketChildAmounts.length === 0
      ? null
      : ticketChildUniqueAmounts.length > 1
        ? "mixto"
        : ticketChildUniqueAmounts[0] > 0
          ? formatCurrency(ticketChildUniqueAmounts[0])
          : "Gratis";
  const renderTicketChildControl = () =>
    ticketAllManagedChildIds.length > 0 ? (
      <button
        type="button"
        className={`sr__pax-tag sr__pax-tag--child ${showChildPanel ? "active" : ""}`}
        onClick={(e) => {
          e.stopPropagation();
          if (!isVoucherLinked) setShowChildPanel(!showChildPanel);
        }}
        disabled={isVoucherLinked}
        title={
          isVoucherLinked
            ? "Vinculado a voucher — beneficiarios bloqueados"
            : convertedCount > 0
              ? `${ticketAllManagedChildIds.length} niño${ticketAllManagedChildIds.length === 1 ? "" : "s"}; ${convertedCount} con tarifa adulto`
              : "Gestionar niños del ticket"
        }
      >
        <FaChild />
        <span>{ticketAllManagedChildIds.length}</span>
        <span className="sr__pax-label">
          {ticketAllManagedChildIds.length === 1 ? "niño" : "niños"}
        </span>
        {showChildPanel ? <MdExpandLess /> : <MdExpandMore />}
      </button>
    ) : null;

  if (serviceType === "tickets") {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className={`sr sr--tickets sr--ticket-card ${hideServiceTotal ? "sr--no-total" : ""} ${isDragging ? "sr--dragging" : ""}`}
      >
        <div className="sr-ticket__row">
          <div className="sr__drag sr-ticket__drag" {...attributes} {...listeners}>
            <MdDragIndicator />
          </div>

          <div className="sr-ticket__main">
            <div className="sr-ticket__eyebrow">Ticket / entrada</div>
            <div className="sr-ticket__title-wrap">
              <span className="sr__icon sr-ticket__icon">{serviceIcon}</span>
              <span className="sr-ticket__title" title={ticketEntrada || serviceName}>
                {ticketEntrada || serviceName}
              </span>
            </div>
            <div className="sr__tags sr-ticket__tags">
              {ticketProcedencia && (
                <span className="sr__tag sr__tag--primary">
                  <MdLocationOn className="sr__tag-icon" />
                  {ticketProcedencia === "nacional" ? "Nacional" : "Extranjero"}
                </span>
              )}
              {ticketTipoUsuario && (
                <span className="sr__tag sr__tag--secondary">
                  <MdPerson className="sr__tag-icon" />
                  {ticketTipoUsuario}
                </span>
              )}
            </div>
          </div>

          <div className="sr-ticket__beneficiaries">
            {displayAdultIds.length > 0 || ticketAllManagedChildIds.length > 0 ? (
              <>
                {renderTicketBeneficiaryTags(displayAdultIds, "adult")}
                {renderTicketChildControl()}
              </>
            ) : (
              <span className="sr-ticket__empty-beneficiaries">
                Sin beneficiarios por procedencia
              </span>
            )}
          </div>

          <div className="sr-ticket__price">
            {isEditing ? (
              <div className="sr__edit">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={editingPrice.value}
                  onChange={handleAdjustmentValueChange}
                  className="sr__edit-input"
                  autoFocus
                  onWheel={(e) => e.target.blur()}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowUp" || e.key === "ArrowDown") e.preventDefault();
                    if (e.key === "Enter") {
                      e.preventDefault();
                      e.stopPropagation();
                      applyAdjustment();
                    }
                    if (e.key === "Escape") {
                      e.preventDefault();
                      e.stopPropagation();
                      togglePriceAdjustment(dayIndex, serviceIndex, false, true);
                    }
                  }}
                />
                <button type="button" className="sr__edit-ok" onClick={applyAdjustment} title="Guardar precio">
                  <MdCheck />
                </button>
                <button
                  type="button"
                  className="sr__edit-cancel"
                  onClick={() => togglePriceAdjustment(dayIndex, serviceIndex, false, true)}
                  title="Cancelar"
                >
                  <MdClose />
                </button>
              </div>
            ) : (
              <div className="sr-ticket__price-stack">
                <button
                  type="button"
                  className="sr-ticket__unit-price"
                  onClick={() =>
                    !isVoucherLinked &&
                    togglePriceAdjustment(dayIndex, serviceIndex, false, true)
                  }
                  disabled={isVoucherLinked}
                  title={
                    isVoucherLinked
                      ? "Vinculado a voucher — precio bloqueado"
                      : `Editar precio unitario ${ticketUnitSuffix}`
                  }
                >
                  <span>{formatCurrency(adultPrice)}</span>
                  <small>/{normalizeTicketText(ticketTipoUsuario).includes("estudiante") ? "estudiante" : ticketUnitSuffix}</small>
                  <MdModeEdit />
                </button>
                {ticketChildUnitLabel && (
                  <span
                    className="sr__price-child sr-ticket__child-price"
                    title={
                      ticketChildUniqueAmounts.length > 1
                        ? `Tarifas niño/estudiante: ${ticketChildAmounts
                            .map((amount) => formatCurrency(amount))
                            .join(", ")}`
                        : "Tarifa niño/estudiante del ticket"
                    }
                  >
                    {ticketChildUnitLabel}
                    <small>/niño</small>
                  </span>
                )}
              </div>
            )}
          </div>

          {!hideServiceTotal && (
            <div className="sr-ticket__total">
              <span>{formatCurrency(totalPrice)}</span>
            </div>
          )}

          <div className="sr__del sr-ticket__actions">
            {exchangeRateAction}
            {!isVoucherLinked && onChangeService && (
              <button
                className="sr__swap-btn"
                onClick={() => onChangeService(dayIndex, serviceIndex)}
                title="Cambiar servicio"
              >
                <MdSwapHoriz />
              </button>
            )}
            <button
              className={`sr__del-btn${isVoucherLinked ? " sr__del-btn--locked" : ""}`}
              onClick={() => !isVoucherLinked && removeService(dayIndex, serviceIndex)}
              title={isVoucherLinked ? "Vinculado a voucher — no se puede eliminar" : "Quitar servicio"}
              disabled={isVoucherLinked}
            >
              {isVoucherLinked ? <MdLock /> : <MdDelete />}
            </button>
          </div>
        </div>
        {serviceObservations && (
        <div className="sr__observations">
          <MdDescription className="sr__observations-icon" />
          <span><strong>Observaciones:</strong> {serviceObservations}</span>
        </div>
      )}

      {!isVoucherLinked && showChildPanel && ticketAllManagedChildIds.length > 0 && (
          <ChildrenPanel
            childIds={ticketManagedChildIds}
            convertedEntries={convertedEntries}
            childPriceMap={ticketDisplayChildPriceMap}
            adultPrice={adultPrice}
            getDisplayName={(id) => formatTicketPassengerLabel(id)}
            onApplyUniform={(type, val) =>
              applyUniformChildPrice?.(dayIndex, serviceIndex, type, val)
            }
            onConvertChild={(childId) =>
              onConvertChildToAdult?.(dayIndex, serviceIndex, childId)
            }
            onRevertChild={(revertKey) =>
              onRevertAdultToChild?.(dayIndex, serviceIndex, revertKey)
            }
            onApplyIndividual={(childId, type, val) =>
              applyIndividualChildPrice?.(dayIndex, serviceIndex, childId, type, val)
            }
          />
        )}
      </div>
    );
  }

  // ── Transport capacity conflict check ──
  const isTransport = serviceType === "transportes";
  const vehicleCapacity = isTransport
    ? parseInt(service?.childService?.nro_pasajeros) || 0
    : 0;
  const hasCapacityConflict =
    isTransport && vehicleCapacity > 0 && vehicleCapacity < totalPassengers;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`sr sr--${serviceType} ${hideServiceTotal ? "sr--no-total" : ""} ${isDragging ? "sr--dragging" : ""} ${isReturnOnly ? "sr--return" : ""} ${hasCapacityConflict ? "sr--capacity-warning" : ""}`}
      title={
        hasCapacityConflict
          ? ` Capacidad: ${vehicleCapacity} pax — Se requieren ${totalPassengers}`
          : undefined
      }
    >
      {/* Main row */}
      <div className="sr__row">
        <div className="sr__drag" {...attributes} {...listeners}>
          <MdDragIndicator />
        </div>

        <div className="sr__info">
          <span className="sr__icon">{serviceIcon}</span>
          <div className="sr__info-text">
            <span className="sr__name" title={serviceName}>
              {serviceName}
              {isBimodal && (
                <span className="sr__bimodal">
                  {isReturnOnly ? " retorno" : " bimodal"}
                </span>
              )}
            </span>
            {serviceType === "vuelos"
              ? (service?.childService?.lugar_ida ||
                  service?.childService?.lugar_vuelta ||
                  service?.childService?.tipovuelo ||
                  service?.childService?.equipaje) && (
                  <div className="sr__tags">
                    {(service?.childService?.lugar_ida ||
                      service?.childService?.lugar_vuelta) && (
                      <span className="sr__tag sr__tag--route">
                        <MdFlight className="sr__tag-icon" />
                        {service?.childService?.lugar_ida || "?"} →{" "}
                        {service?.childService?.lugar_vuelta || "?"}
                      </span>
                    )}
                    {service?.childService?.tipovuelo && (
                      <span className="sr__tag sr__tag--class">
                        <MdEventSeat className="sr__tag-icon" />
                        {service.childService.tipovuelo}
                      </span>
                    )}
                    {service?.childService?.equipaje && (
                      <span className="sr__tag sr__tag--luggage">
                        <MdLuggage className="sr__tag-icon" />
                        {service.childService.equipaje}
                      </span>
                    )}
                  </div>
                )
              : displayDetails.length > 0 && (
                  <div className="sr__tags">
                    {displayDetails.map(({ text, icon: Icon }, i) => (
                      <span
                        key={i}
                        className={`sr__tag ${i === 0 ? "sr__tag--primary" : "sr__tag--secondary"}`}
                      >
                        {Icon && <Icon className="sr__tag-icon" />}
                        {text}
                      </span>
                    ))}
                  </div>
                )}
          </div>
        </div>

        <div className="sr__type">
          <span className={`sr__badge sr__badge--${serviceType}`}>
            {typeLabel}
          </span>
        </div>

        <div className="sr__pax">
          {adultCount > 0 && (
            <span
              className="sr__pax-tag sr__pax-tag--adult"
              title={
                convertedCount > 0
                  ? `${adultCount} adultos`
                  : `${adultCount} adultos`
              }
            >
              <FaUser /> {adultCount}
              {convertedCount > 0 && (
                <span className="sr__pax-converted">+{convertedCount}n</span>
              )}
            </span>
          )}
          {allChildIds.length > 0 && (
            <button
              type="button"
              className={`sr__pax-tag sr__pax-tag--child ${showChildPanel ? "active" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                if (!isVoucherLinked) setShowChildPanel(!showChildPanel);
              }}
              disabled={isVoucherLinked}
              title={
                isVoucherLinked
                  ? "Vinculado a voucher — beneficiarios bloqueados"
                  : convertedCount > 0
                    ? `${allChildIds.length} niño${allChildIds.length === 1 ? "" : "s"}; ${convertedCount} con tarifa adulto`
                    : "Gestionar niños"
              }
            >
              <FaChild />
              <span>{allChildIds.length}</span>
              <span className="sr__pax-label">
                {allChildIds.length === 1 ? "niño" : "niños"}
              </span>
              {showChildPanel ? <MdExpandLess /> : <MdExpandMore />}
            </button>
          )}
        </div>

        <div className="sr__price">
          {isEditing ? (
            <div className="sr__edit">
              <input
                type="number"
                min="0"
                step="0.01"
                value={editingPrice.value}
                onChange={handleAdjustmentValueChange}
                className="sr__edit-input"
                autoFocus
                onWheel={(e) => e.target.blur()}
                onKeyDown={(e) => {
                  if (e.key === "ArrowUp" || e.key === "ArrowDown")
                    e.preventDefault();
                  if (e.key === "Enter") {
                    e.preventDefault();
                    e.stopPropagation();
                    applyAdjustment();
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    e.stopPropagation();
                    togglePriceAdjustment(dayIndex, serviceIndex, false, true);
                  }
                }}
              />
              <button
                type="button"
                className="sr__edit-ok"
                onClick={applyAdjustment}
                title="Guardar precio"
              >
                <MdCheck />
              </button>
              <button
                type="button"
                className="sr__edit-cancel"
                onClick={() =>
                  togglePriceAdjustment(dayIndex, serviceIndex, false, true)
                }
                title="Cancelar"
              >
                <MdClose />
              </button>
            </div>
          ) : (
            <div className="sr__price-stack">
              <span
                className="sr__price-value"
                onClick={() =>
                  !isVoucherLinked &&
                  togglePriceAdjustment(dayIndex, serviceIndex, false, true)
                }
                title={
                  isVoucherLinked
                    ? "Vinculado a voucher — precio bloqueado"
                    : "Click para editar precio adulto"
                }
              >
                {formatCurrency(adultPrice)}
                <small className="sr__price-unit">/adulto</small>
                {hasIGV && <span className="sr__igv">+IGV</span>}
                <MdModeEdit className="sr__price-edit-icon" />
              </span>
              {(() => {
                // Children with their own explicit price (not converted to adult)
                const explicitChildEntries = Object.entries(
                  pricingSnapshot.children || {},
                ).filter(([, childData]) => !childData?.asAdult);
                const explicitAmounts = explicitChildEntries.map(
                  ([, childData]) => parseFloat(childData?.amount) || 0,
                );
                const nonConvertedTotal = explicitAmounts.reduce(
                  (sum, amount) => sum + amount,
                  0,
                );
                const uniqueExplicitAmounts = Array.from(
                  new Set(explicitAmounts.map((amount) => amount.toFixed(2))),
                ).map((amount) => parseFloat(amount));
                const childPricePerChild =
                  explicitAmounts.length > 0
                    ? nonConvertedTotal / explicitAmounts.length
                    : 0;
                const childPriceLabel =
                  explicitAmounts.length === 0
                    ? null
                    : uniqueExplicitAmounts.length > 1
                      ? "mixto"
                      : childPricePerChild > 0
                        ? formatCurrency(childPricePerChild)
                        : "Gratis";
                const convertedChildCount = convertedCount;
                return (
                  <>
                    {childPriceLabel && (
                      <span
                        className="sr__price-child"
                        title={
                          uniqueExplicitAmounts.length > 1
                            ? `Tarifas de niños: ${explicitAmounts
                                .map((amount) => formatCurrency(amount))
                                .join(", ")}`
                            : undefined
                        }
                      >
                        {childPriceLabel}
                        <small>/niño</small>
                      </span>
                    )}
                    {convertedChildCount > 0 && (
                      <span
                        className="sr__price-context"
                        title={`${convertedChildCount} niño${convertedChildCount > 1 ? "s" : ""} con tarifa unificada`}
                      >
                        +{convertedChildCount} niño
                        {convertedChildCount > 1 ? "s" : ""}
                      </span>
                    )}
                  </>
                );
              })()}
            </div>
          )}
        </div>

        {!hideServiceTotal && (
          <div className="sr__total">
            <span className="sr__total-value">{formatCurrency(totalPrice)}</span>
          </div>
        )}

        <div className="sr__del">
          {exchangeRateAction}
          {!isVoucherLinked && onChangeService && (
            <button
              className="sr__swap-btn"
              onClick={() => onChangeService(dayIndex, serviceIndex)}
              title="Cambiar servicio"
            >
              <MdSwapHoriz />
            </button>
          )}
          <button
            className={`sr__del-btn${isVoucherLinked ? " sr__del-btn--locked" : ""}`}
            onClick={() =>
              !isVoucherLinked && removeService(dayIndex, serviceIndex)
            }
            title={
              isVoucherLinked
                ? "Vinculado a voucher — no se puede eliminar"
                : "Quitar servicio"
            }
            disabled={isVoucherLinked}
          >
            {isVoucherLinked ? <MdLock /> : <MdDelete />}
          </button>
        </div>
      </div>

      {/* Child management sub-panel */}
      {!isVoucherLinked && showChildPanel && allChildIds.length > 0 && (
        <ChildrenPanel
          childIds={childIds}
          convertedEntries={convertedEntries}
          childPriceMap={ticketDisplayChildPriceMap}
          adultPrice={adultPrice}
          onApplyUniform={(type, val) =>
            applyUniformChildPrice?.(dayIndex, serviceIndex, type, val)
          }
          onConvertChild={(childId) =>
            onConvertChildToAdult?.(dayIndex, serviceIndex, childId)
          }
          onRevertChild={(revertKey) =>
            onRevertAdultToChild?.(dayIndex, serviceIndex, revertKey)
          }
          onApplyIndividual={(childId, type, val) =>
            applyIndividualChildPrice?.(dayIndex, serviceIndex, childId, type, val)
          }
        />
      )}
    </div>
  );
});

SortableService.displayName = "SortableService";

export default SortableService;
