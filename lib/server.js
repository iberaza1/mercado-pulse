/* ============================================================
   lib/server.js — shared helpers for the Paper Trader /api functions
   SERVER ONLY. Secrets are read from Vercel environment variables:
     FINNHUB_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
   No npm packages needed: we talk to Supabase's REST API with fetch().
   ============================================================ */
const env = (k) => (process.env[k] || "").trim();

function setupStatus() {
  return {
    finnhub: !!env("FINNHUB_API_KEY"),
    supabase: !!(env("SUPABASE_URL") && env("SUPABASE_ANON_KEY")),
    serviceRole: !!env("SUPABASE_SERVICE_ROLE_KEY"),
  };
}
const ready = () => { const s = setupStatus(); return s.finnhub && s.supabase && s.serviceRole; };

function sendJson(res, status, body, cache = "no-store") {
  res.setHeader("Cache-Control", cache);
  res.status(status).json(body);
}
function notReady(res) {
  return sendJson(res, 503, { error: "setup_needed", setup: setupStatus() });
}

// Symbols like AAPL, SPY, BRK.B — anything else is rejected before we call Finnhub
const SYMBOL_RE = /^[A-Z]{1,5}(\.[A-Z])?$/;
function cleanSymbol(s) {
  const v = String(s || "").trim().toUpperCase();
  return SYMBOL_RE.test(v) ? v : null;
}

async function fetchWithTimeout(url, opts = {}, ms = 8000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try { return await fetch(url, { ...opts, signal: ctl.signal }); } finally { clearTimeout(t); }
}

// ---------- Finnhub quotes (free tier = 60 calls/minute) ----------
// We keep each price for 60 seconds so many visitors don't burn the limit.
const quoteCache = new Map();
const QUOTE_TTL = 60 * 1000;
async function getQuote(symbol) {
  const hit = quoteCache.get(symbol);
  if (hit && Date.now() - hit.at < QUOTE_TTL) return hit.q;
  const url = "https://finnhub.io/api/v1/quote?symbol=" + encodeURIComponent(symbol);
  const r = await fetchWithTimeout(url, { headers: { "X-Finnhub-Token": env("FINNHUB_API_KEY") } });
  if (r.status === 429) throw Object.assign(new Error("Price service is busy, try again in a minute"), { status: 429 });
  if (!r.ok) throw Object.assign(new Error("Could not get a price right now"), { status: 502 });
  const d = await r.json();
  // Finnhub returns c=0 for unknown symbols
  if (!d || !(Number(d.c) > 0)) throw Object.assign(new Error("Unknown symbol (US stocks & ETFs only)"), { status: 404 });
  const q = { symbol, price: Number(d.c), change: Number(d.d) || 0, changePct: Number(d.dp) || 0,
    prevClose: Number(d.pc) || null, time: d.t ? new Date(d.t * 1000).toISOString() : null };
  quoteCache.set(symbol, { at: Date.now(), q });
  if (quoteCache.size > 500) quoteCache.delete(quoteCache.keys().next().value);
  return q;
}

// ---------- Supabase ----------
async function getUser(req) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!token || token.length > 4096) return null;
  const r = await fetchWithTimeout(env("SUPABASE_URL") + "/auth/v1/user", {
    headers: { apikey: env("SUPABASE_ANON_KEY"), Authorization: "Bearer " + token },
  });
  if (!r.ok) return null;
  const u = await r.json();
  return u && u.id ? u : null;
}

// Talk to the database as the server (service role). path like "/rest/v1/rpc/pt_execute_trade"
async function db(path, { method = "GET", body, prefer } = {}) {
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  const headers = { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json" };
  if (prefer) headers.Prefer = prefer;
  const r = await fetchWithTimeout(env("SUPABASE_URL") + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!r.ok) {
    // Postgres "raise exception" messages from our trade function are safe to show
    const msg = data && data.message && data.code === "P0001" ? data.message : "Database error";
    throw Object.assign(new Error(msg), { status: data && data.code === "P0001" ? 400 : 502 });
  }
  return data;
}

// "Ismael Beraza" -> "Ismael B." (leaderboard shows first name + last initial only)
function displayNameFor(user) {
  const m = user.user_metadata || {};
  const full = String(m.full_name || m.name || "").trim();
  if (!full) return "Trader";
  const parts = full.split(/\s+/);
  return (parts[0] + (parts.length > 1 ? " " + parts[parts.length - 1][0] + "." : "")).slice(0, 40);
}

// Today's date in Oklahoma time, e.g. "2026-10-22"
function todayCT() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(new Date());
}

// Value a portfolio at current delayed prices and save today's snapshot
async function valueAndSnapshot(pf, positions) {
  const quotes = {};
  for (const p of positions) {
    try { quotes[p.symbol] = await getQuote(p.symbol); } catch { quotes[p.symbol] = null; }
  }
  let spy = null; try { spy = (await getQuote("SPY")).price; } catch {}
  const holdings = positions.map(p => {
    const price = quotes[p.symbol] ? quotes[p.symbol].price : Number(p.avg_cost); // fall back to cost if no price
    return { symbol: p.symbol, qty: Number(p.qty), avgCost: Number(p.avg_cost), price,
      value: Number(p.qty) * price, stale: !quotes[p.symbol] };
  });
  const total = Number(pf.cash) + holdings.reduce((a, h) => a + h.value, 0);
  await db("/rest/v1/snapshots?on_conflict=portfolio_id,day", {
    method: "POST", prefer: "resolution=merge-duplicates,return=minimal",
    body: { portfolio_id: pf.id, day: todayCT(), total_value: Math.round(total * 100) / 100, cash: Number(pf.cash), spy_price: spy },
  });
  return { holdings, total, spy };
}

function methodGuard(req, res, allowed) {
  if (!allowed.includes(req.method)) {
    res.setHeader("Allow", allowed.join(", "));
    sendJson(res, 405, { error: "Method not allowed" });
    return false;
  }
  return true;
}

module.exports = { env, setupStatus, ready, sendJson, notReady, cleanSymbol, getQuote, getUser, db,
  displayNameFor, todayCT, valueAndSnapshot, methodGuard };
