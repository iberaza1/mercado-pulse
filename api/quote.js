// GET /api/quote?symbol=AAPL — delayed price from Finnhub (key stays on the server)
const s = require("../lib/server.js");
module.exports = async (req, res) => {
  if (!s.methodGuard(req, res, ["GET", "HEAD"])) return;
  if (!s.setupStatus().finnhub) return s.notReady(res);
  const symbol = s.cleanSymbol(req.query && req.query.symbol);
  if (!symbol) return s.sendJson(res, 400, { error: "Enter a ticker like AAPL or SPY" });
  try {
    s.sendJson(res, 200, await s.getQuote(symbol), "public, max-age=60, s-maxage=60");
  } catch (e) {
    s.sendJson(res, e.status || 502, { error: e.status ? e.message : "Could not get a price right now" });
  }
};
