# Venso Tours Frontend

Clon funcional del frontend de Magic, migrado a **Vite + React 18 + TypeScript** y reorientado a la identidad de **Venso Tours**.

## Estado de la migración

- 178 archivos `.ts`.
- 251 archivos `.tsx`.
- 0 archivos `.js` o `.jsx` dentro de `src`.
- Service worker mantenido desde una fuente TypeScript en `src/workers/service-worker.ts` y generado automáticamente antes de ejecutar Vite.
- 11 recursos oficiales de marca en WebP, con variantes blancas, magenta, gris y color.
- Se conservaron todos los módulos operativos: autenticación, administración, ventas, cotizaciones, PDF/JPG, reservas, vouchers, contabilidad, patrimonio, notificaciones y reportes.
- Se incorporaron todos los arreglos incrementales realizados sobre cotizaciones antes de la clonación.

La migración masiva utiliza `noCheck: true` en `tsconfig.json` para conservar equivalencia funcional durante el primer ciclo de adopción. Esto significa que **todo el código fuente ya es TypeScript/TSX y se valida sintácticamente**, mientras el tipado semántico estricto se puede incorporar por módulos usando `tsconfig.strict.json`. Los contratos compartidos nuevos se encuentran en `src/types`.

## Requisitos

- Node.js 20 o superior.
- npm 10 o superior.
- Backend Venso Tours disponible en `http://localhost:8080` durante desarrollo.

## Inicio rápido

```bash
cp .env.example .env
npm ci
npm run dev
```

Vite inicia en `http://localhost:3000` y redirige `/api` y `/health` al backend local.

## Comandos

```bash
npm run dev              # compila el service worker y abre Vite
npm run typecheck        # validación TypeScript de compatibilidad
npm run typecheck:strict # contratos tipados nuevos en modo estricto
npm run build            # typecheck + build de producción
npm run preview          # previsualiza build/
npm run build:sw         # regenera public/service-worker.js desde TypeScript
```

## Variables principales

```env
VITE_API_URL=/api
VITE_API_TIMEOUT=30000
VITE_TURISMO_CACHE_TTL_MS=300000
VITE_EXCHANGE_RATE=3
VITE_APP_NAME=Venso Tours
VITE_APP_PLATFORM=venso
VITE_BRAND_WEBSITE=https://vensotours.com
```

## Identidad visual

La guía original está en `docs/branding.pdf`. La implementación usa:

- Magenta: `#ff007e`.
- Gris: `#7c7b7a`.
- Negro: `#000000`.
- Blanco: `#ffffff`.
- Tipografía de interfaz: Poppins, cargada mediante CSS web con alternativas del sistema.
- Tipografía de títulos: Antonia H2 cuando esté instalada; de lo contrario Noto Serif/Georgia.
- El logotipo oficial se sirve como WebP, por lo que no requiere distribuir archivos tipográficos.

Consulta `docs/BRANDING.md` para el inventario de recursos.

## Cotizaciones y documentos

Se mantienen las correcciones acumuladas del proyecto original:

- Un único modelo canónico para los precios de la categoría cotizada.
- Reconstrucción de categorías no cotizadas pero cotizables desde la distribución hotelera.
- Adultos, niños, niños con tarifa adulta y habitaciones múltiples conservan la asignación correcta.
- Consistencia entre `AdditionalCosts`, `HotelPricingPreview`, exportación JPG, PDF, editor PDF y resumen de ventas.
- Bloqueo inmediato de guardado para evitar cotizaciones duplicadas.
- Refresco del listado después de crear o editar.
- Filtro de categorías del PDF conectado a los chips seleccionados.

## Docker

```bash
docker build -t venso-tours-frontend .
docker run --rm -p 3000:80 venso-tours-frontend
```

En Fly, `nginx.conf` toma el upstream de `API_UPSTREAM`, que se fija en
`https://vensotours-api.fly.dev`; el navegador siempre consume la API bajo
`/api` en el mismo origen. Para un entorno Docker local, se puede sobrescribir
`API_UPSTREAM` con el hostname interno que corresponda.

## Estructura relevante

```text
src/
├── components/
├── pages/
├── services/
├── context/
├── hooks/
├── types/
├── config/brand.ts
├── styles/venso-brand.scss
└── workers/service-worker.ts
public/
├── brand/
├── assets/
└── pdf-static-pages/
```

## Validación realizada

- `npm run typecheck`: correcto.
- `npm run build`: correcto, 2,385 módulos transformados.
- Permanecen avisos de chunks grandes heredados por los módulos de PDF, Excel y el editor integral.
- `npm audit` reportó dependencias transitivas antiguas; no se aplicó `--force` para evitar actualizaciones incompatibles. Revisa `docs/VALIDATION.md`.
