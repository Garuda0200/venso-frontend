import React, { useEffect, useMemo, useState } from "react";
import {
  FaCalendarAlt,
  FaCheckCircle,
  FaExchangeAlt,
  FaExclamationTriangle,
  FaSnowflake,
  FaSun,
  FaTrashAlt,
  FaUserTie,
  FaUsers,
} from "react-icons/fa";
import { formatCurrency } from "../../utils/formatters";
import {
  createTarifa,
  deleteTarifa,
  getServiciosAgencyScope,
  updateTarifa,
} from "../../services/api";
import useAuditInfo from "../../hooks/useAuditInfo";
import { getProtectedDeleteTitle } from "../../utils/serviceProtection";
import Modal from "../Modal";
import DeleteConfirmation from "../DeleteConfirmation";
import TarifaClonePopover from "./TarifaClonePopover";
import TarifaFormPopover from "./TarifaFormPopover";
import "./TarifasCellRenderer.scss";

/**
 * Gestor compacto de tarifas embebido en la columna de cada servicio.
 *
 * Toda la operación de tarifas se concentra aquí: crear, duplicar, editar y
 * eliminar. De esta forma las listas de servicios ya no necesitan un segundo
 * display ni un modal global adicional.
 */
const TarifasCellRenderer = ({
  tarifas,
  serviceId,
  serviceType,
  allTarifas,
  onTarifasUpdated,
}) => {
  const { userId } = useAuditInfo();
  const [deletingTarifa, setDeletingTarifa] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<any>(null);

  const rows = useMemo(
    () => (Array.isArray(tarifas) ? tarifas : []),
    [tarifas],
  );
  const existingTarifas = useMemo(
    () => (Array.isArray(allTarifas) ? allTarifas : rows),
    [allTarifas, rows],
  );
  const canManage = Boolean(serviceId && serviceType && onTarifasUpdated);
  const activeAgencyId = Number(getServiciosAgencyScope() || 0) || null;

  const grouped = useMemo(
    () =>
      rows.reduce((acc, tarifa) => {
        const key = tarifa.tipo_tarifa || "sin_tipo";
        (acc[key] = acc[key] || []).push(tarifa);
        return acc;
      }, {}),
    [rows],
  );

  useEffect(() => {
    if (!feedback) return undefined;
    const timer = window.setTimeout(() => setFeedback(null), 2800);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  const refreshParent = async (message) => {
    await onTarifasUpdated?.();
    setFeedback({ type: "success", message });
  };

  const handleCreate = async (formData) => {
    setIsSubmitting(true);
    setFeedback(null);
    try {
      await createTarifa({
        ...formData,
        id_servicio: serviceId,
        tipo_servicio: serviceType,
        created_by: userId,
      });
      await refreshParent("Tarifa agregada.");
    } catch (error) {
      setFeedback({
        type: "error",
        message: error?.message || "No se pudo agregar la tarifa.",
      });
      throw error;
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdate = async (tarifa, formData) => {
    if (!tarifa?.id_tarifa) return;

    setIsSubmitting(true);
    setFeedback(null);
    try {
      await updateTarifa(tarifa.id_tarifa, {
        ...formData,
        updated_by: userId,
      });
      await refreshParent("Tarifa actualizada.");
    } catch (error) {
      setFeedback({
        type: "error",
        message: error?.message || "No se pudo actualizar la tarifa.",
      });
      throw error;
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingTarifa?.id_tarifa) return;

    setIsSubmitting(true);
    setFeedback(null);
    try {
      await deleteTarifa(deletingTarifa.id_tarifa);
      setDeletingTarifa(null);
      await refreshParent("Tarifa eliminada.");
    } catch (error) {
      setFeedback({
        type: "error",
        message: error?.message || "No se pudo eliminar la tarifa.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClone = async (formData) => {
    setIsSubmitting(true);
    setFeedback(null);
    try {
      await createTarifa({
        ...formData,
        id_servicio: serviceId,
        tipo_servicio: serviceType,
        created_by: userId,
      });
      await refreshParent("Tarifa duplicada.");
    } catch (error) {
      setFeedback({
        type: "error",
        message: error?.message || "No se pudo duplicar la tarifa.",
      });
      throw error;
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderTarifa = (tarifa) => {
    const isProtected = Boolean(tarifa.is_protected_by_voucher);
    const symbol = tarifa.moneda === "soles" ? "S/" : "$";
    const tempLabel = tarifa.tiene_temporada ? tarifa.temporada : "std";
    const sharedPrice = Number.parseFloat(tarifa.precio_compartido);
    const privatePrice = tarifa.precio_unico
      ? sharedPrice
      : Number.parseFloat(tarifa.precio_privado);
    const minPrice = Math.min(sharedPrice, privatePrice);
    const maxPrice = Math.max(sharedPrice, privatePrice);
    const exchangeRate =
      tarifa.moneda === "soles" && tarifa.tasa_cambio
        ? Number.parseFloat(tarifa.tasa_cambio).toFixed(2)
        : null;
    const legacy = tarifa.tipo_tarifa === "cotizacion";

    return (
      <div
        className={`cell-tarifa-item${isProtected ? " protected" : ""}`}
        key={tarifa.id_tarifa}
      >
        <div className="cell-badges">
          <span className="cell-badge year" title="Año de tarifa">
            {tarifa.anio || new Date().getFullYear()}
          </span>
          <span className="cell-badge agencies" title="Agencias vinculadas">
            {Array.isArray(tarifa.agency_ids) ? tarifa.agency_ids.length : 0} ag.
          </span>
          <span
            className={`cell-badge temp ${tempLabel}`}
            title={`Temporada: ${tempLabel}`}
          >
            {tarifa.tiene_temporada ? (
              tarifa.temporada === "alta" ? (
                <FaSun />
              ) : (
                <FaSnowflake />
              )
            ) : (
              <FaCalendarAlt />
            )}
            <span>{tempLabel.substring(0, 3)}</span>
          </span>

          <span className={`cell-badge moneda ${tarifa.moneda}`}>{symbol}</span>

          {exchangeRate && (
            <span
              className="cell-badge tasa"
              title={`TC: 1 USD = S/ ${exchangeRate}`}
            >
              <FaExchangeAlt />
              <span>{exchangeRate}</span>
            </span>
          )}
        </div>

        <div className="cell-precio">
          <span className={tarifa.precio_unico ? "precio-single" : "precio-range"}>
            {tarifa.precio_unico
              ? formatCurrency(minPrice, symbol)
              : `${formatCurrency(minPrice, symbol)} - ${formatCurrency(maxPrice, symbol)}`}
          </span>
        </div>

        <div className="cell-tarifa-actions" onClick={(event) => event.stopPropagation()}>
          {!legacy && canManage && (
            <TarifaClonePopover
              sourceTarifa={{
                ...tarifa,
                id_servicio: tarifa.id_servicio || serviceId,
                tipo_servicio: tarifa.tipo_servicio || serviceType,
              }}
              existingTarifas={existingTarifas}
              onClone={handleClone}
              disabled={isSubmitting}
              buttonClassName="cell-tarifa-action clone"
              buttonTitle="Duplicar tarifa"
            />
          )}
          <TarifaFormPopover
            tarifa={tarifa}
            serviceId={serviceId}
            serviceType={serviceType}
            agencyId={Number(tarifa.agency_ids?.[0] || activeAgencyId || 0) || null}
            existingTarifas={existingTarifas.filter(
              (item) => item.id_tarifa !== tarifa.id_tarifa,
            )}
            onSubmit={(formData) => handleUpdate(tarifa, formData)}
            disabled={!canManage}
            isSubmitting={isSubmitting}
            triggerClassName="cell-tarifa-action edit"
            triggerTitle="Editar tarifa"
          />
          <button
            type="button"
            className="cell-tarifa-action delete"
            disabled={!canManage || isSubmitting || isProtected}
            onClick={() => {
              if (!isProtected) setDeletingTarifa(tarifa);
            }}
            title={getProtectedDeleteTitle(tarifa)}
            aria-label="Eliminar tarifa"
          >
            <FaTrashAlt />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="cell-tarifas-manager">
      <div className="cell-tarifas-toolbar">
        <span>
          Tarifas <b>{rows.length}</b>
        </span>
        <TarifaFormPopover
          serviceId={serviceId}
          serviceType={serviceType}
          agencyId={activeAgencyId}
          existingTarifas={existingTarifas}
          onSubmit={handleCreate}
          disabled={!canManage}
          isSubmitting={isSubmitting}
          triggerClassName="cell-add-tarifa"
          triggerLabel="Agregar"
          triggerTitle="Agregar tarifa"
        />
      </div>

      {feedback && (
        <div className={`cell-tarifa-feedback ${feedback.type}`}>
          {feedback.type === "success" ? (
            <FaCheckCircle />
          ) : (
            <FaExclamationTriangle />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="cell-no-tarifas">
          <span>Sin tarifas configuradas</span>
          <TarifaFormPopover
            serviceId={serviceId}
            serviceType={serviceType}
            agencyId={activeAgencyId}
            existingTarifas={existingTarifas}
            onSubmit={handleCreate}
            disabled={!canManage}
            isSubmitting={isSubmitting}
            triggerClassName="cell-create-tarifa"
            triggerLabel="Crear tarifa"
            triggerTitle="Crear tarifa"
          />
        </div>
      ) : (
        <div className="cell-tarifas-wrapper">
          {Object.entries(grouped).map(([tipo, lista]: any) => (
            <div key={tipo} className="cell-tipo-group">
              <div className={`cell-tipo-header ${tipo}`}>
                {tipo === "interna" ? <FaUserTie /> : <FaUsers />}
                <span>
                  {tipo === "interna"
                    ? "Confidencial"
                    : tipo === "externa"
                      ? "Pública"
                      : "Heredada"}
                </span>
              </div>
              <div className="cell-tipo-items">{lista.map(renderTarifa)}</div>
            </div>
          ))}
        </div>
      )}

      <Modal
        isOpen={Boolean(deletingTarifa)}
        onClose={() => setDeletingTarifa(null)}
        title="Eliminar tarifa"
        size="small"
        closeOnOverlayClick={false}
      >
        <DeleteConfirmation
          entityName="esta tarifa"
          entityData={
            deletingTarifa
              ? {
                  visibilidad:
                    deletingTarifa.tipo_tarifa === "interna"
                      ? "Confidencial"
                      : "Pública",
                  temporada: deletingTarifa.tiene_temporada
                    ? deletingTarifa.temporada
                    : "Estándar",
                  moneda: deletingTarifa.moneda,
                  precio: deletingTarifa.precio_compartido,
                }
              : null
          }
          onConfirm={handleDelete}
          onCancel={() => setDeletingTarifa(null)}
          isDeleting={isSubmitting}
        />
      </Modal>
    </div>
  );
};

export default TarifasCellRenderer;
