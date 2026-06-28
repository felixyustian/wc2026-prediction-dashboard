# ⚽ World Cup 2026 — Prediction Engine

Interactive, single-page dashboard that estimates **win/draw/loss for all 72 group matches**, runs a **client-side Monte-Carlo** forecast of every team's run to the final, and now tracks the **knockout bracket** live from the Round of 32 onward — with real results conditioning, in-play scores, and a daily auto-update pipeline that needs **no API key**.

> All probabilities are **model estimates** derived from Elo ratings — not predictions. Completed matches are locked from data and replayed as fixed outcomes; upcoming ties show the model's single-match win probability.

## Features

- **Match Predictions** — win/draw/loss for every group match; finished matches show as FINAL and feed the simulation.
- **Match Preview** — upcoming fixtures with current form and the most likely scoreline.
- **Knockout Bracket** — the real Round of 32 (top two per group + eight best thirds) with Elo single-match win probabilities; completed ties lock with FT/AET/PEN, later rounds fill in as winners are decided.
- **Find** — search teams, groups, matches; filter by group, matchday, or **date**.
- **Group & Tournament odds** — Monte-Carlo advancement and title odds, conditioned on real results.
- **Live now** — a banner + header pill surface in-progress matches; in-play minute and score overlay onto Preview and bracket cards.
- **PNG / PDF export** of any tab.

## Structure

```
.
├── index.html                          # the whole app (data + model + UI + export + live poller)
├── results.json                        # finished group matches, locked into the sim
├── knockout.json                       # knockout bracket (R32–Final), ties + results
├── scripts/update-results.mjs          # keyless ESPN updater → results.json
├── scripts/update-knockout.mjs         # keyless ESPN updater → knockout.json
├── api/live.js                         # Vercel serverless proxy for live in-play scores (keyless)
├── .github/workflows/update-results.yml# cron → runs both updaters → commits → Vercel redeploys
├── vercel.json · package.json · LICENSE · .gitignore
```

## The model

Each team has an Elo rating, which feeds a Poisson goal model to produce win/draw/loss probabilities per group match (host nations get a home-advantage bump in their own country). A Monte-Carlo simulation then plays the whole tournament thousands of times — sampling group scorelines, ranking the groups, selecting the eight best third-placed teams, filling the bracket, and playing every knockout round — and the odds shown are how often each outcome occurred. Knockout ties use a no-draw Elo coin flip with extra time and penalties folded in.

It conditions on reality: completed matches are loaded from `results.json` / `knockout.json` and replayed as fixed outcomes, so the forecast tightens as the tournament unfolds.

**What it is not:** an oracle. It ignores injuries, form, squad news, fatigue, travel, and tactics, and re-running the simulation wobbles the numbers by a few tenths of a percent — the honest margin of a Monte-Carlo estimate.

## Data pipeline (keyless)

Provider: **ESPN's public FIFA World Cup scoreboard** (`fifa.world`) — no API key, no cost.

- `scripts/update-results.mjs` fetches finished group matches and writes `results.json` (group derived from the team, so knockout games are skipped).
- `scripts/update-knockout.mjs` fetches knockout fixtures and writes `knockout.json` (rounds R32–Final, scores, penalties).
- The GitHub Actions workflow runs both on a schedule, commits any changes, and the commit redeploys the site on Vercel.
- Both scripts are defensive: on a fetch error or empty result they leave the JSON untouched, so a bad run never wipes data. Unresolved team names are logged and skipped.

Run manually any time:

```bash
node scripts/update-results.mjs
node scripts/update-knockout.mjs
```

> ESPN's endpoint is unofficial and may change without notice. The scripts fail safe; the hand-seeded bracket survives until the feed carries the knockout fixtures.

## Live in-play overlay

`api/live.js` is a Vercel serverless function that proxies ESPN's live scoreboard (no key required) and edge-caches the response. The dashboard polls same-origin `/api/live` every 30s and overlays minute + score on Preview and bracket cards, plus a "Live now" banner. If the proxy isn't reachable, it fails silently and the dashboard stays model-only.

## Deploy

Static site + a serverless function, no build step. Connect the repo to Vercel; pushes to the **production branch** auto-deploy. No secrets or environment variables are required — the whole pipeline is keyless.

## License

MIT. Not affiliated with FIFA or ESPN. For analysis and entertainment, not betting advice.
