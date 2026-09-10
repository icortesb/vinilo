import { test } from "node:test";
import assert from "node:assert/strict";
import { recentlyPlayed, SpotifyError } from "../src/spotify.mjs";

const creds = { clientId: "id", clientSecret: "secret", refreshToken: "refresh" };

const trackItem = (i) => ({
  played_at: `2026-09-09T1${i}:00:00Z`,
  track: {
    name: `Track ${i}`,
    artists: [{ name: "TWICE" }],
    album: { images: [{ url: "big.jpg" }, { url: "mid.jpg" }, { url: "small.jpg" }] },
  },
});

// `plan` describe qué responde cada endpoint: {token: status, recent: status}.
function fakeFetch(calls, plan, body) {
  return async (url, init) => {
    calls.push({ url: String(url), init });
    const isToken = String(url).includes("accounts.spotify.com");
    const status = isToken ? (plan.token ?? 200) : (plan.recent ?? 200);
    if (status === "network") throw new Error("ECONNRESET");
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () =>
        isToken
          ? { access_token: "access" }
          : (body ?? { items: [0, 1, 2, 3, 4].map(trackItem) }),
    };
  };
}

test("canjea el refresh token y después pide el historial", async () => {
  const calls = [];
  await recentlyPlayed({ ...creds, fetch: fakeFetch(calls, {}) });
  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /accounts\.spotify\.com/);
  assert.equal(calls[0].init.method, "POST");
  assert.match(calls[1].url, /recently-played/);
  assert.equal(calls[1].init.headers.Authorization, "Bearer access");
});

test("mapea los tracks al shape del render", async () => {
  const tracks = await recentlyPlayed({ ...creds, fetch: fakeFetch([], {}) });
  assert.equal(tracks.length, 5);
  assert.deepEqual(Object.keys(tracks[0]).sort(), ["artUrl", "artist", "name", "playedAt"]);
  assert.equal(tracks[0].name, "Track 0");
  assert.equal(tracks[0].artist, "TWICE");
});

test("elige la imagen más chica", async () => {
  const tracks = await recentlyPlayed({ ...creds, fetch: fakeFetch([], {}) });
  assert.equal(tracks[0].artUrl, "small.jpg");
});

test("varios artistas se unen con coma", async () => {
  const item = trackItem(0);
  item.track.artists = [{ name: "TWICE" }, { name: "Somebody Else" }];
  const tracks = await recentlyPlayed({ ...creds, fetch: fakeFetch([], {}, { items: [item] }) });
  assert.equal(tracks[0].artist, "TWICE, Somebody Else");
});

test("un track sin álbum no rompe y queda sin tapa", async () => {
  const item = trackItem(0);
  delete item.track.album;
  const tracks = await recentlyPlayed({ ...creds, fetch: fakeFetch([], {}, { items: [item] }) });
  assert.equal(tracks[0].artUrl, null);
});

test("un 400 en el token es kind auth", async () => {
  await assert.rejects(
    () => recentlyPlayed({ ...creds, fetch: fakeFetch([], { token: 400 }) }),
    (e) => e instanceof SpotifyError && e.kind === "auth",
  );
});

test("un 401 es kind auth", async () => {
  await assert.rejects(
    () => recentlyPlayed({ ...creds, fetch: fakeFetch([], { token: 401 }) }),
    (e) => e.kind === "auth",
  );
});

test("un 429 en el historial es kind transient", async () => {
  await assert.rejects(
    () => recentlyPlayed({ ...creds, fetch: fakeFetch([], { recent: 429 }) }),
    (e) => e.kind === "transient",
  );
});

test("un 503 es kind transient", async () => {
  await assert.rejects(
    () => recentlyPlayed({ ...creds, fetch: fakeFetch([], { recent: 503 }) }),
    (e) => e.kind === "transient",
  );
});

test("la red caída es kind transient", async () => {
  await assert.rejects(
    () => recentlyPlayed({ ...creds, fetch: fakeFetch([], { token: "network" }) }),
    (e) => e.kind === "transient",
  );
});

test("un token 200 sin access_token es kind auth", async () => {
  const fetch = async (url) => ({
    ok: true,
    status: 200,
    json: async () => ({}),
  });
  await assert.rejects(
    () => recentlyPlayed({ ...creds, fetch }),
    (e) => e.kind === "auth",
  );
});

test("count se recorta a 1..10", async () => {
  for (const [given, expected] of [[99, 10], [0, 1], [-3, 1], [7, 7], ["3", 3], [undefined, 5], ["x", 5]]) {
    const calls = [];
    await recentlyPlayed({ ...creds, count: given, fetch: fakeFetch(calls, {}) });
    assert.match(calls[1].url, new RegExp(`limit=${expected}$`), `count=${given}`);
  }
});

test("sin reproducciones devuelve lista vacía, no un error", async () => {
  const tracks = await recentlyPlayed({ ...creds, fetch: fakeFetch([], {}, { items: [] }) });
  assert.deepEqual(tracks, []);
});
