/* ============================================================
   api/livestock.js  —  a tiny Vercel "serverless function"
   Lives at:  https://mercado-pulse.vercel.app/api/livestock

   WHY THIS EXISTS: USDA publishes the Oklahoma National Stockyards
   feeder cattle report (report #1280) as a free public PDF, but a
   web browser isn't allowed to fetch it directly (no CORS header).
   So this little server-side helper downloads the PDF, pulls out the
   numbers we want, and hands them to our page as simple JSON.
   (The USDA MARS JSON API needs a free key; this PDF does not.)
   ============================================================ */
const pdf = require("pdf-parse/lib/pdf-parse.js"); // reads text out of PDFs

const REPORT_PDF = "https://www.ams.usda.gov/mnreports/ams_1280.pdf";
const REPORT_PAGE = "https://mymarketnews.ams.usda.gov/viewReport/1280";

// Weight buckets (lbs) we group steer prices into
const BUCKETS = [[300, 400], [400, 500], [500, 600], [600, 700], [700, 800], [800, 900], [900, 1000]];

// A data row looks squished together like "24362-395379472.50-520.00507.41 Unweaned"
// = Head 24 | Wt range 362-395 | Avg wt 379 | Price 472.50-520.00 | Avg 507.41
// We try every way to split the leading digits and keep the one that makes sense.
function parseRow(line) {
  const m = line.match(/^(\d[\d-]*?)(\d{3}\.\d\d(?:-\d{3}\.\d\d)?)(\d{3}\.\d\d)\s*(.*)$/);
  if (!m) return null;
  const [, nums, priceRange, avgPrice, note] = m;
  for (let h = 1; h <= 4; h++) {
    const head = +nums.slice(0, h), rest = nums.slice(h);
    if (rest[0] === "0") continue; // weights never start with 0
    const r = rest.match(/^(\d{3,4})(?:-(\d{3,4}))?(\d{3,4})$/);
    if (!r) continue;
    const lo = +r[1], hi = +(r[2] || r[1]), avgWt = +r[3];
    if (head > 0 && lo <= avgWt && avgWt <= hi && (r[2] || lo === avgWt))
      return { head, avgWt, priceRange, avgPrice: +avgPrice, note: note.trim() };
  }
  return null;
}

// How long we wait for USDA before giving up (10 seconds). Without this,
// a slow USDA server could leave the page stuck on "Loading..." forever.
const FETCH_TIMEOUT_MS = 10_000;

// How long a copy of the answer is kept (6 hours). The report only changes weekly.
const CACHE_SECONDS = 6 * 60 * 60;
const CACHE_HEADER = `public, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=86400`;

// A small "memory" copy inside this function. If Vercel reuses the same
// running function, we can answer without downloading the PDF again.
let memoryCopy = null; // { data, savedAt }

// Download the USDA PDF, but stop waiting after FETCH_TIMEOUT_MS.
async function downloadReport() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(REPORT_PDF, { signal: controller.signal });
    if (!resp.ok) throw new Error(`USDA answered with status ${resp.status}`);
    return Buffer.from(await resp.arrayBuffer());
  } finally {
    clearTimeout(timer); // always stop the timer, success or failure
  }
}

// Turn the PDF text into the simple numbers our page shows.
function readReport(text) {
  // Report date + "compared to last week" market comment
  const reportDate = (text.match(/Report for ([\d/]+)/) || [])[1] || null;
  const comment = ((text.match(/Compared to last week:([\s\S]*?)Supply included/) || [])[1] || "")
    .replace(/\s+/g, " ").trim();

  // Receipts: "Total Receipts:5,4964,2425,163" = this week, last week, last year (squished)
  const rec = text.match(/Total Receipts:([\d,]+)/);
  let receipts = null;
  if (rec) {
    const parts = rec[1].match(/\d{1,3}(?:,\d{3})*?(?=\d{1,3},\d{3}|$)/g) || [];
    receipts = { thisWeek: parts[0], lastWeek: parts[1], lastYear: parts[2] };
  }

  // Only the "STEERS - Medium and Large 1 (" table(s), the main benchmark grade
  const rows = [];
  let inSteers = false;
  for (const line of text.split("\n")) {
    if (/^(STEERS|HEIFERS|BULLS|DAIRY|HOLSTEIN)/.test(line)) inSteers = line.startsWith("STEERS - Medium and Large 1 (");
    else if (inSteers) { const r = parseRow(line.trim()); if (r && !r.note) rows.push(r); }
  }

  // Group into weight buckets: head-weighted avg price + low/high
  const buckets = BUCKETS.map(([lo, hi]) => {
    const inB = rows.filter(r => r.avgWt >= lo && r.avgWt < hi);
    if (!inB.length) return null;
    const head = inB.reduce((s, r) => s + r.head, 0);
    const avg = inB.reduce((s, r) => s + r.avgPrice * r.head, 0) / head;
    const prices = inB.flatMap(r => r.priceRange.split("-").map(Number));
    return { weight: `${lo}-${hi} lbs`, head, avgPrice: +avg.toFixed(2),
             low: Math.min(...prices), high: Math.max(...prices) };
  }).filter(Boolean);

  return { source: "USDA AMS Market News – Report 1280 (Oklahoma Dept of Ag)",
    sourceUrl: REPORT_PAGE, pdfUrl: REPORT_PDF, reportDate, receipts, comment, steers: buckets };
}

module.exports = async (req, res) => {
  // 1) Only "read" requests are allowed. Anything else (POST, PUT, DELETE...)
  //    gets "405 Method Not Allowed" and never touches the USDA website.
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return res.status(405).json({ error: "Method not allowed" });
  }

  // 2) Extra stuff on the address (like /api/livestock?x=123) would make
  //    Vercel treat it as a brand-new page and skip its saved copy. So we send
  //    those visitors to the one plain address, which Vercel keeps cached.
  if (req.url && req.url.includes("?")) {
    res.setHeader("Cache-Control", CACHE_HEADER); // the redirect itself is cached too
    return res.redirect(308, "/api/livestock");
  }

  try {
    // 3) Use the memory copy if it is still fresh; otherwise download again.
    const fresh = memoryCopy && Date.now() - memoryCopy.savedAt < CACHE_SECONDS * 1000;
    if (!fresh) {
      const text = (await pdf(await downloadReport())).text;
      memoryCopy = { data: readReport(text), savedAt: Date.now() };
    }

    // 4) Tell Vercel's CDN to keep this answer for 6 hours.
    res.setHeader("Cache-Control", CACHE_HEADER);
    res.status(200).json(memoryCopy.data);
  } catch (err) {
    // 5) The real error goes to the Vercel logs (only Ismael can see those).
    //    The public only gets a short, generic message.
    console.error("livestock: could not load USDA report:", err);
    res.setHeader("Cache-Control", "no-store"); // don't cache failures
    res.status(502).json({ error: "Could not load the USDA report right now. Please try again later." });
  }
};
