# 02 — Cotizaciones y editor

## Flujo

La tabla/listado abre `EdicionCotizacion`. El editor trabaja con la agencia persistida de la cotización, pasajeros, días, servicios internos/externos y hotel pricing.

## Asignaciones

`assignmentProtection` identifica evidencia operacional. SortableService, externos y hotel pricing no deben mover/eliminar/repreciar una fila asignada. Al reconstruir hoteles se conserva la identidad de noches protegidas.

## Venta cerrada

Una venta cerrada no se abre directamente. La tabla cruza la cotización con `usePostSaleEditRequests`:

- sin request: “Solicitar edición” para propietario habilitado;
- `PENDING`: espera;
- `APPROVED` vigente: “Editar venta”;
- terminal/expirada: permite nuevo request según política.

Antes de abrir por aprobación se vuelven a obtener request + cotización frescos y se exige `current_version == approved_version`.

## Guardado postventa

El editor construye un solo payload con request/nonce/version, snapshot comercial y pasajeros. `postSaleEditService.commit` llama el endpoint atómico. No se usa autosave ni varias mutaciones separadas para consumir el permiso.
