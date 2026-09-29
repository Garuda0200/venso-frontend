import React, { useState, useEffect } from "react";
import { FaSearch } from "react-icons/fa";
import { fetchGuias } from "../../services/api";
import RutasGuiaList from "./RutasGuiaList";

const RutaList = () => {
  const [guias, setGuias] = useState([]);
  const [selectedGuia, setSelectedGuia] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");

  // Cargar guías inicialmente
  useEffect(() => {
    const loadGuias = async () => {
      try {
        const data = await fetchGuias();
        setGuias(data);
        setLoading(false);
      } catch (err) {
        setError("Error al cargar los guías: " + err.message);
        setLoading(false);
      }
    };

    loadGuias();
  }, []);

  // Cuando se selecciona un guía
  const handleSelectGuia = (guia) => {
    setSelectedGuia(guia);
  };

  // Volver a la lista de guías
  const handleBackToGuias = () => {
    setSelectedGuia(null);
  };

  // Función para refrescar la lista de guías
  const handleRefreshGuias = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchGuias();
      setGuias(data);
    } catch (err) {
      setError("Error al cargar los guías: " + err.message);
    } finally {
      setLoading(false);
    }
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

  // Si hay un guía seleccionado, mostrar sus rutas
  if (selectedGuia) {
    // CORREGIDO: Verificar que el guía tiene un ID válido
    const guiaId = selectedGuia?.id_guia || selectedGuia?.guia?.id_guia;
    if (!guiaId) {
      return (
        <div className="alert danger">
          Error: El guía seleccionado no tiene un ID válido. No se pueden
          gestionar sus rutas.
        </div>
      );
    }

    return (
      <RutasGuiaList
        guia={selectedGuia}
        onBack={handleBackToGuias}
        onRefreshParent={handleRefreshGuias}
      />
    );
  }

  // Filtrar guías para mostrar solo las que tienen un ID válido Y que coincidan con búsqueda
  const filteredGuias = guias.filter((guia) => {
    const id = guia.id_guia || guia.guia?.id_guia;
    if (!id) return false;
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    const nombres = (guia.nombres || guia.persona?.nombres || "").toLowerCase();
    const apellidos = (
      guia.apellidos ||
      guia.persona?.apellidos ||
      ""
    ).toLowerCase();
    const codigo = (
      guia.codigo_guia ||
      guia.guia?.codigo_guia ||
      ""
    ).toLowerCase();
    const idioma = (guia.idioma || guia.guia?.idioma || "").toLowerCase();
    return (
      nombres.includes(term) ||
      apellidos.includes(term) ||
      codigo.includes(term) ||
      idioma.includes(term)
    );
  });

  // Si no hay guía seleccionado, mostrar la lista de guías
  return (
    <div className="entity-view-container">
      <h2>Gestión de Rutas</h2>

      {/* Barra de búsqueda */}
      <div className="search-container">
        <div style={{ display: "flex", flex: 1 }}>
          <div className="search-icon-container">
            <FaSearch />
          </div>
          <input
            className="search-input"
            placeholder="Buscar por nombre, apellido, código o idioma..."
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

      {/* CORREGIDO: Añadir claves únicas a los elementos en el renderizado de guías */}
      <div className="entity-grid">
        {filteredGuias.map((guia) => {
          // Extraer el ID de manera segura
          const id = guia.id_guia || guia.guia?.id_guia;

          // Si no hay ID, generar una clave temporal única
          const itemKey = id != null ? id : `temp-${Math.random()}`;
          const nombres = guia.nombres || guia.persona?.nombres || "";
          const apellidos = guia.apellidos || guia.persona?.apellidos || "";
          const codigo = guia.codigo_guia || guia.guia?.codigo_guia;
          const idioma = guia.idioma || guia.guia?.idioma;

          return (
            <div
              key={itemKey}
              className="entity-card"
              onClick={() => (id != null ? handleSelectGuia(guia) : null)}
            >
              <h3>
                {nombres} {apellidos}
              </h3>
              {codigo && <p className="text-muted">Código: {codigo}</p>}
              {idioma && (
                <div className="mt-2">
                  <span className="badge info">{idioma}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {filteredGuias.length === 0 && (
        <div className="alert info">
          {searchTerm
            ? `No se encontraron guías con el término "${searchTerm}"`
            : "No hay guías registrados. Por favor, cree un guía primero."}
        </div>
      )}
    </div>
  );
};

export default RutaList;
