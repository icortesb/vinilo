// Paletas de vinilo. Los dos temas comparten exactamente las mismas claves:
// el render nunca pregunta cuál está activo, solo lee `palette.title`.

export const FONT =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

// Verde de marca de Spotify. Es lo único que no varía entre temas: es una
// marca ajena, no un color nuestro que podamos reinterpretar.
const BRAND = "#1db954";

export const THEMES = {
  dark: {
    bg: "#14141a",
    border: "#26262f",
    title: "#f2f2f5",
    artist: "#9a9aa8",
    meta: "#6b6b7a",
    divider: "#22222b",
    placeholder: "#22222b",
    brand: BRAND,
  },
  light: {
    bg: "#fbfbfc",
    border: "#e6e6ea",
    title: "#17171c",
    artist: "#5c5c68",
    meta: "#8a8a96",
    divider: "#ececf0",
    placeholder: "#eeeef2",
    brand: BRAND,
  },
};

// `light` va primero porque es el que se sirve como <img> en el <picture>:
// es el fallback cuando el navegador no entiende la media query.
const ORDER = ["light", "dark"];

export function resolveThemes(name) {
  const one = ORDER.includes(name) ? [name] : null;
  const names = one ?? ORDER;
  return names.map((n) => ({ name: n, palette: THEMES[n] }));
}
