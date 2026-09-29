import React from "react";
import { InputText } from "primereact/inputtext";
import { Dropdown } from "primereact/dropdown";
import { Button } from "primereact/button";
import { FaSearch, FaTimes } from "react-icons/fa";
import "./UserFilters.scss";

const UserFilters = ({ filters, onFilterChange, onClear }) => {
  const roleOptions = [
    { label: "Todos los roles", value: null },
    { label: "Superadmin", value: 0 },
    { label: "Administrador", value: 1 },
    { label: "Ventas", value: 2 },
    { label: "Reservas", value: 3 },
    { label: "Contabilidad", value: 4 },
    { label: "Gestión Media", value: 5 },
  ];

  const platformOptions = [
    { label: "Todas las plataformas", value: null },
    { label: "Venso", value: "venso" },
    { label: "Mil", value: "mil" },
    { label: "Todos", value: "all" },
  ];

  const businessTypeOptions = [
    { label: "Todos los negocios", value: null },
    { label: "B2C", value: "B2C" },
    { label: "B2B", value: "B2B" },
    { label: "Todos", value: "all" },
  ];

  const statusOptions = [
    { label: "Todos los estados", value: null },
    { label: "Activos", value: true },
    { label: "Inactivos", value: false },
  ];

  const handleFilterChange = (field, value) => {
    onFilterChange({ ...filters, [field]: value });
  };

  const hasActiveFilters =
    filters.search ||
    filters.role !== null ||
    filters.platform ||
    filters.business_type ||
    filters.is_active !== null;

  return (
    <div className="user-filters">
      <div className="filter-row">
        <div className="search-field">
          <span className="p-input-icon-left">
            <FaSearch />
            <InputText
              value={filters.search || ""}
              onChange={(e) => handleFilterChange("search", e.target.value)}
              placeholder="Buscar por nombre o email..."
              className="search-input"
            />
          </span>
        </div>

        <Dropdown
          value={filters.role}
          options={roleOptions}
          onChange={(e) => handleFilterChange("role", e.value)}
          placeholder="Filtrar por rol"
          className="filter-dropdown"
        />

        <Dropdown
          value={filters.platform}
          options={platformOptions}
          onChange={(e) => handleFilterChange("platform", e.value)}
          placeholder="Filtrar por plataforma"
          className="filter-dropdown"
        />

        <Dropdown
          value={filters.business_type}
          options={businessTypeOptions}
          onChange={(e) => handleFilterChange("business_type", e.value)}
          placeholder="Tipo de negocio"
          className="filter-dropdown"
        />

        <Dropdown
          value={filters.is_active}
          options={statusOptions}
          onChange={(e) => handleFilterChange("is_active", e.value)}
          placeholder="Estado"
          className="filter-dropdown"
        />

        {hasActiveFilters && (
          <Button
            icon={<FaTimes />}
            label="Limpiar"
            className="p-button-outlined p-button-secondary clear-button"
            onClick={onClear}
          />
        )}
      </div>
    </div>
  );
};

export default UserFilters;
