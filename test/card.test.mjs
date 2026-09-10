import { test } from "node:test";
import assert from "node:assert/strict";
import { renderCard } from "../src/render/card.mjs";
import { THEMES } from "../src/render/theme.mjs";
import { loadLocale } from "../src/i18n/index.mjs";
import { esc } from "../src/render/measure.mjs";

const NOW = Date.parse("2026-09-09T12:00:00Z");
const opts = () => ({ palette: THEMES.dark, locale: loadLocale("en"), now: NOW });

const NAMES = ["MOONLIGHT SUNRISE", "Brave", "Feel Special", "CRY FOR ME", "The Feels"];
const fixture = (n) =>
  Array.from({ length: n }, (_, i) => ({
    name: NAMES[i % NAMES.length],
    artist: "TWICE",
    art: `data:image/jpeg;base64,${Buffer.from(`img${i}`).toString("base64")}`,
    playedAt: new Date(NOW - (i + 1) * 3600_000).toISOString(),
  }));

const textTags = (svg) => svg.match(/<text[^>]*>/g) ?? [];

test("es un SVG de 400 de ancho", () => {
  assert.match(renderCard(fixture(5), opts()), /^<svg [^>]*width="400"/m);
});

test("el alto crece con la cantidad de tracks", () => {
  const h = (n) => Number(renderCard(fixture(n), opts()).match(/height="([\d.]+)"/)[1]);
  assert.ok(h(5) > h(2));
  assert.ok(h(2) > h(1));
});

test("aparecen todos los nombres de track", () => {
  const svg = renderCard(fixture(5), opts());
  for (const t of fixture(5)) assert.ok(svg.includes(esc(t.name)), t.name);
});

test("cada tapa entra como una imagen", () => {
  const svg = renderCard(fixture(5), opts());
  assert.equal((svg.match(/<image /g) ?? []).length, 5);
});

test("un track sin tapa usa placeholder y no rompe", () => {
  const tracks = fixture(5);
  tracks[0].art = null;
  const svg = renderCard(tracks, opts());
  assert.equal((svg.match(/<image /g) ?? []).length, 4);
  assert.ok(svg.includes("<circle"));
});

test("un solo track no dibuja divisor ni filas compactas", () => {
  const svg = renderCard(fixture(1), opts());
  assert.ok(!svg.includes(THEMES.dark.divider));
});

test("TODO texto está dentro de un clipPath", () => {
  const tags = textTags(renderCard(fixture(5), opts()));
  assert.ok(tags.length > 0);
  for (const tag of tags) assert.match(tag, /clip-path="url\(#/);
});

test("cada clipPath referenciado existe en defs", () => {
  const svg = renderCard(fixture(5), opts());
  const used = [...svg.matchAll(/clip-path="url\(#([^)]+)\)"/g)].map((m) => m[1]);
  assert.ok(used.length > 0);
  for (const id of used) assert.ok(svg.includes(`<clipPath id="${id}">`), id);
});

test("los ids de clipPath son únicos", () => {
  const svg = renderCard(fixture(5), opts());
  const ids = [...svg.matchAll(/<clipPath id="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length);
});

test("los caracteres XML del nombre se escapan", () => {
  const tracks = fixture(1);
  tracks[0].name = 'A & B <c> "d"';
  const svg = renderCard(tracks, opts());
  assert.ok(!svg.includes("<c>"));
  assert.ok(svg.includes("&amp;"));
});

test("un título de 80 caracteres se trunca", () => {
  const tracks = fixture(1);
  tracks[0].name = "x".repeat(80);
  assert.ok(renderCard(tracks, opts()).includes("…"));
});

test("CJK y emoji no rompen el render", () => {
  const tracks = fixture(2);
  tracks[0].name = "時間前の音楽をもっと聴きたい";
  tracks[1].name = "party \u{1F3B5}\u{1F389}";
  assert.doesNotThrow(() => renderCard(tracks, opts()));
});

test("funciona con las dos paletas", () => {
  for (const palette of Object.values(THEMES)) {
    const svg = renderCard(fixture(5), { ...opts(), palette });
    assert.ok(svg.includes(palette.bg));
  }
});

test("respeta el locale para los tiempos", () => {
  const svg = renderCard(fixture(2), { ...opts(), locale: loadLocale("es") });
  assert.match(svg, /hace \d+ hora/);
});

test("una lista vacía es un error del programador, no una card vacía", () => {
  assert.throws(() => renderCard([], opts()));
});

test("un track sin playedAt no dibuja tiempo pero renderiza", () => {
  const tracks = fixture(2);
  for (const t of tracks) t.playedAt = null;
  assert.doesNotThrow(() => renderCard(tracks, opts()));
});

// Los tests de arriba hacen match sobre el string. Este comprueba que el
// documento además PARSEA: sin él, un atributo con comillas de más pasa
// desapercibido y el SVG no se ve en ningún lado.
function assertWellFormed(svg) {
  for (const tag of svg.match(/<[^>]*>/g) ?? []) {
    const quotes = (tag.match(/"/g) ?? []).length;
    assert.equal(quotes % 2, 0, `comillas impares en: ${tag.slice(0, 120)}`);
  }
  const opens = (svg.match(/<text[ >]/g) ?? []).length;
  const closes = (svg.match(/<\/text>/g) ?? []).length;
  assert.equal(opens, closes, "tags <text> desbalanceados");
}

test("el SVG es XML bien formado", () => {
  assertWellFormed(renderCard(fixture(5), opts()));
});

test("sigue bien formado con nombres hostiles", () => {
  const tracks = fixture(3);
  tracks[0].name = 'quote " inside';
  tracks[1].name = "<script>alert(1)</script>";
  tracks[2].artist = "A & B";
  assertWellFormed(renderCard(tracks, opts()));
});
