// El SVG se sirve desde raw.githubusercontent.com, donde no hay nada que
// sirva las imágenes: las tapas tienen que viajar adentro del documento.

const DEFAULT_TYPE = "image/jpeg";

// Una tapa que no se pudo bajar vale una fila con placeholder, no perder la
// card entera. Nada de acá adentro propaga un error.
async function fetchOne(url, fetchImpl) {
  if (!url) return null;
  try {
    const res = await fetchImpl(url);
    if (!res.ok) return null;
    const type = res.headers?.get?.("content-type") || DEFAULT_TYPE;
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length === 0) return null;
    return `data:${type};base64,${bytes.toString("base64")}`;
  } catch {
    return null;
  }
}

export async function attachArt(tracks, { fetch = globalThis.fetch } = {}) {
  const arts = await Promise.all(tracks.map((t) => fetchOne(t.artUrl, fetch)));
  return tracks.map((track, i) => ({ ...track, art: arts[i] }));
}
