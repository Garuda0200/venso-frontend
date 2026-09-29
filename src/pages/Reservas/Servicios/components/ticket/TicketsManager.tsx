import React, { useState, useEffect, useMemo } from "react";
import {
  FaPlus,
  FaEdit,
  FaTrashAlt,
  FaFilter,
  FaChevronDown,
  FaChevronRight,
  FaTicketAlt,
  FaSortAmountDown,
  FaGlobe,
  FaUserFriends,
  FaSearch,
} from "react-icons/fa";
import {
  fetchTicketsWithTarifas,
  createTicket,
  updateTicket,
  deleteTicket,
  getTicketDependencies,
  fetchProtectedServiceUsage,
} from "../../services/api";
import Modal from "../Modal";
import TicketForm from "./TicketForm";
import DeleteConfirmation from "../DeleteConfirmation";
import TarifasCellRenderer from "../tarifa/TarifasCellRenderer";
import useAuditInfo from "../../hooks/useAuditInfo";
import TarifaFilterPanel from "../common/TarifaFilterPanel";
import {
  annotateProtectedRecords,
  buildProtectedQueryItems,
  getProtectedDeleteTitle,
} from "../../utils/serviceProtection";
import "./TicketStyles.scss";

const TicketsManager = () => {
  // Estado único para datos normalizados
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [procedenciaFilter, setProcedenciaFilter] = useState("");
  const [tipoUsuarioFilter, setTipoUsuarioFilter] = useState("");
  const [tipoTarifaFilter, setTipoTarifaFilter] = useState([]);
  const [viewMode, setViewMode] = useState("grouped"); // 'grouped' or 'list'
  const [showFilters, setShowFilters] = useState(true);

  // Track expanded groups
  const [expandedGroups, setExpandedGroups] = useState({});

  // Estados para modales
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const [selectedTicket, setSelectedTicket] = useState(null);
  const [dependentEntities, setDependentEntities] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Obtener información de auditoría
  const { userId } = useAuditInfo();

  // Cargar tickets
  useEffect(() => {
    loadTickets();
  }, []);

  const loadTickets = async () => {
    try {
      setLoading(true);
      setError(null);

      // Cargamos directamente con tarifas
      const withTarifasData = await fetchTicketsWithTarifas();

      // Normalizar datos
      const normalizedData = withTarifasData.map((item) => {
        const ticketInfo = item.ticket || item.tickets || item || {};
        return {
          ...ticketInfo,
          tarifas: item.tarifas || ticketInfo.tarifas || [],
        };
      });

      const allTarifas = normalizedData.flatMap((ticket) => ticket.tarifas || []);
      const [protectedUsage, protectedTarifaUsage] = await Promise.all([
        fetchProtectedServiceUsage(
          buildProtectedQueryItems(
            normalizedData,
            "tickets",
            (ticket) => ticket.id_ticket,
          ),
        ),
        fetchProtectedServiceUsage(
          buildProtectedQueryItems(
            allTarifas,
            "tarifa",
            (tarifa) => tarifa.id_tarifa,
          ),
        ),
      ]);
      const protectedData = annotateProtectedRecords(
        normalizedData,
        protectedUsage,
        "tickets",
        (ticket) => ticket.id_ticket,
      ).map((ticket) => ({
        ...ticket,
        tarifas: annotateProtectedRecords(
          ticket.tarifas || [],
          protectedTarifaUsage,
          "tarifa",
          (tarifa) => tarifa.id_tarifa,
        ),
      }));

      setData(protectedData);

      // Initialize expanded state for all entrada groups
      const entradas = [...new Set(protectedData.map((t) => t.entrada))];
      const initialExpandedState = {};
      entradas.forEach((entrada) => {
        initialExpandedState[entrada] = true; // Start expanded
      });
      setExpandedGroups(initialExpandedState);

      setLoading(false);
    } catch (err) {
      setError("Error al cargar los tickets: " + err.message);
      setLoading(false);
    }
  };

  // Extraer procedencias y tipos de usuario únicos para filtrado
  const procedenciasUnicas = useMemo(() => {
    const procedencias = new Set();
    data.forEach((ticket) => {
      if (ticket.procedencia) {
        procedencias.add(ticket.procedencia);
      }
    });
    return Array.from(procedencias).sort();
  }, [data]);

  const tiposUsuarioUnicos = useMemo(() => {
    const tipos = new Set();
    data.forEach((ticket) => {
      if (ticket.tipo_usuario) {
        tipos.add(ticket.tipo_usuario);
      }
    });
    return Array.from(tipos).sort();
  }, [data]);

  // Filtrar datos
  const filteredData = useMemo(() => {
    // 1. Mapeamos los datos para incluir solo las tarifas filtradas si es necesario
    const processed = data.map((ticket) => ({
      ...ticket,
      tarifasFiltradas:
        tipoTarifaFilter.length > 0
          ? (ticket.tarifas || []).filter((t) =>
              tipoTarifaFilter.includes(t.tipo_tarifa),
            )
          : ticket.tarifas || [],
    }));

    return processed.filter((ticket) => {
      // Búsqueda
      const matchesSearch =
        !searchTerm ||
        (ticket.entrada || "")
          .toLowerCase()
          .includes(searchTerm.toLowerCase()) ||
        (ticket.procedencia || "")
          .toLowerCase()
          .includes(searchTerm.toLowerCase()) ||
        (ticket.tipo_usuario || "")
          .toLowerCase()
          .includes(searchTerm.toLowerCase());

      // Procedencia
      const matchesProc =
        !procedenciaFilter || ticket.procedencia === procedenciaFilter;

      // Tipo Usuario
      const matchesUser =
        !tipoUsuarioFilter || ticket.tipo_usuario === tipoUsuarioFilter;

      // Tipo Tarifa: Si hay filtro activo, solo mostramos si tiene al menos una tarifa filtrada
      const matchesTarifa =
        tipoTarifaFilter.length === 0 || ticket.tarifasFiltradas.length > 0;

      return matchesSearch && matchesProc && matchesUser && matchesTarifa;
    });
  }, [
    data,
    searchTerm,
    procedenciaFilter,
    tipoUsuarioFilter,
    tipoTarifaFilter,
  ]);

  // Cálculo de total de tarifas filtradas para la barra de acciones masivas

  const hasActiveFilters = () => {
    return (
      searchTerm !== "" ||
      procedenciaFilter !== "" ||
      tipoUsuarioFilter !== "" ||
      tipoTarifaFilter.length > 0
    );
  };

  // Group tickets by entrada
  const groupedTickets = useMemo(() => {
    const groups = {};
    filteredData.forEach((ticket) => {
      if (!groups[ticket.entrada]) {
        groups[ticket.entrada] = [];
      }
      groups[ticket.entrada].push(ticket);
    });

    return Object.entries(groups).map(([entrada, tickets]) => ({
      entrada,
      tickets,
      count: tickets.length,
      hasEstudiantes: tickets.some((t) => t.tipo_usuario === "estudiante"),
    }));
  }, [filteredData]);

  // Limpiar todos los filtros
  const clearFilters = () => {
    setSearchTerm("");
    setProcedenciaFilter("");
    setTipoUsuarioFilter("");
    setTipoTarifaFilter([]);
  };

  // Toggle expanded state for a group
  const toggleGroup = (entrada) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [entrada]: !prev[entrada],
    }));
  };

  const toggleAllGroups = (expand) => {
    const newState = {};
    Object.keys(expandedGroups).forEach((entrada) => {
      newState[entrada] = expand;
    });
    setExpandedGroups(newState);
  };

  // Handlers para CRUD
  const handleCreate = async (formData) => {
    try {
      setIsSubmitting(true);
      await createTicket({ ...formData, created_by: userId });
      setShowCreateModal(false);
      await loadTickets();
    } catch (error) {
      setError("Error al crear ticket: " + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (ticket) => {
    setSelectedTicket(ticket);
    setShowEditModal(true);
  };

  const handleUpdate = async (formData) => {
    try {
      if (!formData) {
        setShowEditModal(false);
        return;
      }
      setIsSubmitting(true);
      await updateTicket(selectedTicket.id_ticket, {
        ...formData,
        updated_by: userId,
      });
      setShowEditModal(false);
      await loadTickets();
    } catch (error) {
      setError("Error al actualizar ticket: " + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteClick = async (ticket) => {
    if (ticket?.is_protected_by_voucher) return;
    setSelectedTicket(ticket);
    setIsSubmitting(true);
    try {
      const dependencies = await getTicketDependencies(ticket.id_ticket);
      setDependentEntities(dependencies);
      setShowDeleteModal(true);
    } catch (error) {
      setError("Error al consultar dependencias: " + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    try {
      setIsSubmitting(true);
      await deleteTicket(selectedTicket.id_ticket);
      setShowDeleteModal(false);
      await loadTickets();
    } catch (error) {
      setError("Error al eliminar ticket: " + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };


  const handleQuickAddVariant = (entrada) => {
    const existing = data.filter((t) => t.entrada === entrada);
    const student = existing.find((t) => t.tipo_usuario === "estudiante");
    const baseTicket = {
      entrada,
      procedencia: "",
      tipo_usuario: "",
      estado: "disponible",
      isVariantCreation: true,
    };
    if (student && student.edad_estudiante_min !== null) {
      baseTicket.existingStudentAgeRange = {
        min: student.edad_estudiante_min,
        max: student.edad_estudiante_max,
      };
    }
    setSelectedTicket(baseTicket);
    setShowCreateModal(true);
  };

  // Render helpers
  const renderTipoUsuarioBadge = (ticket) => {
    const { tipo_usuario, edad_estudiante_min, edad_estudiante_max } = ticket;
    let badgeClass = "badge info";
    if (tipo_usuario.toLowerCase() === "adulto") badgeClass = "badge primary";

    if (
      tipo_usuario.toLowerCase() === "estudiante" &&
      edad_estudiante_min !== null
    ) {
      return (
        <div className="usuario-badge-group">
          <span className={badgeClass}>{tipo_usuario}</span>
          <small className="age-range">
            ({edad_estudiante_min}-{edad_estudiante_max} años)
          </small>
        </div>
      );
    }
    return <span className={badgeClass}>{tipo_usuario}</span>;
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>Cargando tickets...</p>
      </div>
    );
  }

  return (
    <div className="entity-view-container premium-design">
      {/* Header Premium */}
      <div className="header-dashboard no-back">
        <div className="header-main-info">
          <div className="header-title-group">
            <div className="title-icon-wrapper">
              <FaTicketAlt className="title-icon-main" />
            </div>
            <div className="title-text-group">
              <h2 className="main-title">Gestión de Tickets</h2>
              <p className="sub-title">
                Configura entradas, procedencias y tipos de usuarios
              </p>
            </div>
          </div>
        </div>

        <div className="header-actions-group">
          <button
            className="premium-btn secondary"
            onClick={() =>
              setViewMode(viewMode === "grouped" ? "list" : "grouped")
            }
          >
            <FaSortAmountDown />{" "}
            <span>
              {viewMode === "grouped" ? "Vista Lista" : "Vista Agrupada"}
            </span>
          </button>
          <button
            className={`premium-btn secondary ${showFilters ? "active" : ""}`}
            onClick={() => setShowFilters(true)}
          >
            <FaFilter /> <span>Filtros</span>
            {hasActiveFilters() && <span className="filter-dot"></span>}
          </button>
          <button
            className="premium-btn primary"
            onClick={() => {
              setSelectedTicket(null);
              setShowCreateModal(true);
            }}
          >
            <FaPlus /> <span>Nuevo Ticket</span>
          </button>
        </div>
      </div>

      {error && <div className="premium-alert danger">{error}</div>}

      {/* Panel de Filtros Moderno */}
      <div className={`filters-wrapper ${showFilters ? "show" : ""}`}>
        <div className="filters-glass-panel">
          <div className="filters-row">
            <div className="search-bar-modern">
              <FaSearch className="search-icon" />
              <input
                type="text"
                placeholder="Buscar por entrada, procedencia o tipo..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              {searchTerm && (
                <button
                  className="search-clear"
                  onClick={() => setSearchTerm("")}
                >
                  &times;
                </button>
              )}
            </div>

            <div className="select-filters-group">
              <div className="filter-select-wrapper">
                <FaGlobe className="select-icon" />
                <select
                  value={procedenciaFilter}
                  onChange={(e) => setProcedenciaFilter(e.target.value)}
                >
                  <option value="">Todas las procedencias</option>
                  {procedenciasUnicas.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>

              <div className="filter-select-wrapper">
                <FaUserFriends className="select-icon" />
                <select
                  value={tipoUsuarioFilter}
                  onChange={(e) => setTipoUsuarioFilter(e.target.value)}
                >
                  <option value="">Todos los tipos de usuario</option>
                  {tiposUsuarioUnicos.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <TarifaFilterPanel
            tipoTarifaFilter={tipoTarifaFilter}
            onChange={setTipoTarifaFilter}
            onClear={() => setTipoTarifaFilter([])}
            label="Tipos de Tarifa"
          />
        </div>
      </div>

      {/* Barra de Acciones Masivas */}


      {/* Vistas (Agrupada o Lista) */}
      <div className="tickets-view-container">
        {viewMode === "grouped" ? (
          <div className="tickets-grouped-view">
            <div className="grouped-controls">
              <button
                className="premium-btn secondary-outline sm"
                onClick={() =>
                  toggleAllGroups(Object.values(expandedGroups).some((v) => !v))
                }
              >
                {Object.values(expandedGroups).some((v) => !v)
                  ? "Expandir Todos"
                  : "Contraer Todos"}
              </button>
            </div>

            {groupedTickets.map((group) => (
              <div
                key={group.entrada}
                className={`ticket-group-card ${expandedGroups[group.entrada] ? "expanded" : ""}`}
              >
                <div
                  className="group-header"
                  onClick={() => toggleGroup(group.entrada)}
                >
                  <div className="group-info">
                    <FaTicketAlt className="group-icon" />
                    <div>
                      <h3 className="group-title">{group.entrada}</h3>
                      <span className="group-count">
                        {group.count} variantes disponibles
                      </span>
                    </div>
                  </div>
                  <div className="group-actions">
                    <button
                      className="action-btn-add"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleQuickAddVariant(group.entrada);
                      }}
                    >
                      <FaPlus /> Variante
                    </button>
                    <div className="toggle-icon">
                      {expandedGroups[group.entrada] ? (
                        <FaChevronDown />
                      ) : (
                        <FaChevronRight />
                      )}
                    </div>
                  </div>
                </div>

                {expandedGroups[group.entrada] && (
                  <div className="group-content">
                    <table className="premium-table">
                      <thead>
                        <tr>
                          <th>Procedencia</th>
                          <th>Tipo Usuario</th>
                          <th>Tarifas</th>
                          <th className="text-right">Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.tickets.map((ticket) => (
                          <tr key={ticket.id_ticket} className="premium-row">
                            <td>
                              <span className="badge secondary">
                                {ticket.procedencia}
                              </span>
                            </td>
                            <td>{renderTipoUsuarioBadge(ticket)}</td>
                            <td>
                              <TarifasCellRenderer
                                tarifas={ticket.tarifasFiltradas}
                                serviceId={ticket.id_ticket}
                                serviceType="tickets"
                                allTarifas={ticket.tarifas}
                                onTarifasUpdated={loadTickets}
                              />
                            </td>
                            <td>
                              <div className="premium-actions">
                                <button
                                  className="action-btn edit"
                                  onClick={() => handleEdit(ticket)}
                                  title="Editar"
                                >
                                  <FaEdit />
                                </button>
                                <button
                                  className={`action-btn delete ${ticket.is_protected_by_voucher ? "disabled" : ""}`}
                                  onClick={() => handleDeleteClick(ticket)}
                                  disabled={ticket.is_protected_by_voucher}
                                  title={getProtectedDeleteTitle(ticket)}
                                >
                                  <FaTrashAlt />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="content-card">
            <div className="table-responsive-modern">
              <table className="premium-table">
                <thead>
                  <tr>
                    <th>Entrada</th>
                    <th>Procedencia</th>
                    <th>Tipo Usuario</th>
                    <th>Tarifas</th>
                    <th className="text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredData.map((ticket) => (
                    <tr key={ticket.id_ticket} className="premium-row">
                      <td className="font-bold">{ticket.entrada}</td>
                      <td>
                        <span className="badge secondary">
                          {ticket.procedencia}
                        </span>
                      </td>
                      <td>{renderTipoUsuarioBadge(ticket)}</td>
                      <td>
                        <TarifasCellRenderer
                          tarifas={ticket.tarifasFiltradas}
                          serviceId={ticket.id_ticket}
                          serviceType="tickets"
                          allTarifas={ticket.tarifas}
                          onTarifasUpdated={loadTickets}
                        />
                      </td>
                      <td>
                        <div className="premium-actions">
                          <button
                            className="action-btn edit"
                            onClick={() => handleEdit(ticket)}
                            title="Editar"
                          >
                            <FaEdit />
                          </button>
                          <button
                            className={`action-btn delete ${ticket.is_protected_by_voucher ? "disabled" : ""}`}
                            onClick={() => handleDeleteClick(ticket)}
                            disabled={ticket.is_protected_by_voucher}
                            title={getProtectedDeleteTitle(ticket)}
                          >
                            <FaTrashAlt />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Modales */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title={
          selectedTicket?.isVariantCreation
            ? `Nueva variante: ${selectedTicket.entrada}`
            : "Crear Nuevo Ticket"
        }
      >
        <TicketForm
          ticket={selectedTicket}
          onSubmit={handleCreate}
          isSubmitting={isSubmitting}
        />
      </Modal>

      <Modal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        title="Editar Ticket"
      >
        <TicketForm
          ticket={selectedTicket}
          onSubmit={handleUpdate}
          isSubmitting={isSubmitting}
        />
      </Modal>

      <Modal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Eliminar Ticket"
        size="small"
      >
        <DeleteConfirmation
          entityName="este ticket"
          entityData={selectedTicket}
          dependentEntities={dependentEntities}
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteModal(false)}
          isDeleting={isSubmitting}
        />
      </Modal>


    </div>
  );
};

export default TicketsManager;
