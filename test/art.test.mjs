import { test } from "node:test";
import assert from "node:assert/strict";
import { attachArt } from "../src/art.mjs";

const okImage = async () => ({
  ok: true,
  headers: { get: () => "image/jpeg" },
  arrayBuffer: async () => new TextEncoder().encode("jpegbytes").buffer,
});

test("convierte la tapa a data URI", async () => {
  const out = await attachArt([{ artUrl: "https://x/a.jpg" }], { fetch: okImage });
  assert.match(out[0].art, /^data:image\/jpeg;base64,/);
  assert.equal(Buffer.from(out[0].art.split(",")[1], "base64").toString(), "jpegbytes");
});

test("respeta el content-type que devuelve el servidor", async () => {
  const png = async () => ({
    ok: true,
    headers: { get: () => "image/png" },
    arrayBuffer: async () => new TextEncoder().encode("png").buffer,
  });
  const out = await attachArt([{ artUrl: "https://x/a.png" }], { fetch: png });
  assert.match(out[0].art, /^data:image\/png;base64,/);
});

test("preserva el resto del track", async () => {
  const out = await attachArt(
    [{ artUrl: "https://x/a.jpg", name: "Brave", artist: "TWICE", playedAt: "2026-09-09T10:00:00Z" }],
    { fetch: okImage },
  );
  assert.equal(out[0].name, "Brave");
  assert.equal(out[0].playedAt, "2026-09-09T10:00:00Z");
});

test("una tapa que falla queda en null y no rompe", async () => {
  const out = await attachArt([{ artUrl: "https://x/a.jpg" }], {
    fetch: async () => { throw new Error("ECONNRESET"); },
  });
  assert.equal(out[0].art, null);
});

test("un 404 queda en null", async () => {
  const out = await attachArt([{ artUrl: "https://x/a.jpg" }], {
    fetch: async () => ({ ok: false, status: 404 }),
  });
  assert.equal(out[0].art, null);
});

test("una respuesta vacía queda en null", async () => {
  const out = await attachArt([{ artUrl: "https://x/a.jpg" }], {
    fetch: async () => ({ ok: true, headers: { get: () => "image/jpeg" }, arrayBuffer: async () => new ArrayBuffer(0) }),
  });
  assert.equal(out[0].art, null);
});

test("sin artUrl queda en null sin pedir nada", async () => {
  let called = false;
  const out = await attachArt([{ artUrl: null }], {
    fetch: async () => { called = true; return okImage(); },
  });
  assert.equal(out[0].art, null);
  assert.equal(called, false);
});

test("una tapa rota no arrastra a las demás", async () => {
  let n = 0;
  const flaky = async () => {
    if (n++ === 1) throw new Error("boom");
    return okImage();
  };
  const out = await attachArt(
    [{ artUrl: "a" }, { artUrl: "b" }, { artUrl: "c" }],
    { fetch: flaky },
  );
  assert.ok(out[0].art);
  assert.equal(out[1].art, null);
  assert.ok(out[2].art);
});

test("las descargas van en paralelo", async () => {
  let concurrent = 0;
  let peak = 0;
  const slow = async () => {
    peak = Math.max(peak, ++concurrent);
    await new Promise((r) => setTimeout(r, 10));
    concurrent--;
    return okImage();
  };
  await attachArt([{ artUrl: "a" }, { artUrl: "b" }, { artUrl: "c" }], { fetch: slow });
  assert.ok(peak > 1, `pico de concurrencia ${peak}`);
});
