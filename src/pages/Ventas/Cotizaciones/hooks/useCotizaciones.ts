import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getCurrentTimestamp } from "../../../../components/currentTimestamp";
// Replace incorrect AuthContext import with useAuth hook
import { useAuth } from "../../../../context/AuthContext";
import {
  getCotizacionVisibilityScope,
  getUserPlatform,
} from "../../../../utils/permissions";
import * as cotizacionService from "./cotizacionService";
import { pasajeroService } from "../../../../services/pasajeroService";
import {
  calculateExternalItineraryBreakdown,
  calculateCotizacionFinancialSummary,
} from "../../../../components/Ventas/Cotizaciones/EdicionCotizacion/utils/cotizacionFinancialSummary";
import { sanitizeAdditionalCostsConfig } from "../../../../components/Ventas/Cotizaciones/EdicionCotizacion/utils/quotePricingEngine";
import {
  resolveAuthoritativeQuotationTotal,
  resolveVisibleSummaryTotalFromAdditionalCosts,
} from "../../../../components/Ventas/Cotizaciones/EdicionCotizacion/utils/visibleSummaryTotals";
import { queryKeys } from "../../../../config/queryClient";
import { isRequestCanceled } from "../../../../utils/apiUtils";
import SecureStorage from "../../../../utils/secureStorage";
import { invalidateCotizacionGraphCache } from "../../../../utils/cacheInvalidation";
import { invalidateComisionesCache } from "../../../../services/comisionesService";
import postSaleEditService from "../../../../services/postSaleEditService";
import { buildPostSaleCommitPayload } from "../utils/postSaleEditState";
import { buildCotizacionPeopleDetails } from "../utils/cotizacionPassengerRows";
import { buildCotizacionPassengerCountPatch } from "../utils/cotizacionPassengerCounts";
import {
  buildCanonicalPassengerComposition,
  countPassengerTypes,
} from "../../../../components/Ventas/Cotizaciones/EdicionCotizacion/utils/passengerComposition";

function useCotizaciones() {
  // Replace useContext with direct hook usage
  const { user } = useAuth();
  const queryClientInstance = useQueryClient();
  const quotationVisibilityScope = getCotizacionVisibilityScope(user);
  const quotationVisibilityPlatform = getUserPlatform(user);
  const quotationVisibilityUser =
    user?.dni || user?.dniuser || user?.sub || user?.auth?.dniuser || "anonymous";
  const cotizacionListQueryKey = useMemo(
    () =>
      queryKeys.cotizaciones.list({
        scope: quotationVisibilityScope,
        platform: quotationVisibilityPlatform,
        user: quotationVisibilityUser,
      }),
    [
      quotationVisibilityPlatform,
      quotationVisibilityScope,
      quotationVisibilityUser,
    ],
  );

  // IDs de cotizaciones recién eliminadas en esta sesión. Evita que un refetch
  // con caché frontend/backend obsoleto haga reaparecer el registro tras un borrado.
  const recentlyDeletedCotizacionIdsRef = useRef(new Set());

  // Estado para el modal de detalles
  const [selectedCotizacion, setSelectedCotizacion] = useState(null);

  // Estado para loading/error manuales (para operaciones CRUD, no para fetch)
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Estado para el flujo de creación/edición
  const [step, setStep] = useState(0);
  const [selectedPackage, setSelectedPackage] = useState(null);
  const [isNewPackage, setIsNewPackage] = useState(false);
  const [editingCotizacion, setEditingCotizacion] = useState(null);
  const [formData, setFormData] = useState({
    packageData: {},
    dias: [],
    createdBy: user?.dni || "SYSTEM",
    createdAt: getCurrentTimestamp(),
    titulo: "",
    cantidadPersonas: 0,
  });

  // Estado para notificaciones
  const [snackbar, setSnackbar] = useState({
    show: false,
    message: "",
    type: "success",
  });
  const [snackbarTimer, setSnackbarTimer] = useState(null);

  // Estado para confirmación de eliminación
  const [deletePopover, setDeletePopover] = useState({
    isOpen: false,
    id: null,
  });

  // Estado para datos del cliente
  const [showClientInfo, setShowClientInfo] = useState(true);
  const [clientData, setClientData] = useState(null);

  // Estado para voucher
  const [isVoucherOpen, setIsVoucherOpen] = useState(false);
  const [voucherCotizacion, setVoucherCotizacion] = useState(null);

  // Estado para previsualización de PDF
  const [pdfPreviewOpen, setPdfPreviewOpen] = useState(false);
  const [previewCotizacion, setPreviewCotizacion] = useState(null);

  // Función para mostrar snackbar con auto-desvanecimiento
  const showSnackbar = useCallback(
    (message, type = "success", duration = 4000) => {
      // Limpiar timer anterior si existe
      if (snackbarTimer) {
        clearTimeout(snackbarTimer);
      }

      // Mostrar snackbar
      setSnackbar({ show: true, message, type });

      // Configurar auto-desvanecimiento
      const timer = setTimeout(() => {
        setSnackbar((prev) => ({ ...prev, show: false }));
        setSnackbarTimer(null);
      }, duration);

      setSnackbarTimer(timer);

      // Cleanup function para limpiar timer si el componente se desmonta
      return () => {
        if (timer) clearTimeout(timer);
      };
    },
    [snackbarTimer],
  );

  // Limpiar timer cuando el componente se desmonte
  useEffect(() => {
    return () => {
      if (snackbarTimer) {
        clearTimeout(snackbarTimer);
      }
    };
  }, [snackbarTimer]);

  // Usar useQuery para evitar consultas duplicadas (dedup StrictMode + caché)
  const {
    data: cotizaciones = [],
    isLoading: isCotizacionesLoading,
    error: cotizacionesError,
  } = useQuery({
    queryKey: cotizacionListQueryKey,
    queryFn: async ({ signal }) => {
      const data = await cotizacionService.getAllCotizaciones({
        skipCache: false,
        signal,
      });
      return data || [];
    },
    staleTime: 0,
    gcTime: 1000 * 60 * 15,
    refetchInterval: false,
    refetchOnMount: "always",
  });

  // El historial se consulta bajo demanda desde el modal de cada cotización.
  // Evita enviar centenares de IDs y cargar snapshots que no son visibles.

  // Refresco explícito y acotado: solo vuelve a consultar el listado.
  const fetchCotizaciones = useCallback(async ({ force = true } = {}) => {
    try {
      await queryClientInstance.cancelQueries(
        { queryKey: cotizacionListQueryKey },
        { silent: true },
      );
      const freshData = await cotizacionService.getAllCotizaciones({
        skipCache: force,
      });
      const deletedIds = recentlyDeletedCotizacionIdsRef.current;
      const visibleFreshData = (freshData || []).filter(
        (cotizacion) => !deletedIds.has(cotizacion.id),
      );
      queryClientInstance.setQueryData(cotizacionListQueryKey, visibleFreshData);
      return visibleFreshData;
    } catch (err) {
      if (!isRequestCanceled(err)) {
        console.error("Error refreshing cotizaciones:", err);
      }
      return queryClientInstance.getQueryData(cotizacionListQueryKey) || [];
    }
  }, [cotizacionListQueryKey, queryClientInstance]);

  // setCotizaciones wrapper para actualizar el cache de React Query (optimistic updates)
  const setCotizaciones = useCallback(
    (updater) => {
      queryClientInstance.setQueryData(
        cotizacionListQueryKey,
        (old) => {
          if (typeof updater === "function") {
            return updater(old || []);
          }
          return updater;
        },
      );
    },
    [cotizacionListQueryKey, queryClientInstance],
  );

  // Actualiza únicamente el listado del scope autenticado. Así un optimistic
  // update de Reservas no contamina una lista de otro usuario/rol que todavía
  // permanezca en memoria dentro de React Query.
  const patchCotizacionListCaches = useCallback(
    (cotizacionId, patch, { prepend = false } = {}) => {
      queryClientInstance.setQueryData(cotizacionListQueryKey, (old) => {
        if (!Array.isArray(old)) return old;

        const index = old.findIndex(
          (item) => String(item?.id || "") === String(cotizacionId),
        );

        if (index < 0) {
          return prepend ? [patch, ...old] : old;
        }

        return old.map((item, itemIndex) =>
          itemIndex === index ? { ...item, ...patch } : item,
        );
      });
    },
    [cotizacionListQueryKey, queryClientInstance],
  );

  // Resetear el estado de creación/edición
  const resetCotizacionState = () => {
    setSelectedPackage(null);
    setEditingCotizacion(null);
    setShowClientInfo(true);
    setClientData(null);
    setFormData({
      packageData: {},
      dias: [],
      createdBy: user?.dni || "SYSTEM",
      createdAt: getCurrentTimestamp(),
      titulo: "",
      cantidadPersonas: 0,
    });
  };

  // Ver detalles de cotización
  const viewCotizacionDetails = async (cotizacion) => {
    try {
      // If we need fresh data, fetch it from the backend
      const freshCotizacion = await cotizacionService.getCotizacionById(
        cotizacion.id,
        { skipCache: true },
      );
      setSelectedCotizacion(freshCotizacion);
    } catch (err) {
      // If there's an error, use the provided cotizacion
      setSelectedCotizacion(cotizacion);
      console.error("Error fetching updated cotizacion:", err);
    }
  };

  // Selección inicial de paquete
  const handlePackageSelection = (data) => {
    resetCotizacionState();
    const packageData = data.selectedPackage || { dias: [], nombre: "" };

    setIsNewPackage(!data.selectedPackage);
    setSelectedPackage(packageData);

    if (data.clientData) {
      setClientData(data.clientData);
    }

    setFormData((prev) => ({
      ...prev,
      packageData,
      dias: data.dias || packageData.dias || [],
      titulo: data.clientData
        ? `${data.clientData.nombres} ${data.clientData.apellidos}`
        : data.titulo || packageData.nombre || "",
      cantidadPersonas: data.cantidadPersonas || 1,
    }));

    setStep(2);
  };

  /**
   * Persists the complete adult/child composition in one backend transaction.
   * A save is not reported as successful when passenger synchronization fails.
   */
  const syncPassengersToCotizacion = async (
    cotizacionId,
    peopleDetails,
    peopleCount,
  ) => {
    if (!cotizacionId) {
      throw new Error("La cotización es obligatoria para guardar pasajeros");
    }

    const canonical = buildCanonicalPassengerComposition(
      peopleDetails,
      peopleCount,
    );

    try {
      const synchronized = await pasajeroService.syncPassengersByCotizacion(
        cotizacionId,
        canonical.peopleDetails,
      );
      const actual = countPassengerTypes(synchronized);
      const expected = canonical.peopleCount;

      if (
        actual.adults !== expected.adults ||
        actual.children !== expected.children
      ) {
        throw new Error(
          `La sincronización devolvió ${actual.adults} adultos y ${actual.children} niños; se esperaban ${expected.adults} y ${expected.children}`,
        );
      }

      return { ...canonical, synchronized };
    } catch (err) {
      console.error("Error syncing passengers to cotizacion:", err);
      throw new Error(
        err?.response?.data?.message ||
          err?.message ||
          "No se pudo guardar la configuración de pasajeros",
      );
    }
  };

  // Guardar cotización después de edición (integrado con API)
  const handlePackageEdit = async (data) => {
    let savedListPatch = null;
    let savedListPatchPrepend = false;
    try {
      const currentUserIdentifier =
        user?.dni ||
        user?.dniuser ||
        user?.sub ||
        SecureStorage.getItem("dniuser") ||
        "SYSTEM";
      const isSuperAdminUser =
        Number(user?.role ?? SecureStorage.getItem("userRole") ?? -1) === 0;
      const selectedCreationDate =
        data.fecha || data.createdat || data.createdAt || null;
      const selectedCreatedBy =
        String(data.createdby || data.created_by || data.createdBy || "").trim() ||
        null;
      const passengerComposition = buildCanonicalPassengerComposition(
        data.peopleDetails,
        data.peopleCount,
      );
      const canonicalPeopleDetails = passengerComposition.peopleDetails;
      const canonicalPeopleCount = passengerComposition.peopleCount;

      const getAdultsCount = () => canonicalPeopleCount.adults;

      const parseOptionalNumber = (value) => {
        const parsed = Number.parseFloat(value);
        return Number.isFinite(parsed) ? parsed : null;
      };

      // El cero es un valor explícito válido: no debe caer al arreglo anterior.
      const getChildrenCount = () => canonicalPeopleCount.children;

      const adultsCount = getAdultsCount();
      const childrenCount = getChildrenCount();
      // -------------------------------------------------------

      // Prepare financial calculations
      const itinerario = data.itinerario || data.dias || [];

      // FIX: EdicionCotizacion ya envía el itinerario limpio via cleanItinerarioForDB.
      // No volver a limpiar aquí porque cleanServiceForDB en la segunda pasada
      // recibe servicios sin tariff (ya convertidos a campos planos) y puede
      // producir precioServicio = 0 si el fallback falla.
      const cleanedItinerario = itinerario;
      const cleanedItinerarioExterno = data.itinerario_externo || [];

      const deriveTotalsFromItinerary = (days) => {
        const safeDays = Array.isArray(days) ? days : [];

        return safeDays.reduce(
          (acc, dia) => {
            const servicios = Array.isArray(dia?.servicios)
              ? dia.servicios
              : [];

            servicios.forEach((servicio) => {
              // Soportar tanto formato runtime (tariff.*) como flat (precioServicio)
              // Prefer pre-calculated precioTotal from backend
              const tariff = servicio?.tariff || {};
              const precioServicio = Number(servicio?.precioServicio || 0);
              const precioTotal = Number(servicio?.precioTotal || 0);
              const price = Number(
                tariff.precio || servicio?.precio || precioServicio || 0,
              );
              const originalPrice =
                precioTotal > 0
                  ? precioTotal
                  : Number(tariff.precio_original || precioServicio || 0);
              const childExtras = Number(
                tariff.childExtrasTotal ??
                  servicio?.assignedChildExplicitPriceSum ??
                  0,
              );
              const isHotel =
                servicio?.parentService?.typeService === "hoteles" ||
                servicio?.typeService === "hoteles";

              if (isHotel) {
                const roomPrice = originalPrice > 0 ? originalPrice : price;
                acc.hotelsTotal += roomPrice;
                acc.subtotalNinos += childExtras;
                acc.hotelChildTotal += childExtras;

                const convertedChildToAdultMap =
                  servicio?.convertedChildToAdultMap ||
                  servicio?.passengerSelection?.convertedChildToAdultMap ||
                  {};
                const rootIds = Array.isArray(servicio?.assignedPassengerIds)
                  ? servicio.assignedPassengerIds
                  : [];
                const selectionIds = Array.isArray(
                  servicio?.passengerSelection?.selectedIds,
                )
                  ? servicio.passengerSelection.selectedIds
                  : [];
                const assignedIds =
                  selectionIds.length >= rootIds.length
                    ? selectionIds
                    : rootIds;
                const convertedChildIds = assignedIds.filter(
                  (id) =>
                    typeof id === "string" &&
                    id.startsWith("child:") &&
                    convertedChildToAdultMap[id],
                );
                const assignedAdultIds = assignedIds.filter(
                  (id) => typeof id === "string" && id.startsWith("adult:"),
                );
                const sharers =
                  assignedAdultIds.length + convertedChildIds.length;
                const convertedChildShare =
                  sharers > 0
                    ? convertedChildIds.length * (roomPrice / sharers)
                    : 0;

                acc.hotelConvertedChildTotal += convertedChildShare;
                acc.hotelAdultTotal += Math.max(
                  0,
                  roomPrice - convertedChildShare,
                );
              } else {
                acc.subtotalIndividual += price;
                acc.servicesTotal += originalPrice > 0 ? originalPrice : price;
                acc.subtotalNinos += childExtras;
              }
            });

            return acc;
          },
          {
            servicesTotal: 0,
            subtotalIndividual: 0,
            hotelsTotal: 0,
            hotelAdultTotal: 0,
            hotelChildTotal: 0,
            hotelConvertedChildTotal: 0,
            subtotalNinos: 0,
          },
        );
      };

      const derivedTotals = deriveTotalsFromItinerary(itinerario);
      const peopleDetailsForSummary = canonicalPeopleDetails;
      const externalItineraryBreakdown = calculateExternalItineraryBreakdown(
        cleanedItinerarioExterno,
        peopleDetailsForSummary,
      );

      // Use canonical per-person pricing from EdicionCotizacion/backend when available.
      let subtotalIndividual, totalFinal;

      subtotalIndividual =
        parseOptionalNumber(
          data.precio_it_adulto ??
            data.precioItAdulto ??
            data.subtotal_individual ??
            data.subtotalIndividual ??
            data.subtotal_Individual,
        ) ?? derivedTotals.subtotalIndividual;

      const hotelsTotal =
        parseOptionalNumber(
          data.totalHoteles ??
            data.hotelsTotal ??
            data.hotelTotal ??
            data.selectedHotel?.total,
        ) ?? derivedTotals.hotelsTotal;
      const hotelConvertedChildTotal =
        parseOptionalNumber(
          data.hotel_converted_child_total ?? data.hotelConvertedChildTotal,
        ) ?? derivedTotals.hotelConvertedChildTotal;
      const hotelAdultTotal =
        parseOptionalNumber(data.hotel_adult_total ?? data.hotelAdultTotal) ??
        derivedTotals.hotelAdultTotal ??
        Math.max(0, hotelsTotal - hotelConvertedChildTotal);
      const hotelChildTotal =
        parseOptionalNumber(data.hotel_child_total ?? data.hotelChildTotal) ??
        derivedTotals.hotelChildTotal;
      const subtotalNinos =
        parseOptionalNumber(
          data.subtotal_nino ??
            data.subtotal_ninos ??
            data.subtotalNino ??
            data.subtotalNinos,
        ) ?? derivedTotals.subtotalNinos;

      const summaryTotals = calculateCotizacionFinancialSummary({
        subtotalIndividual,
        adultsCount,
        childrenCount,
        hotelsTotal,
        hotelAdultTotal,
        hotelChildTotal,
        hotelConvertedChildTotal,
        subtotalNinos,
        externalAdultTotal: externalItineraryBreakdown.adultTotal,
        externalChildTotal: externalItineraryBreakdown.childTotal,
        externalConvertedChildTotal:
          externalItineraryBreakdown.convertedChildTotal,
        externalExplicitChildCount:
          externalItineraryBreakdown.explicitChildCount,
        externalConvertedChildCount:
          externalItineraryBreakdown.convertedChildCount,
        baseExplicitChildCount:
          data.additionalCosts?.baseExplicitChildCount ||
          data.baseExplicitChildCount ||
          0,
        baseConvertedChildCount:
          data.additionalCosts?.baseConvertedChildCount ||
          data.baseConvertedChildCount ||
          0,
        hotelExplicitChildCount:
          data.additionalCosts?.hotelExplicitChildCount ||
          data.hotelExplicitChildCount ||
          0,
        hotelConvertedChildCount:
          data.additionalCosts?.hotelConvertedChildCount ||
          data.hotelConvertedChildCount ||
          0,
        nonHotelExplicitChildTotal:
          data.additionalCosts?.nonHotelExplicitChildTotal ??
          data.nonHotelExplicitChildTotal ??
          null,
        nonHotelConvertedChildTotal:
          data.additionalCosts?.nonHotelConvertedChildTotal ??
          data.nonHotelConvertedChildTotal ??
          null,
        additionalCosts: data.additionalCosts || {},
      });

      const storedVisibleTotal = resolveVisibleSummaryTotalFromAdditionalCosts(
        data.additionalCosts || {},
      );
      const incomingTotalFinal = parseOptionalNumber(
        data.total_final ?? data.totalAmount,
      );
      totalFinal = resolveAuthoritativeQuotationTotal({
        additionalCosts: data.additionalCosts || {},
        visibleParts:
          data.additionalCosts?.summaryVisibleParts ||
          data.additionalCosts?.visibleSummaryParts ||
          data.additionalCosts?.acSummaryParts ||
          [],
        fallbackAdditionalTotal:
          storedVisibleTotal > 0 ? storedVisibleTotal : incomingTotalFinal,
        fallbackTotal: summaryTotals.grandTotal,
      });

      // USE TOTAL FINAL FROM EdicionCotizacion OR CALCULATE IF NOT PROVIDED
      if (!totalFinal || totalFinal === 0) {
        totalFinal = incomingTotalFinal ?? summaryTotals.grandTotal;
      }

      // La fuente canónica para guardar debe ser la misma fórmula visible de
      // AdditionalCosts: SUMA(ceil(precio por grupo) * beneficiarios). Cuando
      // hay niños mezclados entre beneficiarios_ninos y beneficiarios_adultos,
      // el recálculo genérico puede diferir unos dólares; por eso se vuelve a
      // priorizar el total visible transportado en additionalCosts.
      const visibleTotalForSave = resolveVisibleSummaryTotalFromAdditionalCosts(
        data.additionalCosts || {},
      );
      if (visibleTotalForSave > 0) {
        totalFinal = visibleTotalForSave;
      }

      // El core conserva las cohortes infantiles: un niño puede llevar tarifa
      // propia en un servicio y tarifa adulta en un externo. Multiplicar el
      // promedio externo por todos los niños alteraría el subtotal final.
      const actualExternalItineraryTotal = Number(
        summaryTotals.externalItineraryTotal || 0,
      );
      const incomingSubtotalFinal = parseOptionalNumber(
        data.subtotal_final ?? data.subtotalFinal,
      );
      const additionalSubtotalFinal = parseOptionalNumber(
        data.additionalCosts?.subtotalFinal ??
          data.additionalCosts?.subtotal_final ??
          data.additionalCosts?.commissionableSubtotal ??
          data.additionalCosts?.commissionable_subtotal,
      );
      const subtotalFinal =
        incomingSubtotalFinal ??
        additionalSubtotalFinal ??
        Math.max(0, Number(totalFinal || 0) - actualExternalItineraryTotal);

      // Determine if Peruvian passengers for IGV
      let hasIgv = false;

      if (canonicalPeopleDetails) {
        const allPeople = [
          ...(canonicalPeopleDetails.adults || []),
          ...(canonicalPeopleDetails.children || []),
        ];

        hasIgv = allPeople.some(
          (person) =>
            (person.nacionalidad &&
              (person.nacionalidad.toLowerCase() === "perú" ||
                person.nacionalidad.toLowerCase() === "peru")) ||
            (person.pais &&
              (person.pais.toLowerCase() === "perú" ||
                person.pais.toLowerCase() === "peru")),
        );

        hasIgv = hasIgv || data.hasIgv === true;
      } else {
        hasIgv = data.hasIgv === true;
      }

      // Calculate IGV (currently not implemented in main calculation, but preserved for compatibility)
      const igvRate = hasIgv ? data.igvRate || 18 : 0;
      const igvAmount = hasIgv ? (totalFinal * igvRate) / 100 : 0;
      // Note: IGV is not added to totalFinal as it's calculated separately if needed

      // CLEAN ADDITIONAL COSTS TO PREVENT SERIALIZATION CORRUPTION
      const cleanAdditionalCosts = (() => {
        let cleanCosts = data.additionalCosts;

        // If it's a string (already serialized), try to parse it
        if (typeof cleanCosts === "string") {
          try {
            cleanCosts = JSON.parse(cleanCosts);
          } catch (error) {
            console.error(" Failed to parse additionalCosts string:", error);
            cleanCosts = {};
          }
        }

        // If it's already an object with indexed keys (corrupted), extract valid properties
        if (cleanCosts && typeof cleanCosts === "object") {
          const hasIndexedKeys = Object.keys(cleanCosts).some((key) =>
            /^\d+$/.test(key),
          );

          if (hasIndexedKeys) {
            // Extract only non-indexed properties
            const validData = {};
            Object.entries(cleanCosts).forEach(([key, value]) => {
              if (!/^\d+$/.test(key)) {
                validData[key] = value;
              }
            });
            cleanCosts = validData;
          }
        }

        // Ensure we have a clean object with primitive values
        const applyAdditionalCostsToChildren =
          cleanCosts?.applyAdditionalCostsToChildren !== false;
        const applyOperationalCostsToChildren =
          cleanCosts?.applyOperationalCostsToChildren ??
          cleanCosts?.applyAdditionalCostsToChildren ??
          true;
        const applyFeeToChildren =
          cleanCosts?.applyFeeToChildren ??
          cleanCosts?.applyAdditionalCostsToChildren ??
          true;
        const applyExtraFeeToChildren =
          cleanCosts?.applyExtraFeeToChildren ??
          cleanCosts?.applyAdditionalCostsToChildren ??
          true;

        const finalCleanCosts = {
          operationalCosts: String(cleanCosts?.operationalCosts || "0"),
          fee: String(cleanCosts?.fee || "0"),
          extraFee: Number(cleanCosts?.extraFee || 0),
          operationalMode: String(cleanCosts?.operationalMode || "fixed"),
          feeMode: String(cleanCosts?.feeMode || "fixed"),
          applyAdditionalCostsToChildren,
          applyOperationalCostsToChildren,
          applyFeeToChildren,
          applyExtraFeeToChildren,
          childOperationalMode: String(
            cleanCosts?.childOperationalMode ||
              cleanCosts?.operationalMode ||
              "fixed",
          ),
          childOperationalCosts: String(
            cleanCosts?.childOperationalCosts ??
              cleanCosts?.operationalCosts ??
              "0",
          ),
          childFeeMode: String(
            cleanCosts?.childFeeMode || cleanCosts?.feeMode || "percentage",
          ),
          childFee: String(cleanCosts?.childFee ?? cleanCosts?.fee ?? "0"),
          childExtraFee: String(
            cleanCosts?.childExtraFee ?? cleanCosts?.extraFee ?? "0",
          ),
          calculatedOperational: Number(summaryTotals.operationalAmount),
          calculatedFee: Number(summaryTotals.feeAmount),
          calculatedChildOperational: Number(
            summaryTotals.childOperationalAmount || 0,
          ),
          calculatedChildFee: Number(summaryTotals.childFeeAmount || 0),
          calculatedChildExtraFee: Number(
            summaryTotals.childExtraFeeAmount || 0,
          ),
          totalAdditional: Number(summaryTotals.totalAdditionalPerAdult),
          totalAdditionalPerChild: Number(
            summaryTotals.totalAdditionalPerChild || 0,
          ),
          additionalChildTotal: Number(summaryTotals.additionalChildTotal || 0),
          subtotalIndividual: Number(summaryTotals.subtotalIndividual),
          hotelsTotal: Number(summaryTotals.hotelGroupTotal),
          hotelAdultTotal: Number(summaryTotals.hotelAdultTotal),
          hotelChildTotal: Number(summaryTotals.hotelChildTotal),
          hotelConvertedChildTotal: Number(
            summaryTotals.hotelConvertedChildTotal,
          ),
          subtotalNinos: Number(summaryTotals.subtotalNinos),
          nonHotelExplicitChildTotal: Number(
            summaryTotals.nonHotelExplicitChildTotal || 0,
          ),
          nonHotelConvertedChildTotal: Number(
            summaryTotals.nonHotelConvertedChildTotal || 0,
          ),
          nonHotelExplicitChildTotalsById:
            cleanCosts?.nonHotelExplicitChildTotalsById || {},
          nonHotelConvertedChildTotalsById:
            cleanCosts?.nonHotelConvertedChildTotalsById || {},
          hotelExplicitChildTotalsById:
            cleanCosts?.hotelExplicitChildTotalsById || {},
          hotelConvertedChildTotalsById:
            cleanCosts?.hotelConvertedChildTotalsById || {},
          percentageBase: Number(summaryTotals.percentageBase),
          externalItineraryTotal: Number(summaryTotals.externalItineraryTotal),
          subtotalFinal: Number(subtotalFinal || 0),
          subtotal_final: Number(subtotalFinal || 0),
          commissionableSubtotal: Number(subtotalFinal || 0),
          commissionable_subtotal: Number(subtotalFinal || 0),
          feeOnlySubtotalFinal: Number(subtotalFinal || 0),
          fee_only_subtotal_final: Number(subtotalFinal || 0),
          commissionableFeeSubtotal: Number(subtotalFinal || 0),
          commissionable_fee_subtotal: Number(subtotalFinal || 0),
          finalTotal: Number(totalFinal || 0),
          final_total: Number(totalFinal || 0),
          grandTotal: Number(totalFinal || 0),
          grand_total: Number(totalFinal || 0),
          visibleSummaryGrandTotal: Number(
            data.additionalCosts?.visibleSummaryGrandTotal ||
              data.additionalCosts?.summaryVisibleGrandTotal ||
              data.additionalCosts?.acSummaryGrandTotal ||
              totalFinal ||
              0,
          ),
          summaryVisibleGrandTotal: Number(
            data.additionalCosts?.summaryVisibleGrandTotal ||
              data.additionalCosts?.visibleSummaryGrandTotal ||
              data.additionalCosts?.acSummaryGrandTotal ||
              totalFinal ||
              0,
          ),
          acSummaryGrandTotal: Number(
            data.additionalCosts?.acSummaryGrandTotal ||
              data.additionalCosts?.visibleSummaryGrandTotal ||
              data.additionalCosts?.summaryVisibleGrandTotal ||
              totalFinal ||
              0,
          ),
          summaryVisibleParts: Array.isArray(
            data.additionalCosts?.summaryVisibleParts,
          )
            ? data.additionalCosts.summaryVisibleParts
            : [],
        };

        // Embed external additional costs if present
        if (data.externalAdditionalCosts) {
          finalCleanCosts.external = {
            operationalCosts: String(
              data.externalAdditionalCosts.operationalCosts || "0",
            ),
            operationalMode: String(
              data.externalAdditionalCosts.operationalMode || "fixed",
            ),
            fee: String(data.externalAdditionalCosts.fee || "0"),
            extraFee: Number(data.externalAdditionalCosts.extraFee || 0),
          };
        }

        return sanitizeAdditionalCostsConfig(finalCleanCosts);
      })();

      const pricingBreakdownForSave = {
        precio_it_adulto:
          parseOptionalNumber(data.precio_it_adulto) ??
          parseOptionalNumber(data.precioItAdulto) ??
          subtotalIndividual,
        precio_it_ninos:
          parseOptionalNumber(data.precio_it_ninos) ??
          parseOptionalNumber(data.precioItNinos) ??
          (canonicalPeopleCount.children > 0
            ? Math.round(
                ((Number(summaryTotals.nonHotelExplicitChildTotal || 0) +
                  Number(summaryTotals.nonHotelConvertedChildTotal || 0)) /
                  Math.max(1, canonicalPeopleCount.children)) *
                  100,
              ) / 100
            : 0),
        precio_it_ext_adulto:
          parseOptionalNumber(data.precio_it_ext_adulto) ??
          parseOptionalNumber(data.precioItExtAdulto) ??
          externalItineraryBreakdown.adultTotal,
        precio_it_ext_ninos:
          parseOptionalNumber(data.precio_it_ext_ninos) ??
          parseOptionalNumber(data.precioItExtNinos) ??
          Math.round(
            (externalItineraryBreakdown.childTotal +
              externalItineraryBreakdown.convertedChildTotal) *
              100,
          ) /
            100,
      };

      // Check if we're editing or creating
      const isEditing = Boolean(data.id);
      let result;

      if (isEditing) {
        // PREPARE UPDATE DATA - USE CORRECT BACKEND FIELD NAMES
        const updateData = {
          titulo: data.titulo,
          voucher_code: data.voucher_code || data.voucherCode || null,
          cantidadpersonas: passengerComposition.total,
          packagetype: data.packageType,
          itinerario: cleanedItinerario,
          itinerario_externo: cleanedItinerarioExterno,
          additionalcosts: cleanAdditionalCosts,

          ...pricingBreakdownForSave,
          total_final: totalFinal,
          subtotal_final: subtotalFinal,

          // IGV fields (preserved for compatibility but not added to totals)
          hasigv: hasIgv,
          igvrate: igvRate,
          igvamount: igvAmount,

          // PLATFORM AND BUSINESS TYPE - Include for updates too
          platform: data.platform || "venso",
          business_type: data.business_type || "B2C",
          agency_id: Number(data.agency_id || data.agencyId || 1),
          tariff_type:
            data.tariff_type ||
            data.tariffType ||
            (String(data.business_type || "B2C").toUpperCase() === "B2B"
              ? "interna"
              : "externa"),

          // Audit fields
          updatedby: currentUserIdentifier,
          ...(isSuperAdminUser && selectedCreatedBy ? { createdby: selectedCreatedBy } : {}),
          ...(isSuperAdminUser && selectedCreationDate
            ? { fecha: selectedCreationDate, createdat: selectedCreationDate }
            : {}),
          fechainicio: data.fechainicio || null,
          fechafin: data.fechafin || null,
          tasa_cambio: data?.tasa_cambio ?? 3,
          hotel_detalle: data.hotel_detalle || null,
          ...(data.source_voucher !== undefined || data.sourceVoucher !== undefined
            ? { source_voucher: data.source_voucher ?? data.sourceVoucher ?? {} }
            : {}),
          ...(data.preliquidacion !== undefined
            ? { preliquidacion: data.preliquidacion ?? {} }
            : {}),

          // Paquete link fields
          id_paquete: data.id_paquete || null,
          paquete_modificado: data.paquete_modificado || false,
        };

        // Conditionally reset info_pdf based on caller's choice
        // data._resetPdf flag is set by Cotizaciones.jsx save handler
        if (data._resetPdf) {
          updateData.info_pdf = [];
          updateData.es_procesado = false;
        }
        // If _resetPdf is false/undefined, info_pdf and es_procesado are NOT sent,
        // so the backend's AsChangeset (Option<T>) preserves existing values.

        const postSaleEditRequest = data._postSaleEditRequest || null;
        let passengerSync;

        if (postSaleEditRequest) {
          const commitPayload = buildPostSaleCommitPayload({
            request: postSaleEditRequest,
            cotizacion: updateData,
            passengers: {
              adults: canonicalPeopleDetails.adults || [],
              children: canonicalPeopleDetails.children || [],
            },
          });
          const commitResponse = await postSaleEditService.commit(data.id, commitPayload);
          result = commitResponse?.data || {};
          const synchronized = Array.isArray(commitResponse?.passengers)
            ? commitResponse.passengers
            : [];
          const actual = countPassengerTypes(synchronized);
          if (
            actual.adults !== canonicalPeopleCount.adults ||
            actual.children !== canonicalPeopleCount.children
          ) {
            throw new Error(
              `El guardado postventa devolvió ${actual.adults} adultos y ${actual.children} niños; se esperaban ${canonicalPeopleCount.adults} y ${canonicalPeopleCount.children}`,
            );
          }
          passengerSync = {
            peopleDetails: canonicalPeopleDetails,
            peopleCount: canonicalPeopleCount,
            synchronized,
          };
          window.dispatchEvent(
            new CustomEvent("postSaleEditRequestUpdated", {
              detail: {
                source: "post_sale_commit",
                request_id: postSaleEditRequest.id,
                cotizacion_id: data.id,
                status: "CONSUMED",
              },
            }),
          );
        } else {
          result = await cotizacionService.updateCotizacion(data.id, updateData);
          passengerSync = await syncPassengersToCotizacion(
            data.id,
            canonicalPeopleDetails,
            canonicalPeopleCount,
          );
        }

        const passengerCountPatch = buildCotizacionPassengerCountPatch({
          peopleDetails: passengerSync.peopleDetails,
          peopleCount: passengerSync.peopleCount,
        });
        const authoritativeUpdate =
          result && typeof result === "object" && !Array.isArray(result)
            ? result
            : {};
        const persistedTotalFinal = Number(
          authoritativeUpdate.total_final ?? authoritativeUpdate.totalFinal,
        );
        const cachedTotalFinal =
          Number.isFinite(persistedTotalFinal) && persistedTotalFinal > 0
            ? persistedTotalFinal
            : totalFinal;
        const persistedSubtotalFinal = Number(
          authoritativeUpdate.subtotal_final ?? authoritativeUpdate.subtotalFinal,
        );
        const cachedSubtotalFinal =
          Number.isFinite(persistedSubtotalFinal) && persistedSubtotalFinal >= 0
            ? persistedSubtotalFinal
            : subtotalFinal;
        const updatedAt =
          authoritativeUpdate.updatedat ||
          authoritativeUpdate.updatedAt ||
          new Date().toISOString();
        const cachedUpdatedCotizacion = {
          ...data,
          ...authoritativeUpdate,
          id: data.id,
          peopleDetails: passengerSync.peopleDetails,
          peopledetails: passengerSync.peopleDetails,
          ...passengerCountPatch,
          additionalCosts: cleanAdditionalCosts,
          additionalcosts: cleanAdditionalCosts,
          total_final: cachedTotalFinal,
          totalFinal: cachedTotalFinal,
          subtotal_final: cachedSubtotalFinal,
          subtotalFinal: cachedSubtotalFinal,
          updatedat: updatedAt,
          updatedAt,
          status: authoritativeUpdate.status || "ACTIVE",
          _postSaleEditRequest: null,
        };

        // Cualquier refetch iniciado antes de finalizar el sync puede traer el
        // split anterior. Se cancela y luego se escribe la composición canónica.
        await queryClientInstance.cancelQueries(
          { queryKey: cotizacionListQueryKey },
          { silent: true },
        );
        savedListPatch = cachedUpdatedCotizacion;
        patchCotizacionListCaches(data.id, cachedUpdatedCotizacion);
        queryClientInstance.setQueryData(
          queryKeys.cotizaciones.detail(data.id),
          (prev) => ({ ...(prev || {}), ...cachedUpdatedCotizacion }),
        );

        showSnackbar("Cotización actualizada exitosamente", "success");
      } else {
        // PREPARE CREATE DATA - USE CORRECT BACKEND FIELD NAMES
        const createData = {
          titulo: data.titulo || "",
          voucher_code: data.voucher_code || data.voucherCode || null,
          cantidadpersonas: passengerComposition.total,
          packagetype: data.packageType || "compartido",
          itinerario: cleanedItinerario,
          itinerario_externo: cleanedItinerarioExterno,
          additionalcosts: cleanAdditionalCosts,

          ...pricingBreakdownForSave,
          total_final: totalFinal,
          subtotal_final: subtotalFinal,

          // IGV fields (preserved for compatibility but not added to totals)
          hasigv: hasIgv,
          igvrate: igvRate,
          igvamount: igvAmount,

          // PLATFORM AND BUSINESS TYPE - Critical for superadmin selection
          platform: data.platform || "venso",
          business_type: data.business_type || "B2C",
          agency_id: Number(data.agency_id || data.agencyId || 1),
          tariff_type:
            data.tariff_type ||
            data.tariffType ||
            (String(data.business_type || "B2C").toUpperCase() === "B2B"
              ? "interna"
              : "externa"),
          // Audit fields
          createdby:
            isSuperAdminUser && selectedCreatedBy
              ? selectedCreatedBy
              : currentUserIdentifier,
          ...(isSuperAdminUser && selectedCreationDate
            ? { fecha: selectedCreationDate, createdat: selectedCreationDate }
            : {}),
          fechainicio: data.fechainicio || null,
          fechafin: data.fechafin || null,
          tasa_cambio: data?.tasa_cambio ?? 3,
          hotel_detalle: data.hotel_detalle || null,
          source_voucher: data.source_voucher ?? data.sourceVoucher ?? {},
          preliquidacion: data.preliquidacion ?? {},

          // Paquete link fields
          id_paquete: data.id_paquete || null,
          paquete_modificado: data.paquete_modificado || false,
        };

        // Call API to create
        result = await cotizacionService.createCotizacion(createData);

        // Sync passengers to cotizacion (result contains the created cotizacion with id)
        if (result?.id) {
          const passengerSync = await syncPassengersToCotizacion(
            result.id,
            canonicalPeopleDetails,
            canonicalPeopleCount,
          );
          const passengerCountPatch = buildCotizacionPassengerCountPatch({
            peopleDetails: passengerSync.peopleDetails,
            peopleCount: passengerSync.peopleCount,
          });
          const cachedCreatedCotizacion = {
            ...createData,
            ...result,
            id: result.id,
            peopleDetails: passengerSync.peopleDetails,
            peopledetails: passengerSync.peopleDetails,
            ...passengerCountPatch,
            additionalCosts: cleanAdditionalCosts,
            additionalcosts: cleanAdditionalCosts,
            totalFinal,
            subtotalFinal,
            is_active: true,
            status: result.status || "ACTIVE",
          };
          await queryClientInstance.cancelQueries(
            { queryKey: cotizacionListQueryKey },
            { silent: true },
          );
          savedListPatch = cachedCreatedCotizacion;
          savedListPatchPrepend = true;
          patchCotizacionListCaches(result.id, cachedCreatedCotizacion, {
            prepend: true,
          });
          queryClientInstance.setQueryData(
            queryKeys.cotizaciones.detail(result.id),
            cachedCreatedCotizacion,
          );
        }

        showSnackbar("Nueva cotización creada exitosamente", "success");
      }

      invalidateCotizacionGraphCache({
        refetchType: "none",
        includeVouchers: false,
      });

      const savedCotizacionId = result?.id || data.id;
      if (savedCotizacionId) {
        const isSavedPricingQuery = (query) => {
          const key = Array.isArray(query?.queryKey) ? query.queryKey : [];
          return (
            key[0] === "cotizaciones" &&
            key[1] === "summary-content-pricing" &&
            String(key[2] ?? "") === String(savedCotizacionId)
          );
        };
        await queryClientInstance.cancelQueries(
          { predicate: isSavedPricingQuery },
          { silent: true },
        );
        queryClientInstance.removeQueries({ predicate: isSavedPricingQuery });
      }

      await queryClientInstance.invalidateQueries({
        queryKey: cotizacionListQueryKey,
        exact: true,
        refetchType: "none",
      });
      await fetchCotizaciones({ force: true });

      if (savedCotizacionId && savedListPatch) {
        patchCotizacionListCaches(savedCotizacionId, savedListPatch, {
          prepend: savedListPatchPrepend,
        });
        queryClientInstance.setQueryData(
          queryKeys.cotizaciones.detail(savedCotizacionId),
          (previous) => ({ ...(previous || {}), ...savedListPatch }),
        );
      }

      invalidateComisionesCache();

      // Reset state
      setStep(0);
      setEditingCotizacion(null);
      resetCotizacionState();

      return result;
    } catch (err) {
      console.error("Error saving cotizacion:", err);
      showSnackbar(
        `Error al ${data.id ? "actualizar" : "crear"} cotización: ${err.message || "Error desconocido"}`,
        "error",
      );
      throw err;
    }
  };

  // Preparar cotización para edición
  const handleEditCotizacion = async (cotizacion) => {
    try {
      // Get fresh data from API, bypassing backend detail cache so additionalcosts
      // reflects the last save immediately when reopening the editor.
      const freshCotizacion = await cotizacionService.getCotizacionById(
        cotizacion.id,
        { skipCache: true },
      );

      if (!freshCotizacion || !freshCotizacion.id) {
        throw new Error("No se pudo cargar la cotización para editar");
      }

      // Normalize field names (handle both camelCase and snake_case)
      const normalizedCotizacion = {
        ...freshCotizacion,
        // peopleDetails/peopleCount ya no vienen del API (migrado a tabla pasajero)
        // Se mantienen los camelCase para compatibilidad con el estado local del editor
        peopleDetails: freshCotizacion.peopleDetails || {},
        peopleCount: freshCotizacion.peopleCount || {},
        additionalCosts:
          freshCotizacion.additionalcosts ||
          freshCotizacion.additionalCosts ||
          {},
        packageType:
          freshCotizacion.packagetype ||
          freshCotizacion.packageType ||
          "compartido",
        hasIgv: freshCotizacion.hasigv || freshCotizacion.hasIgv || false,
        igvRate: freshCotizacion.igvrate || freshCotizacion.igvRate || 18,
        igvAmount: freshCotizacion.igvamount || freshCotizacion.igvAmount || 0,
        cantidadPersonas:
          freshCotizacion.cantidadpersonas ||
          freshCotizacion.cantidadPersonas ||
          1,
        totalServices:
          freshCotizacion.totalservices || freshCotizacion.totalServices || 0,
        totalAdditionals:
          freshCotizacion.totaladditionals ||
          freshCotizacion.totalAdditionals ||
          0,
        totalAmount:
          freshCotizacion.totalamount || freshCotizacion.totalAmount || 0,
      };

      // CLEAN ADDITIONAL COSTS FROM DATABASE - PREVENT CORRUPTION
      const cleanAdditionalCostsFromDB = (() => {
        let cleanCosts = normalizedCotizacion.additionalCosts;

        // If it's a string (serialized), try to parse it
        if (typeof cleanCosts === "string") {
          try {
            cleanCosts = JSON.parse(cleanCosts);
          } catch (error) {
            console.error(" Failed to parse additionalCosts from DB:", error);
            cleanCosts = {};
          }
        }

        // If it's an object with indexed keys (corrupted), extract valid properties
        if (cleanCosts && typeof cleanCosts === "object") {
          const hasIndexedKeys = Object.keys(cleanCosts).some((key) =>
            /^\d+$/.test(key),
          );

          if (hasIndexedKeys) {
            // Extract only non-indexed properties
            const validData = {};
            Object.entries(cleanCosts).forEach(([key, value]) => {
              if (!/^\d+$/.test(key)) {
                validData[key] = value;
              }
            });
            cleanCosts = validData;
          }
        }

        // Ensure we have default values without discarding persisted
        // financial/child fields from additionalcosts JSONB.
        const applyAdditionalCostsToChildren =
          cleanCosts?.applyAdditionalCostsToChildren !== false;
        const result = {
          ...cleanCosts,
          operationalCosts: String(cleanCosts?.operationalCosts || "0"),
          fee: String(cleanCosts?.fee || "0"),
          extraFee: Number(cleanCosts?.extraFee || 0),
          operationalMode: String(cleanCosts?.operationalMode || "fixed"),
          feeMode: String(cleanCosts?.feeMode || "fixed"),
          applyAdditionalCostsToChildren,
          applyOperationalCostsToChildren:
            cleanCosts?.applyOperationalCostsToChildren ??
            applyAdditionalCostsToChildren,
          applyFeeToChildren:
            cleanCosts?.applyFeeToChildren ?? applyAdditionalCostsToChildren,
          applyExtraFeeToChildren:
            cleanCosts?.applyExtraFeeToChildren ?? applyAdditionalCostsToChildren,
          childOperationalMode: String(
            cleanCosts?.childOperationalMode ||
              cleanCosts?.operationalMode ||
              "fixed",
          ),
          childOperationalCosts: String(
            cleanCosts?.childOperationalCosts ??
              cleanCosts?.operationalCosts ??
              "0",
          ),
          childFeeMode: String(
            cleanCosts?.childFeeMode || cleanCosts?.feeMode || "percentage",
          ),
          childFee: String(cleanCosts?.childFee ?? cleanCosts?.fee ?? "0"),
          childExtraFee: String(
            cleanCosts?.childExtraFee ?? cleanCosts?.extraFee ?? "0",
          ),
          finalTotal:
            cleanCosts?.finalTotal ??
            cleanCosts?.final_total ??
            cleanCosts?.visibleSummaryGrandTotal ??
            cleanCosts?.summaryVisibleGrandTotal ??
            null,
          final_total:
            cleanCosts?.final_total ??
            cleanCosts?.finalTotal ??
            cleanCosts?.visibleSummaryGrandTotal ??
            cleanCosts?.summaryVisibleGrandTotal ??
            null,
          grandTotal:
            cleanCosts?.grandTotal ?? cleanCosts?.grand_total ?? null,
          grand_total:
            cleanCosts?.grand_total ?? cleanCosts?.grandTotal ?? null,
          visibleSummaryGrandTotal:
            cleanCosts?.visibleSummaryGrandTotal ??
            cleanCosts?.summaryVisibleGrandTotal ??
            cleanCosts?.acSummaryGrandTotal ??
            null,
          summaryVisibleGrandTotal:
            cleanCosts?.summaryVisibleGrandTotal ??
            cleanCosts?.visibleSummaryGrandTotal ??
            cleanCosts?.acSummaryGrandTotal ??
            null,
          acSummaryGrandTotal:
            cleanCosts?.acSummaryGrandTotal ??
            cleanCosts?.visibleSummaryGrandTotal ??
            cleanCosts?.summaryVisibleGrandTotal ??
            null,
          summaryVisibleParts: Array.isArray(cleanCosts?.summaryVisibleParts)
            ? cleanCosts.summaryVisibleParts
            : [],
          hasIgv: normalizedCotizacion.hasIgv || false,
          igvRate: normalizedCotizacion.igvRate || 18,
        };

        // Extract external additional costs if present
        const externalCosts = cleanCosts?.external || null;

        return { result, externalCosts };
      })();

      // Fetch passengers from pasajero table (migrated from peopledetails column)
      let dbPassengers = [];
      try {
        dbPassengers = await pasajeroService.getPassengersByCotizacion(
          freshCotizacion.id,
        );
      } catch (err) {
        console.log("No passengers found for cotizacion:", err);
      }

      const peopleDetails = buildCotizacionPeopleDetails(
        dbPassengers,
        normalizedCotizacion,
      );

      if (peopleDetails.adults.length === 0 && peopleDetails.children.length === 0) {
        // No passengers in DB yet — create defaults from cantidadPersonas
        peopleDetails.adults = Array(normalizedCotizacion.cantidadPersonas || 1)
          .fill(0)
          .map((_, i) => ({
            id: i + 1,
            age: "18",
            nombres:
              i === 0 ? normalizedCotizacion.titulo?.split(" ")[0] || "" : "",
            apellidos:
              i === 0
                ? normalizedCotizacion.titulo?.split(" ").slice(1).join(" ") ||
                  ""
                : "",
          }));
      }

      // Create a peopleCount object based on the peopleDetails
      const peopleCount = {
        adults: peopleDetails.adults.length || 1,
        children: peopleDetails.children.length || 0,
      };

      // Add enhanced data to the editing cotización
      const enhancedCotizacion = {
        ...normalizedCotizacion,
        peopleDetails,
        peopleCount,
        // Ensure we have days in the expected format
        dias:
          normalizedCotizacion.itinerario || normalizedCotizacion.dias || [],
        // Use cleaned additional costs
        additionalCosts: cleanAdditionalCostsFromDB.result,
        // External additional costs (from nested "external" key in additionalcosts JSONB)
        externalAdditionalCosts: cleanAdditionalCostsFromDB.externalCosts || {
          operationalCosts: "0",
          operationalMode: "fixed",
          fee: "0",
          extraFee: 0,
        },
      };

      setEditingCotizacion(enhancedCotizacion);

      setSelectedPackage(enhancedCotizacion.packageData || {});
      setIsNewPackage(enhancedCotizacion.packageData?.isNewPackage || false);
      setFormData({
        packageData: enhancedCotizacion.packageData || {},
        dias: enhancedCotizacion.dias || [],
        titulo: enhancedCotizacion.titulo || "",
        cantidadPersonas: enhancedCotizacion.cantidadPersonas || 1,
        id: enhancedCotizacion.id || "",
      });

      // Advance to edit step
      setStep(2);
    } catch (err) {
      console.error("Error loading cotizacion for edit:", err);
      showSnackbar(
        `Error al cargar cotización: ${err.message || "Error desconocido"}`,
        "error",
      );
    }
  };

  // Delete a cotizacion with API integration
  const handleDeleteCotizacion = (id, event = null) => {
    // We no longer need position tracking since we're centering the popover

    setDeletePopover({
      isOpen: true,
      id,
      // Remove the position property as we don't need it anymore
    });
  };

  // Confirm delete with API call
  const confirmDelete = async () => {
    const { id } = deletePopover;
    if (!id) return;

    setLoading(true);
    try {
      // Marcar como eliminada inmediatamente para que no reaparezca si el
      // refetch posterior trae datos obsoletos de alguna capa de caché.
      recentlyDeletedCotizacionIdsRef.current.add(id);

      await cotizacionService.deleteCotizacion(id);

      // Update local state to remove the deleted item
      setCotizaciones((prev) =>
        prev.filter((cotizacion) => cotizacion.id !== id),
      );

      invalidateCotizacionGraphCache();
      await fetchCotizaciones();

      showSnackbar("Cotización eliminada exitosamente", "success");
    } catch (err) {
      recentlyDeletedCotizacionIdsRef.current.delete(id);
      console.error(` Error deleting cotizacion ${id}:`, err);
      showSnackbar(
        `Error al eliminar cotización: ${err.message || "Error desconocido"}`,
        "error",
      );
    } finally {
      setLoading(false);
      setDeletePopover({
        isOpen: false,
        id: null,
      });
    }
  };

  // Cancel deletion
  const cancelDelete = () => {
    setDeletePopover({
      isOpen: false,
      id: null,
    });
  };

  // Duplicate a quote-only cotizacion without PDF or voucher state.
  const handleDuplicarModelo = async (cotizacion) => {
    setLoading(true);
    try {
      const duplicateData = {
        id: cotizacion.id,
        createdby: user?.dni || "SYSTEM",
      };

      console.log(" Clonando cotizacion sin estado de PDF ni voucher");
      const cloneResult = await cotizacionService.duplicarCotizacionModelo(
        duplicateData,
      );

      //  Actualización optimista: insertar el registro clonado en el listado
      //  inmediatamente mientras se completa el refetch con datos frescos.
      const clonedId = cloneResult?.id;
      if (clonedId) {
        const nowIso = new Date().toISOString();
        const clonedPlaceholder = {
          ...cotizacion,
          id: clonedId,
          titulo: `duplicado - ${cotizacion.titulo || ""}`,
          status: "ACTIVE",
          tiene_voucher: false,
          es_procesado: false,
          is_active: true,
          createdat: nowIso,
          updatedat: nowIso,
          createdby: user?.dni || "SYSTEM",
        };
        setCotizaciones((prev) => [clonedPlaceholder, ...prev]);
      }

      invalidateCotizacionGraphCache();
      await fetchCotizaciones();

      setSnackbar({
        show: true,
        message: "Cotizacion clonada exitosamente",
        type: "success",
      });
    } catch (err) {
      console.error(" Error cloning quote-only cotizacion:", err);
      setSnackbar({
        show: true,
        message: `Error al clonar cotizacion: ${err.message || "Error desconocido"}`,
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  // Format date
  const formatDate = (dateString) => {
    const options = {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    };
    return new Date(dateString).toLocaleString("es-ES", options);
  };

  // Format currency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  // Extract client data for voucher
  const extractClientDataFromCotizacion = (cotizacion) => {
    const clientData = {
      nombres: cotizacion.titulo.split(" ")[0] || "",
      apellidos: cotizacion.titulo.split(" ").slice(1).join(" ") || "",
      correo: "",
      nacionalidad: "",
      edad: "",
    };

    if (
      cotizacion.peopleDetails &&
      cotizacion.peopleDetails.adults &&
      cotizacion.peopleDetails.adults.length > 0
    ) {
      const mainPerson = cotizacion.peopleDetails.adults[0];
      if (mainPerson.age) {
        clientData.edad = mainPerson.age;
      }
    }

    return clientData;
  };

  // Open voucher modal
  const handleVoucher = (cotizacion) => {
    const clientData = extractClientDataFromCotizacion(cotizacion);

    setVoucherCotizacion({
      ...cotizacion,
      clientData,
    });
    setIsVoucherOpen(true);
  };

  // Open PDF preview
  const handlePdfPreview = (cotizacion) => {
    setPreviewCotizacion(cotizacion);
    setPdfPreviewOpen(true);
  };

  // Procesar cotización para PDF
  const handleProcessCotizacion = async (cotizacionId, infoPdf) => {
    try {
      const result = await cotizacionService.processCotizacion(
        cotizacionId,
        infoPdf,
      );
      console.log(" Cotización procesada:", result);
      invalidateCotizacionGraphCache();
      await fetchCotizaciones();
      return result;
    } catch (error) {
      console.error(" Error al procesar cotización:", error);
      showSnackbar("Error al procesar la cotización", "error");
      throw error;
    }
  };

  // Verificar si una cotización ha sido procesada
  const handleCheckProcesado = async (cotizacionId) => {
    try {
      const result =
        await cotizacionService.checkCotizacionProcesado(cotizacionId);
      return result?.es_procesado ?? false;
    } catch (error) {
      console.error(" Error al verificar procesamiento:", error);
      return false;
    }
  };

  // Filtrar cotizaciones recién eliminadas para evitar que reaparezcan
  // por un refetch con caché obsoleto.
  const visibleCotizaciones = useMemo(() => {
    const deletedIds = recentlyDeletedCotizacionIdsRef.current;
    return cotizaciones.filter((c) => !deletedIds.has(c.id));
  }, [cotizaciones]);

  return {
    // States
    cotizaciones: visibleCotizaciones,
    selectedCotizacion,
    step,
    selectedPackage,
    isNewPackage,
    editingCotizacion,
    formData,
    snackbar,
    deletePopover,
    showClientInfo,
    clientData,
    isVoucherOpen,
    voucherCotizacion,
    pdfPreviewOpen,
    previewCotizacion,
    loading: loading || isCotizacionesLoading,
    error: error || (cotizacionesError?.message ?? null),

    // Functions
    setCotizaciones,
    setSelectedCotizacion,
    setStep,
    setSnackbar,
    showSnackbar,
    resetCotizacionState,
    viewCotizacionDetails,
    handlePackageSelection,
    handlePackageEdit,
    handleEditCotizacion,
    handleDeleteCotizacion,
    confirmDelete,
    cancelDelete,
    formatDate,
    formatCurrency,
    handleVoucher,
    handlePdfPreview,
    setIsVoucherOpen,
    setPdfPreviewOpen,
    setShowClientInfo,
    setClientData,
    handleDuplicarModelo,
    fetchCotizaciones,
    handleProcessCotizacion,
    handleCheckProcesado,
  };
}

export { useCotizaciones };
export default useCotizaciones;
