#!/usr/bin/env node
/**
 * update-results.mjs
 * ------------------------------------------------------------
 * Fetches finished 2026 World Cup matches and rewrites results.json
 * in the schema the dashboard expects:
 *   { updated, source, results:[ {g,h,a,hs,as}, ... ] }
 *
 * DEFAULT PROVIDER: football-data.org (free tier, needs a token).
 *   1. Get a free key at https://www.football-data.org/client/register
 *   2. Confirm your plan covers the World Cup competition (code "WC").
 *   3. Set env var FD_API_TOKEN (locally or as a GitHub Actions secret).
 *
 * The script is DEFENSIVE: if the fetch fails or returns zero finished
 * matches, it leaves results.json untouched so a bad run never wipes data.
 *
 * SWAP PROVIDERS: replace fetchMatches() with your own; just return an
 * array of { groupLetter, homeName, awayName, homeScore, awayScore }.
 * Keep NAME_MAP in sync so provider names resolve to the dashboard names.
 * ------------------------------------------------------------
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dir, "..", "results.json");

const FD_TOKEN = process.env.FD_API_TOKEN || "";
const FD_COMP  = process.env.FD_COMPETITION || "WC";   // football-data competition code
const FD_URL   = `https://api.football-data.org/v4/competitions/${FD_COMP}/matches?status=FINISHED`;

/* Map provider team names -> dashboard names (must match GROUPS/ELO keys). */
const NAME_MAP = {
  "Korea Republic": "South Korea", "South Korea": "South Korea",
  "Türkiye": "Turkiye", "Turkey": "Turkiye", "Turkiye": "Turkiye",
  "Côte d'Ivoire": "Ivory Coast", "Cote d'Ivoire": "Ivory Coast", "Ivory Coast": "Ivory Coast",
  "IR Iran": "Iran", "Iran": "Iran",
  "Bosnia and Herzegovina": "Bosnia & H.", "Bosnia & H.": "Bosnia & H.",
  "Czech Republic": "Czechia", "Czechia": "Czechia",
  "DR Congo": "DR Congo", "Congo DR": "DR Congo",
  "Cape Verde": "Cape Verde", "Cabo Verde": "Cape Verde",
  "United States": "USA", "USA": "USA", "United States of America": "USA",
  "Curaçao": "Curacao", "Curacao": "Curacao",
  // identity entries (everyone else passes straight through if already correct)
};
const norm = (n) => NAME_MAP[n] || n;
const groupLetter = (g) => (g ? String(g).replace(/GROUP[_ ]?/i, "").trim().toUpperCase() : null);

async function fetchMatches() {
  if (!FD_TOKEN) throw new Error("FD_API_TOKEN not set");
  const r = await fetch(FD_URL, { headers: { "X-Auth-Token": FD_TOKEN } });
  if (!r.ok) throw new Error(`football-data ${r.status}: ${await r.text()}`);
  const data = await r.json();
  return (data.matches || [])
    .filter((m) => m.stage === "GROUP_STAGE" && m.score?.fullTime)
    .map((m) => ({
      groupLetter: groupLetter(m.group),
      homeName: m.homeTeam?.name,
      awayName: m.awayTeam?.name,
      homeScore: m.score.fullTime.home,
      awayScore: m.score.fullTime.away,
    }))
    .filter((m) => m.groupLetter && m.homeName && m.awayName &&
                   Number.isInteger(m.homeScore) && Number.isInteger(m.awayScore));
}

function toResults(raw) {
  return raw.map((m) => ({
    g: m.groupLetter,
    h: norm(m.homeName),
    a: norm(m.awayName),
    hs: m.homeScore,
    as: m.awayScore,
  }));
}

async function main() {
  let raw;
  try {
    raw = await fetchMatches();
  } catch (e) {
    console.error("Fetch failed, leaving results.json unchanged:", e.message);
    process.exit(0); // exit 0 so the workflow doesn't fail the whole run
  }
  if (!raw.length) {
    console.log("No finished group matches returned; results.json unchanged.");
    process.exit(0);
  }
  const results = toResults(raw);
  const today = new Date().toISOString().slice(0, 10);
  const payload = { updated: today, source: `football-data.org (${FD_COMP})`, results };

  let prev = "";
  try { prev = readFileSync(OUT, "utf8"); } catch {}
  const next = JSON.stringify(payload, null, 2) + "\n";
  if (prev.trim() === next.trim()) {
    console.log("No change in results.");
    process.exit(0);
  }
  writeFileSync(OUT, next);
  console.log(`Wrote ${results.length} finished matches to results.json (${today}).`);
}

main();
