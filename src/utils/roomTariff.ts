// The chosen shared/private tariff is separate from physical room capacity.
export const roomTariffPrice = (tariff = {}, packageType = "compartido") => {
  const type = tariff.tipoPrecio || tariff.tipo_precio || tariff.selectedType || tariff.selectedPackageType || packageType;
  const value = type === "privado" ? tariff.precio_privado : tariff.precio_compartido;
  const number = Number(value ?? tariff.precio ?? tariff.precio_compartido ?? tariff.precio_privado ?? 0);
  return Number.isFinite(number) ? number : 0;
};
