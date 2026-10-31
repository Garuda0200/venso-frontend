import assert from "node:assert/strict";
import { buildSidebarGroups } from "../sidebarAccess";
import { getFirstAllowedPath, hasRoutePermission, resolveAllowedModules } from "../../../../utils/permissionRoutes";

const findMediaGroup = (auth: any) =>
  buildSidebarGroups(auth).find((group: any) => group.id === "almacen");

for (const permissions of [null, { allowed_modules: ["admin", "ventas", "contabilidad"], allowed_routes: ["*"], actions: ["*"], extra_menus: ["users"] }]) {
  const transfer = { role: 6, permissions };
  assert.deepEqual(resolveAllowedModules(transfer), ["reservas"]);
  assert.equal(getFirstAllowedPath(transfer), "/reservas/calendario");
  assert.equal(hasRoutePermission(transfer, "/reservas/calendario?view=day"), true);
  for (const path of ["/admin/usuarios", "/ventas/cotizaciones", "/reservas/vouchers", "/reservas/servicios", "/contabilidad/movimientos", "/profile/me"]) {
    assert.equal(hasRoutePermission(transfer, path), false, path);
  }
  assert.deepEqual(buildSidebarGroups(transfer).flatMap(group => group.items.map(item => item.path)), ["/reservas/calendario"]);
}

{
  const group = findMediaGroup({ role: 0, permissions: null });
  assert.ok(group, "superadmin debe visualizar Gestión Media");
  assert.equal(group.items[0].path, "/almacen/inventario");
  assert.equal(group.items[0].name, "Banco de imágenes");
}

{
  const group = findMediaGroup({ role: 5, permissions: null });
  assert.ok(group, "rol de almacén debe visualizar Gestión Media");
  assert.ok(group.items.some((item: any) => item.path === "/almacen/inventario"));
}

{
  const group = findMediaGroup({ role: 2, permissions: null });
  assert.equal(group, undefined, "ventas no debe recibir Gestión Media por defecto");
}

{
  const accountingGroup = buildSidebarGroups({
    role: 4,
    permissions: {
      allowed_modules: [],
      allowed_routes: ["/contabilidad/files"],
      extra_menus: [],
    },
  }).find((group: any) => group.id === "contabilidad");
  assert.ok(accountingGroup, "el permiso histórico de files debe conservar Movimientos");
  assert.deepEqual(
    accountingGroup.items.map((item: any) => item.path),
    ["/contabilidad/movimientos"],
  );
}

{
  const accountingGroup = buildSidebarGroups({
    role: 4,
    permissions: {
      allowed_modules: [],
      allowed_routes: ["/contabilidad/liquidaciones"],
      extra_menus: [],
    },
  }).find((group: any) => group.id === "contabilidad");
  assert.ok(accountingGroup, "el permiso histórico debe conservar Pagos por lote");
  assert.deepEqual(
    accountingGroup.items.map((item: any) => ({ path: item.path, name: item.name })),
    [{ path: "/contabilidad/pagos-lote", name: "Pagos por lote" }],
  );
}

{
  const group = findMediaGroup({
    role: 2,
    permissions: {
      allowed_modules: [],
      allowed_routes: ["/almacen/inventario"],
      extra_menus: [],
    },
  });
  assert.ok(group, "una ruta explícita debe habilitar Gestión Media");
  assert.deepEqual(group.items.map((item: any) => item.path), ["/almacen/inventario"]);
}

console.log("sidebarAccess.test.ts PASS");

{
  const adminGroup = buildSidebarGroups({ role: 0, permissions: null }).find(
    (group: any) => group.id === "admin",
  );
  assert.ok(adminGroup, "superadmin debe conservar el módulo Administración");
  assert.equal(
    adminGroup.items.some((item: any) => item.path === "/admin/comisiones"),
    false,
    "Comisiones debe permanecer oculta incluso para superadmin",
  );
}

{
  const adminGroup = buildSidebarGroups({
    role: 2,
    permissions: {
      allowed_modules: [],
      allowed_routes: ["/admin/comisiones"],
      extra_menus: [],
    },
  }).find((group: any) => group.id === "admin");
  assert.equal(
    adminGroup,
    undefined,
    "una autorización histórica de comisiones no debe volver a mostrar el acceso oculto",
  );
}
