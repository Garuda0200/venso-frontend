import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import CatalogWorkspace from "../../components/common/CatalogWorkspace";

test("catalogue filters, search and actions share a header; records keep one accessible viewport", () => {
  const html = renderToStaticMarkup(<CatalogWorkspace>
    <div className="back-navigation"><button>Volver</button></div>
    <div className="header-dashboard"><button>Nuevo servicio</button></div>
    <div className="filters-wrapper show"><input aria-label="Buscar" /><button>Confidencial</button><button>Pública</button></div>
    <table><tbody><tr><td>Servicio de prueba</td></tr></tbody></table>
  </CatalogWorkspace>);
  const header = html.slice(html.indexOf("<header"), html.indexOf("</header>"));
  assert.match(header, /Volver/); assert.match(header, /Nuevo servicio/); assert.match(header, /Buscar/);
  assert.match(header, /Confidencial/); assert.match(header, /Pública/);
  assert.doesNotMatch(header, /<table/);
  assert.match(html, /role="region" aria-label="Registros del catálogo" tabindex="0"/);
  assert.equal((html.match(/class="catalogue-records"/g) || []).length, 1);
});

test("all active provider and service lists use the same compact workspace", () => {
  const files = ["hotel/HotelList", "ticket/TicketsManager", "transporte/TransporteList", "vuelo/VuelosList", "endose/EndosesList", "tren/TrenList", "guia/GuiaList", "restaurante/RestaurantesManager", "servicio_extra/ServiciosExtraManager", "habitacion/HabitacionesHotelList", "movilidad/MovilidadesTransporteList", "tipo_vuelo/TipoVuelosVueloList", "tour/ToursEndoseList", "ruta/RutasGuiaList", "vagon/VagonesTrenList"];
  for (const file of files) {
    const source = readFileSync(resolve(`src/pages/Reservas/Servicios/components/${file}.tsx`), "utf8");
    assert.match(source, /<CatalogWorkspace[ >]/, file);
    assert.match(source, /<\/CatalogWorkspace>/, file);
  }
});
