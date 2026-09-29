import {
  FaBed,
  FaUsers,
  FaInfoCircle,
  FaTimes,
  FaCheck,
  FaPlus,
  FaTrash,
  FaMinus,
} from "react-icons/fa";
import {
  getRoomCapacity,
  formatPrice,
  labelFromRoom,
  isExtraBedRoom,
} from "./utils";
import "./RoomSelection.scss";

const RoomSelection = ({
  rooms,
  selectedRoom,
  selectedTariff,
  selectedHotel,
  packageType,
  autoOptions,
  selectedAutoIndex,
  autoEnabled,
  showAutoSuggest,
  onSelectRoom,
  onSelectTariff,
  onSetStep,
  onBack,
  onToggleAutoEnabled,
  onSetSelectedAutoIndex,
  onCloseAutoSuggest,
  onAcceptAutoDistribution,
  loading,
  // Nuevas props para multiselección con cantidad
  selectedRooms = [],
  totalPassengers = 0,
  onToggleRoom,
  onRemoveFromSelection,
  onClearSelection,
  onUpdateQuantity, // Nueva prop para actualizar cantidad
}) => {
  // Calcular capacidad total seleccionada (considerando cantidad)
  const totalSelectedCapacity = selectedRooms.reduce((sum, item) => {
    const qty = item.quantity || 1;
    return sum + getRoomCapacity(item.room) * qty;
  }, 0);
  // Physical rooms and additional beds are different concepts. An extra bed
  // adds +1 pax but never increases the room count.
  const totalRoomsCount = selectedRooms.reduce(
    (sum, item) =>
      isExtraBedRoom(item.room) ? sum : sum + (item.quantity || 1),
    0,
  );
  const totalExtraBedsCount = selectedRooms.reduce(
    (sum, item) =>
      isExtraBedRoom(item.room) ? sum + (item.quantity || 1) : sum,
    0,
  );
  const isCapacityMet = totalSelectedCapacity >= totalPassengers;

  // Obtener cantidad de una habitación específica
  const getRoomQuantity = (room, tariff, priceType = "unico") => {
    const item = selectedRooms.find((item) => {
      const roomMatch =
        (item.room.id_habitacion || item.room.id) ===
          (room.id_habitacion || room.id) &&
        (item.hotel.id_hotel || item.hotel.id) ===
          (selectedHotel?.id_hotel || selectedHotel?.id);
      const tariffMatch =
        (item.tariff?.id_tarifa || item.tariff?.id) ===
        (tariff?.id_tarifa || tariff?.id);
      const itemType = item.tariff?.selectedType || "unico";
      return roomMatch && tariffMatch && itemType === priceType;
    });
    return item?.quantity || 0;
  };

  // Verificar si una habitación está seleccionada (para highlight de card)
  const isRoomInSelection = (room) => {
    return selectedRooms.some(
      (item) =>
        (item.room.id_habitacion || item.room.id) ===
          (room.id_habitacion || room.id) &&
        (item.hotel.id_hotel || item.hotel.id) ===
          (selectedHotel?.id_hotel || selectedHotel?.id),
    );
  };

  // Verificar si una tarifa específica de una habitación está seleccionada
  const isTariffSelected = (room, tariff, priceType = null) => {
    return getRoomQuantity(room, tariff, priceType || "unico") > 0;
  };

  return (
    <div className="room-selection-component">
      <div className="section-header">
        <h3>
          <FaBed /> Habitaciones - {selectedHotel?.nombre}
        </h3>
        <button className="back-btn" onClick={onBack}>
          Volver a hoteles
        </button>
      </div>

      {/* Barra de estado de multiselección */}
      {totalPassengers > 0 && (
        <div
          className={`multiselect-status ${isCapacityMet ? "complete" : "incomplete"}`}
        >
          <div className="status-info">
            <FaUsers />
            <span className="capacity-text">
              Capacidad: <strong>{totalSelectedCapacity}</strong> /{" "}
              {totalPassengers} pax
            </span>
            {selectedRooms.length > 0 && (
              <span className="rooms-count">
                ({totalRoomsCount} hab.
                {totalExtraBedsCount > 0 ? ` + ${totalExtraBedsCount} cama${totalExtraBedsCount === 1 ? "" : "s"} adicional${totalExtraBedsCount === 1 ? "" : "es"}` : ""})
              </span>
            )}
          </div>
          {selectedRooms.length > 0 && (
            <div className="status-actions">
              <button
                className="clear-btn"
                onClick={onClearSelection}
                title="Limpiar selección"
              >
                <FaTrash /> Limpiar
              </button>
              <button
                className={`confirm-btn ${isCapacityMet ? "ready" : ""}`}
                onClick={() => onSetStep("review")}
              >
                <FaCheck /> Continuar
              </button>
            </div>
          )}
        </div>
      )}

      {/* Lista de habitaciones seleccionadas */}
      {selectedRooms.length > 0 && (
        <div className="selected-rooms-panel">
          <h4>Seleccionadas:</h4>
          <div className="selected-rooms-list">
            {selectedRooms.map((item, index) => {
              const qty = item.quantity || 1;
              const capacity = getRoomCapacity(item.room);
              const extraBed = isExtraBedRoom(item.room);
              const unitPrice =
                item.tariff.precio ||
                item.tariff.precio_compartido ||
                item.tariff.precio_privado;
              return (
                <div key={`selected-${index}`} className="selected-room-chip">
                  <span className="hotel-name">{item.hotel.nombre}</span>
                  <span className="room-type">
                    {item.room.tipo_habitacion || "Hab."}
                  </span>
                  <div className="quantity-control">
                    <button
                      className="qty-btn minus"
                      onClick={() =>
                        onUpdateQuantity && onUpdateQuantity(index, qty - 1)
                      }
                      disabled={qty <= 0}
                    >
                      <FaMinus />
                    </button>
                    <span className="qty-value">{qty}</span>
                    <button
                      className="qty-btn plus"
                      onClick={() =>
                        onUpdateQuantity && onUpdateQuantity(index, qty + 1)
                      }
                    >
                      <FaPlus />
                    </button>
                  </div>
                  <span className="capacity">
                    <FaUsers /> {extraBed ? `+${capacity * qty} pax` : capacity * qty}
                  </span>
                  <span className="price">
                    {formatPrice(unitPrice * qty, item.tariff.moneda)}
                  </span>
                  <button
                    className="remove-btn"
                    onClick={() => onRemoveFromSelection(index)}
                    title="Quitar"
                  >
                    <FaTimes />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Modal de sugerencias automáticas */}
      {showAutoSuggest && autoOptions.length > 0 && (
        <div className="auto-suggest-overlay" onClick={onCloseAutoSuggest}>
          <div
            className="auto-suggest-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h4>Te sugerimos una distribución de habitaciones</h4>
              <button className="close-btn" onClick={onCloseAutoSuggest}>
                <FaTimes />
              </button>
            </div>

            <div className="auto-toggle">
              <label>
                <input
                  type="checkbox"
                  checked={autoEnabled}
                  onChange={(e) => onToggleAutoEnabled(e.target.checked)}
                />
                <span>Usar sugerencias automáticas</span>
              </label>
            </div>

            <div className="options-list">
              {autoOptions.map((opt, idx) => (
                <div
                  key={idx}
                  className={`option-card ${selectedAutoIndex === idx ? "selected" : ""}`}
                  onClick={() => onSetSelectedAutoIndex(idx)}
                >
                  <div className="option-title">
                    <strong>{opt.label}</strong>
                  </div>
                  <div className="option-rooms">
                    {opt.rooms.map((r, i) => (
                      <div key={i} className="room-chip">
                        <span>{labelFromRoom(r.room)}</span>
                        <small>cap: {r.capacity}</small>
                      </div>
                    ))}
                  </div>
                  <div className="option-footer">
                    <span>Camas: {opt.beds}</span>
                    {opt.sharingChildrenUsed > 0 && (
                      <span>
                        • Niños compartiendo: {opt.sharingChildrenUsed}
                      </span>
                    )}
                    {opt.policy?.surchargeUSDPerSharingChild > 0 && (
                      <span>
                        • +{opt.policy.surchargeUSDPerSharingChild}/niño
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="modal-actions">
              <button className="secondary-btn" onClick={onCloseAutoSuggest}>
                Elegir manualmente
              </button>
              <button
                className="primary-btn"
                onClick={onAcceptAutoDistribution}
              >
                <FaCheck /> Usar esta distribución
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lista de habitaciones */}
      <div className="rooms-container">
        {loading ? (
          <div className="loading-state">
            <div className="spinner"></div>
            <p>Cargando habitaciones...</p>
          </div>
        ) : rooms.length === 0 ? (
          <div className="empty-state">
            <FaBed />
            <p>No hay habitaciones disponibles</p>
          </div>
        ) : (
          <div className="rooms-grid">
            {rooms.map((room) => {
              const roomTariffs = room.tarifas || [];
              const hasTariffs = roomTariffs.length > 0;
              const isSelected = isRoomInSelection(room);
              const extraBed = isExtraBedRoom(room);

              return (
                <div
                  key={room.id_habitacion || room.id}
                  className={`room-card ${isSelected ? "selected" : ""}`}
                >
                  <div className="room-header">
                    <div className="room-title">
                      <FaBed />
                      <span>
                        {room.tipo_habitacion ||
                          room.habitacion?.tipo_habitacion ||
                          "Habitación"}
                      </span>
                    </div>
                    <div className="room-meta">
                      <span className="capacity">
                        <FaUsers /> {extraBed ? "+1 pax · suplemento" : getRoomCapacity(room)}
                      </span>
                      <span
                        className={`status ${room.estado === "disponible" ? "available" : ""}`}
                      >
                        {room.estado || "N/A"}
                      </span>
                    </div>
                  </div>

                  {room.descripcion && (
                    <p className="room-description">{room.descripcion}</p>
                  )}

                  {hasTariffs ? (
                    <div className="tariffs-list">
                      {roomTariffs.map((tariff, index) => {
                        const isPrecioUnico = tariff.precio_unico === true;
                        const tieneTemporada = tariff.tiene_temporada === true;
                        const precio =
                          tariff.precio ||
                          tariff.precio_compartido ||
                          tariff.precio_privado;
                        const isThisTariffSelected = isTariffSelected(
                          room,
                          tariff,
                        );
                        const isCompSelected = isTariffSelected(
                          room,
                          tariff,
                          "compartido",
                        );
                        const isPrivSelected = isTariffSelected(
                          room,
                          tariff,
                          "privado",
                        );

                        return (
                          <div
                            key={`tariff-${tariff.id_tarifa || index}`}
                            className={`tariff-row ${isThisTariffSelected ? "selected" : ""}`}
                          >
                            <span className="tariff-info">
                              {tariff.tipo_tarifa || "Externa"}
                              {tieneTemporada && tariff.temporada && (
                                <small className="season">
                                  {tariff.temporada}
                                </small>
                              )}
                            </span>
                            <div className="price-buttons">
                              {isPrecioUnico ? (
                                // Precio único: selector de cantidad
                                (() => {
                                  const qty = getRoomQuantity(
                                    room,
                                    tariff,
                                    "unico",
                                  );
                                  return (
                                    <div className="quantity-selector">
                                      <span className="price-value">
                                        {formatPrice(precio, tariff.moneda)}
                                      </span>
                                      <div className="qty-controls">
                                        <button
                                          className="qty-btn minus"
                                          onClick={() =>
                                            onToggleRoom &&
                                            onToggleRoom(
                                              room,
                                              selectedHotel,
                                              tariff,
                                              -1,
                                            )
                                          }
                                          disabled={qty <= 0}
                                        >
                                          <FaMinus />
                                        </button>
                                        <span
                                          className={`qty-value ${qty > 0 ? "active" : ""}`}
                                        >
                                          {qty}
                                        </span>
                                        <button
                                          className="qty-btn plus"
                                          onClick={() =>
                                            onToggleRoom &&
                                            onToggleRoom(
                                              room,
                                              selectedHotel,
                                              tariff,
                                              1,
                                            )
                                          }
                                        >
                                          <FaPlus />
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })()
                              ) : (
                                // Precio compartido y privado separados con selector de cantidad
                                <>
                                  {tariff.precio_compartido &&
                                    (() => {
                                      const qty = getRoomQuantity(
                                        room,
                                        tariff,
                                        "compartido",
                                      );
                                      return (
                                        <div className="quantity-selector compartido">
                                          <span className="price-label">
                                            Comp.
                                          </span>
                                          <span className="price-value">
                                            {formatPrice(
                                              tariff.precio_compartido,
                                              tariff.moneda,
                                            )}
                                          </span>
                                          <div className="qty-controls">
                                            <button
                                              className="qty-btn minus"
                                              onClick={() =>
                                                onToggleRoom &&
                                                onToggleRoom(
                                                  room,
                                                  selectedHotel,
                                                  {
                                                    ...tariff,
                                                    selectedType: "compartido",
                                                  },
                                                  -1,
                                                )
                                              }
                                              disabled={qty <= 0}
                                            >
                                              <FaMinus />
                                            </button>
                                            <span
                                              className={`qty-value ${qty > 0 ? "active" : ""}`}
                                            >
                                              {qty}
                                            </span>
                                            <button
                                              className="qty-btn plus"
                                              onClick={() =>
                                                onToggleRoom &&
                                                onToggleRoom(
                                                  room,
                                                  selectedHotel,
                                                  {
                                                    ...tariff,
                                                    selectedType: "compartido",
                                                  },
                                                  1,
                                                )
                                              }
                                            >
                                              <FaPlus />
                                            </button>
                                          </div>
                                        </div>
                                      );
                                    })()}
                                  {tariff.precio_privado &&
                                    (() => {
                                      const qty = getRoomQuantity(
                                        room,
                                        tariff,
                                        "privado",
                                      );
                                      return (
                                        <div className="quantity-selector privado">
                                          <span className="price-label">
                                            Priv.
                                          </span>
                                          <span className="price-value">
                                            {formatPrice(
                                              tariff.precio_privado,
                                              tariff.moneda,
                                            )}
                                          </span>
                                          <div className="qty-controls">
                                            <button
                                              className="qty-btn minus"
                                              onClick={() =>
                                                onToggleRoom &&
                                                onToggleRoom(
                                                  room,
                                                  selectedHotel,
                                                  {
                                                    ...tariff,
                                                    selectedType: "privado",
                                                  },
                                                  -1,
                                                )
                                              }
                                              disabled={qty <= 0}
                                            >
                                              <FaMinus />
                                            </button>
                                            <span
                                              className={`qty-value ${qty > 0 ? "active" : ""}`}
                                            >
                                              {qty}
                                            </span>
                                            <button
                                              className="qty-btn plus"
                                              onClick={() =>
                                                onToggleRoom &&
                                                onToggleRoom(
                                                  room,
                                                  selectedHotel,
                                                  {
                                                    ...tariff,
                                                    selectedType: "privado",
                                                  },
                                                  1,
                                                )
                                              }
                                            >
                                              <FaPlus />
                                            </button>
                                          </div>
                                        </div>
                                      );
                                    })()}
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="no-tariffs">
                      <FaInfoCircle /> Sin tarifas disponibles
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Panel de distribución automática inline */}
        {autoOptions.length > 0 && !showAutoSuggest && (
          <div className="auto-distribution-inline">
            <div className="inline-header">
              <h4>Distribución automática</h4>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={autoEnabled}
                  onChange={(e) => onToggleAutoEnabled(e.target.checked)}
                />
                <span>Usar automático</span>
              </label>
            </div>
            <div className="inline-options">
              {autoOptions.map((opt, idx) => (
                <div
                  key={idx}
                  className={`option-chip ${selectedAutoIndex === idx ? "selected" : ""}`}
                  onClick={() => onSetSelectedAutoIndex(idx)}
                >
                  <strong>{opt.label}</strong>
                  <span>{opt.rooms.length} hab.</span>
                </div>
              ))}
            </div>
            <button className="apply-btn" onClick={onAcceptAutoDistribution}>
              <FaCheck /> Aplicar distribución
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default RoomSelection;
