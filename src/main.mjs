import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import core from "./actions.mjs";
import { recentlyPlayed as fetchRecent, nowPlaying as fetchNowPlaying } from "./spotify.mjs";
import { attachArt as fetchArt } from "./art.mjs";
import { publish as publishToBranch } from "./publish.mjs";
import { renderCard } from "./render/card.mjs";
import { resolveThemes } from "./render/theme.mjs";
import { loadLocale } from "./i18n/index.mjs";

// `run` no toca @actions/core: devuelve un resultado y quien llama decide qué
// hacer con él. Así el ruteo de errores —la parte que de verdad importa— se
// testea sin mockear el runner de GitHub.

// El historial y el reproductor pueden traer el mismo tema: si lo que suena
// ahora ya entró al historial (porque lo escuchaste antes en la misma tanda),
// mostrarlo dos veces es un error visible.
function sameTrack(a, b) {
  return a.name === b.name && a.artist === b.artist;
}

// El reproductor es opcional: la card se publica igual sin él. Pero un 403 es
// casi siempre un scope que falta, y eso hay que decirlo o el usuario se queda
// esperando un "suena ahora" que nunca va a llegar.
function playerNote(err) {
  if (err?.kind === "auth") {
    return "el reproductor respondió sin permiso: falta el scope user-read-currently-playing en el refresh token";
  }
  return `el reproductor no respondió: ${err?.message ?? err}`;
}

function fileNames(themes, base) {
  if (themes.length === 1) return [`${base}.svg`];
  return themes.map((t) => (t.name === "dark" ? `${base}-dark.svg` : `${base}.svg`));
}

export async function run({ inputs, deps = {} }) {
  const {
    clientId, clientSecret, refreshToken,
    count, theme, lang, outputDir, filename, publishTo,
  } = inputs;

  const recentlyPlayed = deps.recentlyPlayed ?? fetchRecent;
  const nowPlaying = deps.nowPlaying ?? fetchNowPlaying;
  const attachArt = deps.attachArt ?? fetchArt;
  const publish = deps.publish ?? publishToBranch;
  const write = deps.writeFile ?? writeFile;
  const ensureDir = deps.mkdir ?? mkdir;
  const now = deps.now ?? Date.now();

  // Las dos llamadas son independientes y ninguna espera a la otra: una sola
  // corrida cada 15 minutos no tiene margen para encadenar viajes de ida y
  // vuelta que pueden ir en paralelo.
  const [recent, player] = await Promise.allSettled([
    recentlyPlayed({ clientId, clientSecret, refreshToken, count }),
    nowPlaying({ clientId, clientSecret, refreshToken }),
  ]);

  if (recent.status === "rejected") {
    // Un problema del usuario tiene que verse; uno del mundo, no. Si Spotify
    // está caído no publicamos nada y la card anterior sigue en pie: una falla
    // transitoria nunca reemplaza una card buena por una rota.
    const err = recent.reason;
    if (err.kind === "auth") {
      return { outcome: "failed", paths: [], trackCount: 0, message: err.message };
    }
    return { outcome: "skipped", paths: [], trackCount: 0, message: err.message };
  }

  const tracks = recent.value;
  const playing = player.status === "fulfilled" ? player.value : null;
  const note = player.status === "rejected" ? playerNote(player.reason) : "";

  if (tracks.length === 0 && !playing) {
    return {
      outcome: "skipped",
      paths: [],
      trackCount: 0,
      message: "Spotify no devolvió reproducciones recientes; no se toca la card anterior",
    };
  }

  // Lo que suena ahora entra como hero y desplaza al track más viejo: la card
  // muestra siempre la misma cantidad de temas, así no cambia de alto cada vez
  // que empezás o dejás de escuchar música.
  const items = playing
    ? [
        { ...playing, isNowPlaying: true },
        ...tracks
          .filter((t) => !sameTrack(t, playing))
          .slice(0, Math.max(0, tracks.length - 1)),
      ]
    : tracks;

  const withArt = await attachArt(items);
  const locale = loadLocale(lang);
  const themes = resolveThemes(theme);
  const names = fileNames(themes, filename);

  const files = themes.map((t, i) => ({
    name: names[i],
    content: renderCard(withArt, { palette: t.palette, locale, now }),
  }));

  await ensureDir(outputDir, { recursive: true });
  const paths = [];
  for (const file of files) {
    const path = join(outputDir, file.name);
    await write(path, file.content);
    paths.push(path);
  }

  if (publishTo) {
    await publish({
      branch: publishTo,
      files,
      message: `Update vinilo card [skip ci]`,
    });
  }

  return {
    outcome: "published",
    paths,
    trackCount: withArt.length,
    message: `${withArt.length} tracks`,
    ...(note && { warning: note }),
  };
}

function readInputs() {
  return {
    clientId: core.getInput("client-id", { required: true }),
    clientSecret: core.getInput("client-secret", { required: true }),
    refreshToken: core.getInput("refresh-token", { required: true }),
    count: core.getInput("count") || "5",
    theme: core.getInput("theme") || "both",
    lang: core.getInput("lang") || "en",
    outputDir: core.getInput("output-dir") || ".vinilo",
    filename: core.getInput("filename") || "vinilo",
    publishTo: core.getInput("publish-to") || "",
  };
}

export async function main() {
  try {
    const result = await run({ inputs: readInputs() });
    core.setOutput("paths", result.paths.join(","));
    core.setOutput("track-count", String(result.trackCount));

    if (result.outcome === "failed") core.setFailed(result.message);
    else if (result.outcome === "skipped") core.warning(result.message);
    else core.info(`vinilo: ${result.message} → ${result.paths.join(", ")}`);
    if (result.warning) core.warning(result.warning);
  } catch (err) {
    core.setFailed(err.stack ?? String(err));
  }
}
