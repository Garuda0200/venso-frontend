import React, { useState, useEffect } from "react";
import { FaSearch } from "react-icons/fa";
import { fetchEndoses } from "../../services/api";
import ToursEndoseList from "./ToursEndoseList";

const ToursList = () => {
  const [endoses, setEndoses] = useState([]);
  const [selectedEndose, setSelectedEndose] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");

  // Cargar endoses inicialmente
  useEffect(() => {
    const loadEndoses = async () => {
      try {
        const data = await fetchEndoses();
        setEndoses(data);
        setLoading(false);
      } catch (err) {
        setError("Error al cargar los endoses: " + err.message);
        setLoading(false);
      }
    };

    loadEndoses();
  }, []);

  // Cuando se selecciona un endose
  const handleSelectEndose = (endose) => {
    setSelectedEndose(endose);
  };

  // Volver a la lista de endoses
  const handleBackToEndoses = () => {
    setSelectedEndose(null);
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>Cargando información...</p>
      </div>
    );
  }

  if (error) {
    return <div className="alert danger">{error}</div>;
  }

  // Si hay un endose seleccionado, mostrar sus tours
  if (selectedEndose) {
    return (
      <ToursEndoseList endose={selectedEndose} onBack={handleBackToEndoses} />
    );
  }

  // Filtrar endoses según término de búsqueda
  const filteredEndoses = endoses.filter(
    (endose) =>
      searchTerm === "" ||
      (endose.nombre_agencia || "")
        .toLowerCase()
        .includes(searchTerm.toLowerCase()) ||
      (endose.tipo_tour || "")
        .toLowerCase()
        .includes(searchTerm.toLowerCase()) ||
      (endose.zona || "").toLowerCase().includes(searchTerm.toLowerCase()),
  );

  // Si no hay endose seleccionado, mostrar la lista de endoses
  return (
    <div>
      <h2>Seleccione un Endose para gestionar sus Tours</h2>

      {/* Barra de búsqueda */}
      <div className="search-container">
        <div style={{ display: "flex", flex: 1 }}>
          <div className="search-icon-container">
            <FaSearch />
          </div>
          <input
            className="search-input"
            placeholder="Buscar por agencia, tipo de tour o zona..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        {searchTerm && (
          <button className="clear-button" onClick={() => setSearchTerm("")}>
            Limpiar
          </button>
        )}
      </div>

      <div className="entity-grid">
        {filteredEndoses.map((endose) => (
          <div
            key={endose.id_endose}
            className="entity-card"
            onClick={() => handleSelectEndose(endose)}
          >
            <h3>{endose.nombre_agencia || "Agencia sin nombre"}</h3>
            <p>
              <strong>Tipo Tour:</strong> {endose.tipo_tour}
            </p>
            {endose.zona && <p className="text-muted">Zona: {endose.zona}</p>}
          </div>
        ))}
      </div>

      {filteredEndoses.length === 0 && !loading && (
        <div className="alert info">
          {searchTerm
            ? `No se encontraron endoses con el término "${searchTerm}"`
            : "No hay endoses registrados. Por favor, cree un endose primero."}
        </div>
      )}
    </div>
  );
};

export default ToursList;
