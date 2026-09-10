// El SVG se renderiza en la máquina del lector, con SU fuente de sistema: al
// generarlo no sabemos si va a caer Segoe UI, Roboto o Helvetica, y las
// métricas difieren. Cualquier medición acá es aproximada por definición, y
// no hay tabla que arregle eso.
//
// Por eso el truncado es cosmético y la garantía está en otro lado: cada
// bloque de texto va dentro de un clipPath (ver card.mjs). Si esta estimación
// se queda corta, el texto se corta limpio en el borde en vez de desbordar
// sobre el timestamp.

const NARROW = "iljtfrI.,:;'|!()[]{} ";
const WIDE = "MWmw@%";

// Rangos donde un glifo ocupa una celda completa: CJK, kana, hangul y las
// formas full-width. Un título en japonés medido con la tabla latina entraría
// casi al doble de lo que realmente ocupa.
function isFullWidth(code) {
  return (
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe30 && code <= 0xfe6f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6) ||
    (code >= 0x1f300 && code <= 0x1faff)
  );
}

export function estimateWidth(text, size) {
  let units = 0;
  for (const ch of String(text)) {
    const code = ch.codePointAt(0);
    if (isFullWidth(code)) units += 1.0;
    else if (NARROW.includes(ch)) units += 0.31;
    else if (WIDE.includes(ch)) units += 0.87;
    else if (ch >= "A" && ch <= "Z") units += 0.68;
    else if (ch >= "0" && ch <= "9") units += 0.56;
    else units += 0.53;
  }
  return units * size;
}

export function truncate(text, size, maxWidth) {
  const full = String(text);
  if (estimateWidth(full, size) <= maxWidth) return full;

  // Se recorta por puntos de código, no por unidades UTF-16: cortar a la
  // mitad un emoji o un par suplente produce un carácter roto.
  const chars = [...full];
  while (chars.length > 1) {
    chars.pop();
    const candidate = chars.join("").trimEnd();
    if (estimateWidth(candidate + "…", size) <= maxWidth) {
      return candidate + "…";
    }
  }
  // Ni un carácter entra. Devolvemos el primero igual: el clipPath se encarga,
  // y un string vacío perdería la fila entera.
  return chars.join("") || full.slice(0, 1);
}

export function esc(text) {
  return String(text).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c],
  );
}
