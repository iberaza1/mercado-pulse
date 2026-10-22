// GET /api/portfolio — your cash, holdings, trades and Quant Report Card (needs sign-in)
// Also saves today's snapshot ("computed on read"), on top of the daily cron.
const s = require("../lib/server.js");
const quant = require("../lib/quant.js");
module.exports = async (req, res) => {
  if (!s.methodGuard(req, res, ["GET"])) return;
  if (!s.ready()) return s.notReady(res);
  try {
    const user = await s.getUser(req);
    if (!user) return s.sendJson(res, 401, { error: "Please sign in" });
    let pf = await s.db("/rest/v1/rpc/pt_ensure_portfolio", { method: "POST", body: { p_user: user.id, p_name: s.displayNameFor(user) } });
    if (Array.isArray(pf)) pf = pf[0];
    const id = encodeURIComponent(pf.id);
    const positions = await s.db(`/rest/v1/positions?portfolio_id=eq.${id}&select=symbol,qty,avg_cost&order=symbol`);
    const { holdings, total, spy } = await s.valueAndSnapshot(pf, positions);
    const trades = await s.db(`/rest/v1/trades?portfolio_id=eq.${id}&select=symbol,side,qty,price,total,created_at&order=created_at.desc&limit=50`);
    const snaps = await s.db(`/rest/v1/snapshots?portfolio_id=eq.${id}&select=day,total_value,spy_price&order=day.asc&limit=1000`);
    // Series starts at the starting cash on the day the portfolio was created
    const series = [{ value: Number(pf.starting_cash), spy: null }]
      .concat(snaps.map(x => ({ value: Number(x.total_value), spy: x.spy_price === null ? null : Number(x.spy_price) })));
    const daysSinceStart = Math.max(0, (Date.now() - new Date(pf.created_at).getTime()) / 86400000);
    s.sendJson(res, 200, {
      displayName: pf.display_name, createdAt: pf.created_at, startingCash: Number(pf.starting_cash),
      cash: Number(pf.cash), total, spy, holdings, trades,
      history: snaps.map(x => ({ day: x.day, value: Number(x.total_value) })),
      report: quant.reportCard(series, 0.04),
      daysSinceStart,
    });
  } catch (e) {
    s.sendJson(res, e.status || 500, { error: e.status ? e.message : "Something went wrong" });
  }
};
