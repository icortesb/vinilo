# vinilo

What you're playing on Spotify right now, and what you played before, as an SVG
in your GitHub README.

<picture>
  <source media="(prefers-color-scheme: dark)"
          srcset="https://raw.githubusercontent.com/icortesb/icortesb/output/vinilo-dark.svg">
  <img src="https://raw.githubusercontent.com/icortesb/icortesb/output/vinilo.svg" width="400">
</picture>

## Why another one

The Spotify cards for READMEs all work the same way: a central service stores
your refresh token, and your README points at a URL on that service. That has
two problems, and neither is hypothetical.

**When the service goes down, your profile shows a broken card** — and you find
out late, because nobody reads their own README. **And someone else holds your
token**, a long-lived one, to draw a picture.

vinilo doesn't run on a server. It's a GitHub Action: it builds the SVG in
**your** Actions and commits it to **your** branch. Nothing can go down, there's
no shared rate limit, and the token never leaves your repository secrets.

The price is a few minutes of setup instead of pasting a URL. Worth it.

## Usage

```yaml
name: vinilo
on:
  schedule: [{ cron: "*/15 * * * *" }]
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

Then in your README:

```html
<a href="https://open.spotify.com/user/YOUR_SPOTIFY_ID">
  <picture>
    <source media="(prefers-color-scheme: dark)"
            srcset="https://raw.githubusercontent.com/USER/USER/vinilo/vinilo-dark.svg">
    <img src="https://raw.githubusercontent.com/USER/USER/vinilo/vinilo.svg" width="400">
  </picture>
</a>
```

The `<a>` is optional: it makes the whole card link to your Spotify profile.
Get the URL from the Spotify app → your profile → ⋯ → Share → Copy link.

**Why one link and not one per track.** GitHub serves README SVGs as images,
and links inside an image don't work. Per-track links would mean splitting the
card into several images whose links change on every run — which needs either
rewriting your README or hosting redirects on Pages. Both are moving parts that
can break silently, and vinilo exists to not have those.

## Credentials

You need a Spotify app and a refresh token. Once, five minutes.

1. Create an app at [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard).
   Redirect URI: `http://127.0.0.1:8888/callback` (Spotify no longer accepts
   `localhost` for new apps, it has to be the IP). Check **Web API**.
2. Copy the **Client ID** and **Client secret**.
3. Get the refresh token:

   ```sh
   npx github:icortesb/vinilo auth
   ```

   It opens your browser, you authorize, and it prints the three
   `gh secret set` commands ready to paste. It asks for two read-only scopes:
   `user-read-recently-played` and `user-read-currently-playing`.

4. Add `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` and
   `SPOTIFY_REFRESH_TOKEN` as repository secrets.

## Inputs

| input | required | default | |
|---|---|---|---|
| `client-id` | yes | | |
| `client-secret` | yes | | |
| `refresh-token` | yes | | `user-read-recently-played` + `user-read-currently-playing` scopes |
| `count` | no | `5` | 1–10 |
| `theme` | no | `both` | `both`, `dark`, `light` |
| `lang` | no | `en` | any locale `Intl` understands |
| `output-dir` | no | `.vinilo` | where to write inside the workspace |
| `filename` | no | `vinilo` | base name, no extension |
| `publish-to` | no | — | branch to commit to. Empty: write files only |

With `theme: both` you get `vinilo.svg` and `vinilo-dark.svg`. With a single
theme, one `vinilo.svg` in that theme.

## Things that matter

**Now playing beats recently played.** Spotify only adds a track to your
history once it ends, so a card built from history alone is always behind.
vinilo also asks what's playing right now: if something is, it becomes the top
of the card — with a small animated equalizer and the album instead of a
timestamp — and the oldest track drops off, so the card keeps its height.
Paused doesn't count. For this to show up at all, the workflow has to run
often — see [Keeping it fresh](#keeping-it-fresh).

**Upgrading from a token without the second scope?** Nothing breaks: the card
keeps showing recently played, and the run ends with a warning telling you
which scope is missing. Run `npx github:icortesb/vinilo auth` again and replace
`SPOTIFY_REFRESH_TOKEN`.

**It coexists with other Actions on the same branch.** If you already publish
the contribution snake to the branch you pass to `publish-to`, its files are
preserved. vinilo writes its own and touches nothing else.

**A transient failure never breaks your card.** If Spotify returns 429, if the
network drops, or if you haven't listened to anything lately, the Action
**doesn't publish** and finishes with a warning. The card already on the branch
keeps showing the last good state. It only fails red when the cause is yours
and you have to act: a revoked refresh token or wrong credentials.

**Times translate themselves.** `lang: es` gives "hace 2 horas", `lang: ja`
gives "2 時間前". It comes from `Intl`, so it works with any locale even when
there's no translation for the fixed strings.

**GitHub caches images for about 5 minutes.** If you just ran the workflow and
still see the old card, give it a moment.

## Keeping it fresh

**GitHub doesn't run schedules on time.** `schedule` is best effort: runs get
delayed by tens of minutes and, on busy hours, silently dropped. A `*/15` cron
can go an hour without running, and a 2-hour one can end up running every 4 or
5\. That's fine for stats; it defeats "now playing".

`workflow_dispatch` runs, on the other hand, start within seconds. So the fix
is to have an external cron trigger the workflow, and keep `schedule` as a
fallback. Any cron that can send a POST works; this uses the free
[cron-job.org](https://cron-job.org).

1. Create a [fine-grained token](https://github.com/settings/personal-access-tokens/new):
   **Only select repositories** → the repo with the workflow;
   **Repository permissions → Actions: Read and write**. Nothing else.
2. In cron-job.org, create a cronjob:
   - **URL:** `https://api.github.com/repos/USER/REPO/actions/workflows/vinilo.yml/dispatches`
     (use your workflow's file name)
   - **Schedule:** every 15 minutes
   - **Advanced → Request method:** `POST`
   - **Headers:**
     `Authorization: Bearer YOUR_TOKEN`,
     `Accept: application/vnd.github+json`,
     `Content-Type: application/json`
   - **Request body:** `{"ref":"main"}` (your default branch)
3. Test it: GitHub answers `204` and a run appears in the Actions tab.

About that token: yes, a third party now holds one, which is what the start of
this README warns against. The difference is what it can do. It can't read
your code or your Spotify: at worst it triggers your workflow more often than
you'd like. If cron-job.org goes away, your card doesn't break — it just goes
back to GitHub's pace.

## Not supported yet

**RTL.** Arabic and Hebrew need a mirrored layout — art on the right, reversed
alignment — which is design work, not a translation. I'd rather say no than
accept an `ar.json` and ship something broken that pretends to support it.

## Adding a language

Copy `src/i18n/en.json`, translate the two strings, and add it to the map in
`src/i18n/index.mjs`. Relative times need no translation.

Note: the source comments are in Spanish.

## License

MIT
