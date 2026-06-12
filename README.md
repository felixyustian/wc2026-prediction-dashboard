# ⚽ World Cup 2026 — Prediction Engine

An interactive, single-file dashboard that estimates **win / draw / loss probabilities for all 72 group-stage matches** of the 2026 FIFA World Cup and runs a **client-side Monte-Carlo simulation** to forecast each team's run from the Round of 32 to the final.

No backend. No build step. One `index.html` (~36 KB) that runs entirely in the browser, with **PNG and PDF export** built in.

> **These are model estimates, not predictions.** Every number is derived from Elo ratings and a transparent statistical model. The engine knows nothing about injuries, form, squad selection, fatigue, or tactics. See [Caveats](#-caveats-read-this).

---

## ✨ Features

- **Match Predictions** — W/D/L probabilities for every group match, filterable by group and matchday, with host-nation home advantage applied.
- **Group Odds** — each team's simulated chance to win its group and reach the knockout stage.
- **Tournament Odds** — probability of reaching each round (R32 → R16 → QF → SF → Final → Champion), sortable by any column.
- **Live Monte-Carlo** — re-run the whole tournament 2k / 10k / 30k times in-browser; chunked so the UI never freezes.
- **Live results** — finished matches are read from `results.json`, locked to their real score, and fed into the simulation so odds track reality each matchday. A daily GitHub Actions job refreshes the file automatically.
- **Export** — one-click PNG (via `html2canvas`) or multi-page PDF (via `jsPDF`) of any tab.
- **Self-documenting** — a built-in "Model" tab explains exactly how the numbers are produced and what they ignore.

---

## 🧮 Methodology

**1. Team strength (Elo).**
Each of the 48 teams has an Elo rating. The top ~18 are exact figures from [eloratings.net](https://www.eloratings.net/) (19 Jan 2026); the remaining teams are approximations calibrated to the published per-group average Elos.

**2. Single-match model (Elo → Poisson).**
The Elo gap is converted into an expected goal supremacy, split into expected goals (λ) for each side, then a Poisson grid produces win / draw / loss probabilities. Host nations (Mexico, USA, Canada) receive a **+65 Elo home bonus** in their group games, which they all play at home.

```
sup   = clamp((Elo_A − Elo_B) / 200, −2.7, 2.7)
λ_A   = (2.62 + sup) / 2
λ_B   = (2.62 − sup) / 2
P(result) = Σ Poisson(i; λ_A) · Poisson(j; λ_B)   over i,j ∈ [0,9]
```

**3. The bracket is simulated, not predicted.**
Knockout matchups don't exist until the group stage ends (27 Jun 2026), so the engine plays the entire tournament thousands of times:

1. Sample group scorelines → rank each group on points, GD, GF.
2. Select the 8 best third-placed teams; assign them to Round-of-32 slots via constrained backtracking that respects FIFA's group-eligibility rules.
3. Play every knockout round as a no-draw Elo coin-flip (extra time / penalties folded in).
4. Tally how often each team reaches each stage.

The simulation conserves probability exactly — championship odds sum to 100%, and advancement counts sum to 32 teams.

**4. Live results conditioning.**
Finished matches are read from [`results.json`](results.json) and **locked**: they show as `FINAL` with the real score, and the simulation replays them as fixed outcomes instead of sampling. So every matchday pulls the advancement and title odds toward what has actually happened. (Verified: after the Jun 11 openers, Mexico's odds to advance Group A jump to ~98% and South Africa's fall to ~10%, while totals still conserve to 32.)

---

## 🔄 Daily auto-update

The dashboard cannot update itself — a static page has no scheduler. Updates are driven by an automated job that runs **without anyone in the loop**:

```
GitHub Actions cron ──► scripts/update-results.mjs ──► writes results.json
        │                                                     │
        └──────────── git commit + push ──────────────────────┘
                              │
                              ▼
              Vercel git integration auto-redeploys
```

**To enable it:**

1. **Get a results feed.** The default script targets [football-data.org](https://www.football-data.org/) (free tier). Register for a free token and **confirm your plan covers the World Cup competition** (code `WC`). To use a different provider (API-Football, TheSportsDB, etc.), replace `fetchMatches()` in `scripts/update-results.mjs` — it just needs to return `{ groupLetter, homeName, awayName, homeScore, awayScore }` objects.
2. **Add the token as a repo secret:** GitHub repo → Settings → Secrets and variables → Actions → `FD_API_TOKEN`.
3. **Connect the repo to Vercel** (git integration) so each commit redeploys.
4. The workflow in [`.github/workflows/update-results.yml`](.github/workflows/update-results.yml) runs five times a day (UTC) during the group stage and commits `results.json` only when something changed.

**Run it manually any time:**

```bash
FD_API_TOKEN=your_token node scripts/update-results.mjs
```

**No API? Manual fallback.** `results.json` is plain JSON — hand-edit it after each matchday and push:

```json
{ "updated": "2026-06-18",
  "results": [ { "g": "A", "h": "Mexico", "a": "South Korea", "hs": 1, "as": 0 } ] }
}
```

Team names in `results.json` must match the names used in the app (e.g. `South Korea`, `Turkiye`, `Ivory Coast`, `Bosnia & H.`).

> **Note on accuracy:** the built-in feed coverage and team-name spellings vary by provider — verify the first automated run against the real scoreboard and adjust `NAME_MAP` in the script if any team fails to resolve.

---

## ⚠️ Caveats (read this)

- **Not an oracle.** Ignores injuries, current form, squad news, fatigue, travel, and tactics. It's a strength-rating engine, not insider knowledge.
- **Lower-ranked Elo values are approximate.** "Spain 90% to beat Cape Verde" is firm; "Curaçao 4% to advance" is soft.
- **Bracket mapping is approximate.** The knockout tree and third-place slotting reasonably approximate FIFA's official mapping, not the exact 495-combination table from Annex C of the regulations.
- **Monte-Carlo wobble.** Re-running shifts numbers by a few tenths of a percent — that wobble *is* the honest margin of the estimate.
- For analysis/entertainment. **Not betting advice.**

---

## 🚀 Deploy

### Option A — Vercel (one click)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new)

Or from the CLI:

```bash
npm i -g vercel
vercel          # preview deployment
vercel --prod   # public production deployment
```

Vercel auto-detects this as a static site (no framework, no build). `vercel.json` sets clean URLs and basic security headers.

### Option B — any static host

It's a single HTML file. Drop `index.html` on GitHub Pages, Netlify, Cloudflare Pages, S3, or open it locally with a double-click.

### Local preview

```bash
python3 -m http.server 8000
# → http://localhost:8000
```

---

## 📁 Structure

```
.
├── index.html                      # the entire app (data + model + UI + export)
├── results.json                    # actual match results (locked into the sim)
├── vercel.json                     # static config: clean URLs, headers
├── scripts/
│   └── update-results.mjs          # fetches finished matches → rewrites results.json
├── .github/workflows/
│   └── update-results.yml          # daily cron that runs the updater & commits
├── README.md
├── LICENSE                         # MIT
└── .gitignore
```

---

## 🔧 Tech

Vanilla HTML/CSS/JS · [html2canvas](https://html2canvas.hertzen.com/) · [jsPDF](https://github.com/parallax/jsPDF) · Google Fonts (Saira Condensed / Sofia Sans). Zero framework, zero backend, zero tracking.

## 📊 Data sources

- Fixtures, venues, dates: confirmed FIFA 2026 World Cup schedule.
- Elo ratings: [eloratings.net](https://www.eloratings.net/) (Jan 2026).

## 📄 License

MIT — see [LICENSE](LICENSE). Not affiliated with or endorsed by FIFA.
