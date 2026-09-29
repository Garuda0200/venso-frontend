export const USER_ROLES = [
  { value: 0, label: "Superadmin" },
  { value: 1, label: "Admin" },
  { value: 2, label: "Ventas" },
  { value: 3, label: "Reservas" },
  { value: 4, label: "Contabilidad" },
  { value: 5, label: "Gestión Media" },
];

export const USER_ROLE_MAP = Object.fromEntries(
  USER_ROLES.map(({ value, label }) => [value, label]),
);

export const getUserDisplayName = (user = {}) =>
  [user.nombre, user.apellidopaterno, user.apellidomaterno]
    .filter(Boolean)
    .join(" ")
    .trim() || user.email || user.dniuser || "Usuario";
