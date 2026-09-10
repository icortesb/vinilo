import { appendFileSync } from "node:fs";

// Las cinco funciones del toolkit de GitHub que esta Action realmente usa.
// @actions/core las trae, pero arrastra un cliente HTTP y el soporte de OIDC
// que acá no se tocan: 488 KB de bundle contra las ~50 líneas de abajo.
//
// En un proyecto cuyo argumento es no darle a nadie más tu refresh token,
// cargar medio megabyte de dependencia que nunca se lee sería incoherente.
// El protocolo son variables de entorno y comandos por stdout, y está
// documentado y estable.

// Los comandos van en una línea: un salto de línea sin escapar cortaría el
// comando y GitHub interpretaría el resto como texto suelto.
const escapeData = (s) =>
  String(s).replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");

export function getInput(name, { required = false } = {}) {
  const key = `INPUT_${name.replace(/ /g, "_").toUpperCase()}`;
  const value = (process.env[key] ?? "").trim();
  if (required && !value) {
    throw new Error(`Falta el input requerido: ${name}`);
  }
  return value;
}

export function setOutput(name, value) {
  const file = process.env.GITHUB_OUTPUT;
  if (!file) return; // corriendo fuera de Actions: no hay dónde escribir
  // Formato heredoc: un valor multilínea con `name=value` rompería el archivo.
  const delimiter = `ghadelimiter_${Math.random().toString(36).slice(2)}`;
  appendFileSync(file, `${name}<<${delimiter}\n${value}\n${delimiter}\n`);
}

export function info(message) {
  process.stdout.write(`${message}\n`);
}

export function warning(message) {
  process.stdout.write(`::warning::${escapeData(message)}\n`);
}

export function setFailed(message) {
  process.stdout.write(`::error::${escapeData(message)}\n`);
  process.exitCode = 1;
}

export default { getInput, setOutput, info, warning, setFailed };
