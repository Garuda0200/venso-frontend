import React, { useMemo } from "react";
import {
  FaHotel,
  FaCar,
  FaRoute,
  FaUtensils,
  FaTicketAlt,
  FaPlane,
  FaTrain,
  FaExchangeAlt,
  FaUserTie,
  FaPlus,
} from "react-icons/fa";
import "./ServiceCategoryButtons.scss";

const ServiceCategoryButtons = ({
  onCategorySelect,
  selectedCategory,
  compact = false,
  onExtrasClick,
  platform = "venso", // Platform para controlar visibilidad de categorías
}) => {
  // Lista base de categorías de servicios
  const allServiceCategories = [
    {
      id: "hoteles",
      name: "Hoteles",
      icon: FaHotel,
      color: "#02522f",
      description: "Alojamientos y hospedajes",
      hideForVenso: true,
    },
    {
      id: "transportes",
      name: "Transporte",
      icon: FaCar,
      color: "#02522f",
      description: "Traslados y movilidad",
    },
    {
      id: "vuelos",
      name: "Vuelos",
      icon: FaPlane,
      color: "#02522f",
      description: "Vuelos nacionales e internacionales",
    },
    {
      id: "trenes",
      name: "Trenes",
      icon: FaTrain,
      color: "#02522f",
      description: "Servicios ferroviarios",
    },
    {
      id: "guias",
      name: "Guías",
      icon: FaRoute,
      color: "#02522f",
      description: "Tours y excursiones",
    },
    {
      id: "endoses",
      name: "Endoses",
      icon: FaExchangeAlt,
      color: "#02522f",
      description: "Servicios de endose",
    },
    {
      id: "restaurantes",
      name: "Restaurantes",
      icon: FaUtensils,
      color: "#02522f",
      description: "Servicios gastronómicos",
    },
    {
      id: "tickets",
      name: "Tickets",
      icon: FaTicketAlt,
      color: "#02522f",
      description: "Entradas y boletos",
    },
  ];

  // Filtrar categorías según platform
  const serviceCategories = useMemo(() => {
    const platformLower = platform?.toLowerCase() || "";
    // Para venso y mil: ocultar categorías marcadas con hideForVenso (hoteles se gestionan en HotelPricingModal)
    if (platformLower === "venso" || platformLower === "mil") {
      return allServiceCategories.filter((cat) => !cat.hideForVenso);
    }
    // Para otras plataformas: mostrar todas las categorías
    return allServiceCategories;
  }, [platform]);

  // Botón especial para extras
  const extrasButton = {
    id: "extras",
    name: "Extras",
    icon: FaPlus,
    color: "#ff8c00",
    description: "Servicios adicionales personalizados",
  };

  const handleCategoryClick = (categoryId) => {
    if (categoryId === "extras") {
      // Ejecutar callback especial para extras
      if (onExtrasClick) {
        onExtrasClick();
      }
    } else {
      // Selección normal de categoría
      onCategorySelect(categoryId);
    }
  };

  // Renderizado compacto con iconos en línea
  if (compact) {
    return (
      <div className="service-category-compact">
        <div className="compact-categories">
          {serviceCategories.map((category) => {
            const IconComponent = category.icon;
            const isSelected = selectedCategory === category.id;

            return (
              <button
                key={category.id}
                className={`compact-category-btn ${isSelected ? "selected" : ""}`}
                onClick={() => handleCategoryClick(category.id)}
                style={{
                  "--category-color": category.color,
                  backgroundColor: isSelected ? category.color : "transparent",
                  borderColor: category.color,
                  color: isSelected ? "#fff" : category.color,
                }}
                title={`${category.name} - ${category.description}`}
              >
                <IconComponent />
                <span className="btn-label">{category.name}</span>
              </button>
            );
          })}

          {/* Botón de Extras separado */}
          <button
            className={`compact-category-btn ${selectedCategory === extrasButton.id ? "selected" : ""}`}
            onClick={() => handleCategoryClick(extrasButton.id)}
            style={{
              "--category-color": extrasButton.color,
              backgroundColor:
                selectedCategory === extrasButton.id
                  ? extrasButton.color
                  : "transparent",
              borderColor: extrasButton.color,
              color:
                selectedCategory === extrasButton.id
                  ? "#fff"
                  : extrasButton.color,
            }}
            title={`${extrasButton.name} - ${extrasButton.description}`}
          >
            <extrasButton.icon />
            <span className="btn-label">{extrasButton.name}</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="service-category-buttons">
      <div className="category-header">
        <h3>Seleccionar Tipo de Servicio</h3>
        <p>Elige una categoría para ver los servicios disponibles</p>
      </div>

      <div className="category-grid">
        {serviceCategories.map((category) => {
          const IconComponent = category.icon;
          return (
            <button
              key={category.id}
              className={`category-button ${selectedCategory === category.id ? "selected" : ""}`}
              onClick={() => handleCategoryClick(category.id)}
              style={{ "--category-color": category.color }}
            >
              <div className="category-icon">
                <IconComponent />
              </div>
              <div className="category-info">
                <span className="category-name">{category.name}</span>
                <span className="category-description">
                  {category.description}
                </span>
              </div>
            </button>
          );
        })}

        {/* Botón de Extras separado */}
        <button
          key={extrasButton.id}
          className={`category-button ${selectedCategory === extrasButton.id ? "selected" : ""}`}
          onClick={() => handleCategoryClick(extrasButton.id)}
          style={{ "--category-color": extrasButton.color }}
        >
          <div className="category-icon">
            <extrasButton.icon />
          </div>
          <div className="category-info">
            <span className="category-name">{extrasButton.name}</span>
            <span className="category-description">
              {extrasButton.description}
            </span>
          </div>
        </button>
      </div>
    </div>
  );
};

export default ServiceCategoryButtons;
