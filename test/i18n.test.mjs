import { test } from "node:test";
import assert from "node:assert/strict";
import { loadLocale, AVAILABLE } from "../src/i18n/index.mjs";

const NOW = Date.parse("2026-09-09T12:00:00Z");

test("en formatea horas", () => {
  assert.equal(loadLocale("en").relativeTime("2026-09-09T10:00:00Z", NOW), "2 hours ago");
});

test("es formatea en español", () => {
  assert.equal(loadLocale("es").relativeTime("2026-09-09T10:00:00Z", NOW), "hace 2 horas");
});

test("elige la escala más grande que aplica", () => {
  const l = loadLocale("en");
  assert.equal(l.relativeTime("2026-09-09T11:59:30Z", NOW), "30 seconds ago");
  assert.equal(l.relativeTime("2026-09-09T11:30:00Z", NOW), "30 minutes ago");
  assert.equal(l.relativeTime("2026-09-07T12:00:00Z", NOW), "2 days ago");
  assert.equal(l.relativeTime("2026-08-09T12:00:00Z", NOW), "last month");
});

test("un locale desconocido cae a en para los strings", () => {
  assert.equal(loadLocale("xx-YY").lang, "en");
  assert.equal(loadLocale(undefined).lang, "en");
});

test("una variante regional usa el idioma base", () => {
  assert.equal(loadLocale("es-AR").lang, "es");
});

test("un locale sin strings igual formatea tiempos en su idioma", () => {
  // No tenemos fr.json, pero Intl sí sabe francés.
  const l = loadLocale("fr");
  assert.equal(l.lang, "en");
  assert.match(l.relativeTime("2026-09-09T10:00:00Z", NOW), /heure/);
});

test("todos los locales tienen exactamente las claves de en", () => {
  const keys = Object.keys(loadLocale("en").strings).sort();
  for (const lang of AVAILABLE) {
    assert.deepEqual(Object.keys(loadLocale(lang).strings).sort(), keys, lang);
  }
});

test("ningún string de locale está vacío", () => {
  for (const lang of AVAILABLE) {
    for (const [key, value] of Object.entries(loadLocale(lang).strings)) {
      assert.ok(value.trim().length > 0, `${lang}.${key}`);
    }
  }
});

test("una fecha futura no produce un tiempo negativo raro", () => {
  const out = loadLocale("en").relativeTime("2026-09-09T13:00:00Z", NOW);
  assert.equal(typeof out, "string");
  assert.ok(!out.includes("-"));
});
