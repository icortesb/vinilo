import { test } from "node:test";
import assert from "node:assert/strict";
import { run } from "../src/main.mjs";

const NOW = Date.parse("2026-09-09T12:00:00Z");

const inputs = {
  clientId: "id", clientSecret: "secret", refreshToken: "refresh",
  count: "5", theme: "both", lang: "en",
  outputDir: ".vinilo", filename: "vinilo", publishTo: "",
};

const tracks = (n) =>
  Array.from({ length: n }, (_, i) => ({
    name: `Track ${i}`, artist: "TWICE", artUrl: "a.jpg",
    playedAt: new Date(NOW - (i + 1) * 3600_000).toISOString(),
  }));

// Deps de un camino feliz; cada test pisa lo que necesita.
const happy = (over = {}) => ({
  recentlyPlayed: async () => tracks(5),
  attachArt: async (ts) => ts.map((t) => ({ ...t, art: "data:image/jpeg;base64,AA" })),
  publish: async () => ({ committed: true }),
  writeFile: async () => {},
  mkdir: async () => {},
  now: NOW,
  ...over,
});

test("camino feliz: publica y reporta los tracks", async () => {
  const r = await run({ inputs, deps: happy() });
  assert.equal(r.outcome, "published");
  assert.equal(r.trackCount, 5);
});

test("theme both produce dos archivos, uno de ellos -dark", async () => {
  const r = await run({ inputs, deps: happy() });
  assert.equal(r.paths.length, 2);
  assert.ok(r.paths.some((p) => p.endsWith("vinilo-dark.svg")));
  assert.ok(r.paths.some((p) => p.endsWith("vinilo.svg")));
});

test("un tema solo produce un archivo sin sufijo", async () => {
  for (const theme of ["dark", "light"]) {
    const r = await run({ inputs: { ...inputs, theme }, deps: happy() });
    assert.equal(r.paths.length, 1, theme);
    assert.ok(r.paths[0].endsWith("vinilo.svg"), theme);
  }
});

test("filename cambia el nombre base", async () => {
  const r = await run({ inputs: { ...inputs, filename: "musica" }, deps: happy() });
  assert.ok(r.paths.every((p) => p.includes("musica")));
});

test("sin tracks no publica y sale skipped", async () => {
  let published = false;
  const r = await run({
    inputs,
    deps: happy({ recentlyPlayed: async () => [], publish: async () => { published = true; } }),
  });
  assert.equal(r.outcome, "skipped");
  assert.equal(published, false);
});

test("un error transient sale skipped y NO publica", async () => {
  let published = false;
  const r = await run({
    inputs,
    deps: happy({
      recentlyPlayed: async () => { throw Object.assign(new Error("429"), { kind: "transient" }); },
      publish: async () => { published = true; },
    }),
  });
  assert.equal(r.outcome, "skipped");
  assert.equal(published, false);
  assert.equal(r.paths.length, 0);
});

test("un error auth sale failed", async () => {
  const r = await run({
    inputs,
    deps: happy({
      recentlyPlayed: async () => { throw Object.assign(new Error("token revocado"), { kind: "auth" }); },
    }),
  });
  assert.equal(r.outcome, "failed");
  assert.match(r.message, /revocado/);
});

test("sin publish-to escribe archivos pero no commitea", async () => {
  let published = false;
  const written = [];
  const r = await run({
    inputs: { ...inputs, publishTo: "" },
    deps: happy({
      publish: async () => { published = true; },
      writeFile: async (p) => written.push(p),
    }),
  });
  assert.equal(r.outcome, "published");
  assert.equal(published, false);
  assert.equal(written.length, 2);
});

test("con publish-to commitea a esa rama con los mismos archivos", async () => {
  let seen = null;
  await run({
    inputs: { ...inputs, publishTo: "vinilo" },
    deps: happy({ publish: async (args) => { seen = args; } }),
  });
  assert.equal(seen.branch, "vinilo");
  assert.equal(seen.files.length, 2);
  assert.ok(seen.files.every((f) => f.content.startsWith("<svg")));
});

test("una tapa caída no impide publicar", async () => {
  const r = await run({
    inputs,
    deps: happy({ attachArt: async (ts) => ts.map((t) => ({ ...t, art: null })) }),
  });
  assert.equal(r.outcome, "published");
});

test("el lang llega hasta el SVG", async () => {
  let seen = null;
  await run({
    inputs: { ...inputs, lang: "es", publishTo: "v" },
    deps: happy({ publish: async (a) => { seen = a; } }),
  });
  assert.match(seen.files[0].content, /hace \d+ hora/);
});
