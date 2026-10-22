// Daily job (Vercel Cron, see vercel.json): saves a snapshot for every portfolio
// so the Report Card and leaderboard have one point per day even if you don't visit.
// Vercel sends "Authorization: Bearer <CRON_SECRET>" when CRON_SECRET is set.
const s = require("../lib/server.js");
module.exports = async (req, res) => {
  if (!s.methodGuard(req, res, ["GET"])) return;
  const secret = s.env("CRON_SECRET");
  if (!secret || req.headers.authorization !== "Bearer " + secret) return s.sendJson(res, 401, { error: "Unauthorized" });
  if (!s.ready()) return s.notReady(res);
  try {
    const pfs = await s.db("/rest/v1/portfolios?select=id,cash&limit=500");
    let done = 0;
    for (const pf of pfs) {
      const pos = await s.db(`/rest/v1/positions?portfolio_id=eq.${encodeURIComponent(pf.id)}&select=symbol,qty,avg_cost`);
      await s.valueAndSnapshot(pf, pos); done++;
    }
    s.sendJson(res, 200, { ok: true, snapshots: done });
  } catch (e) {
    s.sendJson(res, 500, { error: "Snapshot job failed" });
  }
};
