// GET /api/config — tells the browser if the Paper Trader is set up, and gives it the
// PUBLIC Supabase URL + anon key (these are meant to be public; RLS protects the data).
const s = require("../lib/server.js");
module.exports = (req, res) => {
  if (!s.methodGuard(req, res, ["GET", "HEAD"])) return;
  const setup = s.setupStatus();
  s.sendJson(res, 200, {
    ready: s.ready(), setup,
    supabaseUrl: setup.supabase ? s.env("SUPABASE_URL") : null,
    supabaseAnonKey: setup.supabase ? s.env("SUPABASE_ANON_KEY") : null,
  }, "public, max-age=60");
};
