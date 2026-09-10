import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "../src/main.mjs";
import { publish } from "../src/publish.mjs";
import { attachArt } from "../src/art.mjs";

const exec = promisify(execFile);
const git = async (cwd, ...args) => (await exec("git", args, { cwd })).stdout.trim();

const NOW = Date.parse("2026-09-09T12:00:00Z");

async function repo() {
  const dir = await mkdtemp(join(tmpdir(), "vinilo-e2e-"));
  await git(dir, "init", "-q", "-b", "main");
  await git(dir, "config", "user.email", "t@t.t");
  await git(dir, "config", "user.name", "t");
  await writeFile(join(dir, "README.md"), "hola");
  await git(dir, "add", "-A");
  await git(dir, "commit", "-qm", "inicial");
  return dir;
}

// Todo real salvo la red: render, escritura a disco y commit a la rama.
test("de tracks a dos SVG commiteados en la rama", async () => {
  const dir = await repo();
  try {
    const tracks = Array.from({ length: 5 }, (_, i) => ({
      name: `Track ${i}`,
      artist: "TWICE",
      artUrl: `https://x/${i}.jpg`,
      playedAt: new Date(NOW - (i + 1) * 3600_000).toISOString(),
    }));

    const fakeImage = async () => ({
      ok: true,
      headers: { get: () => "image/jpeg" },
      arrayBuffer: async () => new TextEncoder().encode("jpeg").buffer,
    });

    const result = await run({
      inputs: {
        clientId: "id", clientSecret: "s", refreshToken: "r",
        count: "5", theme: "both", lang: "en",
        outputDir: join(dir, ".vinilo"), filename: "vinilo",
        publishTo: "vinilo",
      },
      deps: {
        recentlyPlayed: async () => tracks,
        attachArt: (ts) => attachArt(ts, { fetch: fakeImage }),
        publish: (args) => publish({ ...args, cwd: dir, push: false }),
        now: NOW,
      },
    });

    assert.equal(result.outcome, "published");
    assert.equal(result.trackCount, 5);

    const listed = (await git(dir, "ls-tree", "--name-only", "vinilo")).split("\n").sort();
    assert.deepEqual(listed, ["vinilo-dark.svg", "vinilo.svg"]);

    for (const name of listed) {
      const svg = await git(dir, "show", `vinilo:${name}`);
      assert.match(svg, /^<svg /);
      assert.match(svg, /<\/svg>/);
      assert.ok(svg.includes("data:image/jpeg;base64,"), `${name} sin tapas`);
      // Comillas balanceadas en cada tag: el SVG tiene que parsear.
      for (const tag of svg.match(/<[^>]*>/g) ?? []) {
        assert.equal((tag.match(/"/g) ?? []).length % 2, 0, `${name}: ${tag.slice(0, 80)}`);
      }
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("una segunda corrida sin cambios no agrega un commit", async () => {
  const dir = await repo();
  try {
    const tracks = [{ name: "Brave", artist: "TWICE", artUrl: null, playedAt: new Date(NOW - 3600_000).toISOString() }];
    const inputs = {
      clientId: "id", clientSecret: "s", refreshToken: "r",
      count: "1", theme: "dark", lang: "en",
      outputDir: join(dir, ".vinilo"), filename: "vinilo", publishTo: "vinilo",
    };
    const deps = {
      recentlyPlayed: async () => tracks,
      publish: (args) => publish({ ...args, cwd: dir, push: false }),
      now: NOW,
    };

    await run({ inputs, deps });
    const first = await git(dir, "rev-list", "--count", "vinilo");
    await run({ inputs, deps });
    assert.equal(await git(dir, "rev-list", "--count", "vinilo"), first);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("un fallo de Spotify deja intacta la card ya publicada", async () => {
  const dir = await repo();
  try {
    const inputs = {
      clientId: "id", clientSecret: "s", refreshToken: "r",
      count: "1", theme: "dark", lang: "en",
      outputDir: join(dir, ".vinilo"), filename: "vinilo", publishTo: "vinilo",
    };
    const publishReal = (args) => publish({ ...args, cwd: dir, push: false });

    await run({
      inputs,
      deps: {
        recentlyPlayed: async () => [
          { name: "Brave", artist: "TWICE", artUrl: null, playedAt: new Date(NOW - 3600_000).toISOString() },
        ],
        publish: publishReal, now: NOW,
      },
    });
    const good = await git(dir, "show", "vinilo:vinilo.svg");

    // Ahora Spotify se cae.
    const r = await run({
      inputs,
      deps: {
        recentlyPlayed: async () => { throw Object.assign(new Error("503"), { kind: "transient" }); },
        publish: publishReal, now: NOW,
      },
    });

    assert.equal(r.outcome, "skipped");
    assert.equal(await git(dir, "show", "vinilo:vinilo.svg"), good, "la card cambió tras un fallo transitorio");
  } finally { await rm(dir, { recursive: true, force: true }); }
});
