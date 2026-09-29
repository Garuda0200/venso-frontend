# 03 — Historial de versiones

`PredecesoresExpander` presenta la historia relacional y archivo legacy. Puede comparar versión seleccionada contra trabajo actual o versión anterior.

## Diseño vigente

- resumen superior: total, pasajeros y alcance;
- días afectados siempre expandidos;
- servicios agregados/retirados/modificados siempre expandidos;
- precios/beneficiarios visibles sin acordeón adicional;
- “Ver versión” presenta detalle completo desde el inicio;
- buscador filtra día/proveedor/servicio;
- conteo adulto/niño usa composición explícita y fallback seguro.

El objetivo es que el usuario lea el cambio de arriba hacia abajo sin abrir múltiples niveles.

## Seguridad

La visualización histórica es lectura. Restaurar una versión de una venta cerrada no se ofrece como bypass del flujo postventa; el backend también lo impide.
