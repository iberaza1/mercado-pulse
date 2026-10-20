/* ============================================================
   MERCADO PULSE - app.js (the BEHAVIOR)
   1) Fetches LIVE FX rates from frankfurter.app (free, no key)
   2) Fills SAMPLE cards from the lists below
   3) Draws charts with Chart.js
   Beginner tip: to change a sample number, just edit the lists!
   ============================================================ */

// ---------- SAMPLE DATA (made-up practice numbers, NOT live) ----------
const optionsSample = [
  { label: "VIX (sample)", value: "16.4", sub: "fear gauge" },
  { label: "Put/Call ratio (sample)", value: "0.85", sub: ">1 = more hedging" },
  { label: "SPY 30-day IV (sample)", value: "14%", sub: "implied volatility" },
  { label: "Skew (sample)", value: "128", sub: "crash-protection demand" },
];
const banksSample = [
  { label: "KBE (sample)", value: "$52.10", change: +0.8 },
  { label: "KRE (sample)", value: "$58.30", change: -0.4 },
  { label: "JPM (sample)", value: "$240.00", change: +1.1 },
  { label: "BAC (sample)", value: "$44.20", change: +0.3 },
  { label: "WFC (sample)", value: "$70.50", change: -0.2 },
  { label: "C (sample)", value: "$68.90", change: +0.6 },
];
// Treasury yields in percent (sample)
const curveSample = { "3M": 4.3, "2Y": 3.9, "5Y": 3.8, "10Y": 4.1, "30Y": 4.6 };
const macroSample = [
  { label: "CPI YoY (sample)", value: "2.9%", sub: "inflation" },
  { label: "Core CPI (sample)", value: "3.1%", sub: "no food/energy" },
  { label: "Unemployment (sample)", value: "4.2%", sub: "jobs market" },
  { label: "Fed Funds (sample)", value: "4.00–4.25%", sub: "Fed's key rate" },
];
const microCards = [
  { t: "Supply & Demand", p: "More buyers than sellers → price goes up. Think concert tickets or eggs during a shortage." },
  { t: "Elasticity", p: "How much people change buying when price changes. Gas = inelastic (you still need it); Netflix = elastic." },
  { t: "Opportunity Cost", p: "What you give up. Money in a 0% checking account costs you the yield you could've earned." },
  { t: "Net Interest Margin (bank micro!)", p: "What a bank earns on loans minus what it pays on deposits. The heartbeat of every bank's P&L." },
];
const stories = [
  {
    t: "Example: Tariffs & the peso",
    intro: "When a country announces tariffs on imports, currency and stock markets react before goods even move.",
    a: ["Argument: tariffs help", "Protect domestic jobs and factories; can bring negotiating leverage. Some domestic producers' stocks may rise."],
    b: ["Argument: tariffs hurt", "Raise prices for consumers (inflation), invite retaliation, and can weaken trading-partner currencies like the MXN."],
  },
  {
    t: "Example: Bank regulation after a crisis",
    intro: "After bank failures, lawmakers debate how tough capital and liquidity rules should be.",
    a: ["Argument: tighter rules", "More capital = safer deposits and fewer bailouts. Confidence can support bank stocks long-term."],
    b: ["Argument: lighter rules", "Less capital tied up = more lending to small businesses and higher bank returns, especially for regionals (KRE)."],
  },
  {
    t: "Example: Markets push back on politics",
    intro: "It goes both ways: when markets sell off, politicians often change course.",
    a: ["View: healthy check", "Rising bond yields can discipline big deficit plans — the 'bond vigilantes' idea."],
    b: ["View: too much power", "Elected policy shouldn't be dictated by traders' short-term moods."],
  },
];

// ---------- HELPER: make one small card ----------
function card(label, value, sub, cls = "") {
  return `<div class="card"><div class="label">${label}</div>
          <div class="value ${cls}">${value}</div><div class="sub">${sub || ""}</div></div>`;
}

// ---------- FILL SAMPLE SECTIONS ----------
// innerHTML is OK here: these lists are written by us in this file,
// not downloaded from the internet. Outside data uses el() below instead.
function renderSamples() {
  document.getElementById("options-cards").innerHTML =
    optionsSample.map(o => card(o.label, o.value, o.sub)).join("");

  document.getElementById("bank-cards").innerHTML = banksSample.map(b => {
    const cls = b.change >= 0 ? "up" : "down";
    const arrow = b.change >= 0 ? "▲" : "▼";
    return card(b.label, b.value, `<span class="${cls}">${arrow} ${b.change}%</span>`);
  }).join("");

  const spread = (curveSample["10Y"] - curveSample["2Y"]).toFixed(2);
  document.getElementById("bond-cards").innerHTML =
    card("2Y yield (sample)", curveSample["2Y"] + "%", "") +
    card("10Y yield (sample)", curveSample["10Y"] + "%", "") +
    card("10Y − 2Y (sample)", spread + "%", spread < 0 ? "inverted ⚠️" : "normal", spread < 0 ? "down" : "up") +
    card("30Y yield (sample)", curveSample["30Y"] + "%", "");

  document.getElementById("macro-cards").innerHTML =
    macroSample.map(m => card(m.label, m.value, m.sub)).join("");

  document.getElementById("micro-cards").innerHTML =
    microCards.map(m => `<div class="card"><h3>${m.t}</h3><p>${m.p}</p></div>`).join("");

  document.getElementById("story-cards").innerHTML = stories.map(s => `
    <div class="card story"><h3>${s.t}</h3><p>${s.intro}</p>
      <div class="sides">
        <div class="side"><b class="up">${s.a[0]}</b>${s.a[1]}</div>
        <div class="side"><b class="down">${s.b[0]}</b>${s.b[1]}</div>
      </div></div>`).join("");
}

// ---------- LIVE FX from frankfurter.app ----------
const API = "https://api.frankfurter.dev/v1";

async function loadFX() {
  const box = document.getElementById("fx-cards");
  try {
    // Latest rates with USD as the base currency
    const res = await fetch(`${API}/latest?from=USD&to=EUR,MXN,JPY,GBP,CAD,CNY`);
    const d = await res.json();
    document.getElementById("fx-date").textContent = `As of ${d.date}.`;
    const r = d.rates;
    // Only numbers go in here (toFixed makes a number into digits), so innerHTML is safe.
    box.innerHTML =
      card("EUR/USD", (1 / r.EUR).toFixed(4), "dollars per euro") +
      card("USD/MXN", r.MXN.toFixed(3), "pesos per dollar 🇲🇽") +
      card("USD/JPY", r.JPY.toFixed(2), "yen per dollar") +
      card("GBP/USD", (1 / r.GBP).toFixed(4), "dollars per pound") +
      card("USD/CAD", r.CAD.toFixed(4), "loonies per dollar") +
      card("USD/CNY", r.CNY.toFixed(4), "yuan per dollar");
  } catch (err) {
    box.innerHTML = card("FX", "—", "Couldn't load live rates. Try refreshing.");
    console.warn("FX load failed", err);
  }

  // 30-day USD/MXN history for the chart
  try {
    const start = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
    const res = await fetch(`${API}/${start}..?from=USD&to=MXN`);
    const d = await res.json();
    const dates = Object.keys(d.rates);
    const vals = dates.map(k => d.rates[k].MXN);
    lineChart("fxChart", dates, vals, "USD/MXN");
    // Words for screen readers (people who can't see the chart)
    describeChart("fxChart", `USD/MXN went from ${vals[0].toFixed(3)} on ${dates[0]} to ${vals.at(-1).toFixed(3)} on ${dates.at(-1)}.`);
  } catch (err) { console.warn("FX history failed", err); }
}

// ---------- CHART HELPER ----------
function lineChart(id, labels, data, name) {
  if (typeof Chart === "undefined") return; // CDN didn't load, skip charts
  new Chart(document.getElementById(id), {
    type: "line",
    data: { labels, datasets: [{ label: name, data, borderColor: "#22d3a6",
      backgroundColor: "rgba(34,211,166,.15)", fill: true, tension: .3, pointRadius: 2 }] },
    options: { plugins: { legend: { display: false } },
      scales: { x: { ticks: { color: "#8a93a6", maxTicksLimit: 6 } }, y: { ticks: { color: "#8a93a6" } } } },
  });
}

// ---------- SAFE TEXT HELPER ----------
// Makes an HTML element and sets its words with textContent.
// textContent always shows words as plain text, so even if outside data
// contained sneaky code like <script>, it would just appear as letters
// on the screen instead of running. We use this for anything from USDA.
function el(tag, text, cls) {
  const e = document.createElement(tag);
  if (text !== undefined && text !== null) e.textContent = String(text);
  if (cls) e.className = cls;
  return e;
}

// Same look as card() above, but built safely from outside data.
function safeCard(label, value, sub, subCls = "") {
  const c = el("div", null, "card");
  c.append(el("div", label, "label"), el("div", value ?? "—", "value"), el("div", sub, "sub " + subCls));
  return c;
}

// ---------- LIVE LIVESTOCK (USDA report 1280 via our /api/livestock helper) ----------
async function loadLivestock() {
  const summary = document.getElementById("ls-summary");
  try {
    const d = await (await fetch("/api/livestock")).json();
    if (d.error) throw new Error(d.error);

    // "Sale date ... Source: USDA AMS Market News." (link address is fixed, not from data)
    const dateBox = document.getElementById("ls-date");
    const link = el("a", "USDA AMS Market News");
    link.href = "https://mymarketnews.ams.usda.gov/viewReport/1280";
    link.target = "_blank";
    link.rel = "noopener";
    dateBox.replaceChildren(`Sale date ${d.reportDate}. Source: `, link, ".");

    // Receipts = how many head of cattle sold
    const r = d.receipts || {};
    const num = s => Number(String(s).replace(/,/g, ""));
    const diff = num(r.thisWeek) - num(r.lastWeek);
    summary.replaceChildren(
      safeCard("Receipts this week", r.thisWeek, "head sold"),
      safeCard("Last week", r.lastWeek, `${diff >= 0 ? "▲" : "▼"} ${Math.abs(diff).toLocaleString()} head`, diff >= 0 ? "up" : "down"),
      safeCard("Last year", r.lastYear, "same week"),
      safeCard("Report", d.reportDate, "weekly"));

    // One table row per weight bucket
    document.getElementById("ls-rows").replaceChildren(...d.steers.map(s => {
      const tr = el("tr");
      const avg = el("td");
      avg.append(el("b", `$${Number(s.avgPrice).toFixed(2)}`));
      tr.append(el("td", s.weight), el("td", s.head), el("td", `$${s.low}–$${s.high}`), avg);
      return tr;
    }));

    // USDA's "compared to last week" comment, as plain text
    document.getElementById("ls-comment").replaceChildren(el("b", "Trend vs last week (USDA): "), d.comment);
  } catch (err) {
    summary.replaceChildren(safeCard("Livestock", "—", "Couldn't load the USDA report right now."));
    console.warn("Livestock load failed", err);
  }
}

// ---------- BANK RATES (hand-checked data/rates.json + LIVE FDIC averages) ----------
let rateRows = [], fdic = null, rateFilter = { type: "All", aud: "All" };

// Which FDIC national average matches this row? (null = no fair match)
function nationalAvg(row) {
  if (!fdic || !fdic.rates) return null;
  const r = fdic.rates;
  if (row.type === "Checking") return r.checking ?? null;
  if (row.type === "Savings") return r.savings ?? null;
  if (row.type === "Money Market") return r.moneyMarket ?? null;
  if (row.type === "CD" && r.cd && row.termMonths) return r.cd[String(row.termMonths)] ?? null;
  return null; // e.g. Treasury funds are not deposits, so no comparison
}

function renderRates() {
  const body = document.getElementById("rates-rows");
  const rows = rateRows.filter(r =>
    (rateFilter.type === "All" || r.type === rateFilter.type) &&
    (rateFilter.aud === "All" || r.audience === rateFilter.aud));
  if (!rows.length) { const tr = el("tr"); const td = el("td", "No rows for this filter yet."); td.colSpan = 5; tr.append(td); return body.replaceChildren(tr); }
  body.replaceChildren(...rows.map(r => {
    const tr = el("tr", null, r.highlight ? "roger" : "");
    const bank = el("td"); bank.dataset.label = "Bank";
    bank.append(el("b", r.institution), el("br"), el("span", r.category, "tag"), el("span", r.audience, "tag"));
    const prod = el("td", r.product + (r.term ? ` · ${r.term}` : "")); prod.dataset.label = "Product";
    const isNum = typeof r.apy === "number";
    const upTo = isNum && /^up to/i.test(r.apyNote || "") ? "up to " : isNum && /^from/i.test(r.apyNote || "") ? "from " : "";
    const apy = el("td", isNum ? `${upTo}${r.apy.toFixed(2)}%` : (r.apyNote && /not offered/i.test(r.apyNote) ? "Not offered" : "Check site"), "apy");
    apy.dataset.label = "APY";
    if (r.type === "Treasury" && isNum) apy.textContent += " yield";
    const avg = nationalAvg(r);
    const cmp = el("td", isNum && avg ? `${(r.apy / avg).toFixed(1)}× national avg (${avg.toFixed(2)}%)` : "—");
    cmp.dataset.label = "vs national avg";
    const det = el("td", null, "detail"); det.dataset.label = "Details";
    if (r.apyNote && !/^not offered$/i.test(r.apyNote)) det.append(el("div", r.apyNote));
    const a = el("a", `Source · as of ${r.asOf}`);
    if (/^https:\/\//.test(r.sourceUrl)) { a.href = r.sourceUrl; a.target = "_blank"; a.rel = "noopener"; }
    det.append(a);
    tr.append(bank, prod, apy, cmp, det);
    return tr;
  }));
}

function setupRateFilters() {
  document.querySelectorAll("#rates .chip").forEach(btn => btn.addEventListener("click", () => {
    const key = btn.dataset.type ? "type" : "aud";
    rateFilter[key] = btn.dataset[key];
    btn.parentElement.querySelectorAll(".chip").forEach(b => b.classList.toggle("on", b === btn));
    renderRates();
  }));
}

async function loadRates() {
  setupRateFilters();
  try {
    const d = await (await fetch("data/rates.json")).json();
    rateRows = d.rows || [];
    document.getElementById("rates-asof").textContent = `Table checked by hand · as of ${d.asOf}.`;
    renderRates();
  } catch (err) {
    const tr = el("tr"), td = el("td", "Couldn't load the rates table right now."); td.colSpan = 5; tr.append(td);
    document.getElementById("rates-rows").replaceChildren(tr);
    console.warn("Rates load failed", err);
  }
  const cards = document.getElementById("fdic-cards");
  try {
    const d = await (await fetch("/api/fdic-rates")).json();
    if (d.error) throw new Error(d.error);
    fdic = d;
    const r = d.rates, pct = v => (typeof v === "number" ? `${v.toFixed(2)}%` : "—");
    const list = [["Savings", r.savings, "national avg APY"], ["Interest checking", r.checking, "national avg APY"],
      ["Money market", r.moneyMarket, "national avg APY"], ["12-month CD", r.cd && r.cd["12"], "national avg APY"]]
      .filter(x => typeof x[1] === "number");
    cards.replaceChildren(...list.map(([l, v, s]) => safeCard(l, pct(v), s)));
    const src = document.getElementById("fdic-src");
    const link = el("a", d.source); link.href = d.fallback ? "https://fred.stlouisfed.org/series/SNDR" : "https://www.fdic.gov/national-rates-and-rate-caps";
    link.target = "_blank"; link.rel = "noopener";
    src.replaceChildren("Source: ", link, ` · ${d.asOf || ""}`);
    renderRates(); // now with "× national avg"
  } catch (err) {
    cards.replaceChildren(safeCard("National averages", "—", "Couldn't load FDIC rates right now."));
    console.warn("FDIC load failed", err);
  }
}

// ---------- CHART DESCRIPTION (accessibility) ----------
// Charts are pictures, so screen readers can't "see" them. This writes a
// short sentence about the chart into the hidden text next to it.
function describeChart(id, sentence) {
  const box = document.getElementById(id + "-desc");
  if (box) box.textContent = sentence;
}

// ---------- START EVERYTHING ----------
renderSamples();
lineChart("curveChart", Object.keys(curveSample), Object.values(curveSample), "Yield % (sample)");
describeChart("curveChart", "Sample yields: " +
  Object.entries(curveSample).map(([k, v]) => `${k} ${v}%`).join(", ") + ".");
loadFX();
loadLivestock();
loadRates();
