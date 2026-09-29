import { FaHotel, FaSearch, FaArrowLeft, FaCheck } from "react-icons/fa";
import ServiceDetailedInfo from "../components/ServiceDetailedInfo";
import { getCategoryDisplay } from "./utils";
import "./HotelSelection.scss";

const HotelSelection = ({
  hotels,
  selectedHotel,
  selectedCategory,
  filters,
  onFilterChange,
  onSelectHotel,
  onBack,
  onViewAll,
  loading,
  error,
  showAllHotels = false,
}) => {
  // Obtener ciudades únicas
  const uniqueCities = Array.from(
    new Set(hotels.map((h) => h.ciudad).filter(Boolean)),
  ).sort();
  const uniqueCategories = Array.from(
    new Set(hotels.map((h) => h.categoria).filter(Boolean)),
  ).sort();

  // Filtrar hoteles
  const filteredHotels = hotels.filter((hotel) => {
    return (
      (!filters.search ||
        hotel.nombre?.toLowerCase().includes(filters.search.toLowerCase())) &&
      (!filters.categoria || hotel.categoria === filters.categoria) &&
      (!filters.ciudad || hotel.ciudad === filters.ciudad)
    );
  });

  return (
    <div className="hotel-selection-component">
      <div className="section-header">
        <h3>
          <FaHotel />
          {showAllHotels
            ? "Todos los Hoteles"
            : `Hoteles - ${selectedCategory}`}
        </h3>
        <div className="header-actions">
          <button className="back-btn" onClick={onBack}>
            <FaArrowLeft />{" "}
            {showAllHotels ? "Volver a Categorías" : "Cambiar Categoría"}
          </button>
          {!showAllHotels && onViewAll && (
            <button className="view-all-btn" onClick={onViewAll}>
              Ver Todos
            </button>
          )}
        </div>
      </div>

      {/* Filtros */}
      <div className="filters-bar">
        <div className="search-box">
          <FaSearch />
          <input
            type="text"
            placeholder="Buscar hotel..."
            value={filters.search}
            onChange={(e) => onFilterChange("search", e.target.value)}
          />
        </div>

        {showAllHotels && (
          <select
            value={filters.categoria}
            onChange={(e) => onFilterChange("categoria", e.target.value)}
          >
            <option value="">Todas las categorías</option>
            {uniqueCategories.map((cat) => (
              <option key={cat} value={cat}>
                {getCategoryDisplay(cat)}
              </option>
            ))}
          </select>
        )}

        <select
          value={filters.ciudad}
          onChange={(e) => onFilterChange("ciudad", e.target.value)}
        >
          <option value="">Todas las ciudades</option>
          {uniqueCities.map((ciudad) => (
            <option key={ciudad} value={ciudad}>
              {ciudad}
            </option>
          ))}
        </select>
      </div>

      {/* Lista de hoteles */}
      <div className="hotels-container">
        {loading ? (
          <div className="loading-state">
            <div className="spinner"></div>
            <p>Cargando hoteles...</p>
          </div>
        ) : error ? (
          <div className="error-state">
            <p>{error}</p>
          </div>
        ) : filteredHotels.length === 0 ? (
          <div className="empty-state">
            <FaHotel />
            <p>No se encontraron hoteles</p>
          </div>
        ) : (
          <div className="hotels-grid">
            {filteredHotels.map((hotel) => {
              const isSelected =
                selectedHotel?.id_hotel === hotel.id_hotel ||
                selectedHotel?.id === hotel.id;

              return (
                <div
                  key={hotel.id_hotel || hotel.id}
                  className={`hotel-card vertical ${isSelected ? "selected" : ""}`}
                  onClick={() => onSelectHotel(hotel)}
                >
                  {/* Header con nombre y estrellas */}
                  <div className="hotel-header">
                    <div className="hotel-name">
                      <FaHotel />
                      <span>{hotel.nombre}</span>
                    </div>
                    <span className="hotel-stars">
                      {getCategoryDisplay(hotel.categoria)}
                    </span>
                  </div>

                  {/* Contenido vertical con ServiceDetailedInfo */}
                  <div className="hotel-body">
                    <ServiceDetailedInfo
                      service={{ parentService: hotel }}
                      categoryId="hoteles"
                      className="compact-vertical"
                    />
                  </div>

                  {/* Footer */}
                  <div className="hotel-footer">
                    {isSelected ? (
                      <span className="selected-badge">
                        <FaCheck /> Seleccionado
                      </span>
                    ) : (
                      <button className="select-btn">Seleccionar</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default HotelSelection;
