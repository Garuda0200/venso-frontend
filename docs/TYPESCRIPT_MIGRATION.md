# Migración JavaScript → TypeScript

## Alcance ejecutado

Todo el árbol `src` fue convertido:

- `.jsx` → `.tsx`.
- `.js` → `.ts`.
- `vite.config.js` → `vite.config.ts`.
- Alias, extensiones y entrada HTML actualizados.
- Declaraciones para SCSS, CSS e imágenes añadidas.
- Variables Vite tipadas en `src/vite-env.d.ts`.
- Contratos iniciales en `src/types/domain.ts`.
- Service worker con fuente canónica TypeScript.

## Dos niveles de validación

### Compatibilidad funcional

`tsconfig.json` habilita `noCheck`. Se utiliza para compilar la aplicación completa sin alterar la semántica dinámica heredada del sistema. Vite sigue transformando exclusivamente archivos TypeScript/TSX.

### Tipado estricto progresivo

`tsconfig.strict.json` activa `strict`, `noImplicitAny`, `noUncheckedIndexedAccess` y `exactOptionalPropertyTypes` sobre los nuevos contratos. Amplía su `include` a medida que cada módulo sea tipado de forma completa.

## Ruta recomendada

1. Tipar contextos globales (`AuthContext`, `NotificationContext`, `SidebarContext`).
2. Tipar respuestas API compartidas.
3. Tipar el dominio de cotizaciones y hoteles.
4. Tipar formularios de contabilidad.
5. Ampliar gradualmente `tsconfig.strict.json`.
6. Al llegar a cobertura total, retirar `noCheck` del `tsconfig.json` principal.

La aplicación ya no contiene archivos JavaScript fuente. `public/service-worker.js` se genera automáticamente desde `src/workers/service-worker.ts` antes de `dev` y `build`, y no se versiona.
