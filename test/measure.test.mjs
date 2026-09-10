import { test } from "node:test";
import assert from "node:assert/strict";
import { estimateWidth, truncate, esc } from "../src/render/measure.mjs";

test("un string vacío mide cero", () => {
  assert.equal(estimateWidth("", 14), 0);
});

test("los caracteres angostos miden menos que los anchos", () => {
  assert.ok(estimateWidth("lll", 14) < estimateWidth("WWW", 14));
});

test("el ancho escala con el tamaño de fuente", () => {
  assert.equal(estimateWidth("abc", 28), estimateWidth("abc", 14) * 2);
});

test("truncate deja intacto lo que entra", () => {
  assert.equal(truncate("FANCY", 14, 400), "FANCY");
});

test("truncate agrega elipsis y respeta el ancho", () => {
  const out = truncate("The Feels (Extended Mix Version)", 14, 80);
  assert.ok(out.endsWith("…"));
  assert.ok(estimateWidth(out, 14) <= 80);
});

test("truncate nunca devuelve vacío", () => {
  assert.ok(truncate("MOONLIGHT SUNRISE", 14, 1).length > 0);
  assert.ok(truncate("x", 14, 0).length > 0);
});

test("truncate no parte emojis al medio", () => {
  const out = truncate("aaa\u{1F3B5}\u{1F3B5}\u{1F3B5}", 14, 40);
  assert.ok(!out.includes("�"));
  for (const ch of out) assert.ok(ch.codePointAt(0) !== 0xd83c);
});

test("CJK cuenta como ancho completo", () => {
  assert.ok(estimateWidth("時間前", 14) > estimateWidth("abc", 14));
});

test("esc escapa los cinco caracteres XML", () => {
  assert.equal(
    esc(`<a href="x">&'`),
    "&lt;a href=&quot;x&quot;&gt;&amp;&apos;",
  );
});

test("esc deja pasar el texto normal", () => {
  assert.equal(esc("MOONLIGHT SUNRISE"), "MOONLIGHT SUNRISE");
});
