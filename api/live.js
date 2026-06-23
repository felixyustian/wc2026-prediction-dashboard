// api/live.js — Vercel Serverless Function (Node runtime)
// ---------------------------------------------------------------
// Proxies ESPN's public FIFA World Cup scoreboard for in-play matches.
// NO API KEY REQUIRED — ESPN's endpoint is open. The browser polls this
// same-origin /api/live so you don't depend on any third-party CORS.
//
// Drop at  api/live.js  in the repo root. Vercel auto-detects /api/* as
// serverless functions — no env var, no config needed.
//
// Edge-cached 20s so repeated polls collapse into few upstream calls.
// ESPN is unofficial: if it changes/breaks, this returns an error and the
// dashboard's Preview tab simply stays model-only (it fails silently).
// ---------------------------------------------------------------

const URL =
  "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard";

const GROUPS = {
  A:["Mexico","South Africa","South Korea","Czechia"], B:["Canada","Bosnia & H.","Qatar","Switzerland"],
  C:["Brazil","Morocco","Haiti","Scotland"], D:["USA","Paraguay","Australia","Turkiye"],
  E:["Germany","Curacao","Ivory Coast","Ecuador"], F:["Netherlands","Japan","Sweden","Tunisia"],
  G:["Iran","New Zealand","Belgium","Egypt"], H:["Spain","Cape Verde","Saudi Arabia","Uruguay"],
  I:["France","Senegal","Iraq","Norway"], J:["Argentina","Algeria","Austria","Jordan"],
  K:["Portugal","DR Congo","Uzbekistan","Colombia"], L:["England","Croatia","Ghana","Panama"],
};
const TEAM_GROUP = {}; for (const [g,ts] of Object.entries(GROUPS)) for (const t of ts) TEAM_GROUP[t]=g;
const NAME_MAP = { "Czech Republic":"Czechia","Korea Republic":"South Korea","Turkey":"Turkiye",
  "Côte d'Ivoire":"Ivory Coast","Bosnia and Herzegovina":"Bosnia & H.","Congo DR":"DR Congo",
  "Cape Verde Islands":"Cape Verde","United States":"USA","Curaçao":"Curacao" };
const fold = (s)=> (s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim();
const norm = (n)=> NAME_MAP[n] || NAME_MAP[fold(n)] || n;

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "public, s-maxage=20, stale-while-revalidate=15");
  try {
    const r = await fetch(URL, { headers: { accept: "application/json" } });
    if (!r.ok) return res.status(502).json({ error: `upstream ${r.status}` });
    const data = await r.json();
    const live = [];
    for (const ev of data.events || []) {
      const c = ev.competitions?.[0]; if (!c) continue;
      const st = c.status?.type || {};
      if (st.state !== "in") continue;                 // only in-progress matches
      const comps = c.competitors || [];
      const home = comps.find((x) => x.homeAway === "home");
      const away = comps.find((x) => x.homeAway === "away");
      if (!home || !away) continue;
      const h = norm(home.team?.name || home.team?.displayName);
      const a = norm(away.team?.name || away.team?.displayName);
      live.push({
        g: TEAM_GROUP[h] || null, h, a,
        hs: parseInt(home.score, 10) || 0,
        as: parseInt(away.score, 10) || 0,
        minute: c.status?.displayClock || null,        // e.g. "63'"
        status: st.shortDetail || st.description || null,
      });
    }
    return res.status(200).json({ updated: new Date().toISOString(), count: live.length, live });
  } catch (e) {
    return res.status(502).json({ error: String(e?.message || e) });
  }
}
