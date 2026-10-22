/* ============================================================
   trader.js — Paper Trader page (the BEHAVIOR)
   1) Asks /api/config if the site is set up (keys live on the server)
   2) Google sign-in through Supabase Auth
   3) Shows portfolio + Quant Report Card from /api/portfolio
   4) Sends trades to /api/trade (the server picks the price!)
   All text is put on the page with textContent (safe from code injection).
   ============================================================ */
(function () {
  const $ = (id) => document.getElementById(id);
  const usd = (n) => (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pct = (n) => (n === null || n === undefined || !isFinite(n)) ? "—" : (n >= 0 ? "+" : "") + (n * 100).toFixed(2) + "%";
  const num = (n, d = 2) => (n === null || n === undefined || !isFinite(n)) ? "—" : n.toFixed(d);
  let sb = null, session = null;

  function el(tag, text, cls) { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e; }
  function card(label, value, sub, cls) {
    const c = el("div", undefined, "card");
    c.append(el("div", label, "label"), el("div", value, "value" + (cls ? " " + cls : "")));
    if (sub) c.append(el("div", sub, "sub"));
    return c;
  }
  function row(cells) { const tr = el("tr"); cells.forEach(([t, c]) => tr.append(el("td", t, c))); return tr; }
  function status(nodes) { const s = $("status"); s.replaceChildren(...nodes); s.hidden = false; }

  async function api(path, opts = {}) {
    const headers = { "Content-Type": "application/json" };
    if (session) headers.Authorization = "Bearer " + session.access_token;
    const r = await fetch(path, { ...opts, headers });
    let d = {}; try { d = await r.json(); } catch {}
    if (!r.ok) throw Object.assign(new Error(d.error || "Request failed"), { status: r.status, data: d });
    return d;
  }

  function showSetupNeeded(setup) {
    const ul = el("ul");
    [["Finnhub price key", setup && setup.finnhub], ["Supabase URL + anon key", setup && setup.supabase], ["Supabase service-role key (server)", setup && setup.serviceRole]]
      .forEach(([t, ok]) => ul.append(el("li", (ok ? "✅ " : "⏳ ") + t)));
    status([el("h3", "🛠️ Setup needed", "mini"), el("p", "The Paper Trader is built but not switched on yet. The site owner still needs to add:"), ul,
      el("p", "The rest of Mercado Pulse works normally in the meantime.", "sub")]);
    $("leaderboard").replaceChildren(row([["Leaderboard opens once setup is done.", ""]]));
  }

  function showSignIn() {
    $("signed-in").hidden = true;
    const b = el("button", "Sign in with Google", "btn"); b.type = "button";
    b.addEventListener("click", () => sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: location.origin + "/trader.html" } }));
    status([el("h3", "Start with $100,000 (fake)", "mini"), el("p", "Sign in to get your own practice portfolio. We only use your first name and last initial on the leaderboard."), b]);
  }

  let savingsApy = 0.04, savingsLabel = "4.00%";
  async function loadSavingsRate() {
    // If the Bank Rates data file exists, use the highlighted savings APY from it; otherwise 4%
    try {
      const r = await fetch("/data/rates.json");
      if (!r.ok) return;
      const d = await r.json();
      const row = (d.rows || []).find(x => x.highlight && x.type === "Savings" && typeof x.apy === "number");
      if (row) { savingsApy = row.apy / 100; savingsLabel = row.apy.toFixed(2) + "%"; }
    } catch {}
  }

  function render(p) {
    $("status").hidden = true; $("signed-in").hidden = false;
    $("who").textContent = p.displayName;
    const gain = p.total - p.startingCash;
    $("summary").replaceChildren(
      card("Total value", usd(p.total), "started with " + usd(p.startingCash)),
      card("Cash", usd(p.cash)),
      card("Gain / loss", usd(gain), pct(gain / p.startingCash), gain >= 0 ? "up" : "down"),
      card("Holdings", String(p.holdings.length), "stocks & ETFs"));
    $("holdings").replaceChildren(...(p.holdings.length ? p.holdings.map(h => {
      const g = (h.price - h.avgCost) * h.qty;
      return row([[h.symbol], [String(h.qty)], [usd(h.avgCost)], [usd(h.price) + (h.stale ? " *" : "")], [usd(h.value)], [usd(g), g >= 0 ? "up" : "down"]]);
    }) : [row([["No holdings yet — try buying a few shares of SPY."]])]));
    const rc = p.report;
    $("report").replaceChildren(
      card("Your return", pct(rc.totalReturn), rc.days + " day(s) of data"),
      card("vs. S&P 500 (SPY)", pct(rc.vsSpy), "SPY: " + pct(rc.spyReturn), rc.vsSpy === null ? "" : rc.vsSpy >= 0 ? "up" : "down"),
      card("Sharpe ratio", num(rc.sharpe), rc.enoughData ? "higher = better" : "needs more days"),
      card("Volatility", rc.volatility === null ? "—" : (rc.volatility * 100).toFixed(1) + "%", "yearly"),
      card("Max drawdown", pct(rc.maxDrawdown), "worst drop", "down"),
      card("Beta", num(rc.beta), "1 = moves like SPY"));
    const earned = window.Quant.savingsEarnings(p.startingCash, savingsApy, p.daysSinceStart);
    const s = $("savings"); s.replaceChildren();
    s.append(el("b", "🏦 Bank Rates check: "), document.createTextNode(
      `Since you started, your ${usd(p.startingCash)} would have earned about ${usd(earned)} sitting in a ${savingsLabel} savings account, ` +
      `with no market risk. Your portfolio is ${gain >= earned ? "ahead of" : "behind"} that by ${usd(Math.abs(gain - earned))}. `));
    const a = el("a", "Compare savings rates →"); a.href = "/#rates"; s.append(a);
    $("trades").replaceChildren(...(p.trades.length ? p.trades.map(t => row([
      [new Date(t.created_at).toLocaleString("en-US", { timeZone: "America/Chicago", dateStyle: "short", timeStyle: "short" }) + " CT"],
      [t.side.toUpperCase(), t.side === "buy" ? "up" : "down"], [t.symbol], [String(Number(t.qty))], [usd(Number(t.price))], [usd(Number(t.total))]]))
      : [row([["No trades yet."]])]));
  }

  async function loadPortfolio() {
    try { render(await api("/api/portfolio")); }
    catch (e) { status([el("p", "Could not load your portfolio: " + e.message)]); }
  }

  async function loadLeaderboard() {
    try {
      const d = await api("/api/leaderboard");
      $("lb-month").textContent = d.month;
      $("leaderboard").replaceChildren(...(d.rows.length ? d.rows.map(r => row([[String(r.rank)], [r.display_name], [pct(Number(r.return_pct) / 100), Number(r.return_pct) >= 0 ? "up" : "down"]]))
        : [row([["No one on the board yet this month."]])]));
    } catch (e) {
      if (e.status !== 503) $("leaderboard").replaceChildren(row([["Leaderboard unavailable right now."]]));
    }
  }

  function wireTrading() {
    const msg = $("t-msg");
    $("t-quote").addEventListener("click", async () => {
      msg.textContent = "Getting price…";
      try { const q = await api("/api/quote?symbol=" + encodeURIComponent($("t-symbol").value.trim().toUpperCase()));
        msg.textContent = `${q.symbol}: ${usd(q.price)} (${q.changePct >= 0 ? "+" : ""}${q.changePct.toFixed(2)}% today, delayed)`; }
      catch (e) { msg.textContent = e.message; }
    });
    let side = "buy";
    document.querySelectorAll("#trade-form [data-side]").forEach(b => b.addEventListener("click", () => { side = b.dataset.side; }));
    $("trade-form").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const symbol = $("t-symbol").value.trim().toUpperCase(), qty = Number($("t-qty").value);
      msg.textContent = `Sending ${side} order…`;
      try {
        const r = await api("/api/trade", { method: "POST", body: JSON.stringify({ symbol, side, qty }) });
        msg.textContent = `Done: ${side === "buy" ? "bought" : "sold"} ${qty} ${symbol} at ${usd(r.quote.price)}.`;
        await loadPortfolio(); loadLeaderboard();
      } catch (e) { msg.textContent = e.message; }
    });
    $("signout").addEventListener("click", async () => { await sb.auth.signOut(); session = null; showSignIn(); });
  }

  async function start() {
    let cfg;
    try { cfg = await api("/api/config"); } catch { cfg = { ready: false, setup: null }; }
    if (!cfg.ready || !window.supabase) return showSetupNeeded(cfg.setup);
    sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { flowType: "pkce", detectSessionInUrl: true, persistSession: true } });
    await loadSavingsRate();
    wireTrading();
    loadLeaderboard();
    const { data } = await sb.auth.getSession();
    session = data.session;
    sb.auth.onAuthStateChange((_e, s) => { const was = !!session; session = s; if (s && !was) loadPortfolio(); });
    if (session) loadPortfolio(); else showSignIn();
  }
  document.addEventListener("DOMContentLoaded", start);
})();
