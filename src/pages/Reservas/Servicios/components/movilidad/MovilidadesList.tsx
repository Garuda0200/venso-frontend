import React, { useState, useEffect } from "react";
import {
  FaSearch,
  FaPlus,
  FaCar,
  FaBus,
  FaTaxi,
  FaMapMarkerAlt,
} from "react-icons/fa";
import { fetchTransportes } from "../../services/api";
import MovilidadesTransporteList from "../movilidad/MovilidadesTransporteList";
import useAuditInfo from "../../hooks/useAuditInfo";

const MovilidadesList = () => {
  const [transportes, setTransportes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");

  // Estado para controlar la vista detallada
  const [selectedTransporte, setSelectedTransporte] = useState(null);
  const [showMovilidadesTransporte, setShowMovilidadesTransporte] =
    useState(false);

  // Obtener información de auditoría
  const { userId } = useAuditInfo();

  useEffect(() => {
    const loadTransportes = async () => {
      try {
        setLoading(true);
        const data = await fetchTransportes();
        setTransportes(data);
        setLoading(false);
      } catch (err) {
        setError(`Error al cargar transportes: ${err.message}`);
        setLoading(false);
      }
    };

    loadTransportes();
  }, []);

  // Filtrar los transportes según el término de búsqueda
  const filteredTransportes = transportes.filter(
    (transporte) =>
      transporte.nombre_transporte
        .toLowerCase()
        .includes(searchTerm.toLowerCase()) ||
      transporte.zona.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  // Función para obtener un ícono según el nombre del transporte
  const getTransporteIcon = (nombre) => {
    const nombreLower = nombre.toLowerCase();
    if (nombreLower.includes("bus") || nombreLower.includes("minivan")) {
      return <FaBus className="card-icon" />;
    } else if (nombreLower.includes("taxi")) {
      return <FaTaxi className="card-icon" />;
    } else {
      return <FaCar className="card-icon" />;
    }
  };

  // Manejar clic en una tarjeta de transporte
  const handleTransporteClick = (transporte) => {
    setSelectedTransporte(transporte);
    setShowMovilidadesTransporte(true);
  };

  // Si estamos viendo las movilidades de un transporte
  if (showMovilidadesTransporte && selectedTransporte) {
    return (
      <MovilidadesTransporteList
        transporte={selectedTransporte}
        onBack={() => setShowMovilidadesTransporte(false)}
      />
    );
  }

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>Cargando transportes...</p>
      </div>
    );
  }

  return (
    <div className="entity-view-container">
      <div className="header-with-actions">
        <div className="header-title">
          <FaCar className="title-icon" />
          <h2>Gestión de Movilidades</h2>
        </div>
      </div>

      {error && <div className="alert danger">{error}</div>}

      {/* Barra de búsqueda */}
      <div className="filters-container">
        <div className="search-container">
          <div className="search-icon-container">
            <FaSearch />
          </div>
          <input
            className="search-input"
            placeholder="Buscar transporte por nombre o zona..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <button className="clear-button" onClick={() => setSearchTerm("")}>
              Limpiar
            </button>
          )}
        </div>
      </div>

      {/* Tarjetas de transportes */}
      {filteredTransportes.length === 0 ? (
        <div className="alert info">
          No se encontraron transportes con el criterio de búsqueda.
        </div>
      ) : (
        <div className="transportes-cards-container">
          {filteredTransportes.map((transporte) => (
            <div
              key={transporte.id_transporte}
              className="transporte-card"
              onClick={() => handleTransporteClick(transporte)}
            >
              <div className="transporte-card-header">
                <div className="transporte-icon-container">
                  {getTransporteIcon(transporte.nombre_transporte)}
                </div>
                <h3 className="transporte-name">
                  {transporte.nombre_transporte}
                </h3>
              </div>
              <div className="transporte-card-body">
                <div className="transporte-info">
                  <FaMapMarkerAlt className="location-icon" />
                  <span className="transporte-zone">{transporte.zona}</span>
                </div>
              </div>
              <div className="transporte-card-footer">
                <button className="view-movilidades-btn">
                  Ver movilidades
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default MovilidadesList;
