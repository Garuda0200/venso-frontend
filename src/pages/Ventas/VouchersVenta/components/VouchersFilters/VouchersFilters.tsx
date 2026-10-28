import PropTypes from "prop-types";
import {
  MdSearch,
  MdClear,
  MdFilterList,
  MdCalendarToday,
  MdRefresh,
} from "react-icons/md";
import "./VouchersFilters.scss";

/**
 * VouchersFilters Component
 * Handles filtering of vouchers by search, status, and date range.
 * Does NOT manage filtered data internally - parent component handles filtering.
 */
const VouchersFilters = ({
  onFilterChange,
  onRefresh,
  sellers = [],
  filters = { searchTerm: "", dateFrom: "", dateTo: "", seller: "" },
  canScopeBySeller = false,
  canChooseTravelDates = false,
  listByTravelDates = false,
  onTravelDatesChange = () => {},
}) => {
  const { searchTerm, dateFrom, dateTo, seller } = filters;
  const update = (field, value) => onFilterChange({ ...filters, [field]: value });
  const hasActiveFilters = searchTerm || dateFrom || dateTo || seller;
  const handleClearFilters = () => onFilterChange({
    searchTerm: "", dateFrom: "", dateTo: "", seller: "",
  });
  return (
    <div className="vouchers-filters">
      <div className="filters-row">
        {/* Search bar */}
        <div className="search-container">
          <MdSearch className="search-icon" />
          <input
            type="text"
            className="search-input"
            placeholder="Buscar por código, título o cliente..."
            value={searchTerm}
            onChange={event => update("searchTerm", event.target.value)}
          />
          {searchTerm && (
            <button
              type="button"
              className="clear-search"
              onClick={() => update("searchTerm", "")}
              aria-label="Limpiar búsqueda"
            >
              <MdClear />
            </button>
          )}
        </div>

        {/* Date range filters */}
        <div className="date-filters">
          <div className="date-filter-item">
            <MdCalendarToday className="date-icon" />
            <input
              type="date"
              className="date-input"
              value={dateFrom}
              onChange={event => update("dateFrom", event.target.value)}
              aria-label="Viajes desde"
            />
            <label className="date-label">Desde</label>
          </div>

          <div className="date-filter-item">
            <MdCalendarToday className="date-icon" />
            <input
              type="date"
              className="date-input"
              value={dateTo}
              onChange={event => update("dateTo", event.target.value)}
              aria-label="Viajes hasta"
              min={dateFrom}
            />
            <label className="date-label">Hasta</label>
          </div>
        </div>

        {/* Seller filter */}
        {canScopeBySeller && <div className="voucher-select-filter seller-filter">
          <MdFilterList className="filter-icon" />
          <select
            className="voucher-select"
            value={seller}
            onChange={event => update("seller", event.target.value)}
            aria-label="Filtrar por vendedor"
          >
            <option value="">Todos los vendedores</option>
            <option value="scope:mine">Propios</option>
            <option value="scope:others">Otros vendedores</option>
            {sellers.map((s) => (
              <option key={s.dni} value={s.dni}>
                {s.name}
              </option>
            ))}
          </select>
        </div>}

        {/* Action buttons */}
        <div className="filter-actions">
          {canChooseTravelDates && (
            <button
              type="button"
              role="switch"
              aria-label="Listar por fechas del viaje"
              aria-checked={listByTravelDates}
              className={'travel-dates-switch ' + (listByTravelDates ? "is-active" : "")}
              onClick={() => onTravelDatesChange(!listByTravelDates)}
            >
              <MdCalendarToday />
              <span>{listByTravelDates ? "Por viaje" : "Por cierre"}</span>
            </button>
          )}
          {hasActiveFilters && (
            <button
              type="button"
              className="clear-filters-btn"
              onClick={handleClearFilters}
              title="Limpiar filtros"
            >
              <MdClear />
              <span>Limpiar</span>
            </button>
          )}

          <button
            type="button"
            className="refresh-btn"
            onClick={onRefresh}
            title="Recargar vouchers"
          >
            <MdRefresh />
          </button>
        </div>
      </div>
    </div>
  );
};

VouchersFilters.propTypes = {
  onFilterChange: PropTypes.func.isRequired,
  onRefresh: PropTypes.func.isRequired,
  sellers: PropTypes.array,
  filters: PropTypes.object,
  canScopeBySeller: PropTypes.bool,
  canChooseTravelDates: PropTypes.bool,
  listByTravelDates: PropTypes.bool,
  onTravelDatesChange: PropTypes.func,
};

export default VouchersFilters;
