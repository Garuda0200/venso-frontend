# 04 — UI de autorización postventa

## Solicitud

`PostSaleEditRequestModal` es deliberadamente minimalista: muestra venta cerrada, cotización, un campo “Motivo” y acciones Cancelar/Enviar. No expone números internos de roles.

## Estado reactivo

`usePostSaleEditRequests` consulta requests propios y reacciona a eventos SSE/DOM. PostgreSQL/backend sigue siendo autoridad. La UI calcula vencimiento y estado utilizable con `postSaleEditState`.

## Admin

`/admin/post-sale-edits` aparece únicamente para `role=0` y permite revisar pendientes/aprobadas/etc., aprobar, rechazar y revocar. Esto es un guard visual; cada endpoint vuelve a comprobar `role=0`.

## Editor autorizado

Muestra banner/TTL y guarda mediante un único commit. Si vence, cambia versión o el request deja de estar aprobado, no intenta reutilizar la autorización.
