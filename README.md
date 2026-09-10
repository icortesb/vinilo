# vinilo

Tus reproducciones recientes de Spotify como un SVG en tu README de GitHub.

<!-- Reemplazá USER por tu usuario cuando lo pongas en tu perfil. -->
<picture>
  <source media="(prefers-color-scheme: dark)"
          srcset="https://raw.githubusercontent.com/icortesb/icortesb/vinilo/vinilo-dark.svg">
  <img src="https://raw.githubusercontent.com/icortesb/icortesb/vinilo/vinilo.svg" width="400">
</picture>

## Por qué otro más

Las cards de Spotify para READMEs funcionan así: un servicio central guarda tu
refresh token, y tu README apunta a una URL de ese servicio. Eso tiene dos
problemas que no son hipotéticos.

**Cuando el servicio se cae, tu perfil muestra una card rota** — y te enterás
tarde, porque nadie mira su propio README. **Y alguien más custodia tu token**,
que es de larga duración, para dibujar una imagen.

vinilo no corre en ningún servidor. Es una GitHub Action: genera el SVG en
**tus** Actions y lo commitea a una rama **tuya**. No hay servicio que pueda
caerse, no hay rate limit compartido, y el token no sale de los secrets de tu
repo.

El precio es que el alta lleva unos minutos en vez de pegar una URL. Vale la
pena.

## Uso

```yaml
name: vinilo
on:
  schedule: [{ cron: "0 */2 * * *" }]
  workflow_dispatch:

permissions:
  contents: write

jobs:
  card:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: icortesb/vinilo@v1
        with:
          client-id: ${{ secrets.SPOTIFY_CLIENT_ID }}
          client-secret: ${{ secrets.SPOTIFY_CLIENT_SECRET }}
          refresh-token: ${{ secrets.SPOTIFY_REFRESH_TOKEN }}
          publish-to: vinilo
```

Y en tu README:

```html
<picture>
  <source media="(prefers-color-scheme: dark)"
          srcset="https://raw.githubusercontent.com/USER/USER/vinilo/vinilo-dark.svg">
  <img src="https://raw.githubusercontent.com/USER/USER/vinilo/vinilo.svg" width="400">
</picture>
```

## Las credenciales

Hace falta una app de Spotify y un refresh token. Es una vez y son cinco
minutos.

1. Creá una app en [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard).
   Redirect URI: `http://127.0.0.1:8888/callback` (Spotify ya no acepta
   `localhost` en apps nuevas, tiene que ser la IP). Marcá **Web API**.
2. Copiá el **Client ID** y el **Client secret**.
3. Sacá el refresh token:

   ```sh
   npx github:icortesb/vinilo auth
   ```

   Abre el navegador, autorizás, y te imprime los tres `gh secret set` listos
   para pegar. El único scope que pide es `user-read-recently-played`.

4. Cargá `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` y
   `SPOTIFY_REFRESH_TOKEN` como secrets del repo.

## Inputs

| input | requerido | default | |
|---|---|---|---|
| `client-id` | sí | | |
| `client-secret` | sí | | |
| `refresh-token` | sí | | scope `user-read-recently-played` |
| `count` | no | `5` | 1–10 |
| `theme` | no | `both` | `both`, `dark`, `light` |
| `lang` | no | `en` | cualquier locale que entienda `Intl` |
| `output-dir` | no | `.vinilo` | dónde escribir dentro del workspace |
| `filename` | no | `vinilo` | nombre base, sin extensión |
| `publish-to` | no | — | rama donde commitear. Vacío: solo escribe archivos |

Con `theme: both` salen `vinilo.svg` y `vinilo-dark.svg`. Con un tema solo,
un `vinilo.svg` con ese tema.

## Detalles que importan

**Convive con otras Actions en la misma rama.** Si ya publicás el snake de
contribuciones en la rama que le pasás a `publish-to`, sus archivos se
preservan. vinilo escribe los suyos y no toca nada más.

**Una falla transitoria nunca te rompe la card.** Si Spotify devuelve 429, si
la red se cae, o si no escuchaste nada últimamente, la Action **no publica** y
termina con un warning. La card que ya está en la rama sigue mostrando lo
último bueno. Solo falla en rojo cuando la causa es tuya y tenés que actuar:
refresh token revocado o credenciales mal.

**Los tiempos se traducen solos.** `lang: es` da "hace 2 horas", `lang: ja` da
"2 時間前". Sale de `Intl`, así que anda con cualquier locale aunque no haya
traducción para los textos fijos.

**GitHub cachea las imágenes unos 5 minutos.** Si acabás de correr el workflow
y ves la card vieja, esperá un poco.

## Fuera de alcance por ahora

**RTL.** Árabe y hebreo necesitan el layout espejado —tapa a la derecha,
alineación invertida—, que es trabajo de diseño y no una traducción. Prefiero
decir que no antes que aceptar un `ar.json` y entregar algo roto que aparenta
soporte.

## Sumar un idioma

Copiá `src/i18n/en.json`, traducí los dos strings, y agregalo al mapa de
`src/i18n/index.mjs`. Los tiempos relativos no hay que traducirlos.

## Licencia

MIT
