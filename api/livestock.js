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

module.exports = async (req, res) => {
  try {
    const buf = Buffer.from(await (await fetch(REPORT_PDF)).arrayBuffer());
    const text = (await pdf(buf)).text;

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

    // Cache at Vercel's edge for 6 hours (report only updates weekly)
    res.setHeader("Cache-Control", "s-maxage=21600, stale-while-revalidate=86400");
    res.status(200).json({ source: "USDA AMS Market News – Report 1280 (Oklahoma Dept of Ag)",
      sourceUrl: REPORT_PAGE, pdfUrl: REPORT_PDF, reportDate, receipts, comment, steers: buckets });
  } catch (err) {
    res.status(502).json({ error: "Could not load USDA report", detail: String(err) });
  }
};
