import { useState, useCallback, useMemo } from "react";
import ReactDOM from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../../../config/queryClient";
import { useAuth } from "../../../context/AuthContext";
import {
  MdAdd,
  MdClose,
  MdCardTravel,
  MdSearch,
  MdFilterList,
  MdLock,
  MdPublic,
} from "react-icons/md";

import { formatCurrency } from "../../../components/Ventas/Cotizaciones/EdicionCotizacion/utils/formatters";
import {
  hydrateServiceFromDB,
  cleanServiceForDB,
} from "../../../components/Ventas/Cotizaciones/EdicionCotizacion/utils/itinerarioCleanupUtils";
import ServicePicker from "../../../components/Ventas/Cotizaciones/EdicionCotizacion/components/ServicePicker/ServicePicker";
import ExtraServiceModal from "../../../components/Ventas/Cotizaciones/EdicionCotizacion/components/ServicePicker/components/ExtraServiceModal/ExtraServiceModal";

import PackageCard from "./components/PackageCard";
import PackageFormModal from "./components/PackageFormModal";
import ItineraryModal from "./components/ItineraryModal";

import paqueteService from "./services/paqueteService";
import { normalizeNullablePackageFee } from "../../../utils/packageFeeUtils";

import "./Paquetes.scss";

const Paquetes = () => {
  const { auth } = useAuth();
  const queryClientInstance = useQueryClient();
  const defaultPackageVisibility = Number(auth?.role) === 0;

  // Usar useQuery para compartir caché y evitar fetches duplicados
  const {
    data: paquetes = [],
    isLoading: queryLoading,
    error: queryError,
  } = useQuery({
    queryKey: queryKeys.paquetes.lists(),
    queryFn: async () => {
      const response = await paqueteService.getAllPaquetes();
      if (response.success) {
        return response.data || [];
      }
      throw new Error(response.message || "Error al cargar los paquetes");
    },
    staleTime: 1000 * 60 * 15, // 15 minutos
  });
  // Estado para loading de operaciones CRUD (crear, editar, eliminar)
  const [mutLoading, setMutLoading] = useState(false);
  const loading = queryLoading || mutLoading;
  const error = queryError?.message || null;

  // State for the current package being edited
  const [currentPaquete, setCurrentPaquete] = useState(null);

  // State for package form
  const [packageForm, setPackageForm] = useState({
    id: "",
    nombre: "",
    descripcion: "",
    precio: "",
    fee: "",
    imagen: "",
    packagetype: "compartido",
    destacado: false,
    es_general: defaultPackageVisibility,
  });

  // Add missing modal state variables
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState(""); // 'create', 'edit', 'itinerary'

  // Add missing itinerary state variables
  const [showItineraryModal, setShowItineraryModal] = useState(false);
  const [currentItinerary, setCurrentItinerary] = useState([]);
  const [itineraryTitle, setItineraryTitle] = useState("");
  const [packageType, setPackageType] = useState("compartido");

  // Add missing direct itinerary modal state
  const [showDirectItineraryModal, setShowDirectItineraryModal] =
    useState(false);

  // Add missing service selector modal state
  const [showServiceModal, setShowServiceModal] = useState(false);
  const [showExtraServiceModal, setShowExtraServiceModal] = useState(false);
  const [currentDayIndex, setCurrentDayIndex] = useState(null);
  const [selectedServiceCategory, setSelectedServiceCategory] =
    useState("transportes");
  const [selectedParent, setSelectedParent] = useState(null); // Add missing selectedParent state
  const [replacingServiceIndex, setReplacingServiceIndex] = useState(null); // Para cambiar servicio existente

  // Add snackbar state
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: "",
    type: "success",
  });

  // Search and filter state
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("all"); // 'all', 'general', 'mine'

  // Memoized filtered packages
  const filteredPaquetes = useMemo(() => {
    let result = paquetes;
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter(
        (pkg) =>
          (pkg.nombre || "").toLowerCase().includes(term) ||
          (pkg.descripcion || "").toLowerCase().includes(term) ||
          (pkg.id || "").toLowerCase().includes(term),
      );
    }
    if (filterType === "general") {
      result = result.filter((pkg) => pkg.es_general);
    } else if (filterType === "mine") {
      result = result.filter((pkg) => !pkg.es_general);
    }
    return result;
  }, [paquetes, searchTerm, filterType]);

  const generales = useMemo(
    () => filteredPaquetes.filter((pkg) => pkg.es_general),
    [filteredPaquetes],
  );
  const personales = useMemo(
    () => filteredPaquetes.filter((pkg) => !pkg.es_general),
    [filteredPaquetes],
  );

  // Invalidar caché de paquetes (reemplaza el antiguo refreshTrigger)
  const syncPaqueteInCache = useCallback(
    (updatedPaquete) => {
      if (!updatedPaquete?.id) return;

      queryClientInstance.setQueryData(queryKeys.paquetes.lists(), (old) => {
        if (!Array.isArray(old)) return old;

        const exists = old.some((pkg) => pkg.id === updatedPaquete.id);
        if (!exists) {
          return [updatedPaquete, ...old];
        }

        return old.map((pkg) =>
          pkg.id === updatedPaquete.id ? { ...pkg, ...updatedPaquete } : pkg,
        );
      });
    },
    [queryClientInstance],
  );

  const refreshPaquetes = useCallback(async () => {
    await queryClientInstance.invalidateQueries({
      queryKey: queryKeys.paquetes.lists(),
      exact: true,
    });
    await queryClientInstance.refetchQueries({
      queryKey: queryKeys.paquetes.lists(),
      exact: true,
      type: "active",
    });
  }, [queryClientInstance]);

  const markPaquetesStale = useCallback(async () => {
    await queryClientInstance.invalidateQueries({
      queryKey: queryKeys.paquetes.lists(),
      exact: true,
      refetchType: "none",
    });
  }, [queryClientInstance]);

  // Show snackbar function
  const showSnackbar = (message, type = "success") => {
    setSnackbar({
      open: true,
      message,
      type,
    });

    // Auto dismiss after 3 seconds
    setTimeout(() => {
      setSnackbar((prev) => ({ ...prev, open: false }));
    }, 3000);
  };

  // Corregir la función handleSubmitPackage con una estructura lógica apropiada
  const handleSubmitPackage = async (e) => {
    e.preventDefault();

    try {
      setMutLoading(true);

      // IMPORTANTE: Manejar correctamente el itinerario para preservarlo
      let itinerarioOriginal = [];
      if (currentPaquete) {
        // Si estamos editando un paquete existente
        if (
          packageForm._tempItinerary &&
          packageForm._tempItinerary.length > 0
        ) {
          // Si tenemos un itinerario temporal (modificado), usamos ese
          itinerarioOriginal = packageForm._tempItinerary;
        } else if (
          currentPaquete.itinerario &&
          currentPaquete.itinerario.length > 0
        ) {
          // Si no hay itinerario temporal pero sí hay uno original, usamos el original sin procesar
          itinerarioOriginal = currentPaquete.itinerario;
        } else if (
          packageForm._originalItinerary &&
          packageForm._originalItinerary.length > 0
        ) {
          // Como respaldo, si tenemos el itinerario original guardado en el form
          itinerarioOriginal = packageForm._originalItinerary;
        } else {
          // Si no hay itinerario, enviamos un array vacío
          itinerarioOriginal = [];
        }
      } else {
        // Si estamos creando un nuevo paquete, usamos el itinerario temporal si existe
        itinerarioOriginal = packageForm._tempItinerary || [];
      }

      // CALCULAR PRECIO TOTAL AUTOMÁTICAMENTE desde el itinerario SIN FORMATEAR
      let precioTotal = 0;

      // Calcular precio total desde itinerario original que tiene todos los campos
      if (itinerarioOriginal && itinerarioOriginal.length > 0) {
        itinerarioOriginal.forEach((dia) => {
          if (dia.servicios && dia.servicios.length > 0) {
            dia.servicios.forEach((servicio) => {
              // Use pre-calculated precioTotal from backend when available
              const precioOriginal = parseFloat(
                servicio.precioTotal ||
                  servicio.tariff?.precio_original ||
                  servicio.precioServicio ||
                  servicio.precio_original ||
                  servicio.precio ||
                  0,
              );
              const cantidad = parseInt(servicio.cantidad) || 1;
              precioTotal += precioOriginal * cantidad;
            });
          }
        });
      }

      // AHORA formatear el itinerario para el backend (sin campos innecesarios)
      const finalItinerary = formatItinerarioForBackend(itinerarioOriginal);

      const rawFee = packageForm.fee;
      const packageFee = normalizeNullablePackageFee(rawFee);
      if (String(rawFee ?? "").trim() !== "" && packageFee === null) {
        throw new Error("El fee debe ser un porcentaje entre 0 y 100");
      }

      // Prepare data for API
      const formData = {
        nombre: packageForm.nombre,
        descripcion: packageForm.descripcion || "",
        precio: precioTotal,
        fee: packageFee,
        destacado: packageForm.destacado || false,
        es_general: Boolean(packageForm.es_general),
        imagen: packageForm.imagen || "",
        packagetype: packageForm.packagetype || "compartido",
        itinerario: finalItinerary,
      };

      let response;

      // Create new package or update existing one
      if (currentPaquete) {
        // Update existing package
        response = await paqueteService.updatePaquete(
          currentPaquete.id,
          formData,
        );
      } else {
        // Create new package
        response = await paqueteService.createPaquete(formData);
      }

      if (response.success) {
        const updatedPaqueteForCache =
          currentPaquete && response.data ? response.data : null;

        if (updatedPaqueteForCache) {
          await queryClientInstance.cancelQueries({
            queryKey: queryKeys.paquetes.lists(),
            exact: true,
          });
          syncPaqueteInCache(updatedPaqueteForCache);
        }

        showSnackbar(
          ` Paquete ${currentPaquete ? "actualizado" : "creado"} correctamente`,
          "success",
        );

        // Reset form and close modal
        setPackageForm({
          id: "",
          nombre: "",
          descripcion: "",
          precio: "",
          fee: "",
          imagen: "",
          destacado: false,
          es_general: defaultPackageVisibility,
          packagetype: "compartido",
          _tempItinerary: null,
          _originalItinerary: null,
        });
        setCurrentPaquete(null);
        setShowModal(false);

        if (updatedPaqueteForCache) {
          await markPaquetesStale();
        } else {
          await refreshPaquetes();
        }
      } else {
        throw new Error(
          response.message ||
            `Error al ${currentPaquete ? "actualizar" : "crear"} paquete`,
        );
      }
    } catch (err) {
      console.error(
        `Error al ${currentPaquete ? "actualizar" : "crear"} paquete:`,
        err,
      );
      showSnackbar(` Error: ${err.message}`, "error");
    } finally {
      setMutLoading(false);
    }
  };

  // Mejorar la función de formateo para el backend para asegurar compatibilidad
  const formatItinerarioForBackend = (days) => {
    if (!days || !Array.isArray(days)) return [];

    // Asegurémonos de que estamos enviando correctamente numerados los días
    return days.map((day, index) => {
      const formattedDay = {
        numero: index + 1, // Asegurar una numeración consecutiva
        titulo: day.titulo || "",
        ciudades: day.ciudades || [], // Preservar ciudades
        // Excluir hoteles: los paquetes turísticos NO deben contener servicios de hotel
        servicios: (day.servicios || [])
          .filter((s) => {
            const ts = (
              s?.parentService?.typeService ||
              s?.typeService ||
              ""
            ).toLowerCase();
            return ts !== "hoteles";
          })
          .map((servicio) => {
            // Use cleanServiceForDB for proper flat field output
            const cleaned = cleanServiceForDB(servicio);
            if (!cleaned) return null;

            // Preservar ID de servicio del DB para UPSERT
            if (servicio.db_id != null) {
              cleaned.id = servicio.db_id;
            }

            return cleaned;
          })
          .filter(Boolean),
      };

      // Preservar ID del día del DB para UPSERT
      if (day.db_id != null) {
        formattedDay.id = day.db_id;
      }

      // Preservar otras propiedades del día
      if (day.descripcion !== undefined) {
        formattedDay.descripcion = day.descripcion;
      }

      return formattedDay;
    });
  };

  // Función para convertir el formato del itinerario del backend al frontend
  const formatItinerarioFromBackend = (itinerario) => {
    if (!itinerario || !Array.isArray(itinerario)) return [];

    return itinerario.map((day) => ({
      id: `day-${day.numero}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      db_id: typeof day.id === "number" ? day.id : undefined, // Preservar ID de DB
      numero: day.numero,
      titulo: day.titulo || "",
      ciudades: day.ciudades || [], // Preservar ciudades
      descripcion: day.descripcion || "", // Preservar descripción
      // Excluir hoteles al cargar del backend (paquetes legacy podrían tener hoteles)
      servicios: (day.servicios || [])
        .filter((s) => {
          const ts = (
            s?.parentService?.typeService ||
            s?.typeService ||
            ""
          ).toLowerCase();
          return ts !== "hoteles";
        })
        .map((servicio) => {
          // Preservar DB ID del servicio
          const srvDbId =
            typeof servicio.id === "number" ? servicio.id : undefined;
          const shouldHydrateNormalizedService =
            Boolean(servicio.typeService) ||
            Boolean(servicio.parentService) ||
            Boolean(servicio.childService) ||
            Boolean(servicio.tariff) ||
            servicio.precioServicio != null;

          // Hydrate service from new flat DB fields (moneda, precioServicio, etc.)
          // or from old tariff sub-object format
          if (shouldHydrateNormalizedService) {
            const hydrated = hydrateServiceFromDB(servicio);
            const extraSource =
              servicio.childService?.servicio_extra ||
              hydrated?.childService?.servicio_extra ||
              {};
            const resolvedType =
              hydrated?.typeService || servicio.typeService || servicio.categoria;
            const resolvedName =
              hydrated?.nombre ||
              servicio.nombre ||
              hydrated?.parentService?.nombre ||
              hydrated?.childService?.nombre ||
              extraSource.nombre ||
              "Servicio sin nombre";
            return {
              ...hydrated,
              db_id: srvDbId,
              id:
                hydrated?.id ||
                `service-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              typeService: resolvedType,
              categoria: servicio.categoria || resolvedType || "",
              nombre: resolvedName,
              cantidad: parseInt(servicio.cantidad) || 1,
            };
          }

          // Si el servicio tiene solo estructura simple (servicios de paquetes legacy)
          const precio = parseFloat(
            servicio.precioServicio ||
              servicio.tariff?.precio ||
              servicio.precio ||
              0,
          );

          return {
            db_id: srvDbId,
            id:
              servicio.id ||
              `service-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            nombre: servicio.nombre || "Servicio sin nombre",
            descripcion: servicio.descripcion || "",
            categoria: servicio.categoria || "",
            precio: precio,
            cantidad: parseInt(servicio.cantidad) || 1,
            serviceDetails: servicio.serviceDetails || {},
            parentData: servicio.parentData || null,
            ...(servicio.parentService && {
              parentService: servicio.parentService,
            }),
            ...(servicio.childService && {
              childService: servicio.childService,
            }),
            tariff: {
              precio: precio,
              precio_original: servicio.originalPrecio || precio,
              tieneIgv: false,
            },
            adjustment: servicio.adjustment || null,
            originalPrecio: servicio.originalPrecio || precio,
          };
        }),
    }));
  };

  // Function to prepare initial days based on the itinerary needs
  const prepareInitialDays = () => {
    // Create an initial single day to start with
    return [
      {
        id: `day-1-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        numero: 1,
        titulo: `Día 1`,
        descripcion: "",
        servicios: [],
      },
    ];
  };

  // Open direct itinerary editing during package creation
  const handleOpenDirectItinerary = () => {
    // Generate initial days structure based on the duracion field
    const initialDays = packageForm._tempItinerary || prepareInitialDays();
    setCurrentItinerary(initialDays);
    setItineraryTitle(packageForm.nombre || "");
    // Make sure we're using the existing packageType if available
    setPackageType(packageForm.packagetype || "compartido");

    // Ensure we hide the package creation modal first to prevent layering issues
    setShowModal(false);
    // Then show the itinerary modal after a very short delay
    setTimeout(() => {
      setShowDirectItineraryModal(true);
    }, 50); // Short timeout to ensure DOM updates properly
  };

  // Save direct itinerary changes and return to package form
  const handleSaveDirectItinerary = () => {
    try {
      // Close the itinerary modal
      setShowDirectItineraryModal(false);

      // Asegurar que se está utilizando un formato limpio y consistente
      const formattedItinerary = currentItinerary.map((day, index) => ({
        ...day,
        numero: index + 1, // Garantizar numeración consecutiva
      }));

      // Update the package form with the itinerary data
      setPackageForm((prev) => ({
        ...prev,
        _tempItinerary: formattedItinerary,
        nombre: itineraryTitle || prev.nombre, // Update package name if changed
        packagetype: packageType, // Preserve package type selection
      }));

      // Show success message with snackbar
      showSnackbar(" Itinerario actualizado correctamente", "success");

      // Show the package creation modal again after a short delay
      setTimeout(() => {
        setShowModal(true);
      }, 50);
    } catch (error) {
      console.error("Error al guardar itinerario:", error);
      showSnackbar(` Error: ${error.message}`, "error");
    }
  };

  // Handle cancel direct itinerary editing
  const handleCancelDirectItinerary = () => {
    // If we're editing a new package (not created yet), discard itinerary changes
    if (!currentPaquete) {
      // Ask user to confirm if there are changes to discard
      if (
        currentItinerary &&
        currentItinerary.length > 0 &&
        currentItinerary.some(
          (day) => day.servicios && day.servicios.length > 0,
        )
      ) {
        if (
          !window.confirm(
            "¿Estás seguro de cancelar? Se perderán los cambios en el itinerario.",
          )
        ) {
          return; // Don't close if user cancels
        }
      }
    }

    // Close the modal without saving changes
    setShowDirectItineraryModal(false);

    // Return to the package creation modal after a short delay
    setTimeout(() => {
      setShowModal(true);
    }, 50);
  };

  // Handle form input changes
  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setPackageForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  // Delete package
  const handleDeletePackage = async (pkg) => {
    if (window.confirm("¿Estás seguro de eliminar este paquete?")) {
      try {
        setMutLoading(true);

        const response = await paqueteService.deletePaquete(pkg.id);

        if (response.success) {
          showSnackbar(" Paquete eliminado correctamente", "success");
          // Actualizar la lista de paquetes
          await refreshPaquetes();
        } else {
          throw new Error(response.message || "Error al eliminar paquete");
        }
      } catch (err) {
        console.error("Error al eliminar paquete:", err);
        showSnackbar(` Error: ${err.message}`, "error");
      } finally {
        setMutLoading(false);
      }
    }
  };

  // Toggle package featured status
  const handleToggleFeatured = async (pkg) => {
    try {
      setMutLoading(true);

      const response = await paqueteService.toggleDestacado(pkg.id);

      if (response.success) {
        showSnackbar(" Estado destacado actualizado", "success");
        // Optimistic update: patch the cache immediately with the server response
        const updatedPkg = response.data;
        queryClientInstance.setQueryData(queryKeys.paquetes.lists(), (old) =>
          old?.map((p) =>
            p.id === updatedPkg.id ? { ...p, ...updatedPkg } : p,
          ),
        );
      } else {
        throw new Error(
          response.message || "Error al actualizar estado destacado",
        );
      }
    } catch (err) {
      console.error("Error al cambiar estado destacado:", err);
      showSnackbar(` Error: ${err.message}`, "error");
    } finally {
      setMutLoading(false);
    }
  };

  // Función para cargar un paquete para edición con su itinerario completo
  const handleEditPackage = (pkg) => {
    // Create a deep copy to avoid modifying the original
    const packageCopy = JSON.parse(JSON.stringify(pkg));

    setCurrentPaquete(packageCopy);
    setPackageForm({
      id: packageCopy.id,
      nombre: packageCopy.nombre || "",
      descripcion: packageCopy.descripcion || "",
      precio: packageCopy.precio || "",
      fee: packageCopy.fee ?? "",
      imagen: packageCopy.imagen || "",
      destacado: packageCopy.destacado || false,
      es_general: Boolean(packageCopy.es_general),
      packagetype: packageCopy.packagetype || "compartido",
      // Guardamos el itinerario original en _originalItinerary para referencia
      _originalItinerary: packageCopy.itinerario || [],
      // Y también en _tempItinerary si lo modificamos en el editor directo
      _tempItinerary: formatItinerarioFromBackend(packageCopy.itinerario || []),
    });
    setShowModal(true);
    setModalType("edit");
  };

  // Edit itinerary while ensuring proper cloning
  const handleEditItinerary = (pkg) => {
    // Create a deep copy to avoid modifying the original
    const packageCopy = JSON.parse(JSON.stringify(pkg));

    setCurrentPaquete(packageCopy);
    setCurrentItinerary(
      formatItinerarioFromBackend(packageCopy.itinerario || []),
    );
    setPackageType(packageCopy.packagetype || "compartido");
    setItineraryTitle(packageCopy.nombre || "");
    setShowItineraryModal(true);
  };

  // Save itinerary changes
  const handleSaveItinerary = async () => {
    try {
      setMutLoading(true);

      // Formatear el itinerario para el backend con más validaciones
      const formattedItinerario = formatItinerarioForBackend(currentItinerary);

      // Verificar que el itinerario no esté vacío
      if (!formattedItinerario.length) {
        showSnackbar(" El itinerario no puede estar vacío", "error");
        setMutLoading(false);
        return;
      }

      // Calculate new price based on the itinerary for UI feedback
      const newTotalPrice = calculatePackageTotal(currentItinerary);
      const originalPrice = parseFloat(currentPaquete.precio) || 0;
      const priceChanged = Math.abs(newTotalPrice - originalPrice) > 0.01;

      // Call API to update itinerary
      const response = await paqueteService.updateItinerario(
        currentPaquete.id,
        formattedItinerario,
      );

      if (response.success) {
        // Create a more detailed success message
        let successMessage = " Itinerario actualizado correctamente";

        // Add price change info to the message if relevant
        if (priceChanged) {
          successMessage += `. El precio se ha actualizado de ${formatCurrency(originalPrice)} a ${formatCurrency(newTotalPrice)}`;
        }

        showSnackbar(successMessage, "success");

        // Ahora también actualizar explícitamente el precio para asegurar sincronización
        // Si el precio ha cambiado, forzamos una actualización explícita
        if (priceChanged) {
          try {
            const priceUpdateResponse = await paqueteService.updatePrecio(
              currentPaquete.id,
              { precio: newTotalPrice },
            );

            if (!priceUpdateResponse.success) {
              console.warn("No se pudo actualizar el precio explícitamente");
            }
          } catch (priceErr) {
            console.error("Error al actualizar precio:", priceErr);
          }
        }

        // Update the package name and type if changed
        if (
          itineraryTitle !== currentPaquete.nombre ||
          packageType !== currentPaquete.packagetype
        ) {
          try {
            await paqueteService.updatePaquete(currentPaquete.id, {
              nombre: itineraryTitle,
              packagetype: packageType,
            });
          } catch (nameErr) {
            console.error("Error al actualizar nombre/tipo:", nameErr);
          }
        }

        // Close modal and reset state
        setShowItineraryModal(false);
        setCurrentItinerary([]);
        setCurrentPaquete(null);
        setItineraryTitle("");

        // Refresh the packages list
        await refreshPaquetes();
      } else {
        throw new Error(response.message || "Error al actualizar itinerario");
      }
    } catch (err) {
      console.error("Error al guardar itinerario:", err);
      showSnackbar(` Error: ${err.message}`, "error");
    } finally {
      setMutLoading(false);
    }
  };

  // Handle service selection for a day in the itinerary (igual que EdiciónCotización)
  const handleServiceSelection = useCallback(
    (service) => {
      if (currentDayIndex !== null) {
        const updatedItinerary = [...currentItinerary];

        // Ensure the day has a servicios array
        if (!updatedItinerary[currentDayIndex].servicios) {
          updatedItinerary[currentDayIndex].servicios = [];
        }

        if (replacingServiceIndex !== null) {
          // Reemplazar servicio existente
          updatedItinerary[currentDayIndex].servicios[replacingServiceIndex] = {
            ...service,
            cantidad: 1,
            packageType: packageType,
            precios: service.precios,
          };
        } else {
          // Add the service with default quantity
          updatedItinerary[currentDayIndex].servicios.push({
            ...service,
            cantidad: 1,
            packageType: packageType,
            precios: service.precios,
          });
        }

        setCurrentItinerary(updatedItinerary);
      }

      setShowServiceModal(false);
      setSelectedParent(null);
      setReplacingServiceIndex(null);
    },
    [currentDayIndex, currentItinerary, packageType, replacingServiceIndex],
  );

  // Handler específico para cerrar el modal de servicios (igual que EdiciónCotización)
  const handleCloseServiceModal = useCallback(() => {
    setShowServiceModal(false);
    setReplacingServiceIndex(null);
  }, []);

  const normalizeExtraServiceForItinerary = (extraService) => {
    const childService = extraService?.childService || {};
    const parentService = extraService?.parentService || {};
    const tariff = extraService?.tariff || {};
    const precio = parseFloat(
      extraService?.precioServicio ??
        extraService?.precio ??
        tariff.precio ??
        tariff.precio_original ??
        0,
    );
    const safePrice = Number.isFinite(precio) ? precio : 0;
    const extraId =
      childService.id_servicio_extra ??
      childService.servicio_extra?.id ??
      parentService.id_servicio_extra ??
      extraService?.id_servicio_extra ??
      null;
    const nombre =
      childService.nombre ||
      childService.servicio_extra?.nombre ||
      parentService.nombre ||
      extraService?.nombre ||
      "Servicio extra";
    const descripcion =
      childService.descripcion ||
      childService.servicio_extra?.descripcion ||
      parentService.descripcion ||
      extraService?.descripcion ||
      "";

    return {
      ...extraService,
      id:
        extraService?.id ||
        `extra-${extraId || Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      typeService: "extras",
      categoria: "extras",
      nombre,
      descripcion,
      cantidad: parseInt(extraService?.cantidad, 10) || 1,
      packageType,
      precio: safePrice,
      precioServicio: safePrice,
      precioTotal: safePrice,
      originalPrecio: parseFloat(extraService?.originalPrecio ?? safePrice) || safePrice,
      parentService: {
        ...parentService,
        typeService: "extras",
        nombre,
        descripcion,
        ...(extraId ? { id_servicio_extra: extraId } : {}),
      },
      childService: {
        ...childService,
        nombre,
        descripcion,
        packageType,
        ...(extraId ? { id_servicio_extra: extraId } : {}),
      },
      tariff: {
        ...tariff,
        precio: safePrice,
        precio_original: parseFloat(tariff.precio_original ?? safePrice) || safePrice,
        tipo_tarifa: tariff.tipo_tarifa || packageType,
        tieneIgv: Boolean(tariff.tieneIgv || tariff.tiene_igv),
        moneda: tariff.moneda || "dolares",
      },
    };
  };

  // Handle extra service addition
  const handleExtraServiceSave = (extraService) => {
    if (currentDayIndex !== null) {
      setCurrentItinerary((prevItinerary) => {
        if (!Array.isArray(prevItinerary) || !prevItinerary[currentDayIndex]) {
          return prevItinerary;
        }

        return prevItinerary.map((day, index) => {
          if (index !== currentDayIndex) return day;

          return {
            ...day,
            servicios: [
              ...(Array.isArray(day.servicios) ? day.servicios : []),
              normalizeExtraServiceForItinerary(extraService),
            ],
          };
        });
      });
    }

    setShowExtraServiceModal(false);
  };

  // Wrapper function for compatibility with child components that expect calculateTotalPrice
  const calculateTotalPrice = (services) => {
    if (!services || !Array.isArray(services)) return 0;
    return services.reduce((total, service) => {
      const price = parseFloat(
        service.tariff?.precio || service.precioServicio || service.precio || 0,
      );
      return total + price;
    }, 0);
  };

  // Calculate total price for the package based on itinerary
  const calculatePackageTotal = (itinerary) => {
    if (!itinerary || !Array.isArray(itinerary)) return 0;

    // USAR LA MISMA LÓGICA que en handleSubmitPackage
    let precioTotal = 0;

    itinerary.forEach((dia) => {
      if (dia.servicios && dia.servicios.length > 0) {
        dia.servicios.forEach((servicio) => {
          // Use pre-calculated precioTotal from backend when available
          const precioOriginal = parseFloat(
            servicio.precioTotal ||
              servicio.tariff?.precio_original ||
              servicio.precioServicio ||
              servicio.precio_original ||
              servicio.precio ||
              0,
          );
          const cantidad = parseInt(servicio.cantidad) || 1;
          precioTotal += precioOriginal * cantidad;
        });
      }
    });

    return precioTotal;
  };

  // Get the display price for a package (from precio or calculated from itinerary)
  const getPackageDisplayPrice = (pkg) => {
    // Si el paquete tiene un precio válido, usarlo (manejar string y number)
    const precioNumerico = parseFloat(pkg.precio);
    if (pkg.precio && !isNaN(precioNumerico) && precioNumerico > 0) {
      return precioNumerico;
    }

    // Si no tiene precio o es 0, calcularlo desde el itinerario
    if (pkg.itinerario && pkg.itinerario.length > 0) {
      let parsedItinerary = pkg.itinerario;

      // Si es string, parsearlo
      if (typeof parsedItinerary === "string") {
        try {
          parsedItinerary = JSON.parse(parsedItinerary);
        } catch (e) {
          console.warn("Error parsing itinerary:", e);
          return 0;
        }
      }

      return calculatePackageTotal(parsedItinerary);
    }

    return 0;
  };

  // Add the missing handleCloseModal function
  const handleCloseModal = () => {
    // Close the modal
    setShowModal(false);
    // Reset form if needed
    if (!currentPaquete) {
      setPackageForm({
        id: "",
        nombre: "",
        descripcion: "",
        precio: "",
        fee: "",
        imagen: "",
        destacado: false,
        es_general: defaultPackageVisibility,
        packagetype: "compartido",
        _tempItinerary: null,
      });
    }
  };

  // Define the missing handleAddPackage function
  const handleAddPackage = () => {
    setCurrentPaquete(null);
    setPackageForm({
      id: "",
      nombre: "",
      descripcion: "",
      precio: "",
      fee: "",
      imagen: "",
      destacado: false,
      es_general: defaultPackageVisibility,
      packagetype: "compartido",
      _tempItinerary: null,
      _originalItinerary: null,
    });
    setShowModal(true);
    setModalType("create");
  };

  return (
    <div className="paq">
      {/* ── Header ── */}
      <header className="paq__header">
        <div className="paq__title-row">
          <h1 className="paq__title">Paquetes Turísticos</h1>
          <button
            className="paq__btn-create"
            onClick={() => handleAddPackage()}
          >
            <MdAdd /> Nuevo
          </button>
        </div>

        <div className="paq__toolbar">
          <div className="paq__search">
            <MdSearch className="paq__search-icon" />
            <input
              type="text"
              placeholder="Buscar por nombre, descripción o ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button
                className="paq__search-clear"
                onClick={() => setSearchTerm("")}
              >
                <MdClose />
              </button>
            )}
          </div>
          <div className="paq__filters">
            <MdFilterList className="paq__filter-icon" />
            {[
              { value: "all", label: "Todos", icon: null },
              { value: "general", label: "Generales", icon: <MdPublic /> },
              { value: "mine", label: "Solo para mí", icon: <MdLock /> },
            ].map((filter) => (
              <button
                key={filter.value}
                className={`paq__filter-chip paq__filter-chip--${filter.value}${filterType === filter.value ? " active" : ""}`}
                onClick={() => setFilterType(filter.value)}
              >
                {filter.icon}
                <span>{filter.label}</span>
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* ── Loading / Error ── */}
      {loading && (
        <div className="paq__loader">
          <div className="paq__spinner" />
        </div>
      )}
      {error && <div className="paq__error">{error}</div>}

      {/* ── Destacados ── */}
      {/* ── Públicos / Generales ── */}
      {generales.length > 0 && (
        <section className="paq__section paq__section--general">
          <h2 className="paq__section-title">
            <MdPublic /> Públicos / Generales{" "}
            <span className="paq__section-count">{generales.length}</span>
          </h2>
          <div className="paq__rows">
            {generales.map((pkg) => (
              <PackageCard
                key={pkg.id}
                pkg={pkg}
                onEditItinerary={handleEditItinerary}
                onEdit={handleEditPackage}
                onToggleFeatured={handleToggleFeatured}
                onDelete={handleDeletePackage}
                getDisplayPrice={getPackageDisplayPrice}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── Personales ── */}
      {(personales.length > 0 || generales.length === 0) && (
        <section className="paq__section">
          <h2 className="paq__section-title">
            <MdCardTravel />{" "}
            {generales.length > 0
              ? "Mis Paquetes / Privados"
              : "Todos los Paquetes"}
            {personales.length > 0 && (
              <span className="paq__section-count">{personales.length}</span>
            )}
          </h2>
          {personales.length === 0 ? (
            <div className="paq__empty">
              <MdCardTravel />
              <p>
                No hay paquetes personales
                {searchTerm ? " que coincidan con la búsqueda" : ""}.
              </p>
              {!searchTerm && (
                <button
                  className="paq__btn-create"
                  onClick={() => handleAddPackage()}
                >
                  <MdAdd /> Crear primer paquete
                </button>
              )}
            </div>
          ) : (
            <div className="paq__rows">
              {personales.map((pkg) => (
                <PackageCard
                  key={pkg.id}
                  pkg={pkg}
                  onEditItinerary={handleEditItinerary}
                  onEdit={handleEditPackage}
                  onToggleFeatured={handleToggleFeatured}
                  onDelete={handleDeletePackage}
                  getDisplayPrice={getPackageDisplayPrice}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── Service Picker Modal ── */}
      {showServiceModal &&
        ReactDOM.createPortal(
          <ServicePicker
            onSelectService={handleServiceSelection}
            onClose={handleCloseServiceModal}
            packageType={packageType}
            selectedDay={
              currentItinerary[currentDayIndex]?.numero || currentDayIndex + 1
            }
            filterTariffType="externa"
            preselectedCategory={selectedServiceCategory}
            totalPassengers={1}
            peopleDetails={{
              adultos: 1,
              ninios: 0,
              infantes: 0,
              total: 1,
              details: [
                {
                  nombres: "Pasajero",
                  apellidos: "Referencia",
                  email: "",
                  telefono: "",
                  fecha_nacimiento: "",
                  documento: "",
                  nacionalidad: "extranjero",
                },
              ],
            }}
          />,
          document.body,
        )}

      {/* ── Direct Itinerary Modal (during create) ── */}
      <ItineraryModal
        show={showDirectItineraryModal}
        variant="direct"
        title="Editar Itinerario"
        itineraryTitle={itineraryTitle}
        onTitleChange={setItineraryTitle}
        packageType={packageType}
        onPackageTypeChange={setPackageType}
        currentItinerary={currentItinerary}
        onDaysChange={setCurrentItinerary}
        onAddService={(dayIndex, categoryId) => {
          setCurrentDayIndex(dayIndex);
          setSelectedServiceCategory(categoryId || "hoteles");
          setReplacingServiceIndex(null);
          setShowServiceModal(true);
        }}
        onChangeService={(dayIndex, serviceIndex, categoryId) => {
          setCurrentDayIndex(dayIndex);
          setSelectedServiceCategory(categoryId || "hoteles");
          setReplacingServiceIndex(serviceIndex);
          setShowServiceModal(true);
        }}
        onExtrasClick={(dayIndex) => {
          setCurrentDayIndex(dayIndex);
          setShowExtraServiceModal(true);
        }}
        calculateTotalPrice={calculateTotalPrice}
        calculatePackageTotal={calculatePackageTotal}
        loading={false}
        onSave={handleSaveDirectItinerary}
        onCancel={handleCancelDirectItinerary}
      />

      {/* ── Itinerary Modal (existing package) ── */}
      <ItineraryModal
        show={showItineraryModal}
        variant="existing"
        title="Gestionar Itinerario"
        itineraryTitle={itineraryTitle}
        onTitleChange={setItineraryTitle}
        packageType={packageType}
        onPackageTypeChange={setPackageType}
        currentItinerary={currentItinerary}
        onDaysChange={setCurrentItinerary}
        onAddService={(dayIndex, categoryId) => {
          setCurrentDayIndex(dayIndex);
          setSelectedServiceCategory(categoryId || "hoteles");
          setReplacingServiceIndex(null);
          setShowServiceModal(true);
        }}
        onChangeService={(dayIndex, serviceIndex, categoryId) => {
          setCurrentDayIndex(dayIndex);
          setSelectedServiceCategory(categoryId || "hoteles");
          setReplacingServiceIndex(serviceIndex);
          setShowServiceModal(true);
        }}
        onExtrasClick={(dayIndex) => {
          setCurrentDayIndex(dayIndex);
          setShowExtraServiceModal(true);
        }}
        calculateTotalPrice={calculateTotalPrice}
        calculatePackageTotal={calculatePackageTotal}
        loading={loading}
        onSave={handleSaveItinerary}
        onCancel={() => setShowItineraryModal(false)}
      />

      {/* ── Package Form Modal ── */}
      <PackageFormModal
        show={showModal}
        modalType={modalType}
        packageForm={packageForm}
        currentPaquete={currentPaquete}
        loading={loading}
        onInputChange={handleInputChange}
        onToggleDestacado={() =>
          setPackageForm((prev) => ({ ...prev, destacado: !prev.destacado }))
        }
        onOpenDirectItinerary={handleOpenDirectItinerary}
        onSubmit={handleSubmitPackage}
        onClose={handleCloseModal}
      />

      {/* ── Extra Service Modal ── */}
      {showExtraServiceModal &&
        ReactDOM.createPortal(
          <ExtraServiceModal
            isOpen={showExtraServiceModal}
            onClose={() => setShowExtraServiceModal(false)}
            onSave={handleExtraServiceSave}
            packageType={packageType}
            peopleDetails={{
              adultos: 1,
              ninios: 0,
              infantes: 0,
              total: 1,
              details: [
                {
                  nombres: "Pasajero",
                  apellidos: "Referencia",
                  email: "",
                  telefono: "",
                  fecha_nacimiento: "",
                  documento: "",
                  nacionalidad: "extranjero",
                },
              ],
            }}
          />,
          document.body,
        )}

      {/* ── Snackbar ── */}
      {snackbar.open && (
        <div className={`paq__snackbar paq__snackbar--${snackbar.type}`}>
          {snackbar.message}
        </div>
      )}
    </div>
  );
};

export default Paquetes;
