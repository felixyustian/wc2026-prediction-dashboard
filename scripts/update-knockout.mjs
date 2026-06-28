#!/usr/bin/env node
/**
 * update-knockout.mjs — ESPN (keyless) knockout-stage updater
 * ------------------------------------------------------------
 * Builds knockout.json from ESPN's public FIFA World Cup scoreboard:
 *   { updated, source, rounds:{ R32:[...], R16:[...], QF:[...], SF:[...], TP:[...], F:[...] } }
 *
 * Each tie: { id?, h, a, hs, as, date, venue, city, status, decided?, pens?, adv? }
 *
 * DEFENSIVE: if the fetch fails or ESPN returns no knockout matches, the
 * existing knockout.json is left untouched (so the hand-seeded R32 survives
 * until ESPN actually carries the knockout fixtures).
 *
 * Run alongside update-results.mjs in the daily workflow. No API key.
 * ------------------------------------------------------------
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dir, "..", "knockout.json");
const URL =
  "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=20260628-20260719&limit=120";

const NAME_MAP = {
  "Czech Republic":"Czechia","Korea Republic":"South Korea","Turkey":"Turkiye",
  "Côte d'Ivoire":"Ivory Coast","Bosnia and Herzegovina":"Bosnia & H.","Congo DR":"DR Congo",
  "Cape Verde Islands":"Cape Verde","United States":"USA","Curaçao":"Curacao",
};
const fold = (s) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
const norm = (n) => NAME_MAP[n] || NAME_MAP[fold(n)] || n;

function roundKey(note, typeName) {
  const s = `${note || ""} ${typeName || ""}`.toLowerCase();
  if (/round of 32/.test(s)) return "R32";
  if (/round of 16/.test(s)) return "R16";
  if (/quarter/.test(s)) return "QF";
  if (/semi/.test(s)) return "SF";
  if (/(third|3rd)\s*place/.test(s)) return "TP";
  if (/final/.test(s)) return "F";
  return null;
}

async function fetchEvents() {
  const res = await fetch(URL, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`ESPN ${res.status}`);
  const data = await res.json();
  return data.events || [];
}

function build(events) {
  const rounds = { R32: [], R16: [], QF: [], SF: [], TP: [], F: [] };
  for (const ev of events) {
    const c = ev.competitions?.[0];
    if (!c) continue;
    const rk = roundKey(c.altGameNote || ev.note, c.season?.type?.name || ev.season?.slug);
    if (!rk) continue; // group game or unknown → skip
    const comps = c.competitors || [];
    const home = comps.find((x) => x.homeAway === "home");
    const away = comps.find((x) => x.homeAway === "away");
    if (!home || !away) continue;
    const st = c.status?.type || {};
    const finished = st.completed === true || String(st.id) === "3" || st.state === "post";
    const live = st.state === "in";
    const tie = {
      h: norm(home.team?.name || home.team?.displayName || "TBD"),
      a: norm(away.team?.name || away.team?.displayName || "TBD"),
      date: ev.date ? new Date(ev.date).toUTCString().slice(0, 11).trim() : "",
      venue: c.venue?.fullName || "",
      city: c.venue?.address?.city || "",
      status: finished ? "final" : live ? "live" : "upcoming",
      hs: finished ? (parseInt(home.score, 10) ?? null) : null,
      as: finished ? (parseInt(away.score, 10) ?? null) : null,
    };
    // penalty shootout, if ESPN exposes it
    const hp = home.shootoutScore, ap = away.shootoutScore;
    if (hp != null && ap != null) { tie.pens = [Number(hp), Number(ap)]; tie.adv = hp > ap ? "h" : "a"; }
    else if (finished && tie.hs === tie.as) { tie.adv = home.winner ? "h" : away.winner ? "a" : null; }
    if (finished && /ET|extra|aet/i.test(st.detail || st.shortDetail || "")) tie.decided = "AET";
    rounds[rk].push(tie);
  }
  return rounds;
}

async function main() {
  let events;
  try { events = await fetchEvents(); }
  catch (e) { console.error("Fetch failed, knockout.json unchanged:", e.message); process.exit(0); }

  const rounds = build(events);
  const total = Object.values(rounds).reduce((n, r) => n + r.length, 0);
  if (!total) { console.log("No knockout matches found yet; knockout.json unchanged."); process.exit(0); }

  const payload = {
    updated: new Date().toISOString().slice(0, 10),
    source: "ESPN (fifa.world) — knockout",
    rounds,
  };
  const next = JSON.stringify(payload, null, 2) + "\n";
  if (existsSync(OUT) && readFileSync(OUT, "utf8").trim() === next.trim()) {
    console.log("No change in knockout.json."); process.exit(0);
  }
  writeFileSync(OUT, next);
  const counts = Object.entries(rounds).filter(([, v]) => v.length).map(([k, v]) => `${k}:${v.length}`).join(" ");
  console.log(`Wrote knockout.json (${total} ties — ${counts}).`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();

export { roundKey, build, norm };
