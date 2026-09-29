export const BRAND = {
  name: "Venso Tours",
  platform: "venso",
  slogan: "Enamórate a cada paso",
  website: "https://vensotours.com",
  colors: {
    primary: "#ff007e",
    secondary: "#7c7b7a",
    black: "#000000",
    white: "#ffffff"
  },
  assets: {
    logoColor: "/brand/logo-principal-color.webp",
    logoWhite: "/brand/logo-principal-blanco.webp",
    logoMagenta: "/brand/logo-principal-magenta.webp",
    iconColor: "/brand/isotipo-color.webp",
    iconWhite: "/brand/isotipo-blanco.webp",
    wordmarkColor: "/brand/wordmark-color.webp",
    wordmarkWhite: "/brand/wordmark-blanco.webp",
    sloganColor: "/brand/slogan-color.webp",
    sloganWhite: "/brand/slogan-blanco.webp"
  }
} as const;

export type BrandConfig = typeof BRAND;
