/**
 * Hook para manejar borradores de cotizaciones en localStorage
 * Guarda automáticamente el estado de cotizaciones no guardadas
 */

import { useCallback, useEffect, useRef } from "react";

export const DRAFTS_KEY = "cotizacion_drafts";
export const DRAFTS_CHANGED_EVENT = "venso:cotizacion-drafts-changed";

const notifyDraftsChanged = () => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(DRAFTS_CHANGED_EVENT));
  }
};
const AUTO_SAVE_DELAY = 3000; // 3 segundos de debounce
const MAX_DRAFTS = 5; // Máximo de borradores guardados

/**
 * Genera una clave única para identificar un borrador
 * @param {Object|null} editingCotizacion - Cotización en edición (null si es nueva)
 * @returns {string} Clave única del borrador
 */
export const generateDraftKey = (editingCotizacion) => {
  if (editingCotizacion?.id) {
    return `edit_${editingCotizacion.id}`;
  }
  // Para nuevas cotizaciones, usamos un timestamp único que se genera una vez
  return `new_${Date.now()}`;
};

/**
 * Obtiene todos los borradores guardados
 * @returns {Array} Lista de borradores
 */
export const getAllDrafts = () => {
  try {
    const draftsJson = localStorage.getItem(DRAFTS_KEY);
    if (!draftsJson) return [];
    const drafts = JSON.parse(draftsJson);
    return Array.isArray(drafts)
      ? drafts.sort(
          (a, b) =>
            new Date(b?.lastModified || 0).getTime() -
            new Date(a?.lastModified || 0).getTime(),
        )
      : [];
  } catch (error) {
    console.error("Error reading drafts from localStorage:", error);
    return [];
  }
};

/**
 * Guarda un borrador en localStorage con manejo de cuota
 * @param {string} draftKey - Clave única del borrador
 * @param {Object} draftData - Datos del borrador
 */
export const saveDraft = (draftKey, draftData) => {
  try {
    let drafts = getAllDrafts();
    const existingIndex = drafts.findIndex((d) => d.draftKey === draftKey);

    const draft = {
      draftKey,
      ...draftData,
      lastModified: new Date().toISOString(),
      isNew: draftKey.startsWith("new_"),
      isEdit: draftKey.startsWith("edit_"),
    };

    if (existingIndex >= 0) {
      drafts[existingIndex] = draft;
    } else {
      drafts.push(draft);
    }

    // Limitar cantidad de borradores (mantener los más recientes)
    if (drafts.length > MAX_DRAFTS) {
      drafts.sort(
        (a, b) => new Date(b.lastModified) - new Date(a.lastModified),
      );
      drafts = drafts.slice(0, MAX_DRAFTS);
    }

    const jsonStr = JSON.stringify(drafts);
    localStorage.setItem(DRAFTS_KEY, jsonStr);
    notifyDraftsChanged();
    return true;
  } catch (error) {
    // Manejar QuotaExceededError
    if (
      error.name === "QuotaExceededError" ||
      error.code === 22 ||
      error.code === 1014
    ) {
      console.warn(" localStorage lleno, limpiando borradores antiguos...");
      try {
        // Limpiar todos los borradores excepto el actual
        const currentDraft = {
          draftKey,
          ...draftData,
          lastModified: new Date().toISOString(),
          isNew: draftKey.startsWith("new_"),
          isEdit: draftKey.startsWith("edit_"),
        };
        localStorage.setItem(DRAFTS_KEY, JSON.stringify([currentDraft]));
        notifyDraftsChanged();
        return true;
      } catch (retryError) {
        // Si aún falla, eliminar todo
        localStorage.removeItem(DRAFTS_KEY);
        console.error(" No se pudo guardar borrador, localStorage limpiado");
        return false;
      }
    }
    console.error("Error saving draft:", error);
    return false;
  }
};

/**
 * Elimina un borrador específico
 * @param {string} draftKey - Clave del borrador a eliminar
 */
export const removeDraft = (draftKey) => {
  try {
    const drafts = getAllDrafts();
    const filtered = drafts.filter((d) => d.draftKey !== draftKey);
    localStorage.setItem(DRAFTS_KEY, JSON.stringify(filtered));
    notifyDraftsChanged();
    return true;
  } catch (error) {
    console.error("Error removing draft:", error);
    return false;
  }
};

/**
 * Obtiene un borrador específico
 * @param {string} draftKey - Clave del borrador
 * @returns {Object|null} Datos del borrador o null
 */
export const getDraft = (draftKey) => {
  try {
    const drafts = getAllDrafts();
    return drafts.find((d) => d.draftKey === draftKey) || null;
  } catch (error) {
    console.error("Error getting draft:", error);
    return null;
  }
};

/**
 * Verifica si existe un borrador para una cotización en edición
 * @param {string} cotizacionId - ID de la cotización
 * @returns {Object|null} Borrador encontrado o null
 */
export const findEditDraft = (cotizacionId) => {
  if (!cotizacionId) return null;
  const draftKey = `edit_${cotizacionId}`;
  return getDraft(draftKey);
};

/**
 * Limpia borradores antiguos (más de 3 días)
 */
export const cleanOldDrafts = () => {
  try {
    const drafts = getAllDrafts();
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    const filtered = drafts.filter((d) => {
      const lastModified = new Date(d.lastModified);
      return lastModified > threeDaysAgo;
    });

    // También limitar a MAX_DRAFTS
    const limited = filtered
      .sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified))
      .slice(0, MAX_DRAFTS);

    if (limited.length !== drafts.length) {
      localStorage.setItem(DRAFTS_KEY, JSON.stringify(limited));
      notifyDraftsChanged();
      console.log(
        ` ${drafts.length - limited.length} borradores antiguos eliminados`,
      );
    }
    return limited.length;
  } catch (error) {
    console.error("Error cleaning old drafts:", error);
    return 0;
  }
};

/**
 * Hook personalizado para auto-guardado de cotizaciones
 * @param {Object} params - Parámetros del hook
 * @param {Object|null} params.editingCotizacion - Cotización en edición
 * @param {Array} params.days - Días del itinerario
 * @param {Object} params.peopleCount - Conteo de personas
 * @param {Object} params.peopleDetails - Detalles de personas
 * @param {string} params.packageType - Tipo de paquete
 * @param {Object} params.additionalCosts - Costos adicionales
 * @param {string} params.titulo - Título de la cotización
 * @param {Object} params.formData - Datos del formulario (fechas)
 * @param {Object} params.clientData - Datos del cliente
 * @param {string} params.platform - Plataforma (venso, mil, etc.)
 * @param {string} params.businessType - Tipo de negocio (B2C, B2B)
 * @param {Object|null} params.agency - Agencia comercial seleccionada
 * @param {number} params.agencyId - ID de la agencia comercial
 * @param {string|null} params.tariffType - Tipo de tarifa predeterminado de la agencia
 * @param {boolean} params.enabled - Si el auto-guardado está habilitado
 * @returns {Object} Funciones y estado del hook
 */
export const useCotizacionDraft = ({
  editingCotizacion,
  days,
  peopleCount,
  peopleDetails,
  packageType,
  additionalCosts,
  titulo,
  formData,
  clientData,
  platform,
  businessType,
  agency,
  agencyId,
  tariffType,
  externalDays,
  externalAdditionalCosts,
  includeChildrenInPricing,
  currentTc,
  enabled = true,
}) => {
  const draftKeyRef = useRef(null);
  const saveTimeoutRef = useRef(null);
  const isInitializedRef = useRef(false);

  // Generar o mantener la clave del borrador
  useEffect(() => {
    if (!enabled) return;

    if (!draftKeyRef.current) {
      const restoredDraftKey = String(
        editingCotizacion?._restoredFromDraft || "",
      ).trim();

      if (/^(new|edit)_/.test(restoredDraftKey)) {
        // Mantener la misma clave al continuar un borrador. Así, al guardar
        // la cotización se elimina el borrador original en lugar de duplicarlo.
        draftKeyRef.current = restoredDraftKey;
      } else if (editingCotizacion?.id) {
        draftKeyRef.current = `edit_${editingCotizacion.id}`;
      } else {
        // Para nuevas cotizaciones, generar una clave única
        draftKeyRef.current = `new_${Date.now()}`;
      }
    }
  }, [
    editingCotizacion?._restoredFromDraft,
    editingCotizacion?.id,
    enabled,
  ]);

  // Auto-guardado con debounce
  useEffect(() => {
    if (!enabled || !draftKeyRef.current) return;

    // Evitar guardar en la primera renderización
    if (!isInitializedRef.current) {
      isInitializedRef.current = true;
      return;
    }

    // Verificar que hay datos significativos para guardar
    const hasSignificantData =
      (days && days.length > 0) || peopleCount?.adults > 0 || titulo?.trim();

    if (!hasSignificantData) return;

    // Limpiar timeout anterior
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Guardar con debounce
    saveTimeoutRef.current = setTimeout(() => {
      const draftData = {
        // Información de identificación
        originalId: editingCotizacion?.id || null,

        // Datos de la cotización
        titulo: titulo || "",
        days: days || [],
        peopleCount: peopleCount || { adults: 1, children: 0 },
        peopleDetails: peopleDetails || { adults: [], children: [] },
        packageType: packageType || "compartido",
        additionalCosts: additionalCosts || {},
        formData: formData || {},
        clientData: clientData || null,

        // Información de plataforma y tipo de negocio
        platform: platform || "venso",
        businessType: businessType || "B2C",
        agency: agency || null,
        agencyId: Number(agencyId || agency?.id || 1),
        tariffType: tariffType || agency?.default_tariff_type || null,

        // Itinerario externo y configuraciones adicionales
        externalDays: externalDays || [],
        externalAdditionalCosts: externalAdditionalCosts || {},
        includeChildrenInPricing: includeChildrenInPricing ?? false,
        currentTc: currentTc ?? 3,

        // Metadatos
        createdAt: editingCotizacion?.fecha || new Date().toISOString(),
        displayTitle:
          titulo ||
          (editingCotizacion
            ? `Editando: ${editingCotizacion.titulo || editingCotizacion.id}`
            : "Nueva cotización"),
      };

      saveDraft(draftKeyRef.current, draftData);
    }, AUTO_SAVE_DELAY);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [
    days,
    peopleCount,
    peopleDetails,
    packageType,
    additionalCosts,
    titulo,
    formData,
    clientData,
    platform,
    businessType,
    agency,
    agencyId,
    tariffType,
    externalDays,
    externalAdditionalCosts,
    includeChildrenInPricing,
    currentTc,
    editingCotizacion,
    enabled,
  ]);

  // Función para eliminar el borrador actual (llamar al guardar exitosamente)
  const clearCurrentDraft = useCallback(() => {
    if (draftKeyRef.current) {
      removeDraft(draftKeyRef.current);
      draftKeyRef.current = null;
    }
  }, []);

  // Función para guardar inmediatamente (sin debounce)
  const saveNow = useCallback(() => {
    if (!draftKeyRef.current) return false;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    const draftData = {
      originalId: editingCotizacion?.id || null,
      titulo: titulo || "",
      days: days || [],
      peopleCount: peopleCount || { adults: 1, children: 0 },
      peopleDetails: peopleDetails || { adults: [], children: [] },
      packageType: packageType || "compartido",
      additionalCosts: additionalCosts || {},
      formData: formData || {},
      clientData: clientData || null,
      platform: platform || "venso",
      businessType: businessType || "B2C",
      agency: agency || null,
      agencyId: Number(agencyId || agency?.id || 1),
      tariffType: tariffType || agency?.default_tariff_type || null,
      externalDays: externalDays || [],
      externalAdditionalCosts: externalAdditionalCosts || {},
      includeChildrenInPricing: includeChildrenInPricing ?? false,
      currentTc: currentTc ?? 3,
      createdAt: editingCotizacion?.fecha || new Date().toISOString(),
      displayTitle:
        titulo ||
        (editingCotizacion
          ? `Editando: ${editingCotizacion.titulo || editingCotizacion.id}`
          : "Nueva cotización"),
    };

    return saveDraft(draftKeyRef.current, draftData);
  }, [
    days,
    peopleCount,
    peopleDetails,
    packageType,
    additionalCosts,
    titulo,
    formData,
    clientData,
    platform,
    businessType,
    agency,
    agencyId,
    tariffType,
    externalDays,
    externalAdditionalCosts,
    includeChildrenInPricing,
    currentTc,
    editingCotizacion,
  ]);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return undefined;

    const flushDraft = () => {
      saveNow();
    };

    window.addEventListener("pagehide", flushDraft);
    return () => window.removeEventListener("pagehide", flushDraft);
  }, [enabled, saveNow]);

  return {
    draftKey: draftKeyRef.current,
    clearCurrentDraft,
    saveNow,
    getAllDrafts,
    removeDraft,
    getDraft,
    findEditDraft,
  };
};

export default useCotizacionDraft;
