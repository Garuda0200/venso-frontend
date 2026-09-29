import React, { useState, useEffect } from "react";
import { MdExpandMore, MdExpandLess, MdHistory } from "react-icons/md";
import VoucherReservaCard from "./VoucherReservaCard/VoucherReservaCard";
import { voucherReservaService } from "../../../../services/voucherReservaService";
import "./styles/PredecesoresExpanderReserva.scss";

const PredecesoresExpanderReserva = ({
  voucher,
  allVouchers = [],
  onAssignServices,
  onViewServicesSummary,
  onViewVoucher,
  userRole,
  onRefresh, // Callback para refrescar datos después de eliminar versión
}) => {
  const [displayPredecessors, setDisplayPredecessors] = useState(false);
  const [loadedPredecessors, setLoadedPredecessors] = useState([]);
  const [deletingVersion, setDeletingVersion] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isUsingLegacyData, setIsUsingLegacyData] = useState(false); // Bandera para saber si estamos usando datos legacy

  useEffect(() => {
    const loadArchivedVersions = async () => {
      if (!voucher?.id) {
        setLoadedPredecessors([]);
        setIsUsingLegacyData(false);
        return;
      }

      try {
        setLoading(true);
        // NUEVA IMPLEMENTACIÓN: Leer desde tabla dedicada de versiones archivadas
        const archivedVersions =
          await voucherReservaService.getArchivedVersions(voucher.id);

        console.log(" Versiones Archivadas Reserva (Nueva Tabla):", {
          voucherId: voucher.id,
          versionesArchivadas: archivedVersions.length,
          hayVersiones: archivedVersions.length > 0,
        });

        // Si hay versiones en la nueva tabla, usarlas
        if (archivedVersions && archivedVersions.length > 0) {
          setLoadedPredecessors(archivedVersions);
          setIsUsingLegacyData(false);
        } else {
          // FALLBACK: Si la nueva tabla está vacía, usar previous_versions (JSONB)
          console.log(
            " Nueva tabla vacía, usando fallback a previous_versions JSONB",
          );
          if (voucher?.previous_versions) {
            const previousVersions = Array.isArray(voucher.previous_versions)
              ? voucher.previous_versions
              : [];
            setLoadedPredecessors(previousVersions);
            setIsUsingLegacyData(true);
          } else {
            setLoadedPredecessors([]);
            setIsUsingLegacyData(false);
          }
        }
      } catch (error) {
        console.error(" Error al cargar versiones archivadas:", error);
        // FALLBACK: Si falla la nueva API, intentar con previous_versions (JSONB)
        if (voucher?.previous_versions) {
          const previousVersions = Array.isArray(voucher.previous_versions)
            ? voucher.previous_versions
            : [];
          setLoadedPredecessors(previousVersions);
          setIsUsingLegacyData(true);
        } else {
          setLoadedPredecessors([]);
          setIsUsingLegacyData(false);
        }
      } finally {
        setLoading(false);
      }
    };

    loadArchivedVersions();
  }, [voucher?.id]);

  // Si no hay predecesores, no mostrar nada
  if (!loadedPredecessors || loadedPredecessors.length === 0) {
    return null;
  }

  const isAdmin = userRole === 0;

  // Función para eliminar SOLO una versión archivada (no el voucher completo)
  const handleDeleteArchivedVersion = async (versionId, versionCode) => {
    if (!isAdmin) {
      alert(
        "Solo los superadministradores pueden eliminar versiones archivadas",
      );
      return;
    }

    // Si estamos usando datos legacy (JSONB), no podemos eliminar con el nuevo endpoint
    if (isUsingLegacyData) {
      alert(
        " Las versiones archivadas en formato legacy (JSONB) no se pueden eliminar individualmente.\n\nLas nuevas versiones archivadas (a partir de ahora) sí se podrán eliminar.",
      );
      return;
    }

    // Verificar que tenemos un ID numérico válido
    if (typeof versionId !== "number" || isNaN(versionId)) {
      console.error(
        " ID de versión inválido:",
        versionId,
        "tipo:",
        typeof versionId,
      );
      alert("Error: ID de versión inválido. No se puede eliminar.");
      return;
    }

    const confirmDelete = window.confirm(
      `¿Está seguro que desea eliminar la versión archivada "${versionCode || `#${versionId}`}"?\n\nEsta acción eliminará SOLO esta versión del historial, NO el voucher de reserva actual.`,
    );

    if (!confirmDelete) return;

    try {
      setDeletingVersion(versionId);

      console.log(
        ` [DELETE VERSION] Eliminando versión ID=${versionId} (tipo: ${typeof versionId})`,
      );
      await voucherReservaService.deleteArchivedVersion(voucher.id, versionId);

      // Actualizar estado local - filtrar por ID
      setLoadedPredecessors((prev) => prev.filter((v) => v.id !== versionId));

      // Refrescar datos si hay callback
      if (onRefresh) {
        onRefresh();
      }

      alert("Versión archivada eliminada exitosamente");
    } catch (error) {
      console.error(" Error eliminando versión archivada:", error);
      alert(`Error al eliminar versión: ${error.message}`);
    } finally {
      setDeletingVersion(null);
    }
  };

  // Extraer los datos del snapshot si existen
  const getVersionData = (version) => {
    return version.snapshot || version;
  };

  return (
    <div className="predecessors-expander-reserva">
      <button
        className="predecessors-toggle"
        onClick={() => setDisplayPredecessors(!displayPredecessors)}
        aria-expanded={displayPredecessors}
      >
        <MdHistory className="history-icon" />
        <span className="expander-label">
          Versiones Archivadas ({loadedPredecessors.length})
        </span>
        {displayPredecessors ? (
          <MdExpandLess className="expand-icon" />
        ) : (
          <MdExpandMore className="expand-icon" />
        )}
      </button>

      {displayPredecessors && loadedPredecessors.length > 0 && (
        <div className="predecessors-timeline">
          <div className="archive-notice">
            <MdHistory /> <strong>Historial de Versiones</strong> - Estas
            versiones fueron archivadas automáticamente al editar. El ID del
            voucher se mantiene igual.
          </div>
          <div className="archived-versions-list">
            {loadedPredecessors.map((version, index) => {
              const data = getVersionData(version);
              return (
                <div
                  key={version.id || `version-${index}`}
                  className="archived-version-card"
                >
                  <div className="archived-header">
                    <span className="archived-badge">
                      VERSIÓN #
                      {version.version_number ||
                        loadedPredecessors.length - index}
                    </span>
                    <span className="archived-date">
                      {new Date(
                        version.archived_at ||
                          data.updated_at ||
                          data.created_at,
                      ).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="archived-content">
                    <div className="archived-row">
                      <strong>Código:</strong>{" "}
                      {data.voucher_code || "Sin código"}
                    </div>
                    <div className="archived-row">
                      <strong>Estado:</strong> {data.status}
                    </div>
                    <div className="archived-row">
                      <strong>Servicios:</strong>{" "}
                      {data.assigned_itinerary?.servicios?.length || 0}{" "}
                      servicios asignados
                    </div>
                    {version.archive_note && (
                      <div className="archived-row">
                        <strong>Nota:</strong> {version.archive_note}
                      </div>
                    )}
                  </div>
                  <div className="archived-actions">
                    {onViewServicesSummary && (
                      <button
                        className="btn-archived-action"
                        onClick={() => onViewServicesSummary(data)}
                        title="Ver resumen de servicios"
                      ></button>
                    )}
                    {onViewVoucher && (
                      <button
                        className="btn-archived-action"
                        onClick={() => onViewVoucher(data)}
                        title="Ver voucher"
                      ></button>
                    )}
                    {/* SOLO SUPERADMIN (role 0) puede eliminar versiones archivadas */}
                    {isAdmin && !isUsingLegacyData && (
                      <button
                        className="btn-archived-delete"
                        onClick={() =>
                          handleDeleteArchivedVersion(
                            version.id,
                            data.voucher_code,
                          )
                        }
                        disabled={deletingVersion === version.id}
                        title="Eliminar esta versión archivada (Solo Superadmin)"
                      >
                        {deletingVersion === version.id ? "" : ""}
                      </button>
                    )}
                    {/* Indicador para datos legacy */}
                    {isAdmin && isUsingLegacyData && (
                      <span
                        className="legacy-indicator"
                        title="Versión legacy (JSONB) - No se puede eliminar individualmente"
                        style={{
                          color: "#999",
                          fontSize: "0.8em",
                          cursor: "help",
                        }}
                      >
                        Legacy
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default PredecesoresExpanderReserva;
