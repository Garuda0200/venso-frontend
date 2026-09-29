import React from "react";
import {
  FaHotel,
  FaBus,
  FaUser,
  FaBuilding,
  FaPlane,
  FaTrain,
  FaUtensils,
  FaTicketAlt,
  FaBolt,
} from "react-icons/fa";
import { detectServiceType } from "../../utils/serviceTypeMapper";
import { repairMojibakeText } from "../../../../utils/hotelDetallePayload";
import { getServiceObservations } from "../../utils/serviceObservations";
import "./ServiceDetailedInfo.scss";

const CATEGORY_ICONS = {
  hoteles: FaHotel,
  transportes: FaBus,
  guias: FaUser,
  endoses: FaBuilding,
  vuelos: FaPlane,
  trenes: FaTrain,
  restaurantes: FaUtensils,
  tickets: FaTicketAlt,
  extras: FaBolt,
};

const CATEGORY_LABELS = {
  hoteles: "Hotel",
  transportes: "Transporte",
  guias: "Guía",
  endoses: "Endose",
  vuelos: "Vuelo",
  trenes: "Tren",
  restaurantes: "Restaurante",
  tickets: "Ticket",
  extras: "Extra",
};

const cleanDisplayText = (value) => {
  if (value == null) return "";
  return repairMojibakeText(value);
};

/**
 * ServiceDetailedInfo – Muestra proveedor y servicio de forma minimalista y legible.
 * Un solo icono de categoría + detalles en texto plano.
 */
const ServiceDetailedInfo = ({ service, className = "", categoryId }) => {
  if (!service || typeof service !== "object") return null;

  let category;
  try {
    category = detectServiceType(service);
    if ((!category || category === "unknown") && categoryId)
      category = categoryId;
  } catch {
    return null;
  }
  if (!category || category === "unknown") return null;

  const cat = category.toLowerCase();
  const Icon = CATEGORY_ICONS[cat] || FaBolt;
  const label = CATEGORY_LABELS[cat] || category;
  const tarifa = service.tariff || service.tarifa;
  const lines = [];
  const observations = getServiceObservations(service, cat);

  const add = (text) => {
    const cleanText = cleanDisplayText(text).trim();
    if (cleanText) lines.push(cleanText);
  };

  switch (cat) {
    case "hoteles": {
      const hotel = service.parentService || service;
      const hab = service.childService || service;
      add(hotel.nombre);
      const parts = [hotel.categoria, hotel.ciudad].filter(Boolean);
      if (parts.length) add(parts.join(" · "));
      add(hab.tipo_habitacion || hab.habitacion?.tipo_habitacion);
      if (tarifa?.tipo_alimentacion)
        add(`Alimentación: ${tarifa.tipo_alimentacion}`);
      if (hotel.desayuno !== undefined) {
        add(
          `Desayuno: ${hotel.desayuno ? (hotel.tipo_desayuno ? hotel.tipo_desayuno : "Incluido") : "No incluido"}`,
        );
      }
      if (tarifa?.temporada) add(`Temporada: ${tarifa.temporada}`);
      break;
    }
    case "transportes": {
      const trans = service.parentService || service;
      const mov = service.childService || service;
      add(trans.nombre_transporte);
      if (trans.zona) add(`Zona: ${trans.zona}`);
      add(mov.tipo_auto);
      if (mov.ruta) add(`Ruta: ${mov.ruta}`);
      if (mov.nro_pasajeros) add(`Capacidad: ${mov.nro_pasajeros} pax`);
      break;
    }
    case "guias": {
      const persona = service.parentService?.persona || service.persona;
      const guia =
        service.parentService?.guia || service.guia || service.parentService;
      if (persona?.nombres)
        add(`${persona.nombres} ${persona.apellidos || ""}`);
      if (guia?.idioma) {
        const txt = Array.isArray(guia.idioma)
          ? guia.idioma.join(", ")
          : String(guia.idioma);
        add(`Idiomas: ${txt}`);
      }
      const ruta =
        service.childService?.ruta ||
        service.childService ||
        service.ruta ||
        service;
      if (ruta?.tour_nombre) add(`Tour: ${ruta.tour_nombre}`);
      break;
    }
    case "endoses": {
      const endose = service.parentService || service;
      add(endose.nombre_agencia);
      if (endose.tipo_tour) add(`Tour: ${endose.tipo_tour}`);
      if (endose.zona) add(`Zona: ${endose.zona}`);
      const tour =
        service.childService?.tour || service.childService || service;
      if (tour?.tipo_guiado) add(`Guiado: ${tour.tipo_guiado}`);
      if (tour?.idioma) {
        const txt = Array.isArray(tour.idioma)
          ? tour.idioma.join(", ")
          : tour.idioma;
        add(`Idioma: ${txt}`);
      }
      break;
    }
    case "vuelos": {
      const vuelo = service.parentService?.vuelo || service.parentService;
      const tipo = service.childService?.tipo_vuelo || service.childService;
      add(vuelo?.nombre);
      if (tipo?.tipovuelo) add(tipo.tipovuelo);
      if (tipo?.lugar_ida && tipo?.lugar_vuelta)
        add(`${tipo.lugar_ida} → ${tipo.lugar_vuelta}`);
      if (tipo?.hora_salida || tipo?.hora_llegada)
        add(`${tipo.hora_salida || "-"} – ${tipo.hora_llegada || "-"}`);
      if (tipo?.equipaje) add(`Equipaje: ${tipo.equipaje}`);
      break;
    }
    case "trenes": {
      const tren = service.parentService || service;
      const vagon =
        service.childService?.vagon || service.childService || service;
      add(tren.nombre_empresa);
      if (vagon?.tipo_tren) add(vagon.tipo_tren);
      if (vagon?.lugar_salida && vagon?.lugar_destino)
        add(`${vagon.lugar_salida} → ${vagon.lugar_destino}`);
      if (vagon?.hora_salida && vagon?.hora_llegada)
        add(`${vagon.hora_salida} – ${vagon.hora_llegada}`);
      break;
    }
    case "restaurantes": {
      const rest =
        service.childService?.restaurante || service.restaurante || service;
      add(rest?.nombre);
      if (rest?.direccion) add(rest.direccion);
      break;
    }
    case "tickets": {
      const t =
        service.childService?.ticket ||
        service.childService?.tickets ||
        service.ticket ||
        service;
      add(t?.entrada);
      if (t?.procedencia) add(`Procedencia: ${t.procedencia}`);
      if (t?.tipo_usuario) add(`Tipo: ${t.tipo_usuario}`);
      break;
    }
    case "extras": {
      const ext =
        service.parentService ||
        service.childService?.servicio_extra ||
        service.childService ||
        service;
      add(ext?.nombre);
      if (ext?.descripcion) add(ext.descripcion);
      if (ext?.categoria) add(`Categoría: ${ext.categoria}`);
      break;
    }
    default:
      break;
  }

  if (lines.length === 0 && !observations) return null;

  return (
    <div className={`service-detailed-info ${className}`}>
      <span className="sdi-icon">
        <Icon />
      </span>
      <div className="sdi-content">
        <span className="sdi-category">{label}</span>
        {lines.map((line, i) => (
          <span key={i} className={`sdi-line${i === 0 ? " sdi-title" : ""}`}>
            {line}
          </span>
        ))}
        {observations && (
          <span className="sdi-observations">
            <strong>Observaciones:</strong> {cleanDisplayText(observations)}
          </span>
        )}
      </div>
    </div>
  );
};

export default ServiceDetailedInfo;
