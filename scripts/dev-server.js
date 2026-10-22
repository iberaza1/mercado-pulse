// Tiny local preview server (for testing only — Vercel does this for real).
// Run:  npm run dev   then open http://localhost:3000
// Serves the static files and runs /api/*.js like Vercel functions.
const http = require("http"), fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..");
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json", ".png": "image/png" };
const csp = require(path.join(root, "vercel.json")).headers[0].headers;
http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  csp.forEach(h => res.setHeader(h.key, h.value));
  if (url.pathname.startsWith("/api/")) {
    const file = path.join(root, "api", path.basename(url.pathname) + ".js");
    if (!fs.existsSync(file)) { res.statusCode = 404; return res.end("{}"); }
    let body = ""; req.on("data", c => body += c); await new Promise(r => req.on("end", r));
    req.query = Object.fromEntries(url.searchParams);
    try { req.body = body ? JSON.parse(body) : {}; } catch { req.body = body; }
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (o) => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(o)); };
    res.redirect = (c, l) => { res.statusCode = c; res.setHeader("Location", l); res.end(); };
    try { return await require(file)(req, res); }
    catch (e) { console.error(e); res.statusCode = 500; return res.end('{"error":"dev server error"}'); }
  }
  let p = path.normalize(path.join(root, url.pathname === "/" ? "index.html" : url.pathname));
  if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.statusCode = 404; return res.end("Not found"); }
  res.setHeader("Content-Type", types[path.extname(p)] || "application/octet-stream");
  fs.createReadStream(p).pipe(res);
}).listen(process.env.PORT || 3000, () => console.log("http://localhost:" + (process.env.PORT || 3000)));
