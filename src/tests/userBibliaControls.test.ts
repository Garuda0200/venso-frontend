import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { createRoot } from "react-dom/client";
import { parseHTML } from "linkedom";
import { build } from "esbuild";
import { createRequire } from "node:module";
import path from "node:path";

(async () => {
  const entries = [
    "src/pages/Admin/Users/components/UserFormModal.tsx",
    "src/pages/Reservas/Calendario/components/BibliaRowSave.tsx",
    "src/pages/Reservas/Calendario/components/BibliaQuotationSyncPrompt.tsx",
    "src/pages/Reservas/Calendario/components/ParticipantPlanEditor.tsx",
  ];
  const components: any[] = [];
  for (const entry of entries) {
    const bundle = await build({ entryPoints: [entry], bundle: true, write: false, format: "cjs", platform: "node", jsx: "automatic",
      loader: { ".scss": "empty", ".css": "empty" }, define: { "import.meta.env": "{}" }, external: ["react", "react-dom", "react/jsx-runtime", "react-icons/*"] });
    const module = { exports: {} };
    new Function("require", "module", "exports", bundle.outputFiles[0].text)(createRequire(path.resolve("package.json")), module, module.exports);
    components.push((module.exports as any).default);
  }
  const [UserForm, RowSave, SyncPrompt, Participants] = components;
  const seedUser = (extra = {}) => ({ email: "ui-flow@example.test", nombre: "Prueba", apellidopaterno: "Usuario", password: "", confirmPassword: "", role: 2, platform: "venso", business_type: "B2C", is_active: true, permissions: { allowed_modules: [], allowed_routes: [], actions: [] }, ...extra });
  const deferred = () => { let resolve: any, reject: any; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
  const props = element => element[Object.keys(element).find(key => key.startsWith("__reactProps$"))];
  async function mounted(Component, initial, run) {
    const { window, document } = parseHTML('<html><body><div id="root"></div></body></html>');
    const names = ["window", "document", "HTMLElement", "CustomEvent", "IS_REACT_ACT_ENVIRONMENT"];
    const previous = Object.fromEntries(names.map(name => [name, globalThis[name]]));
    Object.assign(globalThis, { window, document, HTMLElement: window.HTMLElement, CustomEvent: window.CustomEvent, IS_REACT_ACT_ENVIRONMENT: true });
    const root = createRoot(document.getElementById("root"));
    const render = async changes => React.act(async () => root.render(React.createElement(Component, { ...initial, ...changes })));
    const click = async label => React.act(async () => [...document.querySelectorAll("button")].find(b => b.textContent.trim() === label || b.getAttribute("aria-label") === label).click());
    const submit = () => document.querySelector("form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
    const change = async (id, value) => React.act(async () => props(document.getElementById(id)).onChange({ target: { value } }));
    try { await render({}); await run({ document, render, click, submit, change }); }
    finally { await React.act(async () => root.unmount()); for (const [name, value] of Object.entries(previous)) { if (value === undefined) delete globalThis[name]; else globalThis[name] = value; } }
  }
  async function fillPasswords(change) {
    await change("ufm-password", "VensoUI-2026!");
    await change("ufm-password-confirm", "VensoUI-2026!");
  }

  test("usuarios: no se envía un rol vacío ni fuera del catálogo", async () => {
    for (const role of ["", 6, -1]) {
      const saved = [];
      await mounted(UserForm, { visible: true, user: seedUser({ role }), editMode: false, onHide: () => {}, onSave: row => saved.push(row) }, async ({ document, submit, change }) => {
        await fillPasswords(change);
        await React.act(async () => submit());
        assert.equal(saved.length, 0, `rol inválido: ${role}`);
        assert.match(document.body.textContent, /Requerido|Selecciona.*rol|Rol inválido/);
      });
    }
  });

  test("usuarios: los seis roles se envían como números con permisos adicionales intactos", async () => {
    for (const role of [0, 1, 2, 3, 4, 5]) {
      const saved = [];
      const permissions = { allowed_routes: ["/reservas/calendario"], actions: ["cotizaciones.view_all"] };
      await mounted(UserForm, { visible: true, user: seedUser({ role, permissions }), editMode: false, onHide: () => {}, onSave: row => saved.push(row) }, async ({ submit, change }) => {
        await fillPasswords(change);
        await React.act(async () => submit());
        assert.equal(saved.length, 1); assert.equal(saved[0].role, role);
        assert.deepEqual(saved[0].permissions, permissions);
      });
    }
  });

  test("usuarios: editar no exige contraseña y conserva permisos y estado", async () => {
    const saved = [];
    await mounted(UserForm, { visible: true, user: seedUser({ dniuser: "synthetic", role: 3 }), editMode: true, onHide: () => {}, onSave: row => saved.push(row) }, async ({ change, submit, document, click }) => {
      assert.equal(document.getElementById("ufm-password"), null);
      await change("ufm-name", "Nombre actualizado");
      await click("Activa");
      await React.act(async () => submit());
      assert.equal(saved[0].nombre, "Nombre actualizado"); assert.equal(saved[0].is_active, false); assert.equal(saved[0].role, 3);
    });
  });

  test("usuarios: dos submit durante el mismo guardado producen una sola escritura", async () => {
    const request = deferred(); const saved = [];
    await mounted(UserForm, { visible: true, user: seedUser(), editMode: false, onHide: () => {}, onSave: row => { saved.push(row); return request.promise; } }, async ({ submit, change, document }) => {
      await fillPasswords(change);
      await React.act(async () => { submit(); submit(); });
      assert.equal(saved.length, 1);
      assert.equal(document.querySelector('button[type="submit"]').disabled, true);
      await React.act(async () => request.resolve());
      assert.equal(document.querySelector('button[type="submit"]').disabled, false);
    });
  });

  test("usuarios: un error de guardado conserva el formulario y permite reintento", async () => {
    let calls = 0;
    await mounted(UserForm, { visible: true, user: seedUser(), editMode: true, onHide: () => {}, onSave: async () => { if (++calls === 1) throw new Error("Conflicto de prueba"); } }, async ({ submit, document, change }) => {
      await change("ufm-name", "Nombre conservado");
      await React.act(async () => submit());
      assert.match(document.querySelector('[role="alert"]').textContent, /Conflicto de prueba/);
      assert.equal(document.getElementById("ufm-name").value, "Nombre conservado");
      await React.act(async () => submit()); assert.equal(calls, 2);
    });
  });

  test("Biblia: guardar fila distingue borrador, ocupado, error y confirmación", async () => {
    let saves = 0;
    const draft = { values: { restaurant: "Restaurante QA" }, savedVersion: 0, saved: false, error: "" };
    await mounted(RowSave, { draft, busy: false, disabled: false, file: "QA-FILE", onSave: () => saves++ }, async ({ document, click, render }) => {
      assert.match(document.body.textContent, /1 cambio sin guardar/);
      await click("Guardar registro QA-FILE"); assert.equal(saves, 1);
      await render({ busy: true }); assert.equal(document.querySelector("button").disabled, true);
      await render({ busy: false, draft: { ...draft, error: "No se pudo guardar" } });
      assert.match(document.querySelector('[role="alert"]').textContent, /No se pudo guardar/);
      await render({ draft: { ...draft, values: {}, saved: true } });
      assert.match(document.body.textContent, /Guardado/); assert.equal(document.querySelector("button").disabled, true);
    });
  });

  test("Biblia: sincronizar requiere guardar la fila y confirmación explícita", async () => {
    let writes = 0;
    const activity = { sourceQuotationId: "QA-QUOTE", overrideRecord: { quotationSyncPending: true, quotationSyncFields: ["restaurant"] } };
    await mounted(SyncPrompt, { activity, busy: false, hasUnsavedChanges: true, onConfirm: () => writes++ }, async ({ document, render, click }) => {
      assert.equal(writes, 0);
      assert.match(document.body.textContent, /Guarda el registro/);
      assert.equal([...document.querySelectorAll("button")].find(b => b.textContent.includes("Actualizar cotización")).disabled, true);
      await render({ hasUnsavedChanges: false });
      await click("Luego"); assert.equal(writes, 0);
      await click("Actualizar cotización"); assert.equal(writes, 1);
      await render({ activity: { ...activity, overrideRecord: { quotationSyncPending: false } } });
      assert.match(document.body.textContent, /Vinculado/);
      assert.equal([...document.querySelectorAll("button")].some(b => b.textContent.includes("Actualizar cotización")), false);
    });
  });

  const plan = { adults: { count: 3, nationalities: [{ country: "Perú", count: 2 }, { country: "Italia", count: 1 }] }, children: { count: 1, nationalities: [{ country: "México", count: 1 }] } };
  const activity = { id: "participant-ui", pax: 4, nationality: "Perú, Italia, México", participantPlan: plan };
  const quotation = { passengers: [{ tipo_pasajero: "adult", nacionalidad: "Perú" }, { tipo_pasajero: "adult", nacionalidad: "Perú" }, { tipo_pasajero: "adult", nacionalidad: "Italia" }, { tipo_pasajero: "child", nacionalidad: "México" }] };
  test("Biblia: un día puede tener menos beneficiarios sin cambiar el padrón del file", async () => {
    const before = JSON.stringify(quotation); const saved = [];
    await mounted(Participants, { activity, quotation, onSave: async value => { saved.push(value); } }, async ({ document, click }) => {
      await click("Editar nacionalidades y beneficiarios del día");
      assert.match(document.body.textContent, /Perú/); assert.match(document.body.textContent, /México/);
      await click("Quitar un adulto"); await click("Guardar participantes");
      assert.equal(saved[0].adults.count, 2); assert.equal(saved[0].children.count, 1);
      assert.equal(JSON.stringify(quotation), before); assert.equal(document.querySelector('[role="dialog"]'), null);
    });
  });

  test("Biblia: fallo de participantes mantiene diálogo y selección, sin guardados duplicados", async () => {
    const request = deferred(); let writes = 0;
    await mounted(Participants, { activity, quotation, onSave: async () => { writes++; return request.promise; } }, async ({ document, click }) => {
      await click("Editar nacionalidades y beneficiarios del día"); await click("Quitar un adulto");
      await click("Guardar participantes");
      assert.equal(writes, 1); assert.ok(document.querySelector('[role="dialog"]'));
      await React.act(async () => request.reject(new Error("Rechazo sintético")));
      assert.match(document.querySelector('[role="alert"]').textContent, /No se pudo guardar la distribución/);
      assert.equal(document.querySelector('[aria-label="Cantidad de adultos"]').textContent, "2");
    });
  });
})().catch(error => { console.error(error); process.exitCode = 1; });
