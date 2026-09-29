import React, { useEffect, useMemo, useState } from "react";
import {
  FaBed,
  FaBuilding,
  FaCity,
  FaClock,
  FaFilter,
  FaHome,
  FaHotel,
  FaMapMarkerAlt,
  FaSearch,
  FaStar,
  FaTimes,
  FaTree,
  FaUtensils,
} from "react-icons/fa";
import { fetchHoteles } from "../../services/api";
import HabitacionesHotelList from "./HabitacionesHotelList";

const countCategoryStars = (value) => {
  const text = String(value || "");
  const unicodeStars = (text.match(/\u2B50/g) || []).length;
  if (unicodeStars > 0) return unicodeStars;

  const labelMatch = text.match(/([1-5])\s*(?:estrella|star)/i);
  if (labelMatch) return Number(labelMatch[1]);

  const numberMatch = text.match(/\b([1-5])\b/);
  return numberMatch ? Number(numberMatch[1]) : 0;
};

const HabitacionesList = () => {
  const [hoteles, setHoteles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [selectedHotel, setSelectedHotel] = useState(null);
  const [showHabitacionesHotel, setShowHabitacionesHotel] = useState(false);

  useEffect(() => {
    const loadHoteles = async () => {
      try {
        setLoading(true);
        const data = await fetchHoteles();
        setHoteles(data);
        setLoading(false);
      } catch (err) {
        setError(`Error al cargar hoteles: ${err.message}`);
        setLoading(false);
      }
    };

    loadHoteles();
  }, []);

  // Build unique categories for the filter.
  const uniqueCategories = useMemo(() => {
    const categories = new Set();
    hoteles.forEach((hotel) => {
      if (hotel.categoria) categories.add(hotel.categoria);
    });

    return Array.from(categories).sort((a, b) => {
      const starsA = countCategoryStars(a);
      const starsB = countCategoryStars(b);

      if (starsA > 0 && starsB > 0) return starsB - starsA;
      if (starsA > 0) return -1;
      if (starsB > 0) return 1;
      return a.localeCompare(b);
    });
  }, [hoteles]);

  // Group categories for the filter UI.
  const groupedCategories = useMemo(
    () => ({
      "Hoteles por Estrellas": uniqueCategories.filter(
        (cat) => countCategoryStars(cat) > 0,
      ),
      "Otros Alojamientos": uniqueCategories.filter(
        (cat) => countCategoryStars(cat) === 0,
      ),
    }),
    [uniqueCategories],
  );

  // Filter hotels by search term and category.
  const filteredHoteles = useMemo(() => {
    return hoteles.filter((hotel) => {
      const lowerSearch = searchTerm.toLowerCase();
      const matchesSearch =
        hotel.nombre.toLowerCase().includes(lowerSearch) ||
        (hotel.ciudad && hotel.ciudad.toLowerCase().includes(lowerSearch));

      const matchesCategory =
        !categoryFilter ||
        (hotel.categoria && hotel.categoria === categoryFilter);

      return matchesSearch && matchesCategory;
    });
  }, [hoteles, searchTerm, categoryFilter]);

  // Pick a visual icon by accommodation type.
  const getHotelIcon = (categoria) => {
    if (!categoria) return <FaHotel />;

    const categoriaLower = categoria.toLowerCase();

    if (categoriaLower.includes("hostal")) return <FaHome />;
    if (categoriaLower.includes("albergue")) return <FaHome />;
    if (categoriaLower.includes("resort")) return <FaTree />;
    if (categoriaLower.includes("apart")) return <FaBuilding />;
    if (categoriaLower.includes("boutique")) return <FaCity />;
    if (categoriaLower.includes("lodge")) return <FaTree />;

    return <FaHotel />;
  };

  // Render stars with React Icons when the category contains a star count.
  const renderCategoryStars = (categoria) => {
    if (!categoria) return null;

    const starCount = countCategoryStars(categoria);
    if (starCount > 0) {
      return (
        <div className="star-rating">
          {Array(starCount)
            .fill(0)
            .map((_, i) => (
              <FaStar key={i} className="star-icon" />
            ))}
        </div>
      );
    }

    return <span className="hotel-category">{categoria}</span>;
  };

  // Choose the CSS class by category.
  const getHotelCategoryClass = (categoria) => {
    if (!categoria) return "";

    const starCount = countCategoryStars(categoria);
    if (starCount >= 5) return "luxury-hotel";
    if (starCount === 4) return "premium-hotel";
    if (starCount === 3) return "standard-hotel";
    if (starCount === 2) return "budget-hotel";
    if (starCount === 1) return "basic-hotel";

    const categoriaLower = categoria.toLowerCase();

    if (categoriaLower.includes("hostal")) return "hostal-hotel";
    if (categoriaLower.includes("albergue")) return "hostel-hotel";
    if (categoriaLower.includes("resort")) return "resort-hotel";
    if (categoriaLower.includes("apart")) return "apart-hotel";
    if (categoriaLower.includes("boutique")) return "boutique-hotel";
    if (categoriaLower.includes("lodge")) return "lodge-hotel";

    return "";
  };

  const clearFilters = () => {
    setSearchTerm("");
    setCategoryFilter("");
  };

  const handleHotelClick = (hotel) => {
    setSelectedHotel(hotel);
    setShowHabitacionesHotel(true);
  };

  if (showHabitacionesHotel && selectedHotel) {
    return (
      <HabitacionesHotelList
        hotel={selectedHotel}
        onBack={() => setShowHabitacionesHotel(false)}
      />
    );
  }

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>Cargando hoteles...</p>
      </div>
    );
  }

  return (
    <div className="entity-view-container">
      <div className="header-with-actions">
        <div className="header-title">
          <FaHotel className="title-icon" />
          <h2>Gestión de Habitaciones</h2>
        </div>
      </div>

      {error && <div className="alert danger">{error}</div>}

      <div className="filters-container">
        <div className="search-container">
          <div className="search-icon-container">
            <FaSearch />
          </div>
          <input
            className="search-input"
            placeholder="Buscar hotel por nombre o ciudad..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="filter-container filter-with-icon">
          <FaStar className="filter-icon" />
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="filter-select"
            aria-label="Filtrar por categoría"
          >
            <option value="">Todas las categorías</option>

            {groupedCategories["Hoteles por Estrellas"].length > 0 && (
              <optgroup label="Hoteles por Estrellas">
                {groupedCategories["Hoteles por Estrellas"].map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </optgroup>
            )}

            {groupedCategories["Otros Alojamientos"].length > 0 && (
              <optgroup label="Otros Alojamientos">
                {groupedCategories["Otros Alojamientos"].map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </div>

        {(searchTerm || categoryFilter) && (
          <button className="button button-secondary" onClick={clearFilters}>
            <FaFilter style={{ marginRight: 4 }} /> Limpiar filtros
          </button>
        )}
      </div>

      {!categoryFilter && uniqueCategories.length > 0 && (
        <div className="category-badges-container">
          <button
            className={`category-badge ${!categoryFilter ? "active" : ""}`}
            onClick={() => setCategoryFilter("")}
          >
            Todos
          </button>

          <div className="category-badge-group">
            <strong className="group-title">Hoteles por Estrellas:</strong>
            {uniqueCategories
              .filter((category) => countCategoryStars(category) > 0)
              .sort((a, b) => countCategoryStars(a) - countCategoryStars(b))
              .map((category) => (
                <button
                  key={category}
                  className={`category-badge star-badge ${categoryFilter === category ? "active" : ""} ${getHotelCategoryClass(category)}`}
                  onClick={() => setCategoryFilter(category)}
                >
                  <FaStar className="badge-icon" />
                  <span>{countCategoryStars(category)}</span>
                </button>
              ))}
          </div>

          <div className="category-badge-group">
            <strong className="group-title">Otros Alojamientos:</strong>
            {uniqueCategories
              .filter((category) => countCategoryStars(category) === 0)
              .map((category) => (
                <button
                  key={category}
                  className={`category-badge ${categoryFilter === category ? "active" : ""} ${getHotelCategoryClass(category)}`}
                  onClick={() => setCategoryFilter(category)}
                >
                  {category}
                </button>
              ))}
          </div>
        </div>
      )}

      {categoryFilter && (
        <div className="active-category-filter">
          <span className="filter-label">Categoría seleccionada:</span>
          <span
            className={`filter-value ${getHotelCategoryClass(categoryFilter)}`}
          >
            {categoryFilter}
          </span>
          <button
            className="clear-category"
            onClick={() => setCategoryFilter("")}
            title="Limpiar filtro de categoría"
          >
            <FaTimes />
          </button>
        </div>
      )}

      <div className="results-count">
        {filteredHoteles.length}{" "}
        {filteredHoteles.length === 1
          ? "hotel encontrado"
          : "hoteles encontrados"}
        {categoryFilter && (
          <span className="filtered-by"> en la categoría {categoryFilter}</span>
        )}
      </div>

      {filteredHoteles.length === 0 ? (
        <div className="alert info">
          No se encontraron hoteles con los criterios seleccionados.
        </div>
      ) : (
        <div className="hoteles-cards-container">
          {filteredHoteles.map((hotel) => (
            <div
              key={hotel.id_hotel}
              className={`hotel-card ${getHotelCategoryClass(hotel.categoria)}`}
              onClick={() => handleHotelClick(hotel)}
            >
              <div className="hotel-card-header">
                <div className="hotel-icon-container">
                  {getHotelIcon(hotel.categoria)}
                </div>
                <h3 className="hotel-name">{hotel.nombre}</h3>
              </div>
              <div className="hotel-card-body">
                {hotel.categoria && (
                  <div className="hotel-category-container">
                    {renderCategoryStars(hotel.categoria)}
                  </div>
                )}

                {hotel.ciudad && (
                  <div className="hotel-info">
                    <FaMapMarkerAlt className="location-icon" />
                    <span className="hotel-location">{hotel.ciudad}</span>
                  </div>
                )}

                <div className="hotel-schedule">
                  {hotel.check_in && (
                    <div className="hotel-time-info">
                      <FaClock className="time-icon" />
                      <span>Check-in: {hotel.check_in.substring(0, 5)}</span>
                    </div>
                  )}
                  {hotel.check_out && (
                    <div className="hotel-time-info">
                      <FaClock className="time-icon" />
                      <span>Check-out: {hotel.check_out.substring(0, 5)}</span>
                    </div>
                  )}
                </div>

                {hotel.desayuno && (
                  <div className="hotel-breakfast">
                    <FaUtensils className="breakfast-icon" />
                    <span>{hotel.tipo_desayuno || "Desayuno incluido"}</span>
                  </div>
                )}
              </div>
              <div className="hotel-card-footer">
                <button className="view-habitaciones-btn">
                  <FaBed className="bed-icon" /> Ver habitaciones
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default HabitacionesList;
