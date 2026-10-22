// GET /api/leaderboard — this month's top portfolios (display name + return % only)
const s = require("../lib/server.js");
module.exports = async (req, res) => {
  if (!s.methodGuard(req, res, ["GET", "HEAD"])) return;
  if (!s.ready()) return s.notReady(res);
  try {
    const rows = await s.db("/rest/v1/rpc/pt_leaderboard", { method: "POST", body: { p_limit: 25 } });
    s.sendJson(res, 200, { month: s.todayCT().slice(0, 7), rows }, "public, max-age=300, s-maxage=300");
  } catch (e) {
    s.sendJson(res, 502, { error: "Leaderboard is unavailable right now" });
  }
};
