import { FaStar, FaHotel, FaCheck } from "react-icons/fa";
import "./CategorySelection.scss";

const CategorySelection = ({
  categories,
  selectedCategory,
  onSelectCategory,
  countHotelsUsedByCategory,
  loading,
  error,
  onRetry,
}) => {
  if (loading) {
    return (
      <div className="category-loading">
        <div className="spinner"></div>
        <p>Cargando categorías...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="category-error">
        <p>{error}</p>
        <button onClick={onRetry} className="retry-btn">
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="category-selection-component">
      <div className="section-header">
        <h3>
          <FaStar /> Seleccionar Categoría de Hotel
        </h3>
      </div>

      <div className="categories-grid">
        {categories.map((category) => {
          const usedCount = countHotelsUsedByCategory(category.name);
          const isSelected = selectedCategory === category.name;

          return (
            <div
              key={category.name}
              className={`category-card ${isSelected ? "selected" : ""} ${usedCount > 0 ? "has-hotels" : ""}`}
              onClick={() => onSelectCategory(category.name)}
            >
              <div className="card-content">
                <div className="category-icon">
                  <FaHotel />
                </div>

                <div className="category-info">
                  <h4 className="category-name">{category.name}</h4>
                  <div className="category-stats">
                    <span className="available-count">
                      <FaHotel /> {category.count} disponibles
                    </span>
                    {usedCount > 0 && (
                      <span className="used-badge">{usedCount} en uso</span>
                    )}
                  </div>
                </div>

                <div className="category-stars">
                  {!isNaN(category.name) ? (
                    Array.from(
                      { length: Math.min(parseInt(category.name) || 0, 5) },
                      (_, i) => <FaStar key={i} className="star" />,
                    )
                  ) : (
                    <span className="category-label">{category.name}</span>
                  )}
                </div>
              </div>

              <div className="select-indicator">
                {isSelected ? <FaCheck /> : <span>Seleccionar</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default CategorySelection;
