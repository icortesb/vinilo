#!/usr/bin/env node
// Alta interactiva: canjea el permiso de Spotify por un refresh token, que es
// lo único que la Action necesita después. Corre entero en tu máquina — el
// código nunca sale de acá y el token no pasa por ningún servidor.
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

const PORT = 8888;
const REDIRECT = `http://127.0.0.1:${PORT}/callback`;
// Dos scopes de solo lectura: el historial y lo que suena ahora. Ninguno toca
// tu cuenta ni tu reproductor.
const SCOPE = "user-read-recently-played user-read-currently-playing";

const HELP = `
vinilo — tus reproducciones recientes de Spotify en tu README

  npx github:icortesb/vinilo auth    sacar el refresh token

Antes de correrlo, creá una app en https://developer.spotify.com/dashboard
con la redirect URI  ${REDIRECT}  y el Web API marcado.
`;

async function auth() {
  const rl = createInterface({ input: stdin, output: stdout });
  const id = (await rl.question("Client ID: ")).trim();
  const secret = (await rl.question("Client secret: ")).trim();
  rl.close();

  if (!id || !secret) {
    console.error("\nHacen falta las dos cosas.");
    process.exit(1);
  }

  const state = Math.random().toString(36).slice(2);
  const authUrl =
    "https://accounts.spotify.com/authorize?" +
    new URLSearchParams({
      response_type: "code",
      client_id: id,
      scope: SCOPE,
      redirect_uri: REDIRECT,
      state,
    });

  const token = await new Promise((resolve, reject) => {
    const server = createServer(async (req, res) => {
      const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
      if (url.pathname !== "/callback") return void res.writeHead(404).end();

      const fail = (msg) => {
        res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" }).end(msg);
        server.close();
        reject(new Error(msg));
      };

      if (url.searchParams.get("error")) return fail(url.searchParams.get("error"));
      if (url.searchParams.get("state") !== state) return fail("el state no coincide");

      try {
        const basic = Buffer.from(`${id}:${secret}`).toString("base64");
        const r = await fetch("https://accounts.spotify.com/api/token", {
          method: "POST",
          headers: {
            Authorization: `Basic ${basic}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            grant_type: "authorization_code",
            code: url.searchParams.get("code"),
            redirect_uri: REDIRECT,
          }),
        });
        if (!r.ok) return fail(`Spotify devolvió ${r.status}: ${await r.text()}`);

        const { refresh_token } = await r.json();
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
          .end("<h2>Listo. Volvé a la terminal.</h2>");
        server.close();
        resolve(refresh_token);
      } catch (err) {
        fail(err.message);
      }
    });

    server.listen(PORT, "127.0.0.1", () => {
      console.log(`\nAbriendo el navegador para autorizar…\nSi no se abre, entrá acá:\n\n${authUrl}\n`);
      spawn(opener(), [authUrl], { stdio: "ignore", detached: true }).unref();
    });
  });

  console.log(`
Listo. Cargá estos tres secrets en el repo donde vaya el workflow:

  gh secret set SPOTIFY_CLIENT_ID     --body '${id}'
  gh secret set SPOTIFY_CLIENT_SECRET --body '${secret}'
  gh secret set SPOTIFY_REFRESH_TOKEN --body '${token}'

O a mano, en Settings → Secrets and variables → Actions.
`);
}

function opener() {
  if (process.platform === "darwin") return "open";
  if (process.platform === "win32") return "start";
  return "xdg-open";
}

const cmd = process.argv[2];
if (cmd === "auth") {
  await auth();
} else {
  console.log(HELP);
  process.exit(cmd ? 1 : 0);
}
