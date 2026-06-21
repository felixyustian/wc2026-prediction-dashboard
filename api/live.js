// api/live.js — Vercel Serverless Function (Node runtime)
// ---------------------------------------------------------------
// Proxies API-Football's live fixtures for the 2026 World Cup so the
// browser never sees your API key. The dashboard polls THIS endpoint
// (same origin: /api/live), not API-Football directly.
//
// Setup:
//   Vercel → Project → Settings → Environment Variables →
//     API_FOOTBALL_KEY = <your key>   (Production + Preview)
//   Drop this file at  api/live.js  in the repo root. Vercel auto-detects
//   /api/* as serverless functions — no extra config needed.
//
// KEY POINT — edge caching collapses client polls into few upstream calls:
//   The Cache-Control below makes Vercel cache the response for 30s and
//   serve it to ALL visitors. So 100 people polling every 10s still costs
//   ~2 upstream API-Football calls/minute, not 600. See the rate-limit note
//   at the bottom of this file.
// ---------------------------------------------------------------

const HOST = process.env.API_FOOTBALL_HOST || "v3.football.api-sports.io";
const URL = `https://${HOST}/fixtures?league=1&season=2026&live=all`;

// team -> group (kept tiny; only used to tag live matches with a group)
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
  // cache at the edge: 30s fresh, serve-stale-while-revalidating for 15s
  res.setHeader("Cache-Control", "public, s-maxage=30, stale-while-revalidate=15");

  const key = process.env.API_FOOTBALL_KEY;
  if (!key) return res.status(500).json({ error: "API_FOOTBALL_KEY not configured" });

  try {
    const r = await fetch(URL, { headers: { "x-apisports-key": key } });
    if (!r.ok) return res.status(502).json({ error: `upstream ${r.status}` });
    const data = await r.json();

    const live = (data.response || []).map((f) => {
      const h = norm(f.teams?.home?.name), a = norm(f.teams?.away?.name);
      return {
        g: TEAM_GROUP[h] || null,
        h, a,
        hs: f.goals?.home ?? 0,
        as: f.goals?.away ?? 0,
        minute: f.fixture?.status?.elapsed ?? null, // e.g. 63
        status: f.fixture?.status?.short ?? null,    // 1H, HT, 2H, ET, P...
      };
    });

    return res.status(200).json({ updated: new Date().toISOString(), count: live.length, live });
  } catch (e) {
    return res.status(502).json({ error: String(e?.message || e) });
  }
}

/* RATE-LIMIT REALITY (read before relying on "live"):
 * Even with 30s edge caching, each cache miss costs 1 upstream call.
 *   30s cache  -> ~2 calls/min -> ~720/day across a 6h live window.
 * API-Football FREE tier = ~100 calls/day -> NOT enough for all-day 30s live.
 * Options:
 *   - Stay free: raise s-maxage to ~300 (5-min "near-live"); ~12/hr -> ~72/day.
 *   - Go live for real: API-Football Pro (~$19/mo) lifts the daily cap.
 *   - Only mount the poller when a match is actually in progress (your
 *     schedule knows kickoff times), so you never poll during dead hours.
 */
