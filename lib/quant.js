/* ============================================================
   lib/quant.js — the math behind the "Quant Report Card"
   Pure functions (no internet, no database) so they are easy to test.
   Used by the server (api/portfolio.js) AND the browser (trader.js).
   Inputs are arrays of daily values, oldest first.
   ============================================================ */
(function (root) {
  const TRADING_DAYS = 252; // trading days in a year (used to "annualize")

  // Daily % changes: [100, 110, 99] -> [0.10, -0.10]
  function dailyReturns(values) {
    const out = [];
    for (let i = 1; i < values.length; i++) {
      if (values[i - 1] > 0) out.push(values[i] / values[i - 1] - 1);
    }
    return out;
  }
  function mean(xs) { return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0; }
  // Sample standard deviation (divide by n-1)
  function stdev(xs) {
    if (xs.length < 2) return 0;
    const m = mean(xs);
    return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
  }
  function totalReturn(values) {
    if (values.length < 2 || !(values[0] > 0)) return 0;
    return values[values.length - 1] / values[0] - 1;
  }
  // Volatility = how bumpy the ride is, yearly terms
  function annualizedVolatility(values) {
    return stdev(dailyReturns(values)) * Math.sqrt(TRADING_DAYS);
  }
  // Sharpe = extra return per unit of bumpiness. riskFree is yearly (0.04 = 4%)
  function sharpeRatio(values, riskFree = 0) {
    const r = dailyReturns(values);
    const sd = stdev(r);
    if (!sd) return null;
    const rfDaily = Math.pow(1 + riskFree, 1 / TRADING_DAYS) - 1;
    return ((mean(r) - rfDaily) / sd) * Math.sqrt(TRADING_DAYS);
  }
  // Max drawdown = worst drop from a high point to a later low (as a negative number)
  function maxDrawdown(values) {
    let peak = -Infinity, worst = 0;
    for (const v of values) {
      if (v > peak) peak = v;
      if (peak > 0) worst = Math.min(worst, v / peak - 1);
    }
    return worst;
  }
  // Beta = how much the portfolio moves when the S&P 500 (SPY) moves 1%
  function beta(values, benchValues) {
    const n = Math.min(values.length, benchValues.length);
    const p = dailyReturns(values.slice(0, n)), b = dailyReturns(benchValues.slice(0, n));
    const k = Math.min(p.length, b.length);
    if (k < 2) return null;
    const mp = mean(p.slice(0, k)), mb = mean(b.slice(0, k));
    let cov = 0, varB = 0;
    for (let i = 0; i < k; i++) { cov += (p[i] - mp) * (b[i] - mb); varB += (b[i] - mb) ** 2; }
    return varB ? cov / varB : null;
  }
  // What money would earn in savings: APY compounded over `days` calendar days
  function savingsEarnings(principal, apy, days) {
    if (!(principal > 0) || !(days > 0)) return 0;
    return principal * (Math.pow(1 + apy, days / 365) - 1);
  }
  // Everything at once. snapshots = [{ value, spy }], oldest first
  function reportCard(snapshots, riskFree = 0.04) {
    const v = snapshots.map(s => Number(s.value));
    const withSpy = snapshots.filter(s => Number(s.spy) > 0);
    const spy = withSpy.map(s => Number(s.spy));
    const vAligned = withSpy.map(s => Number(s.value));
    const portRet = totalReturn(v);
    const spyRet = spy.length >= 2 ? totalReturn(spy) : null;
    return {
      days: v.length,
      enoughData: v.length >= 3,
      totalReturn: portRet,
      spyReturn: spyRet,
      vsSpy: spyRet === null ? null : portRet - spyRet,
      volatility: v.length >= 3 ? annualizedVolatility(v) : null,
      sharpe: v.length >= 3 ? sharpeRatio(v, riskFree) : null,
      maxDrawdown: maxDrawdown(v),
      beta: vAligned.length >= 3 ? beta(vAligned, spy) : null,
    };
  }
  const api = { TRADING_DAYS, dailyReturns, mean, stdev, totalReturn, annualizedVolatility,
    sharpeRatio, maxDrawdown, beta, savingsEarnings, reportCard };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Quant = api;
})(typeof self !== "undefined" ? self : this);
