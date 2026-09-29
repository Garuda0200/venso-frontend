import { FRONTEND_FEATURES } from "../../../../config/frontendFeatures";

export const AREA_ROUTES = {
  admin: [
    { path: "/admin/dashboard", label: "Dashboard", key: "dashboard" },
    { path: "/admin/users", label: "Gestión de Usuarios", key: "users" },
    { path: "/admin/logs", label: "Logs del Sistema", key: "logs" },
    {
      path: "/admin/comisiones",
      label: "Comisiones",
      key: "comisiones",
      hidden: !FRONTEND_FEATURES.commissionsManagement,
    },
    {
      path: "/admin/configuracion",
      label: "Configuración",
      key: "configuracion",
    },
  ],
  ventas: [
    { path: "/ventas/dashboard", label: "Dashboard", key: "dashboard" },
    {
      path: "/ventas/cotizaciones",
      label: "Cotizaciones",
      key: "cotizaciones",
    },
    { path: "/ventas/vouchers", label: "Vouchers de Venta", key: "vouchers" },
    { path: "/ventas/paquetes", label: "Paquetes Turísticos", key: "paquetes" },
    {
      path: "/ventas/configuracion",
      label: "Configuración",
      key: "configuracion",
    },
  ],
  reservas: [
    { path: "/reservas/dashboard", label: "Dashboard", key: "dashboard" },
    { path: "/reservas/cotizaciones", label: "Cotizaciones", key: "cotizaciones" },
    {
      path: "/reservas/vouchers",
      label: "Vouchers de Reserva",
      key: "vouchers",
    },
    {
      path: "/reservas/servicios",
      label: "Servicios / Itinerario",
      key: "servicios",
    },
    { path: "/reservas/calendario", label: "Biblia de actividades", key: "calendario" },
    {
      path: "/reservas/configuracion",
      label: "Configuración",
      key: "configuracion",
    },
  ],
  contabilidad: [
    { path: "/contabilidad/dashboard", label: "Dashboard", key: "dashboard" },
    { path: "/contabilidad/caja", label: "Cuentas", key: "caja" },
    {
      path: "/contabilidad/movimientos",
      label: "Movimientos",
      key: "files",
    },
    {
      path: "/contabilidad/pagos-lote",
      label: "Pagos por lote",
      key: "liquidaciones",
    },
    {
      path: "/contabilidad/estados",
      label: "Estados Financieros",
      key: "estados",
    },
    { path: "/contabilidad/reportes", label: "Reportes", key: "reportes" },
    {
      path: "/contabilidad/configuracion",
      label: "Configuración",
      key: "configuracion",
    },
  ],
  almacen: [
    { path: "/almacen/inventario", label: "Media Manager", key: "inventario" },
    { path: "/almacen/patrimonio", label: "Patrimonio", key: "patrimonio" },
    {
      path: "/almacen/configuracion",
      label: "Configuración",
      key: "configuracion",
    },
  ],
};


export const SPECIAL_ACTIONS = [
  { key: "view_all_quotes", label: "Ver todas las cotizaciones" },
  { key: "view_all_vouchers", label: "Ver todos los vouchers de venta" },
  {
    key: "view_commissions",
    label: "Ver panel de comisiones",
    hidden: !FRONTEND_FEATURES.commissionsManagement,
  },
  {
    key: "view_all_commissions",
    label: "Ver comisiones globales",
    hidden: !FRONTEND_FEATURES.commissionsManagement,
  },
  {
    key: "manage_sales_goals",
    label: "Gestionar meta mínima de ventas",
    hidden: !FRONTEND_FEATURES.commissionsManagement,
  },
];
