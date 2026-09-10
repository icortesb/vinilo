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
