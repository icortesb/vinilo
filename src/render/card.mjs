import { FONT } from "./theme.mjs";
import { estimateWidth, truncate, esc } from "./measure.mjs";

// Layout "Now Bar": el track más reciente es un héroe y los demás lo sostienen
// como filas compactas. La jerarquía sale de la estructura, no de la
// tipografía — en una lista uniforme el título y el artista pelean por la
// misma jerarquía en cada fila.

const W = 400;
const PAD = 18;
const RADIUS = 14;

const HERO_ART = 72;
const HERO_GAP = 14;
const LABEL_SIZE = 10;
const LOGO_SIZE = 12;
const LOGO_GAP = 6;
const TITLE_SIZE = 17;
const ARTIST_SIZE = 13;
const TIME_SIZE = 11;

// Barras del ecualizador del hero que suena ahora. Las animaciones SMIL sí
// corren dentro de un <img>, que es como GitHub sirve este SVG: no hay JS ni
// hover, pero un <animate> declarativo anda.
const BAR_W = 2.5;
const BAR_GAP = 2;
const BAR_MAX = 9;
const BAR_MIN = 3;
const BARS = 3;
const BAR_DUR = 0.9;
// Alturas en reposo, para lo que no anima (previews, lectores de feed): tres
// barras parejas se leen como "…" y parecen un spinner, no un ecualizador.
const BAR_STILL = [6, 9, 4];

const ROW_ART = 28;
const ROW_GAP = 11;
const ROW_PITCH = 38;
const ROW_TEXT = 12.5;
const ROW_TIME = 10.5;

// Fracción de la altura de fuente que ocupa una mayúscula en el stack del
// sistema. Sirve para centrar una línea sobre un punto en vez de sobre su
// baseline, que es lo que uno realmente quiere al alinear con una imagen.
const CAP = 0.7031;

const SPOTIFY_PATH =
  "M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z";

const round = (n) => Math.round(n * 100) / 100;

function centredBaseline(midY, size) {
  return midY + (CAP * size) / 2;
}

// Todo texto de la card pasa por acá. El clipPath es la garantía de que un
// título largo se corta en el borde de su caja en vez de desbordar sobre el
// timestamp: la estimación de ancho puede fallar, esto no.
function clippedText(ctx, content, { x, y, w, size, fill, weight, anchor }) {
  const id = `c${ctx.n++}`;
  const boxX = anchor === "end" ? x - w : x;
  const top = y - size;
  ctx.defs.push(
    `<clipPath id="${id}"><rect x="${round(boxX)}" y="${round(top)}" width="${round(w)}" height="${round(size * 1.5)}"/></clipPath>`,
  );
  const attrs = [
    `x="${round(x)}"`,
    `y="${round(y)}"`,
    `font-family="${FONT}"`,
    `font-size="${size}"`,
    weight ? `font-weight="${weight}"` : "",
    anchor === "end" ? `text-anchor="end"` : "",
    `fill="${fill}"`,
    `clip-path="url(#${id})"`,
  ].filter(Boolean);
  return `<text ${attrs.join(" ")}>${esc(content)}</text>`;
}

function artTile(ctx, art, x, y, size, radius, palette) {
  if (!art) {
    // Una tapa que no bajó no justifica perder la fila: se dibuja el hueco.
    const inset = size * 0.3;
    return (
      `<rect x="${x}" y="${round(y)}" width="${size}" height="${size}" rx="${radius}" fill="${palette.placeholder}"/>` +
      `<circle cx="${round(x + size / 2)}" cy="${round(y + size / 2)}" r="${round(inset / 2)}" fill="none" stroke="${palette.meta}" stroke-width="1.25"/>`
    );
  }
  const id = `a${ctx.n++}`;
  ctx.defs.push(
    `<clipPath id="${id}"><rect x="${x}" y="${round(y)}" width="${size}" height="${size}" rx="${radius}"/></clipPath>`,
  );
  return `<image x="${x}" y="${round(y)}" width="${size}" height="${size}" href="${art}" clip-path="url(#${id})" preserveAspectRatio="xMidYMid slice"/>`;
}

// Las tres barras arrancan desfasadas para que no suban y bajen al unísono.
// El offset es negativo a propósito: un begin positivo dejaría la primera
// vuelta quieta, y lo primero que se ve de la card sería justo lo que no se
// mueve.
function equalizer(x, bottom, fill) {
  const bars = [];
  for (let i = 0; i < BARS; i++) {
    const bx = x + i * (BAR_W + BAR_GAP);
    const begin = round(-(i * BAR_DUR) / BARS);
    const still = BAR_STILL[i % BAR_STILL.length];
    bars.push(
      `<rect x="${round(bx)}" y="${round(bottom - still)}" width="${BAR_W}" height="${still}" rx="1" fill="${fill}">` +
        `<animate attributeName="height" values="${BAR_MIN};${BAR_MAX};${BAR_MIN}" dur="${BAR_DUR}s" begin="${begin}s" repeatCount="indefinite"/>` +
        `<animate attributeName="y" values="${round(bottom - BAR_MIN)};${round(bottom - BAR_MAX)};${round(bottom - BAR_MIN)}" dur="${BAR_DUR}s" begin="${begin}s" repeatCount="indefinite"/>` +
        `</rect>`,
    );
  }
  return bars.join("");
}

export function renderCard(tracks, { palette, locale, now = Date.now() }) {
  if (!Array.isArray(tracks) || tracks.length === 0) {
    throw new Error("renderCard necesita al menos un track");
  }

  const ctx = { n: 0, defs: [] };
  const body = [];
  const [hero, ...rest] = tracks;

  // ── Héroe ──────────────────────────────────────────────────────────────
  const heroTop = PAD;
  const textX = PAD + HERO_ART + HERO_GAP;
  const heroTextW = W - PAD - textX;

  body.push(artTile(ctx, hero.art, PAD, heroTop, HERO_ART, 8, palette));

  const labelBaseline = heroTop + 11;
  const label = (
    hero.isNowPlaying ? locale.strings.nowPlaying : locale.strings.recentlyPlayed
  ).toUpperCase();
  const labelX = textX + LOGO_SIZE + LOGO_GAP;
  const labelW = heroTextW - LOGO_SIZE - LOGO_GAP;

  body.push(
    `<g transform="translate(${textX} ${round(labelBaseline - LOGO_SIZE * CAP - 1)}) scale(${round(LOGO_SIZE / 24)})"><path d="${SPOTIFY_PATH}" fill="${palette.brand}"/></g>`,
    clippedText(ctx, label, {
      x: labelX,
      y: labelBaseline,
      w: labelW,
      size: LABEL_SIZE,
      fill: hero.isNowPlaying ? palette.brand : palette.meta,
    }),
  );

  if (hero.isNowPlaying) {
    // El ecualizador va después del texto de la etiqueta. Si la traducción es
    // larga y no queda lugar, se omite: es decoración, no puede empujar nada.
    const barsX = labelX + estimateWidth(label, LABEL_SIZE) + 7;
    const barsW = BARS * BAR_W + (BARS - 1) * BAR_GAP;
    if (barsX + barsW <= W - PAD) {
      body.push(equalizer(barsX, labelBaseline, palette.brand));
    }
  }

  const titleBaseline = labelBaseline + 22;
  body.push(
    clippedText(ctx, truncate(hero.name, TITLE_SIZE, heroTextW), {
      x: textX,
      y: titleBaseline,
      w: heroTextW,
      size: TITLE_SIZE,
      fill: palette.title,
      weight: "640",
    }),
    clippedText(ctx, truncate(hero.artist, ARTIST_SIZE, heroTextW), {
      x: textX,
      y: titleBaseline + 18,
      w: heroTextW,
      size: ARTIST_SIZE,
      fill: palette.artist,
    }),
  );

  // Lo que suena ahora no tiene "hace cuánto": ese renglón lo ocupa el álbum,
  // que además es el dato que falta cuando el título y el artista ya están.
  const heroMeta = hero.isNowPlaying
    ? (hero.album ?? "")
    : hero.playedAt
      ? locale.relativeTime(hero.playedAt, now)
      : "";

  if (heroMeta) {
    body.push(
      clippedText(ctx, truncate(heroMeta, TIME_SIZE, heroTextW), {
        x: textX,
        y: titleBaseline + 35,
        w: heroTextW,
        size: TIME_SIZE,
        fill: palette.meta,
      }),
    );
  }

  let y = heroTop + HERO_ART;

  // ── Filas compactas ────────────────────────────────────────────────────
  if (rest.length > 0) {
    y += 14;
    body.push(
      `<rect x="${PAD}" y="${round(y)}" width="${W - PAD * 2}" height="1" fill="${palette.divider}"/>`,
    );
    y += 10;

    const rowTextX = PAD + ROW_ART + ROW_GAP;

    rest.forEach((track, i) => {
      const top = y + i * ROW_PITCH;
      const mid = top + ROW_PITCH / 2;
      const baseline = centredBaseline(mid, ROW_TEXT);

      body.push(
        artTile(ctx, track.art, PAD, mid - ROW_ART / 2, ROW_ART, 5, palette),
      );

      const when = track.playedAt ? locale.relativeTime(track.playedAt, now) : "";
      const timeW = when ? estimateWidth(when, ROW_TIME) : 0;
      if (when) {
        body.push(
          clippedText(ctx, when, {
            x: W - PAD,
            y: centredBaseline(mid, ROW_TIME),
            w: timeW + 2,
            size: ROW_TIME,
            fill: palette.meta,
            anchor: "end",
          }),
        );
      }

      const avail = W - PAD - rowTextX - (timeW ? timeW + 12 : 0);
      const line = `${track.name}  ·  ${track.artist}`;
      body.push(
        clippedText(ctx, truncate(line, ROW_TEXT, avail), {
          x: rowTextX,
          y: baseline,
          w: avail,
          size: ROW_TEXT,
          fill: palette.title,
        }),
      );
    });

    y += rest.length * ROW_PITCH;
  }

  const height = round(y + PAD - 4);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${height}" viewBox="0 0 ${W} ${height}" fill="none" role="img" aria-label="${esc(locale.strings.recentlyPlayed)}">
<title>${esc(locale.strings.recentlyPlayed)}</title>
<defs>
${ctx.defs.join("\n")}
</defs>
<rect x="0.5" y="0.5" width="${W - 1}" height="${round(height - 1)}" rx="${RADIUS}" fill="${palette.bg}" stroke="${palette.border}"/>
${body.join("\n")}
</svg>
`;
}
