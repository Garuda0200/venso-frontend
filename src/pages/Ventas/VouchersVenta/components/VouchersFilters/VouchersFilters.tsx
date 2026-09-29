import { useEffect, useState } from "react";
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
}) => {
  // Filter states - only UI state, no data filtering
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [seller, setSeller] = useState("");

  // Filtrado reactivo: cada cambio en los controles se envía al padre.
  useEffect(() => {
    onFilterChange({
      searchTerm: searchTerm.trim(),
      dateFrom,
      dateTo,
      seller,
    });
  }, [searchTerm, dateFrom, dateTo, seller, onFilterChange]);

  // Handle search input change
  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
  };

  // Handle date from change
  const handleDateFromChange = (e) => {
    setDateFrom(e.target.value);
  };

  // Handle date to change
  const handleDateToChange = (e) => {
    setDateTo(e.target.value);
  };

  // Handle seller filter change
  const handleSellerChange = (e) => {
    setSeller(e.target.value);
  };

  // Clear all filters
  const handleClearFilters = () => {
    setSearchTerm("");
    setDateFrom("");
    setDateTo("");
    setSeller("");
    onFilterChange({
      searchTerm: "",
      dateFrom: "",
      dateTo: "",
      seller: "",
    });
  };

  // Clear search only
  const handleClearSearch = () => {
    setSearchTerm("");
  };

  // Check if filters are active
  const hasActiveFilters = searchTerm || dateFrom || dateTo || seller;

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
            onChange={handleSearchChange}
          />
          {searchTerm && (
            <button
              type="button"
              className="clear-search"
              onClick={handleClearSearch}
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
              onChange={handleDateFromChange}
            />
            <label className="date-label">Desde</label>
          </div>

          <div className="date-filter-item">
            <MdCalendarToday className="date-icon" />
            <input
              type="date"
              className="date-input"
              value={dateTo}
              onChange={handleDateToChange}
              min={dateFrom}
            />
            <label className="date-label">Hasta</label>
          </div>
        </div>

        {/* Seller filter */}
        <div className="voucher-select-filter seller-filter">
          <MdFilterList className="filter-icon" />
          <select
            className="voucher-select"
            value={seller}
            onChange={handleSellerChange}
          >
            <option value="">Todos los vendedores</option>
            {sellers.map((s) => (
              <option key={s.dni} value={s.dni}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        {/* Action buttons */}
        <div className="filter-actions">
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
};

export default VouchersFilters;
