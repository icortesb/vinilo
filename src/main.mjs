import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import core from "./actions.mjs";
import { recentlyPlayed as fetchRecent } from "./spotify.mjs";
import { attachArt as fetchArt } from "./art.mjs";
import { publish as publishToBranch } from "./publish.mjs";
import { renderCard } from "./render/card.mjs";
import { resolveThemes } from "./render/theme.mjs";
import { loadLocale } from "./i18n/index.mjs";

// `run` no toca @actions/core: devuelve un resultado y quien llama decide qué
// hacer con él. Así el ruteo de errores —la parte que de verdad importa— se
// testea sin mockear el runner de GitHub.

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
  const attachArt = deps.attachArt ?? fetchArt;
  const publish = deps.publish ?? publishToBranch;
  const write = deps.writeFile ?? writeFile;
  const ensureDir = deps.mkdir ?? mkdir;
  const now = deps.now ?? Date.now();

  let tracks;
  try {
    tracks = await recentlyPlayed({ clientId, clientSecret, refreshToken, count });
  } catch (err) {
    // Un problema del usuario tiene que verse; uno del mundo, no. Si Spotify
    // está caído no publicamos nada y la card anterior sigue en pie: una falla
    // transitoria nunca reemplaza una card buena por una rota.
    if (err.kind === "auth") {
      return { outcome: "failed", paths: [], trackCount: 0, message: err.message };
    }
    return { outcome: "skipped", paths: [], trackCount: 0, message: err.message };
  }

  if (tracks.length === 0) {
    return {
      outcome: "skipped",
      paths: [],
      trackCount: 0,
      message: "Spotify no devolvió reproducciones recientes; no se toca la card anterior",
    };
  }

  const withArt = await attachArt(tracks);
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

async function main() {
  try {
    const result = await run({ inputs: readInputs() });
    core.setOutput("paths", result.paths.join(","));
    core.setOutput("track-count", String(result.trackCount));

    if (result.outcome === "failed") core.setFailed(result.message);
    else if (result.outcome === "skipped") core.warning(result.message);
    else core.info(`vinilo: ${result.message} → ${result.paths.join(", ")}`);
  } catch (err) {
    core.setFailed(err.stack ?? String(err));
  }
}

// Solo corre como entrypoint de la Action; importarlo desde un test no
// dispara nada.
if (process.env.GITHUB_ACTIONS) await main();
