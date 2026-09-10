const TOKEN_URL = "https://accounts.spotify.com/api/token";
const RECENT_URL = "https://api.spotify.com/v1/me/player/recently-played";

// La distinción entre estos dos valores es la que ordena todo el manejo de
// errores de la Action: `auth` es del usuario y hay que avisarle fuerte,
// `transient` es del mundo y no debe reemplazar una card buena por una rota.
export class SpotifyError extends Error {
  constructor(kind, message) {
    super(message);
    this.name = "SpotifyError";
    this.kind = kind;
  }
}

const MIN_COUNT = 1;
const MAX_COUNT = 10;

function clampCount(count) {
  const n = Number.parseInt(count, 10);
  if (!Number.isFinite(n)) return 5;
  return Math.min(MAX_COUNT, Math.max(MIN_COUNT, n));
}

// Spotify usa 401 para un access token vencido y 400 para un refresh token
// revocado o credenciales mal. Los dos exigen que el usuario haga algo.
function classify(status) {
  if (status === 400 || status === 401 || status === 403) return "auth";
  return "transient";
}

async function accessToken({ clientId, clientSecret, refreshToken, fetch }) {
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  let res;
  try {
    res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }).toString(),
    });
  } catch (err) {
    // La red que se cae no es culpa de nadie y se reintenta en la próxima
    // corrida programada.
    throw new SpotifyError("transient", `no se pudo contactar a Spotify: ${err.message}`);
  }

  if (!res.ok) {
    throw new SpotifyError(
      classify(res.status),
      `el refresh del token falló con ${res.status}`,
    );
  }

  const json = await res.json();
  if (!json.access_token) {
    throw new SpotifyError("auth", "Spotify no devolvió un access token");
  }
  return json.access_token;
}

export async function recentlyPlayed({
  clientId,
  clientSecret,
  refreshToken,
  count = 5,
  fetch = globalThis.fetch,
}) {
  const token = await accessToken({ clientId, clientSecret, refreshToken, fetch });
  const limit = clampCount(count);

  let res;
  try {
    res = await fetch(`${RECENT_URL}?limit=${limit}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (err) {
    throw new SpotifyError("transient", `no se pudo leer el historial: ${err.message}`);
  }

  if (!res.ok) {
    throw new SpotifyError(
      classify(res.status),
      `el historial falló con ${res.status}`,
    );
  }

  const { items = [] } = await res.json();

  return items.map(({ track, played_at }) => ({
    name: track?.name ?? "",
    artist: (track?.artists ?? []).map((a) => a.name).filter(Boolean).join(", "),
    // Las imágenes vienen de mayor a menor: la más chica sobra para un
    // thumbnail de 72px y pesa una fracción, lo cual importa porque termina
    // embebida en base64 dentro del SVG.
    artUrl: track?.album?.images?.at(-1)?.url ?? null,
    playedAt: played_at ?? null,
  }));
}
