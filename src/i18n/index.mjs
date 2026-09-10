// Los tiempos relativos no se traducen a mano: Intl.RelativeTimeFormat viene
// en Node y cubre prácticamente todos los locales. Los archivos de acá abajo
// solo llevan los strings estáticos, que son dos. Sumar un idioma es copiar
// en.json, traducir dos líneas y abrir un PR.
import en from "./en.json" with { type: "json" };
import es from "./es.json" with { type: "json" };

const LOCALES = { en, es };
const FALLBACK = "en";

const SECOND = 1;
const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 2629800;
const YEAR = 12 * MONTH;

const SCALES = [
  [YEAR, "year"],
  [MONTH, "month"],
  [WEEK, "week"],
  [DAY, "day"],
  [HOUR, "hour"],
  [MINUTE, "minute"],
  [SECOND, "second"],
];

// Un locale puede venir como "es-AR": si no tenemos strings para la variante,
// probamos con el idioma base antes de rendirnos.
function pickStrings(lang) {
  if (LOCALES[lang]) return { lang, strings: LOCALES[lang] };
  const base = String(lang ?? "").split("-")[0];
  if (LOCALES[base]) return { lang: base, strings: LOCALES[base] };
  return { lang: FALLBACK, strings: LOCALES[FALLBACK] };
}

export function loadLocale(lang) {
  const { lang: resolved, strings } = pickStrings(lang);

  // El formateo de tiempos usa el locale PEDIDO, no el resuelto: para "fr" no
  // tenemos strings, pero Intl sí sabe formatear en francés, y media card en
  // francés es mejor que ninguna.
  let rtf;
  try {
    rtf = new Intl.RelativeTimeFormat(lang || resolved, { numeric: "auto" });
  } catch {
    rtf = new Intl.RelativeTimeFormat(resolved, { numeric: "auto" });
  }

  return {
    lang: resolved,
    strings,
    relativeTime(isoDate, now = Date.now()) {
      const elapsed = Math.max(0, (now - new Date(isoDate).getTime()) / 1000);
      for (const [size, unit] of SCALES) {
        if (elapsed >= size) return rtf.format(-Math.floor(elapsed / size), unit);
      }
      return rtf.format(0, "second");
    },
  };
}

export const AVAILABLE = Object.keys(LOCALES);
