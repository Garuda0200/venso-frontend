import {
  isOperationallyAssignedService,
  preserveOperationallyAssignedServices,
  reconcileHotelServiceRows,
} from "../assignmentProtection";

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

const assertEqual = (actual: unknown, expected: unknown, message: string) => {
  if (!Object.is(actual, expected)) {
    throw new Error(`${message}: esperado ${String(expected)}, recibido ${String(actual)}`);
  }
};

const assignedHotel = (overrides: Record<string, any> = {}) => ({
  id: 501,
  versionUid: "4fa3371f-bbd9-462e-b0f5-501501501501",
  typeService: "hoteles",
  parentService: { id_hotel: 10, nombre: "Hotel Limade" },
  childService: { id_habitacion: 20, tipo_habitacion: "Familiar" },
  precioServicio: 270,
  isAssigned: true,
  assignedParentId: 10,
  assignedChildId: 20,
  assignedPrecioServicio: 240,
  ...overrides,
});

const generatedHotel = (overrides: Record<string, any> = {}) => ({
  id: "auto-hotel-3-familiar-r1-n1",
  typeService: "hoteles",
  parentService: { id_hotel: 10, nombre: "Hotel Limade" },
  childService: { id_habitacion: 20, tipo_habitacion: "Familiar" },
  precioServicio: 300,
  ...overrides,
});

const run = async () => {
  let passed = 0;
  const test = async (name: string, callback: () => void | Promise<void>) => {
    await callback();
    passed += 1;
    console.log(`✓ ${name}`);
  };

  await test("detecta assigned_parent/child aunque el flag legacy sea falso", () => {
    assertEqual(
      isOperationallyAssignedService({
        isAssigned: false,
        assigned_parent_id: 10,
        assigned_child_id: 20,
      }),
      true,
      "debe detectar la asignación por ids",
    );
    assertEqual(
      isOperationallyAssignedService({
        isAssigned: true,
        assignedParentId: null,
        assignedChildId: null,
      }),
      false,
      "el flag comercial aislado no debe bloquear el servicio",
    );
  });

  await test("el recálculo de pasajeros no modifica un servicio ya asignado", () => {
    const current = assignedHotel();
    const repriced = { ...current, precioServicio: 999, precioTotal: 999 };
    const [result] = preserveOperationallyAssignedServices([current], [repriced]);
    assert(result === current, "debe conservar exactamente el snapshot existente");
    assertEqual(result.precioServicio, 270, "debe conservar el precio cotizado");
  });

  await test("HPM no cambia una habitación ya asignada aunque cambie la tarifa", () => {
    const current = assignedHotel();
    const [result] = reconcileHotelServiceRows([current], [generatedHotel()]);
    assert(result === current, "debe conservar la misma fila asignada");
    assertEqual(result.id, 501, "debe conservar el id");
    assertEqual(result.precioServicio, 270, "debe conservar el precio original");
    assertEqual(result.assignedPrecioServicio, 240, "debe conservar assigned_precio");
  });

  await test("una habitación no asignada sí se actualiza conservando identidad", () => {
    const current = assignedHotel({
      isAssigned: false,
      assignedParentId: null,
      assignedChildId: null,
      assignedPrecioServicio: null,
    });
    const [result] = reconcileHotelServiceRows([current], [generatedHotel()]);
    assert(result !== current, "una fila libre puede actualizarse");
    assertEqual(result.id, 501, "debe conservar id estable");
    assertEqual(result.versionUid, current.versionUid, "debe conservar versionUid");
    assertEqual(result.precioServicio, 300, "debe adoptar la nueva tarifa");
  });

  await test("si HPM omite una noche asignada, la fila protegida se conserva", () => {
    const current = assignedHotel();
    const result = reconcileHotelServiceRows([current], []);
    assertEqual(result.length, 1, "debe conservar una fila");
    assert(result[0] === current, "debe conservar el objeto asignado");
  });

  await test("una noche nueva se agrega sin tocar la habitación asignada", () => {
    const current = assignedHotel();
    const added = generatedHotel({
      id: "auto-hotel-3-triple-r1-n2",
      childService: { id_habitacion: 21, tipo_habitacion: "Triple" },
      precioServicio: 180,
    });
    const result = reconcileHotelServiceRows(
      [current],
      [generatedHotel({ precioServicio: 320 }), added],
    );
    assert(result[0] === current, "la primera fila asignada debe permanecer intacta");
    assertEqual(result[1].id, added.id, "la nueva fila debe agregarse");
    assertEqual(result[1].precioServicio, 180, "la nueva fila usa su nueva tarifa");
  });

  await test("un servicio asignado del itinerario externo conserva su snapshot", () => {
    const assignedExternal = {
      id: 910,
      versionUid: "4fa3371f-bbd9-462e-b0f5-501501501999",
      typeService: "endoses",
      parentService: { id_endose: 31, nombre: "PERU ROUTES" },
      childService: { id_tipotour: 77, tipo_guiado: "FULL DAY PARACAS" },
      precioServicio: 46.67,
      precioTotal: 186.68,
      isAssigned: true,
      assignedParentId: 31,
      assignedChildId: 77,
      assignedPrecioServicio: 42,
    };
    const [result] = preserveOperationallyAssignedServices(
      [assignedExternal],
      [{ ...assignedExternal, precioServicio: 90, precioTotal: 360 }],
    );
    assert(result === assignedExternal, "debe conservar el servicio externo asignado");
    assertEqual(result.precioServicio, 46.67, "conserva precio externo");
    assertEqual(result.assignedPrecioServicio, 42, "conserva assigned externo");
  });

  console.log(`\n${passed} pruebas de protección de asignaciones superadas.`);
};

void run();
