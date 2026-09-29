import { useState, useMemo, useCallback, useEffect, useRef } from "react";

const normalizeFilterId = (value) => {
  if (value === null || value === undefined) return null;
  return String(value).trim();
};

const addComparableId = (set, value) => {
  const normalized = normalizeFilterId(value);
  if (normalized) set.add(normalized);
};

const setHasComparableId = (set, value) => {
  const normalized = normalizeFilterId(value);
  return Boolean(normalized && set.has(normalized));
};

export const useUnifiedFilters = (
  parentServices = [],
  childServices = [],
  activeCategory,
  preselectedCities = [],
  selectedParent = null,
  filterTariffType = null,
  platform = "venso",
  selectedParents = [],
) => {
  // Use ref to track previous preselectedCities to prevent unnecessary re-renders
  const prevPreselectedCitiesRef = useRef(preselectedCities);
  const prevActiveCategoryRef = useRef(activeCategory);

  // Filter state with enhanced text search capabilities
  const [filters, setFilters] = useState({
    searchTerm: "",
    // Text search filters based on schema.rs
    searchNombre: "",
    searchCiudad: "",
    searchDireccion: "",
    searchZona: "",
    searchEmpresa: "",
    searchRuta: "",
    searchProcedencia: "",
    searchTipoGuiado: "",
    // Checkbox filters
    categorias: [],
    ciudades: [],
    zonas: [],
    // Nuevos filtros para trenes: origen y destino
    ciudadesOrigen: [],
    ciudadesDestino: [],
    estados: [], // Mantener estado como filtro separado según indicaciones
    aerolineas: [],
    empresas: [],
    idiomas: [],
    tiposTour: [],
    procedencias: [],
    // Boolean filters
    tieneDesayuno: null,
    // Array filters
    tiposDesayuno: [],
    // Nuevos filtros para servicios padre-hijo unificados
    tiposHabitacion: [],
    tiposTren: [],
    tiposVuelo: [],
    // Price range filters
    precioMin: "",
    precioMax: "",
    rangoPrecio: { min: null, max: null },
    // Filtro especial para servicios del itinerario
    mostrarSoloItinerario: false,
    incluirExtrasUnificados: true, // Para deduplicar servicios extras
    // Filtro por calificación mínima (0-10, null = sin filtro)
    calificacionMinima: null,
    // Nuevo filtro para guias (Venso)
    tourNombres: [],
  });

  // Helper function to compare arrays for equality
  const arraysEqual = (arr1, arr2) => {
    if (arr1.length !== arr2.length) return false;
    return arr1.every((val, index) => val === arr2[index]);
  };

  // Helper function to check if service matches itinerary cities
  const serviceMatchesItinerary = useCallback(
    (service) => {
      if (!preselectedCities.length) return false;

      const serviceCities = [];

      // Obtener ciudad/zona del servicio basado en schema.rs
      if (service.ciudad) serviceCities.push(service.ciudad.toLowerCase());
      if (service.zona) serviceCities.push(service.zona.toLowerCase());
      if (service.direccion && service.direccion.includes(",")) {
        // Extraer ciudad de la dirección si está en formato "direccion, ciudad"
        const direccionParts = service.direccion.split(",");
        if (direccionParts.length > 1) {
          serviceCities.push(
            direccionParts[direccionParts.length - 1].trim().toLowerCase(),
          );
        }
      }

      return preselectedCities.some((city) =>
        serviceCities.some(
          (serviceCity) =>
            serviceCity.includes(city.toLowerCase()) ||
            city.toLowerCase().includes(serviceCity),
        ),
      );
    },
    [preselectedCities],
  );

  // Function to create unified parent-child services with tariffs
  const createUnifiedServices = useCallback(
    (parents, children) => {
      const unifiedServices = [];

      parents.forEach((parent) => {
        // Obtener hijos que tienen tarifas para este padre
        const parentChildren = children.filter((child) => {
          // Verificar relación padre-hijo basada en IDs del schema.rs
          if (
            activeCategory === "hoteles" &&
            child.id_hotel === parent.id_hotel
          )
            return true;
          if (
            activeCategory === "transportes" &&
            child.id_transporte === parent.id_transporte
          )
            return true;
          if (activeCategory === "trenes" && child.id_tren === parent.id_tren)
            return true;
          if (activeCategory === "vuelos" && child.id_vuelo === parent.id_vuelo)
            return true;
          if (
            activeCategory === "endoses" &&
            normalizeFilterId(
              child.id_endose ||
                child.endose_id ||
                child.tour?.id_endose ||
                child.tour?.endose_id ||
                child.endose?.id_endose ||
                child.endose?.id,
            ) === normalizeFilterId(parent.id_endose || parent.endose_id || parent.id)
          )
            return true;
          return false;
        });

        if (parentChildren.length > 0) {
          // Crear servicios unificados padre-hijo con tarifas
          parentChildren.forEach((child) => {
            const unifiedService = {
              ...parent,
              ...child,
              id: `unified_${parent.id || parent.id_hotel || parent.id_transporte || parent.id_tren}_${child.id || child.id_habitacion || child.id_tipo || child.id_movilidad}`,
              isUnified: true,
              parentService: parent,
              childService: child,
              matchesItinerary:
                serviceMatchesItinerary(parent) ||
                serviceMatchesItinerary(child),
              // Combinar campos importantes para filtros unificados
              combinedSearchText: [
                parent.nombre,
                child.nombre,
                parent.ciudad,
                child.ciudad,
                parent.zona,
                child.zona,
                parent.direccion,
                child.direccion,
                parent.categoria,
                child.tipo_habitacion,
                child.tipo_tren,
                child.tipo_vuelo,
              ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase(),
            };
            unifiedServices.push(unifiedService);
          });
        } else {
          // Agregar servicio padre sin hijos
          unifiedServices.push({
            ...parent,
            isUnified: false,
            matchesItinerary: serviceMatchesItinerary(parent),
            combinedSearchText: [
              parent.nombre,
              parent.ciudad,
              parent.zona,
              parent.direccion,
              parent.categoria,
            ]
              .filter(Boolean)
              .join(" ")
              .toLowerCase(),
          });
        }
      });

      // Agregar servicios hijo que no tienen padre pero sí tienen tarifas
      children.forEach((child) => {
        const hasParent = parents.some((parent) => {
          if (activeCategory === "hoteles")
            return child.id_hotel === parent.id_hotel;
          if (activeCategory === "transportes")
            return child.id_transporte === parent.id_transporte;
          if (activeCategory === "trenes")
            return child.id_tren === parent.id_tren;
          if (activeCategory === "vuelos")
            return child.id_vuelo === parent.id_vuelo;
          if (activeCategory === "endoses")
            return (
              normalizeFilterId(
                child.id_endose ||
                  child.endose_id ||
                  child.tour?.id_endose ||
                  child.tour?.endose_id ||
                  child.endose?.id_endose ||
                  child.endose?.id,
              ) === normalizeFilterId(parent.id_endose || parent.endose_id || parent.id)
            );
          return false;
        });

        if (!hasParent) {
          // Servicios hijo independientes con tarifas
          unifiedServices.push({
            ...child,
            isUnified: false,
            isChildOnly: true,
            matchesItinerary: serviceMatchesItinerary(child),
            combinedSearchText: [
              child.nombre,
              child.ciudad,
              child.zona,
              child.direccion,
              child.tipo_habitacion,
              child.tipo_tren,
            ]
              .filter(Boolean)
              .join(" ")
              .toLowerCase(),
          });
        }
      });

      return unifiedServices;
    },
    [activeCategory, serviceMatchesItinerary],
  );

  // Function to deduplicate extra services based on all attributes
  const deduplicateExtraServices = useCallback(
    (services) => {
      if (activeCategory !== "extras") return services;

      const serviceMap = new Map();

      services.forEach((service) => {
        // Crear clave única basada en todos los atributos importantes
        const key = [
          service.nombre?.toLowerCase().trim(),
          service.descripcion?.toLowerCase().trim(),
          service.precio,
          service.tipo_tarifa,
          service.incluir_igv,
          // Agregar campos personalizados si existen
          service.campos_personalizados
            ? JSON.stringify(service.campos_personalizados)
            : "",
        ].join("|");

        if (!serviceMap.has(key)) {
          serviceMap.set(key, {
            ...service,
            matchesItinerary: false, // Los extras no dependen del itinerario
            combinedSearchText: [service.nombre, service.descripcion]
              .filter(Boolean)
              .join(" ")
              .toLowerCase(),
            duplicateCount: 1,
          });
        } else {
          // Incrementar contador de duplicados
          const existing = serviceMap.get(key);
          existing.duplicateCount += 1;
        }
      });

      return Array.from(serviceMap.values());
    },
    [activeCategory],
  );

  // Clear search term only when category actually changes
  useEffect(() => {
    if (prevActiveCategoryRef.current !== activeCategory) {
      setFilters((prev) => ({
        ...prev,
        searchTerm: "", // Clear search when category changes
        calificacionMinima: null, // Clear rating filter when category changes
      }));
      prevActiveCategoryRef.current = activeCategory;
    }
  }, [activeCategory]);

  // Las ciudades preseleccionadas ya NO se auto-aplican como filtro.
  // Solo se usan como referencia visual en los chips del ServicePicker.
  useEffect(() => {
    if (!arraysEqual(prevPreselectedCitiesRef.current, preselectedCities)) {
      prevPreselectedCitiesRef.current = preselectedCities;
    }
  }, [preselectedCities]);

  // Apply search term filter to any service array with enhanced text search and unified filters
  const applySearchFilter = useCallback((services, searchFilters) => {
    if (!services || !Array.isArray(services)) return [];

    // OPTIMIZADO: Reducir logs excesivos - comentar para producción
    // console.log(' ApplySearchFilter - Input services:', services.length);
    // console.log(' ApplySearchFilter - Search filters:', searchFilters);

    const rawSearchTerm = searchFilters.searchTerm || "";
    const normalizedSearch = rawSearchTerm
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // quitar tildes
      .toLowerCase()
      .trim();

    const searchTerms = normalizedSearch.split(/\s+/).filter(Boolean); // varias palabras
    const hasGlobalSearch = searchTerms.length > 0;

    const normalizeValue = (val) =>
      String(val || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();

    const matchesAllTerms = (val) => {
      if (!hasGlobalSearch) return true;
      const text = normalizeValue(val);
      return searchTerms.every((term) => text.includes(term));
    };

    const filtered = services.filter((service) => {
      // Filtro especial para servicios del itinerario
      if (searchFilters.mostrarSoloItinerario && !service.matchesItinerary) {
        return false;
      }

      // --- BUSCADOR GLOBAL (searchTerm) ---
      if (hasGlobalSearch) {
        // Si el padre fue seleccionado, igual queremos que el buscador filtre hijos
        // pero teniendo en cuenta que pueden matchear por campos del padre o del hijo

        // 1) Si el padre coincide por nombre/otros campos, consideramos que el hijo también matchea
        const parent =
          service.parentService || searchFilters.selectedParent || null;

        const parentFields = parent
          ? [
              parent.nombre,
              parent.servicio,
              parent.nombre_transporte,
              parent.nombre_agencia,
              parent.nombre_empresa,
              parent.aerolinea,
              parent.ciudad,
              parent.zona,
              parent.categoria,
              parent.direccion,
            ]
          : [];

        // 2) Campos del propio service (padre o hijo)
        // CORREGIDO: Incluir campos anidados para servicios hijo (movilidad, habitacion, vagon, etc.)
        // VALIDADO: Campos alineados con schema.rs del backend
        const baseSearchableFields = [
          // Campos directos del servicio
          service.nombre,
          service.servicio,
          service.nombre_transporte,
          service.nombre_agencia,
          service.nombre_empresa,
          service.aerolinea,
          service.descripcion,
          service.ciudad,
          service.zona,
          service.direccion,
          service.categoria,
          service.tipo_habitacion,
          service.tipo_desayuno,
          service.tipo_vagon,
          service.tipo_tren,
          service.tipovuelo,
          service.tipo,
          service.tipo_auto,
          service.tour_nombre,
          service.tipo_guiado,
          service.idioma,
          service.entrada,
          service.estado,
          service.procedencia,
          // NUEVO: Campos anidados para servicios hijo - Habitaciones (hoteles)
          service.habitacion?.tipo_habitacion,
          service.habitacion?.tipohabitacion,
          service.habitacion?.estado,
          // NUEVO: Campos anidados para Movilidades (transportes)
          service.movilidad?.tipo_auto,
          service.movilidad?.ruta,
          service.movilidad?.nro_pasajeros?.toString(),
          service.movilidad?.estado,
          service.movilidad?.nro_placa,
          // NUEVO: Campos anidados para Vagones (trenes) - alineados con schema.rs
          service.vagon?.tipo_tren,
          service.vagon?.lugar_salida,
          service.vagon?.lugar_destino,
          service.vagon?.serv_add,
          service.vagon?.estado,
          // También soportar la estructura vagones (plural) si existe
          service.vagones?.tipo_tren,
          service.vagones?.lugar_salida,
          service.vagones?.lugar_destino,
          // NUEVO: Campos anidados para Tipos de vuelo (vuelos) - alineados con schema.rs
          service.tipo_vuelo?.tipovuelo,
          service.tipo_vuelo?.equipaje,
          service.tipo_vuelo?.estado,
          service.tipo_vuelo?.detalles,
          // NUEVO: Campos anidados para Rutas (guias) - alineados con schema.rs
          service.ruta?.tour_nombre,
          service.ruta?.estado,
          service.ruta?.observaciones,
          // NUEVO: Campos anidados para Tours (endoses) - alineados con schema.rs
          service.tour?.tipo_guiado,
          service.tour?.idioma,
          service.tour?.estado,
          service.tour?.observaciones,
          // NUEVO: Campos para Restaurantes - alineados con schema.rs
          // restaurante tiene: nombre, direccion, estado, detalles
          service.restaurante?.nombre,
          service.restaurante?.direccion,
          service.restaurante?.estado,
          service.restaurante?.detalles,
          // NUEVO: Campos para Tickets - alineados con schema.rs
          // tickets tiene: entrada, procedencia, tipo_usuario, estado
          service.ticket?.entrada,
          service.ticket?.procedencia,
          service.ticket?.tipo_usuario,
          service.ticket?.estado,
          service.tickets?.entrada,
          service.tickets?.procedencia,
          service.tickets?.tipo_usuario,
          service.tickets?.estado,
        ];

        // 3) Si tiene combinedSearchText, lo usamos como texto grande unificado
        let combinedText = "";
        if (service.combinedSearchText) {
          combinedText = service.combinedSearchText;
        } else {
          combinedText = [...parentFields, ...baseSearchableFields]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
        }

        const combinedMatches = matchesAllTerms(combinedText);

        if (!combinedMatches) {
          // OPTIMIZADO: Removido log excesivo que causaba spam en console
          // Solo logear en modo debug si es necesario analizar problemas específicos
          // const identifier = service.nombre || service.tipo_habitacion || service.tipo_auto || service.id || 'unknown';
          // console.log(' No match in global search for:', identifier, 'terms:', searchTerms);
          return false;
        }
      }

      // --- BUSCADORES ESPECÍFICOS (searchNombre, searchCiudad, etc.) ---
      const textSearchChecks = [
        {
          filter: "searchNombre",
          fields: [
            "nombre",
            "nombre_transporte",
            "nombre_empresa",
            "aerolinea",
            "nombre_agencia",
            "nombres",
          ],
        },
        { filter: "searchCiudad", fields: ["ciudad"] },
        { filter: "searchDireccion", fields: ["direccion"] },
        { filter: "searchZona", fields: ["zona"] },
        { filter: "searchEmpresa", fields: ["nombre_empresa"] },
        { filter: "searchRuta", fields: ["ruta"] },
        { filter: "searchProcedencia", fields: ["procedencia"] },
        { filter: "searchTipoGuiado", fields: ["tipo_guiado"] },
      ];

      // Helper para nested fields y servicios unificados
      const getServiceValue = (srv, field) => {
        let value = srv[field];

        if (!value && !srv.isUnified) {
          if (srv.habitacion) value = srv.habitacion[field] || value;
          if (srv.transporte) value = srv.transporte[field] || value;
          if (srv.vagon) value = srv.vagon[field] || value;
          if (srv.vuelo) value = srv.vuelo[field] || value;
          if (srv.endose) value = srv.endose[field] || value;
          if (srv.ruta) value = srv.ruta[field] || value;
          if (srv.restaurante) value = srv.restaurante[field] || value;
          // NUEVO: Buscar también en tour para endoses (tipo_guiado, idioma)
          if (srv.tour) value = srv.tour[field] || value;
        }

        if (!value && srv.isUnified) {
          value = srv.parentService?.[field] || srv.childService?.[field];
          // NUEVO: También buscar en childService.tour para endoses
          if (!value && srv.childService?.tour) {
            value = srv.childService.tour[field];
          }
        }

        if (!value && srv.parentService && !srv.isUnified) {
          value = srv.parentService[field];
        }

        return value;
      };

      const passesSpecificTextFilters = textSearchChecks.every(
        ({ filter, fields }) => {
          const searchValue = searchFilters[filter];
          if (!searchValue || !searchValue.trim()) return true;

          const normalizedFilter = normalizeValue(searchValue);
          // OPTIMIZADO: Log removido para reducir spam en console

          const matches = fields.some((field) => {
            let value = getServiceValue(service, field);

            // Caso especial: ciudad del hijo que hereda ciudad del padre
            if (
              filter === "searchCiudad" &&
              field === "ciudad" &&
              !value &&
              service.parentService?.ciudad
            ) {
              value = service.parentService.ciudad;
            }

            const hasMatch = matchesAllTerms(value);
            return hasMatch;
          });

          return matches;
        },
      );

      if (!passesSpecificTextFilters) return false;

      return true;
    });
    return filtered;
  }, []);

  // Apply category-specific filters (mejorado para servicios unificados)
  const applyCategoryFilters = useCallback(
    (services, filters, categoryId, isChild = false, selectedParent = null) => {
      if (!services || !Array.isArray(services)) return services;

      let filtered = [...services];

      // Funciones helper para extraer valores de servicios unificados y servicios hijo
      const getValue = (service, field) => {
        let value = service[field];

        // Para servicios hijo con estructura anidada, buscar en los objetos anidados
        if (!value && !service.isUnified) {
          // Hoteles: buscar en habitacion
          if (categoryId === "hoteles" && service.habitacion) {
            value = service.habitacion[field];
          }
          // Transportes: buscar en transporte
          if (categoryId === "transportes" && service.transporte) {
            value = service.transporte[field];
          }
          // Trenes: buscar en vagon
          if (categoryId === "trenes" && service.vagon) {
            value = service.vagon[field];
          }
          // Vuelos: buscar en vuelo
          if (categoryId === "vuelos" && service.vuelo) {
            value = service.vuelo[field];
          }
          // Endoses: buscar en endose
          if (categoryId === "endoses" && service.endose) {
            value = service.endose[field];
          }
          // Guías: buscar en ruta
          if (categoryId === "guias" && service.ruta) {
            value = service.ruta[field];
          }
          // Restaurantes: buscar en restaurante
          if (categoryId === "restaurantes" && service.restaurante) {
            value = service.restaurante[field];
          }
        }

        // Si no hay valor y es un servicio unificado, buscar en parent/child
        if (!value && service.isUnified) {
          // Para trenes, lugar_salida y lugar_destino están en childService (vagones)
          if (field === "lugar_salida" || field === "lugar_destino") {
            value = service.childService?.[field];
          } else {
            value =
              service.parentService?.[field] || service.childService?.[field];
          }
        }

        // Si no hay valor y es un servicio hijo, también buscar en parentService si existe
        if (!value && service.parentService && !service.isUnified) {
          value = service.parentService[field];
        }

        return value;
      };

      // CORREGIDO: Comparación case-insensitive para ciudades/zonas
      const hasValue = (service, field, targetValues) => {
        if (!targetValues || targetValues.length === 0) return true;
        const value = getValue(service, field);
        if (!value) return false;
        const normalizedValue = value.trim().toLowerCase();
        return targetValues.some(
          (target) => target.toLowerCase() === normalizedValue,
        );
      };

      switch (categoryId) {
        case "hoteles":
          // Filtros unificados para hoteles (padre + hijo)
          // Para servicios padre, aplicar filtro de categorías directamente
          // Para servicios hijo, solo filtrar por categoría si hay padre seleccionado
          if (filters.categorias?.length > 0) {
            if (isChild && selectedParent) {
              // Si el padre coincide con la categoría filtrada, mostrar todos sus hijos con tarifa
              const parentCategoryMatches = filters.categorias.includes(
                selectedParent.categoria,
              );
              if (parentCategoryMatches) {
                // No filtrar por categoría en el hijo, solo por pertenencia al padre
                // (el filtro por parent ID ya se aplica después)
                // Por lo tanto, no filtrar aquí, dejar pasar todos los hijos
              } else {
                // Si el padre no coincide, no mostrar hijos
                filtered = [];
              }
            } else if (!isChild) {
              // Para servicios padre, aplicar filtro normal
              filtered = filtered.filter((service) =>
                hasValue(service, "categoria", filters.categorias),
              );
            }
            // Si es hijo y no hay padre seleccionado, NO filtrar por categoría
          }

          // Para servicios hijo, heredar información del padre seleccionado si no tienen ciudad propia
          if (filters.ciudades?.length > 0) {
            filtered = filtered.filter((service) => {
              // Si el hijo no tiene ciudad, usar la del padre seleccionado
              const childCity =
                getValue(service, "ciudad") || selectedParent?.ciudad;
              if (!childCity) return false;
              const normalizedCity = childCity.toLowerCase().trim();
              return filters.ciudades.some(
                (c) => c.toLowerCase().trim() === normalizedCity,
              );
            });
          }
          if (filters.tiposHabitacion?.length > 0) {
            filtered = filtered.filter((service) => {
              const tipo =
                getValue(service, "tipo_habitacion") ||
                getValue(service, "tipo") ||
                "";
              return filters.tiposHabitacion.includes(tipo);
            });
          }
          if (filters.estados?.length > 0) {
            filtered = filtered.filter((service) =>
              hasValue(service, "estado", filters.estados),
            );
          }
          if (
            filters.tieneDesayuno !== null &&
            filters.tieneDesayuno !== undefined
          ) {
            filtered = filtered.filter((service) => {
              const desayuno =
                getValue(service, "desayuno") ||
                getValue(service, "tiene_desayuno");
              return String(desayuno) === String(filters.tieneDesayuno);
            });
          }
          if (filters.tiposDesayuno?.length > 0) {
            filtered = filtered.filter((service) =>
              hasValue(service, "tipo_desayuno", filters.tiposDesayuno),
            );
          }
          break;

        case "transportes":
          // Filtros unificados para transportes
          // NOTA: El filtro de zonas solo aplica a PADRES (transportes), no a HIJOS (movilidades)
          // porque las movilidades no tienen campo 'zona', solo los transportes (padres)
          if (filters.zonas?.length > 0 && !isChild) {
            filtered = filtered.filter((service) => {
              const zona = getValue(service, "zona");
              if (!zona) return false;
              const normalizedZona = zona.toLowerCase().trim();
              return filters.zonas.some((z) =>
                normalizedZona.includes(z.toLowerCase().trim()),
              );
            });
          }
          if (filters.empresas?.length > 0 && !isChild) {
            filtered = filtered.filter((service) =>
              hasValue(service, "nombre_transporte", filters.empresas),
            );
          }
          if (filters.estados?.length > 0) {
            filtered = filtered.filter((service) =>
              hasValue(service, "estado", filters.estados),
            );
          }
          break;

        case "trenes":
          // Filtros unificados para trenes
          if (filters.empresas?.length > 0) {
            filtered = filtered.filter((service) =>
              hasValue(service, "nombre_empresa", filters.empresas),
            );
          }
          if (filters.tiposTren?.length > 0) {
            filtered = filtered.filter((service) =>
              hasValue(service, "tipo_tren", filters.tiposTren),
            );
          }
          // Nuevos filtros para origen y destino de trenes
          if (filters.ciudadesOrigen?.length > 0) {
            filtered = filtered.filter((service) =>
              hasValue(service, "lugar_salida", filters.ciudadesOrigen),
            );
          }
          if (filters.ciudadesDestino?.length > 0) {
            filtered = filtered.filter((service) =>
              hasValue(service, "lugar_destino", filters.ciudadesDestino),
            );
          }
          if (filters.estados?.length > 0) {
            filtered = filtered.filter((service) =>
              hasValue(service, "estado", filters.estados),
            );
          }
          break;

        case "vuelos":
          // Filtros unificados para vuelos
          if (filters.aerolineas?.length > 0) {
            filtered = filtered.filter((service) =>
              hasValue(service, "nombre", filters.aerolineas),
            );
          }
          if (filters.tiposVuelo?.length > 0) {
            filtered = filtered.filter((service) =>
              hasValue(service, "tipovuelo", filters.tiposVuelo),
            );
          }
          if (filters.estados?.length > 0) {
            filtered = filtered.filter((service) =>
              hasValue(service, "estado", filters.estados),
            );
          }
          break;
        case "guias":
          if (filters.ciudades?.length > 0) {
            filtered = filtered.filter((service) =>
              hasValue(service, "ciudad", filters.ciudades),
            );
          }
          if (filters.zonas?.length > 0) {
            filtered = filtered.filter((service) =>
              hasValue(service, "zona", filters.zonas),
            );
          }
          if (filters.idiomas?.length > 0) {
            filtered = filtered.filter((service) =>
              hasValue(service, "idioma", filters.idiomas),
            );
          }
          if (filters.tourNombres?.length > 0) {
            filtered = filtered.filter((service) => {
              const tourName = service.tour_nombre || service.ruta?.tour_nombre;
              if (!tourName) return false;
              return filters.tourNombres.some(
                (t) => t.toLowerCase() === tourName.toLowerCase(),
              );
            });
          }
          break;

        case "endoses":
          // Filtros unificados para endoses (padre) y tours (hijos)
          // NOTA: El filtro de zonas solo aplica a PADRES (endoses), no a HIJOS (tours)
          // porque los tours no tienen campo 'zona', solo los endoses (padres)
          if (filters.zonas?.length > 0 && !isChild) {
            filtered = filtered.filter((service) => {
              const zona = getValue(service, "zona");
              if (!zona) return false;
              const normalizedZona = zona.toLowerCase().trim();
              return filters.zonas.some((z) =>
                normalizedZona.includes(z.toLowerCase().trim()),
              );
            });
          }
          // Filtrar por nombre de agencia del endose (padre) - solo para padres
          if (filters.empresas?.length > 0 && !isChild) {
            filtered = filtered.filter((service) =>
              hasValue(service, "nombre_agencia", filters.empresas),
            );
          }
          // Filtrar por tipo_tour del endose (padre) - campo común - solo para padres
          if (filters.tiposTour?.length > 0 && !isChild) {
            filtered = filtered.filter((service) =>
              hasValue(service, "tipo_tour", filters.tiposTour),
            );
          }
          // Para servicios unificados, también filtrar por datos de tours (hijos)
          if (filters.idiomas?.length > 0) {
            filtered = filtered.filter((service) => {
              // Buscar idioma en el endose o en los tours hijos
              const idioma =
                getValue(service, "idioma") ||
                getValue(service, "childService.idioma");
              if (!idioma) return false;
              const normalizedIdioma = idioma.toLowerCase().trim();
              return filters.idiomas.some((i) =>
                normalizedIdioma.includes(i.toLowerCase().trim()),
              );
            });
          }
          if (filters.estados?.length > 0) {
            filtered = filtered.filter((service) => {
              const estado =
                getValue(service, "estado") ||
                getValue(service, "childService.estado");
              if (!estado) return false;
              const normalizedEstado = estado.toLowerCase().trim();
              return filters.estados.some(
                (e) => e.toLowerCase().trim() === normalizedEstado,
              );
            });
          }
          break;

        case "restaurantes":
          // Filtros para restaurantes
          if (filters.ciudades?.length > 0) {
            filtered = filtered.filter((service) => {
              // Extraer ciudad de dirección si no hay campo ciudad directo
              const ciudad = service.ciudad;
              const direccion = service.direccion;
              let serviceCities = [];
              if (ciudad) serviceCities.push(ciudad.toLowerCase().trim());
              if (direccion && direccion.includes(",")) {
                const parts = direccion.split(",");
                serviceCities.push(
                  parts[parts.length - 1].trim().toLowerCase(),
                );
              }
              return filters.ciudades.some((c) =>
                serviceCities.some((sc) => sc.includes(c.toLowerCase().trim())),
              );
            });
          }
          if (filters.estados?.length > 0) {
            filtered = filtered.filter((service) =>
              hasValue(service, "estado", filters.estados),
            );
          }
          break;

        case "tickets":
          // Filtros para tickets/entradas
          if (filters.procedencias?.length > 0) {
            filtered = filtered.filter((service) =>
              hasValue(service, "procedencia", filters.procedencias),
            );
          }
          if (filters.estados?.length > 0) {
            filtered = filtered.filter((service) =>
              hasValue(service, "estado", filters.estados),
            );
          }
          break;

        case "extras":
          // Los servicios extras se deduplican automáticamente, no necesitan filtros adicionales
          break;

        default:
          break;
      }

      // Apply generic price range filter to all categories
      if (
        filters.rangoPrecio &&
        (filters.rangoPrecio.min !== null || filters.rangoPrecio.max !== null)
      ) {
        filtered = filtered.filter((service) => {
          let servicePrice = null;

          // Extract price from different sources with enhanced logic based on schema.rs
          // Priority: Direct fields -> tarifas array -> nested service structures

          // 1. Try direct price fields (for child services like habitaciones)
          if (
            service.precio_privado !== undefined &&
            service.precio_privado !== null
          ) {
            servicePrice = parseFloat(service.precio_privado);
          } else if (
            service.precio_compartido !== undefined &&
            service.precio_compartido !== null
          ) {
            servicePrice = parseFloat(service.precio_compartido);
          } else if (service.precio !== undefined && service.precio !== null) {
            servicePrice = parseFloat(service.precio);
          }
          // 2. Try tarifas array (for parent services like hoteles)
          else if (
            service.tarifas &&
            Array.isArray(service.tarifas) &&
            service.tarifas.length > 0
          ) {
            // Look for the first valid price in any tarifa
            for (const tarifa of service.tarifas) {
              if (
                tarifa.precio_privado !== undefined &&
                tarifa.precio_privado !== null
              ) {
                servicePrice = parseFloat(tarifa.precio_privado);
                break;
              } else if (
                tarifa.precio_compartido !== undefined &&
                tarifa.precio_compartido !== null
              ) {
                servicePrice = parseFloat(tarifa.precio_compartido);
                break;
              } else if (
                tarifa.precio !== undefined &&
                tarifa.precio !== null
              ) {
                servicePrice = parseFloat(tarifa.precio);
                break;
              }
            }
          }
          // 3. Try single tariff object
          else if (service.tariff) {
            if (
              service.tariff.precio_privado !== undefined &&
              service.tariff.precio_privado !== null
            ) {
              servicePrice = parseFloat(service.tariff.precio_privado);
            } else if (
              service.tariff.precio_compartido !== undefined &&
              service.tariff.precio_compartido !== null
            ) {
              servicePrice = parseFloat(service.tariff.precio_compartido);
            } else if (
              service.tariff.precio !== undefined &&
              service.tariff.precio !== null
            ) {
              servicePrice = parseFloat(service.tariff.precio);
            }
          }
          // 4. Try parentService tariff for child services
          else if (service.parentService) {
            if (
              service.parentService.tarifas &&
              Array.isArray(service.parentService.tarifas) &&
              service.parentService.tarifas.length > 0
            ) {
              const tarifa = service.parentService.tarifas[0];
              if (
                tarifa.precio_privado !== undefined &&
                tarifa.precio_privado !== null
              ) {
                servicePrice = parseFloat(tarifa.precio_privado);
              } else if (
                tarifa.precio_compartido !== undefined &&
                tarifa.precio_compartido !== null
              ) {
                servicePrice = parseFloat(tarifa.precio_compartido);
              } else if (
                tarifa.precio !== undefined &&
                tarifa.precio !== null
              ) {
                servicePrice = parseFloat(tarifa.precio);
              }
            } else if (service.parentService.tariff) {
              if (
                service.parentService.tariff.precio_privado !== undefined &&
                service.parentService.tariff.precio_privado !== null
              ) {
                servicePrice = parseFloat(
                  service.parentService.tariff.precio_privado,
                );
              } else if (
                service.parentService.tariff.precio_compartido !== undefined &&
                service.parentService.tariff.precio_compartido !== null
              ) {
                servicePrice = parseFloat(
                  service.parentService.tariff.precio_compartido,
                );
              } else if (
                service.parentService.tariff.precio !== undefined &&
                service.parentService.tariff.precio !== null
              ) {
                servicePrice = parseFloat(service.parentService.tariff.precio);
              }
            }
          }
          // 5. Try childService tariff for unified services
          else if (service.childService) {
            if (
              service.childService.tarifas &&
              Array.isArray(service.childService.tarifas) &&
              service.childService.tarifas.length > 0
            ) {
              const tarifa = service.childService.tarifas[0];
              if (
                tarifa.precio_privado !== undefined &&
                tarifa.precio_privado !== null
              ) {
                servicePrice = parseFloat(tarifa.precio_privado);
              } else if (
                tarifa.precio_compartido !== undefined &&
                tarifa.precio_compartido !== null
              ) {
                servicePrice = parseFloat(tarifa.precio_compartido);
              } else if (
                tarifa.precio !== undefined &&
                tarifa.precio !== null
              ) {
                servicePrice = parseFloat(tarifa.precio);
              }
            } else if (service.childService.tariff) {
              if (
                service.childService.tariff.precio_privado !== undefined &&
                service.childService.tariff.precio_privado !== null
              ) {
                servicePrice = parseFloat(
                  service.childService.tariff.precio_privado,
                );
              } else if (
                service.childService.tariff.precio_compartido !== undefined &&
                service.childService.tariff.precio_compartido !== null
              ) {
                servicePrice = parseFloat(
                  service.childService.tariff.precio_compartido,
                );
              } else if (
                service.childService.tariff.precio !== undefined &&
                service.childService.tariff.precio !== null
              ) {
                servicePrice = parseFloat(service.childService.tariff.precio);
              }
            }
          }
          // 6. Try unified service structure
          else if (service.isUnified) {
            if (
              service.childService &&
              service.childService.tarifas &&
              service.childService.tarifas.length > 0
            ) {
              const tarifa = service.childService.tarifas[0];
              if (
                tarifa.precio_privado !== undefined &&
                tarifa.precio_privado !== null
              ) {
                servicePrice = parseFloat(tarifa.precio_privado);
              } else if (
                tarifa.precio_compartido !== undefined &&
                tarifa.precio_compartido !== null
              ) {
                servicePrice = parseFloat(tarifa.precio_compartido);
              } else if (
                tarifa.precio !== undefined &&
                tarifa.precio !== null
              ) {
                servicePrice = parseFloat(tarifa.precio);
              }
            } else if (
              service.parentService &&
              service.parentService.tarifas &&
              service.parentService.tarifas.length > 0
            ) {
              const tarifa = service.parentService.tarifas[0];
              if (
                tarifa.precio_privado !== undefined &&
                tarifa.precio_privado !== null
              ) {
                servicePrice = parseFloat(tarifa.precio_privado);
              } else if (
                tarifa.precio_compartido !== undefined &&
                tarifa.precio_compartido !== null
              ) {
                servicePrice = parseFloat(tarifa.precio_compartido);
              } else if (
                tarifa.precio !== undefined &&
                tarifa.precio !== null
              ) {
                servicePrice = parseFloat(tarifa.precio);
              }
            }
          }

          // If no valid price found, determine whether to include the service
          if (servicePrice === null || isNaN(servicePrice)) {
            // For parent services (without child service markers), include them even without prices
            // This allows users to select parent services and then choose child services with prices
            const isParentService =
              !service.tipo_habitacion &&
              !service.tipo_vagon &&
              !service.tipo &&
              !service.tipo_auto &&
              !isChild;

            if (isParentService) {
              // OPTIMIZADO: Log removido
              return true; // Parent services don't need prices - their children have prices
            } else {
              // OPTIMIZADO: Log removido
              return true; // Include child services even if price is missing (backend might not include tariffs)
            }
          }

          // OPTIMIZADO: Logs de precio removidos para reducir spam

          const { min, max } = filters.rangoPrecio;
          if (min !== null && servicePrice < min) {
            return false;
          }
          if (max !== null && servicePrice > max) {
            return false;
          }

          return true;
        });
      }

      // OPTIMIZADO: Log removido
      return filtered;
    },
    [],
  );

  // Create unified services (parent-child with tariffs) and deduplicated extras
  const unifiedServices = useMemo(() => {
    if (activeCategory === "extras") {
      return deduplicateExtraServices(parentServices);
    }
    return createUnifiedServices(parentServices, childServices);
  }, [
    activeCategory,
    parentServices,
    childServices,
    createUnifiedServices,
    deduplicateExtraServices,
  ]);

  // Helper: obtener valoración numérica de un servicio
  const getCalificacionValor = useCallback((service) => {
    const calif = service?.calificacion || service?.guia?.calificacion;
    if (!calif || typeof calif !== "object") return null;
    const valor = parseFloat(calif.valoracion);
    return isNaN(valor) ? null : valor;
  }, []);

  // Filtro por calificación mínima para padres
  const applyCalificacionFilter = useCallback(
    (services, minCalif) => {
      if (minCalif == null) return services;
      return services.filter((service) => {
        const valor = getCalificacionValor(service);
        // Si no tiene calificación, ocultar cuando hay filtro activo
        if (valor === null) return false;
        return valor >= minCalif;
      });
    },
    [getCalificacionValor],
  );

  // Ordenar servicios: calificación alta primero, luego alfabético por nombre
  const sortByCalificacionThenName = useCallback(
    (services) => {
      return [...services].sort((a, b) => {
        const califA = getCalificacionValor(a) ?? -1;
        const califB = getCalificacionValor(b) ?? -1;
        // Mayor calificación primero
        if (califB !== califA) return califB - califA;
        // Desempate: nombre alfabético
        const nameA = (
          a.nombre ||
          a.nombre_transporte ||
          a.nombre_empresa ||
          a.aerolinea ||
          a.nombre_agencia ||
          ""
        ).toLowerCase();
        const nameB = (
          b.nombre ||
          b.nombre_transporte ||
          b.nombre_empresa ||
          b.aerolinea ||
          b.nombre_agencia ||
          ""
        ).toLowerCase();
        return nameA.localeCompare(nameB);
      });
    },
    [getCalificacionValor],
  );

  // Apply all filters to parent services
  const filteredParentServices = useMemo(() => {
    // Para extras, usar servicios deduplicados
    const servicesToFilter =
      activeCategory === "extras" ? unifiedServices : parentServices;
    let filtered = applySearchFilter(servicesToFilter, filters);

    // Si hay búsqueda de texto, también incluir padres que tengan hijos coincidentes.
    // Esto permite buscar por campos de los hijos (tipo habitación, tipo vehículo, etc.)
    // y que aparezca el servicio padre correspondiente en la lista.
    if (
      filters.searchTerm?.trim() &&
      activeCategory !== "extras" &&
      childServices.length > 0
    ) {
      const filteredParentIdSet = new Set(
        filtered
          .map(
            (p) =>
              p.id_hotel ||
              p.id_transporte ||
              p.id_tren ||
              p.id_vuelo ||
              p.id_endose ||
              p.id_guia ||
              p.id_restaurante ||
              p.id_ticket ||
              p.id,
          )
          .filter(Boolean),
      );

      // Buscar hijos que coincidan con el término de búsqueda (sin filtro de padre seleccionado)
      const matchingChildren = applySearchFilter(childServices, {
        ...filters,
        selectedParent: null,
      });

      // Por cada padre aún no incluido, ver si alguno de sus hijos coincide
      parentServices.forEach((parent) => {
        const parentId =
          parent.id_hotel ||
          parent.id_transporte ||
          parent.id_tren ||
          parent.id_vuelo ||
          parent.id_endose ||
          parent.id_guia ||
          parent.id_restaurante ||
          parent.id_ticket ||
          parent.id;
        if (!parentId || filteredParentIdSet.has(parentId)) return;

        const hasMatchingChild = matchingChildren.some((child) => {
          if (activeCategory === "hoteles")
            return (child.habitacion?.id_hotel || child.id_hotel) === parentId;
          if (activeCategory === "transportes")
            return (
              (child.movilidad?.id_transporte || child.id_transporte) ===
              parentId
            );
          if (activeCategory === "trenes")
            return (
              (child.vagones?.id_tren ||
                child.vagon?.id_tren ||
                child.id_tren) === parentId
            );
          if (activeCategory === "vuelos")
            return (child.tipo_vuelo?.id_vuelo || child.id_vuelo) === parentId;
          if (activeCategory === "endoses") {
            const childParentId =
              child.id_endose ||
              child.endose_id ||
              child.tour?.id_endose ||
              child.tour?.endose_id ||
              child.endose?.id_endose ||
              child.endose?.id;
            return normalizeFilterId(childParentId) === normalizeFilterId(parentId);
          }
          if (activeCategory === "guias") return child.id_guia === parentId;
          if (activeCategory === "restaurantes")
            return child.id_restaurante === parentId;
          if (activeCategory === "tickets") return child.id_ticket === parentId;
          return false;
        });

        if (hasMatchingChild) {
          filtered.push({ ...parent });
        }
      });
    }

    filtered = applyCategoryFilters(
      filtered,
      filters,
      activeCategory,
      false,
      null,
    );
    // Filtro por calificación
    filtered = applyCalificacionFilter(filtered, filters.calificacionMinima);
    // Ordenar: calificación alta primero, luego nombre
    filtered = sortByCalificacionThenName(filtered);
    return filtered;
  }, [
    parentServices,
    childServices,
    unifiedServices,
    activeCategory,
    filters,
    applySearchFilter,
    applyCategoryFilters,
    applyCalificacionFilter,
    sortByCalificacionThenName,
  ]);

  // Servicios que coinciden con el itinerario
  const itineraryMatchingServices = useMemo(() => {
    return filteredParentServices.filter((service) => service.matchesItinerary);
  }, [filteredParentServices]);

  // Apply all filters to child services
  const filteredChildServices = useMemo(() => {
    if (!childServices || childServices.length === 0) return [];
    // AHORA EL BUSCADOR TAMBIÉN FILTRA HIJOS AUN CON PARENT SELECCIONADO
    const searchFilters = {
      ...filters,
      selectedParent, // para que applySearchFilter pueda usarlo si lo necesita
    };

    let filtered = applySearchFilter(childServices, searchFilters);

    // Filtros por categoría / rango / etc.
    filtered = applyCategoryFilters(
      filtered,
      filters,
      activeCategory,
      true,
      selectedParent,
    );

    // IMPORTANTE: la disponibilidad de una tarifa comercial exacta NO debe
    // controlar la visibilidad del servicio. Los catálogos importados pueden
    // contener servicios con tarifa interna, sin tarifa del año solicitado o
    // todavía sin precio. `prepareServicePickerCatalogRows` ya deja únicamente
    // la tarifa exacta utilizable en `service.tarifas`; si no existe, mantiene
    // el servicio visible con `tarifas: []` para que pueda incorporarse al
    // itinerario con precio provisional 0, sin exponer una tarifa interna como
    // precio externo.

    // FILTRADO REACTIVO: Coordinar servicios padre e hijo
    // - Si los padres fueron reducidos por filtros (zona, empresa, etc.):
    // los hijos se restringen a pertenecer a los padres filtrados.
    // Esto aplica SIEMPRE, incluso si hay búsqueda global activa,
    // para que un filtro de zona + búsqueda de texto respete la zona.
    const hasGlobalSearch =
      filters.searchTerm && filters.searchTerm.trim().length > 0;

    if (
      (filteredParentServices.length > 0 &&
        filteredParentServices.length < parentServices.length) ||
      selectedParents.length > 0
    ) {
      // Helper function to get parent ID from service
      const getParentIdFromService = (service) => {
        switch (activeCategory) {
          case "hoteles":
            return service.id_hotel || service.hotel_id || service.id;
          case "transportes":
            return service.id_transporte || service.transporte_id || service.id;
          case "trenes":
            return service.id_tren || service.tren_id || service.id;
          case "vuelos":
            return service.id_vuelo || service.vuelo_id || service.id;
          case "guias":
            if (
              platform === "venso" &&
              (service.isVirtualTour ||
                String(service.id || "").startsWith("tour_"))
            ) {
              return service.id;
            }
            return service.id_guia || service.guia_id || service.id;
          case "endoses":
            return service.id_endose || service.endose_id || service.id;
          case "restaurantes":
            return (
              service.id_restaurante || service.restaurante_id || service.id
            );
          case "tickets":
            return service.id_ticket || service.ticket_id || service.id;
          default:
            return service.id;
        }
      };

      // Crear un Set de IDs de padres filtrados para búsqueda rápida
      const filteredParentIds = new Set();
      filteredParentServices.forEach((parent) => {
        const parentId = getParentIdFromService(parent);
        addComparableId(filteredParentIds, parentId);
      });

      // INCLUIR SIEMPRE PADRES SELECCIONADOS MANUALMENTE
      // Esto asegura que si el usuario selecciona un padre que no coincide con los filtros (ej: otra ciudad),
      // sus hijos sigan siendo visibles.
      selectedParents.forEach((parent) => {
        const parentId = getParentIdFromService(parent);
        addComparableId(filteredParentIds, parentId);
      });

      // Filtrar hijos que pertenecen SOLO a los padres filtrados.
      // Cuando hay búsqueda de texto: applySearchFilter ya acotó por texto,
      // aquí adicionalmente restringimos por zona/empresa/etc. del padre.
      filtered = filtered.filter((child) => {
        let belongsToFilteredParent = false;

        // Check various parent-child relationships based on schema.rs
        if (activeCategory === "hoteles") {
          const parentId = child.habitacion?.id_hotel || child.id_hotel;
          belongsToFilteredParent = setHasComparableId(filteredParentIds, parentId);
        } else if (activeCategory === "transportes") {
          const parentId =
            child.movilidad?.id_transporte ||
            child.transporte?.id_transporte ||
            child.id_transporte;
          belongsToFilteredParent = setHasComparableId(filteredParentIds, parentId);
        } else if (activeCategory === "trenes") {
          const parentId =
            child.vagones?.id_tren || child.vagon?.id_tren || child.id_tren;
          belongsToFilteredParent = setHasComparableId(filteredParentIds, parentId);
        } else if (activeCategory === "vuelos") {
          const parentId =
            child.tipo_vuelo?.id_vuelo ||
            child.vuelo?.id_vuelo ||
            child.id_vuelo;
          belongsToFilteredParent = setHasComparableId(filteredParentIds, parentId);
        } else if (activeCategory === "guias") {
          // SOPORTE PARA FILTRADO POR TOUR (Venso) O POR GUÍA (Mil)
          const parentId = child.ruta?.id_guia || child.id_guia;
          const tourName = (child.tour_nombre || child.ruta?.tour_nombre || "")
            .trim()
            .toLowerCase();

          const matchesId = setHasComparableId(filteredParentIds, parentId);
          const matchesTour =
            tourName && filteredParentIds.has(`tour_${tourName}`);

          belongsToFilteredParent = matchesId || matchesTour;
        } else if (activeCategory === "endoses") {
          const parentId =
            child.tour?.id_endose ||
            child.tour?.endose_id ||
            child.endose?.id_endose ||
            child.endose?.id ||
            child.id_endose ||
            child.endose_id;
          belongsToFilteredParent = setHasComparableId(filteredParentIds, parentId);
        } else if (activeCategory === "restaurantes") {
          const parentId =
            child.restaurante?.id_restaurante || child.id_restaurante;
          belongsToFilteredParent = setHasComparableId(filteredParentIds, parentId);
        } else if (activeCategory === "tickets") {
          const parentId =
            child.ticket?.id_ticket ||
            child.tickets?.id_ticket ||
            child.id_ticket;
          belongsToFilteredParent = setHasComparableId(filteredParentIds, parentId);
        }

        // Fallback: check by parentService reference
        if (!belongsToFilteredParent && child.parentService) {
          const parentServiceId = getParentIdFromService(child.parentService);
          belongsToFilteredParent = setHasComparableId(filteredParentIds, parentServiceId);
        }

        // Fallback: check generic parent_id
        if (!belongsToFilteredParent && child.parent_id) {
          belongsToFilteredParent = setHasComparableId(filteredParentIds, child.parent_id);
        }

        return belongsToFilteredParent;
      });

      // Suppress unused variable warning
      void hasGlobalSearch;
    }

    // Si hay un padre seleccionado, filtrar solo los hijos de ese padre específico
    if (selectedParent) {
      let parentId;
      if (activeCategory === "guias") {
        // Soporte para tours virtuales en Venso
        if (
          selectedParent.isVirtualTour ||
          String(selectedParent.id || "").startsWith("tour_")
        ) {
          const tourNameKey = (
            selectedParent.tour_nombre ||
            selectedParent.nombre ||
            ""
          )
            .trim()
            .toLowerCase();
          filtered = filtered.filter((child) => {
            const childTour = (
              child.tour_nombre ||
              child.ruta?.tour_nombre ||
              ""
            )
              .trim()
              .toLowerCase();
            return childTour && childTour === tourNameKey;
          });
        } else {
          parentId = selectedParent.id_guia || selectedParent.guia_id;
          filtered = filtered.filter(
            (child) => child.id_guia === parentId || child.guia_id === parentId,
          );
        }
      } else {
        parentId =
          selectedParent.id_hotel ||
          selectedParent.id_transporte ||
          selectedParent.id_tren ||
          selectedParent.id_vuelo ||
          selectedParent.id_endose ||
          selectedParent.endose_id ||
          selectedParent.id;

        filtered = filtered.filter((child) => {
          // Hoteles
          if (
            activeCategory === "hoteles" &&
            (child.habitacion?.id_hotel === parentId ||
              child.hotel_id === parentId ||
              child.id_hotel === parentId)
          ) {
            return true;
          }
          // Transportes
          if (
            activeCategory === "transportes" &&
            (child.movilidad?.id_transporte === parentId ||
              child.transporte_id === parentId ||
              child.id_transporte === parentId)
          )
            return true;
          // Trenes
          if (
            activeCategory === "trenes" &&
            (child.vagon?.id_tren === parentId ||
              child.tren_id === parentId ||
              child.id_tren === parentId)
          )
            return true;
          // Vuelos
          if (
            activeCategory === "vuelos" &&
            (child.tipo_vuelo?.id_vuelo === parentId ||
              child.vuelo_id === parentId ||
              child.id_vuelo === parentId)
          )
            return true;
          // Endoses
          if (
            activeCategory === "endoses" &&
            (normalizeFilterId(child.tour?.id_endose) === normalizeFilterId(parentId) ||
              normalizeFilterId(child.tour?.endose_id) === normalizeFilterId(parentId) ||
              normalizeFilterId(child.endose?.id_endose) === normalizeFilterId(parentId) ||
              normalizeFilterId(child.endose?.id) === normalizeFilterId(parentId) ||
              normalizeFilterId(child.endose_id) === normalizeFilterId(parentId) ||
              normalizeFilterId(child.id_endose) === normalizeFilterId(parentId))
          )
            return true;
          // Restaurantes
          if (
            activeCategory === "restaurantes" &&
            (child.restaurante?.id_restaurante === parentId ||
              child.id_restaurante === parentId)
          )
            return true;
          // Tickets
          if (
            activeCategory === "tickets" &&
            (child.ticket?.id_ticket === parentId ||
              child.tickets?.id_ticket === parentId ||
              child.id_ticket === parentId)
          )
            return true;
          // Fallback: check by parentService reference
          if (child.parentService && selectedParent) {
            return (
              normalizeFilterId(child.parentService.id) ===
              normalizeFilterId(selectedParent.id)
            );
          }
          // Fallback: check generic parent_id
          if (child.parent_id && parentId) {
            return normalizeFilterId(child.parent_id) === normalizeFilterId(parentId);
          }
          return false;
        });
      }
    }

    // Ordenar hijos: por calificación del padre (heredada) + nombre
    filtered = [...filtered].sort((a, b) => {
      // Intentar calificación propia, luego del parentService
      const califA =
        getCalificacionValor(a) ?? getCalificacionValor(a.parentService) ?? -1;
      const califB =
        getCalificacionValor(b) ?? getCalificacionValor(b.parentService) ?? -1;
      if (califB !== califA) return califB - califA;
      const nameA = (
        a.nombre ||
        a.tipo_habitacion ||
        a.tipo_auto ||
        a.tipovuelo ||
        a.tipo_tren ||
        a.tour_nombre ||
        a.entrada ||
        ""
      ).toLowerCase();
      const nameB = (
        b.nombre ||
        b.tipo_habitacion ||
        b.tipo_auto ||
        b.tipovuelo ||
        b.tipo_tren ||
        b.tour_nombre ||
        b.entrada ||
        ""
      ).toLowerCase();
      return nameA.localeCompare(nameB);
    });

    return filtered;
  }, [
    childServices,
    filters,
    activeCategory,
    applySearchFilter,
    applyCategoryFilters,
    selectedParent,
    selectedParents,
    filteredParentServices,
    parentServices,
    platform,
    getCalificacionValor,
  ]);

  // OPTIMIZADO: Log removido

  // Update filters
  const updateFilters = useCallback((newFilters) => {
    // If empty object is passed, clear all filters (except searchTerm)
    if (Object.keys(newFilters).length === 0) {
      setFilters({ searchTerm: "" });
      return;
    }

    setFilters((prev) => {
      const updated = { ...prev, ...newFilters };

      // Convert precioMin/precioMax to rangoPrecio format for filtering
      if (
        newFilters.precioMin !== undefined ||
        newFilters.precioMax !== undefined
      ) {
        const min = newFilters.precioMin || prev.precioMin;
        const max = newFilters.precioMax || prev.precioMax;

        updated.rangoPrecio = {
          min: min ? parseFloat(min) : null,
          max: max ? parseFloat(max) : null,
        };
      }

      return updated;
    });
  }, []);

  // Clear all filters
  const clearFilters = useCallback(() => {
    setFilters({ searchTerm: "", calificacionMinima: null });
  }, []);

  // Get active filter count
  const activeFilterCount = useMemo(() => {
    return Object.entries(filters).reduce((count, [key, value]) => {
      if (key === "searchTerm" && value) return count + 1;
      if (key === "calificacionMinima" && value != null) return count + 1;
      if (Array.isArray(value) && value.length > 0) return count + 1;
      if (
        value !== null &&
        value !== undefined &&
        value !== "" &&
        typeof value === "object"
      ) {
        const hasValue = Object.values(value).some(
          (v) => v !== null && v !== undefined && v !== "",
        );
        if (hasValue) return count + 1;
      }
      return count;
    }, 0);
  }, [filters]);

  // Si hay padre seleccionado y categoría activa, agrega la categoría del padre a los filters
  let filtersWithParentCategoria = { ...filters };
  if (
    selectedParent &&
    selectedParent.categoria &&
    activeCategory === "hoteles"
  ) {
    filtersWithParentCategoria.parentServiceCategoria =
      selectedParent.categoria;
  }

  const result = {
    filters: filtersWithParentCategoria,
    filteredParentServices,
    filteredChildServices,
    updateFilters,
    clearFilters,
    activeFilterCount,
    // Nuevas propiedades para servicios unificados
    unifiedServices,
    itineraryMatchingServices,
    serviceMatchesItinerary,
    // Utilidades para servicios unificados
    hasUnifiedServices: unifiedServices.length > 0,
    hasItineraryMatches: itineraryMatchingServices.length > 0,
  };

  return result;
};
