# Implementación de marca Venso Tours

## Fuente

La referencia entregada se conserva como `branding.pdf`. El documento define el logotipo Venso Tours, el slogan **“Enamórate a cada paso”**, las variantes secundarias, la paleta RGB y las tipografías AntoniaH2-Bold, Poppins y The Signature.

## Tokens

| Token | Valor | Uso |
|---|---|---|
| `--venso-magenta` | `#ff007e` | Acciones principales, navegación activa, cabeceras y marca |
| `--venso-gray` | `#7c7b7a` | Texto secundario, divisores y soporte visual |
| `--venso-black` | `#000000` | Fondos oscuros, encabezados y contraste |
| `--venso-white` | `#ffffff` | Superficies, textos sobre magenta/negro y logos invertidos |

Los tokens se centralizan en `src/styles/venso-brand.scss` y la configuración programática en `src/config/brand.ts`.

## Recursos WebP

Todos se encuentran en `public/brand`:

- `logo-principal-color.webp`
- `logo-principal-blanco.webp`
- `logo-principal-magenta.webp`
- `isotipo-color.webp`
- `isotipo-blanco.webp`
- `isotipo-magenta.webp`
- `wordmark-color.webp`
- `wordmark-blanco.webp`
- `wordmark-gris.webp`
- `slogan-color.webp`
- `slogan-blanco.webp`

También se actualizaron los recursos heredados usados por componentes antiguos, para que las rutas previas continúen funcionando sin mostrar Magic.

## PDF y JPG

Las páginas estáticas de precios, equipo, responsabilidad social, términos y condiciones y plantillas vacías fueron adaptadas a magenta, negro y blanco. Las cabeceras y pies de PDF usan el wordmark y el slogan de Venso Tours.

## Tipografía

No se incluyen archivos de fuentes dentro del repositorio. Poppins se solicita mediante Google Fonts y dispone de alternativas del sistema. Antonia H2 se declara como preferencia para títulos, mientras el logotipo oficial permanece rasterizado en WebP para conservar su apariencia exacta.
