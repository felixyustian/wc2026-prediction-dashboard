# ⚽ World Cup 2026 — Prediction Engine

Interactive, single-page dashboard that estimates **win/draw/loss for all 72 group matches** and runs a **client-side Monte-Carlo** forecast of every team's run to the final — now with **live results conditioning, a match-preview tab, global search**, and an **optional live in-play overlay**.

> All probabilities are **model estimates** from Elo ratings, not predictions. Completed matches are locked from `results.json`; the knockout bracket is simulated, not predicted.

## Features

- **Match Predictions** — W/D/L per group match; finished matches shown as FINAL and fed into the simulation.
- **Match Preview** — upcoming fixtures with current form and the most likely scoreline.
- **Find** — search teams, groups, and matches across every tab.
- **Group & Tournament odds** — Monte-Carlo advancement and title odds, conditioned on real results.
- **Live overlay (optional)** — if the `/api/live` proxy is deployed, Preview cards show in-play minute + score.
- **PNG / PDF export** of any tab.

## Structure

```
.
├── index.html                       # the whole app (data + model + UI + export + live poller)
├── results.json                     # finished matches, locked into the sim
├── scripts/update-results.mjs       # cron updater — fetches finished matches from API-Football
├── api/live.js                      # OPTIONAL Vercel serverless proxy for live in-play scores
├── .github/workflows/update-results.yml   # daily cron → commits results.json → Vercel redeploys
├── vercel.json · package.json · LICENSE · .gitignore
```

## Data pipeline (results)

Provider: **API-Football** (`league=1, season=2026`). One request returns all 104 fixtures; the script keeps finished group matches and derives each match's group from the team (API-Football's `round` is the matchday, not the group letter).

1. Free key → https://www.api-football.com (free tier ≈ 100 requests/day; this uses ~5/day).
2. Add it as repo secret **`API_FOOTBALL_KEY`** (Settings → Secrets and variables → Actions).
3. The workflow runs 5×/day and commits `results.json` only when something changed; the commit redeploys the site.
4. Run manually any time: `API_FOOTBALL_KEY=yourkey node scripts/update-results.mjs`

Unresolved team names are logged loudly and skipped (never written as rows the app can't match).

## Live in-play overlay (optional)

`api/live.js` is a Vercel serverless function that proxies API-Football's `live=all` server-side (key stays hidden) and edge-caches for 30s. The dashboard polls `/api/live` every 60s and overlays minute + score on Preview cards. If the proxy isn't deployed, the fetch fails silently and Preview stays model-only.

Set `API_FOOTBALL_KEY` in **Vercel → Settings → Environment Variables** for this to work.

**Rate-limit reality:** the free API-Football tier (~100/day) cannot sustain all-day 30s live polling (~720/day). Either raise the cache to `s-maxage=300` for "near-live" (~72/day, stays free), upgrade to API-Football Pro (~$19/mo), or only poll during actual match windows.

## Deploy

Static site + serverless function, no build step. Connect the repo to Vercel; pushes to the **production branch** auto-deploy. Set `API_FOOTBALL_KEY` as a Vercel env var (for `/api/live`) and as a GitHub Actions secret (for the cron).

## License

MIT. Not affiliated with FIFA or API-Football.
