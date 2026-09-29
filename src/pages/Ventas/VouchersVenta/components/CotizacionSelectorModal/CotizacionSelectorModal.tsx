import React, { useState, useEffect } from "react";
import {
  MdClose,
  MdSearch,
  MdCheckCircle,
  MdError,
  MdPerson,
  MdDateRange,
  MdContentPaste,
  MdAttachMoney,
} from "react-icons/md";
import axiosInstance from "../../../../../utils/axiosInstance";
import "./CotizacionSelectorModal.scss";

const CotizacionSelectorModal = ({ isOpen, onClose, onSelect }) => {
  const [cotizaciones, setCotizaciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCotizacion, setSelectedCotizacion] = useState(null);

  // Cargar cotizaciones disponibles (sin voucher)
  useEffect(() => {
    if (isOpen) {
      const fetchCotizaciones = async () => {
        try {
          setLoading(true);
          setError(null);

          // Usar el endpoint correcto y asegurar parámetro tiene_voucher=false
          const response = await axiosInstance.get("/turismo/cotizaciones", {
            params: { tiene_voucher: false },
          });

          if (response.data) {
            // Manejar diferentes estructuras de datos posibles
            let cotizacionesData = [];

            if (Array.isArray(response.data)) {
              cotizacionesData = response.data;
            } else if (
              response.data.data &&
              Array.isArray(response.data.data)
            ) {
              cotizacionesData = response.data.data;
            } else if (
              response.data.cotizaciones &&
              Array.isArray(response.data.cotizaciones)
            ) {
              cotizacionesData = response.data.cotizaciones;
            } else {
              console.warn(
                "Formato de respuesta no reconocido:",
                response.data,
              );
            }

            // Filtrar explícitamente para asegurar que solo se muestran cotizaciones sin voucher
            const filteredCotizacionesSinVoucher = cotizacionesData.filter(
              (cot) => !cot.tiene_voucher,
            );
            // Filtrar explícitamente para asegurar que solo se muestran cotizaciones activos
            const filteredCotizaciones = filteredCotizacionesSinVoucher.filter(
              (cot) => cot.is_active,
            );

            setCotizaciones(filteredCotizaciones);
          } else {
            console.error("Formato inesperado en respuesta:", response);
            setCotizaciones([]);
          }
        } catch (err) {
          console.error("Error al cargar cotizaciones:", err);
          setError(
            "Error al cargar las cotizaciones. Por favor intente nuevamente.",
          );
        } finally {
          setLoading(false);
        }
      };

      fetchCotizaciones();
    }
  }, [isOpen]);

  // Filtrar cotizaciones según término de búsqueda
  const filteredCotizaciones = searchTerm
    ? cotizaciones.filter(
        (cot) =>
          cot.id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          cot.id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          cot.titulo?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (cot.client?.nombres &&
            cot.client?.apellidos &&
            `${cot.client.nombres} ${cot.client.apellidos}`
              .toLowerCase()
              .includes(searchTerm.toLowerCase())),
      )
    : cotizaciones;

  // Formatear fecha para mostrar
  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    const date = new Date(dateString);
    return date.toLocaleDateString();
  };

  // Manejar la selección de una cotización
  const handleSelectCotizacion = (cot) => {
    setSelectedCotizacion(cot);
  };

  // Confirmar selección y cerrar modal
  const handleConfirm = () => {
    if (selectedCotizacion) {
      onSelect(selectedCotizacion);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="cotizacion-selector-overlay">
      <div className="cotizacion-selector-modal">
        <div className="modal-header">
          <h2>Seleccionar Cotización</h2>
          <button className="close-button" onClick={onClose}>
            <MdClose />
          </button>
        </div>

        <div className="modal-content">
          <div className="search-bar">
            <MdSearch className="search-icon" />
            <input
              type="text"
              placeholder="Buscar por código, título o cliente..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
          </div>

          {loading ? (
            <div className="loading-state">
              <div className="spinner"></div>
              <p>Cargando cotizaciones disponibles...</p>
            </div>
          ) : error ? (
            <div className="error-state">
              <MdError className="error-icon" />
              <p>{error}</p>
              <button
                onClick={() => window.location.reload()}
                className="retry-button"
              >
                Reintentar
              </button>
            </div>
          ) : filteredCotizaciones.length === 0 ? (
            <div className="empty-state">
              {searchTerm ? (
                <>
                  <p>
                    No se encontraron cotizaciones que coincidan con "
                    {searchTerm}"
                  </p>
                  <button
                    onClick={() => setSearchTerm("")}
                    className="clear-search"
                  >
                    Limpiar búsqueda
                  </button>
                </>
              ) : (
                <p>No hay cotizaciones disponibles sin voucher</p>
              )}
            </div>
          ) : (
            <div className="cotizaciones-list">
              {filteredCotizaciones.map((cot) => (
                <div
                  key={cot.id}
                  className={`cotizacion-item ${selectedCotizacion?.id === cot.id ? "selected" : ""}`}
                  onClick={() => handleSelectCotizacion(cot)}
                >
                  <div className="cotizacion-details">
                    <h3 className="cotizacion-title">
                      {cot.titulo || "Sin título"}
                    </h3>
                    <div className="cotizacion-info">
                      <span className="cotizacion-id">
                        <MdContentPaste /> {cot.id}
                      </span>
                      <span className="cotizacion-date">
                        <MdDateRange /> {formatDate(cot.fecha || cot.createdat)}
                      </span>
                      {cot.client && (
                        <span className="cotizacion-client">
                          <MdPerson /> {cot.client.nombres}{" "}
                          {cot.client.apellidos}
                        </span>
                      )}
                    </div>
                    <div className="cotizacion-people">
                      <span className="people-count">
                        {getPeopleCount(cot)}
                      </span>
                      <span className="cotizacion-total">
                        <MdAttachMoney />{" "}
                        {parseFloat(cot.total_final || 0).toFixed(2)}
                      </span>
                    </div>
                  </div>
                  {selectedCotizacion?.id === cot.id && (
                    <div className="selected-indicator">
                      <MdCheckCircle />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="cancel-button" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="confirm-button"
            onClick={handleConfirm}
            disabled={!selectedCotizacion}
          >
            Continuar
          </button>
        </div>
      </div>
    </div>
  );
};

// Función auxiliar para obtener el conteo de personas
function getPeopleCount(cotizacion) {
  // Intentar diferentes estructuras de datos
  if (cotizacion.peoplecount) {
    return `${cotizacion.peoplecount.adults || 0} adultos, ${cotizacion.peoplecount.children || 0} niños`;
  } else if (cotizacion.peopleDetails || cotizacion.peopledetails) {
    const pd = cotizacion.peopleDetails || cotizacion.peopledetails;
    const adults = Array.isArray(pd.adults) ? pd.adults.length : 0;
    const children = Array.isArray(pd.children) ? pd.children.length : 0;
    return `${adults} adultos, ${children} niños`;
  } else if (cotizacion.cantidadpersonas) {
    return `${cotizacion.cantidadpersonas} persona(s)`;
  } else if (
    cotizacion.adultos !== undefined ||
    cotizacion.ninos !== undefined
  ) {
    return `${cotizacion.adultos || 0} adultos, ${cotizacion.ninos || 0} niños`;
  }
  return "No especificado";
}

export default CotizacionSelectorModal;
