import React, { useState, useMemo } from "react";
import { MdClose } from "react-icons/md";
import { FaStar, FaHotel } from "react-icons/fa";
import "./HotelCategorySelectorModal.scss";

// Helper: obtener ID de hotel de forma robusta
const getHotelId = (h) =>
  h.id_hotel ||
  h.hotel_id ||
  h.parentService?.id_hotel ||
  h.parentService?.id ||
  h.id;

// Helper: obtener nombre visible
const getHotelName = (h) =>
  h.parentService?.nombre ||
  h.nombre ||
  h.serviceDetails?.nombre ||
  "Hotel sin nombre";

// Helper: obtener ciudad visible
const getHotelCity = (h) =>
  h.parentService?.ciudad || h.ciudad || h.parentService?.zona || "Sin ciudad";

const HotelCategorySelectorModal = ({
  isOpen,
  onClose,
  hotels = [],
  onSelectHotel,
}) => {
  const [selectedHotelId, setSelectedHotelId] = useState(null);

  // SIEMPRE llamar useMemo, aunque el modal esté cerrado
  const hotelsByCategory = useMemo(() => {
    const result = {};

    (hotels || []).forEach((rawHotel) => {
      const category =
        rawHotel.categoria ||
        rawHotel.parentService?.categoria ||
        "Sin categoría";

      const hotelId = getHotelId(rawHotel);
      if (!hotelId) return;

      if (!result[category]) {
        result[category] = new Map();
      }

      if (!result[category].has(hotelId)) {
        result[category].set(hotelId, rawHotel);
      }
    });

    const normalized = {};
    Object.entries(result).forEach(([category, map]) => {
      normalized[category] = Array.from(map.values());
    });

    return normalized;
  }, [hotels]);

  const handleClickHotel = (hotel) => {
    const id = getHotelId(hotel);
    setSelectedHotelId(id);
  };

  const handleConfirm = () => {
    if (!selectedHotelId) return;
    const selected = (hotels || []).find(
      (h) => getHotelId(h) === selectedHotelId,
    );
    if (selected) onSelectHotel(selected);
  };

  // El return condicional va DESPUÉS de los hooks
  if (!isOpen) return null;

  return (
    <div className="hotel-category-modal-overlay">
      <div className="hotel-category-modal">
        <div className="modal-header">
          <h3>Selecciona un hotel por categoría</h3>
          <button className="close-btn" onClick={onClose}>
            <MdClose />
          </button>
        </div>

        <div className="hotel-category-list">
          {Object.entries(hotelsByCategory).map(([category, hotelsInCat]) => (
            <div key={category} className="hotel-category-group">
              <h4>
                {category} <FaStar className="star-icon" />
              </h4>

              <div className="hotel-options">
                {hotelsInCat.map((hotel) => {
                  const hotelId = getHotelId(hotel);
                  const isSelected = selectedHotelId === hotelId;

                  return (
                    <div
                      key={hotelId}
                      className={`hotel-card ${isSelected ? "selected" : ""}`}
                      onClick={() => handleClickHotel(hotel)}
                    >
                      <FaHotel className="hotel-icon" />
                      <div className="hotel-info">
                        <h5>{getHotelName(hotel)}</h5>
                        <p>{getHotelCity(hotel)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {Object.keys(hotelsByCategory).length === 0 && (
            <div className="empty-state">
              <p>No hay hoteles disponibles para seleccionar.</p>
            </div>
          )}
        </div>

        <div className="modal-actions">
          <button className="cancel-btn" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="confirm-btn"
            disabled={!selectedHotelId}
            onClick={handleConfirm}
          >
            Seleccionar Hotel
          </button>
        </div>
      </div>
    </div>
  );
};

export default HotelCategorySelectorModal;
