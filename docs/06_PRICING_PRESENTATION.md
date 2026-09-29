# 06 — Presentación de pricing por pasajero

`SummaryContent` refleja el snapshot de servicios por beneficiario:

- filas de adultos beneficiarios con tarifa adulta;
- filas de niños con precio explícito/gratis/tarifa adulta cuando corresponde;
- tickets agrupados muestran precio por línea y agregados adulto/niño;
- servicios internos/externos muestran “Por adulto” y beneficiarios;
- habitaciones muestran monto por ocupante.

## Identidad de pasajeros

Los helpers distinguen IDs largos base cero (`adult:0:ROW`) de slots cortos base uno (`adult:1`). Las claves con guion se conservan como identidad exacta porque históricos pueden mezclar convenciones base 0/base 1; no se inventa un alias que pueda fusionar dos pasajeros.

## Venso

Estos helpers son neutrales a la agencia. El precio que reciben ya corresponde al contexto tarifario de `cotizacion.agency_id`.
