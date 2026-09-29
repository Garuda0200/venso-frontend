import React, { useState, useEffect } from "react";
import { FaSearch, FaTrain } from "react-icons/fa";
import { fetchTrenes } from "../../services/api";
import VagonesTrenList from "./VagonesTrenList";

const VagonesList = () => {
  const [trenes, setTrenes] = useState([]);
  const [selectedTren, setSelectedTren] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");

  // Cargar trenes inicialmente
  useEffect(() => {
    const loadTrenes = async () => {
      try {
        setLoading(true);
        const data = await fetchTrenes();
        setTrenes(data);
        setLoading(false);
      } catch (err) {
        setError("Error al cargar los trenes: " + err.message);
        setLoading(false);
      }
    };

    loadTrenes();
  }, []);

  // Cuando se selecciona un tren
  const handleSelectTren = (tren) => {
    setSelectedTren(tren);
  };

  // Volver a la lista de trenes
  const handleBackToTrenes = () => {
    setSelectedTren(null);
  };

  // Filtrar trenes según el término de búsqueda
  const filteredTrenes = trenes.filter(
    (tren) =>
      searchTerm === "" ||
      tren.nombre_empresa.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (tren.frecuencia &&
        tren.frecuencia.toLowerCase().includes(searchTerm.toLowerCase())),
  );

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

  // Si hay un tren seleccionado, mostrar sus vagones
  if (selectedTren) {
    return <VagonesTrenList tren={selectedTren} onBack={handleBackToTrenes} />;
  }

  // Si no hay tren seleccionado, mostrar la lista de trenes
  return (
    <div>
      <h2>Seleccione un Tren para gestionar sus Vagones</h2>

      {/* Barra de búsqueda */}
      <div className="search-container">
        <div style={{ display: "flex", flex: 1 }}>
          <div className="search-icon-container">
            <FaSearch />
          </div>
          <input
            className="search-input"
            placeholder="Buscar por nombre de empresa o frecuencia..."
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
        {filteredTrenes.map((tren) => (
          <div
            key={tren.id_tren}
            className="entity-card"
            onClick={() => handleSelectTren(tren)}
          >
            <div className="icon-container">
              <FaTrain size={40} />
            </div>
            <h3>{tren.nombre_empresa}</h3>
            <p className="text-muted">
              {tren.frecuencia || "Frecuencia no especificada"}
            </p>
          </div>
        ))}
      </div>

      {filteredTrenes.length === 0 && !loading && (
        <div className="alert info">
          {searchTerm
            ? `No se encontraron trenes con el término "${searchTerm}"`
            : "No hay trenes registrados. Por favor, cree un tren primero."}
        </div>
      )}
    </div>
  );
};

export default VagonesList;
