# vinilo — diseño

Fecha: 2026-09-09

Una GitHub Action que dibuja tus reproducciones recientes de Spotify como un
SVG y lo deja commiteado en una rama de tu propio repo, para embeberlo en el
README del perfil.

## El problema

Las cards de Spotify para READMEs existen y funcionan así: un servicio central
guarda el refresh token de cada usuario, y el README apunta a una URL de ese
servicio. Eso tiene dos fallas que no son hipotéticas.

**El servicio se cae y tu perfil muestra una card rota.** Medido el 2026-09-09:
`spotify-recently-played-readme.vercel.app` respondía un SVG que decía
"Spotify authorization needed", y `github-readme-stats.vercel.app` devolvía
`DEPLOYMENT_PAUSED` (HTTP 503). Dos de las tres imágenes de un perfil real
estaban rotas, y el dueño no se había enterado.

**Alguien más custodia tu token.** Un refresh token de Spotify es de larga
duración. Confiárselo a un tercero para que dibuje una imagen es un intercambio
malo, y no hay forma de auditarlo.

## La tesis

El SVG no necesita generarse cuando alguien lo mira. Las reproducciones
cambian pocas veces por hora; una imagen estática regenerada periódicamente es
indistinguible para el lector.

Entonces: **generarlo en las GitHub Actions del propio usuario y commitearlo a
una rama suya.** No hay servicio que pueda caerse, no hay rate limit
compartido, y el token no sale de los secrets de su repo.

El costo es la fricción de alta, que es real y es el motivo por el que el
modelo hosteado ganó. La fase 2 la ataca sin renunciar a la tesis (ver
"Fuera de alcance").

## Forma de distribución

Una **GitHub Action publicada**, no un template repo.

Quien quiere una card de Spotify en el README ya tiene el README decorado con
algo, o sea que ya tiene un archivo de workflow. Un template pide adoptar un
repo entero; una Action pide agregar un step. Además las mejoras llegan solas
por el tag móvil `v1`, mientras que cada copia de un template queda congelada
el día que se clonó.

```yaml
- uses: icortesb/vinilo@v1
  with:
    client-id: ${{ secrets.SPOTIFY_CLIENT_ID }}
    client-secret: ${{ secrets.SPOTIFY_CLIENT_SECRET }}
    refresh-token: ${{ secrets.SPOTIFY_REFRESH_TOKEN }}
    publish-to: vinilo
```

## El nombre

`vinilo`. Las guías de marca de Spotify piden no usar "Spotify" en el nombre
de la app. Muchos proyectos OSS lo hacen igual, pero es un riesgo evitable y
un nombre propio es mejor para la identidad del proyecto.

## Diseño visual

Layout **Now Bar**: el track más reciente es un héroe (tapa de 72px, título de
17px), los otros cuatro van como filas compactas de 28px debajo.

La jerarquía se resuelve por estructura, no por tipografía. En una lista
uniforme el nombre del track y el artista pelean por la misma jerarquía en
cada fila; acá el elemento dominante es el más reciente, que es lo que
alguien quiere saber al mirar la card.

Explorado en `design/` como canvas de tres direcciones (Stacked, Now Bar,
Contact Sheet).

El layout es original del proyecto. Cualquier parecido funcional con otras
cards del rubro es el resultado de listar canciones con su tapa, no una
reimplementación: nada de este código se deriva de otro proyecto.

Paleta, para las dos variantes:

| rol | oscuro | claro |
|---|---|---|
| fondo | `#14141a` | `#fbfbfc` |
| borde | `#26262f` | `#e6e6ea` |
| título | `#f2f2f5` | `#17171c` |
| artista | `#9a9aa8` | `#5c5c68` |
| meta | `#6b6b7a` | `#8a8a96` |
| divisor | `#22222b` | `#ececf0` |
| marca | `#1db954` | `#1db954` |

Tipografía: solo el stack del sistema (`-apple-system, BlinkMacSystemFont,
"Segoe UI", Roboto, Helvetica, Arial, sans-serif`). Una webfont exigiría
embeber la fuente entera como data URI en cada card.

## Arquitectura

```
action.yml           contrato: inputs, outputs, runs
src/
  spotify.mjs        refresh del token + recently-played
  art.mjs            descarga de tapas → data URI
  render/
    card.mjs         layout Now Bar → string SVG
    theme.mjs        paletas
    measure.mjs      estimación de ancho y truncado
  i18n/
    index.mjs        carga de locale + tiempos relativos
    en.json es.json  strings estáticos
  publish.mjs        commit a la rama preservando lo ajeno
  main.mjs           orquesta; mapea errores a resultados de la Action
dist/index.js        bundle de ncc, commiteado
```

**Bundle commiteado.** Las Actions JS no corren `npm install`: el runtime
ejecuta un archivo y nada más. La alternativa es una Docker action, mucho más
lenta de arrancar. Va `ncc`, con un job de CI que falla si `dist/` quedó
desactualizado respecto de `src/` — es el error clásico del rubro y se
previene con un check, no con disciplina.

**Cero dependencias de runtime.** Node 20+ trae `fetch`, `Intl` y `Buffer`.
El SVG se arma con templates de string. Además de dejar el bundle en decenas
de KB (el bundle final pesa 15 KB), evita que el árbol de dependencias sea
superficie de ataque en una
Action que maneja tokens de Spotify ajenos.

**Versionado con tag móvil.** Se publica `v1.0.0` y `v1` se mueve para
apuntar ahí.

## Contrato

### Inputs

| input | requerido | default | notas |
|---|---|---|---|
| `client-id` | sí | | |
| `client-secret` | sí | | |
| `refresh-token` | sí | | |
| `count` | no | `5` | 1–10 |
| `theme` | no | `both` | `both` \| `dark` \| `light` |
| `lang` | no | `en` | cualquier locale de `Intl` |
| `output-dir` | no | `.vinilo` | directorio de staging |
| `filename` | no | `vinilo` | sin extensión |
| `publish-to` | no | `""` | rama; vacío = solo escribe archivos |

### Outputs

| output | notas |
|---|---|
| `paths` | archivos generados, separados por coma |
| `track-count` | cuántos tracks entraron en la card |

### Archivos generados

Con `theme: both`, `<filename>.svg` (claro) y `<filename>-dark.svg`. Con un
tema solo, un `<filename>.svg` con ese tema. El usuario combina los dos con
`<picture>`:

```html
<picture>
  <source media="(prefers-color-scheme: dark)"
          srcset="https://raw.githubusercontent.com/USER/USER/vinilo/vinilo-dark.svg">
  <img src="https://raw.githubusercontent.com/USER/USER/vinilo/vinilo.svg">
</picture>
```

Se eligieron dos archivos en vez de un solo SVG con
`@media (prefers-color-scheme: dark)` embebido: el soporte de media queries
dentro de un SVG servido como `<img>` es bueno pero no universal, y cuando
falla el usuario ve el tema equivocado sin ninguna pista de por qué. Dos
archivos funcionan en todos lados.

## Flujo

1. Canjear el refresh token por un access token.
2. `GET /v1/me/player/recently-played?limit=<count>`.
3. Bajar la tapa de cada track en su tamaño más chico y pasarla a data URI.
4. Renderizar uno o dos SVG.
5. Si hay `publish-to`, commitear a esa rama.

No hay llamada a `/v1/me`: el layout Now Bar no muestra avatar ni nombre. El
único scope necesario es `user-read-recently-played`.

`output-dir` es un directorio de staging en el workspace del usuario, y por
defecto es `.vinilo` y no `dist` justamente para no confundirse con el `dist/`
de este repo, que es el bundle de ncc.

Las tapas van embebidas porque el SVG se sirve desde
`raw.githubusercontent.com`, donde no hay nada que sirva las imágenes.

## Manejo de errores

**Regla que define el proyecto: una falla transitoria nunca reemplaza una card
buena por una rota.**

| causa | resultado |
|---|---|
| Refresh token revocado, credenciales mal | `setFailed` — la corrida sale roja |
| 429, red caída, 5xx de Spotify | `warning`, no publica, corrida verde |
| Sin reproducciones recientes | `warning`, no publica |
| Una tapa no bajó | placeholder en esa fila, publica igual |

Si Spotify no responde, no se publica nada y la card que ya está en la rama
sigue mostrando lo último bueno. Solo se falla ruidosamente cuando la causa es
del usuario y requiere que actúe.

Este es exactamente el modo de falla que motivó el proyecto: un servicio
perdió una autorización y el perfil quedó mostrando un cartel de error.

## Publicación a la rama

`publish.mjs` commitea a la rama indicada **preservando los archivos que ya
estén ahí**.

Sin eso, un usuario que ya publica el snake de contribuciones en la misma rama
vería cómo cada workflow le borra los archivos del otro en cada corrida. Es un
bug real y silencioso —observado en un perfil de producción el 2026-09-09—, y
la Action lo vuelve imposible en vez de documentarlo y confiar en que alguien
lea.

Si la rama no existe, se crea huérfana.

## i18n

Los tiempos relativos salen de `Intl.RelativeTimeFormat`, que viene en Node:

```js
new Intl.RelativeTimeFormat(lang, { numeric: "auto" }).format(-2, "hour")
// en → "2 hours ago"   es → "hace 2 horas"   ja → "2 時間前"
```

Los archivos de locale solo llevan los strings estáticos (`recentlyPlayed`,
`nothingRecent`). Sumar un idioma es copiar `en.json`, traducir dos líneas y
abrir un PR. Un locale desconocido cae a `en` con un warning.

**RTL queda fuera de v1, y el README lo dice.** Árabe y hebreo necesitan
invertir el layout —tapa a la derecha, `text-anchor` al revés—, que es trabajo
de diseño y no una traducción. Aceptar `ar.json` sin invertir el layout
entregaría algo roto aparentando soporte.

## Testing

El render es una función pura: `(tracks, opts) => string`. La mayor parte del
proyecto se testea con snapshots, sin red.

- **Render**: snapshots de SVG desde fixtures de tracks. Casos límite —
  títulos de 1 y 80 caracteres, CJK, emoji, un solo track, `count` en el tope.
- **Cliente de Spotify**: `fetch` mockeado, incluidos 429 y token vencido.
- **Publicación**: repo temporal de git; se verifica que un archivo ajeno
  preexistente sobreviva al commit.
- **i18n**: los locales tienen las mismas claves que `en.json`.
- **CI**: `dist/` regenerado y comparado; falla si quedó desactualizado.

### El punto débil, que es inherente

**No se puede medir texto con exactitud.** El SVG se renderiza en la máquina
del lector con *su* fuente de sistema; al generarlo no se sabe si va a caer
Segoe UI, Roboto o Helvetica, y sus métricas difieren. Cualquier estimador de
ancho es aproximado por definición, y no hay estimador que arregle eso.

La mitigación no es medir mejor, es **no depender de acertar**: cada bloque de
texto va dentro de un `clipPath`. El truncado con "…" es la vía elegante; el
clip es la red que garantiza que un título largo se corte en el borde en vez
de desbordar sobre el timestamp. Los tests cubren los extremos y verifican que
ningún texto exceda su caja.

## Fuera de alcance en v1

**El wizard de alta.** Un sitio que guía el OAuth, devuelve el refresh token y
—vía GitHub OAuth— carga los tres secrets en el repo del usuario de un click.
Bajaría el alta de unos quince minutos a unos dos.

Debe **tocar el token en tránsito y no guardarlo nunca**, o el proyecto pierde
su razón de ser.

Va en un repo aparte, con su propio deploy: si vive acá, se mezcla el código
que corre en las máquinas de los usuarios con el de un servicio web, y la
Action tiene que poder auditarse sola. Se linkean desde los READMEs.

La propiedad que hay que preservar es que **el wizard se pueda caer sin que
nadie pierda su card**: solo se complica el alta de gente nueva. La
arquitectura demuestra la tesis en vez de afirmarla.

**RTL.** Ver i18n.

**Elegir layout.** Los otros dos diseños explorados (Stacked, Contact Sheet)
quedan en `design/`. Publicar uno solo y bien vale más que tres a medias.

**Now playing.** Mostrar lo que suena en este momento pediría el scope
`user-read-currently-playing` y una card que se actualiza cada dos horas
mentiría sobre el "ahora". Encaja con el modelo hosteado, no con este.
