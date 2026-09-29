import { FRONTEND_FEATURES } from "../../../config/frontendFeatures";

export const moduleOrder = [
  "admin",
  "ventas",
  "reservas",
  "contabilidad",
  "almacen",
];

export const moduleMeta = {
  admin: {
    label: "Administracion",
    shortLabel: "Admin",
    icon: "adminIcon",
    dashboardPath: "/admin/dashboard",
  },
  ventas: {
    label: "Ventas",
    shortLabel: "Ventas",
    icon: "ventasIcon",
    dashboardPath: "/ventas/dashboard",
  },
  reservas: {
    label: "Reservas",
    shortLabel: "Reservas",
    icon: "reservasIcon",
    dashboardPath: "/reservas/dashboard",
  },
  contabilidad: {
    label: "Contabilidad",
    shortLabel: "Conta",
    icon: "contabilidadIcon",
    dashboardPath: "/contabilidad/dashboard",
  },
  // Gestión Media conserva internamente el módulo `almacen`.
  almacen: {
    label: "Gestión Media",
    shortLabel: "Media",
    icon: "almacenIcon",
    dashboardPath: "/almacen/inventario",
  },
};

const menuConfig = {
  admin: [
    {
      key: "dashboard",
      name: "Dashboard",
      path: "/admin/dashboard",
      icon: "dashboardIcon",
    },
    { key: "users", name: "Usuarios", path: "/admin/users", icon: "usersIcon" },
    {
      key: "logs",
      name: "Logs del Sistema",
      path: "/admin/logs",
      icon: "logsIcon",
    },
    {
      key: "comisiones",
      name: "Comisiones",
      path: "/admin/comisiones",
      icon: "vouchersIcon",
      // Se conserva la entrada para poder reactivarla sin reconstruir el módulo.
      hidden: !FRONTEND_FEATURES.commissionsManagement,
    },
    {
      key: "post-sale-edits",
      name: "Permisos postventa",
      path: "/admin/post-sale-edits",
      icon: "logsIcon",
      superadminOnly: true,
    },
  ],

  ventas: [
    {
      key: "dashboard",
      name: "Dashboard",
      path: "/ventas/dashboard",
      icon: "dashboardIcon",
    },
    {
      key: "cotizaciones",
      name: "Cotizaciones",
      path: "/ventas/cotizaciones",
      icon: "vouchersIcon",
    },
    {
      key: "vouchers",
      name: "Vouchers",
      path: "/ventas/vouchers",
      icon: "vouchersIcon",
    },
    {
      key: "paquetes",
      name: "Paquetes",
      path: "/ventas/paquetes",
      icon: "paquetesIcon",
    },
  ],

  reservas: [
    {
      key: "dashboard",
      name: "Dashboard",
      path: "/reservas/dashboard",
      icon: "dashboardIcon",
    },
    {
      key: "cotizaciones",
      name: "Cotizaciones",
      path: "/reservas/cotizaciones",
      icon: "vouchersIcon",
    },
    {
      key: "servicios",
      name: "Servicios y Agencias",
      path: "/reservas/servicios",
      icon: "serviciosIcon",
    },
    {
      key: "vouchers",
      name: "Reservas",
      path: "/reservas/vouchers",
      icon: "vouchersIcon",
    },
    {
      key: "calendario",
      name: "Biblia de actividades",
      path: "/reservas/calendario",
      icon: "calendarioIcon",
    },
  ],

  contabilidad: [
    {
      key: "dashboard",
      name: "Dashboard",
      path: "/contabilidad/dashboard",
      icon: "dashboardIcon",
    },
    {
      // Conserva la clave de permiso histórica; el nombre visible cambia a Cuentas.
      key: "caja",
      name: "Cuentas",
      path: "/contabilidad/caja",
      icon: "ingresosIcon",
    },
    {
      // Conserva permisos ya otorgados para el antiguo apartado Files.
      key: "files",
      name: "Movimientos",
      path: "/contabilidad/movimientos",
      icon: "vouchersIcon",
    },
    {
      // Conserva la clave de permiso histórica mientras cambia el flujo visible.
      key: "liquidaciones",
      name: "Pagos por lote",
      path: "/contabilidad/pagos-lote",
      icon: "reportesIcon",
    },
    {
      key: "estados",
      name: "Estados",
      path: "/contabilidad/estados",
      icon: "estadoIcon",
    },
    {
      key: "reportes",
      name: "Reportes",
      path: "/contabilidad/reportes",
      icon: "reportesIcon",
    },
  ],

  almacen: [
    {
      key: "inventario",
      name: "Banco de imágenes",
      path: "/almacen/inventario",
      icon: "inventarioIcon",
    },
    {
      key: "patrimonio",
      name: "Patrimonio",
      path: "/almacen/patrimonio",
      icon: "inventarioIcon",
    },
  ],
};

export default menuConfig;
