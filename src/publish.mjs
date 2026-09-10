import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const run = promisify(execFile);

// La rama se escribe con plumbing y un índice temporal, no haciendo checkout:
// así no se toca el working tree del usuario (que puede tener su build a medio
// hacer) y, sobre todo, se PRESERVA lo que ya había en la rama.
//
// Eso último no es un detalle. Mucha gente publica el snake de contribuciones
// en la misma rama; si acá hiciéramos un commit con solo nuestros archivos,
// cada corrida borraría los del otro workflow y viceversa. Con read-tree los
// archivos ajenos entran al índice antes que los nuestros y sobreviven.

const BOT = {
  GIT_AUTHOR_NAME: "github-actions[bot]",
  GIT_AUTHOR_EMAIL: "41898282+github-actions[bot]@users.noreply.github.com",
  GIT_COMMITTER_NAME: "github-actions[bot]",
  GIT_COMMITTER_EMAIL: "41898282+github-actions[bot]@users.noreply.github.com",
};

async function git(cwd, args, { env = {}, input } = {}) {
  const { stdout } = await run("git", args, {
    cwd,
    env: { ...process.env, ...env },
    maxBuffer: 64 * 1024 * 1024,
    input,
  });
  return stdout.trim();
}

async function revParse(cwd, ref) {
  try {
    return await git(cwd, ["rev-parse", "--verify", ref]);
  } catch {
    return null;
  }
}

// El estado publicado vive en el remoto, no en el checkout. actions/checkout
// trae solo la rama por defecto, así que la rama de la card casi nunca está
// local: sin este fetch la veríamos como inexistente, crearíamos una huérfana
// y el push saldría rechazado por no ser fast-forward. Peor todavía, un push
// forzado ahí borraría los archivos de quien más publique en esa rama.
async function branchTip(cwd, branch, remote, doFetch) {
  if (doFetch) {
    try {
      await git(cwd, [
        "fetch", "--no-tags", "--depth=1", remote,
        `+refs/heads/${branch}:refs/remotes/${remote}/${branch}`,
      ]);
    } catch {
      // La rama todavía no existe en el remoto: se crea en este commit.
    }
  }
  return (
    (await revParse(cwd, `refs/remotes/${remote}/${branch}`)) ??
    (await revParse(cwd, `refs/heads/${branch}`))
  );
}

export async function publish({
  branch,
  files,
  cwd = process.cwd(),
  message = "Update vinilo card",
  push = true,
  remote = "origin",
}) {
  if (!branch) throw new Error("publish necesita una rama");
  if (!files?.length) throw new Error("publish necesita archivos");

  const indexDir = await mkdtemp(join(tmpdir(), "vinilo-index-"));
  const indexFile = join(indexDir, "index");
  const env = { ...BOT, GIT_INDEX_FILE: indexFile };

  try {
    const parent = await branchTip(cwd, branch, remote, push);

    // Cargar lo que YA está en la rama. Si no existe, arrancamos huérfanos.
    if (parent) {
      await git(cwd, ["read-tree", parent], { env });
    } else {
      await git(cwd, ["read-tree", "--empty"], { env });
    }

    for (const file of files) {
      const blobPath = join(indexDir, "blob");
      await writeFile(blobPath, file.content);
      const sha = await git(cwd, ["hash-object", "-w", "--path", file.name, blobPath], { env });
      await git(cwd, ["update-index", "--add", "--cacheinfo", `100644,${sha},${file.name}`], { env });
    }

    const tree = await git(cwd, ["write-tree"], { env });

    // Si el árbol no cambió, no hay nada que decir. Un commit vacío por hora
    // llenaría el historial de ruido sin aportar un solo byte.
    if (parent) {
      const parentTree = await git(cwd, ["rev-parse", `${parent}^{tree}`]);
      if (parentTree === tree) return { committed: false, commit: parent };
    }

    const commitArgs = ["commit-tree", tree, "-m", message];
    if (parent) commitArgs.push("-p", parent);
    const commit = await git(cwd, commitArgs, { env });

    await git(cwd, ["update-ref", `refs/heads/${branch}`, commit]);
    if (push) await git(cwd, ["push", remote, `refs/heads/${branch}:refs/heads/${branch}`]);

    return { committed: true, commit };
  } finally {
    await rm(indexDir, { recursive: true, force: true });
  }
}
