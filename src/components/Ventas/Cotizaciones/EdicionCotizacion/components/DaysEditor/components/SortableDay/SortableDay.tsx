// components/SortableDay.jsx
import React, { useState, useEffect, useRef } from "react";
import {
  MdDragIndicator,
  MdClose,
  MdDelete,
  MdModeEdit,
  MdCheck,
  MdLocationCity,
  MdWarning,
} from "react-icons/md";
import { FaMapMarkerAlt } from "react-icons/fa";

import { useSortable } from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";

import "./SortableDay.scss";
import SmartComboBox from "../../../../../../../common/SmartComboBox/SmartComboBox";

const SortableDay = React.memo(({
  day,
  dayIndex,
  children,
  handleTitleChange,
  handleCiudadesChange,
  addCiudad,
  removeCiudad,
  openCiudadesModal,
  expandedDay,
  toggleDayExpand,
  handleDeleteDay,
  dayTitles = [],
  dayTitlesLoading = false,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: day.id || `day-${day.numero}`,
    data: {
      type: "day",
      day,
      dayIndex,
    },
  });

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleInputValue, setTitleInputValue] = useState(day.titulo || "");
  const [showDeletePopover, setShowDeletePopover] = useState(false);
  const deletePopoverRef = useRef(null);

  const handleTitleSave = () => {
    handleTitleChange(dayIndex, titleInputValue);
    setIsEditingTitle(false);
  };

  const handleTitleCancel = () => {
    setTitleInputValue(day.titulo || "");
    setIsEditingTitle(false);
  };

  const handleTitleKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleTitleSave();
    } else if (e.key === "Escape") {
      handleTitleCancel();
    }
  };

  // Close popover on outside click
  useEffect(() => {
    if (!showDeletePopover) return;
    const handleClickOutside = (e) => {
      if (
        deletePopoverRef.current &&
        !deletePopoverRef.current.contains(e.target)
      ) {
        setShowDeletePopover(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showDeletePopover]);

  // Sync title when day data changes externally
  useEffect(() => {
    if (!isEditingTitle) {
      setTitleInputValue(day.titulo || "");
    }
  }, [day.titulo, isEditingTitle]);

  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: `day-drop-${day.id || dayIndex}`,
    data: {
      type: "day",
      dayIndex,
      accepts: ["service"],
    },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: "relative",
    zIndex: isDragging ? 1000 : isEditingTitle ? 120 : 1,
  };

  const serviceCount = day.servicios ? day.servicios.length : 0;
  const hasCiudades = day.ciudades && day.ciudades.length > 0;
  const hasTitle = day.titulo && day.titulo.trim().length > 0;

  return (
    <div ref={setNodeRef} style={style}>
      <div
        ref={setDroppableRef}
        className={`day-card ${isDragging ? "dragging" : ""} ${isOver ? "drop-active" : ""} ${isEditingTitle ? "title-editing" : ""} expanded`}
      >
        {/* ── Top bar: drag + badge + quick info + delete ── */}
        <div className="day-topbar">
          <div
            className="day-drag-handle"
            {...attributes}
            {...listeners}
            onClick={(e) => e.stopPropagation()}
          >
            <MdDragIndicator className="drag-icon" />
          </div>

          <div className="day-badge">Día {day.numero}</div>

          {/* ── Inline title area ── */}
          <div
            className="day-title-area"
            onClick={(e) => {
              if (!isEditingTitle) e.stopPropagation();
            }}
          >
            {isEditingTitle ? (
              <div className="day-title-edit-mode">
                <SmartComboBox
                  value={titleInputValue}
                  onChange={(value) => setTitleInputValue(value)}
                  options={dayTitles}
                  loading={dayTitlesLoading}
                  placeholder="Ej: Valle Sagrado, City Tour Cusco..."
                  onKeyDown={handleTitleKeyDown}
                  onClick={(e) => e.stopPropagation()}
                  className="day-title-input"
                  multiline
                  autoFocus
                  portalDropdown
                />
                <div className="day-title-edit-actions">
                  <button
                    className="save-title-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleTitleSave();
                    }}
                    title="Guardar (Enter)"
                  >
                    <MdCheck />
                  </button>
                  <button
                    className="cancel-title-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleTitleCancel();
                    }}
                    title="Cancelar (Esc)"
                  >
                    <MdClose />
                  </button>
                </div>
              </div>
            ) : (
              <div
                className="day-title-display"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsEditingTitle(true);
                }}
              >
                <MdModeEdit className="edit-hint-icon" />
                <span className={`day-title ${!hasTitle ? "placeholder" : ""}`}>
                  {hasTitle ? day.titulo : "Clic para agregar título..."}
                </span>
              </div>
            )}
          </div>

          {/* ── Ciudad pills inline ── */}
          <div
            className="day-ciudades-inline"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="ciudades-inline-label">
              <FaMapMarkerAlt className="ciudad-icon" />
              <span>Ciudades</span>
            </span>
            {hasCiudades ? (
              <div className="ciudad-tags-list">
                {day.ciudades.map((ciudad, index) => (
                  <span key={`${ciudad}-${index}`} className="ciudad-tag">
                    <span className="ciudad-tag__text">{ciudad}</span>
                    <button
                      type="button"
                      className="remove-ciudad-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeCiudad(dayIndex, index);
                      }}
                      title={`Quitar ${ciudad}`}
                    >
                      <MdClose size={12} />
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <span className="no-ciudades">Sin ciudad</span>
            )}
            <button
              type="button"
              className="add-ciudad-btn"
              onClick={(e) => {
                e.stopPropagation();
                openCiudadesModal(dayIndex);
              }}
              title="Seleccionar ciudades"
            >
              <MdLocationCity size={14} />
              <span>Ciudad</span>
            </button>
          </div>

          {/* ── Right: meta + actions ── */}
          <div className="day-right-actions">
            {serviceCount > 0 && (
              <span className="service-count-badge">
                {serviceCount} servicio{serviceCount !== 1 ? "s" : ""}
              </span>
            )}
            <div className="delete-day-wrapper" ref={deletePopoverRef}>
              <button
                className={`delete-day-btn ${showDeletePopover ? "active" : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setShowDeletePopover(!showDeletePopover);
                }}
                title="Eliminar día"
              >
                <MdDelete />
              </button>
              {showDeletePopover && (
                <div className="delete-day-popover">
                  <div className="delete-day-popover__header">
                    <MdWarning className="delete-day-popover__icon" />
                    <span>?Eliminar Día {day.numero}?</span>
                  </div>
                  <p className="delete-day-popover__text">
                    Se eliminarán {serviceCount} servicio
                    {serviceCount !== 1 ? "s" : ""}.
                  </p>
                  <div className="delete-day-popover__actions">
                    <button
                      className="delete-day-popover__cancel"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowDeletePopover(false);
                      }}
                    >
                      Cancelar
                    </button>
                    <button
                      className="delete-day-popover__confirm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowDeletePopover(false);
                        handleDeleteDay(dayIndex);
                      }}
                    >
                      <MdDelete /> Eliminar
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Always-expanded content ── */}
        {children && <div className="day-content">{children}</div>}
      </div>
    </div>
  );
});

SortableDay.displayName = "SortableDay";

export default SortableDay;
