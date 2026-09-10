import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { publish } from "../src/publish.mjs";

const run = promisify(execFile);
const git = async (cwd, ...args) => (await run("git", args, { cwd })).stdout.trim();

async function repo() {
  const dir = await mkdtemp(join(tmpdir(), "vinilo-test-"));
  await git(dir, "init", "-q", "-b", "main");
  await git(dir, "config", "user.email", "t@t.t");
  await git(dir, "config", "user.name", "t");
  await writeFile(join(dir, "README.md"), "hola");
  await git(dir, "add", "-A");
  await git(dir, "commit", "-qm", "inicial");
  return dir;
}

const svg = (n) => ({ name: n, content: `<svg>${n}</svg>` });

test("crea la rama si no existe y commitea los archivos", async () => {
  const dir = await repo();
  try {
    const out = await publish({ branch: "vinilo", files: [svg("vinilo.svg")], cwd: dir, push: false });
    assert.equal(out.committed, true);
    const listed = await git(dir, "ls-tree", "--name-only", "vinilo");
    assert.equal(listed, "vinilo.svg");
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("la rama nueva es huérfana: no arrastra el historial de main", async () => {
  const dir = await repo();
  try {
    await publish({ branch: "vinilo", files: [svg("vinilo.svg")], cwd: dir, push: false });
    const files = await git(dir, "ls-tree", "--name-only", "vinilo");
    assert.ok(!files.includes("README.md"));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("PRESERVA archivos ajenos que ya estaban en la rama", async () => {
  const dir = await repo();
  try {
    // Alguien más (el snake, por ejemplo) ya publica en esta rama.
    await publish({ branch: "vinilo", files: [svg("github-snake.svg")], cwd: dir, push: false });
    await publish({ branch: "vinilo", files: [svg("vinilo.svg")], cwd: dir, push: false });

    const files = (await git(dir, "ls-tree", "--name-only", "vinilo")).split("\n").sort();
    assert.deepEqual(files, ["github-snake.svg", "vinilo.svg"]);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("actualiza el contenido de un archivo propio ya publicado", async () => {
  const dir = await repo();
  try {
    await publish({ branch: "vinilo", files: [{ name: "vinilo.svg", content: "viejo" }], cwd: dir, push: false });
    await publish({ branch: "vinilo", files: [{ name: "vinilo.svg", content: "nuevo" }], cwd: dir, push: false });
    assert.equal(await git(dir, "show", "vinilo:vinilo.svg"), "nuevo");
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("sin cambios no genera un commit vacío", async () => {
  const dir = await repo();
  try {
    await publish({ branch: "vinilo", files: [svg("vinilo.svg")], cwd: dir, push: false });
    const before = await git(dir, "rev-list", "--count", "vinilo");
    const out = await publish({ branch: "vinilo", files: [svg("vinilo.svg")], cwd: dir, push: false });
    assert.equal(out.committed, false);
    assert.equal(await git(dir, "rev-list", "--count", "vinilo"), before);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("no toca el working tree ni la rama actual", async () => {
  const dir = await repo();
  try {
    await publish({ branch: "vinilo", files: [svg("vinilo.svg")], cwd: dir, push: false });
    assert.equal(await git(dir, "rev-parse", "--abbrev-ref", "HEAD"), "main");
    assert.equal(await git(dir, "status", "--porcelain"), "");
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("publica varios archivos de una", async () => {
  const dir = await repo();
  try {
    await publish({
      branch: "vinilo",
      files: [svg("vinilo.svg"), svg("vinilo-dark.svg")],
      cwd: dir, push: false,
    });
    const files = (await git(dir, "ls-tree", "--name-only", "vinilo")).split("\n").sort();
    assert.deepEqual(files, ["vinilo-dark.svg", "vinilo.svg"]);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("exige rama y archivos", async () => {
  await assert.rejects(() => publish({ files: [svg("a.svg")], push: false }));
  await assert.rejects(() => publish({ branch: "x", files: [], push: false }));
});

// El escenario real: un checkout superficial que NO tiene la rama de la card
// localmente, y un remoto donde otro workflow ya publicó.
async function withRemote() {
  const root = await mkdtemp(join(tmpdir(), "vinilo-remote-"));
  const bare = join(root, "origin.git");
  await run("git", ["init", "-q", "--bare", "-b", "main", bare]);

  // Un repo "sembrador" que deja el snake en la rama output del remoto.
  const seed = join(root, "seed");
  await run("git", ["clone", "-q", bare, seed]);
  await git(seed, "config", "user.email", "t@t.t");
  await git(seed, "config", "user.name", "t");
  await writeFile(join(seed, "README.md"), "hola");
  await git(seed, "add", "-A");
  await git(seed, "commit", "-qm", "inicial");
  await git(seed, "push", "-q", "origin", "main");
  await publish({ branch: "output", files: [svg("github-snake.svg")], cwd: seed, push: true });

  // Y el checkout que usaría la Action: solo la rama por defecto.
  const work = join(root, "work");
  await run("git", ["clone", "-q", "--depth=1", "--branch", "main", bare, work]);
  await git(work, "config", "user.email", "t@t.t");
  await git(work, "config", "user.name", "t");
  return { root, work, bare };
}

test("publica sobre una rama del remoto que no está en el checkout", async () => {
  const { root, work, bare } = await withRemote();
  try {
    // La rama no existe localmente: es exactamente lo que deja actions/checkout.
    assert.equal(
      await git(work, "rev-parse", "--verify", "--quiet", "refs/heads/output").catch(() => ""),
      "",
    );

    const out = await publish({ branch: "output", files: [svg("vinilo.svg")], cwd: work, push: true });
    assert.equal(out.committed, true);

    // Y en el remoto tienen que estar LOS DOS archivos.
    const listed = (await git(bare, "ls-tree", "--name-only", "output")).split("\n").sort();
    assert.deepEqual(listed, ["github-snake.svg", "vinilo.svg"]);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("no pisa el trabajo de otro workflow publicado entre corridas", async () => {
  const { root, work, bare } = await withRemote();
  try {
    await publish({ branch: "output", files: [svg("vinilo.svg")], cwd: work, push: true });

    // Otro workflow publica algo nuevo desde otro lado.
    const other = join(root, "other");
    await run("git", ["clone", "-q", bare, other]);
    await git(other, "config", "user.email", "t@t.t");
    await git(other, "config", "user.name", "t");
    await publish({ branch: "output", files: [svg("stats.svg")], cwd: other, push: true });

    // Nuestra siguiente corrida tiene que sumarse, no borrarlo.
    await publish({ branch: "output", files: [{ name: "vinilo.svg", content: "nuevo" }], cwd: work, push: true });

    const listed = (await git(bare, "ls-tree", "--name-only", "output")).split("\n").sort();
    assert.deepEqual(listed, ["github-snake.svg", "stats.svg", "vinilo.svg"]);
    assert.equal(await git(bare, "show", "output:vinilo.svg"), "nuevo");
  } finally { await rm(root, { recursive: true, force: true }); }
});
