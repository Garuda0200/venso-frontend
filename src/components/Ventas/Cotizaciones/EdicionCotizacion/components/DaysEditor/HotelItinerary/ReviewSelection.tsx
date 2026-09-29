import { useState, useEffect, useMemo, useCallback } from "react";
import {
  FaHotel,
  FaBed,
  FaUsers,
  FaStar,
  FaMoneyBillWave,
  FaInfoCircle,
  FaArrowLeft,
  FaCheck,
  FaEdit,
  FaExclamationTriangle,
  FaTrash,
} from "react-icons/fa";
import { MdNightsStay } from "react-icons/md";
import ServiceDetailedInfo from "../components/ServiceDetailedInfo";
import { getCategoryDisplay, formatPrice, getRoomCapacity } from "./utils";
import { getCurrencySymbol } from "../../../utils/tariffCurrency";
import "./ReviewSelection.scss";

const ReviewSelection = ({
  // Props para multiselección
  selectedRooms = [],
  onRemoveRoom,
  onUpdateRoomPrice,
  totalPassengers = 2,
  // Props legacy para compatibilidad
  selectedHotel,
  selectedRoom,
  selectedTariff,
  selectedDays,
  days,
  packageType,
  onBack,
  onPriceChange,
}) => {
  // Modo multiselección si hay selectedRooms
  const isMultiMode = selectedRooms && selectedRooms.length > 0;

  // Calcular capacidad total de habitaciones seleccionadas (considerando cantidad)
  const totalCapacity = useMemo(() => {
    if (isMultiMode) {
      return selectedRooms.reduce((sum, item) => {
        const qty = item.quantity || 1;
        return sum + getRoomCapacity(item.room) * qty;
      }, 0);
    }
    return selectedRoom ? getRoomCapacity(selectedRoom) : 0;
  }, [isMultiMode, selectedRooms, selectedRoom]);

  // Calcular total de habitaciones (sumando cantidades)
  const totalRoomsCount = useMemo(() => {
    return selectedRooms.reduce((sum, item) => sum + (item.quantity || 1), 0);
  }, [selectedRooms]);

  // Estado para controlar qué habitación se está editando
  const [editingRoomId, setEditingRoomId] = useState(null);

  // Obtener precio actual de una habitación (custom o de tarifa)
  const getRoomPrice = (item) => {
    if (item.customPrice !== undefined && item.customPrice !== null) {
      return item.customPrice;
    }
    const tariff = item.tariff;
    return packageType === "privado" && tariff?.precio_privado
      ? parseFloat(tariff.precio_privado)
      : parseFloat(
          tariff?.precio_compartido ||
            tariff?.precio_unico ||
            tariff?.precio ||
            0,
        );
  };

  // Calcular total general (considerando cantidad)
  const totalPrice = useMemo(() => {
    if (isMultiMode) {
      return selectedRooms.reduce((sum, item) => {
        const price = getRoomPrice(item);
        const qty = item.quantity || 1;
        return sum + price * qty * selectedDays.length;
      }, 0);
    }
    const singlePrice =
      customPriceLegacy !== null ? customPriceLegacy : defaultPrice;
    return singlePrice * selectedDays.length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMultiMode, selectedRooms, selectedDays, packageType]);

  // Manejar cambio de precio individual
  const handlePriceChange = (roomId, value) => {
    if (onUpdateRoomPrice) {
      onUpdateRoomPrice(roomId, value);
    }
  };

  // Para modo legacy (una sola habitación)
  const roomType =
    selectedRoom?.tipo_habitacion ||
    selectedRoom?.habitacion?.tipo_habitacion ||
    "Habitación";
  const capacity = selectedRoom ? getRoomCapacity(selectedRoom) : 0;

  const defaultPrice = useMemo(() => {
    if (!selectedTariff) return 0;
    return packageType === "privado" && selectedTariff.precio_privado
      ? parseFloat(selectedTariff.precio_privado)
      : parseFloat(
          selectedTariff.precio_compartido || selectedTariff.precio_unico || 0,
        );
  }, [selectedTariff, packageType]);

  // Estado para precio legacy
  const [customPriceLegacy, setCustomPriceLegacy] = useState(null);

  // Inicializar precio legacy
  useEffect(() => {
    if (!isMultiMode && selectedTariff && customPriceLegacy === null) {
      setCustomPriceLegacy(defaultPrice);
    }
  }, [isMultiMode, selectedTariff, defaultPrice, customPriceLegacy]);

  // Notificar cambio de precio al padre (modo legacy)
  const notifyPriceChange = useCallback(
    (price) => {
      if (onPriceChange) {
        onPriceChange(price);
      }
    },
    [onPriceChange],
  );

  useEffect(() => {
    if (!isMultiMode && customPriceLegacy !== null) {
      notifyPriceChange(customPriceLegacy);
    }
  }, [customPriceLegacy, notifyPriceChange, isMultiMode]);

  return (
    <div className="review-selection-component">
      <div className="section-header">
        <h3>
          <FaCheck /> Confirmar Selección
        </h3>
        <button className="back-btn" onClick={onBack}>
          <FaArrowLeft /> Volver
        </button>
      </div>

      {/* Indicador de capacidad vs pasajeros */}
      {isMultiMode && (
        <div
          className={`capacity-indicator ${totalCapacity >= totalPassengers ? "complete" : "incomplete"}`}
        >
          <FaUsers />
          <div className="capacity-info">
            <span className="capacity-text">
              Capacidad: <strong>{totalCapacity}</strong> / {totalPassengers}{" "}
              pasajeros
            </span>
            <div className="capacity-bar">
              <div
                className="capacity-fill"
                style={{
                  width: `${Math.min((totalCapacity / totalPassengers) * 100, 100)}%`,
                }}
              />
            </div>
          </div>
          {totalCapacity >= totalPassengers ? (
            <span className="status complete">
              <FaCheck /> Completo
            </span>
          ) : (
            <span className="status incomplete">
              <FaExclamationTriangle /> Faltan {totalPassengers - totalCapacity}
            </span>
          )}
        </div>
      )}

      <div className="review-grid multi">
        {/* Modo multiselección: mostrar cada habitación */}
        {isMultiMode ? (
          <>
            {selectedRooms.map((item, index) => {
              const hotel = item.hotel;
              const room = item.room;
              const tariff = item.tariff;
              const selectionId =
                item.id ||
                `${hotel?.id_hotel || hotel?.id || "hotel"}-${room?.id_habitacion || room?.id || index}`;
              const qty = item.quantity || 1;
              const roomCapacity = getRoomCapacity(room);
              const roomName =
                room.tipo_habitacion ||
                room.habitacion?.tipo_habitacion ||
                "Habitación";
              const currentPrice = getRoomPrice(item);
              const isEditingThis = editingRoomId === selectionId;
              const moneda = tariff?.moneda || "soles";

              return (
                <div key={selectionId} className="room-review-card">
                  <div className="card-header">
                    <div className="header-left">
                      <span className="room-number">#{index + 1}</span>
                      <FaHotel />
                      <span className="hotel-name">{hotel.nombre}</span>
                      <span className="stars">
                        {getCategoryDisplay(hotel.categoria)}
                      </span>
                    </div>
                    <button
                      className="remove-btn"
                      onClick={() => onRemoveRoom && onRemoveRoom(selectionId)}
                      title="Quitar habitación"
                    >
                      <FaTrash />
                    </button>
                  </div>

                  <div className="card-body">
                    <div className="room-info">
                      <div className="info-row">
                        <FaBed />
                        <span>{roomName}</span>
                        {qty > 1 && (
                          <span className="quantity-badge">×{qty}</span>
                        )}
                      </div>
                      <div className="info-row">
                        <FaUsers />
                        <span className="capacity-badge">
                          {roomCapacity * qty} pax{" "}
                          {qty > 1 && (
                            <small>
                              ({roomCapacity}×{qty})
                            </small>
                          )}
                        </span>
                      </div>
                      <div className="info-row">
                        <FaStar />
                        <span className="tariff-badge">
                          {tariff?.tipo_tarifa || "Externa"}
                        </span>
                      </div>
                    </div>

                    <div className="price-section">
                      <span className="price-label">
                        Precio/noche{qty > 1 ? " (c/u)" : ""}:
                      </span>
                      {isEditingThis ? (
                        <div className="price-input-wrapper">
                          <span className="currency">
                            {getCurrencySymbol(moneda)}
                          </span>
                          <input
                            type="number"
                            value={currentPrice}
                            onChange={(e) =>
                              handlePriceChange(selectionId, e.target.value)
                            }
                            onBlur={() => setEditingRoomId(null)}
                            onWheel={(e) => e.currentTarget.blur()}
                            onKeyDown={(e) => {
                              if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                                e.preventDefault();
                              }
                            }}
                            autoFocus
                            step="0.01"
                          />
                        </div>
                      ) : (
                        <span
                          className="price-display"
                          onClick={() => setEditingRoomId(selectionId)}
                        >
                          {formatPrice(currentPrice, moneda)}
                          <FaEdit className="edit-icon" />
                        </span>
                      )}
                    </div>

                    <div className="subtotal">
                      Subtotal:{" "}
                      <strong>
                        {formatPrice(
                          currentPrice * qty * selectedDays.length,
                          moneda,
                        )}
                      </strong>
                      {qty > 1 && (
                        <small>
                          ({formatPrice(currentPrice, moneda)} × {qty} hab ×{" "}
                          {selectedDays.length} noches)
                        </small>
                      )}
                      <small>({selectedDays.length} noches)</small>
                    </div>
                  </div>
                </div>
              );
            })}
          </>
        ) : (
          /* Modo legacy: una sola habitación */
          <>
            <div className="service-card compact">
              <div className="card-header">
                <FaHotel />
                <span className="hotel-name">{selectedHotel?.nombre}</span>
                <span className="stars">
                  {getCategoryDisplay(selectedHotel?.categoria)}
                </span>
              </div>

              <ServiceDetailedInfo
                service={{
                  parentService: selectedHotel,
                  childService: selectedRoom,
                  tariff: selectedTariff,
                }}
                categoryId="hoteles"
                className="detailed-info compact"
              />
            </div>

            <div className="pricing-card">
              <div className="card-header">
                <FaMoneyBillWave />
                <span>Resumen de Precios</span>
              </div>

              <div className="pricing-body">
                <div className="pricing-row compact">
                  <span className="label">
                    <FaBed /> Habitación:
                  </span>
                  <span className="value">{roomType}</span>
                </div>

                <div className="pricing-row compact">
                  <span className="label">
                    <FaUsers /> Capacidad:
                  </span>
                  <span className="value capacity-badge">{capacity} pax</span>
                </div>

                <div className="pricing-row compact">
                  <span className="label">
                    <FaStar /> Tarifa:
                  </span>
                  <span className="value tariff-badge">
                    {selectedTariff?.tipo_tarifa || "Externa"}
                  </span>
                </div>

                <div className="pricing-row highlight editable">
                  <span className="label">Precio/noche:</span>
                  <div className="editable-price">
                    {editingRoomId === "single" ? (
                      <div className="price-input-wrapper">
                        <span className="currency">
                          {getCurrencySymbol(selectedTariff?.moneda)}
                        </span>
                        <input
                          type="number"
                          value={customPriceLegacy || 0}
                          onChange={(e) =>
                            setCustomPriceLegacy(
                              parseFloat(e.target.value) || 0,
                            )
                          }
                          onBlur={() => setEditingRoomId(null)}
                          onWheel={(e) => e.currentTarget.blur()}
                          onKeyDown={(e) => {
                            if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                              e.preventDefault();
                            }
                          }}
                          autoFocus
                          step="0.01"
                        />
                      </div>
                    ) : (
                      <span
                        className="price-display"
                        onClick={() => setEditingRoomId("single")}
                      >
                        {formatPrice(
                          customPriceLegacy || 0,
                          selectedTariff?.moneda,
                        )}
                        <FaEdit className="edit-icon" />
                      </span>
                    )}
                    <small className="price-type">
                      ({packageType === "privado" ? "Priv." : "Comp."})
                    </small>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Días seleccionados */}
      <div className="days-summary">
        <div className="days-header">
          <MdNightsStay />
          <span>
            {selectedDays.length}{" "}
            {selectedDays.length === 1 ? "noche" : "noches"}
          </span>
        </div>
        <div className="days-chips">
          {selectedDays.map((dayIndex) => (
            <span key={dayIndex} className="day-chip">
              D{dayIndex + 1}
            </span>
          ))}
        </div>
      </div>

      {/* Total general */}
      <div className="total-section">
        <div className="total-row">
          <span className="total-label">
            <FaMoneyBillWave /> Total General:
          </span>
          <span className="total-value">
            {formatPrice(
              totalPrice,
              isMultiMode && selectedRooms[0]?.tariff?.moneda
                ? selectedRooms[0].tariff.moneda
                : selectedTariff?.moneda || "soles",
            )}
          </span>
        </div>
        {isMultiMode && (
          <div className="total-breakdown">
            {selectedRooms.length} habitación(es) × {selectedDays.length} noches
          </div>
        )}
        {selectedDays.length === 0 && (
          <div className="warning">
            <FaInfoCircle /> Selecciona al menos un día
          </div>
        )}
      </div>
    </div>
  );
};

export default ReviewSelection;
