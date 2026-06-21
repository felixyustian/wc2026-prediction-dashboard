#!/usr/bin/env node
/**
 * update-results.mjs  —  API-Football (API-SPORTS) edition
 * ------------------------------------------------------------
 * Fetches finished 2026 World Cup GROUP-stage matches and rewrites
 * results.json in the schema the dashboard expects:
 *   { updated, source, results:[ {g,h,a,hs,as}, ... ] }
 *
 * PROVIDER: API-Football (https://www.api-football.com)
 *   World Cup = league 1, season 2026. One call returns all 104 fixtures.
 *   1. Create a free account, copy your key.
 *   2. Set env var API_FOOTBALL_KEY (locally or as a GitHub Actions secret).
 *   Free tier = ~100 requests/day; this script uses ONE request per run.
 *
 * Direct API-SPORTS host (default):
 *   https://v3.football.api-sports.io  + header  x-apisports-key
 * If you instead subscribed via RapidAPI, set:
 *   API_FOOTBALL_HOST=v3.football.api-sports.io   (or the RapidAPI host)
 *   and switch the header block below to x-rapidapi-key / x-rapidapi-host.
 *
 * DESIGN NOTE: API-Football's fixture `round` is "Group Stage - 1"
 * (the matchday), NOT the group letter. So we derive the group from the
 * team via TEAM_GROUP — more reliable, and it naturally filters out
 * knockout matches (home & away won't share a group).
 *
 * DEFENSIVE: on any fetch error or zero finished matches, results.json is
 * left untouched so a bad run never wipes data. Unresolved team names are
 * logged loudly and skipped rather than written as rows the app can't match.
 * ------------------------------------------------------------
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dir, "..", "results.json");

const KEY  = process.env.API_FOOTBALL_KEY || "";
const HOST = process.env.API_FOOTBALL_HOST || "v3.football.api-sports.io";
const URL  = `https://${HOST}/fixtures?league=1&season=2026`;

/* ---- group membership: team -> group letter (KEEP IN SYNC with the app) ---- */
const GROUPS = {
  A: ["Mexico","South Africa","South Korea","Czechia"],
  B: ["Canada","Bosnia & H.","Qatar","Switzerland"],
  C: ["Brazil","Morocco","Haiti","Scotland"],
  D: ["USA","Paraguay","Australia","Turkiye"],
  E: ["Germany","Curacao","Ivory Coast","Ecuador"],
  F: ["Netherlands","Japan","Sweden","Tunisia"],
  G: ["Iran","New Zealand","Belgium","Egypt"],
  H: ["Spain","Cape Verde","Saudi Arabia","Uruguay"],
  I: ["France","Senegal","Iraq","Norway"],
  J: ["Argentina","Algeria","Austria","Jordan"],
  K: ["Portugal","DR Congo","Uzbekistan","Colombia"],
  L: ["England","Croatia","Ghana","Panama"],
};
const KNOWN_TEAMS = new Set(Object.values(GROUPS).flat());
const TEAM_GROUP = {};
for (const [g, teams] of Object.entries(GROUPS)) for (const t of teams) TEAM_GROUP[t] = g;

/* ---- map provider names -> app names ---- */
const NAME_MAP = {
  "Korea Republic": "South Korea", "South Korea": "South Korea", "Korea, South": "South Korea", "Republic of Korea": "South Korea",
  "Türkiye": "Turkiye", "Turkey": "Turkiye", "Turkiye": "Turkiye",
  "Côte d'Ivoire": "Ivory Coast", "Cote d'Ivoire": "Ivory Coast", "Ivory Coast": "Ivory Coast",
  "IR Iran": "Iran", "Iran": "Iran",
  "Bosnia and Herzegovina": "Bosnia & H.", "Bosnia & H.": "Bosnia & H.", "Bosnia-Herzegovina": "Bosnia & H.",
  "Czech Republic": "Czechia", "Czechia": "Czechia",
  "DR Congo": "DR Congo", "Congo DR": "DR Congo", "Democratic Republic of Congo": "DR Congo", "Congo": "DR Congo",
  "Cape Verde": "Cape Verde", "Cabo Verde": "Cape Verde", "Cape Verde Islands": "Cape Verde",
  "United States": "USA", "USA": "USA", "United States of America": "USA",
  "Curaçao": "Curacao", "Curacao": "Curacao",
};
const fold = (s) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
function norm(n) {
  if (NAME_MAP[n]) return NAME_MAP[n];
  const f = fold(n);
  if (NAME_MAP[f]) return NAME_MAP[f];
  if (KNOWN_TEAMS.has(n)) return n;
  if (KNOWN_TEAMS.has(f)) return f;
  return n; // unresolved -> flagged in validation
}

const FINISHED = new Set(["FT", "AET", "PEN"]);

async function fetchMatches() {
  if (!KEY) throw new Error("API_FOOTBALL_KEY not set");
  const res = await fetch(URL, {
    headers: { "x-apisports-key": KEY },
    // RapidAPI users: replace the line above with:
    // headers: { "x-rapidapi-key": KEY, "x-rapidapi-host": HOST },
  });
  if (!res.ok) throw new Error(`API-Football ${res.status}: ${await res.text()}`);
  const data = await res.json();
  if (data.errors && Object.keys(data.errors).length) {
    throw new Error(`API-Football errors: ${JSON.stringify(data.errors)}`);
  }
  return (data.response || [])
    .filter((f) => FINISHED.has(f.fixture?.status?.short))
    .map((f) => ({
      homeName: f.teams?.home?.name,
      awayName: f.teams?.away?.name,
      homeScore: f.goals?.home,
      awayScore: f.goals?.away,
    }))
    .filter((m) => m.homeName && m.awayName &&
                   Number.isInteger(m.homeScore) && Number.isInteger(m.awayScore));
}

function toResults(raw) {
  const out = [], unresolved = [];
  for (const m of raw) {
    const h = norm(m.homeName), a = norm(m.awayName);
    if (!KNOWN_TEAMS.has(h) || !KNOWN_TEAMS.has(a)) {
      unresolved.push(`"${m.homeName}"->"${h}" vs "${m.awayName}"->"${a}"`);
      continue;
    }
    const g = TEAM_GROUP[h];
    if (TEAM_GROUP[a] !== g) continue; // not a group match (knockout) — skip
    out.push({ g, h, a, hs: m.homeScore, as: m.awayScore });
  }
  if (unresolved.length) {
    console.warn("⚠️  UNRESOLVED team names — skipped (add to NAME_MAP):");
    unresolved.forEach((u) => console.warn("   • " + u));
  }
  return out;
}

async function main() {
  let raw;
  try { raw = await fetchMatches(); }
  catch (e) { console.error("Fetch failed, results.json unchanged:", e.message); process.exit(0); }

  if (!raw.length) { console.log("No finished matches returned; results.json unchanged."); process.exit(0); }

  const results = toResults(raw);
  if (!results.length) { console.log("No resolvable group results; results.json unchanged."); process.exit(0); }

  const today = new Date().toISOString().slice(0, 10);
  const payload = { updated: today, source: "API-Football (league 1, season 2026)", results };
  const next = JSON.stringify(payload, null, 2) + "\n";

  let prev = "";
  try { prev = readFileSync(OUT, "utf8"); } catch {}
  if (prev.trim() === next.trim()) { console.log("No change in results."); process.exit(0); }

  writeFileSync(OUT, next);
  console.log(`Wrote ${results.length} finished group matches to results.json (${today}).`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();

export { norm, fold, NAME_MAP, KNOWN_TEAMS, TEAM_GROUP, toResults, fetchMatches };
