import React, { useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { FaTable, FaSort, FaSortUp, FaSortDown } from "react-icons/fa";
import "./ReportTable.scss";

const ReportTable = ({ data }) => {
  const [sortField, setSortField] = useState("fecha");
  const [sortDirection, setSortDirection] = useState("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const getSortIcon = (field) => {
    if (sortField !== field) return <FaSort />;
    return sortDirection === "asc" ? <FaSortUp /> : <FaSortDown />;
  };

  const sortedMovimientos = [...data.movimientos].sort((a, b) => {
    let aValue = a[sortField];
    let bValue = b[sortField];

    if (sortField === "monto") {
      aValue = parseFloat(aValue);
      bValue = parseFloat(bValue);
    }

    if (sortField === "fecha") {
      aValue = new Date(aValue);
      bValue = new Date(bValue);
    }

    if (sortDirection === "asc") {
      return aValue > bValue ? 1 : -1;
    } else {
      return aValue < bValue ? 1 : -1;
    }
  });

  // Paginación
  const totalPages = Math.ceil(sortedMovimientos.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentMovimientos = sortedMovimientos.slice(startIndex, endIndex);

  const formatFecha = (fecha) => {
    return format(new Date(fecha), "dd/MM/yyyy", { locale: es });
  };

  const formatMonto = (monto, moneda) => {
    const symbol = moneda === "soles" ? "S/ " : "US$ ";
    return `${symbol}${parseFloat(monto).toLocaleString("es-PE", { minimumFractionDigits: 2 })}`;
  };

  return (
    <div className="report-table">
      <div className="table-header">
        <h3>
          <FaTable /> Detalle de Movimientos
        </h3>
        <div className="table-info">
          Total: {data.movimientos.length} movimientos
        </div>
      </div>

      <div className="table-container">
        <table className="movements-table">
          <thead>
            <tr>
              <th onClick={() => handleSort("fecha")} className="sortable">
                Fecha {getSortIcon("fecha")}
              </th>
              <th
                onClick={() => handleSort("descripcion")}
                className="sortable"
              >
                Descripción {getSortIcon("descripcion")}
              </th>
              <th
                onClick={() => handleSort("tipo_movimiento")}
                className="sortable"
              >
                Tipo {getSortIcon("tipo_movimiento")}
              </th>
              <th
                onClick={() => handleSort("tipo_cuenta")}
                className="sortable"
              >
                Cuenta {getSortIcon("tipo_cuenta")}
              </th>
              <th onClick={() => handleSort("moneda")} className="sortable">
                Moneda {getSortIcon("moneda")}
              </th>
              <th onClick={() => handleSort("monto")} className="sortable">
                Monto {getSortIcon("monto")}
              </th>
            </tr>
          </thead>
          <tbody>
            {currentMovimientos.length > 0 ? (
              currentMovimientos.map((movimiento) => (
                <tr key={movimiento.id}>
                  <td>{formatFecha(movimiento.fecha)}</td>
                  <td className="descripcion">{movimiento.descripcion}</td>
                  <td>
                    <span
                      className={`badge tipo-movimiento ${movimiento.tipo_movimiento}`}
                    >
                      {movimiento.tipo_movimiento === "ingreso"
                        ? "Ingreso"
                        : "Egreso"}
                    </span>
                  </td>
                  <td>
                    <span className="badge tipo-cuenta">
                      {movimiento.tipo_cuenta === "efectivo"
                        ? "Efectivo"
                        : movimiento.tipo_cuenta === "cuenta_debito" ||
                            movimiento.tipo_cuenta === "cuenta_débito"
                          ? "Cuenta Débito"
                          : movimiento.tipo_cuenta === "cuenta_credito" ||
                              movimiento.tipo_cuenta === "cuenta_crédito"
                            ? "Cuenta Crédito"
                            : movimiento.tipo_cuenta === "cuenta"
                              ? "Cuenta Débito" // Legacy
                              : movimiento.tipo_cuenta}
                    </span>
                  </td>
                  <td>
                    <span className={`badge moneda ${movimiento.moneda}`}>
                      {movimiento.moneda === "soles" ? "S/" : "US$"}
                    </span>
                  </td>
                  <td className="monto">
                    {formatMonto(movimiento.monto, movimiento.moneda)}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="6" className="empty-message">
                  No hay movimientos para mostrar
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Paginación */}
      {totalPages > 1 && (
        <div className="pagination">
          <button
            onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
            disabled={currentPage === 1}
            className="pagination-btn"
          >
            Anterior
          </button>

          <span className="pagination-info">
            Página {currentPage} de {totalPages}
          </span>

          <button
            onClick={() =>
              setCurrentPage((prev) => Math.min(prev + 1, totalPages))
            }
            disabled={currentPage === totalPages}
            className="pagination-btn"
          >
            Siguiente
          </button>
        </div>
      )}
    </div>
  );
};

export default ReportTable;
