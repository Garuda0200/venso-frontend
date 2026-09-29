import React, { useState, useMemo, useRef, useEffect } from "react";
import { MdClose, MdSearch } from "react-icons/md";
import "./CiudadesSelectorModal.scss";

// Ciudades turisticas mas frecuentes (quick-select)
const CIUDADES_RAPIDAS = [
  "Cusco",
  "Lima",
  "Puno",
  "Arequipa",
  "Aguas Calientes",
  "Ollantaytambo",
  "Juliaca",
  "Nazca",
  "Ica",
  "Paracas",
  "Chivay",
  "Trujillo",
  "Chiclayo",
  "Huaraz",
  "Puerto Maldonado",
  "Pisco",
  "Urubamba",
  "Pisac",
  "Calca",
  "Chinchero",
];

// Todas las ciudades (flat, deduplicadas, ordenadas)
const TODAS_CIUDADES = [
  "Cusco",
  "Aguas Calientes",
  "Ollantaytambo",
  "Pisac",
  "Urubamba",
  "Calca",
  "Chinchero",
  "Puno",
  "Juliaca",
  "Ilave",
  "Yunguyo",
  "Lampa",
  "Arequipa",
  "Chivay",
  "Cotahuasi",
  "Mollendo",
  "Moquegua",
  "Ilo",
  "Tacna",
  "Abancay",
  "Andahuaylas",
  "Ayacucho",
  "Huamanga",
  "Lima",
  "Callao",
  "Huacho",
  "Barranca",
  "Ica",
  "Nazca",
  "Pisco",
  "Paracas",
  "Chincha",
  "Palpa",
  "Huaraz",
  "Chimbote",
  "Casma",
  "Caraz",
  "Huancayo",
  "Tarma",
  "La Oroya",
  "Satipo",
  "Cerro de Pasco",
  "Oxapampa",
  "Villa Rica",
  "Trujillo",
  "Chiclayo",
  "Piura",
  "Tumbes",
  "Cajamarca",
  "Chachapoyas",
  "Lambayeque",
  "Sullana",
  "Paita",
  "Talara",
  "Puerto Maldonado",
  "Iquitos",
  "Tarapoto",
  "Pucallpa",
  "Moyobamba",
  "Yurimaguas",
  "Tingo Maria",
]
  .filter((c, i, arr) => arr.indexOf(c) === i)
  .sort();

const CiudadesSelectorModal = ({
  isOpen,
  onClose,
  onCiudadSelect,
  ciudadesSeleccionadas = [],
}) => {
  const [search, setSearch] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setSearch("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const filtered = useMemo(() => {
    if (!search.trim()) return [];
    const term = search.toLowerCase().trim();
    return TODAS_CIUDADES.filter(
      (c) =>
        c.toLowerCase().includes(term) && !ciudadesSeleccionadas.includes(c),
    );
  }, [search, ciudadesSeleccionadas]);

  const quickAvailable = useMemo(
    () => CIUDADES_RAPIDAS.filter((c) => !ciudadesSeleccionadas.includes(c)),
    [ciudadesSeleccionadas],
  );

  const handleSelect = (ciudad) => {
    onCiudadSelect(ciudad);
    onClose(); // close immediately on selection
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && search.trim()) {
      e.preventDefault();
      if (filtered.length > 0) {
        handleSelect(filtered[0]);
      } else {
        handleSelect(search.trim());
      }
    }
    if (e.key === "Escape") {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="cs-overlay" onClick={onClose}>
      <div className="cs-panel" onClick={(e) => e.stopPropagation()}>
        <div className="cs-header">
          <span className="cs-header__title">Ciudades</span>
          <span className="cs-header__count">
            {ciudadesSeleccionadas.length}
          </span>
          <button className="cs-header__close" onClick={onClose}>
            <MdClose />
          </button>
        </div>

        <div className="cs-search">
          <MdSearch className="cs-search__icon" />
          <input
            ref={inputRef}
            className="cs-search__input"
            type="text"
            placeholder="Buscar o escribir ciudad..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>

        {ciudadesSeleccionadas.length > 0 && (
          <div className="cs-selected">
            <span className="cs-selected__label">Seleccionadas</span>
            <div className="cs-selected__list">
              {ciudadesSeleccionadas.map((c) => (
                <span key={c} className="cs-tag cs-tag--active">
                  {c}
                  <button
                    type="button"
                    className="cs-tag__remove"
                    onClick={(event) => {
                      event.stopPropagation();
                      onCiudadSelect(c);
                    }}
                    title={`Quitar ${c}`}
                  >
                    <MdClose />
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        {search.trim() && (
          <div className="cs-results">
            {filtered.length > 0 ? (
              filtered.slice(0, 12).map((c) => (
                <button
                  key={c}
                  className="cs-city"
                  onClick={() => handleSelect(c)}
                >
                  {c}
                </button>
              ))
            ) : (
              <button
                className="cs-city cs-city--custom"
                onClick={() => handleSelect(search.trim())}
              >
                + Agregar "{search.trim()}"
              </button>
            )}
          </div>
        )}

        {!search.trim() && quickAvailable.length > 0 && (
          <div className="cs-quick">
            <span className="cs-quick__label">Frecuentes</span>
            <div className="cs-quick__grid">
              {quickAvailable.map((c) => (
                <button
                  key={c}
                  className="cs-city"
                  onClick={() => handleSelect(c)}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="cs-footer">
          <button className="cs-footer__done" onClick={onClose}>
            Listo
          </button>
        </div>
      </div>
    </div>
  );
};

export default CiudadesSelectorModal;
