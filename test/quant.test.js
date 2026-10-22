// Run with:  npm test   (uses Node's built-in test runner, nothing to install)
const test = require("node:test");
const assert = require("node:assert/strict");
const q = require("../lib/quant.js");
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test("dailyReturns", () => {
  const r = q.dailyReturns([100, 110, 99]);
  close(r[0], 0.10); close(r[1], -0.10);
});
test("totalReturn", () => { close(q.totalReturn([100000, 105000]), 0.05); assert.equal(q.totalReturn([5]), 0); });
test("stdev (sample) of 2,4,4,4,5,5,7,9 = sqrt(32/7)", () => close(q.stdev([2, 4, 4, 4, 5, 5, 7, 9]), Math.sqrt(32 / 7)));
test("maxDrawdown 100->120->90->130 = -25%", () => close(q.maxDrawdown([100, 120, 90, 130]), -0.25));
test("maxDrawdown never falls = 0", () => assert.equal(q.maxDrawdown([1, 2, 3]), 0));
test("volatility: returns +1%,-1% alternating", () => {
  const v = [100, 101, 99.99, 100.9899];
  const r = q.dailyReturns(v); // 0.01, -0.01, 0.01
  close(q.annualizedVolatility(v), q.stdev(r) * Math.sqrt(252));
  close(q.stdev(r), Math.sqrt(((2 / 3 * 0.01) ** 2 * 2 + (4 / 3 * 0.01) ** 2) / 2), 1e-12);
});
test("sharpe with rf=0 equals mean/sd*sqrt(252)", () => {
  const v = [100, 102, 101, 104, 103];
  const r = q.dailyReturns(v);
  close(q.sharpeRatio(v, 0), q.mean(r) / q.stdev(r) * Math.sqrt(252));
  assert.equal(q.sharpeRatio([100, 101, 102.01], 0), null); // zero bumpiness -> undefined
});
test("beta: portfolio moving 2x the benchmark = 2", () => {
  const spy = [100, 101, 99, 102, 100];
  const br = q.dailyReturns(spy);
  const port = [1000]; br.forEach(x => port.push(port[port.length - 1] * (1 + 2 * x)));
  close(q.beta(port, spy), 2, 1e-9);
});
test("beta: identical series = 1, too short = null", () => {
  close(q.beta([1, 2, 1.5, 3], [1, 2, 1.5, 3]), 1);
  assert.equal(q.beta([1, 2], [1, 2]), null);
});
test("savingsEarnings: $100k at 4% for 365 days = $4,000", () => close(q.savingsEarnings(100000, 0.04, 365), 4000, 1e-6));
test("reportCard puts it together", () => {
  const snaps = [{ value: 100000, spy: 500 }, { value: 101000, spy: 505 }, { value: 99000, spy: 500 }, { value: 102000, spy: 510 }];
  const rc = q.reportCard(snaps, 0.04);
  close(rc.totalReturn, 0.02); close(rc.spyReturn, 0.02); close(rc.vsSpy, 0);
  close(rc.maxDrawdown, 99000 / 101000 - 1);
  assert.ok(rc.enoughData && rc.beta > 0 && rc.volatility > 0);
});
