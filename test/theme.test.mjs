import { test } from "node:test";
import assert from "node:assert/strict";
import { THEMES, FONT, resolveThemes } from "../src/render/theme.mjs";

test("las dos paletas tienen las mismas claves", () => {
  assert.deepEqual(
    Object.keys(THEMES.dark).sort(),
    Object.keys(THEMES.light).sort(),
  );
});

test("todas las claves son colores hex", () => {
  for (const palette of Object.values(THEMES)) {
    for (const [key, value] of Object.entries(palette)) {
      assert.match(value, /^#[0-9a-f]{6}$/, `${key} = ${value}`);
    }
  }
});

test("both devuelve claro y oscuro, con el claro primero", () => {
  assert.deepEqual(resolveThemes("both").map((t) => t.name), ["light", "dark"]);
});

test("un tema solo devuelve uno", () => {
  const out = resolveThemes("dark");
  assert.equal(out.length, 1);
  assert.equal(out[0].palette, THEMES.dark);
});

test("un tema desconocido cae a both", () => {
  assert.equal(resolveThemes("chartreuse").length, 2);
  assert.equal(resolveThemes("").length, 2);
  assert.equal(resolveThemes(undefined).length, 2);
});

test("el stack de fuentes es solo del sistema", () => {
  assert.ok(!/url\(|@font-face|https?:/.test(FONT));
});

test("el stack de fuentes no lleva comillas dobles", () => {
  // Se inyecta en un atributo XML con comillas dobles; unas dobles acá
  // cerrarían el atributo y romperían el SVG entero.
  assert.ok(!FONT.includes('"'), FONT);
});
