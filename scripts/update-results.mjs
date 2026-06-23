#!/usr/bin/env node
/**
 * update-results.mjs  —  ESPN (keyless) edition
 * ------------------------------------------------------------
 * Fetches finished 2026 World Cup GROUP-stage matches from ESPN's public
 * scoreboard endpoint and rewrites results.json in the dashboard's schema:
 *   { updated, source, results:[ {g,h,a,hs,as}, ... ] }
 *
 * PROVIDER: ESPN hidden scoreboard API — NO API KEY REQUIRED, NO COST.
 *   https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard
 *   The `dates=YYYYMMDD-YYYYMMDD` range returns every match in the window.
 *
 *   ⚠️ UNOFFICIAL: ESPN can change or remove this endpoint without notice.
 *   This script is defensive — on any error, or if nothing parses, it leaves
 *   results.json UNCHANGED so a bad fetch never wipes your data.
 *
 * Group is derived from the team (not from ESPN's fields), which also filters
 * out knockout matches (the two teams won't share a group). Unresolved team
 * names are logged loudly and skipped.
 * ------------------------------------------------------------
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dir, "..", "results.json");

// Whole group stage window. ESPN honours the date range in one call.
const URL =
  "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=20260611-20260628&limit=300";

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

/* ---- map ESPN display names -> app names ---- */
const NAME_MAP = {
  "South Korea":"South Korea","Korea Republic":"South Korea",
  "Czechia":"Czechia","Czech Republic":"Czechia",
  "Türkiye":"Turkiye","Turkey":"Turkiye","Turkiye":"Turkiye",
  "Ivory Coast":"Ivory Coast","Côte d'Ivoire":"Ivory Coast","Cote d'Ivoire":"Ivory Coast",
  "Bosnia and Herzegovina":"Bosnia & H.","Bosnia & Herzegovina":"Bosnia & H.","Bosnia-Herzegovina":"Bosnia & H.",
  "DR Congo":"DR Congo","Congo DR":"DR Congo","Congo":"DR Congo","Democratic Republic of the Congo":"DR Congo",
  "Cape Verde":"Cape Verde","Cabo Verde":"Cape Verde","Cape Verde Islands":"Cape Verde",
  "United States":"USA","USA":"USA",
  "Curaçao":"Curacao","Curacao":"Curacao",
  "IR Iran":"Iran","Iran":"Iran",
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

async function fetchMatches() {
  const res = await fetch(URL, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`ESPN ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const out = [];
  for (const ev of data.events || []) {
    const c = ev.competitions?.[0];
    if (!c) continue;
    const st = c.status?.type || {};
    const finished = st.completed === true || String(st.id) === "3" || st.state === "post";
    if (!finished) continue;
    const comps = c.competitors || [];
    const home = comps.find((x) => x.homeAway === "home");
    const away = comps.find((x) => x.homeAway === "away");
    if (!home || !away) continue;
    const hn = home.team?.name || home.team?.displayName;
    const an = away.team?.name || away.team?.displayName;
    const hs = parseInt(home.score, 10);
    const as = parseInt(away.score, 10);
    if (!hn || !an || Number.isNaN(hs) || Number.isNaN(as)) continue;
    out.push({ homeName: hn, awayName: an, homeScore: hs, awayScore: as });
  }
  return out;
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
  const payload = { updated: today, source: "ESPN (fifa.world)", results };
  const next = JSON.stringify(payload, null, 2) + "\n";

  let prev = "";
  try { prev = readFileSync(OUT, "utf8"); } catch {}
  if (prev.trim() === next.trim()) { console.log("No change in results."); process.exit(0); }

  writeFileSync(OUT, next);
  console.log(`Wrote ${results.length} finished group matches to results.json (${today}).`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();

export { norm, fold, NAME_MAP, KNOWN_TEAMS, TEAM_GROUP, toResults, fetchMatches };
