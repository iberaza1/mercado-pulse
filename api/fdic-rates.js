/* ============================================================
   api/fdic-rates.js  —  Vercel serverless function
   Lives at:  https://mercado-pulse.vercel.app/api/fdic-rates

   WHY: The FDIC publishes official U.S. national average deposit rates
   every month (3rd Monday). Their page has no CORS header, so the browser
   can't read it directly. This helper reads the FDIC table and returns
   simple JSON. If the FDIC page fails, we fall back to the FRED copy of
   the national savings rate (series SNDR) so the page still shows something.
   ============================================================ */
const FDIC_URL = "https://www.fdic.gov/national-rates-and-rate-caps";
const FRED_CSV = "https://fred.stlouisfed.org/graph/fredgraph.csv?id=SNDR";
const FETCH_TIMEOUT_MS = 10_000;                // give up after 10 seconds
const CACHE_SECONDS = 24 * 60 * 60;             // FDIC only updates monthly
const CACHE_HEADER = `public, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=86400`;

let memoryCopy = null; // { data, savedAt }

async function getText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(url, { signal: controller.signal, headers: { "User-Agent": "mercado-pulse (hobby dashboard)" } });
    if (!resp.ok) throw new Error(`${url} answered with status ${resp.status}`);
    return await resp.text();
  } finally { clearTimeout(timer); }
}

// Strip HTML tags (footnote links etc.) out of a table cell.
const clean = (s) => s.replace(/<span[\s\S]*?<\/span>/g, "").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim();

// Read the "National Deposit Rates" column of the FDIC table.
function readFdic(html) {
  const asOf = (html.match(/Monthly Rate Cap Information as of ([A-Za-z]+ \d{1,2}, \d{4})/) || [])[1] || null;
  const table = (html.match(/<table[\s\S]*?<\/table>/) || [])[0];
  if (!table) throw new Error("FDIC table not found");
  const rates = {};
  for (const row of table.match(/<tr>[\s\S]*?<\/tr>/g) || []) {
    const cells = (row.match(/<td[\s\S]*?<\/td>/g) || []).map(clean);
    if (cells.length < 2) continue;
    const name = cells[0], value = parseFloat(cells[1]);
    if (!Number.isFinite(value)) continue;
    const cd = name.match(/^(\d+) month CD$/i);
    if (cd) (rates.cd = rates.cd || {})[cd[1]] = value;      // e.g. rates.cd["12"] = 1.76
    else if (/^savings$/i.test(name)) rates.savings = value;
    else if (/^interest checking$/i.test(name)) rates.checking = value;
    else if (/^money market$/i.test(name)) rates.moneyMarket = value;
  }
  if (rates.savings == null || rates.checking == null || !rates.cd) throw new Error("FDIC table format changed");
  return { source: "FDIC National Rates and Rate Caps", sourceUrl: FDIC_URL, asOf,
    note: "National average APY (%). Savings and checking are for the $2,500 balance tier.", fallback: false, rates };
}

// Backup: FRED's copy of the FDIC national savings rate (CSV: date,value).
function readFred(csv) {
  const last = csv.trim().split("\n").filter(l => /^\d{4}-\d\d-\d\d,\d/.test(l)).pop();
  if (!last) throw new Error("FRED CSV empty");
  const [date, v] = last.split(",");
  return { source: "FRED series SNDR (FDIC national savings rate)", sourceUrl: "https://fred.stlouisfed.org/series/SNDR",
    asOf: date, note: "Backup source: only the savings average is available right now.", fallback: true,
    rates: { savings: +(+v).toFixed(2) } };
}

module.exports = async (req, res) => {
  // 1) Read-only: anything other than GET/HEAD is refused.
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return res.status(405).json({ error: "Method not allowed" });
  }
  // 2) Junk on the end of the address would skip the cache; send it to the plain address.
  if (req.url && req.url.includes("?")) {
    res.setHeader("Cache-Control", CACHE_HEADER);
    return res.redirect(308, "/api/fdic-rates");
  }
  try {
    const fresh = memoryCopy && Date.now() - memoryCopy.savedAt < CACHE_SECONDS * 1000;
    if (!fresh) {
      let data;
      try { data = readFdic(await getText(FDIC_URL)); }
      catch (e) { console.error("fdic-rates: FDIC failed, trying FRED:", e); data = readFred(await getText(FRED_CSV)); }
      memoryCopy = { data, savedAt: Date.now() };
    }
    res.setHeader("Cache-Control", CACHE_HEADER);
    res.status(200).json(memoryCopy.data);
  } catch (err) {
    console.error("fdic-rates: could not load national rates:", err);
    res.setHeader("Cache-Control", "no-store");
    res.status(502).json({ error: "Could not load national rates right now. Please try again later." });
  }
};
module.exports._test = { readFdic, readFred };
