/**
 * Transport conflict detection and auto-resolution helpers.
 *
 * Extracted from EdicionCotizacion.jsx to keep the component lean.
 */
import { createUnifiedService } from "./unifiedServiceManager";

/**
 * Find a better-fit vehicle from the same transport provider.
 * @param {"upsize"|"downsize"} mode
 */
export const findBetterFitVehicle = async (
  axios,
  service,
  idTransporte,
  targetPax,
  mode,
) => {
  try {
    const resp = await axios.get(
      `/turismo/movilidades/transporte/${idTransporte}/con-tarifas`,
    );
    const movilidadesData = resp.data?.data || resp.data || [];
    const currentMovId =
      service.childService?.id_movilidad ||
      service.childService?.movilidad?.id_movilidad;
    const currentCap =
      parseInt(service.childService?.nro_pasajeros) ||
      parseInt(service.childService?.movilidad?.nro_pasajeros) ||
      0;
    const currentRuta = (
      service.childService?.ruta ||
      service.childService?.movilidad?.ruta ||
      ""
    ).trim();

    const candidates = movilidadesData
      .filter((m) => {
        const cap =
          parseInt(m.movilidad?.nro_pasajeros ?? m.nro_pasajeros) || 0;
        const movId = m.movilidad?.id_movilidad ?? m.id_movilidad;
        const ruta = ((m.movilidad?.ruta ?? m.ruta) || "").trim();
        // Only consider candidates with the same route
        if (!currentRuta || ruta !== currentRuta) return false;
        if (mode === "upsize")
          return cap >= targetPax && movId !== currentMovId;
        return cap >= targetPax && cap < currentCap && movId !== currentMovId;
      })
      .sort((a, b) => {
        const capA =
          parseInt(a.movilidad?.nro_pasajeros ?? a.nro_pasajeros) || 0;
        const capB =
          parseInt(b.movilidad?.nro_pasajeros ?? b.nro_pasajeros) || 0;
        return capA - capB;
      });

    return candidates[0] || null;
  } catch (e) {
    console.warn("Error buscando movilidad alternativa:", e);
    return null;
  }
};

/**
 * Build a replacement service from a movilidad search result.
 */
export const buildReplacementService = (
  parentService,
  movilidadData,
  service,
  pkgType,
  peopleDetails,
) => {
  const movilidad = movilidadData.movilidad || movilidadData;
  const tarifas = movilidadData.tarifas || [];
  if (tarifas.length === 0) return null;

  const tarifa = tarifas[0];
  let precio_compartido = parseFloat(tarifa.precio_compartido) || 0;
  let precio_privado = parseFloat(tarifa.precio_privado) || 0;
  if (tarifa.moneda === "soles" && tarifa.tasa_cambio) {
    const tasa = parseFloat(tarifa.tasa_cambio);
    if (tasa > 0) {
      precio_compartido = precio_compartido / tasa;
      precio_privado = precio_privado / tasa;
    }
  }
  const precio =
    pkgType === "privado"
      ? precio_privado || precio_compartido
      : precio_compartido || precio_privado;

  const newService = createUnifiedService(
    parentService,
    { ...movilidad, packageType: pkgType },
    {
      ...tarifa,
      precio_compartido,
      precio_privado,
      selectedPackageType: pkgType,
      precio,
    },
    peopleDetails,
    pkgType,
  );

  if (service.fxMeta) newService.fxMeta = service.fxMeta;
  return newService;
};

/**
 * Scan days for undersized / oversized transport services.
 * Returns { undersizedList, oversizedList }.
 */
export const detectTransportConflicts = (days, requiredPax) => {
  const undersizedList = [];
  const oversizedList = [];

  days.forEach((day, dayIdx) => {
    (day.servicios || []).forEach((s, svcIdx) => {
      const ts = (
        s?.parentService?.typeService ||
        s?.typeService ||
        ""
      ).toLowerCase();
      if (ts !== "transportes") return;

      const capacity =
        parseInt(s.childService?.nro_pasajeros) ||
        parseInt(s.childService?.movilidad?.nro_pasajeros) ||
        0;

      if (capacity > 0 && capacity < requiredPax) {
        undersizedList.push({ dayIdx, svcIdx, day, service: s, capacity });
      } else if (capacity > requiredPax) {
        oversizedList.push({ dayIdx, svcIdx, day, service: s, capacity });
      }
    });
  });

  return { undersizedList, oversizedList };
};

/**
 * Build a conflict descriptor suitable for the transport-conflict UI.
 */
export const toConflictDescriptor = (item, requiredPax) => ({
  dayIndex: item.dayIdx,
  serviceIndex: item.svcIdx,
  dayTitle: item.day.titulo || `Día ${item.day.numero || item.dayIdx + 1}`,
  dayNumber: item.day.numero || item.dayIdx + 1,
  transportName: item.service.parentService?.nombre_transporte || "Transporte",
  movilidadName:
    item.service.childService?.tipo_auto ||
    item.service.childService?.movilidad?.tipo_auto ||
    "",
  ruta:
    item.service.childService?.ruta ||
    item.service.childService?.movilidad?.ruta ||
    "",
  capacity: item.capacity,
  required: requiredPax,
});
