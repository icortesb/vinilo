import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getInput, setOutput, warning, setFailed, info } from "../src/actions.mjs";

function capture(fn) {
  const chunks = [];
  const original = process.stdout.write;
  process.stdout.write = (c) => { chunks.push(String(c)); return true; };
  try { fn(); } finally { process.stdout.write = original; }
  return chunks.join("");
}

test("getInput lee la variable con el nombre que arma GitHub", () => {
  process.env["INPUT_CLIENT-ID"] = "abc";
  assert.equal(getInput("client-id"), "abc");
  delete process.env["INPUT_CLIENT-ID"];
});

test("getInput mayusculiza y cambia espacios por guiones bajos", () => {
  process.env.INPUT_MY_INPUT = "x";
  assert.equal(getInput("my input"), "x");
  delete process.env.INPUT_MY_INPUT;
});

test("getInput recorta espacios", () => {
  process.env.INPUT_PADDED = "  hola  ";
  assert.equal(getInput("padded"), "hola");
  delete process.env.INPUT_PADDED;
});

test("getInput devuelve vacío si no está", () => {
  assert.equal(getInput("no-existe"), "");
});

test("getInput con required explota si falta", () => {
  assert.throws(() => getInput("no-existe", { required: true }), /Falta el input/);
});

test("setOutput escribe en formato heredoc", async () => {
  const dir = await mkdtemp(join(tmpdir(), "vinilo-out-"));
  const file = join(dir, "out");
  await writeFile(file, "");
  process.env.GITHUB_OUTPUT = file;
  try {
    setOutput("paths", "a.svg,b.svg");
    const written = await readFile(file, "utf8");
    assert.match(written, /^paths<<ghadelimiter_\w+\na\.svg,b\.svg\n\1?/m);
    assert.ok(written.includes("a.svg,b.svg"));
  } finally {
    delete process.env.GITHUB_OUTPUT;
    await rm(dir, { recursive: true, force: true });
  }
});

test("setOutput no rompe si no hay GITHUB_OUTPUT", () => {
  delete process.env.GITHUB_OUTPUT;
  assert.doesNotThrow(() => setOutput("x", "y"));
});

test("un valor multilínea no corrompe el archivo de outputs", async () => {
  const dir = await mkdtemp(join(tmpdir(), "vinilo-out-"));
  const file = join(dir, "out");
  await writeFile(file, "");
  process.env.GITHUB_OUTPUT = file;
  try {
    setOutput("multi", "linea1\nlinea2");
    const written = await readFile(file, "utf8");
    // El delimitador aparece dos veces: apertura y cierre.
    const delimiter = written.match(/<<(ghadelimiter_\w+)/)[1];
    assert.equal(written.split(delimiter).length - 1, 2);
  } finally {
    delete process.env.GITHUB_OUTPUT;
    await rm(dir, { recursive: true, force: true });
  }
});

test("warning emite el comando de GitHub", () => {
  assert.equal(capture(() => warning("ojo")), "::warning::ojo\n");
});

test("los saltos de línea del mensaje se escapan", () => {
  // Sin escapar, el salto cortaría el comando y GitHub leería el resto como
  // texto suelto.
  assert.equal(capture(() => warning("a\nb")), "::warning::a%0Ab\n");
  assert.equal(capture(() => warning("100%")), "::warning::100%25\n");
});

test("setFailed emite error y marca la corrida como fallida", () => {
  const before = process.exitCode;
  const out = capture(() => setFailed("se rompió"));
  assert.equal(out, "::error::se rompió\n");
  assert.equal(process.exitCode, 1);
  process.exitCode = before;
});

test("info escribe la línea tal cual", () => {
  assert.equal(capture(() => info("hola")), "hola\n");
});
