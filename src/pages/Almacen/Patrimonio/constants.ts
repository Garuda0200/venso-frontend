export const EMPTY_FORM = {
  codigo: "",
  categoria: "",
  nombre: "",
  descripcion: "",
  estado: "operativo",
  ubicacion: "",
  responsable_nombre: "",
  responsable_dni: "",
  codigos_alternos_text: "",
  atributos: {},
};

export const MOVEMENT_FORM = {
  tipo: "asignacion",
  responsable_nombre: "",
  responsable_dni: "",
  ubicacion_nueva: "",
  estado_nuevo: "operativo",
  observacion: "",
};

export const ESTADOS = [
  { value: "operativo", label: "Operativo" },
  { value: "mantenimiento", label: "Mantenimiento" },
  { value: "observado", label: "Observado" },
  { value: "perdido", label: "Perdido" },
  { value: "baja", label: "Baja" },
];

export const TIPOS_MOVIMIENTO = [
  { value: "asignacion", label: "Asignación compartida" },
  { value: "reasignacion", label: "Reasignación" },
  { value: "devolucion", label: "Devolución" },
  { value: "traslado", label: "Traslado" },
  { value: "mantenimiento", label: "Enviar a mantenimiento" },
  { value: "cambio_estado", label: "Cambiar estado" },
  { value: "observacion", label: "Registrar observación" },
  { value: "alta", label: "Reactivar / alta" },
  { value: "baja", label: "Marcar de baja" },
];

const textField = (key, label, placeholder = "") => ({
  key,
  label,
  type: "text",
  placeholder,
});

const numberField = (key, label, suffix = "") => ({
  key,
  label,
  type: "number",
  suffix,
});

export const CATEGORY_DEFINITIONS = [
  {
    value: "CPU",
    prefix: "CPU",
    label: "CPU",
    fields: [
      textField("procesador", "Procesador"),
      numberField("ram_gb", "Memoria RAM", "GB"),
      textField("grafica", "Tarjeta gráfica"),
    ],
  },
  {
    value: "Celular",
    prefix: "CLR",
    label: "Celular",
    fields: [
      textField("modelo", "Modelo"),
      textField("procesador", "Procesador"),
      numberField("ram_gb", "Memoria RAM", "GB"),
      textField("almacenamiento", "Almacenamiento"),
    ],
  },
  {
    value: "Monitor",
    prefix: "PT",
    label: "Monitor",
    fields: [
      textField("marca", "Marca"),
      textField("entrada", "Entrada de video"),
      textField("pulgadas", "Tamaño"),
      textField("color", "Color"),
      textField("cable_video_codigo", "Cable relacionado"),
    ],
  },
  {
    value: "Teclado",
    prefix: "TL",
    label: "Teclado",
    fields: [textField("marca", "Marca"), textField("color", "Color")],
  },
  {
    value: "Mouse",
    prefix: "MS",
    label: "Mouse",
    fields: [textField("marca", "Marca"), textField("color", "Color")],
  },
  {
    value: "Audífono",
    prefix: "AU",
    label: "Audífono",
    fields: [textField("marca", "Marca"), textField("color", "Color")],
  },
  {
    value: "Parlante",
    prefix: "PL",
    label: "Parlante",
    fields: [textField("marca", "Marca"), textField("color", "Color")],
  },
  {
    value: "Cámara web",
    prefix: "CAM",
    label: "Cámara web",
    fields: [textField("marca", "Marca"), textField("color", "Color")],
  },
  {
    value: "Estabilizador",
    prefix: "ETR",
    label: "Estabilizador",
    fields: [textField("marca", "Marca"), textField("color", "Color")],
  },
  {
    value: "Impresora",
    prefix: "IMP",
    label: "Impresora",
    fields: [
      textField("marca", "Marca"),
      textField("modelo", "Modelo"),
      textField("marca_modelo", "Marca / modelo registrado"),
    ],
  },
  {
    value: "Laptop",
    prefix: "LAP",
    label: "Laptop",
    fields: [
      textField("marca", "Marca"),
      textField("procesador", "Procesador"),
      numberField("ram_gb", "Memoria RAM", "GB"),
      textField("grafica", "Tarjeta gráfica"),
      textField("cargadores_relacionados", "Cargadores relacionados"),
    ],
  },
  {
    value: "Cámara de seguridad",
    prefix: "CAMS",
    label: "Cámara de seguridad",
    fields: [textField("modelo", "Modelo")],
  },
  {
    value: "Cable de alimentación",
    prefix: "CDA",
    label: "Cable de alimentación",
    fields: [textField("condicion", "Condición")],
  },
  {
    value: "Cable HDMI",
    prefix: "HDMI",
    label: "Cable HDMI",
    fields: [textField("equipo_relacionado", "Equipo relacionado")],
  },
  {
    value: "Cable VGA",
    prefix: "VGA",
    label: "Cable VGA",
    fields: [textField("equipo_relacionado", "Equipo relacionado")],
  },
  {
    value: "Adaptador de red",
    prefix: "ADPR",
    label: "Adaptador de red",
    fields: [
      textField("marca", "Marca"),
      textField("caracteristicas", "Características"),
    ],
  },
  {
    value: "Repetidor de red",
    prefix: "RED",
    label: "Repetidor de red",
    fields: [textField("marca", "Marca")],
  },
  {
    value: "Proyector",
    prefix: "PRY",
    label: "Proyector",
    fields: [
      textField("marca", "Marca"),
      textField("caracteristicas", "Características"),
    ],
  },
  {
    value: "Cargador de laptop",
    prefix: "CRG",
    label: "Cargador de laptop",
    fields: [
      textField("laptops_relacionadas", "Laptops relacionadas"),
      textField("condicion", "Condición"),
    ],
  },
];

export const CATEGORY_MAP = CATEGORY_DEFINITIONS.reduce((result, category) => {
  result[category.value] = category;
  return result;
}, {});

export const ATTRIBUTE_LABELS = {
  procesador: "Procesador",
  ram_gb: "Memoria RAM",
  grafica: "Tarjeta gráfica",
  almacenamiento: "Almacenamiento",
  marca: "Marca",
  modelo: "Modelo",
  marca_modelo: "Marca / modelo",
  entrada: "Entrada",
  pulgadas: "Tamaño",
  color: "Color",
  cable_video_codigo: "Cable de video",
  cargadores_relacionados: "Cargadores relacionados",
  observacion_cargador: "Observación del cargador",
  condicion: "Condición",
  caracteristicas: "Características",
  equipo_relacionado: "Equipo relacionado",
  laptops_relacionadas: "Laptops relacionadas",
};
