// POST /api/trade  { symbol, side: "buy"|"sell", qty }   (needs sign-in)
// The PRICE is fetched here on the server — the browser never gets to choose it.
const s = require("../lib/server.js");
module.exports = async (req, res) => {
  if (!s.methodGuard(req, res, ["POST"])) return;
  if (!s.ready()) return s.notReady(res);
  try {
    const user = await s.getUser(req);
    if (!user) return s.sendJson(res, 401, { error: "Please sign in" });
    const b = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const symbol = s.cleanSymbol(b.symbol);
    const side = b.side === "buy" || b.side === "sell" ? b.side : null;
    const qty = Number(b.qty);
    if (!symbol || !side || !Number.isInteger(qty) || qty < 1 || qty > 100000)
      return s.sendJson(res, 400, { error: "Need a ticker, buy/sell, and a whole number of shares (1–100,000)" });
    const quote = await s.getQuote(symbol);
    await s.db("/rest/v1/rpc/pt_ensure_portfolio", { method: "POST", body: { p_user: user.id, p_name: s.displayNameFor(user) } });
    const trade = await s.db("/rest/v1/rpc/pt_execute_trade", { method: "POST",
      body: { p_user: user.id, p_symbol: symbol, p_side: side, p_qty: qty, p_price: quote.price } });
    s.sendJson(res, 200, { ok: true, trade, quote });
  } catch (e) {
    s.sendJson(res, e.status || 500, { error: e.status ? e.message : "Something went wrong" });
  }
};
