import { useState, useEffect } from "react";
import { FaSearch } from "react-icons/fa";
import { fetchVuelos } from "../../services/api";
import TipoVuelosVueloList from "./TipoVuelosVueloList";

const TipoVuelosList = () => {
  const [vuelos, setVuelos] = useState([]);
  const [selectedVuelo, setSelectedVuelo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");

  // Cargar vuelos inicialmente
  useEffect(() => {
    const loadVuelos = async () => {
      try {
        const data = await fetchVuelos();
        setVuelos(data);
        setLoading(false);
      } catch (err) {
        setError("Error al cargar los vuelos: " + err.message);
        setLoading(false);
      }
    };

    loadVuelos();
  }, []);

  // Cuando se selecciona un vuelo
  const handleSelectVuelo = (vuelo) => {
    setSelectedVuelo(vuelo);
  };

  // Volver a la lista de vuelos
  const handleBackToVuelos = () => {
    setSelectedVuelo(null);
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

  // Si hay un vuelo seleccionado, mostrar sus tipos de vuelo
  if (selectedVuelo) {
    return (
      <TipoVuelosVueloList vuelo={selectedVuelo} onBack={handleBackToVuelos} />
    );
  }

  // Filtrar vuelos según término de búsqueda
  const filteredVuelos = vuelos.filter(
    (vuelo) =>
      searchTerm === "" ||
      (vuelo.nombre || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (vuelo.procedencia || "")
        .toLowerCase()
        .includes(searchTerm.toLowerCase()) ||
      (vuelo.correo || "").toLowerCase().includes(searchTerm.toLowerCase()),
  );

  // Si no hay vuelo seleccionado, mostrar la lista de vuelos
  return (
    <div>
      <h2>Seleccione un Vuelo para gestionar sus Tipos de Vuelo</h2>

      {/* Barra de búsqueda */}
      <div className="search-container">
        <div style={{ display: "flex", flex: 1 }}>
          <div className="search-icon-container">
            <FaSearch />
          </div>
          <input
            className="search-input"
            placeholder="Buscar por nombre, procedencia o correo..."
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
        {filteredVuelos.map((vuelo) => (
          <div
            key={vuelo.id_vuelo}
            className="entity-card"
            onClick={() => handleSelectVuelo(vuelo)}
          >
            <h3>{vuelo.nombre}</h3>
            <p>
              <small> {vuelo.telefono || "Sin teléfono"}</small>
            </p>
            <p>
              <span className="badge info">
                {vuelo.procedencia || "Sin procedencia"}
              </span>
            </p>
          </div>
        ))}
      </div>

      {filteredVuelos.length === 0 && !loading && (
        <div className="alert info">
          {searchTerm
            ? `No se encontraron vuelos con el término "${searchTerm}"`
            : "No hay vuelos registrados. Por favor, cree un vuelo primero."}
        </div>
      )}
    </div>
  );
};

export default TipoVuelosList;
