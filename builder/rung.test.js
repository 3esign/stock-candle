"use strict";

const assert = require("assert");
const { U64_MAX, priceNextRung, enforceQuoteBudget } = require("./rung");

assert.deepStrictEqual(priceNextRung({
  curveBalance: 1000n,
  lastAwardedBalance: U64_MAX,
  ladderStep: 100n,
  minBuy: 20n,
}), {
  firstRung: true,
  baseline: 1000n,
  targetCurveBalance: 900n,
  distanceToTarget: 100n,
  requiredBaseAmount: 100n,
});

assert.strictEqual(priceNextRung({
  curveBalance: 870n,
  lastAwardedBalance: 900n,
  ladderStep: 100n,
  minBuy: 20n,
}).requiredBaseAmount, 70n);

assert.strictEqual(priceNextRung({
  curveBalance: 950n,
  lastAwardedBalance: 900n,
  ladderStep: 100n,
  minBuy: 20n,
}).requiredBaseAmount, 150n);

assert.strictEqual(priceNextRung({
  curveBalance: 750n,
  lastAwardedBalance: 900n,
  ladderStep: 100n,
  minBuy: 20n,
}).requiredBaseAmount, 20n);

assert.strictEqual(enforceQuoteBudget(11n, 14n).remainingQuoteBudget, 3n);
assert.throws(() => enforceQuoteBudget(15n, 14n), /costs more/);
assert.throws(() => priceNextRung({ curveBalance: 5n, lastAwardedBalance: 5n, ladderStep: 6n, minBuy: 1n }), /No complete rung/);
assert.throws(() => priceNextRung({ curveBalance: -1n, lastAwardedBalance: 1n, ladderStep: 1n, minBuy: 1n }), /fit u64/);

console.log("OK: STOCK_CANDLE_RUNG_PRICING_PASS");
