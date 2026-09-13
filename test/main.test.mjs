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
  nowPlaying: async () => null,
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

test("importar el módulo no ejecuta la Action, ni dentro de Actions", async () => {
  // El guard viejo era `if (process.env.GITHUB_ACTIONS)`, que está puesto
  // cuando los tests corren en CI: importar main.mjs disparaba la Action y
  // explotaba pidiendo inputs. El entrypoint vive en index.mjs justamente
  // para que este import no haga nada.
  const before = process.env.GITHUB_ACTIONS;
  process.env.GITHUB_ACTIONS = "true";
  try {
    const mod = await import(`../src/main.mjs?guard=${Date.now()}`);
    assert.equal(typeof mod.run, "function");
    assert.equal(typeof mod.main, "function");
  } finally {
    if (before === undefined) delete process.env.GITHUB_ACTIONS;
    else process.env.GITHUB_ACTIONS = before;
  }
});

// ── now playing ─────────────────────────────────────────────────────────────

const playing = {
  name: "Strategy", artist: "TWICE", album: "Strategy",
  artUrl: "now.jpg", playedAt: null,
};

const heroOf = (seen) => seen.files[0].content;

test("lo que suena ahora manda: es el hero y lleva la etiqueta", async () => {
  let seen = null;
  const r = await run({
    inputs: { ...inputs, publishTo: "v" },
    deps: happy({ nowPlaying: async () => playing, publish: async (a) => { seen = a; } }),
  });
  assert.equal(r.outcome, "published");
  assert.match(heroOf(seen), /NOW PLAYING/);
  assert.ok(heroOf(seen).includes("Strategy"));
});

test("el hero que suena no agranda la card: sale el track más viejo", async () => {
  let seen = null;
  await run({
    inputs: { ...inputs, publishTo: "v" },
    deps: happy({ nowPlaying: async () => playing, publish: async (a) => { seen = a; } }),
  });
  assert.ok(!heroOf(seen).includes("Track 4"));
  assert.ok(heroOf(seen).includes("Track 0"));
});

test("el track que suena no se repite abajo si ya está en el historial", async () => {
  let seen = null;
  const historial = [{ ...playing, playedAt: new Date(NOW - 60_000).toISOString() }, ...tracks(4)];
  await run({
    inputs: { ...inputs, publishTo: "v" },
    deps: happy({
      recentlyPlayed: async () => historial,
      nowPlaying: async () => playing,
      publish: async (a) => { seen = a; },
    }),
  });
  assert.equal(heroOf(seen).match(/Strategy/g).length, 2); // título + álbum, una sola vez
});

test("sin nada sonando la card es la de siempre", async () => {
  let seen = null;
  await run({
    inputs: { ...inputs, publishTo: "v" },
    deps: happy({ nowPlaying: async () => null, publish: async (a) => { seen = a; } }),
  });
  assert.match(heroOf(seen), /RECENTLY PLAYED/);
  assert.ok(heroOf(seen).includes("Track 4"));
});

test("si el reproductor falla la card se publica igual", async () => {
  const r = await run({
    inputs,
    deps: happy({
      nowPlaying: async () => { throw Object.assign(new Error("503"), { kind: "transient" }); },
    }),
  });
  assert.equal(r.outcome, "published");
  assert.equal(r.trackCount, 5);
});

test("un 403 del reproductor no hace fallar la Action, pero avisa del scope", async () => {
  const r = await run({
    inputs,
    deps: happy({
      nowPlaying: async () => { throw Object.assign(new Error("el reproductor falló con 403"), { kind: "auth" }); },
    }),
  });
  assert.equal(r.outcome, "published");
  // Un info se pierde en el log; tiene que salir como warning amarillo.
  assert.match(r.warning, /user-read-currently-playing/);
});

test("sin problemas con el reproductor no hay warning", async () => {
  const r = await run({ inputs, deps: happy() });
  assert.equal(r.warning, undefined);
});

test("con algo sonando y sin historial hay card igual", async () => {
  const r = await run({
    inputs,
    deps: happy({ recentlyPlayed: async () => [], nowPlaying: async () => playing }),
  });
  assert.equal(r.outcome, "published");
  assert.equal(r.trackCount, 1);
});

test("un historial caído no publica una card de un solo track", async () => {
  // Reemplazar una card buena de 5 por una de 1 sería un downgrade causado por
  // una falla transitoria: exactamente lo que la card anterior evita.
  let published = false;
  const r = await run({
    inputs,
    deps: happy({
      recentlyPlayed: async () => { throw Object.assign(new Error("429"), { kind: "transient" }); },
      nowPlaying: async () => playing,
      publish: async () => { published = true; },
    }),
  });
  assert.equal(r.outcome, "skipped");
  assert.equal(published, false);
});
